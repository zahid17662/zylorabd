import { useEffect, useState } from 'react'
import type { Order } from './types'

export const inp = 'w-full rounded-md border border-line bg-white px-3 py-2.5 text-[16px] outline-none focus:border-ink sm:py-2 sm:text-[14px]'
export const btn =
  'rounded-full border border-ink px-4 py-2 text-[13px] hover:bg-ink sm:py-1.5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-serif text-[26px] leading-tight sm:text-[28px]">{title}</h2>
        {sub && <p className="text-[13px] text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export const label = 'mb-1 block text-[12px] text-muted'

const PILL: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  awaiting_payment: 'bg-orange-100 text-orange-900',
  confirmed: 'bg-sky-100 text-sky-900',
  shipped: 'bg-indigo-100 text-indigo-900',
  delivered: 'bg-emerald-100 text-emerald-900',
  cancelled: 'bg-stone-200 text-stone-700',
  paid: 'bg-emerald-100 text-emerald-900',
  unpaid: 'bg-amber-100 text-amber-900',
  failed: 'bg-red-100 text-red-900',
  refunded: 'bg-stone-200 text-stone-700',
}

export function Pill({ v, className = '' }: { v: string; className?: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[12px] whitespace-nowrap capitalize ${PILL[v] ?? 'bg-stone-100 text-stone-800'} ${className}`}>
      {v.replace('_', ' ')}
    </span>
  )
}

export const when = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' })

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

const PROVIDER_LABEL: Record<string, string> = { bkash: 'bKash', nagad: 'Nagad', card: 'Card', online: 'Online' }
export const providerLabel = (p: string): string => PROVIDER_LABEL[p.toLowerCase()] ?? p

const CHANNEL_LABEL: Record<Order['login_method'], string> = { facebook: 'FB Login', phone: 'Phone Login', email: 'Email Login' }

/** "FB Login • FB_AD" */
export const attributionLabel = (o: Pick<Order, 'login_method' | 'order_source'>): string =>
  `${CHANNEL_LABEL[o.login_method]} • ${(o.order_source ?? 'direct').toUpperCase()}`

/** Gateway transaction id of the successful (else latest) online payment, if any. */
export function trxId(o: Pick<Order, 'transactions'>): string | null {
  const t = o.transactions.find((x) => x.status === 'success') ?? o.transactions[0]
  return t?.gateway_tx_id ?? null
}

/** "COD - UNPAID" or "bKash - PAID" */
export function paymentLabel(o: Pick<Order, 'payment_method' | 'payment_status' | 'transactions'>): string {
  const t = o.transactions.find((x) => x.status === 'success') ?? o.transactions[0]
  const method = o.payment_method === 'cod' ? 'COD' : providerLabel(t?.provider ?? 'online')
  return `${method} - ${o.payment_status.toUpperCase()}`
}

/** Cash a courier must collect: the full total for unpaid COD, otherwise nothing. */
export const codCollectible = (o: Pick<Order, 'payment_method' | 'payment_status' | 'total_amount'>): number =>
  o.payment_method === 'cod' && o.payment_status !== 'paid' ? Number(o.total_amount) : 0
