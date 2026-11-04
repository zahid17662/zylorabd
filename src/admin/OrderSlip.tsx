import { createPortal } from 'react-dom'
import { Logo } from '../components/Logo'
import { taka } from '../data'
import { codCollectible, paymentLabel, trxId, when } from './ui'
import type { Order } from './types'

/**
 * Courier slip / invoice. Rendered into a portal on <body> that is hidden on screen and is the ONLY thing
 * visible when printing (see the @media print rules in index.css), so window.print() prints just the slip.
 */
export function OrderSlip({ order: o }: { order: Order }) {
  const due = codCollectible(o)
  const trx = trxId(o)
  return createPortal(
    <div className="print-root" aria-hidden>
      <div className="mx-auto max-w-[720px] p-6 text-[13px] text-black">
        <header className="flex items-start justify-between border-b border-black pb-3">
          <Logo className="h-8" />
          <div className="text-right">
            <p className="text-[18px] font-semibold">{o.order_number}</p>
            <p>{when(o.created_at)}</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] tracking-widest uppercase">Deliver to</p>
            <p className="mt-1 text-[16px] font-semibold">{o.recipient_name}</p>
            <p className="text-[15px]">{o.shipping_phone}</p>
            <p className="mt-1 break-words whitespace-pre-line">{o.shipping_address}</p>
            <p className="mt-1">{o.delivery_zone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}</p>
          </div>
          <div>
            <p className="text-[11px] tracking-widest uppercase">Payment</p>
            <p className="mt-1 font-semibold">{paymentLabel(o)}</p>
            {trx && <p>Trx ID: {trx}</p>}
          </div>
        </section>

        <table className="mt-5 w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-black">
              {['Item', 'Size', 'Qty', 'Price', 'Amount'].map((h, i) => <th key={h} className={`py-1.5 font-semibold ${i > 1 ? 'text-right' : ''}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {o.items.map((i, k) => (
              <tr key={k} className="border-b border-stone-300">
                <td className="py-1.5 pr-2">{i.product_title}</td>
                <td>{i.size}</td>
                <td className="text-right">{i.quantity}</td>
                <td className="text-right">{taka(Number(i.unit_price))}</td>
                <td className="text-right">{taka(Number(i.unit_price) * i.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} className="pt-2 text-right">Subtotal</td><td className="pt-2 text-right">{taka(Number(o.subtotal))}</td></tr>
            <tr><td colSpan={4} className="text-right">Delivery</td><td className="text-right">{taka(Number(o.shipping_fee))}</td></tr>
            <tr className="font-semibold"><td colSpan={4} className="text-right">Total</td><td className="text-right">{taka(Number(o.total_amount))}</td></tr>
          </tfoot>
        </table>

        <div className="mt-6 rounded border-2 border-black p-4 text-center">
          <p className="text-[11px] tracking-widest uppercase">{due > 0 ? 'COD · collect from customer' : 'Prepaid · nothing to collect'}</p>
          <p className="mt-1 text-[30px] font-bold tabular-nums">{taka(due)}</p>
        </div>
        <p className="mt-4 text-center text-[11px]">Thank you for shopping with Zylora.</p>
      </div>
    </div>,
    document.body,
  )
}
