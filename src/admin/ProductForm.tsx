import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { ImageField, SizeMatrix, VideoField, DEFAULT_SIZES } from './ProductMedia'
import { btn, inp, label } from './ui'
import type { Product, Variant } from './types'

export type Form = {
  id?: string
  title: string
  description: string
  category: string
  base_price: string
  discount_percent: string
  images: string[]
  video_url: string
  is_active: boolean
  variants: Variant[]
}

export const blankForm = (): Form => ({
  title: '', description: '', category: '', base_price: '', discount_percent: '0', images: [], video_url: '', is_active: true,
  variants: DEFAULT_SIZES.map((size) => ({ size, stock_quantity: 0 })),
})

export const toForm = (p: Product): Form => ({
  id: p.id, title: p.title, description: p.description, category: p.category, base_price: p.base_price,
  discount_percent: p.discount_percent, images: p.images, video_url: p.video_url ?? '', is_active: p.is_active,
  variants: p.variants.map(({ id, size, sku, stock_quantity }) => ({ id, size, sku, stock_quantity })),
})

export function ProductForm({ initial, onClose, onSaved }: { initial: Form; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const addImage = (u: string) => setF((x) => ({ ...x, images: x.images.includes(u) ? x.images : [...x.images, u] }))
  const removeImage = (u: string) => setF((x) => ({ ...x, images: x.images.filter((i) => i !== u) }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const body = {
      title: f.title.trim(), description: f.description, category: f.category.trim(),
      base_price: f.base_price, discount_percent: f.discount_percent || '0',
      images: f.images, video_url: f.video_url.trim() || null, is_active: f.is_active,
      variants: f.variants.map(({ size, stock_quantity }) => ({ size, stock_quantity })),
    }
    try {
      await api(f.id ? `/admin/products/${f.id}` : '/admin/products', { method: f.id ? 'PUT' : 'POST', body })
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-4">
      <form
        onSubmit={submit} role="dialog" aria-modal="true" aria-label={f.id ? 'Edit product' : 'New product'}
        className="mx-auto my-4 w-full max-w-[680px] space-y-4 rounded-lg bg-white p-5 sm:p-7"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-[24px]">{f.id ? 'Edit product' : 'New product'}</h3>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Visible in store
          </label>
        </div>
        <div><label className={label}>Title</label><input className={inp} aria-label="Title" autoFocus required maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div><label className={label}>Description</label><textarea className={inp} aria-label="Description" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className={label}>Category</label><input className={inp} aria-label="Category" required maxLength={80} value={f.category} onChange={(e) => set('category', e.target.value)} /></div>
          <div><label className={label}>Base price (৳)</label><input className={inp} aria-label="Base price" type="number" min="0" step="0.01" required value={f.base_price} onChange={(e) => set('base_price', e.target.value)} /></div>
          <div><label className={label}>Discount %</label><input className={inp} aria-label="Discount percent" type="number" min="0" max="100" step="0.01" value={f.discount_percent} onChange={(e) => set('discount_percent', e.target.value)} /></div>
        </div>
        <ImageField images={f.images} onAdd={addImage} onRemove={removeImage} />
        <VideoField url={f.video_url} onChange={(v) => set('video_url', v)} />
        <SizeMatrix variants={f.variants} onChange={(v) => set('variants', v)} />
        {err && <p role="alert" className="text-[13px] text-wine">{err}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button disabled={busy} className="rounded-full bg-ink px-6 py-1.5 text-[13px] text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save product'}</button>
        </div>
      </form>
    </div>
  )
}
