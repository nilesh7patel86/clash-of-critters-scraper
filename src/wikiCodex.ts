// Codex data layer.
//
// The roster editor is driven by units.json, which only knows the 65 units the
// game ships tables for. The codex is the opposite: it is built from the wiki
// cache, so it can show every documented line - including the 16 stages the
// game tables have no id for, such as the whole Dolphie family.
//
// Four files carry everything:
//   tataris.json        the 248 rows: art, rarity, role, skill, counters, grades
//   zoboHorde.json      the 66 evolution lines, with members in stage order
//   reference.json      the element and role icon vocabularies, plus meta
//   feedingUpgrades.json the 174 food-track upgrades a row's `feeding` indexes
//
// Nothing here needs a game id. A stage that has growth shows it; a stage that
// does not is simply reported as having no growth, rather than being given a
// fabricated zero.

import { PET_NAMES } from './gameData'

const DATA_ROOT = `${import.meta.env.BASE_URL}wiki-cache/data/`
const IMAGE_ROOT = `${import.meta.env.BASE_URL}wiki-cache/img/`

export type ElementName = 'Water' | 'Fire' | 'Grass' | 'Lightning' | 'Rock'

export interface WikiGrowth {
  attackGrowth: number
  defenseGrowth: number
  hpGrowth: number
  speedGrowth: number
}

export interface WikiSkill {
  name: string
  description: string
  types: string[]
  image: string | null
}

export interface WikiGrades {
  attack: string
  hp: string
  defense: string
}

export interface WikiFeedStep {
  index: number
  type: string
  grade: string
  effect: string
  requiredStarLevel: number | null
}

export interface WikiStage {
  name: string
  family: string | null
  /** 1-based position in the evolution line, or 1 for a standalone row. */
  stage: number
  detailsPage: string
  element: ElementName | null
  rarity: string | null
  role: string
  normal: string
  glitter: string | null
  /** The scraped filename pointed at another unit's portrait. */
  portraitRepaired: boolean
  /** Upstream names this file after a near-miss spelling of the unit's name. */
  portraitOddName: boolean
  skill: WikiSkill | null
  counters: string
  counteredBy: string
  grades: WikiGrades | null
  growth: WikiGrowth | null
  feeding: WikiFeedStep[]
  /** True when units.json can supply this stage's game tables. */
  inGameCache: boolean
}

export interface WikiHordeSkill {
  level: number
  name: string
  description: string
  image: string | null
}

export interface WikiLine {
  key: string
  name: string
  element: ElementName | null
  /** False when the Zobo Horde page has no entry for this line. */
  documented: boolean
  notes: string | null
  stages: WikiStage[]
  hordeSkills: WikiHordeSkill[]
}

export interface CodexModel {
  lines: WikiLine[]
  stages: WikiStage[]
  elements: { name: string; image: string }[]
  roles: { name: string; image: string }[]
  statIcons: { attack: string; hp: string; defense: string }
  scrapedAt: string | null
  totalTataris: number | null
  /** Stage names the game tables can back with numbers. */
  inGameCount: number
}

const ELEMENT_IDS: Record<string, ElementName> = {
  Water: 'Water',
  Fire: 'Fire',
  Grass: 'Grass',
  Lightning: 'Lightning',
  Rock: 'Rock',
}

// Rarity strings map cleanly onto the quality ids the game uses, so a wiki-only
// row can still be given the same colour the roster editor would have used.
const RARITY_QUALITY: Record<string, number> = {
  Blue: 2,
  Purple: 3,
  Gold: 4,
  Red: 5,
  Rainbow: 6,
}

export const RARITY_COLORS: Record<string, string> = {
  Blue: '#6da9e9',
  Purple: '#8f5ae2',
  Gold: '#f5c54e',
  Red: '#f20c00',
  Rainbow: '#ff4fd8',
}

// Neon cores for the codex discs. A near-white tint of each hue sits at the
// top of the gradient and the plain rarity colour lights the rim, which is
// what makes the disc read as lit glass rather than a painted chip.
export const RARITY_NEON: Record<string, string> = {
  Blue: '#a9e6ff',
  Purple: '#d9b0ff',
  Gold: '#ffeeb0',
  Red: '#ffab9c',
  Rainbow: '#ffbdf0',
}

export const RARITY_ORDER = ['Blue', 'Purple', 'Gold', 'Red', 'Rainbow'] as const

export const ELEMENT_COLORS: Record<ElementName, string> = {
  Water: '#4da8ff',
  Fire: '#ff765e',
  Grass: '#63d391',
  Lightning: '#f6c84c',
  Rock: '#d58b67',
}

export const ELEMENT_ORDER: ElementName[] = ['Water', 'Fire', 'Grass', 'Lightning', 'Rock']

// The wiki grades its starting stats with letters. The bar widths below are a
// reading aid only - they are not the numbers the game computes.
const GRADE_WEIGHT: Record<string, number> = { E: 0.25, D: 0.42, C: 0.58, B: 0.74, A: 0.88, S: 1 }

export function gradeWeight(grade: string | undefined): number {
  if (!grade) return 0
  return GRADE_WEIGHT[grade] ?? 0.15
}

export function rarityQuality(rarity: string | null): number | null {
  if (!rarity) return null
  return RARITY_QUALITY[rarity] ?? null
}

export function wikiImageUrl(filename: string | null | undefined): string | null {
  return filename ? `${IMAGE_ROOT}${encodeURIComponent(filename)}` : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

// Every stage name the 65 game units can produce. A wiki row whose name is in
// this set is backed by real game tables; the rest are wiki-only.
const gameStageNames = (() => {
  const names = new Set<string>()
  for (const entry of Object.values(PET_NAMES)) {
    for (const stage of Object.values(entry?.evos ?? {})) {
      const name = (stage as { en?: unknown } | undefined)?.en
      if (typeof name === 'string' && name) names.add(name)
    }
  }
  return names
})()

function parseSkill(value: unknown): WikiSkill | null {
  if (!isRecord(value)) return null
  const name = text(value.skillName)
  if (!name) return null
  return {
    name,
    description: text(value.skillDescription),
    types: Array.isArray(value.skillTypes) ? value.skillTypes.filter((t): t is string => typeof t === 'string') : [],
    image: nullableText(value.skillImage),
  }
}

function parseGrades(value: unknown): WikiGrades | null {
  if (!isRecord(value)) return null
  const attack = text(value.attack)
  const hp = text(value.hp)
  const defense = text(value.defense)
  if (!attack && !hp && !defense) return null
  return { attack, hp, defense }
}

function parseGrowth(value: unknown): WikiGrowth | null {
  if (!isRecord(value)) return null
  const { attackGrowth, defenseGrowth, hpGrowth, speedGrowth } = value
  if (typeof attackGrowth !== 'number' || typeof defenseGrowth !== 'number') return null
  return {
    attackGrowth,
    defenseGrowth,
    hpGrowth: typeof hpGrowth === 'number' ? hpGrowth : 0,
    speedGrowth: typeof speedGrowth === 'number' ? speedGrowth : 0,
  }
}

function parseFeed(raw: unknown, upgrades: unknown[]): WikiFeedStep[] {
  if (!Array.isArray(raw)) return []
  const steps: WikiFeedStep[] = []
  for (const index of raw) {
    if (typeof index !== 'number' || !Number.isInteger(index)) continue
    const upgrade = upgrades[index]
    if (!isRecord(upgrade)) continue
    steps.push({
      index,
      type: text(upgrade.type),
      grade: text(upgrade.grade),
      effect: text(upgrade.effect),
      requiredStarLevel: typeof upgrade.requiredStarLevel === 'number' ? upgrade.requiredStarLevel : null,
    })
  }
  return steps
}

interface RawRow {
  name: string
  family: string | null
  detailsPage: string
  element: ElementName | null
  rarity: string | null
  role: string
  normal: string
  glitter: string | null
  portraitRepaired: boolean
  portraitOddName: boolean
  skill: WikiSkill | null
  counters: string
  counteredBy: string
  grades: WikiGrades | null
  growth: WikiGrowth | null
  feeding: number[]
  inGameCache: boolean
}

function readRows(value: unknown): RawRow[] {
  if (!Array.isArray(value)) throw new Error('wiki-cache/data/tataris.json is not an array')
  const rows: RawRow[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const name = text(entry.name)
    if (!name) continue
    const scraped = text(entry.normalImage)
    const tatary = isRecord(entry.tatary) ? entry.tatary : null

    rows.push({
      name,
      family: nullableText(entry.zoboHordeFamily),
      detailsPage: text(entry.detailsPage),
      element: ELEMENT_IDS[text(entry.type)] ?? null,
      rarity: nullableText(entry.rarity),
      role: text(entry.role),
      normal: scraped,
      glitter: nullableText(entry.glitterImage),
      // A portrait is only "repaired" when the scraped name is a *different*
      // row's name, which is the Rockwu/Rockong swap. A near-miss spelling such
      // as Thunderclaw.png for Thunderpaw is the unit's only artwork and stays.
      portraitRepaired: false,
      portraitOddName: scraped !== '' && scraped.replace(/\.png$/i, '') !== name,
      skill: parseSkill(entry.skill),
      counters: text(entry.counters),
      counteredBy: text(entry.counteredBy),
      grades: parseGrades(entry.initialStats),
      growth: parseGrowth(tatary ? tatary.growth : null),
      feeding: Array.isArray(entry.feeding) ? entry.feeding.filter((n): n is number => typeof n === 'number') : [],
      inGameCache: gameStageNames.has(name),
    })
  }
  return rows
}

function parseHordeFamilies(value: unknown): Map<string, WikiHordeSkill[]> {
  const byLine = new Map<string, WikiHordeSkill[]>()
  if (!isRecord(value) || !Array.isArray(value.families)) return byLine
  for (const family of value.families) {
    if (!isRecord(family)) continue
    const name = text(family.name)
    if (!name) continue
    const skills: WikiHordeSkill[] = []
    for (const skill of Array.isArray(family.skills) ? family.skills : []) {
      if (!isRecord(skill)) continue
      const skillName = text(skill.name)
      if (!skillName) continue
      skills.push({
        level: typeof skill.level === 'number' ? skill.level : 0,
        name: skillName,
        description: text(skill.description),
        image: nullableText(skill.image),
      })
    }
    skills.sort((a, b) => a.level - b.level)
    byLine.set(name, skills)
  }
  return byLine
}

async function fetchJson(file: string): Promise<unknown> {
  const url = `${DATA_ROOT}${file}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

function toLine(key: string, name: string, stages: WikiStage[], documented: boolean, notes: string | null, skills: WikiHordeSkill[]): WikiLine {
  return { key, name, element: stages[0]?.element ?? null, documented, notes, stages, hordeSkills: skills }
}

export function buildModel(tataris: unknown, zoboHorde: unknown, reference: unknown, feedingUpgrades: unknown): CodexModel {
  const rows = readRows(tataris)
  const upgrades = Array.isArray(feedingUpgrades) ? feedingUpgrades : []
  const hordeSkills = parseHordeFamilies(zoboHorde)
  const byName = new Map(rows.map((row) => [row.name, row]))

  // The two rows that point at each other's portrait are the only ones that can
  // be repaired, because only they have a file under their own name. The set of
  // scraped filenames is snapshotted first: rewriting Rockwu to Rockwu.png
  // during the walk would otherwise make Rockong look like it had no file left.
  const rowNames = new Set(rows.map((row) => row.name))
  const scrapedFiles = new Set(rows.map((row) => row.normal))
  for (const row of rows) {
    const stem = row.normal.replace(/\.png$/i, '')
    if (stem !== row.name && rowNames.has(stem) && scrapedFiles.has(`${row.name}.png`)) {
      row.normal = `${row.name}.png`
      row.portraitRepaired = true
      row.portraitOddName = false
    }
  }

  const toStage = (row: RawRow, stage: number): WikiStage => ({
    name: row.name,
    family: row.family,
    stage,
    detailsPage: row.detailsPage,
    element: row.element,
    rarity: row.rarity,
    role: row.role,
    normal: row.normal,
    glitter: row.glitter,
    portraitRepaired: row.portraitRepaired,
    portraitOddName: row.portraitOddName,
    skill: row.skill,
    counters: row.counters,
    counteredBy: row.counteredBy,
    grades: row.grades,
    growth: row.growth,
    feeding: parseFeed(row.feeding, upgrades),
    inGameCache: row.inGameCache,
  })

  const lines: WikiLine[] = []
  const claimed = new Set<string>()

  // zoboHorde.json carries the authoritative member order for each line, so the
  // families are built from it rather than from the order of the rows.
  if (isRecord(zoboHorde) && Array.isArray(zoboHorde.families)) {
    for (const family of zoboHorde.families) {
      if (!isRecord(family)) continue
      const name = text(family.name)
      if (!name) continue
      const members = Array.isArray(family.members) ? family.members : []
      const rowsInOrder = members
        .map((member) => byName.get(text(member)))
        .filter((row): row is RawRow => Boolean(row))
      if (rowsInOrder.length === 0) continue
      rowsInOrder.forEach((row) => claimed.add(row.name))
      const stages = rowsInOrder.map((row, index) => toStage(row, index + 1))
      lines.push(
        toLine(
          `line:${name}`,
          name,
          stages,
          family.documented === true,
          nullableText(family.notes),
          hordeSkills.get(name) ?? [],
        ),
      )
    }
  }

  // Anything the Horde page does not cover still belongs on the page: the
  // Dolphie line and the six ungrouped rows would otherwise be invisible.
  const loose = rows.filter((row) => !claimed.has(row.name))
  const byFamily = new Map<string, RawRow[]>()
  for (const row of loose) {
    const key = row.family ?? row.name
    byFamily.set(key, [...(byFamily.get(key) ?? []), row])
  }
  for (const [key, familyRows] of byFamily) {
    const stages = familyRows.map((row, index) => toStage(row, index + 1))
    lines.push(
      toLine(
        familyRows[0].family ? `line:${key}` : `solo:${key}`,
        key,
        stages,
        hordeSkills.has(key),
        null,
        hordeSkills.get(key) ?? [],
      ),
    )
  }

  lines.sort((a, b) => a.name.localeCompare(b.name))

  const iconList = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(isRecord).map((item) => ({ name: text(item.name), image: text(item.image) })).filter((item) => item.image)
      : []
  const statIcons = isRecord(reference) && isRecord(reference.statIcons) ? reference.statIcons : {}
  const meta = isRecord(reference) && isRecord(reference.meta) ? reference.meta : {}

  return {
    lines,
    stages: lines.flatMap((line) => line.stages),
    elements: iconList(isRecord(reference) ? reference.types : null),
    roles: iconList(isRecord(reference) ? reference.roles : null),
    statIcons: {
      attack: text(statIcons.attack),
      hp: text(statIcons.hp),
      defense: text(statIcons.defense),
    },
    scrapedAt: nullableText(meta.scrapedAt),
    totalTataris: typeof meta.totalTataris === 'number' ? meta.totalTataris : null,
    inGameCount: rows.filter((row) => row.inGameCache).length,
  }
}

let cached: Promise<CodexModel> | null = null

export function loadCodex(): Promise<CodexModel> {
  if (!cached) {
    cached = Promise.all([fetchJson('tataris.json'), fetchJson('zoboHorde.json'), fetchJson('reference.json'), fetchJson('feedingUpgrades.json')])
      .then(([tataris, zoboHorde, reference, feedingUpgrades]) => buildModel(tataris, zoboHorde, reference, feedingUpgrades))
      .catch((error: unknown) => {
        // Clearing the promise lets a retry re-request rather than replay the
        // failure for the rest of the session.
        cached = null
        throw error
      })
  }
  return cached
}
