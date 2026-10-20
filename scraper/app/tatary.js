// tatary.xyz source for the app scraper.
//
// A port of the standalone tatary scraper's JSON caching and asset discovery,
// trimmed to what the Roster tab renders. The game's own pet icons are
// deliberately NOT collected: the app scraper takes Tatari portraits from
// tatadex.org (falling back to wiki.gg), so the game's `pet/` files would be a
// third, unused copy. Everything else - the career, feed-rank, attribute, star,
// badge and trial icons - is published only by tatary.xyz and is collected here.
//
// The three JSON tables are write-through cached in public/app-cache/data, the
// same convention the standalone scraper uses, so a later phase can read them
// from the app cache without touching the old tatary cache.

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { log, warn } from '../lib/cli.js'
import { DATA_DIR, TATARY_BASE } from './config.js'

const petNamesFile = 'pet_names.json'

function validateUnits(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.pets)) throw new Error('units.json does not contain a pets array')
  if (!Array.isArray(value.feedrank) || !Array.isArray(value.badges)) throw new Error('units.json is missing roster data arrays')
  return value
}

function validatePetNames(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('pet_names.json does not contain an object')
  return value
}

function validateTrials(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('trials.json does not contain an object')
  if (!value.quests || typeof value.quests !== 'object') throw new Error('trials.json is missing quests')
  return value
}

const TABLES = [
  { fileName: 'units.json', key: 'units', validate: validateUnits },
  { fileName: petNamesFile, key: 'petNames', validate: validatePetNames },
  { fileName: 'trials.json', key: 'trials', validate: validateTrials },
]

function safeAssetPath(value) {
  if (typeof value !== 'string' || !value) return null
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || normalized.includes('\0') || /^[a-z]+:/i.test(normalized)) return null
  return normalized
}

/**
 * Which public/images category a tatary asset belongs to, or null for the ones
 * the Roster never renders (the game's own pet portraits). Filenames are
 * flattened to their base name: every tatary icon family uses its own prefix
 * (`grade_e.png`, `badge_1001.png`, `career_1.png`), so there are no collisions
 * inside a category.
 */
function categoryFor(assetPath) {
  const [dir] = assetPath.split('/')
  switch (dir) {
    case 'career':
      return 'misc'
    case 'grade':
      return 'grade'
    case 'attr':
      return 'attributes'
    case 'star':
      return 'stars'
    case 'badge':
      return 'dojo'
    case 'trial':
      return 'trials'
    default:
      if (assetPath === 'box.png') return 'misc'
      return null
  }
}

const assetBaseName = (assetPath) => assetPath.slice(assetPath.lastIndexOf('/') + 1)

function collectEvolutionQuestIds(units) {
  const questIds = new Set()
  for (const transitions of Object.values(units.evoquest || {})) {
    for (const list of Object.values(transitions || {})) {
      for (const questId of Array.isArray(list) ? list : []) questIds.add(String(questId))
    }
  }
  return questIds
}

/** The in-scope tatary asset paths, each with the provenance strings the existing scraper records. */
function collectAssets(units, trials) {
  const sources = new Map()
  const add = (assetPath, source) => {
    const normalized = safeAssetPath(assetPath)
    if (!normalized) return
    if (!sources.has(normalized)) sources.set(normalized, new Set())
    sources.get(normalized).add(source)
  }

  for (const [career, data] of Object.entries(units.careers || {})) {
    if (data?.img) add(`career/${data.img}`, `career:${career}`)
  }
  add('career/pos_front.png', 'position:front')
  add('career/pos_back.png', 'position:back')

  for (const [grade, data] of (units.feedrank || []).entries()) {
    if (data?.img) add(`grade/${data.img}`, `grade:${grade}`)
  }
  for (const stat of ['atk', 'def', 'hp']) add(`attr/${stat}.png`, `attribute:${stat}`)

  const maxStarIcon = Number(units.starmaxicon) || 24
  for (let index = 1; index <= maxStarIcon; index += 1) add(`star/star_${index}.png`, `star:${index}`)
  add('star/starbg_special.png', 'star:background:special')
  add('star/starbg_special_plus.png', 'star:background:special-plus')
  add('box.png', 'star:cost-box')

  for (const [index, badge] of (units.badges || []).entries()) {
    if (badge?.img) add(`badge/${badge.img}`, `badge:${index}:${badge.id ?? ''}`)
  }

  for (const questId of collectEvolutionQuestIds(units)) {
    const quest = trials.quests?.[questId]
    if (!quest) {
      warn(`trials.json has no quest ${questId} referenced by evoquest`)
      continue
    }
    if (quest.icon) add(`trial/${quest.icon}.png`, `trial:${questId}`)
    for (const [index, step] of (quest.multi?.steps || []).entries()) {
      if (step?.icon) add(`trial/${step.icon}.png`, `trial:${questId}:step:${index}`)
    }
  }

  return sources
}

/** Read one table from public/app-cache/data, or fetch and cache it. */
const LANGUAGE_KEYS = new Set(['ru', 'de', 'es', 'fr', 'pt', 'zh', 'ja', 'ko', 'zh-Hans', 'zh-Hant'])

// The app only ever renders English, so the other language branches of the
// tatary tables are dead weight in the cache and in the bundle. Strip them
// before the table is validated and written; once a table is in memory it is
// always the English-only shape.
function pruneLocalizedText(value) {
  if (Array.isArray(value)) {
    for (const entry of value) pruneLocalizedText(entry)
    return value
  }
  if (!value || typeof value !== 'object') return value
  for (const child of Object.values(value)) pruneLocalizedText(child)
  if (typeof value.en === 'string') {
    for (const key of Object.keys(value)) {
      if (key !== 'en' && LANGUAGE_KEYS.has(key)) delete value[key]
    }
  }
  return value
}

async function cacheTable(net, config, { fileName, key, validate }) {
  const destination = path.join(DATA_DIR, fileName)
  if (!config.force && existsSync(destination)) {
    try {
      const data = validate(pruneLocalizedText(JSON.parse(await readFile(destination, 'utf8'))))
      await writeFile(destination, `${JSON.stringify(data, null, 2)}`, 'utf8')
      log(`tatary.xyz: ${fileName} cached`)
      return { key, data, status: 'cached' }
    } catch {
      warn(`tatary.xyz: cached ${fileName} is invalid; refreshing it`)
    }
  }

  const data = validate(pruneLocalizedText(await net.tataryJson(fileName)))
  await writeFile(destination, `${JSON.stringify(data, null, 2)}`, 'utf8')
  log(`tatary.xyz: ${fileName} downloaded`)
  return { key, data, status: 'downloaded' }
}

/**
 * Scrape the three tatary tables and enumerate every in-scope icon.
 *
 * Returns the tables (for the roster game data) plus one job per icon:
 *   { category, filename, url, origin: 'tatary', remotePath, sources }
 */
export async function scrapeTatary(net, config) {
  await mkdir(DATA_DIR, { recursive: true })
  log(`tatary.xyz: reading game tables from ${TATARY_BASE}`)

  const tables = {}
  const statuses = {}
  for (const spec of TABLES) {
    const { data, status } = await cacheTable(net, config, spec)
    tables[spec.key] = data
    statuses[spec.key] = status
  }

  // Phase 3: keep the English stage names on the unit they belong to, so the
  // app can resolve a stage from one game record instead of a parallel
  // pet_names table. The original table is written unchanged after this pass.
  for (const pet of tables.units.pets) {
    const entry = tables.petNames?.[String(pet.id)]
    const evos = entry?.evos && typeof entry.evos === 'object' ? entry.evos : {}
    const stages = []
    for (const [stage, localized] of Object.entries(evos)) {
      const index = Number(stage) - 1
      if (!Number.isInteger(index) || index < 0) continue
      while (stages.length <= index) stages.push('')
      const name = localized?.en
      stages[index] = typeof name === 'string' ? name : ''
    }
    pet.stages = stages
  }
  await writeFile(path.join(DATA_DIR, 'units.json'), `${JSON.stringify(tables.units, null, 2)}`, 'utf8')
  log('tatary.xyz: units.json augmented with stage names')

  const sources = collectAssets(tables.units, tables.trials)
  const assets = []
  let skipped = 0
  for (const [remotePath, provenance] of sources) {
    const category = categoryFor(remotePath)
    if (!category) {
      skipped += 1
      continue
    }
    assets.push({
      category,
      filename: assetBaseName(remotePath),
      url: `${TATARY_BASE}/img/${remotePath}?v=${config.tataryVersion}`,
      origin: 'tatary',
      remotePath,
      sources: [...provenance].sort(),
    })
  }

  log(`tatary.xyz: ${assets.length} in-scope icons across ${new Set(assets.map((a) => a.category)).size} categories (${skipped} pet icons skipped)`)
  return { ...tables, statuses, assets }
}
