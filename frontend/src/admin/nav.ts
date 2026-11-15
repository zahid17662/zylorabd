import { Boxes, CalendarClock, ChartLine, LayoutDashboard, ReceiptText, ShoppingCart, Users, type LucideIcon } from 'lucide-react'

/** Single source of truth for the admin menu: the desktop sidebar, the mobile drawer and the page titles all read it. */
export interface NavLeaf {
  label: string
  to: string
  /** Extra rule for "is this item active?"; by default an item is active on its exact path. */
  match?: (pathname: string) => boolean
}
export interface NavLink extends NavLeaf {
  kind: 'link'
  icon: LucideIcon
}
export interface NavGroup {
  kind: 'group'
  id: string
  label: string
  icon: LucideIcon
  items: NavLeaf[]
}
export type NavEntry = NavLink | NavGroup

export const PRODUCTS_PATH = '/admin/inventory/products'

const trim = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname)

export const NAV: NavEntry[] = [
  { kind: 'link', label: 'Dashboard', to: '/admin', icon: LayoutDashboard },
  { kind: 'link', label: 'POS', to: '/admin/pos', icon: ShoppingCart },
  {
    kind: 'group', id: 'sales', label: 'Sales', icon: ChartLine,
    items: [
      { label: 'Overview', to: '/admin/sales' },
      { label: 'Sales History', to: '/admin/sales/history' },
      { label: 'Due', to: '/admin/sales/due' },
      { label: 'Returns & Refunds', to: '/admin/sales/returns' },
    ],
  },
  { kind: 'link', label: 'Customers', to: '/admin/customers', icon: Users },
  {
    kind: 'group', id: 'inventory', label: 'Inventory', icon: Boxes,
    items: [
      { label: 'Dashboard', to: '/admin/inventory' },
      // Edit pages live under /products/:id/edit and keep "Products" lit; /products/new belongs to "Add Product".
      { label: 'Products', to: PRODUCTS_PATH, match: (p) => p === PRODUCTS_PATH || (p.startsWith(`${PRODUCTS_PATH}/`) && p !== `${PRODUCTS_PATH}/new`) },
      { label: 'Add Product', to: `${PRODUCTS_PATH}/new` },
      { label: 'Categories', to: '/admin/inventory/categories' },
      { label: 'Online Categories', to: '/admin/inventory/online-categories' },
      { label: 'Suppliers', to: '/admin/inventory/suppliers' },
    ],
  },
  {
    kind: 'group', id: 'preorders', label: 'Preorders', icon: CalendarClock,
    items: [
      { label: 'Dashboard', to: '/admin/preorders' },
      { label: 'Create Preorder', to: '/admin/preorders/new' },
      { label: 'Add Product', to: '/admin/preorders/products/new' },
      { label: 'Online Preorders', to: '/admin/preorders/online' },
    ],
  },
  { kind: 'link', label: 'Orders', to: '/admin/orders', icon: ReceiptText },
]

/** The three screens kept on the mobile bottom bar; everything else is in the drawer. */
export const MOBILE_TABS: { label: string; to: string; icon: LucideIcon; match: (pathname: string) => boolean }[] = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, match: (p) => p === '/admin' },
  { label: 'Products', to: PRODUCTS_PATH, icon: Boxes, match: (p) => p.startsWith('/admin/inventory') },
  { label: 'Orders', to: '/admin/orders', icon: ReceiptText, match: (p) => p.startsWith('/admin/orders') },
]

export function isActive(item: NavLeaf, pathname: string): boolean {
  const p = trim(pathname)
  return item.match ? item.match(p) : p === item.to
}

export function activeGroupId(pathname: string): string | null {
  const group = NAV.find((e): e is NavGroup => e.kind === 'group' && e.items.some((i) => isActive(i, pathname)))
  return group?.id ?? null
}

/** Human title of the current admin page, for the browser tab. */
export function pageTitle(pathname: string): string {
  for (const entry of NAV) {
    if (entry.kind === 'link' && isActive(entry, pathname)) return entry.label
    if (entry.kind === 'group') {
      const hit = entry.items.find((i) => isActive(i, pathname))
      if (hit) return `${entry.label}: ${hit.label}`
    }
  }
  return 'Admin'
}
