import { useState, type FormEvent } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { api, captureAttribution, type OrderResult } from '../api'
import { useAuth } from '../auth'
import { useCatalog } from '../catalog'
import { unitPrice, useCart } from '../cart'
import { isBdPhone, taka } from '../data'

const field = 'w-full border border-line bg-white px-4 py-3 text-[14px] outline-none focus:border-ink'
const FEES = { inside_dhaka: 70, outside_dhaka: 130 }

export function CheckoutModal() {
  const { lines, checkout, setCheckout, clear, subtotal } = useCart()
  const { user, openLogin } = useAuth()
  const { reload } = useCatalog()
  const [f, setF] = useState({ name: '', phone: '', address: '' })
  const [zone, setZone] = useState<'inside_dhaka' | 'outside_dhaka'>('inside_dhaka')
  const [pay, setPay] = useState<'cod' | 'bkash' | 'nagad' | 'card'>('cod')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<OrderResult | null>(null)

  if (!checkout) return null
  const close = () => {
    setCheckout(false)
    if (done) setDone(null)
  }
  const fee = FEES[zone]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return openLogin()
    if (!isBdPhone(f.phone)) return setErr('Enter a valid Bangladeshi mobile number, e.g. 01712345678')
    if (lines.some((l) => !l.product.variantIds[l.size])) {
      return setErr('Live stock is still syncing. Please wait a moment and try again.')
    }
    setBusy(true)
    setErr('')
    try {
      const res = await api<OrderResult>('/orders/checkout', {
        body: {
          items: lines.map((l) => ({ variant_id: l.product.variantIds[l.size], quantity: l.qty })),
          shipping: { recipient_name: f.name, phone: f.phone, address: f.address, zone },
          payment_method: pay === 'cod' ? 'cod' : 'online',
          online_provider: pay === 'cod' ? undefined : pay,
          attribution: captureAttribution(),
        },
      })
      clear()
      reload()
      if (res.payment_url) {
        window.location.href = res.payment_url
        return
      }
      setDone(res)
    } catch (e) {
      const d = (e as { detail?: { problems?: string[] } }).detail
      setErr(d?.problems ? d.problems.join('. ') : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/40 p-4" onClick={close}>
      <div role="dialog" aria-label="Checkout" className="relative mx-auto my-8 w-full max-w-[520px] bg-white p-8" onClick={(e) => e.stopPropagation()}>
        <button onClick={close} aria-label="Close" className="absolute top-4 right-4">
          <X className="size-5" strokeWidth={1.25} />
        </button>

        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto size-10" strokeWidth={1} />
            <h2 className="mt-4 font-serif text-[28px]">Thank you!</h2>
            <p className="mt-2 text-[14px] text-muted">Your order has been placed. It is confirmed, and we will text you when it ships.</p>
            <p className="mt-6 text-[12px] tracking-widest text-muted uppercase">Order ID</p>
            <p className="font-serif text-[26px]">{done.order.order_number}</p>
            <p className="mt-3 text-[14px]">Pay {taka(Number(done.order.total_amount))} in cash on delivery.</p>
            <button onClick={close} className="mt-8 rounded-full bg-ink px-8 py-3.5 text-[14px] text-white">Continue Shopping</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <h2 className="font-serif text-[28px]">Checkout</h2>
            {!user && (
              <p className="bg-cream px-4 py-3 text-[13px]">
                Please <button type="button" onClick={openLogin} className="underline">sign in</button> to place your order.
              </p>
            )}
            <input className={field} placeholder="Full name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className={field} type="tel" placeholder="Phone (01XXXXXXXXX)" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <textarea className={field} rows={3} placeholder="Full delivery address" required minLength={5} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />

            <fieldset className="pt-2">
              <legend className="text-[13px] text-muted">Delivery area</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([['inside_dhaka', 'Inside Dhaka'], ['outside_dhaka', 'Outside Dhaka']] as const).map(([k, label]) => (
                  <label key={k} className={`cursor-pointer border px-4 py-3 text-[14px] ${zone === k ? 'border-ink' : 'border-line'}`}>
                    <input type="radio" name="zone" className="sr-only" checked={zone === k} onChange={() => setZone(k)} />
                    {label} <span className="text-muted">· ৳{FEES[k]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="pt-2">
              <legend className="text-[13px] text-muted">Payment</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([['cod', 'Cash on Delivery'], ['bkash', 'bKash'], ['nagad', 'Nagad'], ['card', 'Debit / Credit card']] as const).map(([k, label]) => (
                  <label key={k} className={`cursor-pointer border px-4 py-3 text-[14px] ${pay === k ? 'border-ink' : 'border-line'}`}>
                    <input type="radio" name="pay" className="sr-only" checked={pay === k} onChange={() => setPay(k)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1 border-t border-line pt-4 text-[14px]">
              {lines.map((l) => (
                <div key={l.product.id + l.size} className="flex justify-between text-muted">
                  <span>{l.product.title} {l.size !== 'Free Size' && `(${l.size})`} × {l.qty}</span>
                  <span>{taka(unitPrice(l.product) * l.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between"><span>Delivery</span><span>{taka(fee)}</span></div>
              <div className="flex justify-between pt-1 text-[16px] font-medium"><span>Total</span><span>{taka(subtotal + fee)}</span></div>
              <p className="text-[12px] text-muted">Final amount is confirmed by our server when you place the order.</p>
            </div>

            {err && <p role="alert" className="text-[13px] text-wine">{err}</p>}
            <button disabled={busy || lines.length === 0} className="w-full rounded-full bg-ink py-4 text-[14px] text-white hover:bg-black disabled:opacity-50">
              {busy ? 'Placing order…' : pay === 'cod' ? 'Place Order' : 'Continue to Payment'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
