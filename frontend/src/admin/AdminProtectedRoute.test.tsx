import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminProtectedRoute, safeAdminReturn } from './AdminProtectedRoute'

const adminUser = { id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'admin' }
const signInMock = vi.hoisted(() => vi.fn())

vi.mock('../signin', () => ({
  fetchMe: vi.fn(),
  signIn: signInMock,
}))

function Probe() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route
          path="/admin/*"
          element={<AdminProtectedRoute>{(user) => <p>Dashboard for {user.email}</p>}</AdminProtectedRoute>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('safeAdminReturn', () => {
  it.each([
    ['/admin/inventory/products', '/admin/inventory/products'],
    ['/admin/orders?page=2', '/admin/orders?page=2'],
    ['/admin', '/admin'],
  ])('keeps the admin path %s', (input, expected) => {
    expect(safeAdminReturn(input)).toBe(expected)
  })

  it.each([
    ['https://evil.example/admin'],
    ['//evil.example'],
    ['/account'],
    ['/administrator'],
    ['/admin/login'],
    ['/admin/login/'],
    [undefined],
    [42],
  ])('falls back to /admin for %s', (input) => {
    expect(safeAdminReturn(input)).toBe('/admin')
  })
})

describe('AdminProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear()
    signInMock.mockReset()
  })

  it('sends a signed-out visitor to the login page', async () => {
    renderAt('/admin/inventory/products')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/admin/login'))
    expect(screen.getByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument()
  })

  it('returns to the requested page after signing in', async () => {
    signInMock.mockResolvedValue(adminUser)
    renderAt('/admin/inventory/products')
    await screen.findByRole('heading', { name: 'Admin sign in' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-a-real-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Dashboard for admin@example.com')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/admin/inventory/products'))
  })

  it('refuses an account that is not an admin', async () => {
    signInMock.mockResolvedValue({ ...adminUser, role: 'customer' })
    renderAt('/admin')
    await screen.findByRole('heading', { name: 'Admin sign in' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'shopper@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-a-real-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This account is not an admin.')
    expect(screen.queryByText(/Dashboard for/)).not.toBeInTheDocument()
  })
})
