import { Link, useParams } from 'react-router-dom'
import { useCatalog } from './catalog'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { ProductCard } from './components/ProductCard'
import { useDocumentTitle } from './useDocumentTitle'

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** /category/:name lists every product whose category label matches (case-insensitive). */
export default function CategoryPage() {
  const { name = '' } = useParams()
  const { products } = useCatalog()
  const items = products.filter((p) => same(p.category, name))
  useDocumentTitle(`${name} - Zylora`)

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1400px] px-4 pt-[76px] pb-16 md:pt-10">
        <h1 className="font-serif text-[32px]">{name}</h1>
        {items.length === 0 ? (
          <p className="mt-6 text-[14px] text-muted">
            No products in this category yet. <Link to="/" className="underline">Back to the shop</Link>
          </p>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
            {items.map((p) => <ProductCard key={p.id} product={p} />)}
          </ul>
        )}
      </main>
      <Footer />
    </>
  )
}
