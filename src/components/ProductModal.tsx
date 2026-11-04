import { useEffect, useState } from 'react'
import { Play, X } from 'lucide-react'
import { api, toProduct, type ApiProduct } from '../api'
import { useCart } from '../cart'
import { img, SIZES, taka, type Product, type Size } from '../data'

type Media = { kind: 'image' | 'video'; src: string }

const stockLabel = (n: number): string => (n === 0 ? 'Sold out' : n <= 5 ? `Only ${n} left` : 'In stock')

export function ProductModal() {
  const { viewing } = useCart()
  if (!viewing) return null
  return <Detail key={viewing.id} base={viewing} />
}

function Detail({ base }: { base: Product }) {
  const { add, setViewing } = useCart()
  const [p, setP] = useState<Product>(base)
  const [size, setSize] = useState<Size | null>(null)
  const [idx, setIdx] = useState(0)
  const [nudge, setNudge] = useState(false)

  // Keep stock live: refresh on open and every 15 s while the page is open.
  useEffect(() => {
    let alive = true
    const load = () =>
      api<ApiProduct>(`/products/${base.id}`)
        .then((d) => alive && setP(toProduct(d)))
        .catch(() => undefined)
    load()
    const timer = setInterval(load, 15000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setViewing(null)
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [base.id, setViewing])

  const sizes = SIZES.filter((s) => s in p.stock)
  const soldOut = sizes.every((s) => (p.stock[s] ?? 0) === 0)
  const single = sizes.length === 1 ? sizes[0] : null
  // If the selected size sells out while the page is open, drop the selection.
  const chosen: Size | null = single && (p.stock[single] ?? 0) > 0 ? single : size && (p.stock[size] ?? 0) > 0 ? size : null

  const media: Media[] = [
    ...p.images.map((src): Media => ({ kind: 'image', src })),
    ...(p.video ? [{ kind: 'video', src: p.video } as Media] : []),
  ]
  const current = media[Math.min(idx, media.length - 1)]
  const cover = p.images[0] ? img(p.images[0], 900, 1125) : undefined

  const onAdd = () => {
    if (!chosen) {
      setNudge(true)
      setTimeout(() => setNudge(false), 600)
      return
    }
    add(p, chosen)
    setViewing(null)
  }

  return (
    <div className="fixed inset-0 z-[65] overflow-y-auto bg-black/50 p-0 sm:p-6" onClick={() => setViewing(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={p.title}
        className="relative mx-auto grid w-full max-w-[1000px] bg-white min-[820px]:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setViewing(null)}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-white/90"
        >
          <X className="size-5" strokeWidth={1.25} />
        </button>

        {/* Gallery */}
        <div>
          <div className="aspect-[4/5] w-full bg-cream">
            {current?.kind === 'video' ? (
              <video
                key={current.src}
                src={current.src}
                poster={cover}
                controls
                playsInline
                preload="metadata"
                className="size-full bg-black object-contain"
              >
                Your browser does not support video playback.
              </video>
            ) : current ? (
              <img src={img(current.src, 900, 1125)} alt={p.title} className="size-full object-cover" />
            ) : null}
          </div>
          {media.length > 1 && (
            <ul className="flex gap-2 overflow-x-auto p-3" aria-label="Product media">
              {media.map((m, i) => (
                <li key={m.src + i} className="shrink-0">
                  <button
                    onClick={() => setIdx(i)}
                    aria-label={m.kind === 'video' ? 'Play product video' : `Show image ${i + 1}`}
                    aria-current={i === idx}
                    className={`relative block size-16 overflow-hidden border ${i === idx ? 'border-ink' : 'border-line'}`}
                  >
                    {m.kind === 'video' ? (
                      <span className="grid size-full place-items-center bg-ink text-white">
                        <Play className="size-5" strokeWidth={1.5} />
                      </span>
                    ) : (
                      <img src={img(m.src, 120, 120)} alt="" loading="lazy" className="size-full object-cover" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col p-6 sm:p-8">
          <p className="caps !text-[10px] text-muted">{p.category}</p>
          <h2 className="mt-2 font-serif text-[30px] leading-tight">{p.title}</h2>
          <p className="mt-3 text-[18px]">
            {p.salePrice ? (
              <>
                <span className="text-wine">{taka(p.salePrice)}</span>{' '}
                <del className="ml-1 text-[14px] text-muted">{taka(p.price)}</del>
              </>
            ) : (
              taka(p.price)
            )}
          </p>
          {p.description && <p className="mt-4 text-[14px] leading-relaxed whitespace-pre-line text-muted">{p.description}</p>}

          {!soldOut && !single && (
            <fieldset className={`mt-6 ${nudge ? 'animate-[shake_.3s_2]' : ''}`}>
              <legend className="text-[13px] text-muted">Size</legend>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
                {sizes.map((s) => {
                  const left = p.stock[s] ?? 0
                  const out = left === 0
                  const selected = chosen === s
                  return (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={selected}
                      disabled={out}
                      onClick={() => setSize(s)}
                      className={`min-w-14 border px-3 py-2 text-left transition-colors ${
                        selected ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink'
                      } ${out ? 'cursor-not-allowed text-muted/60 line-through' : ''}`}
                    >
                      <span className="block text-[14px]">{s}</span>
                      <span className={`block text-[10px] ${selected ? 'text-white/80' : left <= 5 && !out ? 'text-wine' : 'text-muted'}`}>
                        {stockLabel(left)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}
          {single && !soldOut && <p className="mt-6 text-[13px] text-muted">{stockLabel(p.stock[single] ?? 0)}</p>}
          {nudge && <p role="alert" className="mt-2 text-[12px] text-wine">Please select a size</p>}

          <button
            onClick={onAdd}
            disabled={soldOut}
            className="mt-8 w-full rounded-full bg-ink py-4 text-[14px] text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {soldOut ? 'Sold out' : 'Add to bag'}
          </button>
          <p className="mt-3 text-[12px] text-muted">Cash on Delivery or bKash / Nagad / card. Delivery ৳70 inside Dhaka, ৳130 outside.</p>
        </div>
      </div>
    </div>
  )
}
