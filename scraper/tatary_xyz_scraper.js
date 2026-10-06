import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_ROOT = path.join(ROOT, 'public', 'tatary-cache')
const DATA_DIR = path.join(CACHE_ROOT, 'data')
const IMAGE_DIR = path.join(CACHE_ROOT, 'img')
const REMOTE_BASE = (process.env.TATARY_BASE_URL || 'https://tatary.xyz').replace(/\/+$/, '')
const REMOTE_VERSION = '?v=67f6264a'
const DEFAULT_DELAY_MS = 100
const MAX_RETRIES = 4
const TIMEOUT_MS = 30_000
// The one curated list of pets and stages that have no Glitter art. The pages
// read the same file, so the fallback shiny rules cannot drift between the
// scrape and what renders it.
const SHINY_EXCLUSIONS = JSON.parse(readFileSync(path.join(ROOT, 'shared', 'shiny.json'), 'utf8'))
const NO_SHINY_STAGES = new Set(SHINY_EXCLUSIONS.stages)
const NO_SHINY_IDS = new Set(SHINY_EXCLUSIONS.ids)

const log = (message, level = 'INFO') => console.log(`[${new Date().toISOString()}] [${level}] ${message}`)
const warn = (message) => log(message, 'WARN')
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function parseArgs(argv) {
  const values = new Set(argv)
  const valueAfter = (name, fallback) => {
    const index = argv.indexOf(name)
    return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback
  }
  const parsedDelay = Number(valueAfter('--delay', process.env.TATARY_SCRAPER_DELAY || DEFAULT_DELAY_MS))
  return {
    force: values.has('--force'),
    skipImages: values.has('--skip-images'),
    help: values.has('--help') || values.has('-h'),
    delay: Number.isFinite(parsedDelay) ? Math.max(0, parsedDelay) : DEFAULT_DELAY_MS,
  }
}

const CONFIG = parseArgs(process.argv.slice(2))

const HELP = `
Tatary roster resource scraper

Usage:
  node scripts/scraper-tatary.js [options]

Options:
  --force          Refresh JSON and image files already in the cache
  --skip-images    Refresh JSON and write the manifest without downloading images
  --delay <ms>     Delay between remote requests (default: ${DEFAULT_DELAY_MS})
  --help           Show this help

Output:
  public/tatary-cache/data/*.json
  public/tatary-cache/img/**
  public/tatary-cache/manifest.json
`

let lastRequestAt = 0

async function waitForRequestSlot() {
  if (!CONFIG.delay) return
  const wait = CONFIG.delay - (Date.now() - lastRequestAt)
  if (wait > 0) await sleep(wait)
}

function retryAfterMilliseconds(response) {
  const value = response.headers.get('retry-after')
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const retryAt = Date.parse(value)
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : null
}

async function fetchResource(resource, allowMissing = false) {
  const url = `${REMOTE_BASE}/${resource.replace(/^\/+/, '')}${REMOTE_VERSION}`
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await waitForRequestSlot()
    lastRequestAt = Date.now()
    let response
    try {
      response = await fetch(url, {
        headers: {
          Accept: '*/*',
          'User-Agent': 'clash-of-critters-roster-cache/1.0',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error
      const delay = Math.min(60_000, 500 * 2 ** attempt)
      warn(`${resource}: network error; retrying in ${delay}ms`)
      await sleep(delay)
      continue
    }

    if (response.ok) return response
    if (response.status === 404 && allowMissing) return null
    if (attempt === MAX_RETRIES) throw new Error(`${resource}: HTTP ${response.status}`)

    const retryAfter = response.status === 429 ? retryAfterMilliseconds(response) : null
    const delay = retryAfter ?? Math.min(60_000, 500 * 2 ** attempt)
    warn(`${resource}: HTTP ${response.status}; retrying in ${delay}ms`)
    await sleep(delay)
  }
  return null
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

  const manifestAssets = []
  let downloaded = 0
  let cached = 0
  let missing = 0
  let skipped = 0

  for (const [index, assetPath] of [...assets].sort().entries()) {
    let result
    if (CONFIG.skipImages) {
      result = { status: 'skipped' }
    } else {
      result = await cacheAsset(assetPath, CONFIG.force)
    }
    if (result.status === 'downloaded') downloaded += 1
    if (result.status === 'cached') cached += 1
    if (result.status === 'missing') missing += 1
    if (result.status === 'skipped') skipped += 1
    manifestAssets.push({
      path: assetPath,
      sources: [...(sources.get(assetPath) || [])],
      ...result,
    })
    if ((index + 1) % 25 === 0 || index + 1 === assets.size) {
      log(`Image progress: ${index + 1}/${assets.size} (downloaded=${downloaded}, cached=${cached}, missing=${missing}, skipped=${skipped})`)
    }
  }

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
  log(`Done: downloaded=${downloaded}, cached=${cached}, missing=${missing}, skipped=${skipped}`)
}

main().catch((error) => {
  log(error instanceof Error ? error.message : String(error), 'ERROR')
  process.exitCode = 1
})
