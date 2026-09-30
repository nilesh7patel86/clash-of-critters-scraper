// Decorative atoms used by the sample layouts.
//
// These draw nothing a player reads or controls, so they live apart from the
// functional kit in cardSampleKit.tsx: everything in the kit is behaviour, and
// everything here is material. Each one is a positioned, absolutely-placed layer
// inside a card's .s-chrome slot, styled entirely from CardSamplesPage.css.
//
// The medallion at the bottom is the one exception: it is the cost badge the
// trading-card templates put in their top corner. It is still only a ring - the
// figure inside it belongs to the layout, not here.

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

/**
 * A cost medallion: the circle badge the trading-card templates put in their top
 * corner, sized and positioned by CSS. Deliberately takes no children: the figure
 * that belongs inside it is part of the card's furniture, not this atom's job, so
 * the layout places the number separately and CSS centres the pair.
 */
export function Medallion({ size = 46 }: { size?: number }) {
  return <span className="d-medallion" style={{ '--medallion': `${size}px` } as CSSProperties} />
}