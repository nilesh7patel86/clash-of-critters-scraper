import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from './lib/cli.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const TATARY_DATA_DIR = path.join(ROOT, 'public', 'tatary-cache', 'data')
export const WIKI_DATA_DIR = path.join(ROOT, 'public', 'wiki-cache', 'data')

// ---------------------------------------------------------------------------
// Translation tables
//
// Tatary's data tables ship display strings in Russian and English names beside
// them, so anything with a usable `en` field is read from there and the other
// five languages are dropped on the floor - they are not wrong, just not wanted.
//
// `careers` is the one place with no English at all, so the six Russian role
// names are translated here. A career that arrives without a translation is
// warned about rather than guessed at, and that row keeps the wiki's own role.
// ---------------------------------------------------------------------------
const CAREER_EN = {
  'Танк': 'Tank',
  'Гвардеец': 'Guardian',
  'Урон': 'DPS',
  'Хил': 'Healer',
  'Поддержка': 'Support',
  'Специалист': 'Specialist',
}

// The element id in units.pets[].el, and the quality id in evo[].q, are both
// small integers that the game never states in words. These two tables were
// read off the data across all 232 shared names, and they agree with the wiki
// on every name they cover (type 232/232, rarity 229/232 - the three
// disagreements are wiki entries the game rates higher). checkMappings
// re-checks the element table on every run so a silent upstream renumbering
// cannot mislabel a roster.
const TYPE_BY_ELEMENT = { 2: 'Water', 3: 'Fire', 4: 'Grass', 5: 'Lightning', 6: 'Rock' }
const RARITY_BY_QUALITY = { 2: 'Blue', 3: 'Purple', 4: 'Gold', 5: 'Red', 6: 'Rainbow' }

// Growth is stored as the game's own multipliers: ag/dg/hg are attack, defense
// and hp growth per level, spd is speed. The wiki publishes grade letters
// instead, which cannot be inverted back into these - a 'D' spans a range of
// growth values, and which growth values map to which letter depends on the
// unit's rarity. So these numbers have no wiki equivalent and are pure gain.
const GROWTH_FIELDS = [
  ['attackGrowth', 'ag'],
  ['defenseGrowth', 'dg'],
  ['hpGrowth', 'hg'],
  ['speedGrowth', 'spd'],
]

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

// Tatary's units.json is a whole game client's data dump; only the parts the
// roster can be enriched from are validated, so an upstream schema change in
// the PvE tables does not break the merge.
export async function loadTataryCache(dataDir = TATARY_DATA_DIR) {
  const unitsFile = path.join(dataDir, 'units.json')
  const namesFile = path.join(dataDir, 'pet_names.json')
  if (!existsSync(unitsFile) || !existsSync(namesFile)) return null

  const units = await readJson(unitsFile)
  const petNames = await readJson(namesFile)
  if (!Array.isArray(units.pets)) throw new Error('units.json does not contain a pets array')
  if (!units.evo || typeof units.evo !== 'object') throw new Error('units.json is missing evo')
  if (!petNames || typeof petNames !== 'object') throw new Error('pet_names.json does not contain an object')

  // English name -> { petId, stage }. Built from the `en` field only; the
  // ru/de/es/fr/pt siblings are never read. The internal `code` is dropped on
  // purpose - it is a code name, not a creature name, and does not belong in
  // the wiki data.
  const byName = new Map()
  for (const [petId, entry] of Object.entries(petNames)) {
    for (const [stage, localized] of Object.entries(entry.evos || {})) {
      const name = localized?.en
      if (typeof name === 'string' && name) byName.set(name, { petId, stage })
    }
  }

  const petById = new Map(units.pets.map((pet) => [String(pet.id), pet]))
  return { units, byName, petById }
}

// Confirms the element table against the wiki, name by name. The element id and
// the type are two views of the same fact, so they must agree; when they do not,
// the ids have been renumbered and the table must not be used. Rarity is left
// out on purpose - the game rates three rows above the wiki, and the correction
// in applyEnrichment is what resolves those.
function checkMappings(matched) {
  const problems = []
  let compared = 0
  for (const { row, type, wikiType } of matched) {
    if (!type || !wikiType) continue
    compared += 1
    if (type !== wikiType) problems.push(`type table says ${row.name} is ${type}, wiki says ${wikiType}`)
  }
  // A table that quietly matched nothing has not been verified at all.
  if (compared === 0) problems.push('no rows could be compared against the wiki')
  return problems
}

// Adds a `tatary` block to each wiki row, and corrects `rarity` and `role` where
// the game is the more precise source.
//
// The wiki stays the master: the family structure, the newer roster, skills and
// all prose are untouched. Three things cross over - growth numbers the wiki has
// no equivalent for, rarity, and role, which the game states in Russian. Type is
// reported but never written, because the wiki already carries it and the two
// sources agree everywhere.
export function applyEnrichment(rows, cache, options = {}) {
  const fixRarity = options.fixRarity !== false

  const matched = []
  const rarityFixes = []
  const roleFixes = []
  const unmatched = []

  for (const row of rows) {
    const hit = cache.byName.get(row.name)
    if (!hit) {
      unmatched.push(row.name)
      continue
    }

    const pet = cache.petById.get(hit.petId)
    const evo = cache.units.evo?.[hit.petId]?.[hit.stage] || null
    if (!pet && !evo) {
      unmatched.push(row.name)
      continue
    }

    const type = pet ? TYPE_BY_ELEMENT[pet.el] ?? null : null
    const wikiType = row.type
    const quality = evo?.q ?? null
    const rarity = quality != null ? RARITY_BY_QUALITY[quality] ?? null : null

    // The game states roles only in Russian; translate, and fall back to the
    // wiki's own value if a career id has no translation yet.
    const careerId = pet?.career
    const careerRu = careerId != null ? cache.units.careers?.[String(careerId)]?.name : null
    const translatedRole = careerRu ? CAREER_EN[careerRu] ?? null : null
    if (careerRu && !translatedRole) log(`career ${careerRu} has no English translation`, 'WARN')

    const growth = {}
    for (const [key, source] of GROWTH_FIELDS) {
      if (evo && typeof evo[source] === 'number') growth[key] = evo[source]
    }

    // Rarity correction. Only ever moves a row upward, and only when the two
    // sources actually disagree, so a wiki edit that lowers a rarity is not
    // silently undone and a stable row costs nothing.
    if (fixRarity && rarity && row.rarity && row.rarity !== rarity) {
      const upward = quality > (rarityOrder(row.rarity) ?? -1)
      if (upward) {
        rarityFixes.push({ name: row.name, from: row.rarity, to: rarity })
        row.rarity = rarity
      }
    }

    // Role is corrected from the translated game value, same as rarity: the
    // translation is unambiguous, and the wiki's cell is a hand-maintained
    // string. A row with no translation keeps the wiki's.
    if (translatedRole && row.role && row.role !== translatedRole) {
      roleFixes.push({ name: row.name, from: row.role, to: translatedRole })
      row.role = translatedRole
    }

    row.tatary = {
      elementId: pet?.el ?? null,
      qualityId: quality,
      careerId: careerId ?? null,
      // True when the translation above produced the role, false when it fell
      // back to the wiki. A whole field that is never true would mean the
      // translation table is wrong, not that the game is silent.
      roleTranslated: Boolean(translatedRole),
      ...(Object.keys(growth).length ? { growth } : {}),
    }

    matched.push({ row, type, rarity, wikiType })
  }

  const problems = checkMappings(matched)
  for (const problem of problems) log(`mapping check: ${problem}`, 'WARN')

  // Type is reported, never written. The wiki already carries it, the game
  // agrees on all 232 shared names, and an element id is a weaker source than a
  // wiki cell that a person maintains. The disagreement list is what tells us if
  // that ever stops being true.
  const typeDisagreements = matched
    .filter((m) => m.type && m.wikiType && m.type !== m.wikiType)
    .map((m) => `${m.row.name}: wiki=${m.wikiType} game=${m.type}`)

  return {
    enriched: matched.length,
    unmatched,
    rarityFixes,
    roleFixes,
    problems,
    typeDisagreements,
  }
}

const RARITY_ORDER = ['Blue', 'Purple', 'Gold', 'Red', 'Rainbow']
function rarityOrder(name) {
  const index = RARITY_ORDER.indexOf(name)
  return index < 0 ? null : index
}

// Standalone entry point: re-run just the enrichment against data already in the
// cache, without touching the network. Useful after reviewing a report.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  enrichWikiData().then((report) => {
    if (!report) process.exitCode = 1
  }).catch((error) => {
    log(error instanceof Error ? error.message : String(error), 'ERROR')
    process.exitCode = 1
  })
}

// Enriches the roster and writes tataris.json back. The other three data files
// are left alone: enrichment only ever touches per-Tatari fields, and rewriting
// them would churn files whose contents did not change.
export async function enrichWikiData(options = {}) {
  const dataDir = options.dataDir || WIKI_DATA_DIR
  // --out lets the wiki scraper rename the roster, so the file to enrich is a
  // parameter rather than a fixed name.
  const tatarisFile = options.tatarisFile || path.join(dataDir, 'tataris.json')

  const cache = await loadTataryCache(options.tataryDataDir)
  if (!cache) {
    log('tatary-cache/data is missing; skipping enrichment. Run `npm run scrape_tatary` first.', 'WARN')
    return null
  }

  const tataris = await readJson(tatarisFile)
  if (!Array.isArray(tataris)) throw new Error('tataris.json does not contain an array')

  const report = applyEnrichment(tataris, cache, options)
  const fixRarity = options.fixRarity !== false

  if (options.write === false) return report

  const { writeFile } = await import('node:fs/promises')
  // Compact, like the scraper's own write: this file is what a client downloads
  // on first paint, and an enriched tataris.json that came back pretty-printed
  // would silently undo that (it is 328KB indented vs 234KB compact).
  await writeFile(tatarisFile, JSON.stringify(tataris), 'utf8')

  log(`Enriched ${report.enriched}/${tataris.length} tataris from tatary data`)
  if (report.unmatched.length) log(`No game record for ${report.unmatched.length}: ${report.unmatched.join(', ')}`)
  if (report.rarityFixes.length) {
    for (const fix of report.rarityFixes) log(`rarity ${fix.name}: ${fix.from} -> ${fix.to} (game data)`)
  } else if (fixRarity) {
    log('rarity: no corrections needed')
  }
  if (report.roleFixes.length) {
    for (const fix of report.roleFixes) log(`role ${fix.name}: ${fix.from} -> ${fix.to} (translated from game data)`)
  }
  if (report.typeDisagreements.length) {
    for (const line of report.typeDisagreements) log(`type disagreement ${line}`, 'WARN')
  }

  return report
}
