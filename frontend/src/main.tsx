import React, { lazy, Suspense } from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import ResultPage from "./ResultPage"
import "./index.css"

// The dashboard is its own chunk, so storefront visitors never download admin code.
const AdminApp = lazy(() => import("./admin/AdminApp"))

// /admin (and /admin/login) is the dashboard, /checkout/result is where payment gateways send the browser back,
// everything else is the storefront.
const path = location.pathname.replace(/\/+$/, "")
const page =
  path === "/admin" || path === "/admin/login" ? (
    <Suspense fallback={<p style={{ padding: 40 }}>Loading…</p>}>
      <AdminApp />
    </Suspense>
  ) : path === "/checkout/result" ? (
    <ResultPage />
  ) : (
    <App />
  )

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode>{page}</React.StrictMode>)
