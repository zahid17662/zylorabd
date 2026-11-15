// AWS Signature V4 query-string presigning (S3 / Cloudflare R2), Web Crypto only: no SDK, runs in Deno and Node.
const enc = new TextEncoder()

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)))
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}

/** RFC 3986 encoding as AWS wants it (encodeURIComponent leaves !'()* alone). */
export const uriEncode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

export type PresignInput = {
  method: string
  host: string
  path: string // already the final request path, e.g. /bucket/products/abc.webp
  accessKeyId: string
  secretAccessKey: string
  region: string
  expiresSeconds: number
  now?: Date
}

export async function presignUrl(i: PresignInput): Promise<string> {
  const now = i.now ?? new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') // 20130524T000000Z
  const date = amzDate.slice(0, 8)
  const scope = `${date}/${i.region}/s3/aws4_request`
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${i.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(i.expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  }
  const query = Object.keys(params).sort().map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`).join('&')
  const canonicalPath = i.path.split('/').map((seg) => uriEncode(decodeURIComponent(seg))).join('/')
  const canonical = [i.method, canonicalPath, query, `host:${i.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n')
  let k = await hmac(enc.encode('AWS4' + i.secretAccessKey), date)
  for (const part of [i.region, 's3', 'aws4_request']) k = await hmac(k, part)
  const signature = hex(await hmac(k, toSign))
  return `https://${i.host}${canonicalPath}?${query}&X-Amz-Signature=${signature}`
}
