import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AdminLayout from './AdminLayout'

const user = { id: '1', name: 'Admin', email: 'admin@example.com', role: 'admin' }

function Probe() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route element={<AdminLayout user={user} signOut={() => {}} />}>
          <Route path="/admin/*" element={<p>page body</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const sidebar = () => screen.getByRole('navigation', { name: 'Admin sections' })

describe('AdminLayout sidebar', () => {
  it('opens the group for the current URL and marks the current page', () => {
    renderAt('/admin/inventory/products')
    const nav = within(sidebar())

    expect(nav.getByRole('button', { name: /Inventory/ })).toHaveAttribute('aria-expanded', 'true')
    expect(nav.getByRole('link', { name: 'Products' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Add Product' })).not.toHaveAttribute('aria-current')
    expect(nav.getByRole('button', { name: /Sales/ })).toHaveAttribute('aria-expanded', 'false')
    expect(nav.queryByRole('link', { name: 'Sales History' })).not.toBeInTheDocument()
  })

  it('expands and collapses a group by hand', () => {
    renderAt('/admin')
    const nav = within(sidebar())
    const sales = nav.getByRole('button', { name: /Sales/ })

    fireEvent.click(sales)
    expect(sales).toHaveAttribute('aria-expanded', 'true')
    expect(nav.getByRole('link', { name: 'Returns & Refunds' })).toHaveAttribute('href', '/admin/sales/returns')

    fireEvent.click(sales)
    expect(sales).toHaveAttribute('aria-expanded', 'false')
  })

  it('moves to the clicked page, opens its group and retitles the tab', () => {
    renderAt('/admin')
    fireEvent.click(within(sidebar()).getByRole('button', { name: /Preorders/ }))
    fireEvent.click(within(sidebar()).getByRole('link', { name: 'Online Preorders' }))

    expect(screen.getByTestId('where')).toHaveTextContent('/admin/preorders/online')
    expect(within(sidebar()).getByRole('link', { name: 'Online Preorders' })).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Preorders: Online Preorders - Zylora Admin')
    expect(screen.getByText('page body')).toBeInTheDocument()
  })

  it('lights only Dashboard on /admin', () => {
    renderAt('/admin')
    expect(within(sidebar()).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar()).getByRole('link', { name: 'Orders' })).not.toHaveAttribute('aria-current')
  })
})

describe('AdminLayout mobile drawer', () => {
  it('opens from the menu button, shows the account actions and closes on Escape', () => {
    renderAt('/admin')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const dialog = screen.getByRole('dialog', { name: 'Admin menu' })
    expect(within(dialog).getByRole('link', { name: 'POS' })).toBeInTheDocument()
    expect(within(dialog).getByText('admin@example.com')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes after choosing a page', () => {
    renderAt('/admin')
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Customers' }))

    expect(screen.getByTestId('where')).toHaveTextContent('/admin/customers')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
