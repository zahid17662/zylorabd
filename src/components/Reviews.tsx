import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Star } from 'lucide-react'
import { reviews } from '../data'

function useVisibleCount() {
  const get = () => (window.innerWidth < 640 ? 1 : window.innerWidth < 1024 ? 2 : 3)
  const [n, setN] = useState(get)
  useEffect(() => {
    const on = () => setN(get())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return n
}

function Stars({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-ink">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
      ))}
    </span>
  )
}

function ReviewCard({ r }: { r: (typeof reviews)[number] }) {
  const [more, setMore] = useState(false)
  return (
    <figure className="flex h-full flex-col bg-white p-8">
      <Stars />
      <blockquote className={`mt-5 font-serif text-[20px] leading-snug ${more ? '' : 'line-clamp-5'}`}>“{r.text}”</blockquote>
      {r.text.length > 170 && (
        <button onClick={() => setMore((v) => !v)} className="link-line mt-3 self-start text-[13px] text-muted">
          {more ? 'Show less' : 'Read more'}
        </button>
      )}
      <figcaption className="mt-auto flex items-center justify-between pt-7">
        <span>
          <span className="caps block !text-[11px]">{r.name}</span>
          <span className="mt-1 block text-[12px] text-muted">{r.when} · Verified on Google</span>
        </span>
        <svg viewBox="0 0 48 48" width="18" height="18" aria-label="Google">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
      </figcaption>
    </figure>
  )
}

export function Reviews() {
  const visible = useVisibleCount()
  const max = Math.max(0, reviews.length - visible)
  const [start, setStart] = useState(0)
  const at = Math.min(start, max)

  useEffect(() => {
    const t = setInterval(() => setStart((s) => (Math.min(s, max) >= max ? 0 : s + 1)), 7000)
    return () => clearInterval(t)
  }, [max])

  return (
    <section className="bg-cream px-4 py-16 md:px-10 md:py-24">
      <div className="mb-12 text-center">
        <p className="caps mb-3 !text-[11px] text-muted">Excellent · Based on 21 Google reviews</p>
        <h2 className="font-serif text-[32px] leading-tight md:text-[44px]">In Their Words</h2>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Stars size={16} />
          <span className="text-[14px]">4.9 / 5</span>
        </div>
      </div>

      <div className="mx-auto max-w-[1300px] overflow-hidden">
        <div className="flex transition-transform duration-700 ease-[cubic-bezier(.6,0,.2,1)]" style={{ transform: `translateX(-${(at * 100) / visible}%)` }}>
          {reviews.map((r) => (
            <div key={r.name} className="shrink-0 px-1.5" style={{ width: `${100 / visible}%` }}>
              <ReviewCard r={r} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8 flex justify-center gap-3">
        <button onClick={() => setStart(at <= 0 ? max : at - 1)} aria-label="Previous review" className="grid size-10 place-items-center rounded-full border border-ink/20 hover:border-ink">
          <ArrowLeft className="size-4" strokeWidth={1.25} />
        </button>
        <button onClick={() => setStart(at >= max ? 0 : at + 1)} aria-label="Next review" className="grid size-10 place-items-center rounded-full border border-ink/20 hover:border-ink">
          <ArrowRight className="size-4" strokeWidth={1.25} />
        </button>
      </div>
    </section>
  )
}
