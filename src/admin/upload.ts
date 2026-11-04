import { api, ApiError } from '../api'
import { resizeImage } from '../imageResize'

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

export type UploadedMedia = { kind: 'image' | 'video'; url: string }

/**
 * Compress (images only: max 900x1125 WebP/JPEG at 0.85), get a presigned URL, and upload straight to R2/S3.
 * Videos go up untouched. The API never handles file bytes.
 */
export async function uploadMedia(original: File, onProgress: (pct: number) => void): Promise<UploadedMedia> {
  const isImage = original.type.startsWith('image/')
  const file = isImage ? await resizeImage(original) : original
  const p = await api<Presigned>('/admin/media/presigned-url', { body: { content_type: file.type, size_bytes: file.size } })
  await putWithProgress(p.upload_url, p.headers, file, onProgress)
  return { kind: isImage ? 'image' : 'video', url: p.public_url }
}

export function uploadErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 503) return 'Media storage (Cloudflare R2) is not configured yet. Paste a URL instead.'
  return e instanceof Error ? e.message : 'Upload failed'
}
