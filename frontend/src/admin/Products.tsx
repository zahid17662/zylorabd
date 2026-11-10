import { useCallback, useEffect, useState } from 'react'
import { Video } from 'lucide-react'
import { api } from '../api'
import { taka } from '../data'
import { ProductImage } from '../components/ui/ProductImage'
import { blankForm, ProductForm, toForm, type Form } from './ProductForm'
import { btn } from './ui'
import type { Product } from './types'

function Toggle({ on, label, busy, onChange }: { on: boolean; label: string; busy: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-600' : 'bg-stone-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function SizePills({ product }: { product: Product }) {
  return (
    <div className="flex flex-wrap gap-1">
      {product.variants.map((v) => (
        <span
          key={v.size} title={v.stock_quantity === 0 ? 'Out of stock' : `${v.stock_quantity} in stock`}
          className={`rounded-full px-2 py-0.5 text-[12px] whitespace-nowrap tabular-nums ${v.stock_quantity === 0 ? 'bg-red-100 text-red-800' : v.stock_quantity <= 3 ? 'bg-amber-100 text-amber-900' : 'bg-stone-100'}`}
        >
          {v.size}: {v.stock_quantity}
        </span>
      ))}
    </div>
  )
}

export default function Products() {
  const [list, setList] = useState<Product[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api<Product[]>('/admin/products').then(setList).catch((e: Error) => setErr(e.message))
  }, [])
  useEffect(load, [load])

  const run = async (id: string, job: () => Promise<void>) => {
    setBusyId(id)
    setErr('')
    setNotice('')
    try {
      await job()
      load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const setActive = (p: Product, is_active: boolean) =>
    run(p.id, () => api(`/admin/products/${p.id}`, { method: 'PATCH', body: { is_active } }))

  const archive = (p: Product) => {
    if (!confirm(`Remove "${p.title}"? Products that already have orders are archived (hidden) instead of deleted.`)) return
    return run(p.id, async () => {
      const r = await api<{ result: 'deleted' | 'archived' }>(`/admin/products/${p.id}`, { method: 'DELETE' })
      setNotice(r.result === 'archived' ? `"${p.title}" has past orders, so it was archived and hidden from the store.` : `"${p.title}" was deleted.`)
    })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
        <h2 className="font-serif text-[22px] sm:text-[24px]">Products & Media</h2>
        <button className={btn} onClick={() => setForm(blankForm())}>+ New product</button>
      </div>
      {err && <p role="alert" className="mb-3 text-wine">{err}</p>}
      {notice && <p role="status" className="mb-3 text-[13px] text-emerald-800">{notice}</p>}
      <ul className="space-y-3 md:hidden">
        {list.map((p) => (
          <li key={p.id} className={`rounded-lg p-4 text-[13px] ${p.is_active ? 'bg-white' : 'bg-stone-50 text-muted'}`}>
            <div className="flex gap-3">
              <div className="shrink-0">
                {p.images[0] ? <ProductImage variant="admin" src={p.images[0]} /> : <div className="h-14 w-12 rounded-md bg-slate-100" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{p.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-muted">
                  {p.category}
                  {p.video_url && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] text-indigo-900"><Video className="size-3" /> Video</span>}
                  {!p.is_active && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] text-stone-700">Archived</span>}
                </p>
                <p className="mt-1">
                  {taka(Number(p.final_price))}
                  {Number(p.discount_percent) > 0 && <> <span className="text-muted line-through">{taka(Number(p.base_price))}</span> <span className="text-wine">−{Number(p.discount_percent)}%</span></>}
                </p>
              </div>
              <Toggle on={p.is_active} busy={busyId === p.id} label={`${p.title} visible in store`} onChange={(v) => setActive(p, v)} />
            </div>
            <div className="mt-3"><SizePills product={p} /><p className="mt-1 text-[12px] text-muted">{p.total_stock} total</p></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className={btn} disabled={busyId === p.id} onClick={() => setForm(toForm(p))}>Edit</button>
              <button className={btn} disabled={busyId === p.id} onClick={() => archive(p)}>Archive</button>
            </div>
          </li>
        ))}
        {list.length === 0 && !err && <li className="rounded-lg bg-white px-4 py-10 text-center text-[13px] text-muted">No products yet.</li>}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg bg-white md:block">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-line text-muted">
            <tr>{['', 'Product', 'Price', 'Sizes (stock)', 'Visible', ''].map((h, i) => <th key={i} className="px-4 py-3 font-normal">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={`border-b border-line ${p.is_active ? '' : 'bg-stone-50 text-muted'}`}>
                <td className="px-4 py-2">
                  {p.images[0] ? <ProductImage variant="admin" src={p.images[0]} /> : <div className="h-14 w-12 rounded-md bg-slate-100" />}
                </td>
                <td className="px-4 py-2">
                  <p className="font-medium">{p.title}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-muted">
                    {p.category}
                    {p.video_url && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] text-indigo-900"><Video className="size-3" /> Video</span>}
                    {!p.is_active && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] text-stone-700">Archived</span>}
                  </p>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {taka(Number(p.final_price))}
                  {Number(p.discount_percent) > 0 && (
                    <><br /><span className="text-muted line-through">{taka(Number(p.base_price))}</span> <span className="text-wine">−{Number(p.discount_percent)}%</span></>
                  )}
                </td>
                <td className="px-4 py-2"><SizePills product={p} /><p className="mt-1 text-[12px] text-muted">{p.total_stock} total</p></td>
                <td className="px-4 py-2"><Toggle on={p.is_active} busy={busyId === p.id} label={`${p.title} visible in store`} onChange={(v) => setActive(p, v)} /></td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1.5">
                    <button className={btn} disabled={busyId === p.id} onClick={() => setForm(toForm(p))}>Edit</button>
                    <button className={btn} disabled={busyId === p.id} onClick={() => archive(p)}>Archive</button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && !err && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No products yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {form && <ProductForm initial={form} onClose={() => setForm(null)} onSaved={() => (setForm(null), load())} />}
    </div>
  )
}
