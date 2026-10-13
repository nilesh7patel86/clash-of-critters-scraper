// Pure merge and image-planning logic for the app scraper.
//
// Everything here is a function of its inputs - no network, no filesystem - so
// the image rules (which source wins for which category) can be tested directly
// in scraper/test/app_scraper.test.js and cannot drift from what a run writes.

import path from 'node:path'
import { CATEGORIES, IMAGES_ROOT } from './config.js'

/** A filename that is safe to join under a category directory. */
export const sanitize = (name) => {
  const cleaned = String(name).replace(/[\\/]+/g, '_').trim()
  let out = ''
  for (const char of cleaned) out += char.charCodeAt(0) < 0x20 ? '_' : char
  return out
}

export const baseName = (assetPath) => {
  const raw = String(assetPath)
  const cut = raw.lastIndexOf('/')
  return decodeURIComponent(cut >= 0 ? raw.slice(cut + 1) : raw)
}

export const extOf = (filename) => path.extname(filename) || '.png'

/** Case/punctuation-insensitive key, so wiki and tatadex names join. */
export const fold = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The run's image ledger. Every produced image is registered here exactly once,
 * keyed by `category/filename`; the first registration owns the source URL and
 * later ones only contribute provenance. Adding returns the `category/filename`
 * reference the data files store, so a field and its file can never disagree.
 */
export function createPlan() {
  const byKey = new Map()
  return {
    add(job) {
      if (!job || !job.filename) return null
      const filename = sanitize(job.filename)
      if (!filename) return null
      const key = `${job.category}/${filename}`
      let entry = byKey.get(key)
      if (!entry) {
        entry = {
          category: job.category,
          filename,
          url: job.url ?? null,
          origin: job.origin,
          remotePath: job.remotePath ?? null,
          sources: new Set(),
        }
        byKey.set(key, entry)
      }
      for (const source of job.sources ?? []) entry.sources.add(source)
      return key
    },
    has(category, filename) {
      return byKey.has(`${category}/${sanitize(filename)}`)
    },
    jobs() {
      return [...byKey.values()]
    },
  }
}

/** Register a wiki.gg image by its wiki filename, if the wiki actually has it. */
export function addWikiImage(plan, fileUrls, category, filename, source) {
  if (!filename) return null
  const url = fileUrls.get(filename)
  if (!url) return null
  return plan.add({ category, filename, url, origin: 'wiki', sources: [source] })
}

/**
 * Apply the portrait/skill precedence rules and build the final rows.
 *
 *   Tatari portrait  tatadex art, else the wiki filename
 *   Glitter portrait tatadex art, else the wiki filename
 *   Skill icon       the wiki file, else the tatadex icon
 *
 * Tatadex art is filed under the row's own name (keeping the extension) so a
 * portrait rename is never reported as an "odd name" by the Codex.
 */
export function mergeRows(wiki, tatadex, plan, fileUrls, tatadexBase) {
  return wiki.tataris.map((row) => {
    const td = tatadex.byName.get(fold(row.name)) ?? null

    let normalImage = null
    if (td?.art?.normal) {
      normalImage = plan.add({
        category: 'tatari',
        filename: `${row.name}${extOf(baseName(td.art.normal))}`,
        url: `${tatadexBase}${td.art.normal}`,
        origin: 'tatadex',
        remotePath: td.art.normal,
        sources: [`tatadex:${row.name}:normal`],
      })
    }
    if (!normalImage) normalImage = addWikiImage(plan, fileUrls, 'tatari', row.normalImage, `wiki:${row.name}:normal`)

    let glitterImage = null
    if (td?.art?.glitter) {
      glitterImage = plan.add({
        category: 'tatari-glitter',
        filename: `${row.name}_glitter${extOf(baseName(td.art.glitter))}`,
        url: `${tatadexBase}${td.art.glitter}`,
        origin: 'tatadex',
        remotePath: td.art.glitter,
        sources: [`tatadex:${row.name}:glitter`],
      })
    }
    if (!glitterImage) glitterImage = addWikiImage(plan, fileUrls, 'tatari-glitter', row.glitterImage, `wiki:${row.name}:glitter`)

    let skillImage = null
    if (row.skill?.skillImage) skillImage = addWikiImage(plan, fileUrls, 'tatari-skills', row.skill.skillImage, `wiki:${row.name}:skill`)
    if (!skillImage && td?.skillIcon) {
      const skillName = row.skill?.skillName || row.name
      skillImage = plan.add({
        category: 'tatari-skills',
        filename: `${skillName}${extOf(baseName(td.skillIcon))}`,
        url: `${tatadexBase}${td.skillIcon}`,
        origin: 'tatadex',
        remotePath: td.skillIcon,
        sources: [`tatadex:${row.name}:skill`],
      })
    }

    return { ...row, normalImage, glitterImage, skill: row.skill ? { ...row.skill, skillImage } : null }
  })
}

/** The element/role vocabularies, the stat chips and the provenance meta. */
export function buildReference(wiki, plan, fileUrls, scrapedAt) {
  const types = wiki.referenceParts.types.map((item) => ({
    name: item.name,
    image: addWikiImage(plan, fileUrls, 'elements', item.image, `wiki:type:${item.name}`),
  }))
  const roles = wiki.referenceParts.roles.map((item) => ({
    name: item.name,
    image: addWikiImage(plan, fileUrls, 'roles', item.image, `wiki:role:${item.name}`),
  }))

  // Stat chips use the game's own attr icons; the wiki's Attack/HP/Defense art
  // is only a fallback, so the Roster and the Codex read the same three files.
  const tataryAttr = { attack: 'atk.png', hp: 'hp.png', defense: 'def.png' }
  const statIcons = {}
  for (const [key, wikiFile] of Object.entries(wiki.referenceParts.statIcons)) {
    statIcons[key] = plan.has('attributes', tataryAttr[key])
      ? `attributes/${tataryAttr[key]}`
      : addWikiImage(plan, fileUrls, 'attributes', wikiFile, `wiki:stat:${key}`)
  }

  return {
    meta: {
      scrapedAt,
      sourceUrl: wiki.referenceParts.meta.sourceUrl,
      pageBase: wiki.referenceParts.meta.pageBase,
      imageBase: wiki.referenceParts.meta.imageBase,
      appImageBase: 'images/',
      totalTataris: wiki.tataris.length,
      detailsProcessed: wiki.counts.detailsProcessed,
      detailsFailed: wiki.counts.detailsFailed,
      zoboHordeSource: wiki.referenceParts.meta.zoboHordeSource,
      evolutionLines: wiki.families.length,
      zoboHordeDocumented: wiki.documentedFamilies.length,
      imagesRequested: 0, // filled once the plan is complete
    },
    types,
    roles,
    statIcons,
  }
}

/** The evolution lines with their Zobo Horde skills (Codex only). */
export function buildZoboHorde(wiki, plan, fileUrls) {
  const families = wiki.families.map((family) => ({
    name: family.name,
    type: family.type,
    members: family.members,
    skills: family.skills.map((skill) => ({
      level: skill.level,
      name: skill.name,
      description: skill.description,
      image: addWikiImage(plan, fileUrls, 'tatari-skills', skill.image, `wiki:zobo:${family.name}:${skill.level}`),
    })),
    notes: family.notes,
    documented: family.documented,
  }))
  return { source: wiki.referenceParts.meta.zoboHordeSource, levels: [1, 3, 5, 7], families }
}

/** name -> { normal, glitter } for the Roster's portrait index. */
export function buildArtIndex(rows, scrapedAt) {
  const index = {}
  for (const row of rows) {
    const entry = {}
    if (row.normalImage) entry.normal = row.normalImage
    if (row.glitterImage) entry.glitter = row.glitterImage
    index[row.name] = entry
  }
  return { version: 1, scrapedAt, rows: index }
}

/** Group plan jobs by category, in the declared category order, with destinations set. */
export function groupJobs(jobs, imagesRoot = IMAGES_ROOT) {
  const groups = new Map()
  const groupFor = (category) => {
    let group = groups.get(category)
    if (!group) {
      group = { category, jobs: [], pending: 0, cached: 0 }
      groups.set(category, group)
    }
    return group
  }
  for (const category of CATEGORIES) groupFor(category)
  for (const job of jobs) {
    job.destination = path.join(imagesRoot, job.category, job.filename)
    groupFor(job.category).jobs.push(job)
  }
  return groups
}
