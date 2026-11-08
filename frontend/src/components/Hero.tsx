import { useEffect, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { img } from '../data'

/* Full-screen campaign slideshow — 5s per slide with a sliding transition. */
const SLIDES = [
  {
    image: '1781269119690-8fa19aafe13d',
    position: '50% 45%',
    kicker: 'New Season',
    title: 'The Eid Edit 2026',
    cta: 'Discover the Collection',
    href: '#eid-collection',
  },
  {
    image: '1640921734615-aeb4efe3e614',
    position: '50% 50%',
    kicker: 'Western Wear',
    title: 'Effortless, Every Day',
    cta: 'Shop New Arrivals',
    href: '#new-arrivals',
  },
  {
    image: '1649990612729-9adfb4461bdc',
    position: '50% 55%',
    kicker: 'Accessories',
    title: 'The Finishing Touch',
    cta: 'Discover Handbags',
    href: '#collections',
  },
]

export function Hero() {
  const [i, setI] = useState(0)
  const [prev, setPrev] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)

  const go = (n: number) => {
    if (n === i) return
    setPrev(i)
    setI(n)
  }

  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => go((i + 1) % SLIDES.length), 5000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, paused])

  const s = SLIDES[i]

  return (
    <section id="top" className="relative h-[58svh] min-h-[380px] max-h-[460px] overflow-hidden bg-ink md:h-[70svh] md:min-h-[480px] md:max-h-[640px]" aria-label="Campaign">
      {SLIDES.map((sl, k) => {
        const pos = k === i ? 'translate-x-0' : k === prev ? 'translate-x-full' : '-translate-x-full'
        return (
          <div
            key={sl.image}
            aria-hidden={k !== i}
            className={`absolute inset-0 ${pos} ${k === i || k === prev ? 'transition-transform duration-[900ms] ease-[cubic-bezier(.6,0,.2,1)]' : ''}`}
          >
            <img src={img(sl.image, 2000)} alt="" decoding="async" style={{ objectPosition: sl.position }} className="absolute inset-0 size-full object-cover" />
          </div>
        )
      })}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/55" />

      <div key={i} className="absolute inset-x-0 bottom-14 flex flex-col items-center px-6 text-center text-white md:bottom-20">
        <p className="caps animate-[rise_.8s_both] !text-[11px] text-white/85">{s.kicker}</p>
        <h1 className="mt-3 animate-[rise_.8s_.08s_both] font-serif text-[32px] leading-[1.05] font-normal md:text-[56px]">{s.title}</h1>
        <a
          href={s.href}
          className="mt-5 animate-[rise_.8s_.16s_both] rounded-full bg-white px-7 py-3 text-[14px] text-ink transition-colors hover:bg-ink hover:text-white"
        >
          {s.cta}
        </a>
      </div>

      <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2 md:bottom-8">
        {SLIDES.map((sl, k) => (
          <button key={sl.image} onClick={() => go(k)} className="py-2" aria-label={`Show slide ${k + 1}`}>
            <span className="block h-[2px] w-10 overflow-hidden bg-white/35">
              <span
                key={k === i ? `on-${i}-${paused}` : 'off'}
                className={`block h-full origin-left bg-white ${k === i ? (paused ? 'scale-x-100' : 'animate-progress') : 'scale-x-0'}`}
              />
            </span>
          </button>
        ))}
      </div>
      <button
        onClick={() => setPaused((v) => !v)}
        className="absolute right-5 bottom-6 grid size-9 place-items-center rounded-full border border-white/50 text-white backdrop-blur-sm hover:bg-white/15 md:right-10 md:bottom-8"
        aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
      >
        {paused ? <Play className="size-3.5" fill="currentColor" /> : <Pause className="size-3.5" fill="currentColor" />}
      </button>
    </section>
  )
}
