import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, KeyRound, LayoutDashboard, LogOut, Menu, Package, ReceiptText, X } from 'lucide-react'
import { AdminProtectedRoute } from './AdminProtectedRoute'
import Orders from './Orders'
import Overview from './Overview'
import Products from './Products'
import { ChangePassword } from './ChangePassword'
import { btn } from './ui'

type Tab = 'overview' | 'products' | 'orders'
const TABS: { id: Tab; label: string; short: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', short: 'Overview', icon: <LayoutDashboard className="size-5" /> },
  { id: 'products', label: 'Products & Media', short: 'Products', icon: <Package className="size-5" /> },
  { id: 'orders', label: 'Orders & Attribution', short: 'Orders', icon: <ReceiptText className="size-5" /> },
]

const menuItem = 'flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] hover:bg-cream'
const iconBtn = 'grid size-10 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink'

export default function AdminApp() {
  const [tab, setTab] = useState<Tab>('overview')
  const [pwOpen, setPwOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])
  return (
    <AdminProtectedRoute>
      {(user, signOut) => (
        <div className="min-h-svh bg-cream text-ink md:flex">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-white px-4 md:hidden">
            <div className="flex items-baseline gap-2">
              <h1 className="font-serif text-[22px] leading-none">Zylora</h1>
              <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium tracking-widest text-white uppercase">Admin</span>
            </div>
            <button className={iconBtn} onClick={() => setMenuOpen((v) => !v)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-haspopup="menu">
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 top-14 z-40 bg-black/30" onClick={() => setMenuOpen(false)} aria-hidden />
                <div role="menu" className="absolute top-14 right-0 left-0 z-50 border-b border-line bg-white pb-2 shadow-lg">
                  <p className="truncate px-4 py-3 text-[13px] text-muted">{user.email}</p>
                  <a role="menuitem" href="/" className={menuItem}><ExternalLink className="size-[18px] text-muted" />View store</a>
                  <button role="menuitem" className={menuItem} onClick={() => { setMenuOpen(false); setPwOpen(true) }}><KeyRound className="size-[18px] text-muted" />Change password</button>
                  <button role="menuitem" className={`${menuItem} text-wine`} onClick={signOut}><LogOut className="size-[18px]" />Sign out</button>
                </div>
              </>
            )}
          </header>

          {/* Desktop sidebar */}
          <aside className="hidden border-r border-line bg-white md:sticky md:top-0 md:block md:h-svh md:w-60 md:shrink-0">
            <div className="px-5 py-4"><h1 className="font-serif text-[22px]">Zylora Admin</h1></div>
            <nav className="flex flex-col gap-1 px-3" aria-label="Admin sections">
              {TABS.map((t) => (
                <button
                  key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[14px] whitespace-nowrap ${tab === t.id ? 'bg-ink text-white' : 'text-muted hover:bg-cream'}`}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </nav>
            <div className="px-5 pt-8 text-[13px]">
              <a href="/" className="text-muted underline">View store</a>
              <p className="mt-4 truncate text-muted">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={btn} onClick={() => setPwOpen(true)}>Change password</button>
                <button className={btn} onClick={signOut}>Sign out</button>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1 p-4 pb-28 sm:p-6 md:pb-6">
            {tab === 'overview' && <Overview />}
            {tab === 'products' && <Products />}
            {tab === 'orders' && <Orders />}
          </main>

          {/* Mobile bottom tab bar */}
          <nav
            aria-label="Admin sections"
            className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {TABS.map((t) => (
              <button
                key={t.id} onClick={() => { setTab(t.id); window.scrollTo({ top: 0 }) }} aria-current={tab === t.id ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${tab === t.id ? 'text-ink' : 'text-muted'}`}
              >
                <span className={`grid h-7 w-14 place-items-center rounded-full transition-colors ${tab === t.id ? 'bg-sand' : ''}`}>{t.icon}</span>
                {t.short}
              </button>
            ))}
          </nav>
          {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
        </div>
      )}
    </AdminProtectedRoute>
  )
}
