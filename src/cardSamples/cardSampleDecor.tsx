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

import { useId } from 'react'
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

/**
 * The wave strands running behind Bio Lattice's membrane.
 *
 * These were a background data URI, and a data URI is parsed as an image: it
 * cannot see the cascade's custom properties, so the strands stayed one fixed
 * teal on every pet no matter which tint the card was carrying. Inline SVG is in
 * the DOM, so it inherits them and the strokes can follow --s-bio, which is
 * already the membrane's own mix of the pet's tint and teal.
 *
 * The tile is a <pattern> because the curves deliberately overrun the viewBox
 * on all four sides - that overrun is what makes the 320px tile seam invisible.
 * The nested <svg> carries the original 240-unit viewBox so the tile scales the
 * way the old background-size did, rather than having the coordinates rewritten
 * to fit. Density mode renders one of these per card, so the ids come from
 * useId() to keep the gradient references distinct.
 */
export function WaveStrands() {
  // React frames these ids with punctuation that is awkward inside a url(#...)
  // reference, so reduce them to the bare identifier before using them.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const strokes = [
    'M-10 200 C 40 150, 70 235, 120 180 S 210 95, 250 130',
    'M-10 226 C 46 186, 84 258, 132 206 S 214 132, 250 158',
    'M-10 172 C 34 128, 60 200, 108 152 S 206 60, 250 102',
  ]
  return (
    <span className="d-strands">
      <svg aria-hidden="true">
        <defs>
          <pattern id={`${id}-tile`} width="320" height="320" patternUnits="userSpaceOnUse">
            <svg
              width="320"
              height="320"
              viewBox="0 0 240 240"
              fill="none"
              style={{ stroke: 'var(--s-bio, #7ef0c8)' }}
              strokeOpacity="0.34"
              strokeWidth="1.4"
            >
              {strokes.map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-tile)`} />
      </svg>
    </span>
  )
}