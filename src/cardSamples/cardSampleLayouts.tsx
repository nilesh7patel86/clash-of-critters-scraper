// The sample layouts.
//
// Seven designs for the same roster card. Each one takes the identical view
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
// The gallery that puts these side by side is cardSampleVariants.ts; the region
// placement and material for each is in CardSamplesPage.css.

import { CornerBrackets, Flag, Rings } from './cardSampleDecor'
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
      <span className="d-strands" />
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