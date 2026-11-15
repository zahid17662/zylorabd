import { api, ApiError, tokens } from '../api'
import { resizeImage } from '../imageResize'
import { SUPABASE_KEY, SUPABASE_URL } from '../supabase'
import { sbRefresh, supabaseAuthEnabled } from '../supabaseAuth'

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
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' }

/** One upload request with progress; resolves with the HTTP status (0 = network failure). */
function send(method: string, url: string, headers: Record<string, string>, file: File, onProgress: (pct: number) => void): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest()
    x.open(method, url)
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v)
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    x.onload = () => resolve({ status: x.status, body: x.responseText })
    x.onerror = () => resolve({ status: 0, body: '' })
    x.send(file)
  })
}

/**
 * Upload straight to Supabase Storage (bucket `media`, folder products/) with the admin's own session: the database
 * only lets a password-signed-in admin write there, and limits the file types and size. Works while the API sleeps.
 * Returns null when Supabase cannot be used right now (no Supabase session, network trouble, server error) so the
 * API route is tried; a clear refusal (not an admin, wrong type, too big) is thrown. Nothing is stored on a failure,
 * and every try uses a fresh file name, so a retry can never overwrite anything.
 */
async function uploadToSupabase(file: File, onProgress: (pct: number) => void): Promise<string | null> {
  let t = tokens.get()
  const ext = EXT[file.type]
  if (!viaSupabase || t?.kind !== 'sb' || !ext) return null
  const path = `products/${crypto.randomUUID().replaceAll('-', '')}.${ext}`
  const go = (token: string) =>
    send('POST', `${SUPABASE_URL}/storage/v1/object/media/${path}`, {
      apikey: SUPABASE_KEY as string, Authorization: `Bearer ${token}`, 'Content-Type': file.type, 'Cache-Control': 'max-age=31536000',
    }, file, onProgress)
  let r = await go(t.access_token)
  if (r.status === 401 || (r.status === 400 && /jwt|expired/i.test(r.body))) {
    const fresh = await sbRefresh(t.refresh_token)
    if (!fresh) return null
    tokens.set(fresh)
    t = fresh
    r = await go(fresh.access_token)
  }
  if (r.status >= 200 && r.status < 300) return `${SUPABASE_URL}/storage/v1/object/public/media/${path}`
  if (r.status === 0 || r.status >= 500 || r.status === 401 || r.status === 404) return null
  if (r.status === 413) throw new ApiError(413, 'File too large (max 8 MB for images, 15 MB for videos).')
  if (/mime|type/i.test(r.body)) throw new ApiError(422, 'Allowed types: JPEG, PNG, WebP images; MP4, WebM videos')
  throw new ApiError(403, 'Only the admin signed in with a password can upload. Sign in again with your email and password.')
}

export type UploadedMedia = { kind: 'image' | 'video'; url: string }

/**
 * Compress (images only: max 900x1125 WebP/JPEG at 0.85) and upload straight to Supabase Storage (API link as the
 * fallback). Videos go up untouched. The API never handles file bytes.
 */
export async function uploadMedia(original: File, onProgress: (pct: number) => void): Promise<UploadedMedia> {
  const isImage = original.type.startsWith('image/')
  const file = isImage ? await resizeImage(original) : original
  const kind = isImage ? 'image' : 'video'
  if (file.type.startsWith('video/') && file.size > 15 * 1024 * 1024) throw new ApiError(413, 'File too large (max 15 MB for videos). Compress the video first.')
  const direct = await uploadToSupabase(file, onProgress)
  if (direct) return { kind, url: direct }
  // Supabase unavailable (or an API session): the API hands out a link for the object store it is configured with.
  const req = { content_type: file.type, size_bytes: file.size }
  const p = await api<Presigned>('/admin/media/presigned-url', { body: req })
  await putWithProgress(p.upload_url, p.headers, file, onProgress)
  return { kind, url: p.public_url }
}

export function uploadErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 503) return 'Photo upload is not available right now. Paste a URL instead.'
  return e instanceof Error ? e.message : 'Upload failed'
}
