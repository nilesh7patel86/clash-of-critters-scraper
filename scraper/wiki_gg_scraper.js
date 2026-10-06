#!/usr/bin/env node
/**
 * Clash of Critters wiki.gg scraper -> public/wiki-cache
 *
 *   node scraper/wiki_gg_scraper.js                # data + images (cached where possible)
 *   node scraper/wiki_gg_scraper.js --force        # re-fetch wikitext AND re-download images
 *   node scraper/wiki_gg_scraper.js --skip-images  # data only
 *
 * Outputs:
 *   public/wiki-cache/data/tataris.json   scraped data (stars, tataris, types, roles, images)
 *   public/wiki-cache/manifest.json       what was written, and where
 *   public/wiki-cache/wikitext/<Title>.wiki cached raw wikitext
 *   public/wiki-cache/img/<file>          downloaded images (served by Vite)
 *
 * Everything comes through the MediaWiki API (api.php) rather than the rendered
 * page HTML. Three reasons:
 *
 *   - Cloudflare sits in front of the wiki and challenges non-browser clients.
 *     Scrape /wiki/<Page> and you spend the run fighting 403 interstitials,
 *     cookies and backoff. api.php serves the same data to any client that
 *     identifies itself honestly, with no challenge at all.
 *   - The API takes up to 50 titles per request, so the whole 240-page roster
 *     is five requests instead of 240 paced ones.
 *   - Raw wikitext is a better source than rendered HTML. Grades, stage lists
 *     and skill tags sit in the infobox as plain `|Key=Value` pairs, where the
 *     rendered page hides them inside generated divs and CSS classes.
 *
 * The flip side is that MediaWiki markup has to be parsed. scraper/lib/wikitext.js
 * (plain/fileName/splitCells/tableRows/templateParams) does that; everything
 * after them works with ordinary strings.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildArtIndex } from './art_index.js'
import { log, parseCliArgs, sleep, warn } from './lib/cli.js'
import { createRequestGate, fetchWithRetry } from './lib/http.js'
import { fileName, parseParams, plain, splitCells, squash, tableRows, templateBodies, templateParams } from './lib/wikitext.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE_WIKI = 'https://clashofcritters.wiki.gg'
const API_URL = `${BASE_WIKI}/api.php`
const IMAGE_BASE = `${BASE_WIKI}/images`
const WIKI_BASE = `${BASE_WIKI}/wiki`
const MAIN_PAGE = 'Tatari'
const ZOBO_PAGE = 'Zobo Horde Invasion'
const ZOBO_SKILLS_HEADING = '===Tatari Skills==='
// tableRows anchors on a marker *inside* the table and walks backwards to the
// opening `{|`, so the marker has to be one of the header cells - the section
// heading sits before the table and would walk back into the previous one. This
// header cell appears exactly once on the page.
const ZOBO_SKILLS_TABLE_MARKER = '!Base Skill'
// The Zobo Horde table is base skill, then the skills learned at levels 3, 5 and
// 7. Level 1 stands in for the base skill, which the page lists in its own
// column rather than as a level up.
const ZOBO_SKILL_LEVELS = [1, 3, 5, 7]

/*
 * An honest, self-identifying User-Agent, and the single most important line in
 * this file.
 *
 * Cloudflare's bot management on wiki.gg treats a *claim* to be a browser as the
 * suspicious signal, not a lack of one: sending a Chrome string earns a 403
 * "Just a second..." interstitial on api.php, rest.php and index.php alike,
 * while a descriptive bot string is served normally on all three. The API used
 * to be open to browser user-agents; it is not any more. robots.txt asks
 * crawlers to identify themselves, so this is both the working and the polite
 * choice. Do not "fix" this by pasting in a browser UA.
 */
const DEFAULT_UA = 'clash-of-critters-wiki-scraper/1.0 (local dev tool; +https://clashofcritters.wiki.gg)'

const API_DELAY_MS = 1000
const MAX_RETRIES = 5
const RETRY_BASE_MS = 2000
const RETRY_MAX_MS = 60_000
const RETRY_AFTER_BUFFER_MS = 2000
const TIMEOUT_MS = 60_000

// The API accepts 50 titles per request for non-bot clients. Stay under it.
const TITLES_PER_REQUEST = 40
const FILES_PER_REQUEST = 50

// Image downloads are plain GETs against Cloudflare's cache rather than API
// calls, so they are paced per worker instead of globally.
const DEFAULT_IMAGE_CONCURRENCY = 4
const DEFAULT_IMAGE_DELAY_MS = 500

// One cache root under public/, so Vite serves the whole thing and the data,
// the manifest and the images never drift apart. Same layout as tatary-cache.
const CACHE_ROOT = path.join(ROOT, 'public', 'wiki-cache')
const DATA_DIR = path.join(CACHE_ROOT, 'data')
const CACHE_IMAGES_DIR = path.join(CACHE_ROOT, 'img')
const CACHE_WIKITEXT_DIR = path.join(CACHE_ROOT, 'wikitext')
const MANIFEST_FILE = path.join(CACHE_ROOT, 'manifest.json')
const DEFAULT_DATA_FILE = path.join(DATA_DIR, 'tataris.json')

const STAT_IMAGES = { attack: 'Attack.png', hp: 'HP.png', defense: 'Defense.png' }

// Tpl_Infobox renders every evolution tile as `[[File:<Stage>.png]]`, so the stage
// artwork is derived from the stage name and not from the infobox `|image=` of the
// stage's own page. The two disagree for rows like Heliabloom (page image
// `Heliabloom-4.png`, tile image `Heliabloom.png`).
//
// Deliberately the wiki's own spelling, not the resolved page title: File: is a
// separate namespace, and redirecting an article does not rename its file. Lullely's
// page still spells its stage 1 `Lullelly`, and `Lullelly.png` is still the artwork
// the wiki serves for that Tatari - a name that does not exist is warned about
// rather than guessed at, so there is no fallback here to try.
const stageImageName = (name) => `${name}.png`

const relativeToRoot = (target) => path.relative(ROOT, target).replaceAll('\\', '/')

const HELP = `
Clash of Critters wiki.gg scraper

Usage:
  node scraper/wiki_gg_scraper.js [options]

Options:
  --force                  Re-fetch all wikitext AND re-download all images
  --force-pages            Re-fetch cached wikitext only
  --force-images           Re-download cached images only
  --skip-images            Build the JSON without downloading any image files
  --stop-on-429            Stop on the first HTTP 429 without retrying
  --limit <n>              Only fetch details for the first n rows (for testing)
  --delay <ms>             Minimum gap between API calls (default ${API_DELAY_MS})
  --image-concurrency <n>  Parallel image downloads (default ${DEFAULT_IMAGE_CONCURRENCY})
  --image-delay <ms>       Pause per image worker between downloads (default ${DEFAULT_IMAGE_DELAY_MS})
  --user-agent <ua>        Override the identifying User-Agent
  --out <path>             Output JSON path (default: public/wiki-cache/data/tataris.json)
  --help                   Show this help

Outputs:
  public/wiki-cache/data/tataris.json   scraped data (stars, tataris, types, roles, images)
  public/wiki-cache/manifest.json       what was written, and where
  public/wiki-cache/wikitext/<Title>.wiki cached raw wikitext
  public/wiki-cache/img/<file>          downloaded images (served by Vite)
`

// The operator's User-Agent override, resolved before the spec so the default
// can stay a plain value: environment fallback first, --user-agent second.
const USER_AGENT = process.env.WIKI_USER_AGENT || DEFAULT_UA

const CONFIG = parseCliArgs(process.argv.slice(2), {
  flags: {
    forcePages: ['--force-pages', '--force'],
    forceImages: ['--force-images', '--force'],
    skipImages: ['--skip-images'],
    stopOn429: ['--stop-on-429'],
    help: ['--help', '-h'],
  },
  options: {
    delay: { flag: '--delay', number: true, min: 250, default: API_DELAY_MS },
    imageConcurrency: { flag: '--image-concurrency', number: true, min: 1, default: DEFAULT_IMAGE_CONCURRENCY },
    imageDelay: { flag: '--image-delay', number: true, min: 0, default: DEFAULT_IMAGE_DELAY_MS },
    userAgent: { flag: '--user-agent', default: USER_AGENT },
    // Resolved against ROOT, not the shell's cwd, so the default lands in the
    // same place whether the scraper is run from the repo root or from scraper/.
    outFile: { flag: '--out', default: DEFAULT_DATA_FILE, resolve: ROOT },
    limit: { flag: '--limit', number: true, default: 0 },
  },
})

// ---------------------------------------------------------------- http

// API calls are paced behind the shared minimum-gap gate: there are only a
// handful of them now that titles are batched, so being slow costs nothing and
// keeps the scraper a good neighbour. The gate spaces request *starts*, so a
// caller that issues work concurrently still gets spaced requests rather than a
// burst. The 0.2 jitter keeps a paced series from developing a metronome rhythm.
const apiGate = createRequestGate(CONFIG.delay, { jitter: 0.2 })

/**
 * One GET with the scraper's retry policy layered on top: the descriptive
 * User-Agent, a 60s timeout, exponential backoff, Retry-After honoured on 429
 * (plus a 2s buffer, because wiki.gg's own answer to "how long" has been a few
 * hundred milliseconds optimistic), and two status codes with bespoke handling.
 */
function httpRequest(url, { responseType = 'json', retries = MAX_RETRIES } = {}) {
  return fetchWithRetry(url, {
    responseType,
    retries,
    backoffBaseMs: RETRY_BASE_MS,
    backoffMaxMs: RETRY_MAX_MS,
    retryAfterBufferMs: RETRY_AFTER_BUFFER_MS,
    timeoutMs: TIMEOUT_MS,
    headers: { 'User-Agent': CONFIG.userAgent },
    handleStatus: (response, target) => {
      if (response.status === 403) {
        return {
          error: new Error(
            `403 from ${target}. Cloudflare is challenging this client; check that --user-agent identifies the scraper rather than imitating a browser.`,
          ),
        }
      }
      if (response.status === 429 && CONFIG.stopOn429) {
        const error = new Error('Stopped after HTTP 429')
        error.stop = true
        return { error }
      }
      return undefined
    },
  })
}

/** One api.php call, paced behind the minimum-gap gate. */
async function apiQuery(params) {
  const url = new URL(API_URL)
  for (const [key, value] of Object.entries({ format: 'json', formatversion: '2', ...params })) {
    url.searchParams.set(key, value)
  }
  await apiGate()
  return httpRequest(url, { responseType: 'json' })
}

function chunked(list, size) {
  const batches = []
  for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size))
  return batches
}

// ---------------------------------------------------------------- urls

/**
 * `Volt Bolt.png` and `Volt_Bolt.png` name the same file, and the API always
 * answers in the underscored form. Comparing on this key lets a wikitext link
 * written either way find its image.
 */
const fileKey = (name) => name.replace(/_/g, ' ').trim().toLowerCase()

const stripFileNamespace = (title) => title.replace(/^File:/i, '')

function pageUrl(title) {
  return `${WIKI_BASE}/${encodeURIComponent(title)}`
}

function sanitizeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*]/g, '_').replace(/[\u0000-\u001f]/g, '_').trim() || 'UNNAMED'
}

// ---------------------------------------------------------------- fetching

function wikitextCacheFile(title) {
  return path.join(CACHE_WIKITEXT_DIR, `${sanitizeFilename(title)}.wiki`)
}

// The wikitext directory is created once per run, not once per cached page: a
// full scrape writes about 250 pages, and mkdirSync per page is 250 identical
// syscalls against a directory that already exists.
let cacheDirReady = false
function ensureCacheDir() {
  if (cacheDirReady) return
  mkdirSync(CACHE_WIKITEXT_DIR, { recursive: true })
  cacheDirReady = true
}

function cacheWikitext(title, content) {
  ensureCacheDir()
  writeFileSync(wikitextCacheFile(title), content, 'utf8')
}

const REDIRECT_MAP_FILE = path.join(CACHE_WIKITEXT_DIR, 'redirects.json')

/**
 * Caching a redirect's content under its own title as well as the requested
 * one would make the redirect indistinguishable from a real page on the next
 * run, and `Lullelly` would be reported as its own page. The map is what lets a
 * cache hit report the same resolved title a live query would have.
 */
const redirectMap = new Map()

function loadRedirectMap() {
  if (CONFIG.forcePages || !existsSync(REDIRECT_MAP_FILE)) return
  try {
    for (const [from, to] of Object.entries(JSON.parse(readFileSync(REDIRECT_MAP_FILE, 'utf8')))) {
      if (from !== to) redirectMap.set(from, to)
    }
  } catch (cause) {
    warn(`ignoring unreadable redirect map: ${cause.message}`)
  }
}

let redirectMapDirty = false

function rememberRedirect(from, to) {
  if (from === to || redirectMap.get(from) === to) return
  redirectMap.set(from, to)
  redirectMapDirty = true
}

/**
 * Persist the redirect map once, after the last wikitext fetch of the run.
 * It used to be rewritten in full on every redirect discovered, which on a
 * cold cache is one whole-file JSON write per redirected title for a map that
 * ends up identical to the one the previous write produced. Nothing between
 * here and the end of the run reads the file - resolveTitle reads the map in
 * memory - so deferring the single write loses nothing.
 */
function flushRedirectMap() {
  if (!redirectMapDirty) return
  ensureCacheDir()
  writeFileSync(REDIRECT_MAP_FILE, `${JSON.stringify(Object.fromEntries(redirectMap), null, 2)}\n`, 'utf8')
  redirectMapDirty = false
}

/** The page a title really lives at. Identical to the title when it is not a redirect. */
const resolveTitle = (title) => redirectMap.get(title) ?? title

/**
 * Wikitext for many pages at once, answered as a Map keyed by the title that
 * was asked for. Each value carries the title the API actually resolved to,
 * which differs from the request whenever the wiki title is a redirect - the
 * roster links to Lullelly, which redirects to Lullely, and `detailsTitle` has
 * to record the destination so the URL in the output is not a dead end.
 *
 * Cached pages skip the network entirely, so a second run costs nothing.
 */
async function fetchWikitext(titles) {
  const resolved = new Map()
  const missing = []

  for (const title of new Set(titles.filter(Boolean))) {
    const file = wikitextCacheFile(title)
    if (!CONFIG.forcePages && existsSync(file)) {
      const cached = readFileSync(file, 'utf8')
      if (cached.trim()) {
        resolved.set(title, { title: redirectMap.get(title) ?? title, content: cached })
        continue
      }
    }
    missing.push(title)
  }
  if (!missing.length) return resolved

  for (const batch of chunked(missing, TITLES_PER_REQUEST)) {
    const json = await apiQuery({
      action: 'query',
      titles: batch.join('|'),
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: 1,
    })

    const redirects = new Map((json.query?.redirects ?? []).map((entry) => [entry.from, entry.to]))
    // Group the batch's requested titles by the page each one resolves to,
    // once, instead of re-filtering the whole batch for every page the API
    // returns - which was O(pages x batch) on every batch of a cold cache.
    const byPage = new Map()
    for (const title of batch) {
      const target = redirects.get(title) ?? title
      const group = byPage.get(target)
      if (group) group.push(title)
      else byPage.set(target, [title])
    }
    for (const page of json.query?.pages ?? []) {
      const content = page.revisions?.[0]?.slots?.main?.content
      if (typeof content !== 'string') {
        warn(`no content for ${page.title}${page.missing ? ' (page does not exist)' : ''}`)
        continue
      }
      const requested = byPage.get(page.title) ?? []
      // Cache under every title that reaches this page, so a redirect is not
      // re-fetched on the next run.
      for (const title of requested) cacheWikitext(title, content)
      for (const title of requested) {
        rememberRedirect(title, page.title)
        resolved.set(title, { title: page.title, content })
      }
    }
    log(`  wikitext ${resolved.size}/${missing.length} uncached titles resolved`)
  }
  return resolved
}

/**
 * Turns bare file names into the filename the wiki serves them under, plus that
 * file's download URL. Resolving through the API is what keeps the stored
 * filename trustworthy: the roster links to `Lullelly.png` for a Tatari called
 * Lullely, and the wiki serves a stage's skill art under the base form's name.
 * Deriving names from the roster would get both wrong.
 *
 * The filename comes from the resolved URL rather than from the requested
 * `File:` title, for two reasons. The title keeps its spaces
 * (`File:Volt Bolt.png`) while the app resolves art by URL-shaped filename
 * (`Volt_Bolt.png`), and a `File:` title that redirects - every stage after the
 * first points at the base form's artwork - reports the target's URL, which is
 * the file that will actually download.
 */
async function resolveFiles(files, { expectedMissing = [] } = {}) {
  const resolved = new Map()
  const wanted = [...new Set(files.filter(Boolean))]
  const optional = new Set(expectedMissing.map(fileKey))
  let optionalMissing = 0

  for (const batch of chunked(wanted, FILES_PER_REQUEST)) {
    const json = await apiQuery({
      action: 'query',
      titles: batch.map((name) => `File:${name}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|sha1',
    })
    for (const page of json.query?.pages ?? []) {
      const info = page.imageinfo?.[0]
      if (!info) {
        // A name in `optional` is one the wiki is not expected to have yet. It
        // gets counted rather than warned about, because these arrive in their
        // hundreds and would bury a roster file that is genuinely unresolved.
        if (optional.has(fileKey(stripFileNamespace(page.title)))) optionalMissing += 1
        else warn(`no image info for ${page.title}`)
        continue
      }
      // Drop the revision hash wiki.gg appends; it is a cache buster, not part
      // of the file's identity.
      const url = String(info.url).split(/[?#]/)[0]
      const filename = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1))
      resolved.set(fileKey(stripFileNamespace(page.title)), {
        filename,
        url,
        size: info.size,
        sha1: info.sha1,
        requested: stripFileNamespace(page.title),
      })
    }
    log(`  resolved ${resolved.size}/${wanted.length} files`)
  }
  if (optionalMissing) log(`  ${optionalMissing}/${optional.size} optional names have no file on the wiki yet`)
  return resolved
}

// ---------------------------------------------------------------- page parsers

/** The wishbox/star economy table on the Tatari page. */
function parseStars(text) {
  const stars = []
  for (const row of tableRows(text, '!Star')) {
    const cells = splitCells(row)
    if (cells.length < 6) continue
    stars.push({
      sourceFile: fileName(cells[0]),
      visualDescription: plain(cells[1]),
      starLevel: plain(cells[2]),
      dupesNeededPerStar: plain(cells[3]),
      wishboxesToNextTier: plain(cells[4]),
      totalWishboxesToNextStarTier: plain(cells[5]),
    })
  }
  return stars
}

/**
 * The roster on the Tatari page: one row per evolution stage, including the
 * unreleased placeholders the wiki carries for upcoming Tatari.
 *
 * The name cell is a link whose text can differ from its target, and the text
 * is the one to keep: the roster reads `[[Firefox|Flametail]]` for a page that
 * has been retitled, and "Flametail" is the name the rest of the app joins on.
 * The target is the page to fetch details from, which is a separate field.
 */
function parseRoster(text) {
  const roster = []
  const seen = new Set()

  for (const row of tableRows(text, '! Normal Form')) {
    const cells = splitCells(row)
    if (cells.length < 8) {
      warn(`skipped a roster row with ${cells.length} cells`)
      continue
    }

    const linked = cells[2].match(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/)
    const name = linked ? plain(linked[2] ?? linked[1]) : plain(cells[2].split(/<br\s*\/?>|\n/)[0])
    // The wiki currently carries a few name-less rows at the end of the table.
    if (!name || seen.has(name)) continue
    seen.add(name)

    const glitterCell = cells[1]
    const isGlitter = !/^\s*N\/A/i.test(glitterCell) && Boolean(fileName(glitterCell))

    roster.push({
      name,
      detailsTitle: linked ? plain(linked[1]) : null,
      sourceFile: fileName(cells[0]),
      glitterSourceFile: isGlitter ? fileName(glitterCell) : null,
      type: plain(cells[3]),
      role: plain(cells[4]),
      skillText: plain(cells[6]),
      description: plain(cells[7]),
    })
  }
  return roster
}

/**
 * `Required Star Level` gates a feeding upgrade behind a wishbox star level, and
 * the wiki leaves it blank on the first few upgrades of every Tatari - those
 * apply from the start.
 *
 * It is not always a plain number either: some rows read `73+`, meaning the
 * upgrade applies from that level onwards. A number is published where the value
 * is one and the raw string is kept where it is not, so an open-ended row stays
 * distinguishable from an exact one instead of being rounded down to a level
 * that does not exist.
 */
function parseStarLevel(value) {
  const raw = plain(value ?? '')
  if (!raw) return null
  return /^\d+$/.test(raw) ? Number(raw) : raw
}

/** One `{{Feedrow}}` from the `Feeding Upgrade List` parameter. */
function parseFeedRow(body) {
  const params = parseParams(body)
  return {
    // Left exactly as the wiki writes it. `type` is Attack/Defense/HP, `grade` is
    // one of D/C/B/A/S and their SS/SSS forms, and a handful of rows carry a
    // typo ("Attacl", "DEF", "sS"). Normalising here would quietly disagree with
    // the page it was read from, so the spelling is the data's problem to own.
    type: plain(params.get('type') ?? '') || null,
    grade: plain(params.get('grade') ?? '') || null,
    effect: plain(params.get('effect') ?? ''),
    requiredStarLevel: parseStarLevel(params.get('required star level')),
  }
}

/**
 * The `{{Infobox critter}}` call at the top of a Tatari's page: the fields the
 * rendered infobox displays as pictures and a stat grid.
 *
 * `|Stage 3=` is present but empty on two-stage lines, so stages are only
 * recorded when the name is non-empty.
 */
function parseInfobox(text) {
  const params = templateParams(text, 'Infobox critter')
  if (!params) return null

  const stages = []
  for (const [key, value] of params) {
    const match = /^stage (\d)$/.exec(key)
    if (!match) continue
    const name = plain(value)
    if (name) stages.push({ stage: Number(match[1]), name })
  }
  stages.sort((left, right) => left.stage - right.stage)

  // `Feeding Upgrade List` is one parameter holding a run of `{{Feedrow}}` calls
  // rather than a list of its own, so the rows come out of the value rather than
  // out of the infobox parameters.
  const feedingUpgrades = templateBodies(params.get('feeding upgrade list') ?? '', 'Feedrow').map(parseFeedRow)

  return {
    image: squash(params.get('image') ?? '') || null,
    type: plain(params.get('type') ?? '') || null,
    rarity: plain(params.get('rarity') ?? '') || null,
    grades: {
      attack: squash(params.get('attack') ?? '') || null,
      hp: squash(params.get('hp') ?? '') || null,
      defense: squash(params.get('defense') ?? '') || null,
    },
    skillName: plain(params.get('skill name') ?? '') || null,
    skillDescription: plain(params.get('skill description') ?? '') || null,
    // Skill effects are tagged {{st|AoE}}{{st|Heal}}; the tag order is the
    // order they appear in the infobox.
    skillTypes: [...(params.get('skill types') ?? '').matchAll(/\{\{\s*st\s*\|([^}|]+)/gi)].map((match) => plain(match[1])),
    stages,
    feedingUpgrades,
  }
}

/**
 * Which element each type is strong against and weak to, read off that
 * element's own page. The rendered infobox derives its "Counters"/"Countered
 * by" row from exactly this relationship, so the pair falls out of the same two
 * facts rather than needing a table of its own.
 */
function parseTypeChart(text) {
  return {
    counters: (text.match(/super effective against \[\[(\w+)\]\]/i) || [])[1] ?? null,
    counteredBy: (text.match(/weak to \[\[(\w+)\]\]/i) || [])[1] ?? null,
  }
}

/**
 * One `'''Skill name:''' description` cell from the Zobo Horde table.
 *
 * The wiki is inconsistent about which side of the closing `'''` the colon sits
 * on - `'''Name:'''` in most rows, `'''Name''':` in a few - and one skill is
 * itself called `Technique: Veil`, so the name cannot be read as "up to the
 * first colon". The name is whatever is bolded and the description is whatever
 * follows, which is the one reading that holds for all three.
 */
function parseZoboSkill(cell) {
  const match = cell.match(/^'''\s*([\s\S]*?)\s*:?\s*'''\s*:?\s*([\s\S]*)$/)
  if (!match) return null
  const name = plain(match[1])
  if (!name) return null
  return { name, description: plain(match[2]) }
}

/**
 * The `===Tatari Skills===` table on the Zobo Horde Invasion page: the four
 * skills a Tatari uses in that game mode, and the notes that go with them.
 *
 * This page is the only place these skills are written down. No Tatari detail
 * page repeats them - a grep of the cached wikitext for a Zobo-only skill name
 * comes back empty - so this is fetched as a page in its own right rather than
 * read off the infoboxes.
 *
 * Only base forms get a row, and the page is explicit that the level 3/5/7
 * skills are shared across the whole evolutionary line. It does not say which
 * rows belong to which line - that comes from the infoboxes instead, so
 * buildFamilies is what attaches these to a line.
 */
function parseZoboSkills(text) {
  if (!text.includes(ZOBO_SKILLS_HEADING) || !text.includes(ZOBO_SKILLS_TABLE_MARKER)) {
    warn(`${ZOBO_PAGE} has no ${ZOBO_SKILLS_HEADING} table`)
    return []
  }

  const rows = []
  for (const rowText of tableRows(text, ZOBO_SKILLS_TABLE_MARKER)) {
    const cells = splitCells(rowText)
    if (cells.length < 7) {
      warn(`skipped a Zobo Horde row with ${cells.length} cells`)
      continue
    }
    // Snowcub's name is plain text where every other row links its page, so the
    // link is the fast path and the cell text is the fallback.
    const linked = cells[1].match(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/)
    const skills = ZOBO_SKILL_LEVELS.map((level, index) => {
      const skill = parseZoboSkill(cells[index + 3])
      return skill ? { level, ...skill } : null
    }).filter(Boolean)
    if (!skills.length) {
      warn(`skipped Zobo Horde row ${plain(linked?.[1] ?? cells[1])} - no readable skills`)
      continue
    }

    rows.push({
      // The link target, not the display text: the roster matches on the page
      // title, and Zobo Horde links to `Lullelly` for the Tatari the roster
      // calls Lullely.
      title: plain(linked ? linked[1] : cells[1]),
      name: plain(linked ? (linked[2] ?? linked[1]) : cells[1]),
      sourceFile: fileName(cells[0]),
      skills,
      notes: cells[7] ? plain(cells[7]) || null : null,
    })
  }
  return rows
}

/**
 * The evolution lines, keyed by base form, with the Zobo Horde skills filed
 * against the line rather than against each Tatari.
 *
 * `|Stage N=` is more than a "what comes next" list. An evolved form's infobox
 * carries the whole line from the base, so Frostique's page reads
 * `Stage 1=Frostnip, Stage 2=Frostpaw, Stage 3=Frostique, Stage 4=Frostluna`.
 * Every member of a line therefore reports the same list, and on the current
 * roster 65 of the 66 lines agree on it character for character - the
 * exception is Lullely's, whose `Stage 1` still spells the old title
 * `Lullelly`, and resolveTitle folds that onto the same key as the rest.
 *
 * That agreement is what makes this safe to build on: the grouping is the
 * wiki's own record of each line, not an inference from the roster's ordering.
 * A contiguity heuristic over neighbouring rows cannot do this - it reads 67
 * lines, and the two it gets wrong are the lines whose last member has no
 * infobox yet, which it has no way to notice.
 *
 * Filing per line is also the shape the source is written in. The Zobo Horde
 * page lists one row per line and says outright that the level-up skills are
 * shared across a whole evolutionary line, so a row-per-Tatari shape would
 * repeat four identical skills on every member of 64 lines and bury the two
 * lines the wiki has not documented yet among 179 nulls.
 *
 * Returns the families plus a map from every member's page title to its family
 * name, which is what a Tatari row carries as its pointer.
 */
function buildFamilies(roster, { resolvedTitleFor, infoboxFor, zoboByTitle, record }) {
  const byTitle = new Map(roster.map((row) => [resolvedTitleFor(row), row]))

  const grouped = new Map()
  for (const row of roster) {
    const line = (infoboxFor(row)?.stages ?? []).map((stage) => stage.name)
    if (!line.length) continue
    // `Stage 1` is the base form, spelled as a page title - which for a renamed
    // line is the old title, so it has to be resolved before it can key anything.
    const key = resolveTitle(line[0])
    if (!grouped.has(key)) grouped.set(key, line)
  }

  const families = []
  const familyOf = new Map()
  for (const [key, line] of grouped) {
    const base = byTitle.get(key)
    const zobi = zoboByTitle.get(key) ?? null
    // A stage whose page is not on the roster keeps the wiki's own spelling, so a
    // member is never dropped just because its page is missing.
    const memberName = (name) => byTitle.get(resolveTitle(name))?.name ?? name
    const name = base?.name ?? key

    for (const member of line) familyOf.set(resolveTitle(member), name)

    // The chain's artwork is `<member>.png` for all but a handful of lines, so
    // only the exceptions are recorded. There are two kinds: a File: on the wiki
    // that carries a different name from the page (Flametail's tile is
    // Firefox.png), and a page that has been renamed out from under its own file
    // (Lullely's is still Lullelly.png). A null here means the wiki has no file
    // for that member at all, which is why the map is consulted by key rather
    // than merged with the default - a missing default has to stay missing.
    const stageImages = {}
    for (const stage of line) {
      const member = memberName(stage)
      const file = record(stageImageName(stage))
      if (file !== stageImageName(member)) stageImages[member] = file
    }

    families.push({
      name,
      type: base?.type ?? null,
      members: line.map(memberName),
      // Present only where a member's artwork is not simply `<member>.png`.
      ...(Object.keys(stageImages).length ? { stageImages } : {}),
      skills: zobi ? zobi.skills.map((entry) => ({ ...entry, image: record(`${entry.name}.png`) })) : [],
      notes: zobi?.notes ?? null,
      // False for the lines the Zobo Horde page does not carry yet. Naming the
      // gap is the point: it is two rows in a list, not a null on a hundred and
      // eighty rows.
      documented: zobi !== null,
    })
  }
  families.sort((left, right) => left.name.localeCompare(right.name))
  return { families, familyOf }
}

// ---------------------------------------------------------------- images

/** True when `file` exists on disk with content in it. */
async function hasContent(file) {
  try {
    return (await stat(file)).size > 0
  } catch {
    return false
  }
}

async function downloadImage(filename, url) {
  const dest = path.join(CACHE_IMAGES_DIR, sanitizeFilename(filename))
  // `dest` and `pending` are working state for the download pool and are
  // stripped before the manifest is written, which keeps the published shape
  // limited to what the app reads.
  const job = { filename, url, dest, localFile: relativeToRoot(dest), status: 'downloaded' }
  // A file already on disk is left alone; --force-images is how to refresh it.
  // Checked asynchronously: this runs for every file in the cache while the
  // download pool is starting up, and a few hundred synchronous stats would
  // stall the very event loop the pool runs on.
  if (!CONFIG.forceImages && (await hasContent(dest))) job.status = 'cached'
  else job.pending = url
  return job
}

/**
 * Downloads the outstanding images with a small pool of workers. Each worker
 * pauses between requests, so raising --image-concurrency raises throughput
 * without turning the run into a flood.
 */
async function downloadPending(jobs) {
  const pending = jobs.filter((job) => job.pending)
  if (!pending.length) return

  await mkdir(CACHE_IMAGES_DIR, { recursive: true })
  let cursor = 0
  let done = 0

  const worker = async () => {
    while (cursor < pending.length) {
      const job = pending[cursor]
      cursor += 1
      try {
        const response = await httpRequest(job.pending, { responseType: 'response', retries: 2 })
        // The content-type is the answer to "did this download an image?" -
        // an error page, a Cloudflare interstitial or a JSON API response all
        // announce themselves as text/html or application/json, and none of
        // them belong in the cache. The body used to be sniffed for a literal
        // `<html` instead, which is the same test done late and blind: wiki.gg
        // serves every file under image/*, so the header is checked first and
        // the bytes are only read once they are known good.
        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.startsWith('image/')) {
          throw new Error(`expected an image, received "${contentType || 'no content-type'}"`)
        }
        const body = Buffer.from(await response.arrayBuffer())
        if (!body.length) throw new Error('empty payload received')
        await writeFile(job.dest, body)
        job.status = 'downloaded'
      } catch (err) {
        if (err.stop) throw err
        job.status = 'failed'
        job.error = err.message
        warn(`image download failed for ${job.filename}: ${err.message}`)
      }
      done += 1
      process.stdout.write(`\r  images ${done}/${pending.length}`)
      await sleep(CONFIG.imageDelay)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONFIG.imageConcurrency, pending.length) }, worker))
  console.log()
}

// ---------------------------------------------------------------- main

/**
 * Phase 1 - the index pages: the roster, the star economy, the element pages
 * and the Zobo Horde table. Everything later in the run joins against these.
 */
async function fetchIndexPages() {
  log('Fetching Tatari page...')
  const mainPage = await fetchWikitext([MAIN_PAGE])
  const mainText = mainPage.get(MAIN_PAGE)?.content
  if (!mainText) throw new Error(`could not read ${MAIN_PAGE} from the wiki`)

  const stars = parseStars(mainText)
  log(`Parsed ${stars.length} star entries`)

  const roster = parseRoster(mainText)
  log(`Parsed ${roster.length} rows from "List of Tataris"`)

  const types = [...new Set(roster.map((row) => row.type).filter(Boolean))]
  const roles = [...new Set(roster.map((row) => row.role).filter(Boolean))]
  log(`Types: ${types.join(', ')}`)
  log(`Roles: ${roles.join(', ')}`)

  // Element pages give the counters/countered-by pair for every type in one
  // batch alongside the roster's own detail pages.
  const typePages = await fetchWikitext(types)

  log(`Fetching ${ZOBO_PAGE}...`)
  const zoboPage = await fetchWikitext([ZOBO_PAGE])
  const zoboRows = parseZoboSkills(zoboPage.get(ZOBO_PAGE)?.content ?? '')
  log(`Parsed ${zoboRows.length} Zobo Horde skill rows`)

  // The Zobo table keys on the page title, and so does the roster - but the
  // roster records the *resolved* title while the table records the link
  // target, which differ for the one row that points at a redirect (Lullelly ->
  // Lullely). Resolving the table's titles the same way the roster's were makes
  // both sides carry the destination and the row joins. Every one of these
  // pages is already cached from the roster fetch above, so this costs nothing.
  const zoboResolved = await fetchWikitext(zoboRows.map((row) => row.title))
  const zoboByTitle = new Map()
  for (const row of zoboRows) {
    const resolvedTitle = zoboResolved.get(row.title)?.title
    if (!resolvedTitle) {
      warn(`Zobo Horde row ${row.name} links to ${row.title}, which could not be resolved`)
      continue
    }
    zoboByTitle.set(resolvedTitle, row)
  }
  log(`Zobo Horde rows joined to ${zoboByTitle.size} roster entries`)

  return { stars, roster, types, roles, typePages, zoboRows, zoboByTitle }
}

/**
 * Phase 2 - every Tatari's detail page, plus the accessors the rest of the run
 * reads them through.
 *
 * A roster row links to the page it describes, but a redirect means the page
 * the wiki actually served has a different title. Both are needed: the
 * resolved one for detailsPage, the link target for nothing at all. Going
 * through these two accessors keeps the redirect out of every call site.
 */
async function fetchRosterDetails(roster) {
  const detailTitles = roster.map((row) => row.detailsTitle).filter(Boolean)
  const wanted = CONFIG.limit > 0 ? detailTitles.slice(0, CONFIG.limit) : detailTitles
  log(`Fetching details for ${wanted.length} Tatari pages (${detailTitles.length - wanted.length} limited out)...`)
  const details = await fetchWikitext(wanted)

  const infoboxes = new Map()
  let detailsProcessed = 0
  let detailsFailed = 0
  for (const title of wanted) {
    const detail = details.get(title)
    if (!detail) {
      detailsFailed += 1
      continue
    }
    const infobox = parseInfobox(detail.content)
    if (!infobox) {
      // The wiki keeps a handful of roster links pointing at pages that have no
      // infobox yet. Worth saying out loud, because the row still ships.
      warn(`${detail.title} has no Infobox critter - the row will ship without skill or stats`)
    }
    // Keyed by resolved title so a redirected row is still reachable by the
    // target the API reported.
    infoboxes.set(detail.title, infobox)
    detailsProcessed += 1
  }
  log(`Details fetched: ${detailsProcessed}, failed: ${detailsFailed}`)

  const detailFor = (row) => (row.detailsTitle ? (details.get(row.detailsTitle) ?? null) : null)
  const infoboxFor = (row) => {
    const detail = detailFor(row)
    return detail ? (infoboxes.get(detail.title) ?? null) : null
  }
  // The page title the wiki actually served, which is what keys everything
  // downstream: the families, the Zobo Horde rows and each row's own pointer.
  const resolvedTitleFor = (row) => detailFor(row)?.title ?? row.detailsTitle ?? null
  const rosterNameByTitle = new Map()
  for (const row of roster) rosterNameByTitle.set(resolvedTitleFor(row), row.name)

  // Every redirect discovered while fetching the pages above, persisted now
  // that no more wikitext will be requested this run.
  flushRedirectMap()

  return { infoboxFor, resolvedTitleFor, rosterNameByTitle, detailsProcessed, detailsFailed }
}

/**
 * Phase 3 - collect the file names the run needs and resolve them to real
 * URLs through the API.
 */
async function resolveArtwork({ stars, roster, types, roles, zoboRows, infoboxFor }) {
  const wantedFiles = new Set()
  const want = (name) => {
    if (name) wantedFiles.add(name)
  }
  for (const star of stars) want(star.sourceFile)
  for (const name of [...types, ...roles]) want(`${name}.png`)
  for (const stat of Object.values(STAT_IMAGES)) want(stat)
  for (const row of roster) {
    want(row.sourceFile)
    want(row.glitterSourceFile)
    const infobox = infoboxFor(row)
    if (!infobox) continue
    if (infobox.skillName) want(`${infobox.skillName}.png`)
    for (const stage of infobox.stages) want(stageImageName(stage.name))
  }
  // Everything the roster itself needs. Snapshotted before the Zobo Horde skill
  // names are added below, so that a name both want is never treated as optional.
  const requiredFiles = new Set(wantedFiles)

  // Nearly every Zobo Horde skill name has no File: page on the wiki yet, and the
  // number changes as the wiki gains artwork - the exact figure is logged on each
  // run rather than pinned here. They are still asked for, so the run picks the
  // artwork up as it appears, but their misses are counted on one line rather than
  // warned about individually, which would bury a roster file that is genuinely
  // unresolved. The grouping below skips them for the same reason.
  for (const row of zoboRows) {
    want(row.sourceFile)
    for (const skill of row.skills) want(`${skill.name}.png`)
  }
  const optionalFiles = [...wantedFiles].filter((name) => !requiredFiles.has(name))

  log(`Resolving ${wantedFiles.size} file names through the API...`)
  const resolved = await resolveFiles([...wantedFiles], { expectedMissing: optionalFiles })

  // The filename the wiki uses, not one derived from a Tatari's name. The app
  // resolves art by filename against public/wiki-cache/img, so a name it invents
  // would point at a file that was never downloaded.
  //
  // Just the filename: the remote URL is always meta.imageBase plus this name,
  // bar a handful of apostrophes the wiki percent-encodes, and the only copy the
  // app actually needs is the local one. The full url is kept per file in the
  // manifest, where it is part of the asset's own record rather than repeated
  // inside every row that points at it.
  const record = (name) => {
    if (!name) return null
    const hit = resolved.get(fileKey(name))
    return hit ? hit.filename : null
  }

  return { resolved, record }
}

/**
 * Phase 4 - the evolution lines, keyed by base form, with the Zobo Horde
 * skills filed against each line.
 */
function buildEvolutionLines({ roster, resolvedTitleFor, infoboxFor, zoboByTitle, record }) {
  // Every member of a line points at one family, so the skills themselves are
  // published once in the top-level `zoboHorde` section rather than repeated on
  // every row of the line. Null only for the handful of roster rows whose page
  // has no infobox, since a line cannot be read off those.
  const { families, familyOf } = buildFamilies(roster, { resolvedTitleFor, infoboxFor, zoboByTitle, record })
  const documentedFamilies = families.filter((family) => family.documented)
  log(`Evolution lines: ${families.length} (${documentedFamilies.length} documented on ${ZOBO_PAGE}, ${families.length - documentedFamilies.length} not)`)
  for (const family of families.filter((entry) => !entry.documented)) {
    warn(`the wiki does not list Zobo Horde skills for "${family.name}" - the family ships with documented: false`)
  }

  return { families, familyOf, documentedFamilies }
}

/**
 * Phase 5 - one output row per roster entry, with the feeding track interned
 * into the shared dictionary rather than repeated per row.
 */
function buildRosterRows({ roster, typePages, infoboxFor, resolvedTitleFor, familyOf, record }) {
  const tataris = []
  // The feeding track's shared vocabulary. Every `{{Feedrow}}` in the roster is one
  // of a couple of hundred distinct upgrades, so each definition is written once
  // and a Tatari's `feeding` is a list of positions in it. Interned rather than
  // stored per row on purpose: the rows are near-identical between family members
  // but not identical, so neither a per-row copy nor a per-family one is right.
  const feedingDictionary = []
  const feedingIndex = new Map()
  const internFeeding = (rows) =>
    rows.map((row) => {
      const key = JSON.stringify([row.type, row.grade, row.effect, row.requiredStarLevel])
      const known = feedingIndex.get(key)
      if (known !== undefined) return known
      const at = feedingDictionary.length
      feedingDictionary.push(row)
      feedingIndex.set(key, at)
      return at
    })

  for (const row of roster) {
    const infobox = infoboxFor(row)
    const resolvedTitle = resolvedTitleFor(row)
    const chart = typePages.has(row.type) ? parseTypeChart(typePages.get(row.type).content) : { counters: null, counteredBy: null }

    const skill =
      infobox?.skillName || infobox?.skillDescription
        ? {
            skillName: infobox.skillName ?? '',
            skillDescription: infobox.skillDescription ?? '',
            skillTypes: infobox.skillTypes,
            skillImage: record(infobox.skillName ? `${infobox.skillName}.png` : null),
          }
        : null
    if (skill?.skillName && !skill.skillImage) warn(`${row.name}: no artwork named "${infobox.skillName}.png" on the wiki`)

    tataris.push({
      name: row.name,
      detailsPage: resolvedTitle ? pageUrl(resolvedTitle) : null,
      detailsTitle: resolvedTitle,
      normalImage: record(row.sourceFile),
      glitterImage: record(row.glitterSourceFile),
      type: row.type,
      rarity: infobox?.rarity ?? null,
      role: row.role,
      skillText: row.skillText,
      counters: chart.counters,
      counteredBy: chart.counteredBy,
      skill,
      // The evolution line's Zobo Horde Invansion progression, published once per
      // line in the top-level `zoboHorde.families` array. This is the name of the
      // family to look up - the same string for every member of a line.
      zoboHordeFamily: resolvedTitle ? (familyOf.get(resolvedTitle) ?? null) : null,
      initialStats: {
        attack: infobox?.grades.attack ?? null,
        hp: infobox?.grades.hp ?? null,
        defense: infobox?.grades.defense ?? null,
      },
      // Indices into the top-level `feedingUpgrades` dictionary, in the order the
      // wiki lists them. The 3743 rows across the roster hold only a couple of
      // hundred distinct upgrades between them - and they are not shared by family
      // either, since some lines' members disagree - so they are interned rather
      // than repeated. Empty rather than null for the handful of roster rows whose
      // page has no infobox, so a consumer can tell "no upgrades" from "not scraped".
      feeding: internFeeding(infobox?.feedingUpgrades ?? []),
    })
  }

  return { tataris, feedingDictionary }
}

/**
 * Phase 6 - group every requested name by the file it actually resolves to,
 * and build the download jobs in filename order.
 */
async function groupImageJobs({ stars, types, roles, roster, infoboxFor, zoboByTitle, rosterNameByTitle, resolved }) {
  // Two requested names can land on one file - every stage after the first
  // shares the base form's skill artwork through a File: redirect - and the
  // manifest should carry one entry per real file with both provenances on it.
  const grouped = new Map()
  const group = (requested, source) => {
    if (!requested) return
    const hit = resolved.get(fileKey(requested))
    if (!hit) {
      warn(`unresolved file on the wiki: ${requested}`)
      return
    }
    const entry = grouped.get(hit.filename) ?? { hit, sources: new Set() }
    entry.sources.add(source)
    grouped.set(hit.filename, entry)
  }
  for (const star of stars) group(star.sourceFile, 'stars')
  for (const type of types) group(`${type}.png`, 'type')
  for (const role of roles) group(`${role}.png`, 'role')
  for (const row of roster) {
    group(row.sourceFile, `tatari:${row.name}:normal`)
    group(row.glitterSourceFile, `tatari:${row.name}:glitter`)
    for (const [stat, file] of Object.entries(STAT_IMAGES)) group(file, `tatari:${row.name}:initial-stat-${stat}`)
    const infobox = infoboxFor(row)
    if (!infobox) continue
    if (infobox.skillName) group(`${infobox.skillName}.png`, `tatari:${row.name}:skill`)
    for (const stage of infobox.stages) group(stageImageName(stage.name), `tatari:${row.name}:evolution-stage-${stage.stage}`)
  }
  // A Zobo skill with no artwork is the normal case, so only the names
  // resolveFiles actually found are grouped here - group() warns on a miss, and
  // these have already been counted as one line above. The roster's own files
  // still warn, which is the point: that is a real gap.
  // Labelled by the roster's spelling rather than the Zobo page's, so the same
  // Tatari reads identically whichever source the file was found through. Lullely
  // is the one case where the two differ: the Zobo page still links `Lullelly`.
  for (const [title, row] of zoboByTitle) {
    group(row.sourceFile, `zobo-horde:${rosterNameByTitle.get(title) ?? row.name}:normal`)
    for (const skill of row.skills) {
      if (resolved.has(fileKey(`${skill.name}.png`))) group(`${skill.name}.png`, 'zobo-horde:skill')
    }
  }

  return (
    await Promise.all(
      [...grouped.values()].map(async (entry) => ({
        ...(await downloadImage(entry.hit.filename, entry.hit.url)),
        sources: [...entry.sources],
      })),
    )
  ).sort((left, right) => left.filename.localeCompare(right.filename))
}

/**
 * Phase 7 - register or fetch every image job: skipped wholesale under
 * --skip-images, otherwise downloaded through the worker pool.
 */
async function downloadImages(jobs) {
  if (CONFIG.skipImages) {
    for (const job of jobs) {
      if (job.status !== 'failed') job.status = 'skipped'
    }
    log(`Skipping image downloads (--skip-images), ${jobs.length} files registered`)
  } else {
    const cached = jobs.filter((job) => job.status === 'cached').length
    log(`Images: ${cached} already on disk, ${jobs.filter((job) => job.pending).length} to download`)
    await downloadPending(jobs)
    const failed = jobs.filter((job) => job.status === 'failed').length
    const downloaded = jobs.filter((job) => job.status === 'downloaded').length
    log(`Images: downloaded=${downloaded} cached=${cached} failed=${failed} total=${jobs.length}`)
  }
}

/**
 * Phase 8 - the five data files, the manifest, and the closing summary.
 */
function writeOutputs({ stars, types, roles, tataris, feedingDictionary, families, documentedFamilies, jobs, detailsProcessed, detailsFailed, record }) {
  // Five files, split along the lines a consumer actually reads along.
  //
  //   reference.json      the vocabularies every other file refers to by name
  //                       (types, roles, stars, stat icons) plus the run metadata
  //   artIndex.json       name -> portrait filenames; enough to draw the grid
  //   tataris.json        the roster; needed to draw a single card
  //   zoboHorde.json      one entry per evolution line; needed to group the grid
  //   feedingUpgrades.json the shared feeding dictionary; only the detail view
  //                       ever resolves a row's indices into it
  //
  // The split is not about the first byte: a grouped grid needs reference,
  // tataris and zoboHorde together, so that is 343KB of the 392KB either way.
  // It is about what stays valid when something else changes. A wiki edit to one
  // Tatari's ability rewrites tataris.json alone; the vocabularies and the
  // feeding table are untouched, so a client that already has them revalidates
  // two small files instead of one large one.
  //
  // artIndex.json is the exception that proves it: the roster only needs three
  // columns of tataris.json, so it reads this slice rather than the whole file -
  // see scraper/art_index.js.
  //
  // Cross-file references are by name or index, never by position in a file, so
  // any subset can be loaded and checked independently:
  //   tataris[].zoboHordeFamily  -> zoboHorde.families[].name
  //   tataris[].feeding          -> indices into feedingUpgrades
  //   tataris[].type/role        -> reference.types/roles[].name
  const reference = {
    meta: {
      scrapedAt: new Date().toISOString(),
      sourceUrl: pageUrl(MAIN_PAGE),
      pageBase: WIKI_BASE,
      imageBase: IMAGE_BASE,
      totalTataris: tataris.length,
      detailsProcessed,
      detailsFailed,
      zoboHordeSource: pageUrl(ZOBO_PAGE),
      evolutionLines: families.length,
      zoboHordeDocumented: documentedFamilies.length,
      imagesRequested: jobs.length,
    },
    stars: stars.map((star) => {
      return {
        image: record(star.sourceFile),
        visualDescription: star.visualDescription,
        starLevel: star.starLevel,
        dupesNeededPerStar: star.dupesNeededPerStar,
        wishboxesToNextTier: star.wishboxesToNextTier,
        totalWishboxesToNextStarTier: star.totalWishboxesToNextStarTier,
      }
    }),
    types: types.map((name) => ({ name, image: `${name}.png` })),
    roles: roles.map((name) => ({ name, image: `${name}.png` })),
    // One icon per stat, used by every row's `initialStats`. These three files are
    // the only stat artwork the wiki has, so they belong in one shared place
    // rather than repeated 735 times inside the rows that reference them. Run
    // through record() like any other reference, so one that ever stops resolving
    // reads as null instead of pointing at a file that was never downloaded.
    statIcons: Object.fromEntries(Object.entries(STAT_IMAGES).map(([key, file]) => [key, record(file)])),
  }

  // One entry per evolution line, keyed by base form. The Zobo Horde page
  // documents a skill set per line rather than per Tatari, so this is where they
  // live; each Tatari points here through `zoboHordeFamily`.
  const zoboHorde = {
    source: pageUrl(ZOBO_PAGE),
    levels: ZOBO_SKILL_LEVELS,
    families,
  }

  // The feeding track's shared vocabulary, keyed by position from each row's
  // `feeding` list. Interned in buildRosterRows above.
  const feedingUpgrades = feedingDictionary

  // --out still names the roster, and the other three sit beside it, so a custom
  // --out directory collects the whole set rather than scattering siblings.
  const outDir = path.dirname(CONFIG.outFile)
  mkdirSync(outDir, { recursive: true })

  const written = [
    ['reference.json', reference, path.join(outDir, 'reference.json')],
    ['artIndex.json', buildArtIndex(tataris, reference.meta.scrapedAt), path.join(outDir, 'artIndex.json')],
    ['tataris.json', tataris, CONFIG.outFile],
    ['zoboHorde.json', zoboHorde, path.join(outDir, 'zoboHorde.json')],
    ['feedingUpgrades.json', feedingUpgrades, path.join(outDir, 'feedingUpgrades.json')],
  ]
  // Two shapes on purpose. tataris, zoboHorde and artIndex are what a client
  // downloads before it can draw anything, so they are written compact: that is
  // 328KB -> 234KB and 71KB -> 48KB off the codex's first load, and whitespace
  // is bytes nobody reads. reference and feedingUpgrades are small, and are the
  // two a person is most likely to open to check what the scraper produced, so
  // they stay indented.
  const PRETTY = new Set(['reference.json', 'feedingUpgrades.json'])
  const dataPaths = {}
  for (const [name, value, file] of written) {
    const json = JSON.stringify(value, null, PRETTY.has(name) ? 2 : undefined)
    writeFileSync(file, json, 'utf8')
    dataPaths[name.replace('.json', '')] = { path: relativeToRoot(file) }
    log(`Wrote ${relativeToRoot(file)} (${(Buffer.byteLength(json) / 1024).toFixed(1)}KB)`)
  }

  // The manifest answers "what is actually on disk, and did every file land?"
  // without having to diff the cache against the data JSON. It sits beside the
  // img/ and wikitext/ directories it describes, matching the tatary-cache
  // layout so both scrapers are read the same way.
  //
  // It is also the only place the per-file url and download status live. The data
  // files used to carry an identical copy of this array, which cost 219KB to say
  // the same thing twice; rows now reference artwork by filename alone.
  const manifest = {
    version: 1,
    source: BASE_WIKI,
    scrapedAt: reference.meta.scrapedAt,
    // The roster, the vocabularies and the line data. A consumer reads meta from
    // reference.json, so that is the one to reach for when asking how fresh the
    // set is or where the wiki lives.
    data: {
      reference: dataPaths.reference,
      artIndex: dataPaths.artIndex,
      tataris: dataPaths.tataris,
      zoboHorde: dataPaths.zoboHorde,
      feedingUpgrades: dataPaths.feedingUpgrades,
    },
    assets: jobs.map(({ filename, url, sources, status, localFile }) => ({
      filename,
      url,
      sources,
      status,
      localFile,
    })),
  }
  // A custom --out writes its data outside the published cache, so its manifest
  // goes with it. Overwriting the published one would leave it describing files
  // that are no longer on disk.
  const manifestFile = outDir === DATA_DIR ? MANIFEST_FILE : path.join(outDir, 'manifest.json')
  mkdirSync(path.dirname(manifestFile), { recursive: true })
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  log(`Wrote ${relativeToRoot(manifestFile)}`)

  const incomplete = tataris.filter((row) => !row.skill || !row.normalImage)
  if (incomplete.length) log(`Incomplete rows: ${incomplete.map((row) => row.name).join(', ')}`)
  const unlinked = tataris.filter((row) => !row.zoboHordeFamily)
  if (unlinked.length) log(`Not in an evolution line: ${unlinked.map((row) => row.name).join(', ')}`)
  log('Done.')
}

/**
 * The run, as phases. Each step does one thing and hands its results to the
 * next, so the scrape reads top to bottom: index pages -> details -> artwork
 * resolution -> evolution lines -> rows -> image manifest -> downloads ->
 * output files. The log order is unchanged from when this was one long
 * function, so a run can still be diffed against one from before the split.
 */
async function main() {
  if (CONFIG.help) {
    console.log(HELP)
    return
  }

  log('Scraping Clash of Critters wiki via the MediaWiki API')
  log(`Options: forcePages=${CONFIG.forcePages} forceImages=${CONFIG.forceImages} limit=${CONFIG.limit || 'all'} skipImages=${CONFIG.skipImages} userAgent=${CONFIG.userAgent}`)

  loadRedirectMap()

  const { stars, roster, types, roles, typePages, zoboRows, zoboByTitle } = await fetchIndexPages()
  const { infoboxFor, resolvedTitleFor, rosterNameByTitle, detailsProcessed, detailsFailed } = await fetchRosterDetails(roster)
  const { resolved, record } = await resolveArtwork({ stars, roster, types, roles, zoboRows, infoboxFor })
  const { families, familyOf, documentedFamilies } = buildEvolutionLines({ roster, resolvedTitleFor, infoboxFor, zoboByTitle, record })
  const { tataris, feedingDictionary } = buildRosterRows({ roster, typePages, infoboxFor, resolvedTitleFor, familyOf, record })
  const jobs = await groupImageJobs({ stars, types, roles, roster, infoboxFor, zoboByTitle, rosterNameByTitle, resolved })
  await downloadImages(jobs)
  writeOutputs({
    stars,
    types,
    roles,
    tataris,
    feedingDictionary,
    families,
    documentedFamilies,
    jobs,
    detailsProcessed,
    detailsFailed,
    record,
  })
}

main().catch((err) => {
  log(err.message, 'ERROR')
  process.exitCode = 1
})
