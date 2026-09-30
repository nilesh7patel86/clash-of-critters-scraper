import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { DATA, PET_NAMES, TRIALS } from './gameData'
import type { FeedRank, LocalizedText, PetUnit, TrialQuest } from './gameData'
import { ASSET_ROOT, ELEMENT_ORDER, ELEMENTS, assetUrl, badgeBonuses, battleLevel, clamp, clampProgress, maxProgressForLevel } from './domain'
import type { ElementId, GymState, TrainerState } from './domain'
import Sidebar from './Sidebar'
import { loadWikiStageArt, wikiImageUrl, wikiStageArt } from './wikiArt'

const MAX_STAR = DATA.maxstar || 84
const STAR_GRADE = DATA.stargrade || 6
const MAX_STAR_ICON = DATA.starmaxicon || 24
const SPECIAL_START = 12 * STAR_GRADE + 1
const SPECIAL_PLUS_START = 13 * STAR_GRADE + 1
const SORT_KEYS = ['evostar', 'id', 'pow', 'evo', 'star', 'grade', 'el', 'name', 'own'] as const
const FILTERS = ['0', '2', '3', '4', '6', '5'] as const
const STAR_COST = [
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
const STAR_NAMES: Record<number, string> = {
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
const UNIT_BY_ID = new Map(DATA.pets.map((pet) => [pet.id, pet]))

const POSITION_LABELS: Record<number, string> = {
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

type GradeKey = 'gA' | 'gD' | 'gH'
type StatKey = 'atk' | 'hp' | 'def'
type SortKey = (typeof SORT_KEYS)[number]
type UiState = { srt: SortKey; flt: string }
type PetState = {
  own: boolean
  star: number
  evo: number
  gA: number
  gD: number
  gH: number
  shiny: boolean
}
type RosterState = Record<string, PetState>
type Snapshot = { R: RosterState; GYM: GymState; TR: TrainerState }
type ModelState = { present: Snapshot; ui: UiState; past: Snapshot[]; future: Snapshot[] }
type Status = { message: string; tone: 'info' | 'success' | 'error' }

type RosterPageProps = {
  header: ReactNode
}

type ModelAction =
  | { type: 'commit'; snapshot: Snapshot }
  | { type: 'ui'; ui: Partial<UiState> }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'adopt'; snapshot: Snapshot }

type ComputedStats = {
  atk: number
  hp: number
  def: number
  feed: { a: number; d: number; h: number }
  badge: { a: number; d: number; h: number }
  evolutionValid: boolean
  battleLevel: number
}

type PetArt = { src: string; fallbackSrc: string | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.trunc(value)
}

function petKey(id: number): string {
  return String(id)
}

function getUnit(id: number): PetUnit {
  const unit = UNIT_BY_ID.get(id)
  if (!unit) throw new Error(`Unknown pet id ${id}`)
  return unit
}

function getEvoRange(id: number): [number, number] {
  const range = DATA.evorange[petKey(id)]
  const min = range?.[0] ?? 1
  const max = range?.[1] ?? min
  return [min, max]
}

function getEvolution(id: number, stage: number) {
  return DATA.evo[petKey(id)]?.[String(stage)]
}

function getGate(id: number, transition: number): number | null {
  const gate = DATA.evostar[petKey(id)]?.[String(transition)]
  return typeof gate === 'number' && Number.isFinite(gate) ? gate : null
}

function getStageName(pet: PetUnit, stage: number): string {
  const localized = PET_NAMES[petKey(pet.id)]?.evos?.[String(stage)]?.en
  if (localized) return localized
  const fallback = STAGE_NAME_FALLBACKS[`${pet.id}:${stage}`]
  if (fallback) return fallback
  if (stage === 1) return pet.name
  return `${pet.name} ${stage}`
}

function getCareerName(pet: PetUnit): string {
  return CAREER_LABELS[pet.career] || DATA.careers[String(pet.career)]?.name || 'Unknown'
}

function getQuality(stage: number, pet: PetUnit): { grad: string[]; color: string } {
  const evolution = getEvolution(pet.id, stage)
  const quality = evolution?.q || 2
  return DATA.qmap[String(quality)] || { grad: ['#2a3145', '#171c2b'], color: '#8993ad' }
}

function getPetImage(pet: PetUnit, stage: number, shiny: boolean): PetArt {
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

function hasShiny(pet: PetUnit, stage: number): boolean {
  const art = wikiStageArt(getStageName(pet, stage))
  if (art) return art.glitter !== null
  return pet.id > 10 && !NO_SHINY_IDS.has(pet.id) && !NO_SHINY_STAGES.has(`${pet.id}:${stage}`)
}

function careerUrl(pet: PetUnit): string {
  const image = DATA.careers[String(pet.career)]?.img
  if (image) return assetUrl(`career/${image}`)
  return assetUrl(`career/pos_${pet.pos === 1 ? 'front' : 'back'}.png`)
}

function positionUrl(pet: PetUnit): string {
  return assetUrl(`career/pos_${pet.pos === 1 ? 'front' : 'back'}.png`)
}

function gradeUrl(grade: FeedRank): string {
  return assetUrl(`grade/${grade.img}`)
}

function attrUrl(stat: StatKey): string {
  return assetUrl(`attr/${stat}.png`)
}

function starUrl(icon: number): string {
  return assetUrl(`star/star_${Math.min(icon, MAX_STAR_ICON)}.png`)
}

function starBackgroundUrl(plus: boolean): string {
  return assetUrl(`star/starbg_special${plus ? '_plus' : ''}.png`)
}

function boxUrl(): string {
  return assetUrl('box.png')
}

function formatStat(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
  return String(Math.round(value))
}

function formatCost(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

// Quality chips are painted in the data's own quality colour, which runs from a
// bright yellow through blue to a deep red. White text fails contrast on the
// light end (1.6:1 on the yellow), so pick the ink per colour instead.
function readableInk(hex: string): string {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  if (full.length < 6) return '#ffffff'
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16) / 255))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.18 ? '#050505' : '#ffffff'
}

function computeStats(pet: PetUnit, state: PetState, trainer: TrainerState, gym: GymState): ComputedStats {
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

function createDefaultRoster(): RosterState {
  return Object.fromEntries(
    DATA.pets.map((pet) => [
      petKey(pet.id),
      { own: true, star: 1, evo: 1, gA: 0, gD: 0, gH: 0, shiny: false },
    ]),
  )
}

function createDefaultGym(): GymState {
  return Object.fromEntries(ELEMENT_ORDER.map((element) => [String(element), 0]))
}

function createDefaultSnapshot(): Snapshot {
  return { R: createDefaultRoster(), GYM: createDefaultGym(), TR: { lvl: 1, pr: 0 } }
}

function gradeForValue(stat: 'atk' | 'def' | 'hp', value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const index = DATA.feedrank.findIndex((grade) => grade[stat] === value)
  return index < 0 ? fallback : index
}

function legacyGrades(id: number, value: unknown): { gA: number; gD: number; gH: number } | null {
  const feedValue = typeof value === 'number' ? value : isRecord(value) && typeof value.level === 'number' ? value.level : null
  if (feedValue !== null) {
    const row = DATA.feed[petKey(id)]?.[String(feedValue)]
    if (row) {
      return {
        gA: gradeForValue('atk', row.a, 0),
        gD: gradeForValue('def', row.d, 0),
        gH: gradeForValue('hp', row.h, 0),
      }
    }
  }
  if (isRecord(value) && typeof value.a === 'number' && typeof value.d === 'number' && typeof value.h === 'number') {
    return {
      gA: gradeForValue('atk', value.a, 0),
      gD: gradeForValue('def', value.d, 0),
      gH: gradeForValue('hp', value.h, 0),
    }
  }
  return null
}

function normalizePet(pet: PetUnit, value: unknown, defaultOwn = true): PetState {
  const source = isRecord(value) ? value : {}
  const [minEvo, maxEvo] = getEvoRange(pet.id)
  const arrayValue = Array.isArray(value) ? value : null
  const legacy = legacyGrades(pet.id, source.feed ?? source.feedLv)
  const gA = clamp(integer(source.gA ?? arrayValue?.[2], legacy?.gA ?? 0), 0, DATA.feedrank.length - 1)
  const gD = clamp(integer(source.gD ?? arrayValue?.[3], legacy?.gD ?? 0), 0, DATA.feedrank.length - 1)
  const gH = clamp(integer(source.gH ?? arrayValue?.[4], legacy?.gH ?? 0), 0, DATA.feedrank.length - 1)
  return {
    own: typeof source.own === 'boolean' ? source.own : defaultOwn,
    star: clamp(integer(source.star ?? arrayValue?.[0], 1), 0, MAX_STAR),
    evo: clamp(integer(source.evo ?? arrayValue?.[1], 1), minEvo, maxEvo),
    gA: clamp(gA, 0, DATA.feedrank.length - 1),
    gD: clamp(gD, 0, DATA.feedrank.length - 1),
    gH: clamp(gH, 0, DATA.feedrank.length - 1),
    shiny: typeof source.shiny === 'boolean' ? source.shiny : Boolean(arrayValue?.[5]),
  }
}

function normalizeRoster(value: unknown, defaultOwn = true): RosterState {
  const source = isRecord(value) ? value : {}
  return Object.fromEntries(
    DATA.pets.map((pet) => {
      const entry = source[petKey(pet.id)]
      return [petKey(pet.id), normalizePet(pet, entry, entry === undefined ? defaultOwn : true)]
    }),
  )
}

function normalizeGym(value: unknown): GymState {
  const source = isRecord(value) ? value : {}
  return Object.fromEntries(
    ELEMENT_ORDER.map((element) => {
      const top = DATA.badges.filter((badge) => badge.el === element).reduce((max, badge) => Math.max(max, badge.floor), 0)
      return [String(element), clamp(integer(source[String(element)], 0), 0, top)]
    }),
  )
}

function normalizeTrainer(value: unknown): TrainerState {
  const source = isRecord(value) ? value : {}
  const level = clamp(integer(source.lvl ?? source.level, 1), 1, DATA.maxtrainer || 2400)
  return {
    lvl: level,
    pr: clampProgress(level, integer(source.pr ?? source.progress, 0)),
  }
}

function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && SORT_KEYS.includes(value as SortKey)
}

function normalizeUi(value: unknown): UiState {
  const source = isRecord(value) ? value : {}
  return {
    srt: isSortKey(source.srt) ? source.srt : 'evostar',
    flt: typeof source.flt === 'string' && FILTERS.includes(source.flt as (typeof FILTERS)[number]) ? source.flt : '0',
  }
}

function normalizeSnapshot(value: unknown, requireRoster = false, includeTrainer = true, defaultOwn = true): Snapshot {
  const source = isRecord(value) ? value : {}
  const roster = source.R ?? source.r
  if (requireRoster && !isRecord(roster)) throw new Error('Roster data is required')
  return {
    R: normalizeRoster(roster, defaultOwn),
    GYM: normalizeGym(source.GYM ?? source.g),
    TR: includeTrainer ? normalizeTrainer(source.TR ?? source.t) : { lvl: 1, pr: 0 },
  }
}

function decodeState(value: string): unknown {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

function encodeState(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function starParts(star: number): { type: number; count: number } {
  if (star <= 0) return { type: 1, count: 0 }
  const grade = Math.ceil(star / STAR_GRADE) - 1
  const count = star - grade * STAR_GRADE
  return { type: grade + 1, count }
}

function starFromParts(type: number, count: number): number {
  const maxType = Math.min(MAX_STAR_ICON, Math.ceil(MAX_STAR / STAR_GRADE))
  const safeType = clamp(Math.trunc(type), 1, maxType)
  const maxCount = Math.min(STAR_GRADE, MAX_STAR - (safeType - 1) * STAR_GRADE)
  return clamp((safeType - 1) * STAR_GRADE + clamp(Math.trunc(count), 1, maxCount), 1, MAX_STAR)
}

function starLevels(star: number): number[] {
  if (star <= 0) return []
  const grade = Math.ceil(star / STAR_GRADE) - 1
  const remainder = star - grade * STAR_GRADE
  if (grade < 1) return Array.from({ length: remainder }, () => 1)
  return Array.from({ length: STAR_GRADE }, (_, index) => (index < remainder ? grade + 1 : grade))
}

function specialIcon(star: number): number {
  if (star >= SPECIAL_PLUS_START) return 19 + (star - SPECIAL_PLUS_START)
  if (star >= SPECIAL_START) return 13 + (star - SPECIAL_START)
  return 0
}

function duplicateCost(from: number, to: number): number {
  let total = 0
  for (let index = Math.max(0, from); index < to; index += 1) total += STAR_COST[index] || 0
  return total
}

interface EvolutionStep {
  stage: number
  gate: number | null
  cost: number
  ready: boolean
  trials: number[]
}

function evolutionTrials(id: number, transition: number): number[] {
  const list = DATA.evoquest[petKey(id)]?.[String(transition)]
  return Array.isArray(list) ? list : []
}

function nextEvolution(pet: PetUnit, star: number, stage: number): EvolutionStep | null {
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

interface TrialLine {
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

function trialIconUrl(icon: string): string {
  return assetUrl(`trial/${icon}.png`)
}

function stripTrialCounter(value: string): string {
  return value.replace(/\s*(?:[x\u00d7])?\$\{1\}(?:\s*times?)?/gi, '').replace(/[\s.,:]+$/, '')
}

function trialLines(questIds: number[]): TrialLine[] {
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

function trialHintAvailable(next: EvolutionStep | null): boolean {
  return next !== null && next.trials.length > 0 && trialLines(next.trials).length > 0
}

function defaultUi(): UiState {
  return { srt: 'evostar', flt: '0' }
}

function readLocalState(): { snapshot: Snapshot; ui: UiState } {
  const fallback = { snapshot: createDefaultSnapshot(), ui: defaultUi() }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem('coc_roster')
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.R)) return fallback
    return { snapshot: normalizeSnapshot(parsed), ui: normalizeUi(parsed.ui) }
  } catch {
    return fallback
  }
}

function readSharedState(): { snapshot: Snapshot; ui: UiState } | null {
  if (typeof window === 'undefined') return null
  const match = window.location.hash.match(/^#r=(.+)$/)
  if (!match) return null
  try {
    const parsed: unknown = decodeState(match[1])
    if (!isRecord(parsed)) return null
    const roster = parsed.R ?? parsed.r
    if (!isRecord(roster)) return null
    return { snapshot: normalizeSnapshot(parsed, true, true, parsed.r !== undefined ? false : true), ui: normalizeUi(parsed.ui) }
  } catch {
    return null
  }
}

function initialLoad(): { model: ModelState; shared: boolean; error: string } {
  const local = readLocalState()
  const shared = readSharedState()
  if (shared) {
    return {
      model: { present: shared.snapshot, ui: shared.ui, past: [], future: [] },
      shared: true,
      error: '',
    }
  }
  const hash = typeof window !== 'undefined' ? window.location.hash : ''
  return {
    model: { present: local.snapshot, ui: local.ui, past: [], future: [] },
    shared: false,
    error: hash.startsWith('#r=') ? 'The shared roster link is invalid.' : '',
  }
}

function snapshotsEqual(first: Snapshot, second: Snapshot): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

function modelReducer(state: ModelState, action: ModelAction): ModelState {
  if (action.type === 'commit') {
    if (snapshotsEqual(state.present, action.snapshot)) return state
    return {
      ...state,
      present: action.snapshot,
      past: [...state.past, state.present].slice(-80),
      future: [],
    }
  }
  if (action.type === 'ui') {
    return { ...state, ui: { ...state.ui, ...action.ui } }
  }
  if (action.type === 'undo') {
    const previous = state.past[state.past.length - 1]
    if (!previous) return state
    return {
      ...state,
      present: previous,
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future].slice(0, 80),
    }
  }
  if (action.type === 'redo') {
    const next = state.future[0]
    if (!next) return state
    return {
      ...state,
      present: next,
      past: [...state.past, state.present].slice(-80),
      future: state.future.slice(1),
    }
  }
  return { ...state, present: action.snapshot, past: [], future: [] }
}

function sortIds(pets: PetUnit[], snapshot: Snapshot, sort: SortKey): number[] {
  const power = (pet: PetUnit) => computeStats(pet, snapshot.R[petKey(pet.id)], snapshot.TR, snapshot.GYM).atk
  const quality = (pet: PetUnit) => getEvolution(pet.id, snapshot.R[petKey(pet.id)].evo)?.q || 2
  const grade = (pet: PetUnit) => {
    const state = snapshot.R[petKey(pet.id)]
    return state.gA + state.gD + state.gH
  }
  const compare: Record<SortKey, (first: PetUnit, second: PetUnit) => number> = {
    evostar: (first, second) => {
      const firstState = snapshot.R[petKey(first.id)]
      const secondState = snapshot.R[petKey(second.id)]
      return quality(second) - quality(first) || secondState.star - firstState.star || first.id - second.id
    },
    id: (first, second) => first.id - second.id,
    pow: (first, second) => power(second) - power(first),
    evo: (first, second) => snapshot.R[petKey(second.id)].evo - snapshot.R[petKey(first.id)].evo || first.id - second.id,
    star: (first, second) => snapshot.R[petKey(second.id)].star - snapshot.R[petKey(first.id)].star || first.id - second.id,
    grade: (first, second) => grade(second) - grade(first) || first.id - second.id,
    el: (first, second) => first.el - second.el || first.id - second.id,
    name: (first, second) => getStageName(first, snapshot.R[petKey(first.id)].evo).localeCompare(getStageName(second, snapshot.R[petKey(second.id)].evo)),
    own: (first, second) => Number(snapshot.R[petKey(second.id)].own) - Number(snapshot.R[petKey(first.id)].own) || first.id - second.id,
  }
  return [...pets]
    .sort((first, second) => {
      const owned = Number(snapshot.R[petKey(second.id)].own) - Number(snapshot.R[petKey(first.id)].own)
      return owned || compare[sort](first, second)
    })
    .map((pet) => pet.id)
}

function PetImage({ src, fallbackSrc, alt, className = '' }: { src: string; fallbackSrc?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const active = src && !failed.has(src) ? src : fallbackSrc && !failed.has(fallbackSrc) ? fallbackSrc : null
  if (!active) return <span className={`${className} image-fallback`}>No art</span>
  return (
    <img
      className={className}
      src={active}
      alt={alt}
      loading="lazy"
      onError={() => setFailed((current) => new Set(current).add(active))}
    />
  )
}

function Emblem({ star, height }: { star: number; height: number }) {
  const icon = specialIcon(star)
  if (!icon) return null
  const plus = star >= SPECIAL_PLUS_START
  const background = DATA.starbg[plus ? 'plus' : 'special'] || [141, 65]
  const geometry = DATA.stargeo[String(icon)]
  const iconSize = DATA.starsize[String(icon)] || [20, 20]
  const width = (height * background[0]) / background[1]
  const iconStyle: CSSProperties = geometry
    ? {
        left: `${geometry.l}%`,
        top: `${geometry.t}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
      }
    : {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${(iconSize[0] / background[0]) * 100}%`,
        height: `${(iconSize[1] / background[1]) * 100}%`,
      }
  return (
    <span className="emblem" style={{ width: `${width.toFixed(1)}px`, height: `${height}px` }}>
      <img className="emblem-bg" src={starBackgroundUrl(plus)} alt="" loading="lazy" />
      <img className="emblem-icon" src={starUrl(icon)} alt="" loading="lazy" style={iconStyle} />
    </span>
  )
}

function StarVisual({ star, large = false }: { star: number; large?: boolean }) {
  const icon = specialIcon(star)
  return (
    <div className={`star-visual ${large ? 'large' : ''} ${icon ? 'special' : ''}`} role="img" aria-label={`${star} stars`}>
      {icon ? <Emblem star={star} height={large ? 58 : 46} /> : starLevels(star).map((type, index) => <img key={`${type}-${index}`} src={starUrl(type)} alt="" loading="lazy" />)}
    </div>
  )
}

interface StarPickerProps {
  id: number
  star: number
  open: boolean
  disabled: boolean
  onToggle: () => void
  onType: (type: number) => void
  onCount: (count: number) => void
}

function StarPicker({ id, star, open, disabled, onToggle, onType, onCount }: StarPickerProps) {
  const parts = starParts(star)
  const countMax = Math.min(STAR_GRADE, MAX_STAR - (parts.type - 1) * STAR_GRADE)
  const families = [
    { label: 'Stars', types: [1, 2, 3] },
    { label: 'Moons', types: [4, 5, 6] },
    { label: 'Suns', types: [7, 8, 9] },
    { label: 'Crowns', types: [10, 11, 12] },
  ]
  const special = specialIcon(star)
  return (
    <div className="star-picker" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="star-picker-button" onClick={onToggle} disabled={disabled} aria-expanded={open}>
        {star === 0 ? <span className="star-zero">☆</span> : special ? <Emblem star={star} height={26} /> : <img src={starUrl(parts.type)} alt="" />}
        <span>{star === 0 ? '★0' : special ? 'Emblem' : STAR_NAMES[parts.type] || `Family ${parts.type}`}</span>
        <span className="chevron">⌄</span>
      </button>
      {!special && star > 0 ? (
        <select className="star-count" value={parts.count} onChange={(event) => onCount(Number(event.target.value))} disabled={disabled} aria-label={`Star count for pet ${id}`}>
          {Array.from({ length: countMax }, (_, index) => index + 1).map((count) => <option key={count} value={count}>×{count}</option>)}
        </select>
      ) : null}
      <span className="star-number">★{star}</span>
      {open ? (
        <div className="star-menu" onClick={(event) => event.stopPropagation()}>
          {families.map((family) => (
            <div className="star-family" key={family.label}>
              <div className="star-family-label">{family.label}</div>
              <div className="star-options">
                {family.types.map((type) => {
                  const low = (type - 1) * STAR_GRADE + 1
                  const high = Math.min(MAX_STAR, type * STAR_GRADE)
                  return (
                    <button type="button" className={`star-option ${parts.type === type && !special ? 'selected' : ''}`} key={type} onClick={() => onType(type)} disabled={disabled}>
                      <img src={starUrl(type)} alt="" />
                      <span>★{low}–{high}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="star-family">
            <div className="star-family-label">Emblems</div>
            <div className="star-options emblem-options">
              {Array.from({ length: MAX_STAR_ICON - 12 }, (_, index) => index + 13).map((type) => {
                const emblemStar = 72 + type - 12
                return (
                  <button type="button" className={`star-option emblem-option ${special === type ? 'selected' : ''}`} key={type} onClick={() => onType(type)} disabled={disabled}>
                    <Emblem star={emblemStar} height={36} />
                    <span>★{emblemStar}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatChip({
  stat,
  label,
  value,
  grade,
  feed,
  badge,
  disabled,
  onClick,
  onContextMenu,
}: {
  stat: StatKey
  label: string
  value: number
  grade: FeedRank
  feed: number
  badge: number
  disabled: boolean
  onClick: () => void
  onContextMenu: () => void
}) {
  return (
    <button type="button" className="stat-chip" onClick={onClick} onContextMenu={(event) => { event.preventDefault(); onContextMenu() }} disabled={disabled} title={`${label}: ${Math.round(value).toLocaleString('en-US')}. Click to cycle grade; right-click to go back.`}>
      <span className="stat-icon">
        <img src={attrUrl(stat)} alt="" loading="lazy" />
        <b style={{ background: grade.rgb }}>{grade.name}</b>
      </span>
      <span className="stat-copy">
        <strong>{formatStat(value)}</strong>
        <small>food +{feed}% · badge +{badge}%</small>
      </span>
    </button>
  )
}

function TrialsTip({ pet, state, next, anchor, onClose }: { pet: PetUnit; state: PetState; next: EvolutionStep; anchor: HTMLElement; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  const place = useCallback(() => {
    const node = ref.current
    if (!node) return
    const gap = 10
    const margin = 8
    const rect = node.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const offscreen = anchorRect.bottom < 0 || anchorRect.top > window.innerHeight || anchorRect.right < 0 || anchorRect.left > window.innerWidth
    if (offscreen) {
      onClose()
      return
    }
    const above = anchorRect.top - rect.height - gap
    const preferred = above < margin ? anchorRect.bottom + gap : above
    const top = Math.max(margin, Math.min(preferred, window.innerHeight - rect.height - margin))
    const centered = anchorRect.left + anchorRect.width / 2 - rect.width / 2
    const left = Math.max(margin, Math.min(centered, window.innerWidth - rect.width - margin))
    setStyle((prev) => (prev.top === top && prev.left === left ? prev : { top, left, visibility: 'visible' }))
  }, [anchor, onClose])

  useLayoutEffect(() => {
    place()
  }, [place])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    let frame = 0
    const reposition = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        place()
      })
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [place, onClose])

  const lines = trialLines(next.trials)
  const stageName = getStageName(pet, state.evo)
  return (
    <div className="trials-tip" ref={ref} style={style} role="dialog" aria-label={`Evolution ${next.stage} trials for ${stageName}`}>
      <button type="button" className="trials-close" onClick={onClose} aria-label="Close trial details">×</button>
      <h4>{stageName} · Evolution {next.stage} trials</h4>
      <p className="trials-gate">Requires ★{next.gate ?? '?'}{next.ready ? ' · ready now' : ` · ${next.cost} boxes`}</p>
      {lines.length === 0 ? <p className="trials-empty">No trial data in the cache.</p> : null}
      <ul className="trials-list">
        {lines.map((line, index) => (
          <li key={index}>
            {line.icon ? <img src={trialIconUrl(line.icon)} alt="" /> : null}
            <span>{line.text}{line.alt ? <em className="trials-alt">{line.alt}</em> : null}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface PetCardProps {
  pet: PetUnit
  state: PetState
  stats: ComputedStats
  disabled: boolean
  starOpen: boolean
  onOwn: (id: number, own: boolean) => void
  onShiny: (id: number) => void
  onStarMenu: (id: number) => void
  onStarType: (id: number, type: number) => void
  onStarCount: (id: number, count: number) => void
  onEvolution: (id: number, stage: number) => void
  onGrade: (id: number, key: GradeKey, direction: number) => void
  onTrials: (id: number, anchor: HTMLElement) => void
}

function PetCard({ pet, state, stats, disabled, starOpen, onOwn, onShiny, onStarMenu, onStarType, onStarCount, onEvolution, onGrade, onTrials }: PetCardProps) {
  const quality = getQuality(state.evo, pet)
  const grade = DATA.feedrank[Math.min(state.gA, state.gD, state.gH)] || DATA.feedrank[0]
  const [minEvo, maxEvo] = getEvoRange(pet.id)
  const next = nextEvolution(pet, state.star, state.evo)
  const stageName = getStageName(pet, state.evo)
  const shinyAvailable = hasShiny(pet, state.evo)
  const art = getPetImage(pet, state.evo, state.shiny && shinyAvailable)
  const style = { '--qc-accent': quality.color, borderColor: quality.color } as CSSProperties
  const nextText = !next
    ? 'Evolution max'
    : next.gate === null
      ? `Evo ${next.stage} gate unavailable`
      : next.ready
        ? `Evo ${next.stage} ready · ★${next.gate}`
        : `${next.cost} → ★${next.gate} · Evo ${next.stage}`
  const trialNext = next && trialHintAvailable(next) ? next : null
  const nextLabel = trialNext ? `${nextText} · +${trialNext.trials.length} trials` : nextText
  const nextTone = `cost-hint evolution-hint${next ? (next.gate === null ? ' cost-error' : next.ready ? ' ready' : ' pending') : ' maxed'}`
  return (
    <article className={`pet-card ${state.own ? '' : 'not-owned'} ${state.shiny && shinyAvailable ? 'is-shiny' : ''} ${starOpen ? 'is-picking' : ''} ${stats.evolutionValid ? '' : 'has-data-error'}`} style={style}>
      <div className="quality-bg" style={{ '--qc-wash': quality.grad.map((color) => `color-mix(in srgb, ${color} 16%, transparent)`).join(', ') } as CSSProperties} />
      <div className="pet-card-holo" aria-hidden="true" />
      <div className="pet-card-inner">
        <div className="pet-card-head">
          <span className="quality-tag" style={{ backgroundColor: quality.color, color: readableInk(quality.color) }}>q{getEvolution(pet.id, state.evo)?.q || 2}</span>
          <label className="own-toggle">
            <input type="checkbox" checked={state.own} onChange={(event) => onOwn(pet.id, event.target.checked)} disabled={disabled} aria-label={`Own ${stageName}`} />
            <span>Own</span>
          </label>
        </div>
        <div className="pet-card-top">
          <div className="pet-portrait">
            <PetImage key={`${pet.id}-${state.evo}-${state.shiny && shinyAvailable ? 'flash' : 'normal'}`} className="pet-art" src={art.src} fallbackSrc={art.fallbackSrc} alt={stageName} />
          </div>
          <div className="pet-summary">
            <strong title={stageName}>{stageName}</strong>
            <div className="pet-element-row">
              <span className={`element-badge ${ELEMENTS[pet.el].className}`}>{ELEMENTS[pet.el].label}</span>
              {shinyAvailable ? <button type="button" className={`shiny-toggle ${state.shiny ? 'active' : ''}`} onClick={() => onShiny(pet.id)} disabled={disabled} aria-label="Toggle shiny art">✦</button> : null}
            </div>
            <div className="pet-role-row">
              <span className="career-label"><img src={careerUrl(pet)} alt="" loading="lazy" /><span className="role-text">{getCareerName(pet)}</span></span>
              <span className="position-label">{pet.pos !== 2 ? <img src={positionUrl(pet)} alt="" loading="lazy" /> : null}<span className="role-text">{POSITION_LABELS[pet.pos] || `Position ${pet.pos}`}</span></span>
              <img className="rank-icon" src={gradeUrl(grade)} alt={`${grade.name} rank`} title={`Minimum grade: ${grade.name}`} loading="lazy" />
            </div>
          </div>
        </div>
        <StarVisual star={state.star} />
        <div className="pet-controls">
          <StarPicker id={pet.id} star={state.star} open={starOpen} disabled={disabled} onToggle={() => onStarMenu(pet.id)} onType={(type) => onStarType(pet.id, type)} onCount={(count) => onStarCount(pet.id, count)} />
          <div className="cost-hints">
            <span className="cost-hint"><img src={boxUrl()} alt="" loading="lazy" />{state.star >= MAX_STAR ? '★ max' : `${STAR_COST[state.star] || 0} → ★${state.star + 1}`}</span>
            {trialNext ? (
              <button type="button" className={`${nextTone} clickable`} onClick={(event) => onTrials(pet.id, event.currentTarget)} aria-label={`Show trial requirements for evolution ${trialNext.stage}`}><img src={boxUrl()} alt="" loading="lazy" />{nextLabel}</button>
            ) : (
              <span className={nextTone}><img src={boxUrl()} alt="" loading="lazy" />{nextLabel}</span>
            )}
          </div>
          <div className="evolution-row">
            <span className="control-label">Evolution</span>
            <div className="evolution-buttons">
              {Array.from({ length: maxEvo - minEvo + 1 }, (_, index) => index + minEvo).map((stage) => (
                <button type="button" key={stage} className={`evolution-button ${state.evo === stage ? 'selected' : ''}`} onClick={() => onEvolution(pet.id, stage)} disabled={disabled} style={{ '--evolution-color': getQuality(stage, pet).color, '--qc-ink': readableInk(getQuality(stage, pet).color) } as CSSProperties}>
                  {stage}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="stat-list">
          <StatChip stat="atk" label="Attack" value={stats.atk} grade={DATA.feedrank[state.gA] || DATA.feedrank[0]} feed={stats.feed.a} badge={stats.badge.a} disabled={disabled} onClick={() => onGrade(pet.id, 'gA', 1)} onContextMenu={() => onGrade(pet.id, 'gA', -1)} />
          <StatChip stat="hp" label="HP" value={stats.hp} grade={DATA.feedrank[state.gH] || DATA.feedrank[0]} feed={stats.feed.h} badge={stats.badge.h} disabled={disabled} onClick={() => onGrade(pet.id, 'gH', 1)} onContextMenu={() => onGrade(pet.id, 'gH', -1)} />
          <StatChip stat="def" label="Defense" value={stats.def} grade={DATA.feedrank[state.gD] || DATA.feedrank[0]} feed={stats.feed.d} badge={stats.badge.d} disabled={disabled} onClick={() => onGrade(pet.id, 'gD', 1)} onContextMenu={() => onGrade(pet.id, 'gD', -1)} />
        </div>
        {!stats.evolutionValid ? <div className="data-warning">Evolution data missing; factor 1 fallback</div> : null}
        <div className="pet-card-footer"><span>Badges {stats.badge.a}/{stats.badge.d}/{stats.badge.h}%</span><span>Battle level {stats.battleLevel}</span></div>
      </div>
    </article>
  )
}

function StarCostModal({ onClose }: { onClose: () => void }) {
  const rows: { start: number; end: number; cost: number; total: number }[] = []
  let start = 1
  while (start < MAX_STAR) {
    const cost = STAR_COST[start] || 0
    let end = start
    while (end + 1 < MAX_STAR && STAR_COST[end + 1] === cost) end += 1
    rows.push({ start, end, cost, total: duplicateCost(start, end + 1) })
    start = end + 1
  }
  const total = duplicateCost(1, MAX_STAR)
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="star-modal" role="dialog" aria-modal="true" aria-labelledby="star-modal-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close star cost reference">×</button>
        <h2 id="star-modal-title"><img src={boxUrl()} alt="" />Star cost reference</h2>
        <p className="modal-intro">Duplicate boxes advance one indexed star at a time. The complete 1 → {MAX_STAR} total is <strong>{formatCost(total)}</strong>.</p>
        <div className="table-scroll">
          <table className="cost-table">
            <thead><tr><th>Star transition</th><th>Boxes each</th><th>Boxes in range</th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.start}><td>★{row.start} → ★{row.end + 1}</td><td className="accent-cell">{row.cost}</td><td>{formatCost(row.total)}</td></tr>)}
              <tr className="total-row"><td>★1 → ★{MAX_STAR}</td><td>—</td><td>{formatCost(total)}</td></tr>
            </tbody>
          </table>
        </div>
        <h3>Evolution gates</h3>
        <p className="modal-intro">Each value is the star gate for the next stage of that pet.</p>
        <div className="table-scroll gate-scroll">
          <table className="cost-table gate-table">
            <thead><tr><th>Tatari</th><th>Base → 2</th><th>2 → 3</th><th>3 → 4</th></tr></thead>
            <tbody>
              {DATA.pets.map((pet) => <tr key={pet.id}><td>{getStageName(pet, 1)}</td>{[1, 2, 3].map((transition) => { const gate = getGate(pet.id, transition); return <td key={transition}>{gate === null ? '—' : `★${gate}`}</td> })}</tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function RosterPage({ header }: RosterPageProps) {
  const [initial] = useState(initialLoad)
  const [model, dispatch] = useReducer(modelReducer, initial.model)
  const [shared, setShared] = useState(initial.shared)
  const [status, setStatus] = useState<Status | null>(initial.error ? { message: initial.error, tone: 'error' } : null)
  const [modalOpen, setModalOpen] = useState(false)
  const [openStar, setOpenStar] = useState<number | null>(null)
  const [trialsTip, setTrialsTip] = useState<{ id: number; anchor: HTMLElement } | null>(null)
  const closeTrialsTip = useCallback(() => setTrialsTip(null), [])
  const [bulkStar, setBulkStar] = useState(64)
  const [bulkEvolution, setBulkEvolution] = useState(4)
  const [bulkGrade, setBulkGrade] = useState(0)
  const [order, setOrder] = useState<number[]>(() => sortIds(DATA.pets, initial.model.present, initial.model.ui.srt))
  const fileInput = useRef<HTMLInputElement>(null)
  const statusTimer = useRef<number | null>(null)
  const current = model.present
  const trialsPet = trialsTip ? getUnit(trialsTip.id) : null
  const trialsState = trialsTip ? current.R[petKey(trialsTip.id)] : undefined
  const trialsNext = trialsPet && trialsState ? nextEvolution(trialsPet, trialsState.star, trialsState.evo) : null
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === 'undefined' ? false : window.localStorage.getItem('tt_sidebar') === '1'))
  const [wikiArtFailed, setWikiArtFailed] = useState(false)
  const [, redrawForWikiArt] = useState(0)

  useEffect(() => {
    let active = true
    loadWikiStageArt().then(
      () => { if (active) redrawForWikiArt((count) => count + 1) },
      // The grid still renders on the game's own pet icons, so this is a notice
      // rather than an error - but a silent fallback would look like the scrape
      // had simply never found any artwork.
      () => { if (active) setWikiArtFailed(true) },
    )
    return () => { active = false }
  }, [])

  const showStatus = useCallback((message: string, tone: Status['tone'] = 'info') => {
    setStatus({ message, tone })
    if (statusTimer.current !== null && typeof window !== 'undefined') window.clearTimeout(statusTimer.current)
    if (typeof window !== 'undefined') statusTimer.current = window.setTimeout(() => setStatus(null), 5000)
  }, [])

  useEffect(() => () => {
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('tt_sidebar', sidebarOpen ? '1' : '0')
    } catch {
      return
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (!sidebarOpen || typeof window === 'undefined') return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [sidebarOpen])

  useEffect(() => {
    if (shared || typeof window === 'undefined') return
    try {
      window.localStorage.setItem('coc_roster', JSON.stringify({ R: current.R, GYM: current.GYM, ui: model.ui, TR: current.TR }))
      window.localStorage.setItem('coc_roster_ts', String(Math.floor(Date.now() / 1000)))
    } catch {
      return
    }
  }, [current, model.ui, shared])

  useEffect(() => {
    if (!modalOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [modalOpen])

  useEffect(() => {
    if (openStar === null) return
    const closeMenu = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('.star-picker')) setOpenStar(null)
    }
    document.addEventListener('click', closeMenu)
    return () => document.removeEventListener('click', closeMenu)
  }, [openStar])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shared || !(event.ctrlKey || event.metaKey)) return
      const target = event.target
      const textInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)
      if (textInput) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      } else if (key === 'y') {
        event.preventDefault()
        dispatch({ type: 'redo' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shared])

  const updateSnapshot = useCallback((updater: (snapshot: Snapshot) => Snapshot) => {
    if (shared) return
    dispatch({ type: 'commit', snapshot: updater(current) })
  }, [current, shared])

  const updatePet = useCallback((id: number, updater: (state: PetState) => PetState) => {
    updateSnapshot((snapshot) => {
      const pet = getUnit(id)
      const next = normalizePet(pet, updater(snapshot.R[petKey(id)]))
      return { ...snapshot, R: { ...snapshot.R, [petKey(id)]: next } }
    })
  }, [updateSnapshot])

  const handleOwn = useCallback((id: number, own: boolean) => updatePet(id, (state) => ({ ...state, own })), [updatePet])
  const handleShiny = useCallback((id: number) => {
    const pet = getUnit(id)
    if (!hasShiny(pet, current.R[petKey(id)].evo)) return
    updatePet(id, (state) => ({ ...state, shiny: !state.shiny }))
  }, [current.R, updatePet])
  const handleEvolution = useCallback((id: number, stage: number) => updatePet(id, (state) => ({ ...state, evo: stage })), [updatePet])
  const handleGrade = useCallback((id: number, key: GradeKey, direction: number) => {
    updatePet(id, (state) => ({ ...state, [key]: (state[key] + direction + DATA.feedrank.length) % DATA.feedrank.length }))
  }, [updatePet])
  const handleStarType = useCallback((id: number, type: number) => {
    updatePet(id, (state) => ({ ...state, star: type > 12 ? 72 + type - 12 : starFromParts(type, 1) }))
    setOpenStar(null)
  }, [updatePet])
  const handleStarCount = useCallback((id: number, count: number) => {
    updatePet(id, (state) => {
      const parts = starParts(state.star)
      return { ...state, star: starFromParts(parts.type, count) }
    })
  }, [updatePet])
  const handleBadge = useCallback((element: ElementId, floor: number) => {
    updateSnapshot((snapshot) => {
      const key = String(element)
      return { ...snapshot, GYM: { ...snapshot.GYM, [key]: snapshot.GYM[key] === floor ? Math.max(0, floor - 1) : floor } }
    })
  }, [updateSnapshot])
  const handleTrainer = useCallback((field: 'lvl' | 'pr', value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    updateSnapshot((snapshot) => {
      const level = field === 'lvl' ? clamp(Math.trunc(parsed), 1, DATA.maxtrainer || 2400) : snapshot.TR.lvl
      return { ...snapshot, TR: { lvl: level, pr: field === 'pr' ? clampProgress(level, Math.trunc(parsed)) : clampProgress(level, snapshot.TR.pr) } }
    })
  }, [updateSnapshot])

  const handleUndo = useCallback(() => {
    if (!shared) dispatch({ type: 'undo' })
  }, [shared])
  const handleRedo = useCallback(() => {
    if (!shared) dispatch({ type: 'redo' })
  }, [shared])

  const handleResort = useCallback(() => {
    setOrder(sortIds(DATA.pets, current, model.ui.srt))
    showStatus(`Roster sorted by ${model.ui.srt}.`, 'success')
  }, [current, model.ui.srt, showStatus])

  const handleSort = useCallback((value: string) => {
    if (!isSortKey(value)) return
    dispatch({ type: 'ui', ui: { srt: value } })
  }, [])

  const handleFilter = useCallback((value: string) => {
    if (!FILTERS.includes(value as (typeof FILTERS)[number])) return
    dispatch({ type: 'ui', ui: { flt: value } })
  }, [])

  const handleBulkApply = useCallback(() => {
    updateSnapshot((snapshot) => {
      const R = { ...snapshot.R }
      for (const pet of DATA.pets) {
        const [, maxEvo] = getEvoRange(pet.id)
        R[petKey(pet.id)] = normalizePet(pet, { ...R[petKey(pet.id)], star: bulkStar, evo: Math.min(bulkEvolution, maxEvo), gA: bulkGrade, gD: bulkGrade, gH: bulkGrade })
      }
      return { ...snapshot, R }
    })
    showStatus('Bulk roster values applied.', 'success')
  }, [bulkEvolution, bulkGrade, bulkStar, showStatus, updateSnapshot])
  const handleOwnAll = useCallback((owned: boolean) => {
    updateSnapshot((snapshot) => {
      const R = { ...snapshot.R }
      for (const pet of DATA.pets) R[petKey(pet.id)] = { ...R[petKey(pet.id)], own: owned }
      return { ...snapshot, R }
    })
    showStatus(owned ? 'All Tatari marked owned.' : 'All Tatari marked unowned.', 'success')
  }, [showStatus, updateSnapshot])
  const handleResetGrades = useCallback(() => {
    updateSnapshot((snapshot) => {
      const R = { ...snapshot.R }
      for (const pet of DATA.pets) R[petKey(pet.id)] = { ...R[petKey(pet.id)], gA: 0, gD: 0, gH: 0 }
      return { ...snapshot, R }
    })
    showStatus('All grades reset to E.', 'success')
  }, [showStatus, updateSnapshot])

  const handleExport = useCallback(() => {
    const payload = { v: 2, R: current.R, GYM: current.GYM, ui: model.ui }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'coc_roster.json'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    showStatus('Roster exported as coc_roster.json.', 'success')
  }, [current, model.ui, showStatus])

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file || shared) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isRecord(parsed) || !isRecord(parsed.R ?? parsed.r)) throw new Error('Roster data is required')
      const snapshot = normalizeSnapshot(parsed, true, false, parsed.r === undefined)
      snapshot.TR = parsed.TR || parsed.t ? normalizeTrainer(parsed.TR ?? parsed.t) : current.TR
      dispatch({ type: 'commit', snapshot })
      dispatch({ type: 'ui', ui: normalizeUi(parsed.ui) })
      showStatus(`Imported ${file.name}.`, 'success')
    } catch {
      showStatus('That file is not a valid roster JSON file.', 'error')
    } finally {
      input.value = ''
    }
  }, [current.TR, shared, showStatus])

  const handleShare = useCallback(async () => {
    const roster: Record<string, number[]> = {}
    DATA.pets.forEach((pet) => {
      const state = current.R[petKey(pet.id)]
      if (state?.own) roster[petKey(pet.id)] = [state.star, state.evo, state.gA, state.gD, state.gH, state.shiny ? 1 : 0]
    })
    const payload = { v: 1, r: roster, g: current.GYM, t: current.TR }
    let encoded = ''
    try {
      encoded = encodeState(payload)
      const link = `${window.location.origin}${window.location.pathname}${window.location.search}#r=${encoded}`
      try {
        window.history.replaceState(null, '', `#r=${encoded}`)
      } catch {
        showStatus('Roster link is ready to copy.', 'info')
      }
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'Tatari roster', text: 'Tatari roster', url: link })
          showStatus('Roster shared.', 'success')
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            showStatus('Share cancelled.', 'info')
            return
          }
        }
      }
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(link)
          showStatus('Share link copied to the clipboard.', 'success')
          return
        } catch {
          showStatus('Copy this roster link:', 'info')
        }
      }
      if (typeof window.prompt === 'function') window.prompt('Copy this roster link:', link)
      showStatus('Roster link ready to share.', 'success')
    } catch {
      showStatus('Could not create a roster link.', 'error')
    }
  }, [current, showStatus])

  const handleUseShared = useCallback(() => {
    if (!shared) return
    dispatch({ type: 'adopt', snapshot: current })
    setShared(false)
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    } catch {
      showStatus('Shared roster adopted locally.', 'success')
      return
    }
    showStatus('Shared roster is now your local roster.', 'success')
  }, [current, shared, showStatus])

  const visibleIds = useMemo(() => {
    const known = new Set(order)
    const complete = [...order.filter((id) => UNIT_BY_ID.has(id)), ...DATA.pets.map((pet) => pet.id).filter((id) => !known.has(id))]
    return complete.filter((id) => model.ui.flt === '0' || getUnit(id).el === Number(model.ui.flt))
  }, [model.ui.flt, order])
  const visiblePets = visibleIds.map((id) => getUnit(id))
  const ownedCount = DATA.pets.filter((pet) => current.R[petKey(pet.id)].own).length
  const trainer = current.TR
  const gym = current.GYM
  const progressMax = maxProgressForLevel(trainer.lvl)

  return (
    <div className="app-shell">
      {header}
      <main className="page">

        {shared ? <div className="shared-banner" role="status"><div><strong>Shared roster view</strong><span>Edits are disabled so this link cannot change your saved roster.</span></div><button type="button" onClick={handleUseShared}>Use this roster</button></div> : null}
        {wikiArtFailed ? <div className="data-warning-banner" role="status">Could not load the wiki artwork, so the cards are using the in-game icons. Run <code>npm run scrape_all</code> to refresh the cache.</div> : null}
        <div className="page-layout">
          <section className="roster-section">
            <div className="section-heading roster-heading"><div><span className="eyebrow">Collection</span><h2>Roster editor</h2></div><div className="owned-count"><strong>{ownedCount}</strong><span>of {DATA.pets.length} owned</span></div></div>
            <div className="panel roster-panel">
              <div className="roster-toolbar">
                <button type="button" onClick={handleResort}>Resort</button><button type="button" onClick={handleUndo} disabled={shared || model.past.length === 0}>Undo</button><button type="button" onClick={handleRedo} disabled={shared || model.future.length === 0}>Redo</button>
                <label className="select-field"><span>Element</span><select value={model.ui.flt} onChange={(event) => handleFilter(event.target.value)}><option value="0">All elements</option>{ELEMENT_ORDER.map((element) => <option value={String(element)} key={element}>{ELEMENTS[element].label}</option>)}</select></label>
                <label className="select-field"><span>Sort</span><select value={model.ui.srt} onChange={(event) => handleSort(event.target.value)}>{SORT_KEYS.map((sort) => <option value={sort} key={sort}>{sort === 'evostar' ? 'Evolution + star' : sort === 'id' ? 'ID' : sort === 'pow' ? 'Power' : sort === 'evo' ? 'Evolution' : sort === 'star' ? 'Stars' : sort === 'grade' ? 'Grades' : sort === 'el' ? 'Element' : sort === 'name' ? 'Name' : 'Ownership'}</option>)}</select></label>
                <button type="button" className="cost-reference-button" onClick={() => setModalOpen(true)}><img src={boxUrl()} alt="" />Cost reference</button>
              </div>
              <details className="advanced-panel"><summary>Advanced bulk controls</summary><div className="advanced-controls"><label>Star <input type="number" min="0" max={MAX_STAR} value={bulkStar} onChange={(event) => setBulkStar(clamp(integer(Number(event.target.value), 0), 0, MAX_STAR))} disabled={shared} /></label><label>Evolution <input type="number" min="1" max="4" value={bulkEvolution} onChange={(event) => setBulkEvolution(clamp(integer(Number(event.target.value), 1), 1, 4))} disabled={shared} /></label><label>Grade <select value={bulkGrade} onChange={(event) => setBulkGrade(Number(event.target.value))} disabled={shared}>{DATA.feedrank.map((grade, index) => <option value={index} key={grade.name}>{grade.name} +{grade.atk}%</option>)}</select></label><button type="button" onClick={handleBulkApply} disabled={shared}>Apply to all</button><button type="button" onClick={() => handleOwnAll(true)} disabled={shared}>Own all</button><button type="button" onClick={() => handleOwnAll(false)} disabled={shared}>Own none</button><button type="button" onClick={handleResetGrades} disabled={shared}>Reset grades</button></div></details>
              <div className="roster-grid">{visiblePets.map((pet) => <PetCard key={pet.id} pet={pet} state={current.R[petKey(pet.id)]} stats={computeStats(pet, current.R[petKey(pet.id)], current.TR, current.GYM)} disabled={shared} starOpen={openStar === pet.id} onOwn={handleOwn} onShiny={handleShiny} onStarMenu={(id) => { setTrialsTip(null); setOpenStar((value) => value === id ? null : id) }} onStarType={handleStarType} onStarCount={handleStarCount} onEvolution={handleEvolution} onGrade={handleGrade} onTrials={(id, anchor) => setTrialsTip({ id, anchor })} />)}</div>
              {visiblePets.length === 0 ? <div className="empty-state">No Tatari match this element.</div> : null}
            </div>
          </section>
          <Sidebar open={sidebarOpen} trainer={trainer} gym={gym} progressMax={progressMax} shared={shared} fileInput={fileInput} onTrainer={handleTrainer} onBadge={handleBadge} onShare={handleShare} onExport={handleExport} onImport={handleImport} onOpen={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)} />
        </div>
      </main>
      {status ? <div className={`toast ${status.tone}`} role="status" aria-live="polite">{status.message}</div> : null}
      {modalOpen ? <StarCostModal onClose={() => setModalOpen(false)} /> : null}
      {trialsTip && trialsPet && trialsState && trialsNext ? <TrialsTip pet={trialsPet} state={trialsState} next={trialsNext} anchor={trialsTip.anchor} onClose={closeTrialsTip} /> : null}
    </div>
  )
}

export default RosterPage
