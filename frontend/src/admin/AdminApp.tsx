import { Route, Routes } from 'react-router-dom'
import { AdminProtectedRoute } from './AdminProtectedRoute'
import AdminLayout from './AdminLayout'
import ComingSoon, { AdminNotFound } from './ComingSoon'
import Orders from './Orders'
import Overview from './Overview'
import ProductFormRoute from './ProductFormRoute'
import Products from './Products'

/**
 * Admin route table (mounted at /admin/*). Every menu item has its own URL; screens that are not built yet
 * show a "Coming soon" page so no link in the sidebar is dead.
 */
export default function AdminApp() {
  return (
    <AdminProtectedRoute>
      {(user, signOut) => (
        <Routes>
          {/* Brief hand-over frame while the guard moves a freshly signed-in admin off /admin/login. */}
          <Route path="login" element={<p className="p-10 text-muted">Loading…</p>} />
          <Route element={<AdminLayout user={user} signOut={signOut} />}>
            <Route index element={<Overview />} />
            <Route path="orders" element={<Orders />} />
            <Route path="pos" element={<ComingSoon title="POS" note="The point-of-sale screen for in-store sales." />} />

            <Route path="sales">
              <Route index element={<ComingSoon title="Sales overview" />} />
              <Route path="history" element={<ComingSoon title="Sales history" />} />
              <Route path="due" element={<ComingSoon title="Due" note="Sales with an unpaid balance." />} />
              <Route path="returns" element={<ComingSoon title="Returns & refunds" />} />
            </Route>

            <Route path="customers" element={<ComingSoon title="Customers" />} />

            <Route path="inventory">
              <Route index element={<ComingSoon title="Inventory dashboard" />} />
              <Route path="products" element={<Products />}>
                <Route path="new" element={<ProductFormRoute />} />
                <Route path=":id/edit" element={<ProductFormRoute />} />
              </Route>
              <Route path="categories" element={<ComingSoon title="Categories" />} />
              <Route path="online-categories" element={<ComingSoon title="Online categories" note="Choose which categories appear on the storefront." />} />
              <Route path="suppliers" element={<ComingSoon title="Suppliers" />} />
            </Route>

            <Route path="preorders">
              <Route index element={<ComingSoon title="Preorders dashboard" />} />
              <Route path="new" element={<ComingSoon title="Create preorder" />} />
              <Route path="products/new" element={<ComingSoon title="Add preorder product" />} />
              <Route path="online" element={<ComingSoon title="Online preorders" />} />
            </Route>

            <Route path="couriers" element={<ComingSoon title="Courier partners" note="Manage delivery partners and their rates." />} />
            <Route path="expenses" element={<ComingSoon title="Expenses" />} />
            <Route path="reports" element={<ComingSoon title="Reports" />} />

            <Route path="ecommerce">
              <Route path="home-page" element={<ComingSoon title="Home page settings" />} />
              <Route path="hero" element={<ComingSoon title="Hero settings" note="Banners and headline on the storefront home page." />} />
              <Route path="discounts" element={<ComingSoon title="Discount management" />} />
              <Route path="coupons" element={<ComingSoon title="Coupon management" />} />
              <Route path="product-status" element={<ComingSoon title="Product status" note="Choose which products are live on the storefront." />} />
              <Route path="delivery-charges" element={<ComingSoon title="Delivery charges" />} />
              <Route path="promo-modals" element={<ComingSoon title="Promotional modals" />} />
            </Route>

            <Route path="activity-log" element={<ComingSoon title="Activity log" note="Who changed what, and when." />} />
            <Route path="settings" element={<ComingSoon title="Settings" />} />

            <Route path="*" element={<AdminNotFound />} />
          </Route>
        </Routes>
      )}
    </AdminProtectedRoute>
  )
}
