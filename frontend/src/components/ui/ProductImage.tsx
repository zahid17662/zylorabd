import type { ReactNode } from 'react'

export type MediaVariant = 'card' | 'detail' | 'thumb' | 'admin' | 'adminPreview'

/** Strict "medium" bounds per context. Shared by images and the video player so they never differ. */
const BOX: Record<MediaVariant, string> = {
  card: 'w-full aspect-[3/4] max-h-72',
  detail: 'w-full max-w-[400px] aspect-[4/5] max-h-[440px] mx-auto shadow-sm',
  thumb: 'w-16 h-20 shrink-0 rounded-md',
  admin: 'w-12 h-14 shrink-0 rounded-md',
  adminPreview: 'w-28 h-36 shrink-0 rounded-lg',
}

const BASE = 'overflow-hidden bg-slate-100 rounded-xl'
const FIT = 'size-full object-cover object-top'
const ZOOM = 'transition-transform duration-300 hover:scale-105'

export const mediaBox = (variant: MediaVariant, extra = ''): string => `${BASE} ${BOX[variant]} ${extra}`.trim()

interface ProductImageProps {
  src: string
  alt?: string
  variant: MediaVariant
  className?: string
  imgClassName?: string
}

export function ProductImage({ src, alt = '', variant, className = '', imgClassName = '' }: ProductImageProps) {
  return (
    <div className={mediaBox(variant, className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`${FIT} ${variant === 'card' ? ZOOM : ''} ${imgClassName}`.trim()}
      />
    </div>
  )
}

interface ProductVideoProps {
  src: string
  poster?: string
  children?: ReactNode
}

/** Detail-page video player: same box as the detail image, so switching media never shifts layout. */
export function ProductVideo({ src, poster, children }: ProductVideoProps) {
  return (
    <div className={mediaBox('detail')}>
      <video key={src} src={src} poster={poster} controls playsInline preload="metadata" className={`${FIT} bg-black`}>
        {children}
      </video>
    </div>
  )
}
