import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError, tokens } from '../api'
import { inp } from './ui'
import type { User } from './types'

const LOGIN_PATH = '/admin/login'
const HOME_PATH = '/admin'
const goTo = (path: string) => location.pathname !== path && history.replaceState(null, '', path)

function Login({ onDone, denied, notice }: { onDone: (u: User) => void; denied: boolean; notice?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(denied ? 'This account is not an admin.' : (notice ?? ''))
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
      <form onSubmit={submit} className="w-full max-w-[380px] space-y-3 rounded-lg bg-white p-8">
        <h1 className="font-serif text-[28px]">Admin sign in</h1>
        <input className={inp} aria-label="Email" type="email" autoComplete="username" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inp} aria-label="Password" type="password" autoComplete="current-password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p role="alert" className="text-[13px] text-wine">{err}</p>}
        <button disabled={busy} className="w-full rounded-full bg-ink py-3 text-[14px] text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

/**
 * Renders the dashboard only for a signed-in ADMIN; everyone else lands on /admin/login.
 * The role comes from the API (/auth/me), never from the browser, and every admin endpoint
 * independently enforces it again on the server.
 */
export function AdminProtectedRoute({ children }: { children: (user: User, signOut: () => void) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(!!tokens.get())
  const [denied, setDenied] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!tokens.get()) return
    api<User>('/auth/me')
      .then((u) => (setUser(u), setDenied(u.role !== 'admin')))
      .catch((e: unknown) => {
        setUser(null)
        // 401 = expired session (just show the login form); anything else is a real problem worth showing
        if (!(e instanceof ApiError && e.status === 401)) setLoadError(e instanceof Error ? e.message : 'Could not reach the server')
      })
      .finally(() => setChecking(false))
  }, [])

  const isAdmin = user?.role === 'admin'
  useEffect(() => {
    if (!checking) goTo(isAdmin ? HOME_PATH : LOGIN_PATH)
  }, [checking, isAdmin])

  if (checking) return <p className="p-10 text-muted">Loading…</p>
  if (!user || !isAdmin) return <Login denied={denied} notice={loadError} onDone={(u) => (setDenied(false), setUser(u))} />
  return (
    <>
      {children(user, () => {
        tokens.set(null)
        setUser(null)
      })}
    </>
  )
}
