import { useRef, useState, type DragEvent } from 'react'
import { ImagePlus, Upload, Video, X } from 'lucide-react'
import { ProductImage } from '../components/ui/ProductImage'
import { inp, label } from './ui'
import { uploadErrorMessage, uploadMedia } from './upload'
import type { Variant } from './types'

const MAX_VIDEO_SECONDS = 15

/** Length in seconds, or null if the browser cannot read it (then the upload is allowed). */
function videoSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const probe = document.createElement('video')
    const done = (n: number | null) => {
      URL.revokeObjectURL(url)
      resolve(n)
    }
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) ? probe.duration : null)
    probe.onerror = () => done(null)
    probe.src = url
  })
}

function useUpload(kind: 'image' | 'video', onUrl: (url: string) => void) {
  const [progress, setProgress] = useState<number | null>(null)
  const [err, setErr] = useState('')
  /** Resolves true when the file was uploaded and handed to onUrl. */
  const run = async (file: File): Promise<boolean> => {
    setErr('')
    if (!file.type.startsWith(`${kind}/`)) {
      setErr(`Please choose a${kind === 'image' ? 'n image' : ' video'} file.`)
      return false
    }
    if (kind === 'video') {
      const secs = await videoSeconds(file)
      if (secs !== null && secs > MAX_VIDEO_SECONDS) {
        setErr(`This video is ${Math.round(secs)} seconds long. Please upload a short clip of about 5 seconds (max ${MAX_VIDEO_SECONDS}).`)
        return false
      }
    }
    setProgress(0)
    try {
      onUrl((await uploadMedia(file, setProgress)).url)
      return true
    } catch (e) {
      setErr(uploadErrorMessage(e))
      return false
    } finally {
      setProgress(null)
    }
  }
  return { progress, err, run }
}

const pillBtn = 'shrink-0 whitespace-nowrap rounded-full border border-ink px-4 text-[13px] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'

interface UploadButtonProps {
  text: string
  accept: string
  icon: typeof Upload
  busy: boolean
  onFile: (file: File) => void
}

/** Styled device-upload button: hidden file input, keyboard-focusable, and a drag-and-drop target. */
function UploadButton({ text, accept, icon: Icon, busy, onFile }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && !busy) onFile(f)
  }
  return (
    <>
      <input
        ref={inputRef} type="file" accept={accept} className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = '' // allow re-picking the same file
          if (f) onFile(f)
        }}
      />
      <button
        type="button" disabled={busy} onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        className={`${pillBtn} inline-flex items-center gap-2 py-2.5 font-medium ${dragging ? 'bg-slate-100' : ''}`}
      >
        <Icon className="size-4" aria-hidden="true" />
        {text}
      </button>
    </>
  )
}

function Progress({ pct }: { pct: number }) {
  return (
    <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Upload progress">
      <div className="h-2 w-full overflow-hidden rounded bg-cream"><div className="h-2 bg-ink transition-[width]" style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-[12px] text-muted">Uploading… {pct}%</p>
    </div>
  )
}

// onAdd/onRemove (not a whole-array onChange): an upload finishing later must not revert edits made meanwhile.
export function ImageField({ images, onAdd, onRemove }: { images: string[]; onAdd: (url: string) => void; onRemove: (url: string) => void }) {
  const [url, setUrl] = useState('')
  const { progress, err, run } = useUpload('image', onAdd)
  const addUrl = () => {
    const v = url.trim()
    if (v) onAdd(v)
    setUrl('')
  }
  return (
    <div>
      <label className={label}>Photos · resized to max 900×1125 WebP before upload (first photo is the cover)</label>
      {images.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-3">
          {images.map((src, i) => (
            <li key={src} className="relative">
              <ProductImage variant="adminPreview" src={src} alt={`Product photo ${i + 1}`} />
              {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-[10px] text-white">Cover</span>}
              <button
                type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onRemove(src)}
                className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-ink text-white"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <UploadButton text="Upload from device" accept="image/jpeg,image/png,image/webp" icon={ImagePlus} busy={progress !== null} onFile={(f) => void run(f)} />
      <div className="mt-2 flex gap-2">
        <input
          className={inp} aria-label="Image URL" placeholder="…or paste an image URL" value={url}
          onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } }}
        />
        <button type="button" className={pillBtn} disabled={!url.trim()} onClick={addUrl}>Add URL</button>
      </div>
      {progress !== null && <Progress pct={progress} />}
      {err && <p role="alert" className="mt-1 text-[12px] text-wine">{err}</p>}
    </div>
  )
}

export function VideoField({ url, onChange }: { url: string; onChange: (next: string) => void }) {
  const [draft, setDraft] = useState('')
  const { progress, err, run } = useUpload('video', onChange)
  const addUrl = () => {
    const v = draft.trim()
    if (v) onChange(v)
    setDraft('')
  }
  return (
    <div>
      <label className={label}>Showcase video · a real ~5 second clip of the product (MP4 / WebM, max 15 MB). Customers see it as the last slide.</label>
      {url && (
        <div className="mb-2 aspect-[4/5] max-w-[260px] overflow-hidden rounded-lg bg-slate-100">
          <video key={url} src={url} controls playsInline preload="metadata" className="size-full object-cover" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <UploadButton text="Upload video from device" accept="video/mp4,video/webm" icon={Video} busy={progress !== null} onFile={(f) => void run(f)} />
        {url && <button type="button" className={pillBtn} onClick={() => onChange('')}>Remove video</button>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className={inp} aria-label="Video URL" placeholder="…or paste a video URL" value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } }}
        />
        <button type="button" className={pillBtn} disabled={!draft.trim()} onClick={addUrl}>Add URL</button>
      </div>
      {progress !== null && <Progress pct={progress} />}
      {err && <p role="alert" className="mt-1 text-[12px] text-wine">{err}</p>}
    </div>
  )
}

export const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL']

/** Stock per size. Saved sizes show their real SKU; new ones get one generated on save. */
export function SizeMatrix({ variants, onChange }: { variants: Variant[]; onChange: (next: Variant[]) => void }) {
  const [extra, setExtra] = useState('')
  const setQty = (size: string, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw) || 0))
    onChange(variants.map((v) => (v.size === size ? { ...v, stock_quantity: n } : v)))
  }
  const addSize = () => {
    const size = extra.trim()
    if (size && size.length <= 20 && !variants.some((v) => v.size.toLowerCase() === size.toLowerCase())) {
      onChange([...variants, { size, stock_quantity: 0 }])
    }
    setExtra('')
  }
  return (
    <div>
      <label className={label}>Size matrix · stock per size</label>
      <table className="w-full text-left text-[13px]">
        <thead className="text-muted"><tr>{['Size', 'Stock', 'SKU'].map((h) => <th key={h} className="py-1 pr-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.size} className="border-t border-line">
              <td className="py-1.5 pr-3 font-medium">{v.size}</td>
              <td className="py-1.5 pr-3">
                <input className={`${inp} !w-24`} type="number" min={0} aria-label={`Stock for size ${v.size}`} value={v.stock_quantity} onChange={(e) => setQty(v.size, e.target.value)} />
              </td>
              <td className="py-1.5 font-mono text-[12px] break-all text-muted">{v.sku ?? 'auto-generated on save'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-2">
        <input className={`${inp} !w-44`} aria-label="Other size name" placeholder="Other size (e.g. Free Size)" maxLength={20} value={extra} onChange={(e) => setExtra(e.target.value)} />
        <button type="button" className="rounded-full border border-ink px-4 text-[13px]" onClick={addSize}>Add size</button>
      </div>
    </div>
  )
}
