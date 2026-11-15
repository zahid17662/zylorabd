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

export type PasswordChange = { ok: true; tokens: Tokens } | { ok: false; message: string } | null

/** Email address inside an access token (the token is ours to read; GoTrue verified it already). */
function emailOf(accessToken: string): string | null {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { email?: string }
    return payload.email ?? null
  } catch {
    return null
  }
}

/**
 * Change the signed-in user's password straight in Supabase Auth: check the current password by signing in with it,
 * set the new one, sign every other device out, and hand back this session's fresh tokens.
 * Returns null when Supabase could not be used at all (nothing changed: the caller uses the API instead);
 * a wrong current password or a refused new password comes back as { ok: false, message }.
 */
export async function sbChangePassword(accessToken: string, current: string, next: string): Promise<PasswordChange> {
  if (!supabaseAuthEnabled) return null
  const email = emailOf(accessToken)
  if (!email) return null
  let signIn: Response
  try {
    signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY as string },
      body: JSON.stringify({ email, password: current }),
    })
  } catch {
    return null
  }
  if (signIn.status === 400) return { ok: false, message: 'Current password is incorrect' }
  if (!signIn.ok) return null
  const fresh = (await signIn.json()) as SbSession
  if (!fresh.access_token || !fresh.refresh_token) return null
  const auth = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY as string, Authorization: `Bearer ${fresh.access_token}` }
  let upd: Response
  try {
    upd = await fetch(`${SUPABASE_URL}/auth/v1/user`, { method: 'PUT', headers: auth, body: JSON.stringify({ password: next }) })
  } catch {
    return { ok: false, message: 'The connection dropped before the password was confirmed. Try signing in with the new password; if that fails, the old one still works.' }
  }
  if (!upd.ok) {
    const e = (await upd.json().catch(() => ({}))) as { msg?: string; message?: string; error_code?: string }
    if (e.error_code === 'same_password') return { ok: false, message: 'New password must be different from the current one' }
    if (upd.status >= 500) return null
    return { ok: false, message: e.msg ?? e.message ?? 'The new password was not accepted' }
  }
  await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=others`, { method: 'POST', headers: auth }).catch(() => undefined) // best effort
  return { ok: true, tokens: toTokens(fresh) }
}
