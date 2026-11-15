import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import App from './App'
import ResultPage from './ResultPage'
import TrackPage from './TrackPage'

// The dashboard is its own chunk, so storefront visitors never download admin code.
const AdminApp = lazy(() => import('./admin/AdminApp'))

/**
 * Top-level route table.
 *   /admin/*          dashboard (lazy chunk, guarded; /admin/login is its sign-in form)
 *   /checkout/result  where payment gateways send the browser back
 *   /track            customer order tracking
 *   everything else   the storefront (/, /product/:id, /category/:name, and its own 404)
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<p style={{ padding: 40 }}>Loading…</p>}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="/checkout/result" element={<ResultPage />} />
      <Route path="/track" element={<TrackPage />} />
      <Route path="/*" element={<App />} />
    </Routes>
  )
}
