import { useEffect } from 'react'
import { Minus, Plus, ShoppingBag, X } from 'lucide-react'
import { unitPrice, useCart } from '../cart'
import { img, taka } from '../data'

export function CartDrawer() {
  const { lines, open, setOpen, setQty, remove, subtotal, count, setCheckout } = useCart()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  return (
    <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-500 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={() => setOpen(false)} />
      <aside
        role="dialog"
        aria-label="Your shopping bag"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-white transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)] ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-7 py-6">
          <h2 className="font-serif text-[26px] leading-none">
            Your Shopping Bag {count > 0 && <span className="text-muted">({count})</span>}
          </h2>
          <button onClick={() => setOpen(false)} aria-label="Close bag" className="grid size-9 place-items-center rounded-full hover:bg-cream">
            <X className="size-5" strokeWidth={1.25} />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <ShoppingBag className="size-8" strokeWidth={1} />
            <p className="mt-5 font-serif text-[24px]">Your bag is empty</p>
            <p className="mt-1 text-[14px] text-muted">Choose a size on any piece to add it here.</p>
            <button onClick={() => setOpen(false)} className="mt-7 rounded-full bg-ink px-8 py-3.5 text-[14px] text-white hover:bg-black">
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-7">
              {lines.map((l) => (
                <li key={l.product.id + l.size} className="flex gap-4 border-t border-line py-5">
                  <div className="w-[88px] shrink-0 bg-cream">
                    <img src={img(l.product.image, 180, 225)} alt="" className="aspect-[4/5] w-full object-cover" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] leading-snug">{l.product.title}</p>
                      <button onClick={() => remove(l.product.id, l.size)} aria-label={`Remove ${l.product.title}`} className="text-muted hover:text-ink">
                        <X className="size-4" strokeWidth={1.25} />
                      </button>
                    </div>
                    {l.size !== 'Free Size' && <p className="mt-1 text-[13px] text-muted">Size: {l.size}</p>}
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="flex items-center rounded-full border border-line">
                        <button onClick={() => setQty(l.product.id, l.size, l.qty - 1)} className="grid size-8 place-items-center" aria-label="Decrease quantity">
                          <Minus className="size-3" />
                        </button>
                        <span className="w-6 text-center text-[13px] tabular-nums">{l.qty}</span>
                        <button
                          onClick={() => setQty(l.product.id, l.size, l.qty + 1)}
                          disabled={l.qty >= (l.product.stock[l.size] ?? 0)}
                          className="grid size-8 place-items-center disabled:opacity-30"
                          aria-label="Increase quantity"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                      <span className="text-[14px]">{taka(unitPrice(l.product) * l.qty)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line bg-cream px-7 py-6">
              <div className="flex justify-between text-[15px]">
                <span>Subtotal</span>
                <span>{taka(subtotal)}</span>
              </div>
              <p className="mt-1 text-[13px] text-muted">Delivery: Inside Dhaka ৳ 70 · Outside Dhaka ৳ 130</p>
              <button onClick={() => { setOpen(false); setCheckout(true) }} className="mt-5 w-full rounded-full bg-ink py-4 text-[14px] text-white transition-colors hover:bg-black">Proceed to Checkout</button>
              
              <p className="mt-4 text-center text-[12px] text-muted">Cash on Delivery · bKash · Nagad · Visa · Mastercard</p>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
