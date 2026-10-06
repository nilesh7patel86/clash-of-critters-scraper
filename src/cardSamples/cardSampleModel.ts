// The card-sample lab's view model.
//
// The pet read-side itself - names, art, star maths, stat maths, trials - lives
// in src/petHelpers.ts and is shared with the roster, so the lab renders from
// exactly the numbers the roster does. This module keeps only what the lab adds
// on top: the rarity-painted quality colour (see getQuality below), the stat
// ceiling a meter is drawn against, the model every layout renders, and the
// scenario seeds. The shared read-side is re-exported here as well, so the
// layouts keep a single import for everything they need.
//
// Everything here is pure: given a pet, its saved state and the trainer/gym
// context it returns the numbers and asset URLs a card needs. No component
// state, no markup, no styles.

import { DATA } from '../gameData'
import type { FeedRank, PetUnit, QualityData } from '../gameData'
import { ELEMENTS } from '../domain'
import type { GymState, TrainerState } from '../domain'
import { rarityFor, rarityPalette } from './cardSampleRarity'
import type { RarityName, RarityPalette } from './cardSampleRarity'
import {
  MAX_STAR,
  MAX_STAR_ICON,
  POSITION_LABELS,
  SPECIAL_PLUS_START,
  STAR_COST,
  STAR_GRADE,
  STAR_NAMES,
  attrUrl,
  boxUrl,
  careerUrl,
  computeStats,
  duplicateCost,
  formatStat,
  getCareerName,
  getEvoRange,
  getPetImage,
  getQuality as baseGetQuality,
  getStageName,
  gradeUrl,
  hasShiny,
  nextEvolution,
  petKey,
  positionUrl,
  qualityValue,
  readableInk,
  specialIcon,
  starBackgroundUrl,
  starFromParts,
  starLevels,
  starParts,
  starUrl,
  trialHintAvailable,
  trialIconUrl,
  trialLines,
} from '../petHelpers'
import type { ComputedStats, EvolutionStep, GradeKey, PetArt, PetState, StatKey } from '../petHelpers'

// The read-side the sample pages import from this module.
export {
  MAX_STAR,
  MAX_STAR_ICON,
  SPECIAL_PLUS_START,
  STAR_GRADE,
  STAR_NAMES,
  attrUrl,
  boxUrl,
  careerUrl,
  duplicateCost,
  formatStat,
  getEvoRange,
  gradeUrl,
  nextEvolution,
  petKey,
  positionUrl,
  readableInk,
  specialIcon,
  starBackgroundUrl,
  starFromParts,
  starLevels,
  starParts,
  starUrl,
  trialIconUrl,
  trialLines,
}
export type { EvolutionStep, PetState, StatKey }

/** The three stats in the order the roster lists them. */
export const STAT_ROWS: StatKey[] = ['atk', 'hp', 'def']

export const STAT_LABELS: Record<StatKey, string> = {
  atk: 'Attack',
  hp: 'HP',
  def: 'Defense',
}

// The flat colour returned here is the lab's own rarity reference, not the
// game's. The qmap row is still read for grad, which is the frame gradient the
// game draws and is worth keeping exactly as scraped, but its flat colour is
// unusable as a rarity colour: qmap gives tier 6 the same red as tier 5, so a
// Rainbow pet and a Red pet would come out identical. The shared getQuality in
// src/petHelpers.ts still reads qmap untouched - the roster calls it without a
// colour and gets the game's own.
export function getQuality(stage: number, pet: PetUnit): QualityData {
  return baseGetQuality(stage, pet, rarityPalette(qualityValue(stage, pet)).mid)
}

/** Clamped 0-1 share, guarding the divide so an unevolved stage cannot report a
 * percentage against a zero ceiling. */
function ratio(value: number, ceiling: number): number {
  if (!Number.isFinite(ceiling) || ceiling <= 0) return 0
  return Math.min(1, Math.max(0, value / ceiling))
}

/**
 * The largest single stat any pet reaches at this trainer and gym, fully starred
 * and fully evolved. This is the scale a stat meter is drawn against.
 *
 * Not this pet at max star: every stat scales by the same star multiplier, so
 * that ceiling makes all three bars on a card report the identical number. The
 * game's own max is no use either, because a stat is bounded mostly by battle
 * level, so the whole roster would sit near the floor. Comparing against the
 * best pet in the roster is the only version of the idea where attack, HP and
 * defense can tell you different things.
 *
 * Memoised on the two objects the numbers depend on, which are replaced rather
 * than mutated whenever the lab's trainer or gym changes.
 */
let ceilingCache: { trainer: TrainerState; gym: GymState; value: Record<StatKey, number> } | null = null

function rosterCeiling(trainer: TrainerState, gym: GymState): Record<StatKey, number> {
  if (ceilingCache && ceilingCache.trainer === trainer && ceilingCache.gym === gym) {
    return ceilingCache.value
  }
  const top: Record<StatKey, number> = { atk: 0, hp: 0, def: 0 }
  for (const pet of DATA.pets) {
    const stats = computeStats(pet, {
      own: true,
      shiny: false,
      star: MAX_STAR,
      evo: getEvoRange(pet.id)[1],
      gA: 0,
      gD: 0,
      gH: 0,
    }, trainer, gym)
    top.atk = Math.max(top.atk, stats.atk)
    top.hp = Math.max(top.hp, stats.hp)
    top.def = Math.max(top.def, stats.def)
  }
  ceilingCache = { trainer, gym, value: top }
  return top
}

// ---------------------------------------------------------------------------
// The view model a layout renders.
//
// Every layout in this module draws the same model, which is what keeps the
// functional parity promise honest: a layout cannot quietly drop the badge
// readout, because the readout is part of the model rather than something each
// card remembers to include.
// ---------------------------------------------------------------------------

export interface CardModel {
  pet: PetUnit
  state: PetState
  stats: ComputedStats
  /** Quality of the stage currently selected. grad is still the game's own
   * frame gradient; color is the lab's rarity mid stop, not the qmap colour. */
  quality: QualityData
  /** The rarity text for the selected stage: one of the five tiers the game
   * names, which is what the lab's colour reference is keyed on. */
  rarity: RarityName
  /** The lab's own three-stop colour reference for that rarity. */
  rarityPalette: RarityPalette
  /** The raw q number, 2-6. */
  qualityIndex: number
  /** Ink that stays legible on the rarity mid stop. Three of the five are dark
   * enough to need white and two - Gold and Rainbow - are light enough to need
   * near-black, so this is computed per colour rather than fixed. */
  qualityInk: string
  /** Quality colour for each selectable stage, so evolution buttons can wear
   * the colour of the stage they switch to rather than the current one. */
  stageQuality: { stage: number; color: string; ink: string }[]
  /** Each stat as a 0-1 share of the largest that stat gets anywhere in the
   * roster, at this trainer and gym. Read it as "how big is this against the
   * best pet available" - not as progress towards upgrading. */
  statPct: Record<StatKey, number>
  stageName: string
  shinyAvailable: boolean
  art: PetArt
  element: { label: string; className: string; color: string }
  career: string
  position: string
  /** The weakest of the three food grades, which is the one a player can rely
   * on across the whole pet rather than the better of whatever they set. */
  rank: FeedRank
  grades: Record<StatKey, FeedRank>
  minEvo: number
  maxEvo: number
  next: EvolutionStep | null
  nextLabel: string
  nextTone: 'ready' | 'pending' | 'maxed' | 'cost-error'
  /** Trial quest ids for the next stage, or null when the cache has none. */
  trials: number[] | null
  starUpgradeLabel: string
}

export function buildCardModel(
  pet: PetUnit,
  state: PetState,
  trainer: TrainerState,
  gym: GymState,
): CardModel {
  const stats = computeStats(pet, state, trainer, gym)
  const [minEvo, maxEvo] = getEvoRange(pet.id)
  const next = nextEvolution(pet, state.star, state.evo)
  const shinyAvailable = hasShiny(pet, state.evo)
  const trialNext = next && trialHintAvailable(next) ? next : null
  const quality = getQuality(state.evo, pet)

  const nextLabel = !next
    ? 'Evolution max'
    : next.gate === null
      ? `Evo ${next.stage} gate unavailable`
      : next.ready
        ? `Evo ${next.stage} ready \u00b7 \u2605${next.gate}`
        : `${next.cost} \u2192 \u2605${next.gate} \u00b7 Evo ${next.stage}`

  const nextTone: CardModel['nextTone'] = !next
    ? 'maxed'
    : next.gate === null
      ? 'cost-error'
      : next.ready
        ? 'ready'
        : 'pending'

  const stageQuality = Array.from({ length: maxEvo - minEvo + 1 }, (_, index) => index + minEvo).map((stage) => {
    const quality = getQuality(stage, pet)
    return { stage, color: quality.color, ink: readableInk(quality.color) }
  })

  const qualityIndex = qualityValue(state.evo, pet)

  // One scan of the roster per trainer/gym, shared by every card, so a meter
  // design can fill a bar against a real comparison.
  const top = rosterCeiling(trainer, gym)
  const statPct = {
    atk: ratio(stats.atk, top.atk),
    hp: ratio(stats.hp, top.hp),
    def: ratio(stats.def, top.def),
  }

  return {
    pet,
    state,
    stats,
    quality,
    rarity: rarityFor(qualityIndex),
    rarityPalette: rarityPalette(qualityIndex),
    qualityIndex,
    qualityInk: readableInk(quality.color),
    stageQuality,
    statPct,
    stageName: getStageName(pet, state.evo),
    shinyAvailable,
    art: getPetImage(pet, state.evo, state.shiny && shinyAvailable),
    element: ELEMENTS[pet.el],
    career: getCareerName(pet),
    position: POSITION_LABELS[pet.pos] || `Position ${pet.pos}`,
    rank: DATA.feedrank[Math.min(state.gA, state.gD, state.gH)] || DATA.feedrank[0],
    grades: {
      atk: DATA.feedrank[state.gA] || DATA.feedrank[0],
      hp: DATA.feedrank[state.gH] || DATA.feedrank[0],
      def: DATA.feedrank[state.gD] || DATA.feedrank[0],
    },
    minEvo,
    maxEvo,
    next,
    nextLabel: trialNext ? `${nextLabel} \u00b7 +${trialNext.trials.length} trials` : nextLabel,
    nextTone,
    trials: trialNext ? trialNext.trials : null,
    starUpgradeLabel: state.star >= MAX_STAR ? '\u2605 max' : `${STAR_COST[state.star] || 0} \u2192 \u2605${state.star + 1}`,
  }
}

/** Handlers a layout forwards to, mirroring the roster card's callback surface. */
export interface CardHandlers {
  onOwn: (id: number, own: boolean) => void
  onShiny: (id: number) => void
  onStarMenu: (id: number) => void
  onStarType: (id: number, type: number) => void
  onStarCount: (id: number, count: number) => void
  onEvolution: (id: number, stage: number) => void
  onGrade: (id: number, key: GradeKey, direction: number) => void
  onTrials: (id: number, anchor: HTMLElement) => void
}

/** Seed rosters that exercise the corners a layout has to survive. */
export type Scenario = 'fresh' | 'midgame' | 'maxed' | 'mixed'

export function createRoster(scenario: Scenario): Record<string, PetState> {
  return Object.fromEntries(
    DATA.pets.map((pet, index) => {
      const [minEvo, maxEvo] = getEvoRange(pet.id)
      const base: PetState = { own: true, star: 1, evo: minEvo, gA: 0, gD: 0, gH: 0, shiny: false }
      if (scenario === 'fresh') return [petKey(pet.id), base]
      if (scenario === 'midgame') {
        return [petKey(pet.id), {
          ...base,
          own: index % 7 !== 3,
          star: 12 + (index % 13),
          evo: Math.min(maxEvo, 2 + (index % 2)),
          gA: (index % 4) as PetState['gA'],
          gD: (index % 3) as PetState['gD'],
          gH: (index % 5) as PetState['gH'],
          shiny: index % 6 === 0,
        }]
      }
      if (scenario === 'maxed') {
        return [petKey(pet.id), {
          ...base,
          star: MAX_STAR,
          evo: maxEvo,
          gA: DATA.feedrank.length - 1 as PetState['gA'],
          gD: DATA.feedrank.length - 1 as PetState['gD'],
          gH: DATA.feedrank.length - 1 as PetState['gH'],
          shiny: true,
        }]
      }
      // mixed walks the interesting states in turn: unowned, star zero, an
      // emblem tier, a not-yet-evolved pet, and a full one.
      const phase = index % 6
      if (phase === 0) return [petKey(pet.id), { ...base, own: false }]
      if (phase === 1) return [petKey(pet.id), { ...base, star: 0 }]
      if (phase === 2) return [petKey(pet.id), { ...base, star: SPECIAL_PLUS_START + (index % 6), evo: maxEvo, shiny: true }]
      if (phase === 3) return [petKey(pet.id), { ...base, star: 6, evo: minEvo, gA: 7 as PetState['gA'] }]
      if (phase === 4) return [petKey(pet.id), { ...base, star: 71, evo: maxEvo, gA: 4 as PetState['gA'], gD: 2 as PetState['gD'] }]
      return [petKey(pet.id), { ...base, star: MAX_STAR, evo: maxEvo, shiny: true }]
    }),
  )
}

export function createTrainer(level = 640): TrainerState {
  return { lvl: level, pr: Math.min(3, Math.max(0, DATA.maxprogress || 4)) }
}

export function createGym(): GymState {
  return Object.fromEntries([2, 3, 4, 5, 6].map((element) => [String(element), 2]))
}
