// Roster state on disk: parsing, normalising and undo history, plus the
// debounced save that writes the snapshot back to localStorage. Nothing here
// renders - the React surface is the single hook at the bottom.
import { useCallback, useEffect, useRef } from 'react'
import { DATA } from '../gameData'
import type { PetUnit } from '../gameData'
import { ELEMENT_ORDER, clamp, clampProgress, isRecord } from '../domain'
import type { GymState, TrainerState } from '../domain'
import { MAX_STAR, getEvoRange, petKey } from '../petHelpers'
import type { PetState } from '../petHelpers'
import { SORT_KEYS } from './stats'
import type { RosterState, Snapshot, SortKey } from './stats'

export const FILTERS = ['0', '2', '3', '4', '6', '5'] as const

// Saving serializes the whole roster, so it is debounced rather than run on
// every edit: the first change schedules one write, and later changes only
// replace what that write will contain.
const SAVE_DEBOUNCE_MS = 300

export type UiState = { srt: SortKey; flt: string }
export type ModelState = { present: Snapshot; ui: UiState; past: Snapshot[]; future: Snapshot[] }
export type ModelAction =
  | { type: 'commit'; snapshot: Snapshot }
  | { type: 'update'; updater: (snapshot: Snapshot) => Snapshot }
  | { type: 'ui'; ui: Partial<UiState> }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'adopt'; snapshot: Snapshot }

export function integer(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.trunc(value)
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

export function normalizePet(pet: PetUnit, value: unknown, defaultOwn = true): PetState {
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

export function normalizeTrainer(value: unknown): TrainerState {
  const source = isRecord(value) ? value : {}
  const level = clamp(integer(source.lvl ?? source.level, 1), 1, DATA.maxtrainer || 2400)
  return {
    lvl: level,
    pr: clampProgress(level, integer(source.pr ?? source.progress, 0)),
  }
}

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && SORT_KEYS.includes(value as SortKey)
}

export function normalizeUi(value: unknown): UiState {
  const source = isRecord(value) ? value : {}
  return {
    srt: isSortKey(source.srt) ? source.srt : 'evostar',
    flt: typeof source.flt === 'string' && FILTERS.includes(source.flt as (typeof FILTERS)[number]) ? source.flt : '0',
  }
}

export function normalizeSnapshot(value: unknown, requireRoster = false, includeTrainer = true, defaultOwn = true): Snapshot {
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

export function encodeState(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
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

export function initialLoad(): { model: ModelState; shared: boolean; error: string } {
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

// A commit that turns out to be a no-op must not cost an undo step, so both
// paths through the reducer funnel through here.
function commit(state: ModelState, snapshot: Snapshot): ModelState {
  if (snapshotsEqual(state.present, snapshot)) return state
  return {
    ...state,
    present: snapshot,
    past: [...state.past, state.present].slice(-80),
    future: [],
  }
}

export function modelReducer(state: ModelState, action: ModelAction): ModelState {
  if (action.type === 'commit') return commit(state, action.snapshot)
  if (action.type === 'update') return commit(state, action.updater(state.present))
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

// Anything still pending is flushed when the tab goes away or when the roster
// unmounts - switching to the codex unmounts it, and an edit followed by that
// switch would otherwise be lost.
export function useRosterSave(snapshot: Snapshot, ui: UiState, shared: boolean): void {
  const saveTimer = useRef<number | null>(null)
  const pendingSave = useRef<(() => void) | null>(null)

  const flushSave = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const write = pendingSave.current
    pendingSave.current = null
    if (!write) return
    try {
      write()
    } catch {
      // A blocked store costs the save, never the edit that was just made.
    }
  }, [])

  useEffect(() => {
    if (shared || typeof window === 'undefined') return
    pendingSave.current = () => {
      window.localStorage.setItem('coc_roster', JSON.stringify({ R: snapshot.R, GYM: snapshot.GYM, ui, TR: snapshot.TR }))
      window.localStorage.setItem('coc_roster_ts', String(Math.floor(Date.now() / 1000)))
    }
    if (saveTimer.current === null) saveTimer.current = window.setTimeout(flushSave, SAVE_DEBOUNCE_MS)
  }, [snapshot, ui, shared, flushSave])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener('pagehide', flushSave)
    return () => {
      window.removeEventListener('pagehide', flushSave)
      flushSave()
    }
  }, [flushSave])
}
