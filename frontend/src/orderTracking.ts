import { ApiError, api, tokens } from './api'
import { SUPABASE_KEY, SUPABASE_URL } from './supabase'
import { sbRefresh, supabaseAuthEnabled } from './supabaseAuth'

export type TrackedOrder = {
  order_number: string
  created_at: string
  order_status: 'pending' | 'awaiting_payment' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  payment_method: string
  payment_status: string
  delivery_zone: string
  subtotal: string
  shipping_fee: string
  total_amount: string
  recipient_name: string
  shipping_address: string | null // only for a signed-in customer's own orders
  items: { product_title: string; size: string; quantity: number; unit_price: string }[]
  events: { status: TrackedOrder['order_status']; at: string }[]
}

async function rpc<T>(fn: string, body: unknown, bearer: string): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY as string, Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: res.ok ? ((await res.json()) as T) : null }
}

/** The signed-in customer's own orders, newest first (Supabase function; the API list is the fallback). */
export async function fetchMyOrders(): Promise<TrackedOrder[]> {
  const t = tokens.get()
  if (!t) return []
  if (supabaseAuthEnabled && t.kind === 'sb') {
    try {
      let r = await rpc<TrackedOrder[]>('my_orders', {}, t.access_token)
      if (r.status === 401) {
        const fresh = await sbRefresh(t.refresh_token)
        if (fresh) {
          tokens.set(fresh)
          r = await rpc<TrackedOrder[]>('my_orders', {}, fresh.access_token)
        }
      }
      if (r.data) return r.data
    } catch {
      /* fall through to the API */
    }
  }
  // API sessions, or Supabase unavailable: the API list has no status history, so show the current step only.
  const rows = await api<(Omit<TrackedOrder, 'events'> & { items: TrackedOrder['items'] })[]>('/orders')
  return rows.map((o) => ({ ...o, events: [{ status: o.order_status, at: o.created_at }] }))
}

/** Look up one order by number + the phone number it was placed with. null = no such combination. */
export async function trackOrder(orderNumber: string, phone: string): Promise<TrackedOrder | null> {
  if (!supabaseAuthEnabled) throw new ApiError(503, 'Order tracking is not available right now. Please call us.')
  let r: { status: number; data: { found: boolean; order?: TrackedOrder } | null }
  try {
    r = await rpc('track_order', { p_order_number: orderNumber, p_phone: phone }, SUPABASE_KEY as string)
  } catch {
    throw new ApiError(503, 'Could not reach the server. Check your connection and try again.')
  }
  if (!r.data) throw new ApiError(r.status, 'Tracking is unavailable right now. Please try again in a moment.')
  return r.data.found && r.data.order ? r.data.order : null
}
