import { useState, type ReactNode } from 'react'
import { ExternalLink, LayoutDashboard, LogOut, Package, ReceiptText } from 'lucide-react'
import { AdminProtectedRoute } from './AdminProtectedRoute'
import Orders from './Orders'
import Overview from './Overview'
import Products from './Products'
import { btn } from './ui'

type Tab = 'overview' | 'products' | 'orders'
const TABS: { id: Tab; label: string; short: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', short: 'Overview', icon: <LayoutDashboard className="size-5" /> },
  { id: 'products', label: 'Products & Media', short: 'Products', icon: <Package className="size-5" /> },
  { id: 'orders', label: 'Orders & Attribution', short: 'Orders', icon: <ReceiptText className="size-5" /> },
]

const iconBtn = 'grid size-10 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink'

export default function AdminApp() {
  const [tab, setTab] = useState<Tab>('overview')
  return (
    <AdminProtectedRoute>
      {(user, signOut) => (
        <div className="min-h-svh bg-cream text-ink md:flex">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 md:hidden">
            <div className="flex items-baseline gap-2">
              <h1 className="font-serif text-[22px] leading-none">Zylora</h1>
              <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium tracking-widest text-white uppercase">Admin</span>
            </div>
            <div className="flex items-center">
              <a href="/" className={iconBtn} aria-label="View store"><ExternalLink className="size-[18px]" /></a>
              <button className={iconBtn} onClick={signOut} aria-label="Sign out"><LogOut className="size-[18px]" /></button>
            </div>
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
              <button className={`${btn} mt-2`} onClick={signOut}>Sign out</button>
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
        </div>
      )}
    </AdminProtectedRoute>
  )
}
