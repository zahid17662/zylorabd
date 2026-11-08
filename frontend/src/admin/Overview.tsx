import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { taka } from '../data'
import { btn, inp, providerLabel } from './ui'
import type { LowStock, SplitRow, Stats } from './types'

const sumOrders = (rows: SplitRow[]): number => rows.reduce((n, r) => n + r.orders, 0)
const sumRevenue = (rows: SplitRow[]): number => rows.reduce((n, r) => n + Number(r.revenue), 0)

function Kpi({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-white p-5">
      <p className="text-[12px] tracking-widest text-muted uppercase">{label}</p>
      <p className={`mt-2 font-serif text-[28px] tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

function SplitList({ rows, format }: { rows: SplitRow[]; format?: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.orders))
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between text-[13px]">
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
    <section className="rounded-lg bg-white p-5">
      <h3 className="mb-4 text-[12px] tracking-widest text-muted uppercase">{title}</h3>
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
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2">{row.product_title}</td>
      <td className="px-3 py-2">{row.size}</td>
      <td className={`px-3 py-2 tabular-nums ${row.stock_quantity === 0 ? 'text-wine' : ''}`}>{row.stock_quantity}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            className={`${inp} !w-20`} type="number" min={1} max={10000} value={qty} aria-label={`Units to add to ${row.product_title} ${row.size}`}
            onChange={(e) => setQty(e.target.value)}
          />
          <button className={btn} disabled={busy || !Number.isInteger(add) || add < 1} onClick={restock}>
            {busy ? 'Saving…' : '+ Restock'}
          </button>
        </div>
        {err && <p role="alert" className="mt-1 text-[12px] text-wine">{err}</p>}
      </td>
    </tr>
  )
}

export default function Overview() {
  const [s, setS] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
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
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total revenue (paid)" value={taka(Number(s.total_revenue))} />
        <Kpi label="Total orders" value={String(s.total_orders)} />
        <Kpi label="Pending fulfillment" value={String(s.pending_fulfillment)} tone={s.pending_fulfillment > 0 ? 'text-amber-800' : ''} />
        <Kpi label="Low stock alerts" value={String(s.low_stock_variants.length)} tone={s.low_stock_variants.length > 0 ? 'text-wine' : ''} />
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line text-muted">
                <tr>{['Product', 'Size', 'Left', 'Restock'].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr>
              </thead>
              <tbody>
                {s.low_stock_variants.map((r) => <RestockRow key={r.variant_id} row={r} onDone={load} />)}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
