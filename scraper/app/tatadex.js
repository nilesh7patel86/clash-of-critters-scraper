// tatadex.org source for the app scraper.
//
// Uses the pure parsers in scraper/lib/tatadex.js (parseIndex, parseDetail,
// inferNames) - the same ones the standalone scraper uses - over the /tatari/
// catalog and its detail pages. Only the pieces the app renders are kept: each
// Tatari's normal art, its Glitter art, and its skill icon. The site's prose
// (skill parameters, effects, evolution tiers) is not stored, because the Codex
// takes all text from wiki.gg; tatadex is the image source of record for Tatari
// and Glitter portraits and the fallback for skill icons.
//
// Every page is cached as raw HTML under public/app-cache/tatadex (the catalog
// as index.html, each detail page as <slug>.html) so a re-run is a local read
// instead of 250 requests to a site that throttles hard with HTTP 503. --force
// bypasses the cache and refetches, exactly like the wiki wikitext cache.
//
// Names that tatadex leaves blank are filled from the wiki rows and families
// this run already scraped, so the two sources join without a second scrape.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { log, warn } from '../lib/cli.js'
import { inferNames, parseDetail, parseIndex } from '../lib/tatadex.js'
import { TATADEX_DIR } from './config.js'

const PAGE_CONCURRENCY = 4
const INDEX_CACHE_FILE = path.join(TATADEX_DIR, 'index.html')

const fold = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '')

// A slug is lower-case alphanumeric with hyphens, but keep the filename safe
// regardless so a surprising slug can never escape the cache directory.
const cacheFileFor = (slug) => path.join(TATADEX_DIR, `${String(slug).replace(/[^a-z0-9._-]/gi, '_')}.html`)

let cacheDirReady = false
function ensureCacheDir() {
  if (cacheDirReady) return
  mkdirSync(TATADEX_DIR, { recursive: true })
  cacheDirReady = true
}

function readCached(file) {
  if (!existsSync(file)) return null
  const content = readFileSync(file, 'utf8')
  return content.trim() ? content : null
}

function writeCached(file, content) {
  ensureCacheDir()
  writeFileSync(file, content, 'utf8')
}

/** Fetch a page, serving it from cache unless --force, and cache what it fetches. */
async function cachedPage(net, config, href, cacheFile) {
  if (!config.force) {
    const cached = readCached(cacheFile)
    if (cached) return { html: cached, cached: true }
  }
  const html = await net.tatadexPage(href)
  if (html) writeCached(cacheFile, html)
  return { html, cached: false }
}

function applyInferredNames(bySlug, cards, inferred) {
  for (const [slug, name] of inferred) {
    const record = bySlug[slug]
    if (record && !record.name) record.name = name
  }
  for (const record of Object.values(bySlug)) {
    for (const stage of record.evolutionLine ?? []) {
      if (!stage.name && stage.slug && inferred.has(stage.slug)) stage.name = inferred.get(stage.slug)
    }
  }
  for (const card of cards) {
    if (!card.name && card.slug && inferred.has(card.slug)) card.name = inferred.get(card.slug)
  }
}

/** Fetch every detail page through a small pool, keeping only the needed fields. */
async function scrapeDetails(net, config, cards) {
  const results = new Array(cards.length)
  let cursor = 0
  let completed = 0
  let cachedCount = 0
  let fetchedCount = 0

  const worker = async () => {
    while (cursor < cards.length) {
      const index = cursor
      cursor += 1
      const card = cards[index]
      const { html, cached } = await cachedPage(net, config, card.href, cacheFileFor(card.slug || card.href))
      if (cached) cachedCount += 1
      else fetchedCount += 1
      if (!html) {
        warn(`tatadex.org: ${card.slug} detail page ${card.href} returned 404 - skipping`)
        results[index] = null
      } else {
        const parsed = parseDetail(html, { slug: card.slug })
        results[index] = parsed.record.slug ? parsed.record : null
        if (!parsed.record.slug) warn(`tatadex.org: ${card.slug} parsed without a slug - skipping`)
      }
      completed += 1
      if (completed % 25 === 0 || completed === cards.length) log(`tatadex.org: detail progress ${completed}/${cards.length}`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, Math.max(cards.length, 1)) }, worker))
  return { results, cachedCount, fetchedCount }
}

/**
 * Scrape the tatadex catalog and expose a name -> image lookup.
 *
 * `wiki` is `{ tataris, families }` from the wiki phase, used only to name the
 * records the site leaves blank.
 *
 * Returns `byName`: folded name -> { name, slug, art: { normal, glitter }, skillIcon }.
 */
export async function scrapeTatadex(net, config, wiki) {
  log('tatadex.org: fetching the /tatari/ catalog...')
  const catalog = await cachedPage(net, config, '/tatari/', INDEX_CACHE_FILE)
  if (catalog.cached) log('tatadex.org: catalog served from cache')
  const indexHtml = catalog.html
  if (!indexHtml) throw new Error('the /tatari/ catalog index returned 404')

  const index = parseIndex(indexHtml)
  log(`tatadex.org: catalog reports ${index.reportedCount} Tataris; parsed ${index.cards.length} cards`)
  if (index.reportedCount !== null && index.reportedCount !== index.cards.length) {
    warn(`tatadex.org: catalog count ${index.reportedCount} does not match the ${index.cards.length} parsed cards`)
  }

  const cards = config.limit > 0 ? index.cards.slice(0, config.limit) : index.cards
  if (cards.length < index.cards.length) log(`tatadex.org: limiting detail pages to ${cards.length} of ${index.cards.length}`)

  const { results, cachedCount, fetchedCount } = await scrapeDetails(net, config, cards)
  if (cachedCount) log(`tatadex.org: ${cachedCount} detail pages from cache, ${fetchedCount} fetched`)
  const bySlug = {}
  const failed = []
  for (const record of results) {
    if (!record) continue
    bySlug[record.slug] = record
  }
  for (const [slot, record] of results.entries()) {
    if (!record) failed.push(cards[slot].slug)
  }

  const inference = inferNames(bySlug, { tataris: wiki.tataris, families: wiki.families })
  applyInferredNames(bySlug, index.cards, inference.inferred)
  const unnamed = Object.values(bySlug).filter((record) => !record.name).map((record) => record.slug).sort()

  const byName = new Map()
  for (const card of index.cards) {
    const record = card.slug ? bySlug[card.slug] : null
    const name = record?.name || card.name || null
    if (!name) continue
    const key = fold(name)
    if (!key) continue
    byName.set(key, {
      name,
      slug: card.slug ?? record?.slug ?? null,
      art: {
        normal: record?.art?.normal ?? card.art ?? null,
        glitter: record?.art?.glitter ?? null,
      },
      skillIcon: record?.skill?.icon ?? null,
    })
  }

  log(
    `tatadex.org: ${Object.keys(bySlug).length} records, ${byName.size} named (${inference.inferred.size} inferred from wiki.gg)`,
  )
  if (unnamed.length) warn(`tatadex.org: ${unnamed.length} unnamed records: ${unnamed.join(', ')}`)
  if (failed.length) warn(`tatadex.org: ${failed.length} detail pages failed: ${failed.join(', ')}`)

  return { byName, records: Object.keys(bySlug).length, cards: index.cards.length, namesInferred: inference.inferred.size, unnamed, failed }
}
