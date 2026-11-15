import { ApiError, api, tokens } from './api'
import { SUPABASE_KEY, SUPABASE_URL } from './supabase'
import { sbRefresh, supabaseAuthEnabled } from './supabaseAuth'

/**
 * Admin panel calls. With a Supabase session they go straight to Postgres functions (admin_* over Supabase RPC),
 * so the dashboard works while the API server is asleep. Each function refuses anyone who is not a
 * password-signed-in admin. Everything else (R2 upload links, change-password, sessions that came from the
 * API, or VITE_ADMIN_SOURCE=api) keeps using the same /admin/* API endpoints with the same request shapes.
 *
 * Reads fall back to the API on any failure. Writes fall back only when the function certainly did not run
 * (no Supabase session, function missing, expired login). After a lost connection a write is NOT retried and NOT
 * sent to the API, because it may already have been applied; the screen reloads and shows the truth.
 */
const viaSupabase = supabaseAuthEnabled && (import.meta.env.VITE_ADMIN_SOURCE as string | undefined) !== 'api'

type Init = { method?: string; body?: unknown }
type Call = { fn: string; args: Record<string, unknown>; write: boolean }
type PgError = { code?: string; message?: string }

const ORDER_FILTERS = [
  'q', 'order_status', 'payment_method', 'payment_status', 'login_method', 'order_source', 'payment_provider',
  'date_from', 'date_to',
]

/** Maps an /admin/* request onto the matching Postgres function, or null when there is none. */
function toCall(path: string, init: Init): Call | null {
  const [p, qs = ''] = path.split('?')
  const method = (init.method ?? (init.body ? 'POST' : 'GET')).toUpperCase()
  const seg = p.replace(/^\/+/, '').split('/') // ['admin', 'products', id, 'stock']
  if (seg[0] !== 'admin') return null
  const id = seg[2]

  if (seg[1] === 'products') {
    if (seg.length === 2 && method === 'GET') return { fn: 'admin_list_products', args: {}, write: false }
    if (seg.length === 2 && method === 'POST') return { fn: 'admin_save_product', args: { p_id: null, p_data: init.body }, write: true }
    if (seg.length === 3 && (method === 'PUT' || method === 'PATCH')) return { fn: 'admin_save_product', args: { p_id: id, p_data: init.body }, write: true }
    if (seg.length === 3 && method === 'DELETE') return { fn: 'admin_delete_product', args: { p_id: id }, write: true }
    if (seg.length === 4 && seg[3] === 'stock' && method === 'PATCH') return { fn: 'admin_update_stock', args: { p_product_id: id, p_items: init.body }, write: true }
  }
  if (seg[1] === 'orders') {
    if (seg.length === 2 && method === 'GET') {
      const q = new URLSearchParams(qs)
      const filters: Record<string, string> = {}
      for (const k of ORDER_FILTERS) if (q.get(k)) filters[k] = q.get(k) as string
      return {
        fn: 'admin_list_orders',
        args: { p_filters: filters, p_page: Number(q.get('page') ?? 1), p_page_size: Number(q.get('page_size') ?? 25) },
        write: false,
      }
    }
    if (seg.length === 3 && method === 'GET') return { fn: 'admin_get_order', args: { p_id: id }, write: false }
    if (seg.length === 4 && seg[3] === 'status' && method === 'PATCH') {
      return { fn: 'admin_set_order_status', args: { p_order_id: id, p_status: (init.body as { status?: string } | undefined)?.status }, write: true }
    }
  }
  if (seg[1] === 'stats' && seg.length === 2 && method === 'GET') return { fn: 'admin_stats', args: {}, write: false }
  return null
}

const FALLBACK = Symbol('fallback')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function rpc<T>(call: Call): Promise<T | typeof FALLBACK> {
  let refreshed = false
  const attempts = call.write ? 1 : 3
  for (let n = 0; n < attempts; n++) {
    const t = tokens.get()
    if (t?.kind !== 'sb') return FALLBACK // signed in through the API: it has no Supabase session
    let res: Response
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${call.fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY as string, Authorization: `Bearer ${t.access_token}` },
        body: JSON.stringify(call.args),
      })
    } catch {
      if (call.write) throw new Error('The connection dropped before the change was confirmed. Refresh to see whether it was saved, then try again if not.')
      await sleep(500 * (n + 1))
      continue
    }
    if (res.ok) return (await res.json()) as T
    const e = (await res.json().catch(() => ({}))) as PgError
    if (res.status === 401 && !refreshed) {
      refreshed = true // expired access token: the function did not run, so refreshing and retrying is safe
      const fresh = await sbRefresh(t.refresh_token)
      if (!fresh) return FALLBACK
      tokens.set(fresh)
      n--
      continue
    }
    if (res.status === 401 || res.status === 404 || e.code === 'PGRST202') return FALLBACK // not signed in / function missing
    if (res.status >= 500) {
      if (call.write) throw new ApiError(res.status, 'The server could not confirm the change. Refresh to see whether it was saved, then try again if not.')
      await sleep(500 * (n + 1))
      continue
    }
    if (res.status === 403) throw new ApiError(403, 'Admin access required. Sign in with your admin email and password.')
    throw new ApiError(res.status, e.message ?? `Request failed (${res.status})`)
  }
  return FALLBACK // reads only: every attempt failed
}

export async function adminApi<T>(path: string, init: Init = {}): Promise<T> {
  const call = viaSupabase ? toCall(path, init) : null
  if (call) {
    const r = await rpc<T>(call)
    if (r !== FALLBACK) return r
  }
  return api<T>(path, init)
}
