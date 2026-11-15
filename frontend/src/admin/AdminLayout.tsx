import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ExternalLink, KeyRound, LogOut, Menu, X } from 'lucide-react'
import { useDocumentTitle } from '../useDocumentTitle'
import AdminNav from './AdminNav'
import { ChangePassword } from './ChangePassword'
import { isActive, MOBILE_TABS, pageTitle } from './nav'
import { btn } from './ui'
import type { User } from './types'

const menuItem = 'flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] hover:bg-cream'
const iconBtn = 'grid size-10 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink'

/** Admin shell: sidebar on desktop, slide-over drawer plus bottom bar on mobile, and the current page in <Outlet/>. */
export default function AdminLayout({ user, signOut }: { user: User; signOut: () => void }) {
  const { pathname } = useLocation()
  const [pwOpen, setPwOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  useDocumentTitle(`${pageTitle(pathname)} - Zylora Admin`)

  // Close the drawer when the page changes.
  useEffect(() => setDrawerOpen(false), [pathname])

  useEffect(() => {
    if (!drawerOpen) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="min-h-svh bg-cream text-ink md:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 md:hidden">
        <div className="flex items-baseline gap-2">
          <h1 className="font-serif text-[22px] leading-none">Zylora</h1>
          <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium tracking-widest text-white uppercase">Admin</span>
        </div>
        <button className={iconBtn} onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-haspopup="dialog" aria-expanded={drawerOpen}>
          <Menu className="size-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label="Admin menu" className="fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-[320px] flex-col overflow-y-auto bg-white pb-6 shadow-xl md:hidden">
            <div className="flex items-center justify-between px-5 py-3">
              <h2 className="font-serif text-[22px]">Zylora Admin</h2>
              <button ref={closeRef} className={iconBtn} onClick={() => setDrawerOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
            </div>
            <AdminNav pathname={pathname} />
            <div className="mt-4 border-t border-line pt-2">
              <p className="truncate px-4 py-3 text-[13px] text-muted">{user.email}</p>
              <Link to="/" className={menuItem}><ExternalLink className="size-[18px] text-muted" />View store</Link>
              <button className={menuItem} onClick={() => { setDrawerOpen(false); setPwOpen(true) }}><KeyRound className="size-[18px] text-muted" />Change password</button>
              <button className={`${menuItem} text-wine`} onClick={signOut}><LogOut className="size-[18px]" />Sign out</button>
            </div>
          </div>
        </>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden overflow-y-auto border-r border-line bg-white pb-6 md:sticky md:top-0 md:block md:h-svh md:w-60 md:shrink-0">
        <div className="px-5 py-4"><h1 className="font-serif text-[22px]">Zylora Admin</h1></div>
        <AdminNav pathname={pathname} />
        <div className="px-5 pt-8 text-[13px]">
          <Link to="/" className="text-muted underline">View store</Link>
          <p className="mt-4 truncate text-muted">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btn} onClick={() => setPwOpen(true)}>Change password</button>
            <button className={btn} onClick={signOut}>Sign out</button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-28 sm:p-6 md:pb-6">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_TABS.map((t) => {
          const active = isActive({ label: t.label, to: t.to, match: t.match }, pathname)
          return (
            <Link
              key={t.to} to={t.to} aria-current={active ? 'page' : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-ink' : 'text-muted'}`}
            >
              <span className={`grid h-7 w-14 place-items-center rounded-full transition-colors ${active ? 'bg-sand' : ''}`}><t.icon className="size-5" /></span>
              {t.label}
            </Link>
          )
        })}
        <button onClick={() => setDrawerOpen(true)} className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted">
          <span className="grid h-7 w-14 place-items-center rounded-full"><Menu className="size-5" /></span>
          Menu
        </button>
      </nav>
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  )
}
