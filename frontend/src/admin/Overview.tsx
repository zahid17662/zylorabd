import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Clock, ReceiptText, Wallet } from 'lucide-react'
import { api } from '../api'
import { taka } from '../data'
import { btn, inp, PageHeader, providerLabel } from './ui'
import type { LowStock, SplitRow, Stats } from './types'

const sumOrders = (rows: SplitRow[]): number => rows.reduce((n, r) => n + r.orders, 0)
const sumRevenue = (rows: SplitRow[]): number => rows.reduce((n, r) => n + Number(r.revenue), 0)

function Kpi({ label, value, tone = '', hero = false, icon }: { label: string; value: string; tone?: string; hero?: boolean; icon: ReactNode }) {
  return (
    <div className={`rounded-xl p-4 sm:p-5 ${hero ? 'col-span-2 bg-ink text-white xl:col-span-1' : 'border border-line bg-white'}`}>
      <div className="flex items-center justify-between">
        <p className={`text-[11px] font-medium tracking-wider uppercase sm:text-[12px] ${hero ? 'text-white/70' : 'text-muted'}`}>{label}</p>
        <span className={`grid size-7 place-items-center rounded-full ${hero ? 'bg-white/15' : 'bg-cream text-muted'}`}>{icon}</span>
      </div>
      <p className={`mt-2 text-[26px] leading-none font-semibold tabular-nums sm:text-[30px] ${tone}`}>{value}</p>
    </div>
  )
}

function SplitList({ rows, format }: { rows: SplitRow[]; format?: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.orders))
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13px]">
            <span className="rounded-full bg-cream px-2.5 py-0.5 text-[12px]">{format ? format(r.key) : r.key}</span>
            <span className="tabular-nums">
              {r.orders} <span className="text-muted">· {taka(Number(r.revenue))}</span>
            </span>
          </div>
          <div className="mt-1 h-1 rounded bg-cream" aria-hidden>
            <div className="h-1 rounded bg-ink" style={{ width: `${(r.orders / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
      <h3 className="mb-3 text-[12px] font-medium tracking-wider text-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}

function RestockRow({ row, onDone }: { row: LowStock; onDone: () => void }) {
  const [qty, setQty] = useState('10')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const add = Number(qty)

  const restock = async () => {
    setBusy(true)
    setErr('')
    try {
      await api(`/admin/products/${row.product_id}/stock`, {
        method: 'PATCH',
        body: [{ size: row.size, delta: add }], // atomic on the server: a sale made meanwhile is never undone
      })
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-3 text-[13px] last:border-0">
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-medium break-words">{row.product_title}</p>
        <p className="text-muted">
          Size {row.size} · <span className={`tabular-nums ${row.stock_quantity === 0 ? 'text-wine' : ''}`}>{row.stock_quantity} left</span>
        </p>
        {err && <p role="alert" className="mt-1 text-[12px] text-wine">{err}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          className={`${inp} !w-20`} type="number" min={1} max={10000} value={qty} aria-label={`Units to add to ${row.product_title} ${row.size}`}
          onChange={(e) => setQty(e.target.value)}
        />
        <button className={btn} disabled={busy || !Number.isInteger(add) || add < 1} onClick={restock}>
          {busy ? 'Saving…' : '+ Restock'}
        </button>
      </div>
    </li>
  )
}

export default function Overview() {
  const [s, setS] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  const [showAll, setShowAll] = useState(false)
  const load = useCallback(() => {
    api<Stats>('/admin/stats').then(setS).catch((e: Error) => setErr(e.message))
  }, [])
  useEffect(load, [load])

  if (err) return <p role="alert" className="text-wine">{err}</p>
  if (!s) return <p className="text-muted">Loading…</p>

  const online = s.payment_method_split.filter((r) => r.key !== 'COD')
  const cod = s.payment_method_split.find((r) => r.key === 'COD')
  const channel = s.order_attribution_split.login_channel
  const source = s.order_attribution_split.order_source.filter((r) => r.orders > 0)

  return (
    <div>
      <PageHeader title="Overview" sub="Store performance at a glance" />
      <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi hero icon={<Wallet className="size-3.5" />} label="Revenue (paid)" value={taka(Number(s.total_revenue))} />
        <Kpi icon={<ReceiptText className="size-3.5" />} label="Orders" value={String(s.total_orders)} />
        <Kpi icon={<Clock className="size-3.5" />} label="To fulfil" value={String(s.pending_fulfillment)} tone={s.pending_fulfillment > 0 ? 'text-amber-700' : ''} />
        <Kpi icon={<AlertTriangle className="size-3.5" />} label="Low stock" value={String(s.low_stock_variants.length)} tone={s.low_stock_variants.length > 0 ? 'text-wine' : ''} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="How orders arrived · login">
          <SplitList rows={channel} format={(k) => (k === 'FACEBOOK' ? 'Facebook' : k[0] + k.slice(1).toLowerCase())} />
        </Panel>
        <Panel title="How orders arrived · campaign / source">
          {source.length ? <SplitList rows={source} /> : <p className="text-[13px] text-muted">No orders yet.</p>}
        </Panel>
        <Panel title="Payment split">
          <SplitList
            rows={[
              { key: 'COD', orders: cod?.orders ?? 0, revenue: String(cod?.revenue ?? 0) },
              { key: 'ONLINE', orders: sumOrders(online), revenue: String(sumRevenue(online)) },
            ]}
            format={(k) => (k === 'COD' ? 'Cash on Delivery' : 'Online payment')}
          />
          <div className="mt-4 border-t border-line pt-3">
            <SplitList rows={online} format={providerLabel} />
          </div>
        </Panel>
      </div>

      <Panel title={`Low stock · ${s.low_stock_variants.length} sizes at 3 or fewer`}>
        {s.low_stock_variants.length === 0 ? (
          <p className="text-[13px] text-muted">Every size is comfortably stocked.</p>
        ) : (
          <>
            <ul>
              {(showAll ? s.low_stock_variants : s.low_stock_variants.slice(0, 5)).map((r) => <RestockRow key={r.variant_id} row={r} onDone={load} />)}
            </ul>
            {s.low_stock_variants.length > 5 && (
              <button className={`${btn} mt-3 w-full`} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${s.low_stock_variants.length}`}
              </button>
            )}
          </>
        )}
      </Panel>
      </div>
    </div>
  )
}
