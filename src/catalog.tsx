import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, toProduct, type ApiProduct } from './api'
import type { Product } from './data'

type Ctx = { products: Product[]; loading: boolean; error: string | null; reload: () => void }
const C = createContext<Ctx>({ products: [], loading: true, error: null, reload: () => {} })

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api<{ items: ApiProduct[] }>('/products?page_size=100')
      .then((r) => {
        if (!alive) return
        setProducts(r.items.map(toProduct))
        setError(null)
      })
      .catch((e) => alive && setError(e.message || 'Could not load products'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [tick])

  return <C.Provider value={{ products, loading, error, reload: () => setTick((t) => t + 1) }}>{children}</C.Provider>
}

export const useCatalog = () => useContext(C)
