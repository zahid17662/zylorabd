import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Product, Size } from "./data"

export type CartLine = { product: Product; size: Size; qty: number }

type CartCtx = {
  lines: CartLine[]
  open: boolean
  setOpen: (v: boolean) => void
  checkout: boolean
  setCheckout: (v: boolean) => void
  clear: () => void
  /** Product shown in the detail modal (gallery, video, size selector). */
  viewing: Product | null
  setViewing: (p: Product | null) => void
  add: (product: Product, size: Size) => void
  setQty: (id: string, size: Size, qty: number) => void
  remove: (id: string, size: Size) => void
  count: number
  subtotal: number
  wishlist: string[]
  toggleWish: (id: string) => void
}

const Ctx = createContext<CartCtx | null>(null)

export const unitPrice = (p: Product) => p.salePrice ?? p.price

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [open, setOpen] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [wishlist, setWishlist] = useState<string[]>([])
  const [viewing, setViewing] = useState<Product | null>(null)

  const value = useMemo<CartCtx>(() => {
    const max = (p: Product, s: Size) => p.stock[s] ?? 0
    return {
      lines,
      open,
      setOpen,
      checkout,
      setCheckout,
      clear: () => setLines([]),
      viewing,
      setViewing,
      add: (product, size) => {
        setLines((prev) => {
          const hit = prev.find(
            (l) => l.product.id === product.id && l.size === size,
          )
          if (hit)
            return prev.map((l) =>
              l === hit
                ? { ...l, qty: Math.min(l.qty + 1, max(product, size)) }
                : l,
            )
          return [...prev, { product, size, qty: 1 }]
        })
        setOpen(true)
      },
      setQty: (id, size, qty) =>
        setLines((prev) =>
          prev.map((l) =>
            l.product.id === id && l.size === size
              ? { ...l, qty: Math.max(1, Math.min(qty, max(l.product, size))) }
              : l,
          ),
        ),
      remove: (id, size) =>
        setLines((prev) =>
          prev.filter((l) => !(l.product.id === id && l.size === size)),
        ),
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((n, l) => n + l.qty * unitPrice(l.product), 0),
      wishlist,
      toggleWish: (id) => setWishlist((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id])),
    }
  }, [lines, open, checkout, wishlist, viewing])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart() {
  const c = useContext(Ctx)
  if (!c) throw new Error("useCart must be used inside CartProvider")
  return c
}
