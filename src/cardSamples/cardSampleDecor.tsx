// Decorative atoms used by the sample layouts.
//
// These draw nothing a player reads or controls, so they live apart from the
// functional kit in cardSampleKit.tsx: everything in the kit is behaviour, and
// everything here is material. Each one is a positioned, absolutely-placed layer
// inside a card's .s-chrome slot, styled entirely from cardSample.css.

import type { CSSProperties } from 'react'

/**
 * Four corner brackets, the hardware motif shared by the angular designs.
 * Drawn as eight gradient segments rather than eight elements, so a layout can
 * size the bracket with one custom property.
 */
export function CornerBrackets({ size = 18 }: { size?: number }) {
  return <span className="d-brackets" style={{ '--bracket': `${size}px` } as CSSProperties} />
}

/** Concentric rings plus optional crosshair axes, for a targeting viewport. */
export function Rings({ count = 3, axes = true }: { count?: number; axes?: boolean }) {
  return (
    <span className="d-rings" style={{ '--ring-count': count } as CSSProperties}>
      {axes ? <span className="d-axes" /> : null}
    </span>
  )
}

/** The monospace flag line the trading-card templates carry in their header. */
export function Flag({ kind, text }: { kind: string; text: string }) {
  return <span className="d-flag">{`${kind} // ${text}`}</span>
}