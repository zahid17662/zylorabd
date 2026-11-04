import { AuthProvider } from './auth'
import { CatalogProvider, useCatalog } from './catalog'
import { CartProvider } from './cart'
import { AuthModal } from './components/AuthModal'
import { CartDrawer } from './components/CartDrawer'
import { CheckoutModal } from './components/CheckoutModal'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { ProductModal } from './components/ProductModal'
import { Reviews } from './components/Reviews'
import { Collections, Creations, EditorialSplit, ProductSection, Services, Story } from './components/Sections'

function Shop() {
  const { products, loading, error, reload } = useCatalog()
  // The API returns newest first: the first four are "New Arrivals", the rest the Eid collection.
  const newArrivals = products.slice(0, 4)
  const eid = products.slice(4)

  return (
    <>
      <Header />
      <main>
        <Hero />
        <Creations />
        {error ? (
          <p className="px-4 py-24 text-center text-[15px]">
            We could not load the products. <button onClick={reload} className="underline">Try again</button>
          </p>
        ) : loading && products.length === 0 ? (
          <p className="px-4 py-24 text-center text-[15px] text-muted">Loading products…</p>
        ) : (
          <>
            <ProductSection id="new-arrivals" sub="Just in" title="New Arrivals" products={newArrivals} />
            <EditorialSplit />
            <ProductSection id="eid-collection" sub="Limited pieces" title="The Eid Collection" products={eid} />
          </>
        )}
        <Collections />
        <Story />
        <Services />
        <Reviews />
      </main>
      <Footer />
      <CartDrawer />
      <ProductModal />
      <CheckoutModal />
      <AuthModal />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <CatalogProvider>
        <CartProvider>
          <Shop />
        </CartProvider>
      </CatalogProvider>
    </AuthProvider>
  )
}
