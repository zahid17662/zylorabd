import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CartProvider, useCart } from './cart'
import type { Product } from './data'

const kurti: Product = {
  id: 'p1', title: 'Kurti', category: 'Kurti', price: 1200, image: '', stock: { M: 3 }, variantIds: {}, description: '', images: [],
}

vi.mock('./catalog', () => ({ useCatalog: () => ({ products: [kurti], loading: false, syncing: false, reload: () => {} }) }))

function Consumer() {
  const { viewing, setViewing } = useCart()
  const { pathname } = useLocation()
  return (
    <>
      <p data-testid="where">{pathname}</p>
      <p data-testid="viewing">{viewing?.title ?? 'none'}</p>
      <button onClick={() => setViewing(kurti)}>open</button>
      <button onClick={() => setViewing(null)}>close</button>
    </>
  )
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CartProvider>
        <Consumer />
      </CartProvider>
    </MemoryRouter>,
  )

describe('product modal URL', () => {
  it('opens at /product/:id and closes back to where the shopper was', () => {
    renderAt('/category/Kurti')
    expect(screen.getByTestId('viewing')).toHaveTextContent('none')

    fireEvent.click(screen.getByText('open'))
    expect(screen.getByTestId('where')).toHaveTextContent('/product/p1')
    expect(screen.getByTestId('viewing')).toHaveTextContent('Kurti')

    fireEvent.click(screen.getByText('close'))
    expect(screen.getByTestId('where')).toHaveTextContent('/category/Kurti')
    expect(screen.getByTestId('viewing')).toHaveTextContent('none')
  })

  it('shows the product for a shared /product/:id link and closes to the home page', () => {
    renderAt('/product/p1')
    expect(screen.getByTestId('viewing')).toHaveTextContent('Kurti')

    fireEvent.click(screen.getByText('close'))
    expect(screen.getByTestId('where')).toHaveTextContent('/')
    expect(screen.getByTestId('viewing')).toHaveTextContent('none')
  })

  it('shows nothing for an unknown product id', () => {
    renderAt('/product/does-not-exist')
    expect(screen.getByTestId('viewing')).toHaveTextContent('none')
  })
})
