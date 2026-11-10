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
  const { products, syncing } = useCatalog()
  // The API returns newest first: the first four are "New Arrivals", the rest the Eid collection.
  const newArrivals = products.slice(0, 4)
  const eid = products.slice(4)

  return (
    <>
      <Header />
      <main className="pt-[60px] md:pt-0">
        <Hero />
        <p className="border-b border-line py-3 text-center text-[13px] text-muted md:hidden">Delivery: Inside Dhaka ৳70 · Outside Dhaka ৳130</p>
        <Creations />
        <ProductSection id="new-arrivals" sub="Just in" title="New Arrivals" products={newArrivals} />
        <EditorialSplit />
        <ProductSection id="eid-collection" sub="Limited pieces" title="The Eid Collection" products={eid} />
        <Collections />
        <Story />
        <Services />
        <Reviews />
      </main>
      <Footer />
      {syncing && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-4 z-40 bg-black/80 px-3 py-1.5 text-[12px] text-white">
          Syncing latest stock…
        </div>
      )}
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
