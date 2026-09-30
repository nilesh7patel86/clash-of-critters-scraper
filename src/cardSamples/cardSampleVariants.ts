// The layout registry the gallery renders from.
//
// Kept apart from the layouts themselves so the gallery has one ordered list to
// walk, with the review copy for each design beside the component that draws it.
// Adding a sample means adding a card here and a skin in CardSamplesPage.css.

import type { ReactNode } from 'react'
import {
  AegisFrame,
  AnalogDeck,
  AzurePill,
  BioLattice,
  BlueprintSpec,
  FullBleed,
  GaugeBay,
  HazardForge,
  Iceprint,
  PrismLens,
  RadarOps,
  SignalBoard,
  TacticalTile,
  VertexRail,
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
  {
    id: 'signal',
    name: 'Signal Board',
    tagline: 'Square traces and solder pads, teal on near-black',
    note: 'The only design with no curves anywhere: the backdrop is drawn as circuit traces, every plate is a sharp-cornered rectangle, and the stats sit in boxes that butt straight up against the panel edge. The header carries a unit chip the way the trading templates do.',
    source: 'tcg-design-1-circuit-teal.svg',
    density: '2 per row, portrait',
    render: SignalBoard,
  },
  {
    id: 'forge',
    name: 'Hazard Forge',
    tagline: 'Striped card stock with a stamped cost medallion',
    note: 'Diagonal hazard stripes across the whole card behind a double keyline border, one corner medallion, and stat numbers set much larger than any other design uses them. Industrial rather than technological - the grime is part of the look.',
    source: 'tcg-design-2-stripe-crimson.svg',
    density: '2 per row, portrait',
    render: HazardForge,
  },
  {
    id: 'pill',
    name: 'Azure Pill',
    tagline: 'Nothing but rounded rectangles, and a lot of them',
    note: 'Every corner in this card is fully round: the art window, the name band, each stat pill. The softest of the fourteen and the only one with no hairline trim anywhere, so it reads as an app card rather than a game card.',
    source: 'tcg-design-3-pill-azure.svg',
    density: '2 per row, portrait',
    render: AzurePill,
  },
  {
    id: 'vertex',
    name: 'Vertex Rail',
    tagline: 'Stats stacked down a right-hand rail, faceted corners',
    note: 'Attack, HP and defense are not a list here - they are a vertical rail welded to the right edge, each a big figure over a small label, so the card can be scanned down its side. The corners are cut into facets rather than rounded.',
    source: 'tcg-design-4-vertex-violet.svg',
    density: '2 per row, portrait',
    render: VertexRail,
  },
  {
    id: 'bay',
    name: 'Gauge Bay',
    tagline: 'Three ten-segment meters inside a triple bezel',
    note: 'The three stat rows are real meters: each fills against the same pet at max star, so the bars compare cards rather than track battle level. Triple nested frames, a scanline veil over the artwork, and corner ticks in place of brackets.',
    source: 'tcg-neon-layout-4-meters.svg',
    density: '2 per row, portrait',
    render: GaugeBay,
  },
  {
    id: 'bleed',
    name: 'Full Bleed',
    tagline: 'Artwork to all four edges, almost nothing left over',
    note: 'The artwork runs off every side and the chrome sits on top of it: one veil gradient to keep the text readable, a corner medallion, and a stat column set in zero-padded figures. The most open design in the set, and the one that shows the pet best.',
    source: '01_full_art_legendary.svg',
    density: '2 per row, portrait',
    render: FullBleed,
  },
  {
    id: 'iceprint',
    name: 'Iceprint',
    tagline: 'A quiet printed sheet, pale plate and dark footer',
    note: 'Light-surface like the Analog Deck but nothing physical about it: a pale artwork plate, an inverted white content block, and a dark footer bar with the four figures in columns. Deliberately unlit, closer to a museum label than a game card.',
    source: '04_iceprint_minimal.svg',
    density: '2 per row, portrait',
    render: Iceprint,
  },
]