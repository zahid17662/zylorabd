import { useCallback, useMemo } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { PRODUCTS_PATH } from './nav'
import { blankForm, ProductForm, toForm } from './ProductForm'
import type { Product } from './types'

/** What the Products screen hands to its child routes (new / edit). */
export interface ProductsOutletContext {
  list: Product[]
  loaded: boolean
  reload: () => void
}

/** /admin/inventory/products/new and /admin/inventory/products/:id/edit: the product form, as a page with its own URL. */
export default function ProductFormRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { list, loaded, reload } = useOutletContext<ProductsOutletContext>()

  const product = id ? list.find((p) => p.id === id) : undefined
  const initial = useMemo(() => (id ? (product ? toForm(product) : null) : blankForm()), [id, product])
  const close = useCallback(() => navigate(PRODUCTS_PATH), [navigate])
  const saved = useCallback(() => {
    reload()
    navigate(PRODUCTS_PATH)
  }, [navigate, reload])

  if (initial) return <ProductForm key={id ?? 'new'} initial={initial} onClose={close} onSaved={saved} />
  if (!loaded) return <p role="status" className="py-6 text-[13px] text-muted">Loading product…</p>
  return (
    <p role="alert" className="py-6 text-[13px] text-wine">
      That product was not found. <Link to={PRODUCTS_PATH} className="underline">Back to products</Link>
    </p>
  )
}
