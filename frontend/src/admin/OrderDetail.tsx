import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../api'
import { taka } from '../data'
import { OrderSlip } from './OrderSlip'
import { attributionLabel, codCollectible, paymentLabel, Pill, trxId, when } from './ui'
import type { Order } from './types'

export function OrderDetail({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [o, setO] = useState<Order | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    api<Order>(`/admin/orders/${orderId}`)
      .then((r) => alive && setO(r))
      .catch((e: Error) => alive && setErr(e.message))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      alive = false
      window.removeEventListener('keydown', onKey)
    }
  }, [orderId, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:block sm:overflow-y-auto sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Order details" onClick={(e) => e.stopPropagation()} className="mx-auto max-h-[92svh] w-full max-w-[720px] overflow-y-auto rounded-t-2xl bg-white p-4 pb-8 sm:my-4 sm:max-h-none sm:overflow-visible sm:rounded-lg sm:p-7">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        {err && <p role="alert" className="text-wine">{err}</p>}
        {!o && !err && <p className="text-muted">Loading…</p>}
        {o && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-[22px] leading-tight break-all sm:text-[26px]">{o.order_number}</h3>
                <p className="text-[13px] text-muted">{when(o.created_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Pill v={o.order_status} />
                <button autoFocus onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full sm:size-8 hover:bg-cream"><X className="size-5" /></button>
              </div>
            </div>

            <div className="mt-5 grid gap-5 text-[13px] sm:grid-cols-2">
              <div>
                <p className="mb-1 text-muted">Ship to ({o.delivery_zone.replace('_', ' ')})</p>
                <p className="font-medium">{o.recipient_name} · {o.shipping_phone}</p>
                <p className="break-words whitespace-pre-line">{o.shipping_address}</p>
                <p className="mt-2 text-muted">Account: {o.customer_name}{o.customer_email && ` · ${o.customer_email}`}{o.customer_phone && ` · ${o.customer_phone}`}</p>
              </div>
              <div>
                <p className="mb-1 text-muted">Attribution & payment</p>
                <p><span className="rounded-full bg-cream px-2.5 py-0.5">{attributionLabel(o)}</span></p>
                {o.utm?.utm_medium && <p className="mt-1">Medium: {o.utm.utm_medium}{o.utm.utm_campaign && ` · Campaign: ${o.utm.utm_campaign}`}</p>}
                <p className="mt-2 font-medium">{paymentLabel(o)}{trxId(o) && ` · trxID ${trxId(o)}`}</p>
                {o.transactions.map((t, k) => (
                  <p key={k} className="text-muted">{t.provider} · {t.status} · {taka(Number(t.amount))}{t.paid_at && ` · ${when(t.paid_at)}`}{t.gateway_tx_id && ` · ${t.gateway_tx_id}`}</p>
                ))}
              </div>
            </div>

            <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-[13px]">
              <thead className="border-b border-line text-muted"><tr>{['Item', 'Size', 'Qty', 'Amount'].map((h) => <th key={h} className="py-2 font-normal">{h}</th>)}</tr></thead>
              <tbody>
                {o.items.map((i, k) => (
                  <tr key={k} className="border-b border-line"><td className="py-2 pr-2">{i.product_title}</td><td>{i.size}</td><td>{i.quantity}</td><td>{taka(Number(i.unit_price) * i.quantity)}</td></tr>
                ))}
              </tbody>
            </table></div>
            <p className="mt-2 text-right text-[13px] text-muted">Delivery {taka(Number(o.shipping_fee))}</p>
            <p className="text-right text-[16px] font-medium">Total {taka(Number(o.total_amount))}</p>
            <p className="text-right text-[13px]">COD to collect: <strong>{taka(codCollectible(o))}</strong></p>

            <div className="mt-5 flex justify-end">
              <button className="w-full rounded-full bg-ink px-6 py-3 sm:w-auto sm:py-2 text-[13px] text-white" onClick={() => window.print()}>Print Invoice / Courier Slip</button>
            </div>
            <OrderSlip order={o} />
          </>
        )}
      </div>
    </div>
  )
}
