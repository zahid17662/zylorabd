import { useState, type ReactNode } from 'react'
import { LayoutDashboard, Package, ReceiptText } from 'lucide-react'
import { AdminProtectedRoute } from './AdminProtectedRoute'
import Orders from './Orders'
import Overview from './Overview'
import Products from './Products'
import { btn } from './ui'

type Tab = 'overview' | 'products' | 'orders'
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="size-4" /> },
  { id: 'products', label: 'Products & Media', icon: <Package className="size-4" /> },
  { id: 'orders', label: 'Orders & Attribution', icon: <ReceiptText className="size-4" /> },
]

export default function AdminApp() {
  const [tab, setTab] = useState<Tab>('overview')
  return (
    <AdminProtectedRoute>
      {(user, signOut) => (
        <div className="min-h-svh bg-cream text-ink md:flex">
          <aside className="border-b border-line bg-white md:sticky md:top-0 md:h-svh md:w-60 md:shrink-0 md:border-r md:border-b-0">
            <div className="flex items-center justify-between px-5 py-4 md:block">
              <h1 className="font-serif text-[22px]">Zylora Admin</h1>
              <button className={`${btn} md:hidden`} onClick={signOut}>Sign out</button>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0" aria-label="Admin sections">
              {TABS.map((t) => (
                <button
                  key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[14px] whitespace-nowrap ${tab === t.id ? 'bg-ink text-white' : 'text-muted hover:bg-cream'}`}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </nav>
            <div className="hidden px-5 pt-8 text-[13px] md:block">
              <a href="/" className="text-muted underline">View store</a>
              <p className="mt-4 truncate text-muted">{user.email}</p>
              <button className={`${btn} mt-2`} onClick={signOut}>Sign out</button>
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-4 sm:p-6">
            {tab === 'overview' && <Overview />}
            {tab === 'products' && <Products />}
            {tab === 'orders' && <Orders />}
          </main>
        </div>
      )}
    </AdminProtectedRoute>
  )
}
