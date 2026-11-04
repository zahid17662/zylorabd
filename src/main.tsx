import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import AdminApp from "./admin/AdminApp"
import ResultPage from "./ResultPage"
import "./index.css"

// /admin is the dashboard, /checkout/result is where payment gateways send the browser back,
// everything else is the storefront.
const path = location.pathname.replace(/\/+$/, "")
const page = path === "/admin" ? <AdminApp /> : path === "/checkout/result" ? <ResultPage /> : <App />

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode>{page}</React.StrictMode>)
