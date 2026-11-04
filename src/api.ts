import { SIZES, type Product, type Size } from './data'

export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
const BASE = `${API}/api/v1`

type Tokens = { access_token: string; refresh_token: string }
const KEY = 'zylora.tokens'

export const tokens = {
  get(): Tokens | null {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? 'null')
    } catch {
      return null
    }
  },
  set(t: Tokens | null) {
    try {
      if (t) localStorage.setItem(KEY, JSON.stringify(t))
      else localStorage.removeItem(KEY)
    } catch {
      /* storage unavailable */
    }
  },
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === 'string' ? detail : ((detail as { message?: string })?.message ?? `Request failed (${status})`))
  }
}

let refreshing: Promise<boolean> | null = null
function refresh(): Promise<boolean> {
  const t = tokens.get()
  if (!t) return Promise.resolve(false)
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: t.refresh_token }),
  })
    .then(async (r) => {
      if (!r.ok) {
        tokens.set(null)
        return false
      }
      tokens.set(await r.json())
      return true
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const t = tokens.get()
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t.access_token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 401 && t && retry && (await refresh())) return api<T>(path, init, false)
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const d = data?.detail
    throw new ApiError(res.status, Array.isArray(d) ? d.map((x: { msg: string }) => x.msg).join(', ') : d)
  }
  return data as T
}

/* ---------- types & mappers ---------- */
type ApiVariant = { id: string; size: string; stock_quantity: number }
export type ApiProduct = {
  id: string
  title: string
  category: string
  base_price: string
  discount_percent: string
  final_price: string
  description?: string
  video_url?: string | null
  images: string[]
  variants: ApiVariant[]
}

export function toProduct(p: ApiProduct): Product {
  const stock: Product['stock'] = {}
  const variantIds: Product['variantIds'] = {}
  for (const v of p.variants) {
    if (!(SIZES as readonly string[]).includes(v.size)) continue
    stock[v.size as Size] = v.stock_quantity
    variantIds[v.size as Size] = v.id
  }
  const onSale = Number(p.discount_percent) > 0
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    price: Number(p.base_price),
    salePrice: onSale ? Number(p.final_price) : undefined,
    image: p.images[0] ?? '',
    stock,
    variantIds,
    description: p.description ?? '',
    images: p.images,
    video: p.video_url || undefined,
  }
}

export type OrderResult = {
  order: { order_number: string; subtotal: string; shipping_fee: string; total_amount: string; payment_method: string }
  payment_url: string | null
}

/** UTM / referrer captured on first landing so the admin can see where an order came from. */
export function captureAttribution() {
  try {
    const saved = sessionStorage.getItem('zylora.attr')
    if (saved) return JSON.parse(saved)
    const q = new URLSearchParams(location.search)
    const attr = {
      utm_source: q.get('utm_source') ?? undefined,
      utm_medium: q.get('utm_medium') ?? undefined,
      utm_campaign: q.get('utm_campaign') ?? undefined,
      referrer: document.referrer || undefined,
    }
    sessionStorage.setItem('zylora.attr', JSON.stringify(attr))
    return attr
  } catch {
    return undefined
  }
}
