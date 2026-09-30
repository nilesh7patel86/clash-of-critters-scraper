// The layout registry the gallery renders from.
//
// Kept apart from the layouts themselves so the gallery has one ordered list to
// walk, with the review copy for each design beside the component that draws it.
// Adding a sample means adding a card here and a skin in CardSamplesPage.css.

import type { ReactNode } from 'react'
import {
  AegisFrame,
  AnalogDeck,
  BioLattice,
  BlueprintSpec,
  PrismLens,
  RadarOps,
  TacticalTile,
} from './cardSampleLayouts'
import type { VariantProps } from './cardSampleLayouts'

export interface Variant {
  id: string
  name: string
  /** One line on what the design is reaching for. */
  tagline: string
  /** What makes it its own thing, for the reviewer. */
  note: string
  /** Where the look came from. */
  source: string
  /** How many fit across in the density check. */
  density: string
  render: (props: VariantProps) => ReactNode
}

export const VARIANTS: Variant[] = [
  {
    id: 'aegis',
    name: 'Aegis Frame',
    tagline: 'Bolted-down armour plate with neon trim',
    note: 'Two frames nested one inside the other, each with a lit trim line, a header banner whose right edge leans out, a hexagonal quality node, and an art window with one corner sliced off. Two hard brackets grip opposite corners. The densest of the detailed designs, but still a trading card at heart.',
    source: 'card.svg + card3.svg',
    density: '1 per row, portrait',
    render: AegisFrame,
  },
  {
    id: 'prism',
    name: 'Prism Lens',
    tagline: 'Glass plates floating over a colour wash',
    note: 'The only build made of glass rather than plate: backdrop-blurred panels inside a hairline that never touches the edge, an arrow-facetted header, and a solid tag breaking up through the stats plate. No neon trim anywhere on this one.',
    source: 'card5.svg',
    density: '1 per row, portrait',
    render: PrismLens,
  },
  {
    id: 'lattice',
    name: 'Bio Lattice',
    tagline: 'Organic curves and a membrane glow',
    note: 'Everything curved, nothing machined. The portrait hangs beside the name behind a radial bloom rather than under it, two slow strands cross the background, and the star picker becomes a round pod. The one organic design in the set.',
    source: 'card4.svg',
    density: '2 per row, wide',
    render: BioLattice,
  },
  {
    id: 'spec',
    name: 'Blueprint Spec',
    tagline: 'A build-manual page, not a card',
    note: 'Zero radius, hairline separators, a drafting grid with register dots, an ascii capacity bar in the header next to the reference code, and stat rows as spec boxes flush to the panel edges. Deliberately unlit - it should look printed.',
    source: 'card6.svg',
    density: '2 per row, landscape',
    render: BlueprintSpec,
  },
  {
    id: 'radar',
    name: 'Radar Ops',
    tagline: 'Sensor terminal, monochrome amber',
    note: 'Artwork in a radar viewport with concentric rings and full crosshair axes behind it, the star count welded into the header bar instead of floating as a badge, and a filled title band across the control block.',
    source: 'card10.svg',
    density: '2 per row, portrait',
    render: RadarOps,
  },
  {
    id: 'deck',
    name: 'Analog Deck',
    tagline: 'A physical CRT unit on a cream cabinet',
    note: 'Rounded plastic edges, a three-layer bezel around the artwork with scanlines and a glare arc, a rotary quality knob, and printed hazard tape under the readouts. The only light-surface design, and it holds that palette in both app themes.',
    source: 'card7.svg',
    density: '2 per row, portrait',
    render: AnalogDeck,
  },
  {
    id: 'tile',
    name: 'Tactical Tile',
    tagline: 'Compact enough for 65 in one grid',
    note: 'The practical answer rather than the romantic one. Portrait hard left against a hex ring, controls collapsed into a single strip, stats running the width as three cells. Every control the other designs carry, at roughly half the height.',
    source: 'card3.svg',
    density: '4-6 per row',
    render: TacticalTile,
  },
]