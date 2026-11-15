import { api, ApiError, tokens } from '../api'
import { resizeImage } from '../imageResize'
import { SUPABASE_KEY, SUPABASE_URL } from '../supabase'
import { supabaseAuthEnabled } from '../supabaseAuth'

type Presigned = { upload_url: string; public_url: string; headers: Record<string, string> }

/** PUT straight to R2/S3 with upload progress (fetch can't report upload progress; Axios is not used here). */
function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Upload to storage failed. Check the bucket CORS settings.'))
    const x = new XMLHttpRequest()
    x.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v)
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : fail())
    x.onerror = fail
    x.send(file)
  })
}

const viaSupabase = supabaseAuthEnabled && (import.meta.env.VITE_ADMIN_SOURCE as string | undefined) !== 'api'

/**
 * Upload link from the Supabase Edge Function `media-presign` (works while the API sleeps). Returns null when the
 * function cannot be used (no Supabase session, not deployed, network trouble) so the API link is used instead;
 * a clear refusal (not an admin, not configured, bad file) is thrown. Asking for a link twice is harmless.
 */
async function presignViaSupabase(body: { content_type: string; size_bytes: number }): Promise<Presigned | null> {
  const t = tokens.get()
  if (!viaSupabase || t?.kind !== 'sb') return null
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/media-presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY as string, Authorization: `Bearer ${t.access_token}` },
      body: JSON.stringify(body),
    })
    if (res.ok) return (await res.json()) as Presigned
    if (res.status === 401 || res.status === 404 || res.status >= 500) return null
    const e = (await res.json().catch(() => ({}))) as { detail?: string }
    if (res.status === 503) return null // not configured here yet: the API may still be
    throw new ApiError(res.status, e.detail ?? `Request failed (${res.status})`)
  } catch (e) {
    if (e instanceof ApiError) throw e
    return null
  }
}

export type UploadedMedia = { kind: 'image' | 'video'; url: string }

/**
 * Compress (images only: max 900x1125 WebP/JPEG at 0.85), get a presigned URL, and upload straight to R2/S3.
 * Videos go up untouched. The API never handles file bytes.
 */
export async function uploadMedia(original: File, onProgress: (pct: number) => void): Promise<UploadedMedia> {
  const isImage = original.type.startsWith('image/')
  const file = isImage ? await resizeImage(original) : original
  const req = { content_type: file.type, size_bytes: file.size }
  const p = (await presignViaSupabase(req)) ?? (await api<Presigned>('/admin/media/presigned-url', { body: req }))
  await putWithProgress(p.upload_url, p.headers, file, onProgress)
  return { kind: isImage ? 'image' : 'video', url: p.public_url }
}

export function uploadErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 503) return 'Media storage (Cloudflare R2) is not configured yet. Paste a URL instead.'
  return e instanceof Error ? e.message : 'Upload failed'
}
