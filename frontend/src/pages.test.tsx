import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import NotFound from './NotFound'
import { useDocumentTitle } from './useDocumentTitle'

function Titled({ title }: { title: string }) {
  useDocumentTitle(title)
  return null
}

describe('NotFound', () => {
  it('explains the page is missing and links back to the shop', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the shop' })).toHaveAttribute('href', '/')
    expect(document.title).toBe('Page not found - Zylora')
  })
})

describe('useDocumentTitle', () => {
  it('sets the title while mounted and restores the previous one after', () => {
    document.title = 'Before'
    const { unmount } = render(<Titled title="During" />)
    expect(document.title).toBe('During')
    unmount()
    expect(document.title).toBe('Before')
  })
})
