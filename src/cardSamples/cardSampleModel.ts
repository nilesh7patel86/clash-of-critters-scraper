// Read-only game helpers for the card-sample layouts.
//
// This is a deliberate mirror of the lookups that live privately inside
// RosterPage.tsx, not a second implementation of them. The sample layouts have to
// be deleted or promoted wholesale later on, and the brief for them was that no
// existing layout may change - so rather than export twenty things out of
// RosterPage and rewire that page's imports, the sample module carries its own
// copy of the read side and leaves the roster completely untouched.
//
// Everything here is pure: given a pet, its saved state and the trainer/gym
// context it returns the numbers and asset URLs a card needs. No component
// state, no markup, no styles. When a sample is promoted onto the real roster
// these become the one copy to keep and the RosterPage copies are the ones to
// drop.

import { DATA, PET_NAMES, TRIALS } from '../gameData'
import type { FeedRank, LocalizedText, PetUnit, QualityData, TrialQuest } from '../gameData'
import { ASSET_ROOT, ELEMENTS, assetUrl, badgeBonuses, battleLevel } from '../domain'
import type { GymState, TrainerState } from '../domain'
import { wikiImageUrl, wikiStageArt } from '../wikiArt'
import { rarityFor, rarityPalette } from './cardSampleRarity'
import type { RarityName, RarityPalette } from './cardSampleRarity'

export const MAX_STAR = DATA.maxstar || 84
export const STAR_GRADE = DATA.stargrade || 6
export const MAX_STAR_ICON = DATA.starmaxicon || 24
export const SPECIAL_START = 12 * STAR_GRADE + 1
export const SPECIAL_PLUS_START = 13 * STAR_GRADE + 1

/** Duplicate-box price of each single star step, indexed by current star. */
export const STAR_COST = [
  1,
  1,
  3,
  3,
  ...Array(8).fill(5),
  ...Array(18).fill(7),
  ...Array(12).fill(9),
  ...Array(12).fill(11),
  ...Array(25).fill(13),
  18,
  20,
  22,
  24,
  26,
  28,
]

/** Names for the four star families plus the twelve emblem tiers. */
export const STAR_NAMES: Record<number, string> = {
  1: 'Bronze star',
  2: 'Silver star',
  3: 'Gold star',
  4: 'Dark moon',
  5: 'Gold moon',
  6: 'Rain moon',
  7: 'Gold sun',
  8: 'Purple sun',
  9: 'Red sun',
  10: 'Purple crown',
  11: 'Red crown',
  12: 'White crown',
}

const NO_SHINY_STAGES = new Set(['34:4', '36:4', '42:4', '48:4'])
const NO_SHINY_IDS = new Set([61])

const STAGE_NAME_FALLBACKS: Record<string, string> = {
  '49:4': 'Dharmadder',
  '51:4': 'Lordopus',
}

export const POSITION_LABELS: Record<number, string> = {
  1: 'Front',
  2: 'Middle',
  3: 'Back',
}

// units.json names the six careers in Russian only, so the English labels are
// carried here exactly as the roster does, to keep the two reading the same.
export const CAREER_LABELS: Record<number, string> = {
  1: 'Tank',
  2: 'Guardian',
  3: 'DPS',
  4: 'Healer',
  5: 'Support',
  6: 'Specialist',
}

export type GradeKey = 'gA' | 'gD' | 'gH'
export type StatKey = 'atk' | 'hp' | 'def'

/** The three stats in the order the roster lists them. */
export const STAT_ROWS: StatKey[] = ['atk', 'hp', 'def']

export const STAT_LABELS: Record<StatKey, string> = {
  atk: 'Attack',
  hp: 'HP',
  def: 'Defense',
}

export type PetState = {
  own: boolean
  star: number
  evo: number
  gA: number
  gD: number
  gH: number
  shiny: boolean
}

export type PetArt = { src: string; fallbackSrc: string | null }

export type ComputedStats = {
  atk: number
  hp: number
  def: number
  feed: { a: number; d: number; h: number }
  badge: { a: number; d: number; h: number }
  evolutionValid: boolean
  battleLevel: number
}

export interface EvolutionStep {
  stage: number
  gate: number | null
  cost: number
  ready: boolean
  trials: number[]
}

export interface TrialLine {
  icon: string
  text: string
  alt: string
}

const UNIT_BY_ID = new Map(DATA.pets.map((pet) => [pet.id, pet]))

export function petKey(id: number): string {
  return String(id)
}

export function getUnit(id: number): PetUnit {
  const unit = UNIT_BY_ID.get(id)
  if (!unit) throw new Error(`Unknown pet id ${id}`)
  return unit
}

export function getEvoRange(id: number): [number, number] {
  const range = DATA.evorange[petKey(id)]
  const min = range?.[0] ?? 1
  const max = range?.[1] ?? min
  return [min, max]
}

export function getEvolution(id: number, stage: number) {
  return DATA.evo[petKey(id)]?.[String(stage)]
}

export function getGate(id: number, transition: number): number | null {
  const gate = DATA.evostar[petKey(id)]?.[String(transition)]
  return typeof gate === 'number' && Number.isFinite(gate) ? gate : null
}

export function getStageName(pet: PetUnit, stage: number): string {
  const localized = PET_NAMES[petKey(pet.id)]?.evos?.[String(stage)]?.en
  if (localized) return localized
  const fallback = STAGE_NAME_FALLBACKS[`${pet.id}:${stage}`]
  if (fallback) return fallback
  if (stage === 1) return pet.name
  return `${pet.name} ${stage}`
}

export function getCareerName(pet: PetUnit): string {
  return CAREER_LABELS[pet.career] || DATA.careers[String(pet.career)]?.name || 'Unknown'
}

// The flat colour returned here is the lab's own rarity reference, not the
// game's. The qmap row is still read for grad, which is the frame gradient the
// game draws and is worth keeping exactly as scraped, but its flat colour is
// unusable as a rarity colour: qmap gives tier 6 the same red as tier 5, so a
// Rainbow pet and a Red pet would come out identical. RosterPage has its own
// getQuality and still reads qmap untouched.
export function getQuality(stage: number, pet: PetUnit): QualityData {
  const evolution = getEvolution(pet.id, stage)
  const quality = evolution?.q || 2
  const base = DATA.qmap[String(quality)] || { grad: ['#2a3145', '#171c27'], color: '#8993ad' }
  return { ...base, color: rarityPalette(quality).mid }
}

export function qualityValue(stage: number, pet: PetUnit): number {
  return getEvolution(pet.id, stage)?.q || 2
}

export function getPetImage(pet: PetUnit, stage: number, shiny: boolean): PetArt {
  const art = wikiStageArt(getStageName(pet, stage))
  if (art) {
    const preferred = shiny ? art.glitter ?? art.normal : art.normal
    const local = wikiImageUrl(preferred)
    if (local) return { src: local, fallbackSrc: wikiImageUrl(art.normal) }
  }
  const icons = DATA.peticons[petKey(pet.id)] || {}
  const stageIcon = icons[String(stage)]
  const firstIcon = Object.keys(icons)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => icons[key])[0]
  let filename = stageIcon || firstIcon || ''
  const normalFilename = filename
  if (shiny && hasShiny(pet, stage) && filename) {
    filename = filename.replace(/\.png$/i, '_flash.png')
  }
  return filename
    ? { src: `${ASSET_ROOT}/pet/${filename}`, fallbackSrc: normalFilename ? `${ASSET_ROOT}/pet/${normalFilename}` : null }
    : { src: '', fallbackSrc: null }
}

export function hasShiny(pet: PetUnit, stage: number): boolean {
  const art = wikiStageArt(getStageName(pet, stage))
  if (art) return art.glitter !== null
  return pet.id > 10 && !NO_SHINY_IDS.has(pet.id) && !NO_SHINY_STAGES.has(`${pet.id}:${stage}`)
}

export function careerUrl(pet: PetUnit): string {
  const image = DATA.careers[String(pet.career)]?.img
  if (image) return assetUrl(`career/${image}`)
  return assetUrl(`career/pos_${pet.pos === 1 ? 'front' : 'back'}.png`)
}

export function positionUrl(pet: PetUnit): string {
  return assetUrl(`career/pos_${pet.pos === 1 ? 'front' : 'back'}.png`)
}

export function gradeUrl(grade: FeedRank): string {
  return assetUrl(`grade/${grade.img}`)
}

export function attrUrl(stat: StatKey): string {
  return assetUrl(`attr/${stat}.png`)
}

export function starUrl(icon: number): string {
  return assetUrl(`star/star_${Math.min(icon, MAX_STAR_ICON)}.png`)
}

export function starBackgroundUrl(plus: boolean): string {
  return assetUrl(`star/starbg_special${plus ? '_plus' : ''}.png`)
}

export function boxUrl(): string {
  return assetUrl('box.png')
}

export function formatStat(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
  return String(Math.round(value))
}

export function formatCost(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

// Quality chips are painted in the data's own quality colour, which runs from a
// bright yellow through blue to a deep red. White text fails contrast on the
// light end (1.6:1 on the yellow), so pick the ink per colour instead.
export function readableInk(hex: string): string {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  if (full.length < 6) return '#ffffff'
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16) / 255))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.18 ? '#050505' : '#ffffff'
}

export function computeStats(
  pet: PetUnit,
  state: PetState,
  trainer: TrainerState,
  gym: GymState,
): ComputedStats {
  const currentBattleLevel = battleLevel(pet.el, trainer)
  const level = DATA.lvl[String(currentBattleLevel)] || DATA.lvl['1'] || [0, 0, 0]
  const star = DATA.star[String(state.star)] || DATA.star['1'] || { ac: 1, hc: 1, dc: 1, aa: 0, ha: 0, da: 0 }
  const evolution = getEvolution(pet.id, state.evo)
  const evolutionValid = Boolean(
    evolution &&
      typeof evolution.ag === 'number' &&
      typeof evolution.dg === 'number' &&
      typeof evolution.hg === 'number',
  )
  const factors = evolutionValid ? evolution : { ag: 1, dg: 1, hg: 1 }
  const gradeAttack = DATA.feedrank[state.gA] || DATA.feedrank[0]
  const gradeDefense = DATA.feedrank[state.gD] || DATA.feedrank[0]
  const gradeHealth = DATA.feedrank[state.gH] || DATA.feedrank[0]
  const badge = badgeBonuses(pet.el, gym)
  const feed = { a: gradeAttack.atk, d: gradeDefense.def, h: gradeHealth.hp }
  return {
    atk: factors.ag * (level[0] * star.ac + star.aa) * (1 + (feed.a + badge.a) / 100),
    hp: factors.hg * (level[1] * star.hc + star.ha) * (1 + (feed.h + badge.h) / 100),
    def: factors.dg * (level[2] * star.dc + star.da) * (1 + (feed.d + badge.d) / 100),
    feed,
    badge,
    evolutionValid,
    battleLevel: currentBattleLevel,
  }
}

export function starParts(star: number): { type: number; count: number } {
  if (star <= 0) return { type: 1, count: 0 }
  const grade = Math.ceil(star / STAR_GRADE) - 1
  const count = star - grade * STAR_GRADE
  return { type: grade + 1, count }
}

export function starFromParts(type: number, count: number): number {
  const maxType = Math.min(MAX_STAR_ICON, Math.ceil(MAX_STAR / STAR_GRADE))
  const safeType = Math.min(Math.max(Math.trunc(type), 1), maxType)
  const maxCount = Math.min(STAR_GRADE, MAX_STAR - (safeType - 1) * STAR_GRADE)
  return Math.min(Math.max((safeType - 1) * STAR_GRADE + Math.min(Math.max(Math.trunc(count), 1), maxCount), 1), MAX_STAR)
}

export function starLevels(star: number): number[] {
  if (star <= 0) return []
  const grade = Math.ceil(star / STAR_GRADE) - 1
  const remainder = star - grade * STAR_GRADE
  if (grade < 1) return Array.from({ length: remainder }, () => 1)
  return Array.from({ length: STAR_GRADE }, (_, index) => (index < remainder ? grade + 1 : grade))
}

export function specialIcon(star: number): number {
  if (star >= SPECIAL_PLUS_START) return 19 + (star - SPECIAL_PLUS_START)
  if (star >= SPECIAL_START) return 13 + (star - SPECIAL_START)
  return 0
}

export function duplicateCost(from: number, to: number): number {
  let total = 0
  for (let index = Math.max(0, from); index < to; index += 1) total += STAR_COST[index] || 0
  return total
}

function evolutionTrials(id: number, transition: number): number[] {
  const list = DATA.evoquest[petKey(id)]?.[String(transition)]
  return Array.isArray(list) ? list : []
}

export function nextEvolution(pet: PetUnit, star: number, stage: number): EvolutionStep | null {
  const [, maxStage] = getEvoRange(pet.id)
  if (stage >= maxStage) return null
  const gate = getGate(pet.id, stage)
  return {
    stage: stage + 1,
    gate,
    cost: gate === null ? 0 : star < gate ? duplicateCost(star, gate) : 0,
    ready: gate !== null && star >= gate,
    trials: evolutionTrials(pet.id, stage),
  }
}

function trialText(value: LocalizedText | undefined): string {
  if (!value) return ''
  if (typeof value.en === 'string' && value.en) return value.en
  const first = Object.values(value).find((entry) => typeof entry === 'string')
  return typeof first === 'string' ? first : ''
}

export function trialIconUrl(icon: string): string {
  return assetUrl(`trial/${icon}.png`)
}

function stripTrialCounter(value: string): string {
  return value.replace(/\s*(?:[x\u00d7])?\$\{1\}(?:\s*times?)?/gi, '').replace(/[\s.,:]+$/, '')
}

export function trialLines(questIds: number[]): TrialLine[] {
  return questIds.flatMap((questId) => {
    const quest = TRIALS.quests[String(questId)] as TrialQuest | undefined
    if (!quest) return []
    const target = quest.target ?? '?'
    if (quest.multi) {
      const steps = (quest.multi.steps || []).map((step) => stripTrialCounter(trialText(step))).filter(Boolean)
      return [{
        icon: quest.icon || '',
        text: trialText(quest.multi).replace(/\$\{1\}/g, String(target)),
        alt: steps.length ? `${steps.join(' \u00b7 ')} \u2014 goal: ${target}` : '',
      }]
    }
    const tips = (quest.tips || [])
      .map((tipId) => trialText(TRIALS.tips[String(tipId)]))
      .filter(Boolean)
    return [{
      icon: quest.icon || '',
      text: trialText(quest).replace(/\$\{1\}/g, String(target)),
      alt: tips.length ? `Counts: ${tips.join(' or ')}` : '',
    }]
  })
}

export function trialHintAvailable(next: EvolutionStep | null): boolean {
  return next !== null && next.trials.length > 0 && trialLines(next.trials).length > 0
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
