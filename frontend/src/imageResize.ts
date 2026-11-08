/** Client-side resize so raw multi-MB photos are stored at a medium, fast-loading resolution. */
export const MAX_IMAGE_WIDTH = 900
export const MAX_IMAGE_HEIGHT = 1125
export const IMAGE_QUALITY = 0.85

const OUTPUT_TYPES = ['image/webp', 'image/jpeg'] as const

/** Largest size that fits inside the bounds, preserving aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, maxW = MAX_IMAGE_WIDTH, maxH = MAX_IMAGE_HEIGHT) {
  const scale = Math.min(1, maxW / width, maxH / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const toBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, IMAGE_QUALITY))

const extensionFor = (type: string): string => (type === 'image/webp' ? 'webp' : 'jpg')

/**
 * Downscale an image File to at most 900x1125 and re-encode as WebP (JPEG fallback) at 0.85 quality.
 * Returns a new File; the input is untouched. Throws if the file cannot be decoded.
 */
export async function resizeImage(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Could not read that image. Try a JPEG, PNG or WebP file.')
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Image processing is not supported in this browser.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    for (const type of OUTPUT_TYPES) {
      const blob = await toBlob(canvas, type)
      // Browsers silently fall back to PNG when a type is unsupported; only accept what we asked for.
      if (blob && blob.type === type) {
        const name = file.name.replace(/\.[^.]+$/, '') || 'product'
        return new File([blob], `${name}.${extensionFor(type)}`, { type })
      }
    }
    throw new Error('Could not compress the image.')
  } finally {
    bitmap.close()
  }
}
