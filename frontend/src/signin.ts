import { api, ApiError, tokens } from './api'
import { trySupabaseLogin } from './supabaseAuth'

export type Me = { id: string; name: string; email: string | null; phone: string | null; role: string }

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
      return await api<Me>('/auth/me')
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
  return api<Me>('/auth/me')
}
