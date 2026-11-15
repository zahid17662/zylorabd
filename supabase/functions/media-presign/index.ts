import { presignUrl } from './sigv4.ts'

// Presigned upload links for product photos/videos (Cloudflare R2). Admin only; the file bytes never pass through here.
// Secrets (Supabase dashboard > Edge Functions > Secrets): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET, R2_PUBLIC_BASE_URL (the public CDN address of the bucket).
const MEDIA_TYPES: Record<string, [string, number]> = {
  'image/jpeg': ['jpg', 8], 'image/png': ['png', 8], 'image/webp': ['webp', 8],
  'video/mp4': ['mp4', 15], 'video/webm': ['webm', 15],
} // content type -> [extension, max MB]
const CACHE = 'public, max-age=31536000, immutable'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return reply(405, { detail: 'Method not allowed' })

  // Only a password-signed-in admin may ask: ask the database (admin_whoami raises 'forbidden' for anyone else).
  const auth = req.headers.get('Authorization') ?? ''
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const who = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/admin_whoami`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey, Authorization: auth }, body: '{}',
  }).catch(() => null)
  if (!who) return reply(502, { detail: 'Could not verify your login. Try again.' })
  if (who.status === 401 || who.status === 403) return reply(403, { detail: 'Admin access required' })
  if (!who.ok) return reply(502, { detail: 'Could not verify your login. Try again.' })

  const env = (k: string) => Deno.env.get(k) ?? ''
  const account = env('R2_ACCOUNT_ID'), keyId = env('R2_ACCESS_KEY_ID'), secret = env('R2_SECRET_ACCESS_KEY')
  const bucket = env('R2_BUCKET'), publicBase = env('R2_PUBLIC_BASE_URL')
  if (!account || !keyId || !secret || !bucket || !publicBase) return reply(503, { detail: 'Media storage is not configured' })

  let body: { content_type?: unknown; size_bytes?: unknown }
  try { body = await req.json() } catch { return reply(422, { detail: 'Invalid request' }) }
  const type = typeof body.content_type === 'string' ? body.content_type : ''
  const size = body.size_bytes
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return reply(422, { detail: 'size_bytes must be a positive whole number' })
  const media = MEDIA_TYPES[type]
  if (!media) return reply(422, { detail: 'Allowed types: JPEG, PNG, WebP images; MP4, WebM videos' })
  const [ext, maxMb] = media
  if (size > maxMb * 1024 * 1024) return reply(422, { detail: `File too large (max ${maxMb} MB). Compress videos before uploading.` })

  const key = `products/${crypto.randomUUID().replaceAll('-', '')}.${ext}`
  const uploadUrl = await presignUrl({
    method: 'PUT', host: `${account}.r2.cloudflarestorage.com`, path: `/${bucket}/${key}`,
    accessKeyId: keyId, secretAccessKey: secret, region: 'auto', expiresSeconds: 600,
  })
  return reply(200, {
    upload_url: uploadUrl,
    public_url: `${publicBase.replace(/\/+$/, '')}/${key}`,
    headers: { 'Content-Type': type, 'Cache-Control': CACHE },
  })
})
