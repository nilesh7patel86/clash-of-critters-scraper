import { useState } from 'react'

export function PetImage({ src, fallbackSrc, alt, className = '' }: { src: string; fallbackSrc?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const active = src && !failed.has(src) ? src : fallbackSrc && !failed.has(fallbackSrc) ? fallbackSrc : null
  if (!active) return <span className={`${className} image-fallback`}>No art</span>
  return (
    <img
      className={className}
      src={active}
      alt={alt}
      loading="lazy"
      onError={() => setFailed((current) => new Set(current).add(active))}
    />
  )
}
