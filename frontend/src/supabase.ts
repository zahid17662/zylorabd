import type { ApiProduct } from './api'

/**
 * Read-only access to the public catalog straight from Supabase's REST API (PostgREST).
 * Row Level Security allows anon SELECT on active products only; the publishable key is public by design.
 * Writes, orders and auth still go through the FastAPI backend.
 */
const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** 'supabase' (default when configured) or 'api'. Flip VITE_PRODUCTS_SOURCE=api to go back to FastAPI. */
export const productsFromSupabase =
  Boolean(URL_ && KEY) && (import.meta.env.VITE_PRODUCTS_SOURCE as string | undefined) !== 'api'

type Row = {
  id: string
  title: string
  category: string
  description: string | null
  base_price: number | string
  discount_percent: number | string
  video_url: string | null
  images: string[] | null
  product_variants: { id: string; size: string; stock_quantity: number }[] | null
}

export async function fetchSupabaseProducts(): Promise<ApiProduct[]> {
  const select =
    'id,title,category,description,base_price,discount_percent,video_url,images,created_at,product_variants(id,size,stock_quantity)'
  const res = await fetch(
    `${URL_}/rest/v1/products?select=${encodeURIComponent(select)}&is_active=eq.true&order=created_at.desc&limit=100`,
    { headers: { apikey: KEY as string, Authorization: `Bearer ${KEY}` } },
  )
  if (!res.ok) throw new Error(`Supabase catalog request failed (${res.status})`)
  const rows = (await res.json()) as Row[]
  return rows.map((r) => {
    const base = Number(r.base_price)
    const pct = Number(r.discount_percent)
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      base_price: String(base),
      discount_percent: String(pct),
      final_price: (Math.round(base * (100 - pct)) / 100).toFixed(2),
      description: r.description ?? '',
      video_url: r.video_url,
      images: r.images ?? [],
      variants: (r.product_variants ?? []).map((v) => ({ id: v.id, size: v.size, stock_quantity: v.stock_quantity })),
    }
  })
}
