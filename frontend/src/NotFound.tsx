import { Link } from 'react-router-dom'
import { useDocumentTitle } from './useDocumentTitle'

/** Shown for any URL that no route matches. */
export default function NotFound() {
  useDocumentTitle('Page not found - Zylora')
  return (
    <main className="grid min-h-svh place-items-center bg-cream px-4">
      <div className="w-full max-w-[460px] bg-white p-10 text-center">
        <p className="text-[13px] tracking-widest text-muted uppercase">Error 404</p>
        <h1 className="mt-3 font-serif text-[32px]">Page not found</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">The page you are looking for does not exist or has moved.</p>
        <Link to="/" className="mt-8 inline-block rounded-full bg-ink px-8 py-3.5 text-[14px] text-white hover:bg-black">
          Back to the shop
        </Link>
      </div>
    </main>
  )
}
