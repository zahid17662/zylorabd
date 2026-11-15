import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

describe('test setup', () => {
  it('renders a route with react-router in jsdom', () => {
    render(
      <MemoryRouter initialEntries={['/admin/inventory']}>
        <Routes>
          <Route path="/admin/inventory" element={<h1>Inventory</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument()
  })
})
