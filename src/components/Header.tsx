import { useEffect, useRef, useState } from 'react'
import { Heart, Menu, Phone, Search, ShoppingBag, User, X } from 'lucide-react'
import { useCart } from '../cart'
import { img, taka } from '../data'
import { useAuth } from '../auth'
import { useCatalog } from '../catalog'
import { Logo } from './Logo'

export const MENU = [
  { label: 'New Arrivals', href: '#new-arrivals' },
  { label: 'Eid Collection', href: '#eid-collection' },
  { label: 'Kurti', href: '#creations' },
  { label: 'Three Piece', href: '#creations' },
  { label: 'Western', href: '#collections' },
  { label: 'Handbags & Jewellery', href: '#collections' },
  { label: 'Flash Sale', href: '#eid-collection' },
]

const SECONDARY = ['Zylora Services', 'Track Your Order', 'Size Guide', 'Contact Us']

function MenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-500 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside
        className={`absolute inset-y-0 left-0 flex w-full max-w-[440px] flex-col bg-white px-8 py-7 transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)] md:px-12 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button onClick={onClose} className="caps flex items-center gap-2 self-start" aria-label="Close menu">
          <X className="size-4" strokeWidth={1.5} /> Close
        </button>
        <nav className="mt-12 flex flex-col gap-1">
          {MENU.map((m, i) => (
            <a
              key={m.label}
              href={m.href}
              onClick={onClose}
              style={{ animationDelay: `${i * 45}ms` }}
              className={`py-2 font-serif text-[28px] leading-tight transition-colors hover:text-caramel ${open ? 'animate-[rise_.6s_both]' : ''} ${
                m.label === 'Flash Sale' ? 'text-wine' : ''
              }`}
            >
              {m.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto space-y-3 border-t border-line pt-6">
          {SECONDARY.map((s) => (
            <a key={s} href="#services" onClick={onClose} className="block text-[14px] text-muted hover:text-ink">
              {s}
            </a>
          ))}
          <p className="pt-3 text-[13px] text-muted">
            Can we help you? <a href="tel:+8801700000000" className="text-ink underline underline-offset-4">+880 1700-000000</a>
          </p>
        </div>
      </aside>
    </div>
  )
}

function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    ref.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  const term = q.trim().toLowerCase()
  const { products: allProducts } = useCatalog()
  const results = term ? allProducts.filter((p) => `${p.title} ${p.category}`.toLowerCase().includes(term)) : allProducts.slice(0, 4)

  return (
    <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-500 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <div className={`relative bg-white transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)] ${open ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="mx-auto max-w-[1100px] px-6 pt-6 pb-12">
          <div className="flex justify-end">
            <button onClick={onClose} className="caps flex items-center gap-2" aria-label="Close search">
              <X className="size-4" strokeWidth={1.5} /> Close
            </button>
          </div>
          <label className="mt-6 flex items-center gap-4 rounded-full border border-ink/25 px-6 py-3.5 focus-within:border-ink">
            <Search className="size-[18px]" strokeWidth={1.5} />
            <input
              ref={ref}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for kurtis, three piece, handbags…"
              className="w-full bg-transparent text-[16px] outline-none placeholder:text-muted"
            />
          </label>
          <p className="caps mt-8 text-muted">{term ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Trending searches'}</p>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-6 md:grid-cols-4">
            {results.slice(0, 8).map((p) => (
              <a key={p.id} href="#new-arrivals" onClick={onClose} className="group">
                <div className="aspect-[4/5] overflow-hidden bg-cream">
                  <img src={img(p.image, 400, 500)} alt="" className="size-full object-cover transition duration-700 group-hover:scale-105" />
                </div>
                <p className="mt-3 text-[14px] leading-snug">{p.title}</p>
                <p className="text-[13px] text-muted">{taka(p.salePrice ?? p.price)}</p>
              </a>
            ))}
            {term && results.length === 0 && <p className="col-span-full text-muted">No results for “{q}”. Try “kurti” or “bag”.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Header() {
  const { count, subtotal, setOpen, wishlist } = useCart()
  const { user, openLogin, logout } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [hover, setHover] = useState(false)
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  // Transparent over the hero, solid white once scrolled or hovered
  const solid = scrolled || hover

  return (
    <>
      <header
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
          solid ? 'border-b border-line bg-white text-ink' : 'border-b border-transparent bg-transparent text-white'
        }`}
      >
        <div className="relative mx-auto grid h-[64px] grid-cols-[1fr_auto_1fr] items-center px-4 md:h-[76px] md:px-10">
          <div className="flex items-center gap-6">
            <button onClick={() => setMenu(true)} className="flex items-center gap-2.5 text-[14px]" aria-label="Open menu">
              <Menu className="size-5" strokeWidth={1.25} />
              <span className="hidden md:inline">Menu</span>
            </button>
            <button onClick={() => setSearch(true)} className="flex items-center gap-2.5 text-[14px]" aria-label="Search">
              <Search className="size-[18px]" strokeWidth={1.25} />
              <span className="hidden md:inline">Search</span>
            </button>
          </div>

          <a href="#top" aria-label="Zylora home" className="justify-self-center">
            <Logo className="text-[18px] md:text-[24px]" />
          </a>

          <div className="flex items-center justify-end gap-4 md:gap-6">
            <a href="tel:+8801700000000" className="hidden items-center gap-2 text-[14px] xl:flex">
              <Phone className="size-4" strokeWidth={1.25} /> Call us
            </a>
            <button className="relative hidden sm:block" aria-label={`Wishlist, ${wishlist.length} items`}>
              <Heart className="size-[19px]" strokeWidth={1.25} />
              {wishlist.length > 0 && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-wine" />}
            </button>
            <button className="hidden items-center gap-2 text-[13px] sm:flex" aria-label={user ? `Sign out ${user.name}` : 'Sign in'} title={user ? `Signed in as ${user.name}. Click to sign out` : 'Sign in'} onClick={() => (user ? logout() : openLogin())}>
              <User className="size-[19px]" strokeWidth={1.25} />
              {user && <span className="hidden max-w-[90px] truncate lg:inline">{user.name.split(' ')[0]}</span>}
            </button>
            <button onClick={() => setOpen(true)} className="flex items-center gap-2.5" aria-label={`Shopping bag, ${count} items`}>
              <span className="hidden text-[14px] tabular-nums lg:inline">{taka(subtotal)}</span>
              <span className="relative">
                <ShoppingBag className="size-[19px]" strokeWidth={1.25} />
                {count > 0 && (
                  <span className={`absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-medium ${solid ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
                    {count}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>
      </header>
      <MenuDrawer open={menu} onClose={() => setMenu(false)} />
      <SearchPanel open={search} onClose={() => setSearch(false)} />
    </>
  )
}
