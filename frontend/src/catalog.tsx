import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, toProduct, type ApiProduct } from './api'
import { FALLBACK_PRODUCTS, type Product } from './data'

/** Stale-while-revalidate catalog: always render something, refresh from the API in the background. */
type Ctx = {
  products: Product[]
  loading: boolean
  /** True while the live catalog has not been fetched yet (showing cached / sample data). */
  syncing: boolean
  reload: () => void
}

const CACHE_KEY = 'zylora.catalog_cache'
const RETRY_DELAYS_MS = [3000, 8000, 20000] as const

const C = createContext<Ctx>({ products: FALLBACK_PRODUCTS, loading: false, syncing: false, reload: () => {} })

function readCache(): Product[] | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Product[]) : null
  } catch {
    return null
  }
}

function writeCache(products: Product[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(products))
  } catch {
    /* storage unavailable or full: cache is best-effort */
  }
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => readCache() ?? FALLBACK_PRODUCTS)
  const [syncing, setSyncing] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const attempt = (n: number): void => {
      api<{ items: ApiProduct[] }>('/products?page_size=100')
        .then((r) => {
          if (!alive) return
          const live = r.items.map(toProduct)
          // Never replace a populated catalog with an empty one.
          if (live.length > 0) {
            setProducts(live)
            writeCache(live)
          }
          setSyncing(false)
        })
        .catch((e: unknown) => {
          if (!alive) return
          console.warn('[catalog] live sync failed, keeping cached products', e)
          const delay = RETRY_DELAYS_MS[n]
          if (delay === undefined) return setSyncing(false)
          timer = setTimeout(() => attempt(n + 1), delay)
        })
    }

    setSyncing(true)
    attempt(0)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  return <C.Provider value={{ products, loading: false, syncing, reload }}>{children}</C.Provider>
}

export const useCatalog = () => useContext(C)
