import { DATA } from './gameData'

export const ASSET_ROOT = `${import.meta.env.BASE_URL}tatary-cache/img`

export type ElementId = 2 | 3 | 4 | 5 | 6
export type GymState = Record<string, number>
export type TrainerState = { lvl: number; pr: number }

export const ELEMENT_ORDER = [2, 3, 4, 6, 5] as const

export const ELEMENTS: Record<number, { label: string; className: string; color: string }> = {
  1: { label: 'Neutral', className: 'neutral', color: '#9aa4b8' },
  2: { label: 'Water', className: 'water', color: '#4da8ff' },
  3: { label: 'Fire', className: 'fire', color: '#ff765e' },
  4: { label: 'Grass', className: 'grass', color: '#63d391' },
  5: { label: 'Lightning', className: 'electric', color: '#f6c84c' },
  6: { label: 'Rock', className: 'earth', color: '#d58b67' },
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// Narrows an unknown JSON blob to something whose fields can be read. Shared by
// every module that parses scraped data or an imported roster.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assetUrl(path: string): string {
  return `${ASSET_ROOT}/${path}`
}

export function badgeBonuses(element: number, gym: GymState): { a: number; d: number; h: number } {
  const floor = gym[String(element)] || 0
  return DATA.badges.reduce(
    (total, badge) => {
      if (badge.el !== element || badge.floor > floor) return total
      return { a: total.a + badge.atk, d: total.d + badge.def, h: total.h + badge.hp }
    },
    { a: 0, d: 0, h: 0 },
  )
}

export function progressSteps(level: number): number[] {
  const row = DATA.ulvl[String(level)]
  if (!row) return []
  return Object.keys(row)
    .map((key) => Number(key))
    .filter((key) => Number.isInteger(key))
    .sort((a, b) => a - b)
}

export function maxProgressForLevel(level: number): number {
  const steps = progressSteps(level)
  if (steps.length === 0) return 0
  return steps[steps.length - 1]
}

export function clampProgress(level: number, progress: number): number {
  return clamp(progress, 0, maxProgressForLevel(level))
}

export function battleLevel(element: number, trainer: TrainerState): number {
  const row = DATA.ulvl[String(trainer.lvl)]?.[String(trainer.pr)]
  const elementIndex = DATA.elidx[String(element)] ?? 0
  return row?.[elementIndex] || 1
}

export function storyLabel(trainer: TrainerState): string {
  if (trainer.lvl >= 2000) return 'Legend'
  if (trainer.lvl >= 1000) return 'Veteran'
  if (trainer.lvl >= 300) return 'Pathfinder'
  if (trainer.lvl >= 50) return 'Rookie'
  return 'New arrival'
}
