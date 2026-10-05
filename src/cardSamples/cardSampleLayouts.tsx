// The sample layouts.
//
// Fourteen designs for the same roster card. Each one takes the identical view
// model and the identical set of controls from cardSampleKit and decides only
// where they sit and what the card is made of, so any difference between them
// is a difference in layout rather than in behaviour.
//
// The visual language of each is drawn from one of the SVG templates in
// src/assets, and each is deliberately pushed away from the two designs already
// in the app: the roster's soft light "holo pod" and the Codex's chamfered HUD
// card. Nothing here reuses the pod's rounded glass or its dot lattice, and
// nothing here reuses the Codex card's symmetric clip-path chamfer or its
// scanline overlay.
//
//   aegis   plated armour, nested frames and neon corner brackets  (card.svg)
//   prism   glass plates floating over a nebula, softest of the set (card5.svg)
//   lattice organic curves, membrane glow, radial bloom            (card4.svg)
//   spec    an engineering schematic, all hairlines and monospace   (card6.svg)
//   radar   a sensor terminal, concentric rings and amber           (card10.svg)
//   deck    a physical CRT unit on a cream cabinet                 (card7.svg)
//   tile    a dense hex-cut tile, sized for 65 in one grid         (card3.svg)
//
// A second set follows, built from the trading-card and neon templates in
// inspiration/ and kept in its own block at the foot of this file.
//
// The gallery that puts these side by side is cardSampleVariants.ts; the region
// placement and material for each is in CardSamplesPage.css.

import { CornerBrackets, Flag, Medallion, Rings, WaveStrands } from './cardSampleDecor'
import { formatStat } from './cardSampleModel'
import type { CardHandlers, CardModel } from './cardSampleModel'
import { CardShell, StarBar } from './cardSampleKit'
import type { Tint } from './cardSampleKit'

export interface VariantProps {
  model: CardModel
  disabled: boolean
  starOpen: boolean
  /** Backdrop colour source. Forwarded to the shell by every layout. */
  tint: Tint
  handlers: CardHandlers
}

/** Aegis Frame - plated armour with neon trim. */
export function AegisFrame({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-aegis"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<Flag kind="UNIT" text={String(model.pet.id).padStart(3, '0')} />}
    >
      <span className="d-frame-outer" />
      <span className="d-frame-inner" />
      <CornerBrackets size={20} />
      <Rings count={2} axes={false} />
    </CardShell>
  )
}

/** Prism Lens - glass plates over a slow colour wash. The only soft build. */
export function PrismLens({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  const address = (0x7f9a2 + model.pet.id * 977).toString(16).toUpperCase()
  return (
    <CardShell
      model={model}
      skin="s-prism"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<span className="s-loc">{`SYS.LOC // 0x${address}`}</span>}
    >
      <span className="d-hairline" />
      <span className="d-wash" />
      <span className="d-brackets d-brackets-glass" />
    </CardShell>
  )
}

/** Bio Lattice - organic curves, nothing machined. */
export function BioLattice({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-lattice"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<span className="s-pod-value">{`${model.stats.badge.h}% HP`}</span>}
    >
      <span className="d-bloom" />
      <WaveStrands />
    </CardShell>
  )
}

/** Blueprint Spec - a build-manual page rather than a card. */
export function BlueprintSpec({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  const reference = `9${String(model.pet.id).padStart(3, '0')}-TR-ALPHA`
  return (
    <CardShell
      model={model}
      skin="s-spec"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={
        <>
          <span className="s-spec-id">{`REF.ID: ${reference}`}</span>
          <span className="s-cap-line">
            CAP <StarBar star={model.state.star} />
          </span>
        </>
      }
    >
      <span className="d-blueprint" />
      <span className="d-spine" />
      <Rings count={1} axes={false} />
    </CardShell>
  )
}

/** Radar Ops - a monochrome amber sensor terminal. */
export function RadarOps({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-radar"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<span className="s-cap">CAP {model.state.star}</span>}
    >
      <span className="d-grid" />
      <Rings count={3} />
    </CardShell>
  )
}

/** Analog Deck - a physical CRT unit. The only light-surface design. */
export function AnalogDeck({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-deck"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<Flag kind="MODEL" text={`WEY-${String(model.pet.id).padStart(4, '0')}`} />}
    >
      <span className="d-grooves" />
      <span className="d-tape" />
    </CardShell>
  )
}

/** Tactical Tile - compact, built for sixty-five in one grid. */
export function TacticalTile({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-tile"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<span className="s-tile-cap">{formatStat(model.stats.atk)}</span>}
    >
      <span className="d-hex-ring" />
      <span className="d-rail" />
    </CardShell>
  )
}

/* =============================================================================
   Second set. The seven above were built from the first templates; these seven
   come from the trading-card and neon templates in inspiration/, and each is
   picked to sit well away from all fourteen others rather than to refine any one
   of them.

     signal   a circuit board: square traces, teal, everything on a grid   (circuit-teal)
     forge    hazard stripes and a cost medallion, industrial crimson      (stripe-crimson)
     pill     nothing but rounded rectangles, azure, soft and app-like      (pill-azure)
     vertex   stats stacked down a right-hand rail under faceted corners    (vertex-violet)
     bay      three ten-segment meters on a triple-framed neon shell        (neon meters)
     bleed    artwork to all four edges, almost no chrome left over         (full-art legendary)
     iceprint a quiet printed sheet: pale plate, white content, dark foot   (iceprint minimal)
   ========================================================================== */

/** Signal Board - everything squared off and routed like a PCB. */
export function SignalBoard({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-signal"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<Flag kind="UNIT" text={String(model.pet.id).padStart(3, '0')} />}
    >
      <span className="d-traces" />
      <span className="d-solder" />
    </CardShell>
  )
}

/** Hazard Forge - striped card stock with a stamped cost medallion. */
export function HazardForge({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-forge"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<Medallion size={44} />}
    >
      <span className="d-stripes" />
      <span className="d-keyline" />
      <CornerBrackets size={14} />
    </CardShell>
  )
}

/** Azure Pill - rounded rectangles end to end, nothing with a corner. */
export function AzurePill({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-pill"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<span className="s-pill-el">{model.element.label}</span>}
    >
      <span className="d-sheen" />
    </CardShell>
  )
}

/** Vertex Rail - the three stats stacked down the right edge. */
export function VertexRail({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-vertex"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<span className="s-vertex-q">{model.rarity}</span>}
    >
      <span className="d-facets" />
      <Rings count={1} axes={false} />
    </CardShell>
  )
}

/** Gauge Bay - the three stats read as ten-segment meters. */
export function GaugeBay({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-bay"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={
        <span className="s-rec" aria-hidden="true">
          REC
        </span>
      }
    >
      <span className="d-bezel" />
      <span className="d-bay-scan" />
      <span className="d-corner-tick" />
    </CardShell>
  )
}

/** Full Bleed - the artwork runs off all four edges. */
export function FullBleed({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-bleed"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<Medallion size={42} />}
    >
      <span className="d-bleed-veil" />
      <span className="d-bleed-grid" />
    </CardShell>
  )
}

/** Iceprint - a printed sheet: pale plate, white content, dark footer. */
export function Iceprint({ model, disabled, starOpen, tint, handlers }: VariantProps) {
  return (
    <CardShell
      model={model}
      skin="s-iceprint"
      disabled={disabled}
      starOpen={starOpen}
      tint={tint}
      handlers={handlers}
      extras={<span className="s-iceprint-id">{`NO.${String(model.pet.id).padStart(4, '0')}`}</span>}
    >
      <span className="d-paper" />
      <span className="d-ice-hatch" />
    </CardShell>
  )
}