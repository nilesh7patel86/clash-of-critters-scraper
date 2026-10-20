// Evolution progress for the roster: for every Tatari, how far the current star
// count is from the star gate of its next evolution, priced in duplicate boxes.
//
// Pure data - no React and no browser storage - so it can back a panel, an export
// or a script alike. The maths is petHelpers' own (getGate for the star gate,
// duplicateCost for the box price of a star range), so a row here and the hint
// painted on a card can never disagree.
import { DATA } from '../gameData'
import type { PetUnit } from '../gameData'
import { MAX_STAR, duplicateCost, getEvoRange, getGate, getStageName, nextEvolution, petKey } from '../petHelpers'
import type { PetState } from '../petHelpers'
import type { Snapshot } from './stats'

export type EvolutionStatus =
  /** No further evolution: the pet is on its last stage. */
  | 'maxed'
  /** The star gate is met - only the evolution trials stand in the way. */
  | 'ready'
  /** Boxes are still needed to reach the gate. */
  | 'blocked'
  /** The data has no gate for this transition, so no box price exists. */
  | 'no-gate'

export type EvolutionProgressRow = {
  id: number
  /** Name of the stage the pet is on now. */
  name: string
  /** Name of the stage it would evolve into, or null when maxed. */
  nextName: string | null
  owned: boolean
  /** Current indexed star count. */
  star: number
  stage: number
  maxStage: number
  nextStage: number | null
  /** Star gate for the next evolution, straight from DATA.evostar. */
  gate: number | null
  /** How many stars are still missing: max(0, gate - star). */
  starsNeeded: number
  /** Boxes to buy the stars from `star` up to `gate` - the next evolution. */
  boxes: number
  /** Boxes to price every remaining gate, not just the next one. */
  boxesToFinal: number
  /**
   * Box value of the whole 0 -> gate range and of the stars already held. The
   * ratio of the two is `progress`; it counts what the stars are worth in
   * boxes, not boxes literally spent (free stars count too).
   */
  gateBoxes: number
  doneBoxes: number
  /** 0..1 progress through the current gate, by box value. 1 when maxed. */
  progress: number
  /** Trials attached to the next transition (0 when there are none). */
  trials: number
  status: EvolutionStatus
  /** A gate above MAX_STAR can never be met, so no box count can complete it. */
  unreachable: boolean
}

export type EvolutionProgressOptions = {
  /** Only rows whose roster entry is marked as owned. Default false. */
  ownedOnly?: boolean
  /** 'id' keeps roster order (default); 'boxes' puts the biggest ask first. */
  sort?: 'id' | 'boxes'
}

// Roster state is normalised for every pet before it reaches a snapshot, so a
// missing row only happens on a hand-built or partially imported snapshot.
// It is priced as an unowned base-stage pet rather than throwing, which keeps
// progress lists total over whatever snapshot they are handed.
const MISSING_STATE: PetState = { own: false, star: 1, evo: 1, gA: 0, gD: 0, gH: 0, shiny: false }

// The box price of the whole remaining chain: walk each transition, charge the
// stars up to its gate, and carry the raised star count forward, since stars
// bought for an earlier gate are still there for the next one. A missing gate
// cannot be priced but does not stop the gates after it from being priced.
function boxesThroughGates(star: number, id: number, fromStage: number, maxStage: number): number {
  let cursor = star
  let total = 0
  for (let stage = fromStage; stage < maxStage; stage += 1) {
    const gate = getGate(id, stage)
    if (gate === null) continue
    total += duplicateCost(cursor, gate)
    cursor = Math.max(cursor, gate)
  }
  return total
}

/**
 * Progress for one pet at one roster state. A missing state is priced as an
 * unowned base-stage pet, the same fallback the snapshot walk uses.
 */
export function evolutionProgressFor(pet: PetUnit, state: PetState = MISSING_STATE): EvolutionProgressRow {
  const [minStage, maxStage] = getEvoRange(pet.id)
  const stage = Math.min(Math.max(state.evo, minStage), maxStage)
  const star = Math.max(0, state.star)
  const next = nextEvolution(pet, star, stage)
  const gate = next?.gate ?? null
  const starsNeeded = gate === null ? 0 : Math.max(0, gate - star)
  const gateBoxes = gate === null ? 0 : duplicateCost(0, gate)
  const doneBoxes = gate === null ? 0 : duplicateCost(0, Math.min(star, gate))
  const status: EvolutionStatus =
    next === null ? 'maxed' : gate === null ? 'no-gate' : starsNeeded === 0 ? 'ready' : 'blocked'
  return {
    id: pet.id,
    name: getStageName(pet, stage),
    nextName: next ? getStageName(pet, next.stage) : null,
    owned: state.own,
    star,
    stage,
    maxStage,
    nextStage: next?.stage ?? null,
    gate,
    starsNeeded,
    // nextEvolution prices the same range, so the row's figure is the card's
    // figure by construction.
    boxes: next?.cost ?? 0,
    boxesToFinal: boxesThroughGates(star, pet.id, stage, maxStage),
    gateBoxes,
    doneBoxes,
    progress: status === 'maxed' ? 1 : gateBoxes > 0 ? Math.min(1, doneBoxes / gateBoxes) : 0,
    trials: next?.trials.length ?? 0,
    status,
    unreachable: gate !== null && gate > MAX_STAR,
  }
}

/**
 * Evolution progress for a roster snapshot, one row per pet, in roster (id)
 * order unless `sort: 'boxes'` asks for the largest next-evolution box cost
 * first - which is also the order the ready/maxed rows sink to the bottom in.
 */
export function evolutionProgress(snapshot: Snapshot, options: EvolutionProgressOptions = {}): EvolutionProgressRow[] {
  const rows = DATA.pets.map((pet) => evolutionProgressFor(pet, snapshot.R[petKey(pet.id)]))
  const visible = options.ownedOnly ? rows.filter((row) => row.owned) : rows
  if (options.sort === 'boxes') visible.sort((first, second) => second.boxes - first.boxes || first.id - second.id)
  return visible
}

export type EvolutionProgressTotals = {
  rows: number
  owned: number
  ready: number
  blocked: number
  maxed: number
  /** Boxes needed across the listed rows for their next evolution only. */
  boxes: number
  /** Boxes needed across the listed rows to price every remaining gate. */
  boxesToFinal: number
}

/** Row counts and box sums for a progress list, for a header or a summary line. */
export function progressTotals(rows: EvolutionProgressRow[]): EvolutionProgressTotals {
  const totals: EvolutionProgressTotals = { rows: rows.length, owned: 0, ready: 0, blocked: 0, maxed: 0, boxes: 0, boxesToFinal: 0 }
  for (const row of rows) {
    if (row.owned) totals.owned += 1
    if (row.status === 'ready') totals.ready += 1
    if (row.status === 'blocked') totals.blocked += 1
    if (row.status === 'maxed') totals.maxed += 1
    totals.boxes += row.boxes
    totals.boxesToFinal += row.boxesToFinal
  }
  return totals
}
