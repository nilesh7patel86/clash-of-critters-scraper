// wiki.gg source for the app scraper.
//
// A port of the standalone wiki scraper's logic - the MediaWiki API client,
// wikitext caching, redirect handling, the page parsers and the evolution-line
// builder - kept here rather than imported because wiki_gg_scraper.js runs its
// own main() on import. It produces only the fields the Roster and Codex tabs
// read; the wishbox star economy table is not scraped because nothing consumes
// it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { log, warn } from '../lib/cli.js'
import {
  fileName, parseParams, plain, splitCells, squash, tableRows, templateBodies, templateParams,
} from '../lib/wikitext.js'
import { WIKI_BASE, WIKI_IMAGE_BASE, WIKI_PAGE, WIKI_ZOBO_PAGE, WIKITEXT_DIR } from './config.js'

const WIKI_BASE_URL = `${WIKI_BASE}/wiki`

const ZOBO_SKILLS_HEADING = '===Tatari Skills==='
const ZOBO_SKILLS_TABLE_MARKER = '!Base Skill'
const ZOBO_SKILL_LEVELS = [1, 3, 5, 7]

// The three stat chips. The wiki publishes them under these file names; the app
// scraper prefers tatary.xyz's own copies and falls back here, so the names are
// only ever consulted, never assumed to download.
export const STAT_IMAGES = { attack: 'Attack.png', hp: 'HP.png', defense: 'Defense.png' }

// The API accepts 50 titles per request for non-bot clients.
const TITLES_PER_REQUEST = 40
const FILES_PER_REQUEST = 50

const stageImageName = (name) => `${name}.png`
const fileKey = (name) => name.replace(/_/g, ' ').trim().toLowerCase()
const stripFileNamespace = (title) => title.replace(/^File:/i, '')
const pageUrl = (title) => `${WIKI_BASE_URL}/${encodeURIComponent(title)}`
const sanitizeFilename = (name) => {
  const cleaned = String(name).replace(/[<>:"/\\|?*]/g, '_').trim()
  let out = ''
  for (const char of cleaned) out += char.charCodeAt(0) < 0x20 ? '_' : char
  return out || 'UNNAMED'
}

function chunked(list, size) {
  const batches = []
  for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size))
  return batches
}

// ---------------------------------------------------------------- parsing

/**
 * The roster on the Tatari page: one row per evolution stage, including the
 * unreleased placeholders the wiki carries for upcoming Tatari. The link text
 * is the name to keep; the link target is the page to fetch details from.
 */
export function parseRoster(text) {
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

function parseStarLevel(value) {
  const raw = plain(value ?? '')
  if (!raw) return null
  return /^\d+$/.test(raw) ? Number(raw) : raw
}

function parseFeedRow(body) {
  const params = parseParams(body)
  return {
    type: plain(params.get('type') ?? '') || null,
    grade: plain(params.get('grade') ?? '') || null,
    effect: plain(params.get('effect') ?? ''),
    requiredStarLevel: parseStarLevel(params.get('required star level')),
  }
}

export function parseInfobox(text) {
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
    skillTypes: [...(params.get('skill types') ?? '').matchAll(/\{\{\s*st\s*\|([^}|]+)/gi)].map((match) => plain(match[1])),
    stages,
    feedingUpgrades,
  }
}

function parseTypeChart(text) {
  return {
    counters: (text.match(/super effective against \[\[(\w+)\]\]/i) || [])[1] ?? null,
    counteredBy: (text.match(/weak to \[\[(\w+)\]\]/i) || [])[1] ?? null,
  }
}

function parseZoboSkill(cell) {
  const match = cell.match(/^'''\s*([\s\S]*?)\s*:?\s*'''\s*:?\s*([\s\S]*)$/)
  if (!match) return null
  const name = plain(match[1])
  if (!name) return null
  return { name, description: plain(match[2]) }
}

export function parseZoboSkills(text) {
  if (!text.includes(ZOBO_SKILLS_HEADING) || !text.includes(ZOBO_SKILLS_TABLE_MARKER)) {
    warn(`${WIKI_ZOBO_PAGE} has no ${ZOBO_SKILLS_HEADING} table`)
    return []
  }
  const rows = []
  for (const rowText of tableRows(text, ZOBO_SKILLS_TABLE_MARKER)) {
    const cells = splitCells(rowText)
    if (cells.length < 7) {
      warn(`skipped a Zobo Horde row with ${cells.length} cells`)
      continue
    }
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
 * Evolution lines keyed by base form, with the Zobo Horde skills filed against
 * the line. Returns the families plus a member-title -> family-name map.
 */
export function buildFamilies(roster, { resolvedTitleFor, infoboxFor, zoboByTitle, record }) {
  const byTitle = new Map(roster.map((row) => [resolvedTitleFor(row), row]))
  const grouped = new Map()
  for (const row of roster) {
    const line = (infoboxFor(row)?.stages ?? []).map((stage) => stage.name)
    if (!line.length) continue
    const key = resolveTitle(line[0])
    if (!grouped.has(key)) grouped.set(key, line)
  }

  const families = []
  const familyOf = new Map()
  for (const [key, line] of grouped) {
    const base = byTitle.get(key)
    const zobi = zoboByTitle.get(key) ?? null
    const memberName = (name) => byTitle.get(resolveTitle(name))?.name ?? name
    const name = base?.name ?? key

    for (const member of line) familyOf.set(resolveTitle(member), name)

    families.push({
      name,
      type: base?.type ?? null,
      members: line.map(memberName),
      skills: zobi ? zobi.skills.map((entry) => ({ ...entry, image: record(`${entry.name}.png`) })) : [],
      notes: zobi?.notes ?? null,
      documented: zobi !== null,
    })
  }
  families.sort((left, right) => left.name.localeCompare(right.name))
  return { families, familyOf }
}

function buildRosterRows({ roster, typePages, infoboxFor, resolvedTitleFor, familyOf, record }) {
  const tataris = []
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
      zoboHordeFamily: resolvedTitle ? (familyOf.get(resolvedTitle) ?? null) : null,
      initialStats: {
        attack: infobox?.grades.attack ?? null,
        hp: infobox?.grades.hp ?? null,
        defense: infobox?.grades.defense ?? null,
      },
      feeding: internFeeding(infobox?.feedingUpgrades ?? []),
    })
  }
  return { tataris, feedingDictionary }
}

// ---------------------------------------------------------------- caching

const redirectMap = new Map()
let cacheDirReady = false

const wikitextCacheFile = (title) => path.join(WIKITEXT_DIR, `${sanitizeFilename(title)}.wiki`)
const REDIRECT_MAP_FILE = path.join(WIKITEXT_DIR, 'redirects.json')
const resolveTitle = (title) => redirectMap.get(title) ?? title

function ensureCacheDir() {
  if (cacheDirReady) return
  mkdirSync(WIKITEXT_DIR, { recursive: true })
  cacheDirReady = true
}

function cacheWikitext(title, content) {
  ensureCacheDir()
  writeFileSync(wikitextCacheFile(title), content, 'utf8')
}

function loadRedirectMap(force) {
  if (force || !existsSync(REDIRECT_MAP_FILE)) return
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

function flushRedirectMap() {
  if (!redirectMapDirty) return
  ensureCacheDir()
  writeFileSync(REDIRECT_MAP_FILE, `${JSON.stringify(Object.fromEntries(redirectMap), null, 2)}`, 'utf8')
  redirectMapDirty = false
}

/** Wikitext for many pages at once, keyed by the title asked for. */
async function fetchWikitext(net, config, titles) {
  const resolved = new Map()
  const missing = []
  for (const title of new Set(titles.filter(Boolean))) {
    const file = wikitextCacheFile(title)
    if (!config.force && existsSync(file)) {
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
    const json = await net.wikiApi({
      action: 'query',
      titles: batch.join('|'),
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: 1,
    })
    const redirects = new Map((json.query?.redirects ?? []).map((entry) => [entry.from, entry.to]))
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
      for (const title of requested) cacheWikitext(title, content)
      for (const title of requested) {
        rememberRedirect(title, page.title)
        resolved.set(title, { title: page.title, content })
      }
    }
  }
  log(`  wiki.gg wikitext: fetched ${missing.length} uncached ${missing.length === 1 ? 'title' : 'titles'}`)
  return resolved
}

/** File names -> real wiki filenames + download URLs, through the API. */
async function resolveFiles(net, files, expectedMissing) {
  const resolved = new Map()
  const wanted = [...new Set(files.filter(Boolean))]
  const optional = new Set(expectedMissing.map(fileKey))
  let optionalMissing = 0

  for (const batch of chunked(wanted, FILES_PER_REQUEST)) {
    const json = await net.wikiApi({
      action: 'query',
      titles: batch.map((name) => `File:${name}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|sha1',
    })
    for (const page of json.query?.pages ?? []) {
      const info = page.imageinfo?.[0]
      if (!info) {
        if (optional.has(fileKey(stripFileNamespace(page.title)))) optionalMissing += 1
        else warn(`no image info for ${page.title}`)
        continue
      }
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
  }
  log(`  wiki.gg files: ${resolved.size}/${wanted.length} resolved`)
  if (optionalMissing) log(`  ${optionalMissing}/${optional.size} optional wiki file names have no file yet`)
  return resolved
}

// ---------------------------------------------------------------- entry

export async function scrapeWiki(net, config) {
  loadRedirectMap(config.force)

  log(`wiki.gg: fetching the ${WIKI_PAGE} index...`)
  const mainText = (await fetchWikitext(net, config, [WIKI_PAGE])).get(WIKI_PAGE)?.content
  if (!mainText) throw new Error(`could not read ${WIKI_PAGE} from wiki.gg`)

  const roster = parseRoster(mainText)
  log(`wiki.gg: parsed ${roster.length} roster rows`)
  const types = [...new Set(roster.map((row) => row.type).filter(Boolean))]
  const roles = [...new Set(roster.map((row) => row.role).filter(Boolean))]

  const typePages = await fetchWikitext(net, config, types)

  log(`wiki.gg: fetching ${WIKI_ZOBO_PAGE}...`)
  const zoboText = (await fetchWikitext(net, config, [WIKI_ZOBO_PAGE])).get(WIKI_ZOBO_PAGE)?.content ?? ''
  const zoboRows = parseZoboSkills(zoboText)
  const zoboResolved = await fetchWikitext(net, config, zoboRows.map((row) => row.title))
  const zoboByTitle = new Map()
  for (const row of zoboRows) {
    const resolved = zoboResolved.get(row.title)?.title
    if (!resolved) {
      warn(`Zobo Horde row ${row.name} links to ${row.title}, which could not be resolved`)
      continue
    }
    zoboByTitle.set(resolved, row)
  }

  const detailTitles = roster.map((row) => row.detailsTitle).filter(Boolean)
  const wanted = config.limit > 0 ? detailTitles.slice(0, config.limit) : detailTitles
  log(`wiki.gg: fetching ${wanted.length} detail pages...`)
  const details = await fetchWikitext(net, config, wanted)

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
    if (!infobox) warn(`${detail.title} has no Infobox critter - its row ships without skill or stats`)
    infoboxes.set(detail.title, infobox)
    detailsProcessed += 1
  }
  log(`wiki.gg: details fetched=${detailsProcessed} failed=${detailsFailed}`)

  const detailFor = (row) => (row.detailsTitle ? (details.get(row.detailsTitle) ?? null) : null)
  const infoboxFor = (row) => {
    const detail = detailFor(row)
    return detail ? (infoboxes.get(detail.title) ?? null) : null
  }
  const resolvedTitleFor = (row) => detailFor(row)?.title ?? row.detailsTitle ?? null
  const rosterNameByTitle = new Map()
  for (const row of roster) rosterNameByTitle.set(resolvedTitleFor(row), row.name)
  flushRedirectMap()

  // Artwork resolution.
  const wantedFiles = new Set()
  const want = (name) => { if (name) wantedFiles.add(name) }
  for (const name of [...types, ...roles]) want(`${name}.png`)
  for (const file of Object.values(STAT_IMAGES)) want(file)
  for (const row of roster) {
    want(row.sourceFile)
    want(row.glitterSourceFile)
    const infobox = infoboxFor(row)
    if (!infobox) continue
    if (infobox.skillName) want(`${infobox.skillName}.png`)
    for (const stage of infobox.stages) want(stageImageName(stage.name))
  }
  const required = new Set(wantedFiles)
  for (const row of zoboRows) {
    want(row.sourceFile)
    for (const skill of row.skills) want(`${skill.name}.png`)
  }
  const optional = [...wantedFiles].filter((name) => !required.has(name))
  log(`wiki.gg: resolving ${wantedFiles.size} file names...`)
  const resolved = await resolveFiles(net, [...wantedFiles], optional)
  const record = (name) => {
    if (!name) return null
    const hit = resolved.get(fileKey(name))
    return hit ? hit.filename : null
  }
  const fileUrls = new Map()
  for (const hit of resolved.values()) fileUrls.set(hit.filename, hit.url)

  const { families, familyOf } = buildFamilies(roster, { resolvedTitleFor, infoboxFor, zoboByTitle, record })
  const documentedFamilies = families.filter((family) => family.documented)
  const { tataris, feedingDictionary } = buildRosterRows({ roster, typePages, infoboxFor, resolvedTitleFor, familyOf, record })

  log(`wiki.gg: ${families.length} evolution lines (${documentedFamilies.length} documented), ${tataris.length} rows`)

  return {
    tataris,
    families,
    documentedFamilies,
    feedingUpgrades: feedingDictionary,
    rosterNameByTitle,
    fileUrls,
    referenceParts: {
      meta: {
        sourceUrl: pageUrl(WIKI_PAGE),
        pageBase: WIKI_BASE_URL,
        imageBase: WIKI_IMAGE_BASE,
        zoboHordeSource: pageUrl(WIKI_ZOBO_PAGE),
      },
      types: types.map((name) => ({ name, image: `${name}.png` })),
      roles: roles.map((name) => ({ name, image: `${name}.png` })),
      statIcons: Object.fromEntries(Object.entries(STAT_IMAGES).map(([key, file]) => [key, record(file)])),
    },
    counts: { detailsProcessed, detailsFailed, types: types.length, roles: roles.length },
  }
}
