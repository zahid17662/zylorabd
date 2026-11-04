import { useState } from 'react'
import { Heart, Plus } from 'lucide-react'
import { useCart } from '../cart'
import { img, SIZES, taka, type Product, type Size } from '../data'
import { ProductImage } from './ui/ProductImage'

export function ProductCard({ product: p }: { product: Product }) {
  const { add, wishlist, toggleWish, setViewing } = useCart()
  const [size, setSize] = useState<Size | null>(null)
  const [nudge, setNudge] = useState(false)

  const sizes = SIZES.filter((s) => s in p.stock)
  const simple = sizes.length === 1 && sizes[0] === 'Free Size'
  const outOfStock = sizes.every((s) => (p.stock[s] ?? 0) === 0)
  const chosen = simple ? sizes[0] : size
  const liked = wishlist.includes(p.id)
  const tooltip = chosen ? 'Add to bag' : 'Select a size'

  const onAdd = () => {
    if (!chosen) {
      setNudge(true)
      setTimeout(() => setNudge(false), 600)
      return
    }
    add(p, chosen)
  }

  return (
    <li className="mx-auto w-full max-w-[280px] list-none">
      <div className="group/thumb relative overflow-hidden rounded-xl bg-slate-100">
        <button onClick={() => setViewing(p)} aria-label={`View ${p.title}`} className="block w-full cursor-pointer">
          <ProductImage
            variant="card"
            src={img(p.image, 600, 800)}
            alt={p.title}
            className="rounded-none"
            imgClassName={outOfStock ? 'opacity-60' : ''}
          />
        </button>

        {outOfStock && (
          <span className="caps absolute inset-x-0 bottom-4 mx-auto w-fit bg-white/90 px-3 py-1.5 !text-[10px]">Out of stock</span>
        )}
        {p.salePrice && !outOfStock && (
          <span className="caps absolute top-3 left-3 rounded-full bg-white px-3 py-1 !text-[10px] text-ink">Sale</span>
        )}

        <button
          onClick={() => toggleWish(p.id)}
          aria-pressed={liked}
          aria-label={liked ? `Remove ${p.title} from wishlist` : `Add ${p.title} to wishlist`}
          className="absolute top-3 right-3 grid size-8 place-items-center rounded-full transition hover:bg-white/70"
        >
          <Heart className={`size-[17px] transition ${liked ? 'fill-ink' : ''}`} strokeWidth={1.25} />
        </button>

        {!outOfStock && (
          <button
            onClick={onAdd}
            aria-label={`${tooltip}: ${p.title}`}
            className="group/btn absolute right-3 bottom-3 flex items-center transition-all duration-300 min-[922px]:translate-y-2 min-[922px]:opacity-0 min-[922px]:group-hover/thumb:translate-y-0 min-[922px]:group-hover/thumb:opacity-100"
          >
            <span className="pointer-events-none invisible mr-2 rounded-full bg-ink px-3 py-1.5 text-[12px] whitespace-nowrap text-white opacity-0 transition-all group-hover/btn:visible group-hover/btn:opacity-100">
              {tooltip}
            </span>
            <span className="grid size-9 place-items-center rounded-full bg-white text-ink shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition group-hover/btn:bg-ink group-hover/btn:text-white">
              <Plus className="size-4" strokeWidth={1.5} />
            </span>
          </button>
        )}
      </div>

      <div className="pt-4">
        <p className="caps !text-[10px] text-muted">{p.category}</p>
        <h2 className="mt-1.5 text-[14px] leading-snug font-normal">
          <button onClick={() => setViewing(p)} className="text-left hover:underline">{p.title}</button>
        </h2>
        <p className="mt-1 text-[14px]">
          {p.salePrice ? (
            <>
              <span className="text-wine">{taka(p.salePrice)}</span> <del className="ml-1 text-[13px] text-muted">{taka(p.price)}</del>
            </>
          ) : (
            taka(p.price)
          )}
        </p>

        {!simple && !outOfStock && (
          <div className={`mt-3 flex flex-wrap gap-1.5 ${nudge ? 'animate-[shake_.3s_2]' : ''}`} role="radiogroup" aria-label="Size">
            {sizes.map((s) => {
              const out = (p.stock[s] ?? 0) === 0
              const selected = size === s
              return (
                <button
                  key={s}
                  role="radio"
                  aria-checked={selected}
                  disabled={out}
                  title={out ? `${s} — out of stock` : s}
                  onClick={() => setSize(selected ? null : s)}
                  className={`relative h-7 min-w-8 overflow-hidden border px-2 text-[11px] tracking-wide transition-colors ${
                    selected ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink'
                  } ${out ? 'cursor-not-allowed text-muted/60' : ''}`}
                >
                  {s}
                  {out && <span className="absolute top-1/2 left-1/2 h-px w-[140%] -translate-1/2 -rotate-[32deg] bg-muted/60" />}
                </button>
              )
            })}
          </div>
        )}
        {nudge && <p className="mt-1.5 text-[12px] text-wine">Please select a size</p>}
      </div>
    </li>
  )
}
