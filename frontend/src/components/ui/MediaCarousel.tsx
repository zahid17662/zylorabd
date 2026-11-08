import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { mediaBox } from './ProductImage'

export type Slide = { kind: 'image' | 'video'; src: string }

const AUTOPLAY_MS = 4000

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface MediaCarouselProps {
  slides: Slide[]
  alt: string
  poster?: string
}

/**
 * Product gallery: native scroll-snap, so touch swipe, trackpad and keyboard scrolling just work.
 * Images auto-advance every few seconds (paused while the shopper touches/hovers, and never with
 * reduced motion); a video slide plays muted on loop while it is in view and holds the carousel.
 */
export function MediaCarousel({ slides, alt, poster }: MediaCarouselProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length
  const active = Math.min(index, Math.max(count - 1, 0))

  const goTo = useCallback((i: number) => {
    const el = scroller.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }, [])

  const onScroll = () => {
    const el = scroller.current
    if (el && el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  // Auto-advance through images only; stop on a video so it can play.
  const onVideo = slides[active]?.kind === 'video'
  useEffect(() => {
    if (count < 2 || paused || onVideo || prefersReducedMotion()) return
    const t = setTimeout(() => goTo((active + 1) % count), AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [active, count, paused, onVideo, goTo])

  // Play the video only while it is the visible slide.
  useEffect(() => {
    videos.current.forEach((v, i) => {
      if (!v) return
      if (i === active) void v.play().catch(() => undefined)
      else v.pause()
    })
  }, [active])

  if (count === 0) return <div className={mediaBox('detail')} aria-hidden />

  return (
    <div
      className="mx-auto w-full max-w-[400px]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setTimeout(() => setPaused(false), AUTOPLAY_MS)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className={`${mediaBox('detail')} relative`} role="group" aria-roledescription="carousel" aria-label={`${alt} photos and video`}>
        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((s, i) => (
            <div key={s.src + i} className="size-full shrink-0 snap-center" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`}>
              {s.kind === 'video' ? (
                <video
                  ref={(el) => { videos.current[i] = el }}
                  src={s.src} poster={poster} muted loop playsInline controls preload="metadata"
                  className="size-full bg-black object-cover object-top"
                />
              ) : (
                <img
                  src={s.src} alt={i === 0 ? alt : `${alt}, photo ${i + 1}`} draggable={false}
                  loading={i === 0 ? 'eager' : 'lazy'} decoding="async" className="size-full object-cover object-top select-none"
                />
              )}
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button" aria-label="Previous" disabled={active === 0} onClick={() => goTo(active - 1)}
              className="absolute top-1/2 left-2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow disabled:opacity-0 md:grid"
            >
              <ChevronLeft className="size-5" strokeWidth={1.5} />
            </button>
            <button
              type="button" aria-label="Next" disabled={active === count - 1} onClick={() => goTo(active + 1)}
              className="absolute top-1/2 right-2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow disabled:opacity-0 md:grid"
            >
              <ChevronRight className="size-5" strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2" role="tablist" aria-label="Choose photo or video">
          {slides.map((s, i) => (
            <button
              key={s.src + i} type="button" role="tab" aria-selected={i === active}
              aria-label={s.kind === 'video' ? 'Product video' : `Photo ${i + 1}`} onClick={() => goTo(i)}
              className={`grid place-items-center rounded-full transition-all ${s.kind === 'video' ? 'h-5 w-7' : 'size-2.5'} ${i === active ? 'bg-ink text-white' : 'bg-stone-300 text-stone-600'}`}
            >
              {s.kind === 'video' && <Play className="size-2.5" fill="currentColor" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
