import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { taka } from '../data'
import { OrderDetail } from './OrderDetail'
import { attributionLabel, btn, inp, paymentLabel, Pill, trxId, useDebounced, when } from './ui'
import { NEXT_STATUS, type Order, type OrderStatus } from './types'

const PAGE_SIZE = 25
type Filters = { q: string; order_status: string; pay: string; payment_status: string; login_method: string }
const NO_FILTERS: Filters = { q: '', order_status: '', pay: '', payment_status: '', login_method: '' }

const STATUS_OPTIONS = ['pending', 'awaiting_payment', 'confirmed', 'shipped', 'delivered', 'cancelled']
const PAY_OPTIONS: [string, string][] = [['cod', 'COD'], ['bkash', 'bKash'], ['nagad', 'Nagad'], ['card', 'Card']]
const LOGIN_OPTIONS: [string, string][] = [['facebook', 'Facebook'], ['phone', 'Phone'], ['email', 'Email']]
const PAID_OPTIONS: [string, string][] = [['paid', 'Paid'], ['unpaid', 'Unpaid'], ['pending', 'Pending'], ['failed', 'Failed'], ['refunded', 'Refunded']]

function queryString(f: Filters, page: number): string {
  const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
  if (f.q.trim()) qs.set('q', f.q.trim())
  if (f.order_status) qs.set('order_status', f.order_status)
  if (f.payment_status) qs.set('payment_status', f.payment_status)
  if (f.login_method) qs.set('login_method', f.login_method)
  if (f.pay === 'cod') qs.set('payment_method', 'cod')
  else if (f.pay) qs.set('payment_provider', f.pay)
  return qs.toString()
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <select className={`${inp} !w-auto`} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}: all</option>
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  )
}

function StatusSelect({ order, onMove }: { order: Order; onMove: (o: Order, s: OrderStatus) => void }) {
  const next = NEXT_STATUS[order.order_status]
  return (
    <select
      aria-label={`Status of ${order.order_number}`} className={`${inp} !w-auto !py-1 text-[13px] capitalize`} value={order.order_status}
      disabled={next.length === 0} onClick={(e) => e.stopPropagation()}
      onChange={(e) => onMove(order, e.target.value as OrderStatus)}
    >
      <option value={order.order_status}>{order.order_status.replace('_', ' ')}</option>
      {next.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
    </select>
  )
}

export default function Orders() {
  const [f, setF] = useState<Filters>(NO_FILTERS)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const q = useDebounced(f.q)

  useEffect(() => {
    let alive = true // ignore a slow response that arrives after a newer filter was applied
    setLoading(true)
    api<{ items: Order[]; total: number }>(`/admin/orders?${queryString({ ...f, q }, page)}`)
      .then((r) => alive && (setRows(r.items), setTotal(r.total), setErr('')))
      .catch((e: Error) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // `f.q` is replaced by the debounced `q`, so typing does not fire a request per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, f.order_status, f.pay, f.payment_status, f.login_method, page, reload])

  const update = (patch: Partial<Filters>) => {
    setPage(1)
    setF((x) => ({ ...x, ...patch }))
  }
  const closeDetail = useCallback(() => setOpenId(null), [])

  const move = async (o: Order, status: OrderStatus) => {
    if (status === 'cancelled' && !confirm(`Cancel order ${o.order_number}? Its stock will be returned.`)) return setReload((n) => n + 1)
    try {
      await api(`/admin/orders/${o.id}/status`, { method: 'PATCH', body: { status } })
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
    setReload((n) => n + 1)
  }

  return (
    <div>
      <h2 className="mb-4 font-serif text-[24px]">Orders & Attribution</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={`${inp} !w-60`} placeholder="Search order ID, name or phone" aria-label="Search orders" value={f.q} onChange={(e) => update({ q: e.target.value })} />
        <Select label="Status" value={f.order_status} options={STATUS_OPTIONS.map((s) => [s, s.replace('_', ' ')])} onChange={(v) => update({ order_status: v })} />
        <Select label="Payment" value={f.pay} options={PAY_OPTIONS} onChange={(v) => update({ pay: v })} />
        <Select label="Paid?" value={f.payment_status} options={PAID_OPTIONS} onChange={(v) => update({ payment_status: v })} />
        <Select label="Login via" value={f.login_method} options={LOGIN_OPTIONS} onChange={(v) => update({ login_method: v })} />
        {JSON.stringify(f) !== JSON.stringify(NO_FILTERS) && <button className={btn} onClick={() => (setPage(1), setF(NO_FILTERS))}>Clear</button>}
      </div>
      {err && <p role="alert" className="mb-3 text-wine">{err}</p>}
      <div className={`overflow-x-auto rounded-lg bg-white ${loading ? 'opacity-70' : ''}`} aria-busy={loading}>
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-line text-muted">
            <tr>{['Order', 'Placed', 'Customer', 'Items', 'Total', 'Arrived via', 'Payment', 'Status'].map((h) => <th key={h} className="px-4 py-3 font-normal whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="cursor-pointer border-b border-line hover:bg-cream/60" onClick={() => setOpenId(o.id)}>
                <td className="px-4 py-3 font-medium whitespace-nowrap"><button className="underline-offset-2 hover:underline" onClick={() => setOpenId(o.id)}>{o.order_number}</button></td>
                <td className="px-4 py-3 whitespace-nowrap">{when(o.created_at)}</td>
                <td className="px-4 py-3">{o.recipient_name}<br /><span className="text-muted">{o.shipping_phone}</span></td>
                <td className="px-4 py-3">{o.items.map((i, k) => <p key={k} className="whitespace-nowrap">{i.size} × {i.quantity} <span className="text-muted">· {i.product_title}</span></p>)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{taka(Number(o.total_amount))}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-cream px-2.5 py-0.5 whitespace-nowrap">{attributionLabel(o)}</span></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Pill v={o.payment_status} className="mr-1" />{paymentLabel(o).split(' - ')[0]}
                  {trxId(o) && <><br /><span className="text-[12px] text-muted">trxID {trxId(o)}</span></>}
                </td>
                <td className="px-4 py-3"><StatusSelect order={o} onMove={move} /></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">No orders match.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-[13px] text-muted">
        <span>{total} orders</span>
        <div className="flex gap-2">
          <button className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <button className={btn} disabled={page * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
      {openId && <OrderDetail orderId={openId} onClose={closeDetail} />}
    </div>
  )
}
