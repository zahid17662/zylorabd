import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertCircle, Check, ChevronLeft, PackageOpen, Phone, Search } from 'lucide-react'
import { AuthProvider, useAuth } from './auth'
import { AuthModal } from './components/AuthModal'
import { Logo } from './components/Logo'
import { ProductImage } from './components/ui/ProductImage'
import { img, taka } from './data'
import { fetchMyOrders, trackOrder, type TrackedOrder } from './orderTracking'

type Status = TrackedOrder['order_status']

const field = 'w-full rounded-md border border-line bg-white px-4 py-3 text-[15px] outline-none focus:border-ink'
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' })
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' })

const BADGE: Record<Status, { label: string; cls: string }> = {
  pending: { label: 'Order placed', cls: 'bg-sand text-ink' },
  awaiting_payment: { label: 'Awaiting payment', cls: 'bg-amber-100 text-amber-900' },
  confirmed: { label: 'Confirmed', cls: 'bg-sky-100 text-sky-900' },
  shipped: { label: 'On its way', cls: 'bg-indigo-100 text-indigo-900' },
  delivered: { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-900' },
  cancelled: { label: 'Cancelled', cls: 'bg-wine/10 text-wine' },
}
const NOW_TEXT: Record<Status, string> = {
  pending: 'We have your order and will confirm it shortly.',
  awaiting_payment: 'We are waiting for your payment to go through.',
  confirmed: 'Confirmed. We are getting your order ready to ship.',
  shipped: 'On its way to you. Keep your phone nearby for the delivery call.',
  delivered: 'Delivered. Thank you for shopping with Zylora!',
  cancelled: 'This order was cancelled. Reserved items went back to stock.',
}
const STEPS: { key: Status; label: string }[] = [
  { key: 'pending', label: 'Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'shipped', label: 'On its way' },
  { key: 'delivered', label: 'Delivered' },
]

function Stepper({ o }: { o: TrackedOrder }) {
  const at = (s: Status) => o.events.find((e) => e.status === s)?.at ?? (s === 'pending' ? o.created_at : undefined)
  const reached = o.order_status === 'awaiting_payment' ? 0 : STEPS.findIndex((s) => s.key === o.order_status)
  return (
    <ol className="grid grid-cols-4" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const done = i <= reached
        const current = i === reached
        const stamp = done ? at(s.key) : undefined
        return (
          <li key={s.key} className="relative flex flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className={`absolute top-[13px] right-1/2 h-0.5 w-full ${i <= reached ? 'bg-ink' : 'bg-line'}`} />}
            <span className={`relative z-10 grid size-7 place-items-center rounded-full border-2 ${done ? 'border-ink bg-ink text-white' : 'border-line bg-white text-transparent'} ${current && o.order_status !== 'delivered' ? 'ring-4 ring-ink/10' : ''}`}>
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <span className={`mt-2 text-[12px] leading-tight ${done ? 'font-medium text-ink' : 'text-muted'}`}>{s.label}</span>
            <span className="mt-0.5 h-4 text-[11px] leading-tight text-muted">{stamp ? dateTime(stamp) : ''}</span>
          </li>
        )
      })}
    </ol>
  )
}

function OrderCard({ o }: { o: TrackedOrder }) {
  const b = BADGE[o.order_status]
  const qty = o.items.reduce((n, i) => n + i.quantity, 0)
  return (
    <article className="overflow-hidden rounded-lg border border-line bg-white" aria-label={`Order ${o.order_number}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
        <div>
          <p className="text-[12px] tracking-wider text-muted uppercase">Order</p>
          <h3 className="font-serif text-[22px] leading-tight">{o.order_number}</h3>
          <p className="mt-0.5 text-[13px] text-muted">Placed {dateOnly(o.created_at)} · {qty} {qty === 1 ? 'item' : 'items'}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[13px] font-medium ${b.cls}`}>{b.label}</span>
      </header>

      <div className="px-4 py-5 sm:px-5">
        {o.order_status === 'cancelled' ? (
          <p className="flex items-start gap-2 rounded-md bg-wine/10 px-3 py-3 text-[14px] text-wine"><AlertCircle className="mt-0.5 size-4 shrink-0" />{NOW_TEXT.cancelled}</p>
        ) : (
          <>
            <Stepper o={o} />
            <p className="mt-4 text-center text-[14px] text-muted">{NOW_TEXT[o.order_status]}</p>
          </>
        )}
      </div>

      <ul className="divide-y divide-line border-t border-line">
        {o.items.map((i, k) => (
          <li key={k} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="h-[72px] w-[58px] shrink-0 overflow-hidden rounded bg-cream">
              {i.image ? <ProductImage variant="thumb" src={img(i.image, 160, 200)} alt="" /> : <PackageOpen className="m-auto mt-6 size-5 text-muted" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px]">{i.product_title}</p>
              <p className="text-[13px] text-muted">Size {i.size} · Qty {i.quantity}</p>
            </div>
            <p className="text-[14px] tabular-nums">{taka(Number(i.unit_price) * i.quantity)}</p>
          </li>
        ))}
      </ul>

      <dl className="space-y-1.5 border-t border-line bg-cream/60 px-4 py-4 text-[14px] sm:px-5">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{taka(Number(o.subtotal))}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{taka(Number(o.shipping_fee))}</dd></div>
        <div className="flex justify-between border-t border-line pt-2 text-[16px] font-medium"><dt>Total</dt><dd className="tabular-nums">{taka(Number(o.total_amount))}</dd></div>
        <div className="flex justify-between text-[13px] text-muted"><dt>Payment</dt><dd>{o.payment_method === 'cod' ? 'Cash on delivery' : 'Paid online'}</dd></div>
        <div className="pt-2 text-[13px] text-muted">
          Deliver to <span className="text-ink">{o.recipient_name}</span>{o.shipping_address ? <> · {o.shipping_address}</> : null}
        </div>
      </dl>
    </article>
  )
}

function Skeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading your orders">
      {[0, 1].map((k) => (
        <div key={k} className="animate-pulse rounded-lg border border-line bg-white p-5">
          <div className="h-5 w-40 rounded bg-sand" /><div className="mt-3 h-3 w-28 rounded bg-sand" />
          <div className="mt-6 h-12 rounded bg-cream" /><div className="mt-5 h-16 rounded bg-cream" />
        </div>
      ))}
    </div>
  )
}

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'active', label: 'Active', test: (s: Status) => s !== 'delivered' && s !== 'cancelled' },
  { id: 'delivered', label: 'Delivered', test: (s: Status) => s === 'delivered' },
  { id: 'cancelled', label: 'Cancelled', test: (s: Status) => s === 'cancelled' },
] as const

function Lookup({ compact }: { compact?: boolean }) {
  const [num, setNum] = useState(new URLSearchParams(location.search).get('order') ?? '')
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
      else setErr('No order matches that number and phone. Check both and try again.')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="lookup" className="rounded-lg border border-line bg-white p-5">
      <h2 id="lookup" className="flex items-center gap-2 text-[17px] font-medium"><Search className="size-4" />{compact ? 'Track another order' : 'Track an order'}</h2>
      <p className="mt-1 text-[13px] text-muted">No account needed. Use the order number from your confirmation and the phone number you ordered with.</p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="t-num" className="mb-1 block text-[13px] text-muted">Order number</label><input id="t-num" className={field} placeholder="ZB1A2B3C4D" autoCapitalize="characters" autoComplete="off" required value={num} onChange={(e) => setNum(e.target.value)} /></div>
        <div><label htmlFor="t-phone" className="mb-1 block text-[13px] text-muted">Phone number</label><input id="t-phone" className={field} type="tel" inputMode="tel" placeholder="01XXXXXXXXX" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="sm:col-span-2">
          {err && <p role="alert" className="mb-3 flex items-start gap-2 text-[13px] text-wine"><AlertCircle className="mt-0.5 size-4 shrink-0" />{err}</p>}
          <button disabled={busy || !num.trim() || !phone.trim()} className="w-full rounded-full bg-ink px-8 py-3 text-[14px] text-white hover:bg-black disabled:opacity-50 sm:w-auto">{busy ? 'Looking…' : 'Track order'}</button>
        </div>
      </form>
      {found && <div className="mt-5"><OrderCard o={found} /></div>}
    </section>
  )
}

function Content() {
  const { user, openLogin, logout } = useAuth()
  const [orders, setOrders] = useState<TrackedOrder[] | null>(null)
  const [err, setErr] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user) return setOrders(null)
    setErr(false)
    setOrders(null)
    fetchMyOrders().then(setOrders).catch(() => setErr(true))
  }, [user, tick])

  const shown = useMemo(() => (orders ?? []).filter((o) => FILTERS.find((f) => f.id === filter)!.test(o.order_status)), [orders, filter])
  const count = (id: (typeof FILTERS)[number]['id']) => (orders ?? []).filter((o) => FILTERS.find((f) => f.id === id)!.test(o.order_status)).length

  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-[720px] items-center justify-between px-4">
          <a href="/" className="flex items-center gap-1 text-[14px] text-muted hover:text-ink"><ChevronLeft className="size-4" />Shop</a>
          <a href="/" aria-label="Zylora home"><Logo className="text-[18px]" /></a>
          {user ? (
            <button onClick={() => void logout()} className="text-[13px] text-muted underline underline-offset-4 hover:text-ink">Sign out</button>
          ) : (
            <button onClick={openLogin} className="text-[13px] underline underline-offset-4">Sign in</button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] space-y-6 px-4 py-8">
        <div>
          <h1 className="font-serif text-[34px] leading-tight sm:text-[40px]">My orders</h1>
          <p className="mt-1 text-[14px] text-muted">{user ? <>Signed in as <span className="text-ink">{user.email ?? user.phone ?? user.name}</span></> : 'Sign in to see everything you have ordered.'}</p>
        </div>

        {!user ? (
          <section className="rounded-lg border border-line bg-white p-6 text-center">
            <PackageOpen className="mx-auto size-9 text-muted" strokeWidth={1.2} />
            <p className="mt-3 text-[16px]">See all your orders in one place</p>
            <p className="mt-1 text-[13px] text-muted">Status, items, delivery details and totals.</p>
            <button onClick={openLogin} className="mt-4 rounded-full bg-ink px-8 py-3 text-[14px] text-white hover:bg-black">Sign in</button>
          </section>
        ) : err ? (
          <div role="alert" className="rounded-lg border border-line bg-white p-6 text-center">
            <AlertCircle className="mx-auto size-6 text-wine" />
            <p className="mt-2 text-[14px]">We could not load your orders just now.</p>
            <button onClick={() => setTick((t) => t + 1)} className="mt-3 rounded-full border border-ink px-6 py-2 text-[13px]">Try again</button>
          </div>
        ) : !orders ? (
          <Skeleton />
        ) : orders.length === 0 ? (
          <section className="rounded-lg border border-line bg-white p-6 text-center">
            <PackageOpen className="mx-auto size-9 text-muted" strokeWidth={1.2} />
            <p className="mt-3 text-[16px]">No orders on this account yet</p>
            <p className="mx-auto mt-1 max-w-[420px] text-[13px] text-muted">If you ordered with a different email or phone, sign out and sign in with that account, or track the order by its number below.</p>
            <a href="/#new-arrivals" className="mt-4 inline-block rounded-full bg-ink px-8 py-3 text-[14px] text-white hover:bg-black">Start shopping</a>
          </section>
        ) : (
          <>
            <div role="tablist" aria-label="Filter orders" className="flex gap-2 overflow-x-auto pb-1">
              {FILTERS.map((f) => (
                <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                  className={`shrink-0 rounded-full border px-4 py-1.5 text-[13px] ${filter === f.id ? 'border-ink bg-ink text-white' : 'border-line bg-white text-muted hover:text-ink'}`}>
                  {f.label} <span className="opacity-70">{count(f.id)}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="rounded-lg border border-line bg-white p-6 text-center text-[14px] text-muted">No {filter} orders.</p>
            ) : (
              <div className="space-y-4">{shown.map((o) => <OrderCard key={o.order_number} o={o} />)}</div>
            )}
          </>
        )}

        <Lookup compact={Boolean(user)} />

        <p className="flex items-center justify-center gap-2 pb-4 text-[13px] text-muted">
          <Phone className="size-4" />Need help with an order? Call <a href="tel:+8801700000000" className="text-ink underline underline-offset-4">+880 1700-000000</a>
        </p>
      </main>
      <AuthModal />
    </>
  )
}

/** /track: signed-in customers see their orders (items, status progress, totals); anyone can look one up by number + phone. */
export default function TrackPage() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-cream"><Content /></div>
    </AuthProvider>
  )
}
