import type { Tokens } from './api'
import { SUPABASE_KEY, SUPABASE_URL } from './supabase'

/**
 * Sign in through Supabase Auth (no dependency on the API server waking up).
 * Enabled when the Supabase URL/key are set; set VITE_AUTH_SOURCE=api to use only our own API.
 * Every helper returns null on ANY failure so callers can fall back to the API login, which also
 * produces the proper error messages (wrong password, admin rules, ...).
 */
export const supabaseAuthEnabled =
  Boolean(SUPABASE_URL && SUPABASE_KEY) && (import.meta.env.VITE_AUTH_SOURCE as string | undefined) !== 'api'

type SbSession = {
  access_token: string
  refresh_token: string
  user?: { id: string; email?: string; user_metadata?: { name?: string; full_name?: string } }
}

async function call(path: string, body: unknown, query = ''): Promise<SbSession | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY as string },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    if (!res.ok) return null
    const s = (await res.json()) as SbSession
    return s.access_token && s.refresh_token ? s : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const toTokens = (s: SbSession): Tokens => ({ access_token: s.access_token, refresh_token: s.refresh_token, kind: 'sb' })

export type SbLogin = { tokens: Tokens; user: { id: string; name: string; email: string | null } }

/** Email+password or Google ID-token sign-in; null for any other method or on any failure. */
export async function trySupabaseLogin(body: Record<string, unknown>): Promise<SbLogin | null> {
  if (!supabaseAuthEnabled) return null
  let s: SbSession | null = null
  if (body.method === 'email' && typeof body.email === 'string' && typeof body.password === 'string') {
    s = await call('token', { email: body.email.trim().toLowerCase(), password: body.password }, '?grant_type=password')
  } else if (body.method === 'google' && typeof body.google_id_token === 'string') {
    s = await call('token', { provider: 'google', id_token: body.google_id_token }, '?grant_type=id_token')
  }
  if (!s) return null
  const email = s.user?.email ?? null
  return {
    tokens: toTokens(s),
    user: { id: s.user?.id ?? '', name: s.user?.user_metadata?.name ?? s.user?.user_metadata?.full_name ?? email?.split('@')[0] ?? 'Customer', email },
  }
}

export async function sbRefresh(refreshToken: string): Promise<Tokens | null> {
  const s = await call('token', { refresh_token: refreshToken }, '?grant_type=refresh_token')
  return s ? toTokens(s) : null
}

export function sbLogout(accessToken: string): void {
  if (!supabaseAuthEnabled) return
  void fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY as string, Authorization: `Bearer ${accessToken}` },
  }).catch(() => {})
}
