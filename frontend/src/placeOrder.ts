import { ApiError, api, tokens, type OrderResult } from './api'
import { SUPABASE_KEY, SUPABASE_URL } from './supabase'
import { sbRefresh, supabaseAuthEnabled } from './supabaseAuth'

/**
 * Cash-on-delivery checkout straight through Supabase (Postgres function `place_order`): no API server in
 * the path, so it works while the API is asleep. Used only for COD with a Supabase session; everything else
 * (online payments, phone/Facebook sign-ins) keeps using POST /orders/checkout.
 * Set VITE_ORDERS_SOURCE=api to always use the API.
 *
 * Retries reuse one idempotency key, so a lost response can never create a second order or take stock twice.
 * After an AMBIGUOUS failure (network, 5xx) it never falls back to the API for the same reason.
 */
const viaSupabase = supabaseAuthEnabled && (import.meta.env.VITE_ORDERS_SOURCE as string | undefined) !== 'api'

export type CheckoutBody = {
  items: { variant_id: string; quantity: number }[]
  shipping: { recipient_name: string; phone: string; address: string; zone: string }
  payment_method: 'cod' | 'online'
  online_provider?: string
  attribution?: unknown
}

let attempt: { sig: string; key: string } | null = null
function keyFor(body: CheckoutBody): string {
  const sig = JSON.stringify([body.items, body.shipping])
  if (!attempt || attempt.sig !== sig) attempt = { sig, key: crypto.randomUUID() }
  return attempt.key
}

const FALLBACK = Symbol('fallback')

type PgError = { code?: string; message?: string; details?: string | null }

function toError(status: number, e: PgError): ApiError | typeof FALLBACK {
  switch (e.message) {
    case 'out_of_stock': {
      let problems: string[] = []
      try {
        problems = JSON.parse(e.details ?? '[]') as string[]
      } catch {
        /* keep empty */
      }
      return new ApiError(400, { message: 'Out of stock', problems })
    }
    case 'items_missing':
      return new ApiError(404, 'One or more items no longer exist')
    case 'invalid_phone':
      return new ApiError(422, 'Enter a valid Bangladeshi mobile number')
    case 'invalid_request':
      return new ApiError(422, 'Please check your delivery details and cart, then try again')
    case 'email_unverified':
      return new ApiError(403, 'Please verify your email address before ordering')
    case 'account_conflict':
      return new ApiError(409, 'This email belongs to another account. Please sign in with that account')
    case 'online_not_supported':
    case 'not_authenticated':
      return FALLBACK // the function refused before doing anything: use the API checkout
    default:
      // unknown function (404) / bad token (401, 403): the function did not run
      return status === 400 && e.code === 'P0001' ? new ApiError(400, e.message ?? 'Could not place the order') : FALLBACK
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function rpc(body: CheckoutBody, key: string): Promise<OrderResult | typeof FALLBACK> {
  let refreshed = false
  for (let n = 0; n < 3; n++) {
    const t = tokens.get()
    if (t?.kind !== 'sb') return FALLBACK
    let res: Response
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/place_order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY as string, Authorization: `Bearer ${t.access_token}` },
        body: JSON.stringify({
          p_items: body.items,
          p_shipping: body.shipping,
          p_payment_method: 'cod',
          p_idempotency_key: key,
          p_attribution: body.attribution ?? null,
        }),
      })
    } catch {
      await sleep(700 * (n + 1)) // ambiguous: ask again with the SAME key
      continue
    }
    if (res.ok) return (await res.json()) as OrderResult
    if (res.status >= 500) {
      await sleep(700 * (n + 1))
      continue
    }
    if (res.status === 401 && !refreshed) {
      // Expired access token: the function did not run, so refreshing and retrying is safe.
      refreshed = true
      const fresh = await sbRefresh(t.refresh_token)
      if (!fresh) return FALLBACK
      tokens.set(fresh)
      n--
      continue
    }
    const e = (await res.json().catch(() => ({}))) as PgError
    const outcome = toError(res.status, e)
    if (outcome === FALLBACK) return FALLBACK
    throw outcome
  }
  throw new Error('Could not confirm your order because the connection dropped. Please check "My orders" or try again; you will not be charged twice.')
}

export async function placeOrder(body: CheckoutBody): Promise<OrderResult> {
  if (viaSupabase && body.payment_method === 'cod' && tokens.get()?.kind === 'sb') {
    const r = await rpc(body, keyFor(body))
    if (r !== FALLBACK) {
      attempt = null
      return r
    }
  }
  return api<OrderResult>('/orders/checkout', { body })
}
