import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log, parseCliArgs, warn } from './lib/cli.js'
import { createRequestGate, fetchWithRetry } from './lib/http.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_ROOT = path.join(ROOT, 'public', 'tatary-cache')
const DATA_DIR = path.join(CACHE_ROOT, 'data')
const IMAGE_DIR = path.join(CACHE_ROOT, 'img')
const REMOTE_BASE = (process.env.TATARY_BASE_URL || 'https://tatary.xyz').replace(/\/+$/, '')
const REMOTE_VERSION = '?v=67f6264a'
const DEFAULT_DELAY_MS = 100
const MAX_RETRIES = 4
const TIMEOUT_MS = 30_000
const DEFAULT_IMAGE_CONCURRENCY = 4
// The one curated list of pets and stages that have no Glitter art. The pages
// read the same file, so the fallback shiny rules cannot drift between the
// scrape and what renders it.
const SHINY_EXCLUSIONS = JSON.parse(readFileSync(path.join(ROOT, 'shared', 'shiny.json'), 'utf8'))
const NO_SHINY_STAGES = new Set(SHINY_EXCLUSIONS.stages)
const NO_SHINY_IDS = new Set(SHINY_EXCLUSIONS.ids)

// `--delay` wins; otherwise TATARY_SCRAPER_DELAY; otherwise the default.
// Resolved to a number up front so the spec below only ever sees numbers, and
// so an unset or nonsense environment variable falls back instead of clamping.
const pickDelay = () => {
  const fromEnv = Number(process.env.TATARY_SCRAPER_DELAY)
  return Number.isFinite(fromEnv) ? Math.max(0, fromEnv) : DEFAULT_DELAY_MS
}

const CONFIG = parseCliArgs(process.argv.slice(2), {
  flags: {
    force: ['--force'],
    skipImages: ['--skip-images'],
    help: ['--help', '-h'],
  },
  options: {
    delay: { flag: '--delay', number: true, min: 0, default: pickDelay() },
    imageConcurrency: { flag: '--image-concurrency', number: true, min: 1, default: DEFAULT_IMAGE_CONCURRENCY },
  },
})

const HELP = `
Tatary roster resource scraper

Usage:
  node scraper/tatary_xyz_scraper.js [options]

Options:
  --force                 Refresh JSON and image files already in the cache
  --skip-images           Refresh JSON and write the manifest without downloading images
  --delay <ms>            Delay between remote requests (default: ${DEFAULT_DELAY_MS})
  --image-concurrency <n> Parallel image downloads (default: ${DEFAULT_IMAGE_CONCURRENCY})
  --help                  Show this help

Output:
  public/tatary-cache/data/*.json
  public/tatary-cache/img/**
  public/tatary-cache/manifest.json
`

// Every remote request starts behind this gate: the spacing between request
// *starts* is --delay, computed under a lock so concurrent workers are given
// distinct slots rather than all observing the same one and setting off
// together. That is what makes it safe to run the image pool below through the
// same gate the JSON fetches use.
const requestGate = createRequestGate(CONFIG.delay)

/**
 * One GET against tatary.xyz with the shared retry policy: backoff, Retry-After
 * honoured on 429, and a 404 reported as null for an asset the game may simply
 * not have yet - so the caller counts it as missing instead of failing the run.
 *
 * Anything else that is not a retryable status (429/5xx) fails immediately.
 * The old loop retried every non-404 status, which asked an absent path for the
 * same bytes five times before admitting it; the answer does not change.
 */
async function fetchResource(resource, allowMissing = false) {
  const url = `${REMOTE_BASE}/${resource.replace(/^\/+/, '')}${REMOTE_VERSION}`
  return fetchWithRetry(url, {
    responseType: 'response',
    retries: MAX_RETRIES,
    backoffBaseMs: 500,
    backoffMaxMs: 60_000,
    timeoutMs: TIMEOUT_MS,
    headers: {
      Accept: '*/*',
      'User-Agent': 'clash-of-critters-roster-cache/1.0',
    },
    beforeAttempt: requestGate,
    handleStatus: (response) => {
      if (response.status === 404 && allowMissing) return { value: null }
      return undefined
    },
  })
}

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

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function cacheJson(fileName, validator) {
  const destination = path.join(DATA_DIR, fileName)
  if (!CONFIG.force && existsSync(destination)) {
    try {
      const cached = validator(await readJsonFile(destination))
      log(`${fileName}: using cached copy`)
      return { data: cached, status: 'cached' }
    } catch {
      warn(`${fileName}: cached copy is invalid; refreshing it`)
    }
  }

  const response = await fetchResource(fileName)
  if (!response) throw new Error(`${fileName}: remote response was empty`)
  const data = validator(await response.json())
  await writeFile(destination, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  log(`${fileName}: downloaded`)
  return { data, status: 'downloaded' }
}

function safeAssetPath(value) {
  if (typeof value !== 'string' || !value) return null
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || normalized.includes('\0') || /^[a-z]+:/i.test(normalized)) return null
  return normalized
}

function addAsset(assetPath, source, assets, sources) {
  const normalized = safeAssetPath(assetPath)
  if (!normalized) return
  assets.add(normalized)
  if (!sources.has(normalized)) sources.set(normalized, new Set())
  sources.get(normalized).add(source)
}

function collectEvolutionQuestIds(units) {
  const questIds = new Set()
  for (const transitions of Object.values(units.evoquest || {})) {
    for (const list of Object.values(transitions || {})) {
      for (const questId of Array.isArray(list) ? list : []) questIds.add(String(questId))
    }
  }
  return questIds
}

function collectAssets(units, trials) {
  const assets = new Set()
  const sources = new Map()

  for (const pet of units.pets || []) {
    const id = String(pet.id)
    const icons = units.peticons?.[id] || {}
    for (const [stage, filename] of Object.entries(icons)) {
      const normal = safeAssetPath(filename)
      if (!normal) continue
      addAsset(`pet/${normal}`, `pet:${id}:${stage}`, assets, sources)
      const shinyAvailable = Number(pet.id) > 10 && !NO_SHINY_IDS.has(Number(pet.id)) && !NO_SHINY_STAGES.has(`${id}:${stage}`)
      if (shinyAvailable && /\.png$/i.test(normal)) {
        addAsset(`pet/${normal.replace(/\.png$/i, '_flash.png')}`, `pet:${id}:${stage}:shiny`, assets, sources)
      }
    }
  }

  for (const [career, data] of Object.entries(units.careers || {})) {
    if (data?.img) addAsset(`career/${data.img}`, `career:${career}`, assets, sources)
  }
  addAsset('career/pos_front.png', 'position:front', assets, sources)
  addAsset('career/pos_back.png', 'position:back', assets, sources)

  for (const [grade, data] of (units.feedrank || []).entries()) {
    if (data?.img) addAsset(`grade/${data.img}`, `grade:${grade}`, assets, sources)
  }
  for (const stat of ['atk', 'def', 'hp']) addAsset(`attr/${stat}.png`, `attribute:${stat}`, assets, sources)

  const maxStarIcon = Number(units.starmaxicon) || 24
  for (let index = 1; index <= maxStarIcon; index += 1) addAsset(`star/star_${index}.png`, `star:${index}`, assets, sources)
  addAsset('star/starbg_special.png', 'star:background:special', assets, sources)
  addAsset('star/starbg_special_plus.png', 'star:background:special-plus', assets, sources)
  addAsset('box.png', 'star:cost-box', assets, sources)

  for (const [index, badge] of (units.badges || []).entries()) {
    if (badge?.img) addAsset(`badge/${badge.img}`, `badge:${index}:${badge.id ?? ''}`, assets, sources)
  }

  for (const questId of collectEvolutionQuestIds(units)) {
    const quest = trials.quests?.[questId]
    if (!quest) {
      warn(`trials.json has no quest ${questId} referenced by evoquest`)
      continue
    }
    if (quest.icon) addAsset(`trial/${quest.icon}.png`, `trial:${questId}`, assets, sources)
    for (const [index, step] of (quest.multi?.steps || []).entries()) {
      if (step?.icon) addAsset(`trial/${step.icon}.png`, `trial:${questId}:step:${index}`, assets, sources)
    }
  }

  return { assets, sources }
}

async function cacheAsset(assetPath, force) {
  const destination = path.join(IMAGE_DIR, assetPath)
  if (!force && existsSync(destination)) {
    try {
      const info = await stat(destination)
      if (info.isFile() && info.size > 0) {
        return { status: 'cached', localFile: path.relative(ROOT, destination).replaceAll('\\', '/') }
      }
    } catch {
    }
  }

  const response = await fetchResource(`img/${assetPath}`, true)
  if (!response) return { status: 'missing', error: 'HTTP 404' }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) return { status: 'missing', error: 'Empty response' }
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, bytes)
  return { status: 'downloaded', localFile: path.relative(ROOT, destination).replaceAll('\\', '/') }
}

async function main() {
  if (CONFIG.help) {
    console.log(HELP)
    return
  }

  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(IMAGE_DIR, { recursive: true })

  log(`Scraping Tatary resources from ${REMOTE_BASE}`)
  const unitsResult = await cacheJson('units.json', validateUnits)
  const namesResult = await cacheJson('pet_names.json', validatePetNames)
  const trialsResult = await cacheJson('trials.json', validateTrials)
  const { assets, sources } = collectAssets(unitsResult.data, trialsResult.data)
  log(`Discovered ${assets.size} image assets`)

  const ordered = [...assets].sort()
  const results = new Array(ordered.length)
  const counts = { downloaded: 0, cached: 0, missing: 0, skipped: 0 }
  let completed = 0

  // Workers fill `results` by index, not in completion order, so the manifest
  // comes out byte-identical to the serial loop this pool replaced no matter
  // which worker got which file. Progress is reported every 25 completions,
  // with whichever statuses have actually happened by then rather than a
  // prefix of the sorted list.
  const settle = (index, result) => {
    results[index] = result
    counts[result.status] += 1
    completed += 1
    if (completed % 25 === 0 || completed === ordered.length) {
      log(`Image progress: ${completed}/${ordered.length} (downloaded=${counts.downloaded}, cached=${counts.cached}, missing=${counts.missing}, skipped=${counts.skipped})`)
    }
  }

  if (CONFIG.skipImages) {
    for (const index of ordered.keys()) settle(index, { status: 'skipped' })
  } else {
    let cursor = 0
    const worker = async () => {
      while (cursor < ordered.length) {
        const index = cursor
        cursor += 1
        // Failures propagate: one asset that exhausts its retries fails the
        // run exactly as it did when every asset was fetched in a serial loop.
        settle(index, await cacheAsset(ordered[index], CONFIG.force))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONFIG.imageConcurrency, ordered.length) }, worker))
  }

  const manifestAssets = ordered.map((assetPath, index) => ({
    path: assetPath,
    sources: [...(sources.get(assetPath) || [])],
    ...results[index],
  }))

  const manifest = {
    version: 1,
    source: REMOTE_BASE,
    remoteVersion: REMOTE_VERSION,
    scrapedAt: new Date().toISOString(),
    data: {
      units: { path: 'data/units.json', status: unitsResult.status },
      petNames: { path: 'data/pet_names.json', status: namesResult.status },
      trials: { path: 'data/trials.json', status: trialsResult.status },
    },
    assets: manifestAssets,
  }
  await writeFile(path.join(CACHE_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  log(`Wrote ${path.join(CACHE_ROOT, 'manifest.json')}`)
  log(`Done: downloaded=${counts.downloaded}, cached=${counts.cached}, missing=${counts.missing}, skipped=${counts.skipped}`)
}

main().catch((error) => {
  log(error instanceof Error ? error.message : String(error), 'ERROR')
  process.exitCode = 1
})
