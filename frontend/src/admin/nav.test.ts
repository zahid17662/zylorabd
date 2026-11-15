import { describe, expect, it } from 'vitest'
import { activeGroupId, isActive, MOBILE_TABS, NAV, pageTitle, PRODUCTS_PATH, type NavGroup } from './nav'

const groups = NAV.filter((e): e is NavGroup => e.kind === 'group')
const leaf = (groupId: string, label: string) => {
  const hit = groups.find((g) => g.id === groupId)?.items.find((i) => i.label === label)
  if (!hit) throw new Error(`missing ${groupId}/${label}`)
  return hit
}

const EXPECTED_URLS = [
  '/admin', '/admin/pos', '/admin/customers', '/admin/orders',
  '/admin/sales', '/admin/sales/history', '/admin/sales/due', '/admin/sales/returns',
  '/admin/inventory', '/admin/inventory/products', '/admin/inventory/products/new', '/admin/inventory/categories',
  '/admin/inventory/online-categories', '/admin/inventory/suppliers',
  '/admin/preorders', '/admin/preorders/new', '/admin/preorders/products/new', '/admin/preorders/online',
]

const urls = NAV.flatMap((e) => (e.kind === 'link' ? [e.to] : e.items.map((i) => i.to)))

describe('admin menu', () => {
  it('has an entry for every requested URL, each exactly once', () => {
    expect([...urls].sort()).toEqual([...EXPECTED_URLS].sort())
  })

  it('keeps every URL under /admin', () => {
    expect(urls.every((u) => u === '/admin' || u.startsWith('/admin/'))).toBe(true)
  })

  it('has the three groups with the requested items', () => {
    expect(groups.map((g) => [g.label, g.items.map((i) => i.label)])).toEqual([
      ['Sales', ['Overview', 'Sales History', 'Due', 'Returns & Refunds']],
      ['Inventory', ['Dashboard', 'Products', 'Add Product', 'Categories', 'Online Categories', 'Suppliers']],
      ['Preorders', ['Dashboard', 'Create Preorder', 'Add Product', 'Online Preorders']],
    ])
  })
})

describe('isActive', () => {
  it('matches the exact path and ignores a trailing slash', () => {
    expect(isActive(leaf('sales', 'Due'), '/admin/sales/due')).toBe(true)
    expect(isActive(leaf('sales', 'Due'), '/admin/sales/due/')).toBe(true)
    expect(isActive(leaf('sales', 'Due'), '/admin/sales')).toBe(false)
  })

  it('keeps Products lit on an edit page but gives /new to Add Product', () => {
    const products = leaf('inventory', 'Products')
    const add = leaf('inventory', 'Add Product')
    expect(isActive(products, `${PRODUCTS_PATH}/abc/edit`)).toBe(true)
    expect(isActive(products, `${PRODUCTS_PATH}/new`)).toBe(false)
    expect(isActive(add, `${PRODUCTS_PATH}/new`)).toBe(true)
  })

  it('does not light the inventory dashboard on a deeper page', () => {
    expect(isActive(leaf('inventory', 'Dashboard'), PRODUCTS_PATH)).toBe(false)
  })
})

describe('activeGroupId and pageTitle', () => {
  it('finds the group that owns the URL', () => {
    expect(activeGroupId('/admin/preorders/online')).toBe('preorders')
    expect(activeGroupId(`${PRODUCTS_PATH}/abc/edit`)).toBe('inventory')
    expect(activeGroupId('/admin')).toBeNull()
  })

  it('names the page for the browser tab', () => {
    expect(pageTitle('/admin')).toBe('Dashboard')
    expect(pageTitle('/admin/sales/returns')).toBe('Sales: Returns & Refunds')
    expect(pageTitle('/admin/does-not-exist')).toBe('Admin')
  })
})

describe('mobile tabs', () => {
  it('point at real menu URLs', () => {
    expect(MOBILE_TABS.every((t) => urls.includes(t.to))).toBe(true)
  })
})
