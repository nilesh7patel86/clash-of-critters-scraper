import { existsSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log, parseCliArgs, warn } from './lib/cli.js'
import { createRequestGate, fetchWithRetry } from './lib/http.js'
import { flatImageNames, pageAssets, parseDetail, parseIndex } from './lib/tatadex.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_ROOT = path.join(ROOT, 'public', 'tatadex-cache')
const DATA_DIR = path.join(CACHE_ROOT, 'data')
const IMAGE_DIR = path.join(CACHE_ROOT, 'img')
const REMOTE_BASE = (process.env.TATADDEX_BASE_URL || 'https://tatadex.org').replace(/\/+$/, '')
const DEFAULT_DELAY_MS = 100
const MAX_RETRIES = 4
const TIMEOUT_MS = 30_000
const PAGE_CONCURRENCY = 4
const DEFAULT_IMAGE_CONCURRENCY = 4

// `--delay` wins; otherwise TATDEX_SCRAPER_DELAY; otherwise the default.
const pickDelay = () => {
  const fromEnv = Number(process.env.TATDEX_SCRAPER_DELAY)
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
    limit: { flag: '--limit', number: true, min: 0, default: 0 },
    imageConcurrency: { flag: '--image-concurrency', number: true, min: 1, default: DEFAULT_IMAGE_CONCURRENCY },
  },
})

const HELP = `
Tatadex Tatari scraper

Usage:
  node scraper/tatadex_scraper.js [options]

Options:
  --force                 Refresh image files already in the cache (pages are always refetched)
  --skip-images           Write the data files and manifest without downloading images
  --limit <n>             Scrape only the first n detail pages (the index is always fully read)
  --delay <ms>            Delay between remote request starts (default: ${DEFAULT_DELAY_MS})
  --image-concurrency <n> Parallel image downloads (default: ${DEFAULT_IMAGE_CONCURRENCY})
  --help                  Show this help

Output:
  public/tatadex-cache/data/roster.json    catalog index: cards, counts, provenance
  public/tatadex-cache/data/tataris.json   detail records keyed by slug
  public/tatadex-cache/img/                every in-scope image the pages reference, stored flat
  public/tatadex-cache/manifest.json       run manifest: site path -> filename map, statuses,
                                           unresolved report

Scope: the Animations gallery, the Wild Tatari Dex (Lineage connection) and the
Zobo Horde advances panels are not scraped, and no image or video from them -
or from the skill video stage - is downloaded.
`

// Every remote request starts behind this gate: the spacing between request
// *starts* is --delay, computed under a lock so the page and image pools below
// are given distinct slots rather than all arriving together.
const requestGate = createRequestGate(CONFIG.delay)

async function fetchPage(pathname) {
  return fetchWithRetry(`${REMOTE_BASE}${pathname}`, {
    responseType: 'text',
    retries: MAX_RETRIES,
    backoffBaseMs: 500,
    backoffMaxMs: 60_000,
    timeoutMs: TIMEOUT_MS,
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'clash-of-critters-tatadex-cache/1.0',
    },
    beforeAttempt: requestGate,
    // A missing page is the caller's problem to report, not a reason to fail
    // the run: known site-only slugs have been observed to 404.
    handleStatus: (response) => (response.status === 404 ? { value: null } : undefined),
  })
}

async function fetchImage(assetPath) {
  return fetchWithRetry(`${REMOTE_BASE}${assetPath}`, {
    responseType: 'arraybuffer',
    retries: MAX_RETRIES,
    backoffBaseMs: 500,
    backoffMaxMs: 60_000,
    timeoutMs: TIMEOUT_MS,
    headers: {
      Accept: 'image/*',
      'User-Agent': 'clash-of-critters-tatadex-cache/1.0',
    },
    beforeAttempt: requestGate,
    handleStatus: (response) => (response.status === 404 ? { value: null } : undefined),
  })
}

// Every site path has exactly one flat file name inside IMAGE_DIR - see
// flatImageNames for how collisions such as the card art beside its skill icon
// are resolved. `fileName` is looked up by the caller, never derived here, so
// the manifest and the disk always agree on where the bytes live.
async function cacheAsset(assetPath, fileName, force) {
  const destination = path.join(IMAGE_DIR, fileName)
  if (!force && existsSync(destination)) {
    try {
      const info = await stat(destination)
      if (info.isFile() && info.size > 0) {
        return { status: 'cached', localFile: path.relative(ROOT, destination).replaceAll('\\', '/') }
      }
    } catch {
      // Unreadable - fall through and fetch it again.
    }
  }

  const bytes = await fetchImage(assetPath)
  if (!bytes?.length) return { status: 'missing', error: 'HTTP 404 or empty response' }
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, bytes)
  return { status: 'downloaded', localFile: path.relative(ROOT, destination).replaceAll('\\', '/') }
}

/**
 * Fetch and parse every detail page through a small pool. Assets are collected
 * here rather than afterwards so the HTML can be dropped as soon as the record
 * is built - 240 pages are only worth keeping in memory for as long as they
 * are being read.
 */
async function scrapeDetails(cards) {
  const results = new Array(cards.length)
  const assets = new Set()
  let cursor = 0
  let completed = 0

  const worker = async () => {
    while (cursor < cards.length) {
      const index = cursor
      cursor += 1
      const card = cards[index]
      const html = await fetchPage(card.href)
      if (!html) {
        warn(`${card.slug}: detail page ${card.href} returned 404 - skipping`)
        results[index] = { slug: card.slug, record: null, unresolved: [] }
      } else {
        for (const assetPath of pageAssets(html)) assets.add(assetPath)
        const parsed = parseDetail(html, { slug: card.slug })
        if (!parsed.record.slug || !parsed.record.name) {
          warn(`${card.slug}: detail page parsed without a slug or name - skipping`)
          results[index] = { slug: card.slug, record: null, unresolved: parsed.unresolved }
        } else {
          results[index] = { slug: card.slug, record: parsed.record, unresolved: parsed.unresolved }
        }
      }
      completed += 1
      if (completed % 25 === 0 || completed === cards.length) {
        log(`Detail progress: ${completed}/${cards.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, Math.max(cards.length, 1)) }, worker))
  return { results, assets }
}

/**
 * The manifest's review queue, deduplicated by Chinese text: the same label on
 * 40 pages is one entry with a page count, not 40 entries, so the report stays
 * something a person can work through when extending the glossary.
 */
function aggregateUnresolved(entries) {
  const byText = new Map()
  for (const entry of entries) {
    let bucket = byText.get(entry.zh)
    if (!bucket) {
      bucket = { zh: entry.zh, gloss: entry.gloss, residual: entry.residual, fields: new Set(), pages: new Set() }
      byText.set(entry.zh, bucket)
    }
    bucket.fields.add(entry.field)
    bucket.pages.add(entry.slug)
  }
  return [...byText.values()]
    .map(({ fields, pages, ...bucket }) => ({ ...bucket, fields: [...fields].sort(), pages: pages.size }))
    .sort((a, b) => b.pages - a.pages || a.zh.localeCompare(b.zh))
}

async function main() {
  if (CONFIG.help) {
    console.log(HELP)
    return
  }

  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(IMAGE_DIR, { recursive: true })

  log(`Scraping Tatadex Tataris from ${REMOTE_BASE}`)
  const indexHtml = await fetchPage('/tatari/')
  if (!indexHtml) throw new Error('the /tatari/ catalog index returned 404')

  const index = parseIndex(indexHtml)
  log(`Catalog reports ${index.reportedCount} Tataris; parsed ${index.cards.length} cards`)
  if (index.reportedCount !== null && index.reportedCount !== index.cards.length) {
    warn(`catalog count ${index.reportedCount} does not match the ${index.cards.length} parsed cards`)
  }

  const cards = CONFIG.limit > 0 ? index.cards.slice(0, CONFIG.limit) : index.cards
  if (cards.length < index.cards.length) {
    log(`Limiting detail pages to ${cards.length} of ${index.cards.length}`)
  }

  // The index itself references every card's art and the shared element/role
  // icons, so its assets are in scope even when --limit trims the detail pool.
  const assets = new Set(pageAssets(indexHtml))
  const { results, assets: detailAssets } = await scrapeDetails(cards)
  for (const assetPath of detailAssets) assets.add(assetPath)

  const bySlug = {}
  const failed = []
  const unresolved = []
  for (const result of results) {
    if (result.record === null) {
      failed.push(result.slug)
      continue
    }
    bySlug[result.record.slug] = result.record
    for (const entry of result.unresolved) unresolved.push({ slug: result.record.slug, ...entry })
  }

  const roster = {
    source: REMOTE_BASE,
    verification: index.verification,
    count: index.cards.length,
    tataris: index.cards,
  }
  await writeFile(path.join(DATA_DIR, 'roster.json'), `${JSON.stringify(roster, null, 2)}\n`, 'utf8')
  await writeFile(path.join(DATA_DIR, 'tataris.json'), `${JSON.stringify(bySlug, null, 2)}\n`, 'utf8')
  log(`Wrote data/roster.json (${index.cards.length} cards)`)
  log(`Wrote data/tataris.json (${Object.keys(bySlug).length} records${failed.length ? `, ${failed.length} failed: ${failed.join(', ')}` : ''})`)

  const ordered = [...assets].sort()
  log(`Discovered ${ordered.length} image assets`)
  // The image tree is flat: the manifest carries the mapping from each site
  // path to the single file inside img/ that holds its bytes.
  const names = flatImageNames(ordered)
  const imageResults = new Array(ordered.length)
  const counts = { downloaded: 0, cached: 0, missing: 0, skipped: 0 }
  let completed = 0

  // Workers fill `imageResults` by slot rather than in completion order so the
  // manifest comes out deterministic no matter which worker got which file.
  const settle = (slot, result) => {
    imageResults[slot] = result
    counts[result.status] += 1
    completed += 1
    if (completed % 25 === 0 || completed === ordered.length) {
      log(`Image progress: ${completed}/${ordered.length} (downloaded=${counts.downloaded}, cached=${counts.cached}, missing=${counts.missing}, skipped=${counts.skipped})`)
    }
  }

  if (CONFIG.skipImages) {
    for (const slot of ordered.keys()) settle(slot, { status: 'skipped' })
  } else {
    let cursor = 0
    const worker = async () => {
      while (cursor < ordered.length) {
        const slot = cursor
        cursor += 1
        settle(slot, await cacheAsset(ordered[slot], names.get(ordered[slot]), CONFIG.force))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONFIG.imageConcurrency, ordered.length) }, worker))
  }

  const manifest = {
    version: 1,
    source: REMOTE_BASE,
    scrapedAt: new Date().toISOString(),
    options: {
      limit: CONFIG.limit,
      delay: CONFIG.delay,
    },
    data: {
      roster: { path: 'data/roster.json', count: index.cards.length },
      tataris: { path: 'data/tataris.json', count: Object.keys(bySlug).length, failed },
    },
    unresolved: aggregateUnresolved(unresolved),
    assets: ordered.map((assetPath, slot) => ({ path: assetPath, filename: names.get(assetPath), ...imageResults[slot] })),
  }
  await writeFile(path.join(CACHE_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  log(`Wrote ${path.join(CACHE_ROOT, 'manifest.json')}`)
  log(`Unresolved Chinese strings: ${manifest.unresolved.length} distinct (see the manifest report)`)
  log(`Done: downloaded=${counts.downloaded}, cached=${counts.cached}, missing=${counts.missing}, skipped=${counts.skipped}`)
}

main().catch((error) => {
  log(error instanceof Error ? error.message : String(error), 'ERROR')
  process.exitCode = 1
})
