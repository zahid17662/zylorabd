import { useEffect, useState, type FormEvent } from 'react'
import { Check, ChevronDown, PackageCheck, Truck, X, ClipboardCheck, Wallet } from 'lucide-react'
import { AuthProvider, useAuth } from './auth'
import { AuthModal } from './components/AuthModal'
import { taka } from './data'
import { fetchMyOrders, trackOrder, type TrackedOrder } from './orderTracking'

const field = 'w-full border border-line bg-white px-4 py-3 text-[14px] outline-none focus:border-ink'
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' })

type Step = { key: TrackedOrder['order_status']; label: string; icon: typeof Check }
const STEPS: Step[] = [
  { key: 'pending', label: 'Order placed', icon: ClipboardCheck },
  { key: 'confirmed', label: 'Confirmed', icon: Check },
  { key: 'shipped', label: 'On its way', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: PackageCheck },
]
const NOW_TEXT: Record<TrackedOrder['order_status'], string> = {
  pending: 'We have your order and will confirm it shortly.',
  awaiting_payment: 'Waiting for your payment to go through.',
  confirmed: 'Confirmed. We are getting it ready to ship.',
  shipped: 'Your order is on its way. Keep your phone nearby for the delivery call.',
  delivered: 'Delivered. Thank you for shopping with Zylora!',
  cancelled: 'This order was cancelled. Any reserved items went back to stock.',
}

function Timeline({ o }: { o: TrackedOrder }) {
  const at = (s: TrackedOrder['order_status']) => o.events.find((e) => e.status === s)?.at
  if (o.order_status === 'cancelled') {
    const placed = at('pending') ?? at('awaiting_payment') ?? o.created_at
    return (
      <ol className="mt-4 space-y-4">
        <li className="flex gap-3"><Check className="mt-0.5 size-5 text-ink" /><div><p className="text-[14px]">Order placed</p><p className="text-[12px] text-muted">{when(placed)}</p></div></li>
        <li className="flex gap-3"><X className="mt-0.5 size-5 text-wine" /><div><p className="text-[14px] text-wine">Cancelled</p>{at('cancelled') && <p className="text-[12px] text-muted">{when(at('cancelled') as string)}</p>}</div></li>
      </ol>
    )
  }
  const awaiting = o.order_status === 'awaiting_payment'
  const reached = awaiting ? -1 : STEPS.findIndex((s) => s.key === o.order_status)
  return (
    <ol className="mt-4 space-y-0">
      {awaiting && (
        <li className="flex gap-3 pb-4"><Wallet className="mt-0.5 size-5 text-caramel" /><div><p className="text-[14px]">Waiting for payment</p><p className="text-[12px] text-muted">{when(o.created_at)}</p></div></li>
      )}
      {STEPS.map((s, i) => {
        const done = i <= reached
        const stamp = at(s.key) ?? (i === 0 && done ? o.created_at : undefined)
        const Icon = s.icon
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
            {i < STEPS.length - 1 && <span aria-hidden className={`absolute top-6 left-[9.5px] h-[calc(100%-1.5rem)] w-px ${i < reached ? 'bg-ink' : 'bg-line'}`} />}
            <Icon className={`relative z-10 mt-0.5 size-5 bg-white ${done ? 'text-ink' : 'text-line'}`} strokeWidth={done ? 1.8 : 1.4} />
            <div>
              <p className={`text-[14px] ${done ? '' : 'text-muted'}`}>{s.label}{i === reached && <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] text-muted">Now</span>}</p>
              {done && stamp && <p className="text-[12px] text-muted">{when(stamp)}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function OrderCard({ o, open: initial = false }: { o: TrackedOrder; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <article className="border border-line bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
        <span>
          <span className="block font-serif text-[20px]">{o.order_number}</span>
          <span className="block text-[12px] text-muted">{when(o.created_at)} · {taka(Number(o.total_amount))}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[12px] ${o.order_status === 'cancelled' ? 'bg-wine/10 text-wine' : 'bg-cream'}`}>
            {o.order_status === 'awaiting_payment' ? 'Awaiting payment' : o.order_status === 'shipped' ? 'On its way' : o.order_status[0].toUpperCase() + o.order_status.slice(1)}
          </span>
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-4">
          <p className="text-[14px]">{NOW_TEXT[o.order_status]}</p>
          <Timeline o={o} />
          <ul className="mt-5 space-y-1 border-t border-line pt-4 text-[13px]">
            {o.items.map((i, k) => (
              <li key={k} className="flex justify-between gap-3"><span>{i.product_title} · {i.size} × {i.quantity}</span><span>{taka(Number(i.unit_price) * i.quantity)}</span></li>
            ))}
            <li className="flex justify-between text-muted"><span>Delivery</span><span>{taka(Number(o.shipping_fee))}</span></li>
            <li className="flex justify-between font-medium"><span>Total · {o.payment_method === 'cod' ? 'Cash on delivery' : 'Paid online'}</span><span>{taka(Number(o.total_amount))}</span></li>
          </ul>
          <p className="mt-4 text-[12px] text-muted">
            For {o.recipient_name}{o.shipping_address ? ` · ${o.shipping_address}` : ''}
          </p>
        </div>
      )}
    </article>
  )
}

function Lookup() {
  const q = new URLSearchParams(location.search)
  const [num, setNum] = useState(q.get('order') ?? '')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [found, setFound] = useState<TrackedOrder | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    setFound(null)
    setBusy(true)
    try {
      const o = await trackOrder(num, phone)
      if (o) setFound(o)
      else setErr('We could not find an order with that number and phone. Check both and try again.')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="lookup">
      <h2 id="lookup" className="font-serif text-[24px]">Track with your order number</h2>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div><label htmlFor="t-num" className="mb-1 block text-[13px] text-muted">Order number</label><input id="t-num" className={field} placeholder="ZB1A2B3C4D" autoCapitalize="characters" required value={num} onChange={(e) => setNum(e.target.value)} /></div>
        <div><label htmlFor="t-phone" className="mb-1 block text-[13px] text-muted">Phone number used for the order</label><input id="t-phone" className={field} type="tel" inputMode="tel" placeholder="01XXXXXXXXX" required value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        {err && <p role="alert" className="text-[13px] text-wine">{err}</p>}
        <button disabled={busy || !num.trim() || !phone.trim()} className="rounded-full bg-ink px-8 py-3 text-[14px] text-white disabled:opacity-50">{busy ? 'Looking…' : 'Track order'}</button>
      </form>
      {found && <div className="mt-5"><OrderCard o={found} open /></div>}
    </section>
  )
}

function Mine() {
  const { user, openLogin } = useAuth()
  const [orders, setOrders] = useState<TrackedOrder[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!user) return setOrders(null)
    setErr('')
    fetchMyOrders().then(setOrders).catch(() => setErr('Could not load your orders. Please refresh in a moment.'))
  }, [user])

  return (
    <section aria-labelledby="mine">
      <h2 id="mine" className="font-serif text-[24px]">My orders</h2>
      {!user ? (
        <p className="mt-3 text-[14px] text-muted">
          <button type="button" onClick={openLogin} className="text-ink underline underline-offset-4">Sign in</button> to see every order you have placed.
        </p>
      ) : err ? (
        <p role="alert" className="mt-3 text-[13px] text-wine">{err}</p>
      ) : !orders ? (
        <p role="status" className="mt-3 text-[14px] text-muted">Loading your orders…</p>
      ) : orders.length === 0 ? (
        <p className="mt-3 text-[14px] text-muted">You have not placed an order yet. <a href="/#new-arrivals" className="text-ink underline underline-offset-4">Start shopping</a></p>
      ) : (
        <div className="mt-3 space-y-3">{orders.map((o, i) => <OrderCard key={o.order_number} o={o} open={orders.length === 1 || (i === 0 && new URLSearchParams(location.search).get('order') === o.order_number)} />)}</div>
      )}
    </section>
  )
}

/** /track: signed-in customers see their orders; anyone can look one up by order number + phone. */
export default function TrackPage() {
  return (
    <AuthProvider>
      <main className="min-h-screen bg-cream px-4 py-10">
        <div className="mx-auto w-full max-w-[560px] space-y-10">
          <header>
            <a href="/" className="text-[13px] text-muted underline underline-offset-4">← Back to shop</a>
            <h1 className="mt-4 font-serif text-[36px] leading-tight">Track your order</h1>
          </header>
          <Mine />
          <Lookup />
        </div>
      </main>
      <AuthModal />
    </AuthProvider>
  )
}
