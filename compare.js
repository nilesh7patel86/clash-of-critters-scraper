// Shared engine for the side-by-side image comparison pages.
//
//   compare-tatari.html         -> data-page="main"    normal/glitter card art
//   compare-tatari-skills.html  -> data-page="skills"  skill icons
//   compare-tatari-icons.html   -> data-page="icons"   shared UI icon sets
//                                              (elements / roles / stats)
//
// Like cards.html this page is build-free: it fetches whatever the scrapers
// last wrote into public/ and renders it, so it never goes stale on its own.
// Two pieces of a cache matter here:
//   - the data file  (names, art references, skill references)
//   - the manifest   (maps a remote asset path to its local file, carries the
//                     scrape timestamp, and doubles as the provenance ledger)
// Rows are one evolution stage per tatari. Records are joined into rows with a
// union-find over name evidence: the exact saved key first, then the wiki image
// filename stem (Flametail's art is Firefox.png, so it reaches the firefox
// row), then a small edit distance between spellings. The fuzzy joins only
// apply when the two spellings come from disjoint sources — Sizribb/Sizzribb
// merge, but Sparkrow and Sparkdoe are separate pets on all three sites and
// stay separate rows.
//
// Every cell is its own selectable unit. A tick stores the block id in
// localStorage; "Save selection -> JSON" downloads the details of every ticked
// image (source, filename, local + remote URL, dimensions, file size, format,
// SHA-256 and the row's identity data) so the choice survives this page.

// ------------------------------------------------------------------ constants

const SITE = {
  tatadex: { label: 'Tatadex', domain: 'https://tatadex.org', color: '#58a6ff' },
  wiki: { label: 'Wiki.gg', domain: 'https://clashofcritters.wiki.gg', color: '#3fb950' },
  tatary: { label: 'Tatary', domain: 'https://tatary.xyz', color: '#d29922' },
}
const SITES = ['tatadex', 'wiki', 'tatary']

// Mirrored from src/domain.ts / src/petHelpers.ts / src/wikiCodex.ts so a
// build-free page needs no import.
const ELEMENT_LABEL = { 1: 'Neutral', 2: 'Water', 3: 'Fire', 4: 'Grass', 5: 'Lightning', 6: 'Rock' }
const POSITION_LABEL = { 1: 'Front', 2: 'Middle', 3: 'Back' }
const CAREER_LABEL = { 1: 'Tank', 2: 'Guardian', 3: 'DPS', 4: 'Healer', 5: 'Support', 6: 'Specialist' }
const RARITY_COLOR = { Blue: '#6da9e9', Purple: '#8f5ae2', Gold: '#f5c54e', Red: '#f20c00', Rainbow: '#ff4fd8' }
const ELEMENT_COLOR = { Water: '#4da8ff', Fire: '#ff765e', Grass: '#63d391', Lightning: '#f6c84c', Rock: '#d58b67' }

// Shiny exclusions and stage-name fallbacks, mirrored from src/petHelpers.ts
// (which reads them from shared/shiny.json).
const SHINY = { stages: ['34:4', '36:4', '42:4', '48:4'], ids: [61] }
const STAGE_NAME_FALLBACKS = { '49:4': 'Dharmadder', '51:4': 'Lordopus' }

// ------------------------------------------------------------------ page config

const PAGES = {
  main: {
    kind: 'main',
    storageKey: 'coc.compareTatariImages',
    exportName: 'tatari-images-selection.json',
    tag: 'tatari-main',
    needTataryUnits: true,
    sortByFamily: true,
    cellTitle: 'normal + glitter',
    title: 'Tatari main images',
    rowHead: 'Tatari',
    countNoun: 'tatari',
  },
  skills: {
    kind: 'skills',
    storageKey: 'coc.compareTatariSkills',
    exportName: 'tatari-skill-images-selection.json',
    tag: 'tatari-skills',
    needTataryUnits: false,
    cellTitle: 'skill icon',
    title: 'Tatari skill images',
    rowHead: 'Tatari',
    countNoun: 'tatari',
  },
  icons: {
    kind: 'icons',
    storageKey: 'coc.compareTatariIcons',
    exportName: 'tatari-icon-images-selection.json',
    tag: 'tatari-icons',
    needTataryUnits: false,
    cellTitle: 'icon',
    title: 'Tatari icon sets',
    rowHead: 'Icon',
    countNoun: 'icons',
  },
}

// ------------------------------------------------------------------ DOM helpers

function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else if (k === 'checked') node.checked = v
    else if (k === 'style') node.setAttribute('style', v)
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of [kids].flat()) if (kid != null) node.append(kid)
  return node
}

const $ = (sel) => document.querySelector(sel)

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fmtDate(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10)
}

// ------------------------------------------------------------------ text utils

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const basename = (path) => String(path ?? '').split('/').pop() || ''
const stemOf = (path) => {
  const base = basename(path)
  return base ? norm(base.replace(/\.[a-z0-9]+$/i, '')) : ''
}

function levenshtein(a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1)
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[n]
}

// ------------------------------------------------------------------ data loading

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.json()
}

// Everything a wiki filename can legally hold, so apostrophes and parens are
// percent-encoded (the wiki's own URLs use %27, %28, %29).
function encodeFilename(fn) {
  return String(fn)
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/')
}

async function loadTatadex() {
  const [data, manifest] = await Promise.all([
    fetchJSON('./tatadex-cache/data/tataris.json'),
    fetchJSON('./tatadex-cache/manifest.json'),
  ])
  const fileByPath = new Map(manifest.assets.map((a) => [a.path, a.filename]))
  const ref = (path) => {
    if (!path) return null
    const filename = fileByPath.get(path)
    return {
      path,
      filename: filename ?? null,
      localUrl: filename ? `tatadex-cache/img/${filename}` : null,
      remoteUrl: `${SITE.tatadex.domain}${path}`,
    }
  }
  const records = Object.values(data).map((e) => ({
    key: norm(e.name),
    name: e.name,
    kind: 'tatadex',
    pageUrl: `${SITE.tatadex.domain}${e.url}`,
    art: { normal: ref(e.art && e.art.normal), glitter: ref(e.art && e.art.glitter) },
    skill: ref(e.skill && e.skill.icon),
    skillName: (e.skill && e.skill.name) || null,
    element: e.elementLabel || e.element || null,
    role: e.roleLabel || e.role || null,
    tier: e.tier ?? null,
    rarity: e.rarity || null,
    joinKeys: [stemOf(e.art && e.art.normal), stemOf(e.art && e.art.glitter)].filter(Boolean),
  }))
  return { records, scrapedAt: manifest.scrapedAt, source: manifest.source || SITE.tatadex.domain }
}

async function loadWiki() {
  const [data, manifest] = await Promise.all([
    fetchJSON('./wiki-cache/data/tataris.json'),
    fetchJSON('./wiki-cache/manifest.json'),
  ])
  const urlByFile = new Map(manifest.assets.map((a) => [a.filename, a.url]))
  const ref = (filename) => {
    if (!filename) return null
    return {
      filename,
      localUrl: `wiki-cache/img/${filename}`,
      remoteUrl: urlByFile.get(filename) || `${SITE.wiki.domain}/images/${encodeFilename(filename)}`,
    }
  }
  const records = data.map((e) => ({
    key: norm(e.name),
    name: e.name,
    kind: 'wiki',
    pageUrl: e.detailsPage || null,
    art: { normal: ref(e.normalImage), glitter: ref(e.glitterImage) },
    skill: ref(e.skill && e.skill.skillImage),
    skillName: (e.skill && e.skill.skillName) || null,
    skillDesc: (e.skill && e.skill.skillDescription) || null,
    skillTypes: (e.skill && e.skill.skillTypes) || [],
    type: e.type || null,
    rarity: e.rarity || null,
    role: e.role || null,
    joinKeys: [stemOf(e.normalImage), stemOf(e.glitterImage)].filter(Boolean),
  }))
  return { records, scrapedAt: manifest.scrapedAt, source: manifest.source || SITE.wiki.domain }
}

async function loadTatary(needUnits) {
  const files = [fetchJSON('./tatary-cache/data/pet_names.json'), fetchJSON('./tatary-cache/manifest.json')]
  if (needUnits) files.push(fetchJSON('./tatary-cache/data/units.json'))
  const [petNames, manifest, units] = await Promise.all(files)

  const petById = new Map()
  const peticons = {}
  if (units) {
    for (const pet of units.pets || []) petById.set(pet.id, pet)
    Object.assign(peticons, units.peticons || {})
  }

  const flashAllowed = (id, stage) => id > 10 && !SHINY.ids.includes(id) && !SHINY.stages.includes(`${id}:${stage}`)

  const record = (name, id, stage, code, pet) => {
    const icons = peticons[String(id)] || {}
    return {
      key: norm(name),
      name,
      kind: 'tatary',
      id,
      stage,
      code: code || null,
      icon: icons[String(stage)] || null,
      flashAllowed: flashAllowed(id, stage),
      el: pet ? pet.el : null,
      q: pet ? pet.q : null,
      pos: pet ? pet.pos : null,
      career: pet ? pet.career : null,
      joinKeys: [],
    }
  }

  const records = []
  const seen = new Set()
  for (const [idS, p] of Object.entries(petNames)) {
    const id = Number(idS)
    const pet = petById.get(id)
    for (const [stageS, evo] of Object.entries(p.evos || {})) {
      const stage = Number(stageS)
      const name = evo && evo.en ? evo.en : STAGE_NAME_FALLBACKS[`${id}:${stage}`]
      if (!name) continue
      records.push(record(name, id, stage, p.code, pet))
      seen.add(norm(name))
    }
  }
  // Stages the game names but pet_names.json does not list ('49:4', '51:4').
  for (const [key, name] of Object.entries(STAGE_NAME_FALLBACKS)) {
    if (seen.has(norm(name))) continue
    const [id, stage] = key.split(':').map(Number)
    records.push(record(name, id, stage, (petById.get(id) || {}).name || null, petById.get(id)))
  }
  return { records, scrapedAt: manifest.scrapedAt, source: manifest.source || SITE.tatary.domain }
}

async function loadSources(cfg) {
  const loaded = {}
  const errors = []
  const tasks = {
    tatadex: loadTatadex(),
    wiki: loadWiki(),
    tatary: loadTatary(cfg.needTataryUnits),
  }
  for (const site of SITES) {
    try {
      loaded[site] = await tasks[site]
    } catch (error) {
      errors.push(`${SITE[site].label} (${site}-cache) — ${error.message}`)
      loaded[site] = { records: [], scrapedAt: null, source: SITE[site].domain }
    }
  }
  return { loaded, errors }
}

// ------------------------------------------------------------------ icons page

// The icon page compares the three shared UI icon sets instead of tatari art:
// element badges (Tatadex + Wiki.gg; Tatary publishes none), role badges and
// stat badges (all three sources). One row per icon, named in the game's own
// vocabulary; each entry maps that icon to the cached file in each source that
// has one. Career ids are the CAREER_LABEL keys above (career_1.png = Tank …).
const ICON_CATALOG = [
  {
    key: 'element',
    label: 'Element icons',
    rows: [
      { name: 'Fire', tatadexFile: 'fire.webp', wikiImage: 'Fire.png' },
      { name: 'Grass', tatadexFile: 'grass.webp', wikiImage: 'Grass.png' },
      { name: 'Lightning', tatadexFile: 'lightning.webp', wikiImage: 'Lightning.png' },
      { name: 'Rock', tatadexFile: 'rock.webp', wikiImage: 'Rock.png' },
      { name: 'Water', tatadexFile: 'water.webp', wikiImage: 'Water.png' },
    ],
  },
  {
    key: 'role',
    label: 'Role icons',
    rows: [
      { name: 'Tank', tatadexFile: 'tank.webp', wikiImage: 'Tank.png', tataryPath: 'career/career_1.png' },
      { name: 'Guardian', tatadexFile: 'guardian.png', wikiImage: 'Guardian.png', tataryPath: 'career/career_2.png' },
      { name: 'DPS', tatadexFile: 'dps.png', wikiImage: 'DPS.png', tataryPath: 'career/career_3.png' },
      { name: 'Healer', tatadexFile: 'healer.png', wikiImage: 'Healer.png', tataryPath: 'career/career_4.png' },
      { name: 'Support', tatadexFile: 'support.png', wikiImage: 'Support.png', tataryPath: 'career/career_5.png' },
      { name: 'Specialist', tatadexFile: 'specialist.png', wikiImage: 'Specialist.png', tataryPath: 'career/career_6.png' },
    ],
  },
  {
    key: 'stat',
    label: 'Stat icons',
    rows: [
      { name: 'Attack', tatadexFile: 'attack.png', wikiImage: 'Attack.png', tataryPath: 'attr/atk.png' },
      { name: 'HP', tatadexFile: 'hp.png', wikiImage: 'HP.png', tataryPath: 'attr/hp.png' },
      { name: 'Defense', tatadexFile: 'defense.png', wikiImage: 'Defense.png', tataryPath: 'attr/def.png' },
    ],
  },
]

// The icon page is lighter than the tatari pages: it only needs the three
// manifests plus the wiki's reference vocabulary, and rows come from the fixed
// catalog above instead of the name join. Each catalog entry resolves to a per
// source ref when that cache actually carries the file, so a missing copy
// becomes a "no icon in this source" cell instead of a broken image.
async function loadIconsPage() {
  const loaded = {}
  const errors = []
  const tasks = {
    tatadex: fetchJSON('./tatadex-cache/manifest.json'),
    wiki: fetchJSON('./wiki-cache/manifest.json'),
    tatary: fetchJSON('./tatary-cache/manifest.json'),
  }
  for (const site of SITES) {
    try {
      loaded[site] = await tasks[site]
    } catch (error) {
      errors.push(`${SITE[site].label} (${site}-cache) — ${error.message}`)
      loaded[site] = { assets: [], scrapedAt: null, source: SITE[site].domain }
    }
  }

  const src = (site, manifest, extra = {}) => ({
    scrapedAt: manifest.scrapedAt,
    source: manifest.source || SITE[site].domain,
    ...extra,
  })

  const tatadex = src('tatadex', loaded.tatadex, { byFile: new Map(loaded.tatadex.assets.map((a) => [a.filename, a])) })
  const wiki = src('wiki', loaded.wiki, {
    byFile: new Map(loaded.wiki.assets.map((a) => [a.filename, a])),
  })
  const tatary = src('tatary', loaded.tatary, { byPath: new Map(loaded.tatary.assets.map((a) => [a.path, a])) })

  const tatadexRef = (filename) => {
    const asset = tatadex.byFile.get(filename)
    if (!asset) return null
    return { filename, localUrl: `tatadex-cache/img/${filename}`, remoteUrl: `${SITE.tatadex.domain}${asset.path}` }
  }
  const wikiIconRef = (filename) => {
    const asset = wiki.byFile.get(filename)
    return { filename, localUrl: `wiki-cache/img/${filename}`, remoteUrl: asset ? asset.url : `${SITE.wiki.domain}/images/${encodeFilename(filename)}` }
  }
  const tataryRef = (path) => {
    const asset = tatary.byPath.get(path)
    if (!asset) return null
    return { filename: path.split('/').pop(), localUrl: `tatary-cache/img/${path}`, remoteUrl: `${SITE.tatary.domain}/img/${path}` }
  }

  const refs = { tatadex: tatadexRef, wiki: wikiIconRef, tatary: tataryRef }
  const rows = []
  for (const cat of ICON_CATALOG) {
    for (const entry of cat.rows) {
      const id = `${cat.key}:${norm(entry.name)}`
      const row = {
        id,
        key: id,
        name: entry.name,
        category: cat.key,
        categoryLabel: cat.label,
        names: {},
        tatadex: null,
        wiki: null,
        tatary: null,
        details: { tatadex: null, wiki: null, tatary: null },
      }
      const want = {
        tatadex: entry.tatadexFile && `icons/${entry.tatadexFile}`,
        wiki: entry.wikiImage,
        tatary: entry.tataryPath,
      }
      for (const site of SITES) {
        const ref = want[site] ? refs[site](want[site]) : null
        if (!ref) continue
        row[site] = { kind: site, name: entry.name, key: norm(entry.name), iconRef: ref }
        row.names[site] = entry.name
        row.details[site] = iconDetail(site, cat.key, entry.name)
      }
      rows.push(row)
    }
  }
  return { rows, sources: { tatadex, wiki, tatary }, errors }
}

function iconDetail(site, category, name) {
  if (site === 'tatary') return { [category === 'role' ? 'career' : category]: name }
  return { [category === 'element' && site === 'wiki' ? 'type' : category]: name }
}

// ------------------------------------------------------------------ row joining

// One row = one evolution stage, presented across the three sites. Records are
// merged with a union-find over name evidence: identical keys, a record whose
// image filename stem equals another record's key (Flametail's Firefox.png is
// the Firefox art), and a small edit distance (Sizribb <-> Sizzribb). A record
// only ever claims one source slot per row, so every component yields exactly
// one row.
function buildRows({ tatadex, wiki, tatary }, { byFamily = false } = {}) {
  const records = [...tatadex.records, ...wiki.records, ...tatary.records]

  const byKey = new Map() // key -> [records]
  for (const rec of records) {
    if (!byKey.has(rec.key)) byKey.set(rec.key, [])
    byKey.get(rec.key).push(rec)
  }

  const parent = new Map()
  const find = (a) => {
    while (parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)))
      a = parent.get(a)
    }
    return a
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const rec of records) parent.set(rec, rec)

  // Same key: every source that spells the name the same way joins.
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    const anchor = group[0]
    for (const rec of group.slice(1)) union(anchor, rec)
  }

  // A spelling is "well attested" when more than one source writes it, which
  // also means it is a different creature than every other spelling in this
  // list (rockwu is a rock pet while rockong is its own pet on all three
  // sites). So stem and fuzzy joins only apply across disjoint source sets:
  // Flametail's Firefox.png reaches the firefox row (one source each side),
  // while the Rockwu/Rockong shared-art pair stays two rows.
  const keySources = new Map() // key -> Set<kind>
  for (const rec of records) {
    if (!keySources.has(rec.key)) keySources.set(rec.key, new Set())
    keySources.get(rec.key).add(rec.kind)
  }
  const disjointFrom = (recKey, otherKey) => {
    for (const kind of keySources.get(recKey)) {
      if (keySources.get(otherKey) && keySources.get(otherKey).has(kind)) return false
    }
    return true
  }

  // Image filename stem (source of truth shared by the sites' own assets):
  // Lullely's Lullelly.png reaches the lullelly row, Flametail's Firefox.png
  // reaches the firefox row.
  for (const rec of records) {
    const others = rec.joinKeys.map((stem) => byKey.get(stem)).filter(Boolean)
    for (const group of others) {
      for (const other of group) {
        if (other !== rec && disjointFrom(rec.key, other.key)) union(rec, other)
      }
    }
  }

  // Small edit distance between distinct keys (Sizribb <-> Sizzribb), same
  // disjoint-source rule so sparkrow/sparkdoe and friends never merge.
  const keys = [...byKey.keys()]
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i]
      const b = keys[j]
      if (Math.abs(a.length - b.length) > 2) continue
      if (levenshtein(a, b) > 2) continue
      if (!disjointFrom(a, b)) continue
      union(byKey.get(a)[0], byKey.get(b)[0])
    }
  }

  // Collapse components into rows, one slot per source. The row id is the most
  // represented key (the game's own spelling wins, e.g. Flametail over
  // Firefox); ties fall back in the same preference order used for names.
  const groups = new Map() // root record -> row
  for (const rec of records) {
    const root = find(rec)
    let row = groups.get(root)
    if (!row) {
      row = { id: null, names: {}, tatadex: null, wiki: null, tatary: null }
      groups.set(root, row)
    }
    if (!row[rec.kind]) row[rec.kind] = rec
    if (!row.names[rec.kind]) row.names[rec.kind] = rec.name
  }

  // The row id is the most common spelling inside the component; ties prefer
  // wiki > tatary > tatadex, matching the display-name order below.
  const ROW_ORDER = { wiki: 0, tatary: 1, tatadex: 2 }
  const keyCounts = new Map() // root record -> Map<key,count>
  for (const rec of records) {
    const root = find(rec)
    if (!keyCounts.has(root)) keyCounts.set(root, new Map())
    const m = keyCounts.get(root)
    m.set(rec.key, (m.get(rec.key) || 0) + 1)
  }
  for (const [root, row] of groups) {
    const m = keyCounts.get(root)
    let bestKey = null
    let bestCount = -1
    for (const [key, count] of m) {
      if (count > bestCount || (count === bestCount && bestKey && (ROW_ORDER[key] ?? 9) < (ROW_ORDER[bestKey] ?? 9))) {
        bestKey = key
        bestCount = count
      }
    }
    row.id = bestKey || row.name
  }

  const meta = (rec) => {
    if (!rec) return null
    if (rec.kind === 'tatadex') {
      return { pageUrl: rec.pageUrl, element: rec.element, role: rec.role, tier: rec.tier, rarity: rec.rarity, skill: rec.skillName }
    }
    if (rec.kind === 'wiki') {
      return {
        pageUrl: rec.pageUrl,
        type: rec.type,
        rarity: rec.rarity,
        role: rec.role,
        skill: rec.skillName,
        skillTypes: rec.skillTypes || [],
      }
    }
    return {
      name: rec.name,
      id: rec.id,
      stage: rec.stage,
      code: rec.code,
      element: ELEMENT_LABEL[rec.el],
      q: rec.q,
      position: POSITION_LABEL[rec.pos],
      career: CAREER_LABEL[rec.career],
    }
  }

  const rows = [...groups.values()].map((r) => ({
    ...r,
    name: r.names.wiki || r.names.tatary || r.names.tatadex || r.id,
    details: { tatadex: meta(r.tatadex), wiki: meta(r.wiki), tatary: meta(r.tatary) },
  }))

  if (!byFamily) {
    return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }

  // Family order: every row that shares a tatary pet id is one evolution line,
  // so its stages stay together instead of scattering by stage name. Lines are
  // listed by their base (lowest-stage) name - which is the family name the
  // Horde page uses - and the stages run oldest first inside each line. Rows
  // the game tables do not name (no tatary record) are one-offs, keyed by their
  // own id so they slot in beside the lines alphabetically.
  const families = new Map()
  for (const row of rows) {
    const key = row.tatary ? `id:${row.tatary.id}` : `row:${row.id}`
    let family = families.get(key)
    if (!family) {
      family = { label: row.name, baseStage: Infinity, rows: [] }
      families.set(key, family)
    }
    family.rows.push(row)
    if (row.tatary && row.tatary.stage < family.baseStage) {
      family.baseStage = row.tatary.stage
      family.label = row.name
    }
  }
  const stageOf = (row) => (row.tatary ? row.tatary.stage : 0)
  return [...families.values()]
    .sort((a, b) => a.label.localeCompare(b.label) || a.rows[0].id.localeCompare(b.rows[0].id))
    .flatMap((family) =>
      family.rows.sort((a, b) => stageOf(a) - stageOf(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    )
}

// Which tataris share one skill image, per site (the skills page points at it
// so duplicated icons are visible instead of surprising).
function skillSharing(rows) {
  const bySite = {}
  for (const site of SITES) {
    const byRef = new Map()
    for (const r of rows) {
      const ref = r[site] && r[site].skill
      if (!ref || !ref.filename) continue
      const key = ref.filename || ref.path
      if (!byRef.has(key)) byRef.set(key, [])
      const list = byRef.get(key)
      if (list[list.length - 1] !== r.name) list.push(r.name)
    }
    bySite[site] = byRef
  }
  return bySite
}

// ------------------------------------------------------------------ image blocks

const metaCache = new Map() // localUrl -> Promise<meta>
const shaOwner = new Map() // sha -> first block that claimed it

// The comparison grids can reach ~1200 cells; fetching every PNG at once blows
// past a tab's resource budget (visible in dev as ERR_INSUFFICIENT_RESOURCES).
// Route the byte downloads through a small concurrency queue instead.
const MAX_CONCURRENT_FETCHES = 8
let activeFetches = 0
const fetchQueue = []

function enqueueFetch(task) {
  return new Promise((resolve, reject) => {
    fetchQueue.push({ task, resolve, reject })
    pumpFetchQueue()
  })
}

function pumpFetchQueue() {
  while (activeFetches < MAX_CONCURRENT_FETCHES && fetchQueue.length) {
    const { task, resolve, reject } = fetchQueue.shift()
    activeFetches++
    task().then(resolve, reject).finally(() => {
      activeFetches--
      pumpFetchQueue()
    })
  }
}

async function fetchMeta(url) {
  return enqueueFetch(async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    const objUrl = URL.createObjectURL(new Blob([buf]))
    let width = 0
    let height = 0
    try {
      const bmp = await createImageBitmap(new Blob([buf]))
      width = bmp.width
      height = bmp.height
      bmp.close()
    } catch {
      /* undecodable or unsupported codec; dimensions stay unknown */
    }
    let sha = null
    if (globalThis.crypto && crypto.subtle) {
      const hash = await crypto.subtle.digest('SHA-256', buf)
      sha = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
    return { bytes: buf.byteLength, objUrl, width, height, sha }
  })
}

function metaFor(url) {
  let p = metaCache.get(url)
  if (!p) {
    p = fetchMeta(url)
    metaCache.set(url, p) // shared before it settles, so every block of the file waits once
    p.catch(() => {
      if (metaCache.get(url) === p) metaCache.delete(url) // a later scroll may retry
    })
  }
  return p
}

function loadBlock(block, attempt = 0) {
  if (block.state === 'loaded' || block.state === 'missing') return
  block.state = 'loading'
  block.promise = metaFor(block.ref.localUrl).then(
    (meta) => {
      block.state = 'loaded'
      block.meta = meta
      markDup(block)
      renderBlock(block)
    },
    () => {
      // ERR_INSUFFICIENT_RESOURCES and similar are transient; retry a couple of
      // times before giving up and marking the cell as not cached.
      if (attempt < 2) {
        block.state = null
        setTimeout(() => loadBlock(block, attempt + 1), 1200 * (attempt + 1))
      } else {
        block.state = 'missing'
        renderBlock(block)
      }
    },
  )
}

function markDup(block) {
  const sha = block.meta && block.meta.sha
  if (!sha) return
  const prev = shaOwner.get(sha)
  if (!prev) {
    shaOwner.set(sha, block)
    return
  }
  if (prev.ref.localUrl !== block.ref.localUrl) block.dupOf = prev
}

// ------------------------------------------------------------------ selection store

let selection = new Set()
const blockById = new Map()
let rowCount = 0

function toggleSelection(id, on) {
  if (on) selection.add(id)
  else selection.delete(id)
  localStorage.setItem(cfg.storageKey, JSON.stringify([...selection]))
  updateCounts()
  const box = blockById.get(id) && blockById.get(id).box
  if (box) box.classList.toggle('selected', on)
}

function updateCounts() {
  const countEl = $('#count')
  if (countEl) countEl.replaceChildren(el('b', { text: String(selection.size) }), el('span', { text: ` selected of ${rowCount} ${cfg.countNoun}` }))
}

// ------------------------------------------------------------------ block mounting

const extOf = (filename) => {
  const m = String(filename || '').match(/\.([a-z0-9]+)$/i)
  return (m && m[1].toLowerCase()) || 'bin'
}

function mountBlock(container, block) {
  const ref = block.ref
  const picked = selection.has(block.id)
  const box = el('div', { class: `blk${picked ? ' selected' : ''}` })
  block.box = box
  blockById.set(block.id, block)

  const checkbox = el('input', { type: 'checkbox', checked: picked, disabled: !ref.localUrl })
  checkbox.addEventListener('change', (ev) => toggleSelection(block.id, ev.target.checked))
  box.append(
    el('label', { class: 'pick' }, [
      checkbox,
      el('span', { class: `variant ${block.variant}`, text: block.variant }),
    ]),
    el('div', { class: 'thumb' }, [el('span', { class: 'spin', text: 'loading…' })]),
    el('div', { class: 'meta' }, [
      el('span', { class: 'dim', text: '—' }),
      el('span', { class: 'size', text: '—' }),
      el('span', { class: 'file', title: ref.localUrl ? `public/${ref.localUrl}` : 'no local copy cached', text: ref.filename || '?' }),
      el('a', { href: ref.remoteUrl, target: '_blank', rel: 'noopener noreferrer', text: 'open ↗' }),
    ]),
  )
  container.append(box)

  if (ref.localUrl) {
    const io = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        loadBlock(block)
      }
    }, { rootMargin: '350px' })
    // IntersectionObserver does not fire in hidden documents (background tabs,
    // some embedders); load the cells already in the viewport right away so the
    // comparison works there too, and keep lazy IO for everything below.
    const rect = box.getBoundingClientRect()
    const viewport = window.innerHeight || document.documentElement.clientHeight || 0
    if (rect.top <= viewport + 400 && rect.bottom >= -400) loadBlock(block)
    else io.observe(box)
  } else {
    loadBlockMissing(block)
  }
}

function loadBlockMissing(block) {
  block.state = 'missing'
  if (selection.has(block.id)) {
    selection.delete(block.id)
    localStorage.setItem(cfg.storageKey, JSON.stringify([...selection]))
    updateCounts()
  }
  renderBlock(block)
}

function renderBlock(block) {
  const box = block.box
  const thumb = box.querySelector('.thumb')
  if (block.state === 'missing') {
    box.classList.add('missing')
    thumb.replaceChildren(el('span', { class: 'ph', text: block.ref.filename ? 'not in local cache' : 'no file from this source' }))
    return
  }
  const meta = block.meta
  const img = el('img', { alt: `${block.row.name} ${block.variant} (${block.site})` })
  img.src = meta.objUrl
  thumb.replaceChildren(img)

  const dimText = meta.width && meta.height ? `${meta.width}×${meta.height}px` : 'size unknown'
  const sizeText = `${fmtBytes(meta.bytes)} · ${extOf(block.ref.filename)}`
  const sha = meta.sha ? `sha ${meta.sha.slice(0, 8)}` : 'sha n/a'
  const dup = block.dupOf

  box.querySelector('.meta').replaceChildren(
    el('span', { class: 'dim', text: dimText }),
    el('span', { class: 'size', text: sizeText }),
    el('span', { class: 'file', title: `public/${block.ref.localUrl}`, text: block.ref.filename || '?' }),
    el('a', { href: block.ref.remoteUrl, target: '_blank', rel: 'noopener noreferrer', text: 'open ↗' }),
    el('span', { class: 'sha', text: sha, title: meta.sha || 'SHA-256 unavailable (needs localhost/https)' }),
    // an empty array flattens to no children; `null` would stringify to a literal "null" text node
    dup ? dupTagEl(dup) : [],
  )
}

function dupTagEl(prev) {
  return el('span', {
    class: 'dup-tag',
    text: `≡ ${prev.row.name} · ${prev.site} · ${prev.variant}`,
    title: `Identical bytes to ${prev.row.name} (${SITE[prev.site].label} ${prev.variant}, ${prev.ref.localUrl || prev.ref.filename}). Same file — keep any one copy.`,
  })
}

// ------------------------------------------------------------------ block specs

function variantsFor(site, cfg) {
  if (cfg.kind === 'icons') return ['icon']
  if (cfg.kind === 'skills') return site === 'tatary' ? [] : ['skill']
  return site === 'tatary' ? ['normal', 'flash'] : ['normal', 'glitter']
}

function blockSpec(row, site, variant, cfg) {
  const rec = row[site]
  if (cfg.kind === 'icons') {
    if (!rec || !rec.iconRef) return null
    return sliceBlock(row, site, 'icon', rec.iconRef)
  }
  if (cfg.kind === 'skills') {
    if (site === 'tatary') return null
    if (!rec || !rec.skill) return null
    return sliceBlock(row, site, variant, rec.skill)
  }
  if (site === 'tatary') {
    if (!rec || !rec.icon) return null
    if (variant === 'normal') {
      return sliceBlock(row, site, variant, tataryRef(rec.icon))
    }
    if (!rec.flashAllowed) return null
    return sliceBlock(row, site, variant, tataryRef(rec.icon.replace(/\.png$/i, '_flash.png')))
  }
  const art = rec && rec.art && rec.art[variant === 'glitter' ? 'glitter' : 'normal']
  if (!art) return null
  return sliceBlock(row, site, variant, art)
}

function tataryRef(fn) {
  return {
    filename: fn,
    localUrl: `tatary-cache/img/pet/${fn}`,
    remoteUrl: `${SITE.tatary.domain}/img/pet/${fn}`,
  }
}

function sliceBlock(row, site, variant, ref) {
  return { id: `${row.id}::${site}::${variant}`, row, site, variant, ref }
}

// ------------------------------------------------------------------ cell content

function srcMetaLine(row, site, cfg) {
  const rec = row[site]
  if (!rec) return el('div', { class: 'srcmeta', text: cfg.kind === 'icons' ? 'no icon in this source' : 'no entry in this source' })
  if (cfg.kind === 'icons') {
    const d = row.details && row.details[site]
    const parts = []
    if (d) {
      const element = d.element || d.type
      if (element) parts.push(el('span', { class: 'tag', style: tagStyle(ELEMENT_COLOR[element]), text: element }))
      if (d.role || d.career) parts.push(el('span', { text: `role ${d.role || d.career}` }))
      if (d.stat) parts.push(el('span', { text: `stat ${d.stat}` }))
    }
    return el('div', { class: 'srcmeta' }, parts)
  }
  const d = row.details && row.details[site]
  if (!d) {
    console.warn('srcMetaLine: no details for', site, row.key ?? row.id, row.names, Boolean(row.tatadex), Boolean(row.wiki), Boolean(row.tatary))
    return el('div', { class: 'srcmeta', text: '—' })
  }
  const parts = []
  if (site === 'tatary') {
    const d = row.details.tatary
    parts.push(el('span', { text: `#${d.id} · stage ${d.stage}` }))
    if (d.element) parts.push(el('span', { text: d.element }))
    if (d.position) parts.push(el('span', { text: d.position }))
    if (d.career) parts.push(el('span', { text: d.career }))
  } else if (site === 'tatadex') {
    const d = row.details.tatadex
    if (d.element) parts.push(el('span', { class: 'tag', style: tagStyle(ELEMENT_COLOR[d.element]), text: d.element }))
    if (d.role) parts.push(el('span', { text: `role ${d.role}` }))
    if (d.tier) parts.push(el('span', { text: `tier ${d.tier}` }))
    if (d.rarity) parts.push(el('span', { class: 'tag', style: tagStyle(RARITY_COLOR[d.rarity]), text: d.rarity }))
  } else {
    const d = row.details.wiki
    if (d.type) parts.push(el('span', { class: 'tag', style: tagStyle(ELEMENT_COLOR[d.type]), text: d.type }))
    if (d.rarity) parts.push(el('span', { class: 'tag', style: tagStyle(RARITY_COLOR[d.rarity]), text: d.rarity }))
    if (d.role) parts.push(el('span', { text: `role ${d.role}` }))
  }

  const cell = el('div', { class: 'srcmeta' }, parts)
  const skill = skillMetaEl(row, site, cfg)
  if (skill) cell.append(skill)
  return cell
}

function tagStyle(color) {
  const hex = color || '#5a6478'
  return `background:${hex}22;color:${hex}`
}

function skillMetaEl(row, site, cfg) {
  if (cfg.kind !== 'skills') return null
  const rec = row[site]
  if (!rec) return null
  if (site === 'tatary') return el('div', { class: 'srcmeta', text: 'no skill images in tatary-cache' })
  const name = rec.skillName
  if (!name) return null
  const kids = [el('span', { class: 'skill', text: `skill: ${name}`, title: rec.skillDesc || '' })]
  if (site === 'wiki' && rec.skillTypes && rec.skillTypes.length) {
    kids.push(el('span', { text: `[${rec.skillTypes.join(', ')}]` }))
  }
  const sharing = rec.skill ? sharingBy[site].get(blockKey(rec.skill)) || [] : []
  if (sharing.length > 1) {
    kids.push(el('span', { class: 'shared-note', text: `icon shared by ${sharing.length} tataris`, title: sharing.join(', ') }))
  }
  return el('div', { class: 'srcmeta' }, kids)
}

const blockKey = (ref) => ref.filename || ref.path

function nameCellContent(row) {
  const pageUrl = (row.wiki && row.wiki.pageUrl) || (row.tatadex && row.tatadex.pageUrl)
  const chips = SITES.map((site) =>
    el('span', { class: `chip${row[site] ? '' : ' missing'}`, 'data-site': site, text: `${SITE[site].label}: ${row.names[site] || '—'}` }),
  )
  const kids = [
    el('div', { class: 'name-top' }, [
      el('span', { class: 'nm', text: row.name }),
      pageUrl
        ? el('a', { class: 'open', href: pageUrl, target: '_blank', rel: 'noopener noreferrer', text: 'open ↗', title: pageUrl })
        : null,
    ]),
    el('div', { class: 'names' }, chips),
  ]
  if (cfg.kind === 'skills' && row.wiki && row.wiki.skillName) {
    kids.push(el('div', { class: 'idline', text: `wiki skill: ${row.wiki.skillName}`, title: row.wiki.skillDesc || '' }))
  }
  if (cfg.kind === 'icons' && row.categoryLabel) {
    kids.push(el('div', { class: 'idline', text: row.categoryLabel }))
  }
  return kids
}

// ------------------------------------------------------------------ table build

function buildHead(grid) {
  const thead = el('thead')
  const headRow = el('tr')
  headRow.append(el('th', { class: 'rowhead', scope: 'col', text: cfg.rowHead || 'Tatari' }))
  for (const site of SITES) {
    const s = SITE[site]
    const scraped = sources[site] && sources[site].scrapedAt
    headRow.append(
      el('th', { class: `th-${site}`, scope: 'col' }, [
        el('span', { class: 'site', style: `color:${s.color}`, text: s.label }),
        el('span', { class: 'domain', text: s.domain }),
        el('span', { class: 'scraped', text: scraped ? `scraped ${fmtDate(scraped)}` : 'no data loaded' }),
        el('span', { class: 'variant-note', text: cfg.cellTitle }),
      ]),
    )
  }
  thead.append(headRow)
  grid.append(thead)
}

function buildRow(row, byRow) {
  const tr = el('tr', { class: 'data-row' })
  tr.append(el('td', { class: 'name' }, nameCellContent(row)))
  for (const site of SITES) {
    const td = el('td', { class: `cell-${site}` })
    td.append(srcMetaLine(row, site, cfg))
    let hasBlock = false
    for (const variant of variantsFor(site, cfg)) {
      const block = blockSpec(row, site, variant, cfg)
      if (!block) continue
      mountBlock(td, block)
      hasBlock = true
    }
    if (!hasBlock && cfg.kind === 'skills' && site !== 'tatary') {
      td.append(el('div', { class: 'srcmeta', text: 'no skill icon in this cache' }))
    }
    tr.append(td)
  }
  byRow.set(row.id, tr)
  return tr
}

function buildTable(rows) {
  const byRow = new Map()
  if (cfg.kind === 'icons') {
    // One small table per category (element / role / stat) instead of one big
    // joined grid — the icon rows come straight from the catalog.
    const root = $('#icon-sections')
    root.replaceChildren()
    const groups = new Map()
    for (const row of rows) {
      if (!groups.has(row.category)) groups.set(row.category, [])
      groups.get(row.category).push(row)
    }
    for (const [category, catRows] of groups) {
      const catDef = ICON_CATALOG.find((c) => c.key === category)
      const grid = el('table')
      buildHead(grid)
      const tbody = el('tbody')
      grid.append(tbody)
      for (const row of catRows) tbody.append(buildRow(row, byRow))
      root.append(
        el('section', { class: 'icon-cat' }, [
          el('h2', {}, [catDef ? catDef.label : category, el('span', { class: 'cat-count', text: ` ${catRows.length} icons` })]),
          el('div', { class: 'table-wrap' }, [grid]),
        ]),
      )
    }
    return byRow
  }

  const grid = $('#grid')
  buildHead(grid)

  const tbody = el('tbody')
  grid.append(tbody)
  for (const row of rows) tbody.append(buildRow(row, byRow))
  grid.append(tbody)
  return byRow
}

// ------------------------------------------------------------------ filtering

function applyFilter(rows, byRow) {
  const q = norm($('#q').value)
  const cov = $('#f-coverage').value
  let shown = 0
  for (const row of rows) {
    let match = true
    if (q) {
      const hay = [row.name, row.id, row.categoryLabel, row.names.tatadex, row.names.wiki, row.names.tatary, row.wiki && row.wiki.skillName, row.tatadex && row.tatadex.skillName]
        .filter(Boolean)
        .map(norm)
        .join(' ')
      match = hay.includes(q)
    }
    if (match && cov === 'all') match = Boolean(row.tatadex && row.wiki && row.tatary)
    if (match && cov === 'gap') match = !(row.tatadex && row.wiki && row.tatary)
    byRow.get(row.id).classList.toggle('hidden', !match)
    if (match) shown++
  }
  const status = $('#status')
  if (status) status.textContent = `${shown} of ${rows.length} ${cfg.countNoun}`
}

// ------------------------------------------------------------------ export

async function collectItems() {
  const out = []
  for (const id of selection) {
    const block = blockById.get(id)
    if (!block) continue
    if (block.promise) await block.promise.catch(() => {})
    const d = block.row.details
    out.push({
      tatari: block.row.name,
      rowKey: block.row.id,
      names: { ...block.row.names },
      source: block.site,
      sourceUrl: SITE[block.site].domain,
      variant: block.variant,
      filename: block.ref.filename,
      remoteUrl: block.ref.remoteUrl,
      localPath: block.ref.localUrl ? `public/${block.ref.localUrl}` : null,
      format: extOf(block.ref.filename),
      width: block.meta ? block.meta.width : null,
      height: block.meta ? block.meta.height : null,
      bytes: block.meta ? block.meta.bytes : null,
      sha256: block.meta ? block.meta.sha : null,
      identicalTo: block.dupOf
        ? {
            tatari: block.dupOf.row.name,
            source: block.dupOf.site,
            variant: block.dupOf.variant,
            localPath: block.dupOf.ref.localUrl ? `public/${block.dupOf.ref.localUrl}` : null,
          }
        : null,
      details: {
        tatadex: d.tatadex,
        wiki: d.wiki,
        tatary: d.tatary,
      },
    })
  }
  return out
}

async function exportPayload() {
  const items = await collectItems()
  return {
    page: cfg.tag,
    exportedAt: new Date().toISOString(),
    sources: Object.fromEntries(SITES.map((site) => [site, { url: SITE[site].domain, scrapedAt: (sources[site] && sources[site].scrapedAt) || null }])),
    count: items.length,
    items,
  }
}

async function saveJson(payload, suggestedName) {
  const text = JSON.stringify(payload, null, 2)
  const picker = globalThis.showSaveFilePicker
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName,
        types: [{ description: 'Selection JSON', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      return
    } catch (error) {
      if (error && error.name === 'AbortError') return
      /* fall through to a plain download */
    }
  }
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = suggestedName
  a.click()
  URL.revokeObjectURL(a.href)
}

function showStatus(text) {
  const status = $('#status')
  if (status) status.textContent = text
}

function showCopyDialog(payload) {
  const dlg = el('dialog', {}, [
    el('div', { class: 'modal' }, [
      el('h3', { text: `Selection JSON (${payload.count} items)` }),
      el('pre', { text: JSON.stringify(payload, null, 2) }),
      el('div', { class: 'actions' }, [
        el('button', {
          text: 'Copy to clipboard',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
              showStatus('Copied to clipboard.')
            } catch {
              showStatus('Clipboard unavailable — select the text manually.')
            }
          },
        }),
        el('button', { text: 'Close', onclick: () => dlg.close() }),
      ]),
    ]),
  ])
  document.body.append(dlg)
  dlg.showModal()
}

// ------------------------------------------------------------------ boot

let cfg
let sources = { tatadex: null, wiki: null, tatary: null }
let sharingBy = { tatadex: new Map(), wiki: new Map(), tatary: new Map() }

function wireToolbar(rows, byRow) {
  $('#q').addEventListener('input', () => applyFilter(rows, byRow))
  $('#f-coverage').addEventListener('change', () => applyFilter(rows, byRow))
  $('#clear').addEventListener('click', () => {
    selection.clear()
    localStorage.setItem(cfg.storageKey, '[]')
    for (const block of blockById.values()) if (block.box) block.box.classList.remove('selected')
    updateCounts()
  })
  $('#export').addEventListener('click', async () => {
    if (!selection.size) {
      showStatus('Nothing selected yet — tick the boxes next to the images you want to keep.')
      return
    }
    showStatus('Collecting selection…')
    const payload = await exportPayload()
    await saveJson(payload, cfg.exportName)
    showStatus(`Saved ${payload.count} selected image${payload.count === 1 ? '' : 's'} to ${cfg.exportName}.`)
  })
  $('#copy').addEventListener('click', async () => {
    if (!selection.size) {
      showStatus('Nothing selected yet.')
      return
    }
    showCopyDialog(await exportPayload())
  })
}

function showFatal() {
  const root = $('#icon-sections') || $('#grid')
  root.replaceChildren(
    el('div', { class: 'err' }, [
      el('h2', { text: 'Could not read the scraped data' }),
      el('p', { text: 'These pages fetch the caches under public/ (tatadex-cache, wiki-cache, tatary-cache), which a browser will not read straight off disk.' }),
      el('p', {}, [
        'Serve the repo over HTTP first: ',
        el('code', { text: 'npm run dev' }),
        ' — then open ',
        el('code', { text: '/compare-tatari.html' }),
        ', ',
        el('code', { text: '/compare-tatari-skills.html' }),
        ' or ',
        el('code', { text: '/compare-tatari-icons.html' }),
        '. A plain static server at the repo root works too (', el('code', { text: 'npx serve .' }), ').',
      ]),
      el('p', { text: 'If the files are missing, run the scrapers first: npm run scrape_all.' }),
    ]),
  )
}

async function boot() {
  const page = document.body.dataset.page
  cfg = PAGES[page]
  if (!cfg) {
    showFatal()
    return
  }
  document.title = `Compare ${cfg.title} — three sources`

  try {
    selection = new Set(JSON.parse(localStorage.getItem(cfg.storageKey) || '[]'))
  } catch {
    selection = new Set()
  }

  if (cfg.kind === 'icons') {
    const icons = await loadIconsPage()
    sources = icons.sources
    const errors = icons.errors
    if (errors.length) {
      const banner = $('#banner')
      banner.append(
        el('div', { class: 'banner-inner' }, [
          el('b', { text: 'Some sources failed to load. ' }),
          el('span', { text: `${errors.join('; ')}. Serve the repo over HTTP (npm run dev) and make sure the scrapers ran.` }),
        ]),
      )
    }
    rowCount = icons.rows.length
    if (!rowCount) {
      showFatal()
      return
    }
    sharingBy = { tatadex: new Map(), wiki: new Map(), tatary: new Map() }
    const byRow = buildTable(icons.rows)
    applyFilter(icons.rows, byRow)
    wireToolbar(icons.rows, byRow)
    updateCounts()
    return
  }

  const { loaded, errors } = await loadSources(cfg)
  sources = loaded

  if (errors.length) {
    const banner = $('#banner')
    banner.append(
      el('div', { class: 'banner-inner' }, [
        el('b', { text: 'Some sources failed to load. ' }),
        el('span', { text: `${errors.join('; ')}. Serve the repo over HTTP (npm run dev) and make sure the scrapers ran.` }),
      ]),
    )
  }
  const anyData = SITES.some((site) => sources[site] && sources[site].records.length > 0)
  if (!anyData) {
    showFatal()
    return
  }

  const rows = buildRows({ tatadex: sources.tatadex, wiki: sources.wiki, tatary: sources.tatary }, { byFamily: cfg.sortByFamily })
  rowCount = rows.length
  sharingBy = skillSharing(rows)

  const byRow = buildTable(rows)
  applyFilter(rows, byRow)
  wireToolbar(rows, byRow)

  updateCounts()
}

void boot()