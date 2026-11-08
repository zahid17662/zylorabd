import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, tokens } from './api'

export type User = { id: string; name: string; email: string | null; phone: string | null; role: string }
type Ctx = {
  user: User | null
  modal: boolean
  openLogin: () => void
  closeLogin: () => void
  login: (body: Record<string, unknown>) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
const C = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [modal, setModal] = useState(false)

  const loadMe = useCallback(async () => setUser(await api<User>('/auth/me')), [])
  useEffect(() => {
    if (tokens.get()) loadMe().catch(() => setUser(null))
  }, [loadMe])

  const finish = async (t: { access_token: string; refresh_token: string }) => {
    tokens.set(t)
    await loadMe()
    setModal(false)
  }

  return (
    <C.Provider
      value={{
        user,
        modal,
        openLogin: () => setModal(true),
        closeLogin: () => setModal(false),
        login: async (body) => finish(await api('/auth/login', { body })),
        register: async (name, email, password) => finish(await api('/auth/register', { body: { name, email, password } })),
        logout: async () => {
          const t = tokens.get()
          tokens.set(null)
          setUser(null)
          if (t) await api('/auth/logout', { body: { refresh_token: t.refresh_token } }).catch(() => {})
        },
      }}
    >
      {children}
    </C.Provider>
  )
}

export function useAuth() {
  const c = useContext(C)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}
