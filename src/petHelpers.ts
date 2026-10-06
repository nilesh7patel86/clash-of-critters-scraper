// The pet read-side: star maths, evolution gates, trial quests, art lookups and
// the stat budgets built on top of them. Nothing here touches React or
// localStorage, so it can be reasoned about (and tested) on its own.
//
// Shared by the roster and the card-sample lab, which is why it sits at the src
// root rather than inside either feature. The roster's own sort vocabulary and
// snapshot shapes stay in src/roster/stats.ts.
import { DATA, PET_NAMES, TRIALS } from './gameData'
import type { FeedRank, LocalizedText, PetUnit, TrialQuest } from './gameData'
import { ASSET_ROOT, assetUrl, badgeBonuses, battleLevel, clamp } from './domain'
import type { GymState, TrainerState } from './domain'
import { wikiImageUrl, wikiStageArt } from './wikiArt'
// The one curated list of pets and stages that have no Glitter art. The same
// file is read by scraper/tatary_xyz_scraper.js, so the fallback shiny rules
// cannot drift between the scrape and the pages that render it.
import SHINY_EXCLUSIONS from '../shared/shiny.json'

export const MAX_STAR = DATA.maxstar || 84
export const STAR_GRADE = DATA.stargrade || 6
export const MAX_STAR_ICON = DATA.starmaxicon || 24
const SPECIAL_START = 12 * STAR_GRADE + 1
export const SPECIAL_PLUS_START = 13 * STAR_GRADE + 1
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
const NO_SHINY_STAGES = new Set(SHINY_EXCLUSIONS.stages)
const NO_SHINY_IDS = new Set(SHINY_EXCLUSIONS.ids)
const STAGE_NAME_FALLBACKS: Record<string, string> = {
  '49:4': 'Dharmadder',
  '51:4': 'Lordopus',
}
export const UNIT_BY_ID = new Map(DATA.pets.map((pet) => [pet.id, pet]))

export const POSITION_LABELS: Record<number, string> = {
  1: 'Front',
  2: 'Middle',
  3: 'Back',
}

// units.json names the six careers in Russian only, so the English labels live
// here. The wording matches the role vocabulary in the wiki cache (`DPS`, not
// "Damage") so a career reads the same on this page and on the wiki data.
const CAREER_LABELS: Record<number, string> = {
  1: 'Tank',
  2: 'Guardian',
  3: 'DPS',
  4: 'Healer',
  5: 'Support',
  6: 'Specialist',
}

export type GradeKey = 'gA' | 'gD' | 'gH'
export type StatKey = 'atk' | 'hp' | 'def'
export type PetState = {
  own: boolean
  star: number
  evo: number
  gA: number
  gD: number
  gH: number
  shiny: boolean
}

export type ComputedStats = {
  atk: number
  hp: number
  def: number
  feed: { a: number; d: number; h: number }
  badge: { a: number; d: number; h: number }
  evolutionValid: boolean
  battleLevel: number
}

export type PetArt = { src: string; fallbackSrc: string | null }

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

// PET_NAMES and the fallback table are fixed when the bundle is built, so a
// stage name never changes once it is resolved. A card render looks one up
// several times over - title, portrait alt, shiny test, wiki art key - and
// sorting by name looks one up per pet, so the answer is memoised on its key.
const stageNameCache = new Map<string, string>()

export function getStageName(pet: PetUnit, stage: number): string {
  const key = `${pet.id}:${stage}`
  const cached = stageNameCache.get(key)
  if (cached !== undefined) return cached
  const name =
    PET_NAMES[petKey(pet.id)]?.evos?.[String(stage)]?.en ||
    STAGE_NAME_FALLBACKS[`${pet.id}:${stage}`] ||
    (stage === 1 ? pet.name : `${pet.name} ${stage}`)
  stageNameCache.set(key, name)
  return name
}

export function getCareerName(pet: PetUnit): string {
  return CAREER_LABELS[pet.career] || DATA.careers[String(pet.career)]?.name || 'Unknown'
}

export function qualityValue(stage: number, pet: PetUnit): number {
  return getEvolution(pet.id, stage)?.q || 2
}

// `colorOverride` exists for the card-sample lab, whose quality chip is painted
// in the lab's own rarity colour rather than in qmap's - see getQuality in
// cardSampleModel for that note. The roster passes nothing and gets the game's
// colour, unchanged.
export function getQuality(stage: number, pet: PetUnit, colorOverride?: string): { grad: string[]; color: string } {
  const base = DATA.qmap[String(qualityValue(stage, pet))] || { grad: ['#2a3145', '#171c2b'], color: '#8993ad' }
  return colorOverride === undefined ? base : { ...base, color: colorOverride }
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
  const firstIcon = Object.keys(icons).sort((a, b) => Number(a) - Number(b)).map((key) => icons[key])[0]
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
// light end (1.6:1 on the yellow), so pick the ink per colour instead. The
// gamma maths is worth remembering: every card asks for the same handful of
// qmap colours on every render.
const inkCache = new Map<string, string>()

export function readableInk(hex: string): string {
  const cached = inkCache.get(hex)
  if (cached !== undefined) return cached
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  if (full.length < 6) return '#ffffff'
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16) / 255))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const ink = luminance > 0.18 ? '#050505' : '#ffffff'
  inkCache.set(hex, ink)
  return ink
}

export function computeStats(pet: PetUnit, state: PetState, trainer: TrainerState, gym: GymState): ComputedStats {
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
  const safeType = clamp(Math.trunc(type), 1, maxType)
  const maxCount = Math.min(STAR_GRADE, MAX_STAR - (safeType - 1) * STAR_GRADE)
  return clamp((safeType - 1) * STAR_GRADE + clamp(Math.trunc(count), 1, maxCount), 1, MAX_STAR)
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

export interface EvolutionStep {
  stage: number
  gate: number | null
  cost: number
  ready: boolean
  trials: number[]
}

// The quest list straight out of DATA.evoquest, or one shared empty list. It is
// returned as-is (never copied) because the trial line cache below keys on the
// array's identity.
const NO_TRIALS: number[] = []

function evolutionTrials(id: number, transition: number): number[] {
  const list = DATA.evoquest[petKey(id)]?.[String(transition)]
  return Array.isArray(list) ? list : NO_TRIALS
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

export interface TrialLine {
  icon: string
  text: string
  alt: string
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
  return value.replace(/\s*(?:[x×])?\$\{1\}(?:\s*times?)?/gi, '').replace(/[\s.,:]+$/, '')
}

// A card's trial hint and the open trial tip both ask for the same quest list,
// so the rendering is cached against the list itself. Lists come from
// DATA.evoquest (or the shared empty list above), which keeps the cache small:
// one entry per pet and transition, released with the data it belongs to.
const trialLineCache = new WeakMap<number[], TrialLine[]>()

export function trialLines(questIds: number[]): TrialLine[] {
  const cached = trialLineCache.get(questIds)
  if (cached) return cached
  const lines = questIds.flatMap((questId) => {
    const quest = TRIALS.quests[String(questId)] as TrialQuest | undefined
    if (!quest) return []
    const target = quest.target ?? '?'
    if (quest.multi) {
      const steps = (quest.multi.steps || []).map((step) => stripTrialCounter(trialText(step))).filter(Boolean)
      return [{
        icon: quest.icon || '',
        text: trialText(quest.multi).replace(/\$\{1\}/g, String(target)),
        alt: steps.length ? `${steps.join(' · ')} — goal: ${target}` : '',
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
  trialLineCache.set(questIds, lines)
  return lines
}

export function trialHintAvailable(next: EvolutionStep | null): boolean {
  return next !== null && next.trials.length > 0 && trialLines(next.trials).length > 0
}
