import { api, ApiError, tokens } from './api'
import { SUPABASE_KEY, SUPABASE_URL } from './supabase'
import { sbRefresh, supabaseAuthEnabled, trySupabaseLogin } from './supabaseAuth'

export type Me = { id: string; name: string; email: string | null; phone: string | null; role: string }

async function profileRpc(token: string): Promise<{ status: number; data: Me | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY as string, Authorization: `Bearer ${token}` },
      body: '{}',
    })
    return { status: res.status, data: res.ok ? ((await res.json()) as Me) : null }
  } catch {
    return { status: 0, data: null }
  }
}

/**
 * The signed-in user's profile. A Supabase session asks the database (my_profile) and never needs the API server;
 * API-issued sessions, or Supabase being unreachable, use the API's /auth/me. The role is for what the page shows:
 * every admin function re-checks it in the database.
 */
export async function fetchMe(): Promise<Me> {
  const t = tokens.get()
  if (supabaseAuthEnabled && t?.kind === 'sb') {
    let r = await profileRpc(t.access_token)
    if (r.status === 401) {
      const fresh = await sbRefresh(t.refresh_token)
      if (fresh) {
        tokens.set(fresh)
        r = await profileRpc(fresh.access_token)
      }
    }
    if (r.data) return r.data
  }
  return api<Me>('/auth/me')
}

/**
 * Sign in and return the profile. Supabase Auth first (works even while the API server is asleep);
 * if that is unavailable, rejects the login, or the API does not accept its token, fall back to the
 * API's own login, which also gives the proper error messages.
 * `requireProfile`: when Supabase accepted the login but the API is unreachable, throw instead of
 * guessing the role (the admin area must never rely on a guessed role).
 */
export async function signIn(body: Record<string, unknown>, opts: { requireProfile?: boolean } = {}): Promise<Me> {
  const sb = await trySupabaseLogin(body)
  if (sb) {
    tokens.set(sb.tokens)
    try {
      return await fetchMe()
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        if (opts.requireProfile) throw e
        // Signed in; the profile loads on the next request once the API is awake.
        return { id: sb.user.id, name: sb.user.name, email: sb.user.email, phone: null, role: 'customer' }
      }
      tokens.set(null) // the API does not know this Supabase token yet: use its own login below
    }
  }
  tokens.set(await api('/auth/login', { body }))
  return fetchMe()
}
