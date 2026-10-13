#!/usr/bin/env node
// Unified app scraper - Phase 1 of the app's data migration.
//
// Runs one pass over the three upstream sources in a fixed order:
//
//   1. wiki.gg    the roster, evolution lines, skills and prose (the master)
//   2. tatary.xyz the game's own numbers, plus the game-only icons
//   3. tatadex.org the Tatari/Glitter portraits and the skill-icon fallback
//
// and writes only the data the Roster and Codex tabs read, plus a categorised
// image set:
//
//   public/app-cache/data/*.json   data (see scraper/app/config.js HELP)
//   public/app-cache/manifest.json run manifest + per-image ledger
//   public/images/<category>/      images, one directory per category
//
// It shares the side-effect-free helpers in scraper/lib with the three
// standalone scrapers but never imports or runs them (each runs its own main()
// on import). The wiki and tatadex parsing it needs is ported into
// scraper/app/*.js, and enrichment reuses tatary_enrichment.js's pure
// applyEnrichment.
//
// Image rules (from the project brief):
//   Tatari portraits  tatadex.org first, wiki.gg as fallback
//   Skill icons       wiki.gg first, tatadex.org as fallback
//   Other icons       the source that publishes them
//
// Every category is confirmed with the operator before it is downloaded.

import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { log, warn } from './lib/cli.js'
import { applyEnrichment, loadTataryCache } from './tatary_enrichment.js'
import {
  DATA_DIR, HELP, MANIFEST_FILE, ROOT, TATADEX_BASE, TATARY_BASE, WIKI_BASE, createConfig,
} from './app/config.js'
import { createNet } from './app/http.js'
import { scrapeWiki } from './app/wiki.js'
import { scrapeTatary } from './app/tatary.js'
import { scrapeTatadex } from './app/tatadex.js'
import {
  buildArtIndex, buildReference, buildZoboHorde, createPlan, groupJobs, mergeRows,
} from './app/merge.js'

const MAGIC = {
  png: [0x89, 0x50, 0x4e, 0x47],
  jpeg: [0xff, 0xd8],
  gif: [0x47, 0x49, 0x46],
  riff: [0x52, 0x49, 0x46, 0x46],
}

/** True when the body starts with a known image signature (guards error pages). */
function looksLikeImage(bytes) {
  for (const signature of Object.values(MAGIC)) {
    if (bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)) return true
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('utf8').toLowerCase() === '<svg ') return true
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('utf8') === '<?xml') return true
  return false
}

const relFromRoot = (file) => path.relative(ROOT, file).replaceAll('\\', '/')

async function hasContent(file) {
  try {
    const info = await stat(file)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- images

async function scanExisting(groups, config) {
  for (const group of groups.values()) {
    for (const job of group.jobs) {
      const present = !config.force && (await hasContent(job.destination))
      job.present = present
      if (present) group.cached += 1
      else group.pending += 1
    }
  }
}

function printSummary(groups, total) {
  log(`Discovered ${total} image assets.`)
  for (const group of groups.values()) {
    if (!group.jobs.length) continue
    const origins = [...new Set(group.jobs.map((job) => job.origin))].sort().join('+')
    log(`  ${group.category.padEnd(15)} ${String(group.jobs.length).padStart(4)} images  (${group.pending} new, ${group.cached} cached)  [${origins}]`)
  }
}

async function confirmSelection(groups, config) {
  const available = [...groups.values()].filter((group) => group.jobs.length)
  if (config.skipImages) {
    log('--skip-images: writing the data and manifest without downloading images.')
    return new Set()
  }
  if (config.onlyCategories) {
    for (const category of config.onlyCategories) {
      if (!groups.get(category)?.jobs.length) warn(`--only ${category}: no images in that category`)
    }
    return new Set(config.onlyCategories)
  }
  if (config.yes) {
    log('--yes: downloading every category.')
    return new Set(available.map((group) => group.category))
  }
  if (!process.stdin.isTTY) {
    warn('stdin is not interactive; no categories selected. Re-run with --yes or --only <categories>.')
    return new Set()
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const selected = new Set()
  try {
    for (const group of available) {
      const answer = (await rl.question(`Download ${group.category}? ${group.jobs.length} images (${group.pending} new, ${group.cached} cached) [y/N] `)).trim().toLowerCase()
      if (answer === 'y' || answer === 'yes') selected.add(group.category)
      else log(`  skipped ${group.category}`)
    }
  } finally {
    rl.close()
  }
  return selected
}

async function downloadJob(job, net, config) {
  if (!config.force && (await hasContent(job.destination))) {
    return { status: 'cached', localFile: relFromRoot(job.destination) }
  }
  if (!job.url) return { status: 'missing', error: 'no source URL' }

  let response
  try {
    response = await net.fetchImage(job.url)
  } catch (error) {
    return { status: 'missing', error: error instanceof Error ? error.message : String(error) }
  }
  if (!response) return { status: 'missing', error: 'HTTP 404' }

  const contentType = String(response.headers.get('content-type') || '')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) return { status: 'missing', error: 'empty response' }
  if (!contentType.startsWith('image/') && !looksLikeImage(bytes)) {
    return { status: 'missing', error: `unexpected content-type ${contentType || '(none)'}` }
  }

  await mkdir(path.dirname(job.destination), { recursive: true })
  await writeFile(job.destination, bytes)
  return { status: 'downloaded', localFile: relFromRoot(job.destination) }
}

async function downloadSelected(groups, selected, net, config) {
  const counts = { downloaded: 0, cached: 0, missing: 0, skipped: 0 }
  const scheduled = []
  for (const group of groups.values()) {
    for (const job of group.jobs) {
      if (selected.has(group.category)) scheduled.push(job)
      else {
        job.result = { status: 'skipped' }
        counts.skipped += 1
      }
    }
  }
  if (!scheduled.length) return counts

  let cursor = 0
  let completed = 0
  const settle = (job, result) => {
    job.result = result
    counts[result.status] = (counts[result.status] ?? 0) + 1
    completed += 1
    if (completed % 25 === 0 || completed === scheduled.length) {
      log(`image progress ${completed}/${scheduled.length} (downloaded=${counts.downloaded}, cached=${counts.cached}, missing=${counts.missing})`)
    }
  }

  const worker = async () => {
    while (cursor < scheduled.length) {
      const job = scheduled[cursor]
      cursor += 1
      settle(job, await downloadJob(job, net, config))
    }
  }
  await Promise.all(Array.from({ length: Math.min(config.imageConcurrency, scheduled.length) }, worker))
  return counts
}

// ---------------------------------------------------------------- main

async function writeJson(file, value, pretty) {
  await writeFile(file, pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value), 'utf8')
  log(`wrote ${relFromRoot(file)}`)
}

async function main() {
  const config = createConfig(process.argv.slice(2))
  if (config.help) {
    console.log(HELP)
    return
  }

  const scrapedAt = new Date().toISOString()
  const net = createNet(config)
  await mkdir(DATA_DIR, { recursive: true })

  log(`app scraper: wiki.gg -> tatary.xyz -> tatadex.org${config.limit > 0 ? ` (limit ${config.limit})` : ''}`)

  // 1. wiki.gg: the master roster, families, prose and vocabularies.
  const wiki = await scrapeWiki(net, config)

  // 2. tatary.xyz: the game tables and the game-only icons.
  const tatary = await scrapeTatary(net, config)

  // 3. tatadex.org: the portrait and skill-icon sources, named against the wiki.
  const tatadex = await scrapeTatadex(net, config, { tataris: wiki.tataris, families: wiki.families })

  // Merge under the image rules.
  const plan = createPlan()
  for (const asset of tatary.assets) plan.add(asset)
  const rows = mergeRows(wiki, tatadex, plan, wiki.fileUrls, TATADEX_BASE)
  const reference = buildReference(wiki, plan, wiki.fileUrls, scrapedAt)
  const zoboHorde = buildZoboHorde(wiki, plan, wiki.fileUrls)
  const artIndex = buildArtIndex(rows, scrapedAt)

  // Enrich with the game's growth/rarity/role, exactly as the standalone
  // enrichment pass does, reading the tables this run just wrote.
  let enrichmentReport = null
  const cache = await loadTataryCache(DATA_DIR)
  if (cache) {
    enrichmentReport = applyEnrichment(rows, cache)
    log(`enrichment: ${enrichmentReport.enriched}/${rows.length} rows matched to game data`)
    if (enrichmentReport.unmatched.length) log(`enrichment: no game record for ${enrichmentReport.unmatched.length} rows`)
  } else {
    warn('enrichment: game tables unavailable; rows ship without growth data')
  }

  const jobs = plan.jobs()
  reference.meta.imagesRequested = jobs.length

  // Data files. The three game tables were written by the tatary phase.
  await writeJson(path.join(DATA_DIR, 'tataris.json'), rows, false)
  await writeJson(path.join(DATA_DIR, 'reference.json'), reference, true)
  await writeJson(path.join(DATA_DIR, 'zoboHorde.json'), zoboHorde, false)
  await writeJson(path.join(DATA_DIR, 'feedingUpgrades.json'), wiki.feedingUpgrades, true)
  await writeJson(path.join(DATA_DIR, 'artIndex.json'), artIndex, false)

  // Images, category by category.
  const groups = groupJobs(jobs)
  await scanExisting(groups, config)
  printSummary(groups, jobs.length)
  const selected = await confirmSelection(groups, config)
  const counts = await downloadSelected(groups, selected, net, config)

  const manifest = {
    version: 1,
    scrapedAt,
    finishedAt: new Date().toISOString(),
    sources: { wiki: WIKI_BASE, tatary: TATARY_BASE, tatadex: TATADEX_BASE },
    options: {
      limit: config.limit,
      delay: config.delay,
      force: config.force,
      tataryVersion: config.tataryVersion,
      selectedCategories: [...selected].sort(),
    },
    data: {
      units: { path: 'data/units.json', status: tatary.statuses.units },
      petNames: { path: 'data/pet_names.json', status: tatary.statuses.petNames },
      trials: { path: 'data/trials.json', status: tatary.statuses.trials },
      tataris: { path: 'data/tataris.json', count: rows.length },
      reference: { path: 'data/reference.json' },
      zoboHorde: { path: 'data/zoboHorde.json', families: zoboHorde.families.length },
      feedingUpgrades: { path: 'data/feedingUpgrades.json', count: wiki.feedingUpgrades.length },
      artIndex: { path: 'data/artIndex.json', rows: Object.keys(artIndex.rows).length },
    },
    enrichment: enrichmentReport
      ? {
          enriched: enrichmentReport.enriched,
          unmatched: enrichmentReport.unmatched.length,
          rarityFixes: enrichmentReport.rarityFixes.length,
          roleFixes: enrichmentReport.roleFixes.length,
          typeDisagreements: enrichmentReport.typeDisagreements.length,
          problems: enrichmentReport.problems.length,
        }
      : null,
    counts: { imageJobs: jobs.length, ...counts },
    categories: [...groups.values()]
      .filter((group) => group.jobs.length)
      .map((group) => {
        const tally = { downloaded: 0, cached: 0, missing: 0, skipped: 0 }
        for (const job of group.jobs) tally[job.result?.status ?? 'skipped'] += 1
        return { name: group.category, total: group.jobs.length, pending: group.pending, cachedOnDisk: group.cached, ...tally }
      }),
    assets: jobs.map((job) => ({
      category: job.category,
      filename: job.filename,
      localFile: `public/images/${job.category}/${job.filename}`,
      origin: job.origin,
      remotePath: job.remotePath,
      url: job.url,
      sources: [...job.sources].sort(),
      ...(job.result ?? { status: 'skipped' }),
    })),
  }
  await writeJson(MANIFEST_FILE, manifest, true)

  log(
    `done: ${rows.length} tataris, ${jobs.length} images (downloaded=${counts.downloaded}, cached=${counts.cached}, missing=${counts.missing}, skipped=${counts.skipped})`,
  )
}

main().catch((error) => {
  log(error instanceof Error ? error.message : String(error), 'ERROR')
  process.exitCode = 1
})
