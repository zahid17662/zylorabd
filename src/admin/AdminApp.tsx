import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, tokens } from '../api'
import { taka } from '../data'

/* ---------------- types ---------------- */
type User = { id: string; name: string; email: string | null; role: string }
type Dashboard = {
  total_orders: number; pending_orders: number; todays_orders: number; todays_sales: string; total_revenue: string
  cod_orders: number; online_orders: number; cod_revenue: string; online_revenue: string
}
type Order = {
  id: string
  order_number: string
  total_amount: string
  shipping_fee: string
  payment_method: 'cod' | 'online'
  payment_status: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded'
  order_status: OrderStatus
  login_method: 'email' | 'phone' | 'facebook'
  order_source: string | null
  utm: Record<string, string> | null
  customer_name: string
  customer_phone: string | null
  recipient_name: string
  shipping_phone: string
  shipping_address: string
  delivery_zone: string
  created_at: string
  items: { product_title: string; size: string; quantity: number; unit_price: string }[]
  transactions: { provider: string; status: string; gateway_tx_id: string | null }[]
}
type OrderStatus = 'pending' | 'awaiting_payment' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
type Variant = { size: string; stock_quantity: number }
type Product = {
  id: string
  title: string
  description: string
  category: string
  base_price: string
  discount_percent: string
  final_price: string
  images: string[]
  video_url: string | null
  is_active: boolean
  variants: Variant[]
}

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  awaiting_payment: ['cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}
const inp = 'w-full border border-line bg-white px-3 py-2 text-[14px] outline-none focus:border-ink'
const btn = 'rounded-full border border-ink px-4 py-1.5 text-[13px] hover:bg-ink hover:text-white disabled:opacity-40'
const pill: Record<string, string> = {
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
const Pill = ({ v }: { v: string }) => <span className={`rounded-full px-2.5 py-0.5 text-[12px] capitalize ${pill[v] ?? 'bg-stone-100'}`}>{v.replace('_', ' ')}</span>
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' })

/* ---------------- shell ---------------- */
export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(!!tokens.get())
  const [tab, setTab] = useState<'overview' | 'orders' | 'products'>('overview')

  useEffect(() => {
    if (!tokens.get()) return
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false))
  }, [])

  if (checking) return <p className="p-10 text-muted">Loading…</p>
  if (!user || user.role !== 'admin') return <Login denied={!!user} onDone={setUser} />

  return (
    <div className="min-h-svh bg-cream text-ink">
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <div className="flex items-center gap-8">
          <h1 className="font-serif text-[22px]">Zylora Admin</h1>
          <nav className="flex gap-5 text-[14px]">
            {(['overview', 'orders', 'products'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`capitalize ${tab === t ? 'border-b border-ink' : 'text-muted'}`}>
                {t}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-[13px]">
          <a href="/" className="text-muted underline">View store</a>
          <span className="text-muted">{user.email}</span>
          <button
            className={btn}
            onClick={() => {
              tokens.set(null)
              setUser(null)
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1300px] p-6">
        {tab === 'overview' && <Overview />}
        {tab === 'orders' && <Orders />}
        {tab === 'products' && <Products />}
      </main>
    </div>
  )
}

function Login({ onDone, denied }: { onDone: (u: User) => void; denied: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(denied ? 'This account is not an admin.' : '')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      tokens.set(await api('/auth/login', { body: { method: 'email', email, password } }))
      const me = await api<User>('/auth/me')
      if (me.role !== 'admin') {
        tokens.set(null)
        setErr('This account is not an admin.')
      } else onDone(me)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid min-h-svh place-items-center bg-cream p-4">
      <form onSubmit={submit} className="w-full max-w-[380px] space-y-3 bg-white p-8">
        <h1 className="font-serif text-[28px]">Admin sign in</h1>
        <input className={inp} type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inp} type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p role="alert" className="text-[13px] text-wine">{err}</p>}
        <button disabled={busy} className="w-full rounded-full bg-ink py-3 text-[14px] text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

/* ---------------- overview ---------------- */
function Overview() {
  const [d, setD] = useState<Dashboard | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    api<Dashboard>('/admin/dashboard').then(setD).catch((e) => setErr(e.message))
  }, [])
  if (err) return <p className="text-wine">{err}</p>
  if (!d) return <p className="text-muted">Loading…</p>
  const cards: [string, string][] = [
    ['Total orders', String(d.total_orders)],
    ['Pending orders', String(d.pending_orders)],
    ["Today's orders", String(d.todays_orders)],
    ["Today's sales", taka(Number(d.todays_sales))],
    ['Total revenue (paid)', taka(Number(d.total_revenue))],
  ]
  const split: [string, string][] = [
    ['COD orders', String(d.cod_orders)],
    ['Online orders', String(d.online_orders)],
    ['COD revenue (collected)', taka(Number(d.cod_revenue))],
    ['Online revenue (paid)', taka(Number(d.online_revenue))],
  ]
  const grid = (items: [string, string][], cols: string) => (
    <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
      {items.map(([label, value]) => (
        <div key={label} className="bg-white p-5">
          <p className="text-[12px] tracking-widest text-muted uppercase">{label}</p>
          <p className="mt-2 font-serif text-[28px] tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  )
  return (
    <div className="space-y-4">
      {grid(cards, 'lg:grid-cols-5')}
      <p className="pt-2 text-[12px] tracking-widest text-muted uppercase">Cash on Delivery vs online payment</p>
      {grid(split, 'lg:grid-cols-4')}
    </div>
  )
}

/* ---------------- orders ---------------- */
function Orders() {
  const [rows, setRows] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ order_status: '', payment_method: '', payment_status: '', login_method: '', order_source: '', q: '' })
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const size = 25

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(size) })
    Object.entries(f).forEach(([k, v]) => v && qs.set(k, v))
    setLoading(true)
    api<{ items: Order[]; total: number }>(`/admin/orders?${qs}`)
      .then((r) => {
        setRows(r.items)
        setTotal(r.total)
        setErr('')
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [f, page])
  useEffect(load, [load])

  const move = async (o: Order, status: OrderStatus) => {
    if (status === 'cancelled' && !confirm(`Cancel order ${o.order_number}? Stock will be returned.`)) return
    try {
      await api(`/admin/orders/${o.id}/status`, { method: 'PATCH', body: { status } })
      load()
    } catch (e) {
      alert((e as Error).message)
    }
  }
  const sel = (k: keyof typeof f, label: string, opts: string[]) => (
    <select className={inp + ' !w-auto'} aria-label={label} value={f[k]} onChange={(e) => (setPage(1), setF({ ...f, [k]: e.target.value }))}>
      <option value="">{label}: all</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={inp + ' !w-56'} placeholder="Search order ID, name, phone" value={f.q} onChange={(e) => (setPage(1), setF({ ...f, q: e.target.value }))} />
        {sel('order_status', 'Status', ['awaiting_payment', 'confirmed', 'shipped', 'delivered', 'cancelled'])}
        {sel('payment_method', 'Payment', ['cod', 'online'])}
        {sel('payment_status', 'Paid?', ['paid', 'unpaid', 'pending', 'failed', 'refunded'])}
        {sel('login_method', 'Login via', ['email', 'phone', 'facebook'])}
        <input className={inp + ' !w-40'} placeholder="UTM source" value={f.order_source} onChange={(e) => (setPage(1), setF({ ...f, order_source: e.target.value }))} />
      </div>
      {err && <p className="mb-3 text-wine">{err}</p>}
      <div className="overflow-x-auto bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-line text-muted">
            <tr>{['Order', 'Date', 'Customer', 'Total', 'Payment', 'Login / Source', 'Status', ''].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <FragmentRow key={o.id} o={o} open={open === o.id} toggle={() => setOpen(open === o.id ? null : o.id)} move={move} />
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">No orders match.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-[13px] text-muted">
        <span>{total} orders</span>
        <div className="flex gap-2">
          <button className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <button className={btn} disabled={page * size >= total} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  )
}

function FragmentRow({ o, open, toggle, move }: { o: Order; open: boolean; toggle: () => void; move: (o: Order, s: OrderStatus) => void }) {
  return (
    <>
      <tr className="cursor-pointer border-b border-line hover:bg-cream/60" onClick={toggle}>
        <td className="px-4 py-3 font-medium">{o.order_number}</td>
        <td className="px-4 py-3 whitespace-nowrap">{when(o.created_at)}</td>
        <td className="px-4 py-3">{o.recipient_name}<br /><span className="text-muted">{o.shipping_phone}</span></td>
        <td className="px-4 py-3 whitespace-nowrap">{taka(Number(o.total_amount))}</td>
        <td className="px-4 py-3"><span className="uppercase">{o.payment_method}</span> <Pill v={o.payment_status} /></td>
        <td className="px-4 py-3 capitalize">{o.login_method}<br /><span className="text-muted normal-case">{o.order_source ?? 'direct'}</span></td>
        <td className="px-4 py-3"><Pill v={o.order_status} /></td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end gap-1.5">
            {NEXT[o.order_status].map((s) => (
              <button key={s} className={btn} onClick={() => move(o, s)}>{s === 'cancelled' ? 'Cancel' : `Mark ${s}`}</button>
            ))}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-cream/40">
          <td colSpan={8} className="grid gap-6 px-4 py-4 md:grid-cols-3">
            <div>
              <p className="mb-1 text-muted">Items</p>
              {o.items.map((i, k) => <p key={k}>{i.product_title} ({i.size}) × {i.quantity} — {taka(Number(i.unit_price) * i.quantity)}</p>)}
              <p className="mt-1 text-muted">Delivery {taka(Number(o.shipping_fee))}</p>
            </div>
            <div>
              <p className="mb-1 text-muted">Ship to ({o.delivery_zone.replace('_', ' ')})</p>
              <p>{o.recipient_name}, {o.shipping_phone}</p>
              <p>{o.shipping_address}</p>
              <p className="mt-1 text-muted">Account: {o.customer_name}</p>
            </div>
            <div>
              <p className="mb-1 text-muted">Attribution & payment</p>
              <p>Source: {o.order_source ?? 'direct'}{o.utm?.utm_medium && ` / ${o.utm.utm_medium}`}{o.utm?.utm_campaign && ` / ${o.utm.utm_campaign}`}</p>
              {o.utm?.referrer && <p className="break-all">Referrer: {o.utm.referrer}</p>}
              {o.transactions.length === 0 ? <p>No online transaction (COD)</p> : o.transactions.map((t, k) => <p key={k}>{t.provider} · {t.status}{t.gateway_tx_id && ` · ${t.gateway_tx_id}`}</p>)}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/* ---------------- products ---------------- */
const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL']
type Form = {
  id?: string
  title: string
  description: string
  category: string
  base_price: string
  discount_percent: string
  images: string
  video_url: string
  is_active: boolean
  variants: Variant[]
}
const blank = (): Form => ({
  title: '', description: '', category: '', base_price: '', discount_percent: '0', images: '', video_url: '', is_active: true,
  variants: DEFAULT_SIZES.map((size) => ({ size, stock_quantity: 0 })),
})
const toForm = (p: Product): Form => ({
  id: p.id, title: p.title, description: p.description, category: p.category, base_price: p.base_price,
  discount_percent: p.discount_percent, images: p.images.join('\n'), video_url: p.video_url ?? '', is_active: p.is_active,
  variants: p.variants.map((v) => ({ size: v.size, stock_quantity: v.stock_quantity })),
})

function Products() {
  const [list, setList] = useState<Product[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => {
    api<Product[]>('/admin/products').then(setList).catch((e) => setErr(e.message))
  }, [])
  useEffect(load, [load])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-[24px]">Products</h2>
        <button className={btn} onClick={() => setForm(blank())}>+ New product</button>
      </div>
      {err && <p className="mb-3 text-wine">{err}</p>}
      <div className="overflow-x-auto bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-line text-muted">
            <tr>{['', 'Title', 'Category', 'Price', 'Stock by size', 'Status', ''].map((h, i) => <th key={i} className="px-4 py-3 font-normal">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-b border-line">
                <td className="px-4 py-2">{p.images[0] && <img src={p.images[0] + '?auto=format&fit=crop&w=80&h=100&q=70'} alt="" className="h-12 w-10 object-cover" />}</td>
                <td className="px-4 py-2">{p.title}</td>
                <td className="px-4 py-2">{p.category}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {taka(Number(p.final_price))}
                  {Number(p.discount_percent) > 0 && <span className="ml-1 text-muted line-through">{taka(Number(p.base_price))}</span>}
                </td>
                <td className="px-4 py-2">
                  {p.variants.map((v) => (
                    <span key={v.size} className={`mr-2 ${v.stock_quantity === 0 ? 'text-red-700' : ''}`}>{v.size}:{v.stock_quantity}</span>
                  ))}
                </td>
                <td className="px-4 py-2">{p.is_active ? 'Active' : <span className="text-muted">Hidden</span>}</td>
                <td className="px-4 py-2 text-right"><button className={btn} onClick={() => setForm(toForm(p))}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && <ProductForm initial={form} onClose={() => setForm(null)} onSaved={() => (setForm(null), load())} />}
    </div>
  )
}

/** PUT straight to R2/S3 with upload progress (fetch can't report upload progress). */
function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Upload to storage failed. Check the bucket CORS settings.'))
    const x = new XMLHttpRequest()
    x.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v)
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : fail())
    x.onerror = fail
    x.send(file)
  })
}

function ProductForm({ initial, onClose, onSaved }: { initial: Form; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newSize, setNewSize] = useState('')
  const [progress, setProgress] = useState<number | null>(null)

  const upload = async (file: File) => {
    setErr('')
    setBusy(true)
    setProgress(0)
    try {
      const p = await api<{ upload_url: string; public_url: string; headers: Record<string, string> }>('/admin/media/presign', {
        body: { content_type: file.type, size_bytes: file.size },
      })
      await putWithProgress(p.upload_url, p.headers, file, setProgress)
      if (file.type.startsWith('video')) setF((x) => ({ ...x, video_url: p.public_url }))
      else setF((x) => ({ ...x, images: [x.images, p.public_url].filter(Boolean).join('\n') }))
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 503 ? 'Media storage (Cloudflare R2) is not configured yet. Paste a URL instead.' : (e as Error).message)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const body = {
      title: f.title, description: f.description, category: f.category,
      base_price: f.base_price, discount_percent: f.discount_percent || '0',
      images: f.images.split('\n').map((s) => s.trim()).filter(Boolean),
      video_url: f.video_url.trim() || null, is_active: f.is_active, variants: f.variants,
    }
    try {
      await api(f.id ? `/admin/products/${f.id}` : '/admin/products', { method: f.id ? 'PATCH' : 'POST', body })
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const lab = 'block text-[12px] text-muted mb-1'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="mx-auto my-6 w-full max-w-[640px] space-y-3 bg-white p-7">
        <h3 className="font-serif text-[24px]">{f.id ? 'Edit product' : 'New product'}</h3>
        <div><label className={lab}>Title</label><input className={inp} required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className={lab}>Description</label><textarea className={inp} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={lab}>Category</label><input className={inp} required value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
          <div><label className={lab}>Base price (৳)</label><input className={inp} type="number" min="0" step="0.01" required value={f.base_price} onChange={(e) => setF({ ...f, base_price: e.target.value })} /></div>
          <div><label className={lab}>Discount %</label><input className={inp} type="number" min="0" max="100" step="0.01" value={f.discount_percent} onChange={(e) => setF({ ...f, discount_percent: e.target.value })} /></div>
        </div>
        <div>
          <label className={lab}>Image URLs (one per line)</label>
          <textarea className={inp} rows={3} value={f.images} onChange={(e) => setF({ ...f, images: e.target.value })} />
        </div>
        <div><label className={lab}>Showcase video URL</label><input className={inp} value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} /></div>
        <div>
          <label className={lab}>Upload image (max 8 MB) or video (MP4/WebM, max 15 MB)</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} className="text-[13px]" />
          {progress !== null && (
            <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Upload progress">
              <div className="h-2 w-full bg-cream"><div className="h-2 bg-ink transition-[width]" style={{ width: `${progress}%` }} /></div>
              <p className="mt-1 text-[12px] text-muted">Uploading… {progress}%</p>
            </div>
          )}
        </div>
        <div>
          <label className={lab}>Stock by size</label>
          <div className="flex flex-wrap gap-2">
            {f.variants.map((v, i) => (
              <label key={v.size} className="flex items-center gap-1.5 border border-line px-2 py-1 text-[13px]">
                {v.size}
                <input
                  type="number" min="0" className="w-16 border-0 bg-cream px-1 py-0.5 text-right" value={v.stock_quantity}
                  onChange={(e) => setF({ ...f, variants: f.variants.map((x, k) => (k === i ? { ...x, stock_quantity: Math.max(0, Number(e.target.value)) } : x)) })}
                />
              </label>
            ))}
            <span className="flex gap-1">
              <input className={inp + ' !w-28'} placeholder="e.g. Free Size" value={newSize} onChange={(e) => setNewSize(e.target.value)} />
              <button
                type="button" className={btn}
                onClick={() => newSize.trim() && !f.variants.some((v) => v.size === newSize.trim()) && (setF({ ...f, variants: [...f.variants, { size: newSize.trim(), stock_quantity: 0 }] }), setNewSize(''))}
              >
                Add size
              </button>
            </span>
          </div>
          <p className="mt-1 text-[12px] text-muted">Sizes can be added and restocked here; set stock to 0 to mark a size sold out.</p>
        </div>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Visible in store</label>
        {err && <p role="alert" className="text-[13px] text-wine">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button disabled={busy} className="rounded-full bg-ink px-6 py-1.5 text-[13px] text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
