// Parsers for tatadex.org: the /tatari/ catalog index and the detail page
// behind each of its cards.
//
// Pure functions of the page HTML - no network, no filesystem - built on the
// string helpers in scraper/lib/html.js and exercised in
// scraper/test/tatadex.test.js. The site is a static Astro build (robots.txt
// disallows /api/, so there is no JSON endpoint to prefer): everything the
// scraper stores is in the server-rendered HTML.
//
// Chinese is resolved at extraction time through scraper/lib/zh_en.js: the
// English becomes the field value, the site's original is kept beside it as
// `<field>Zh`, and anything the glossary could not answer in full lands in the
// `unresolved` list so the scraper reports it in manifest.json instead of
// publishing half-English text.
//
// Four containers are deliberately out of scope, per the project's scoping of
// this scraper: the Animations gallery, the Wild Tatari Dex (whose eyebrow
// reads "Lineage connection"), the Zobo Horde advances, and the skill video
// stage. parseDetail does not read them and pageAssets does not sweep them, so
// neither their data nor their images are ever stored.

import {
  blockByHeading, blocksByClass, deepBlocks, firstBlockByAttr,
  firstBlockByClass, findBlocks, hasClass, headingText, hrefOf, innerHtml,
  labelValuePairs, openingTags, stripTags, tagAttr, tagWithAttr, textByAttr,
} from './html.js'
import { gloss, hasCJK } from './zh_en.js'

const IMAGE_PATH_RE = /\.(?:png|jpe?g|webp|gif|svg|avif)(?:\?.*)?$/i

// Animation frames and thumbs, wherever the page references them - see
// pageAssets for why the directory is excluded globally rather than per panel.
const ANIMATION_MEDIA_RE = /^\/media\/tatari\/animations\//

/**
 * Site-relative path for an asset URL. The pages mix relative
 * (`/assets/tatari/sparkrow.png`) and absolute (`https://tatadex.org/media/...`)
 * references to the same files, and the absent Glitter form renders `src=""`;
 * other hosts and unparseable values are not ours to cache.
 */
export function sitePath(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('/')) return raw
  try {
    const url = new URL(raw)
    const ours = url.host === 'tatadex.org' || url.host.endsWith('.tatadex.org')
    return ours ? `${url.pathname}${url.search}` : null
  } catch {
    return null
  }
}

/** Basename of a site path, query string dropped: `/a/b/x.png?v=1` -> `x.png`. */
function baseNameOf(sitePath) {
  const clean = sitePath.split('?')[0]
  return clean.slice(clean.lastIndexOf('/') + 1)
}

/** How many directory segments sit before the file: `/a/b/x.png` -> 2. */
const depthOf = (sitePath) => sitePath.split('/').length - 2

/**
 * Which of the six `img/` directories a site path's file belongs in:
 *
 * - `skills` - skill icons, named (`/assets/tatari/skills/`) or UUID
 *   (`/media/tatari/skillIcon/`); every one is read as `skill.icon`
 * - `tatari-glitter` - the Glitter form of a card's art, named
 *   (`<name>-glitter.png`) or UUID (`/media/tatari/glitterImage/`); every one
 *   is read as `art.glitter`
 * - `tatari` - the plain card art, named or UUID (`/media/tatari/image/`);
 *   read as `art`/`art.normal`
 * - `foods`, `events` - the content thumbnails the pages link with
 * - `icons` - the catch-all: page chrome such as element/role/stat chips,
 *   Badge Dojo badges, the wordmark, the sponsored top-up aside's watermarked
 *   `wm-v1` thumbnails (`/media/tatari/image/wm-v1/` - no data field names
 *   them), plus anything the rules do not know, which lands beside the other
 *   chrome rather than being dropped
 */
export function imageCategory(sitePath) {
  if (sitePath.startsWith('/assets/tatari/skills/') || sitePath.startsWith('/media/tatari/skillIcon/')) return 'skills'
  if (sitePath.startsWith('/media/tatari/image/wm-v1/')) return 'icons'
  if (/^\/assets\/tatari\/[^/]+-glitter\./.test(sitePath) || sitePath.startsWith('/media/tatari/glitterImage/')) return 'tatari-glitter'
  if (/^\/assets\/tatari\/[^/]+\./.test(sitePath) || sitePath.startsWith('/media/tatari/image/')) return 'tatari'
  if (sitePath.startsWith('/assets/foods/')) return 'foods'
  if (sitePath.startsWith('/assets/events/')) return 'events'
  return 'icons'
}

/** `sitePaths` bucketed by category, each bucket sorted for stable naming. */
function groupByCategory(sitePaths) {
  const groups = new Map()
  for (const sitePath of [...sitePaths].sort()) {
    const category = imageCategory(sitePath)
    const paths = groups.get(category)
    if (paths) paths.push(sitePath)
    else groups.set(category, [sitePath])
  }
  return groups
}

/**
 * Preferred file-name stem for every image the data files name, as a Map from
 * site path to stem: card art and skill icons take the tatari's slug, Glitter
 * art the slug plus `-glitter`. Where one file serves several tataris (an
 * evolution line shares its base form's art and skill icon) the first claim
 * wins - records are read in catalog order, so every run picks the same one,
 * and it is the name upstream's own files carry. Paths no data field names
 * (page furniture such as the sponsored aside's `wm-v1` thumbs) are absent
 * and fall back to their own basename in imageNames.
 */
export function imageStems(roster, tataris) {
  const stems = new Map()
  const claim = (sitePath, stem) => {
    if (sitePath && !stems.has(sitePath)) stems.set(sitePath, stem)
  }
  for (const card of roster.tataris ?? []) claim(card.art, card.slug)
  for (const record of Object.values(tataris)) {
    claim(record.art?.normal, record.slug)
    claim(record.art?.glitter, `${record.slug}-glitter`)
    claim(record.skill?.icon, record.slug)
    for (const stage of record.evolutionLine ?? []) claim(stage.art, stage.slug)
  }
  return stems
}

/**
 * File names unique within one category - the second half of the rules
 * documented on imageNames, computed per bucket. Each path's target is the
 * data-derived stem from imageStems with the remote extension, or its own
 * basename when the data names no file.
 */
function categoryNames(paths, stems) {
  const targetOf = new Map()
  const groups = new Map()
  for (const sitePath of paths) {
    const base = baseNameOf(sitePath)
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot) : ''
    const stem = stems.get(sitePath) ?? (dot > 0 ? base.slice(0, dot) : base)
    const target = `${stem}${ext}`
    targetOf.set(sitePath, target)
    const key = target.toLowerCase()
    const group = groups.get(key)
    if (group) group.push(sitePath)
    else groups.set(key, [sitePath])
  }

  const names = new Map()
  const used = new Set()
  const collisions = []

  // A target used once claims it now, so the disambiguation below cannot
  // walk into it from a colliding group later.
  for (const [key, group] of groups) {
    if (group.length === 1) {
      names.set(group[0], targetOf.get(group[0]))
      used.add(key)
    } else {
      collisions.push(group)
    }
  }

  for (const group of collisions) {
    // Shallowest first, then lexicographic: ties resolve the same way on
    // every machine and every run.
    const ranked = [...group].sort((a, b) => depthOf(a) - depthOf(b) || (a < b ? -1 : 1))
    ranked.forEach((sitePath, index) => {
      const target = targetOf.get(sitePath)
      const dirs = sitePath.split('/').slice(1, -1)
      const preferred = index === 0
        ? [target]
        : dirs.map((_, take) => `${dirs.slice(-(take + 1)).join('-')}-${target}`)
      let name = preferred.find((candidate) => !used.has(candidate.toLowerCase()))
      if (name === undefined) {
        // Every candidate is taken - several files in one directory sharing
        // a stem: number the tail.
        const dot = target.lastIndexOf('.')
        const stem = dot > 0 ? target.slice(0, dot) : target
        const ext = dot > 0 ? target.slice(dot) : ''
        let counter = 2
        name = `${stem}-${counter}${ext}`
        while (used.has(name.toLowerCase())) {
          counter += 1
          name = `${stem}-${counter}${ext}`
        }
      }
      names.set(sitePath, name)
      used.add(name.toLowerCase())
    })
  }
  return names
}

/**
 * File name for every site path in `sitePaths`, relative to `img/`:
 * `<category>/<file>` (see imageCategory for the six categories).
 *
 * Each category is named independently, so the card art and its skill icon
 * share `sparkrow.png` in different directories. A file's stem is
 * `stems.get(sitePath)` - the data-derived `<tatari>` / `<tatari>-glitter`
 * names from imageStems, which turn the media library's UUID uploads into the
 * same names as the `/assets/` files - or its own basename when the data
 * names no file; the remote extension always stays. Within one category a
 * target used once keeps it verbatim; on a collision the shallowest path
 * keeps it and the rest grow the nearest directory segment as a prefix until
 * the name is free - checked case-insensitively, since a Windows checkout
 * cannot hold two files whose names differ only in case. The mapping depends
 * only on the set of paths and `stems`, both derived from the scrape's own
 * data, so a re-run - or the migration of an existing cache - derives the
 * same names.
 */
export function imageNames(sitePaths, stems = new Map()) {
  const names = new Map()
  for (const [category, paths] of groupByCategory(sitePaths)) {
    for (const [sitePath, name] of categoryNames(paths, stems)) {
      names.set(sitePath, `${category}/${name}`)
    }
  }
  return names
}

/**
 * Every image a page references outside the excluded panels, as sorted site
 * paths: `src` on any tag. Scripts, stylesheets and external hosts fall out
 * through the extension and sitePath filters.
 *
 * Four panels are cut before the sweep because their content is out of scope:
 * the Animations gallery (whose frames also live only in `data-animation-src`,
 * never swept either), the Wild Tatari Dex (eyebrow: Lineage connection), the
 * Zobo Horde advances (eyebrow: Zobo Horde), and the skill video stage -
 * whose `<video>` is filled by the page's own JS and carries no image URLs
 * today, but whose container is cut all the same so a poster image added there
 * later cannot slip through. parseDetail skips the same data panels, so
 * nothing references what is left undownloaded.
 *
 * On top of the panel cuts, no path under ANIMATION_MEDIA_RE is ever kept:
 * the site decorates a sponsored top-up card with the page's own idle thumb
 * from that directory, outside the gallery.
 */
export function pageAssets(html) {
  const source = String(html)
  let sweep = source
  for (const panel of excludedPanels(source)) sweep = sweep.replace(panel, '')
  const found = new Set()
  for (const match of sweep.matchAll(/\ssrc="([^"]*)"/g)) {
    const assetPath = sitePath(match[1])
    if (assetPath && IMAGE_PATH_RE.test(assetPath) && !ANIMATION_MEDIA_RE.test(assetPath)) {
      found.add(assetPath)
    }
  }
  return [...found].sort()
}

/** The out-of-scope `<section>` blocks of a detail page - all absent on the index. */
function excludedPanels(source) {
  return [
    firstBlockByAttr(source, 'section', 'data-tatari-animations'),
    firstBlockByAttr(source, 'section', 'data-wild-related'),
    firstBlockByAttr(source, 'section', 'data-horde-skill-panel'),
    firstBlockByClass(source, 'section', 'skill-video-stage'),
  ].filter((panel) => panel !== null)
}

/** `src` of the first `<img>` in a fragment - or of the one carrying `marker` - as a site path. */
function firstImage(fragment, marker = null) {
  const source = String(fragment ?? '')
  const tagHtml = marker === null ? openingTags(source, 'img')[0] : tagWithAttr(source, 'img', marker)
  return sitePath(tagAttr(tagHtml ?? '', 'img', 'src'))
}

/** Text of the first `tag` inside a fragment, or null. */
function firstText(fragment, tag) {
  const block = findBlocks(String(fragment ?? ''), tag)[0]
  return block ? stripTags(block.html) : null
}

const tierNumber = (value) => {
  const digits = String(value ?? '').match(/(\d+)/)
  return digits ? Number(digits[1]) : null
}

/** `/assets/roles/dps.png` -> `dps`; `/assets/roles/tank.webp` -> `tank`. */
const roleCode = (iconPath) => String(iconPath ?? '').split('/').pop().replace(/\.[a-z0-9]+$/i, '') || null

/**
 * Gloss `raw` into `target[key]` for a localizer built by makeLocalizer: the
 * key is always written (null when the site omits the value), the English
 * replaces a fully-glossed Chinese value, the original is kept as `<key>Zh`,
 * and a partial gloss writes null plus an `unresolved` entry. `path` labels
 * that entry for the manifest report.
 */
function makeLocalizer(unresolved) {
  return (target, key, raw, path = key) => {
    target[key] = raw || null
    const value = target[key]
    if (value === null || !hasCJK(value)) return
    const { english, residual } = gloss(value)
    target[`${key}Zh`] = value
    if (residual.length === 0) {
      target[key] = english
      return
    }
    target[key] = null
    unresolved.push({ field: path, zh: value, gloss: english, residual })
  }
}

function localizePairs(pairs, path, put) {
  return pairs.map((pair, index) => {
    const entry = {}
    put(entry, 'label', pair.label, `${path}[${index}].label`)
    put(entry, 'value', pair.value, `${path}[${index}].value`)
    return entry
  })
}

function localizeEffects(effects, path, put) {
  return effects.map((effect, index) => {
    const entry = {}
    put(entry, 'name', effect.name, `${path}[${index}].name`)
    put(entry, 'description', effect.description, `${path}[${index}].description`)
    entry.parameters = localizePairs(effect.parameters, `${path}[${index}].parameters`, put)
    return entry
  })
}

// --- index ----------------------------------------------------------------

/**
 * The /tatari/ catalog: `reportedCount` is what the page's own counter claims,
 * `cards` is what its markup actually contains - the two are worth comparing
 * because the site's count is server-rendered from the same list, but a template
 * change would show up here first.
 */
export function parseIndex(html) {
  const source = String(html)
  const reportedText = textByAttr(source, 'span', 'data-result-count')
  const reportedCount = reportedText === null ? null : Number(reportedText)
  return {
    reportedCount: Number.isFinite(reportedCount) ? reportedCount : null,
    verification: parseVerification(source),
    cards: blocksByClass(source, 'article', 'tatari-card').map((cardHtml, order) => parseCard(cardHtml, order)),
  }
}

/** The `aside.data-verification` provenance block: Version / Last reviewed / Source. */
function parseVerification(source) {
  const aside = firstBlockByClass(source, 'aside', 'data-verification')
  if (aside === null) return {}
  const verification = {}
  for (const block of deepBlocks(aside, 'div')) {
    const term = findBlocks(block, 'dt')[0]
    const detail = findBlocks(block, 'dd')[0]
    if (!term || !detail) continue
    const key = stripTags(term.html)
    if (!key) continue
    verification[key] = stripTags(detail.html)
    const href = hrefOf(detail.html)
    if (href) verification[`${key} link`] = href
  }
  return verification
}

function parseCard(cardHtml, order) {
  const chips = parseChips(cardHtml)
  const stageBlock = blocksByClass(cardHtml, 'span', 'stage')[0] ?? null
  return {
    order,
    slug: tagAttr(cardHtml, 'article', 'data-slug'),
    href: hrefOf(cardHtml),
    name: textByAttr(cardHtml, 'strong', 'data-card-name'),
    subtitle: textByAttr(cardHtml, 'small', 'data-card-subtitle'),
    art: firstImage(cardHtml),
    element: tagAttr(cardHtml, 'article', 'data-element'),
    elementLabel: chips.elementLabel,
    elementIcon: chips.elementIcon,
    role: tagAttr(cardHtml, 'article', 'data-role'),
    roleLabel: chips.roleLabel,
    roleIcon: chips.roleIcon,
    tier: tierNumber(tagAttr(cardHtml, 'article', 'data-stage')),
    tierLabel: stageBlock === null ? null : stripTags(stageBlock),
    rarity: chips.rarity,
  }
}

/**
 * The chip row shared by index cards and the detail header: element, role,
 * tier and rarity. The element and role codes come from their icon paths (the
 * header chips carry no data attributes, the cards carry their own - parseCard
 * prefers those).
 */
function parseChips(fragment) {
  const chips = {
    element: null, elementLabel: null, elementIcon: null,
    role: null, roleLabel: null, roleIcon: null,
    tierLabel: null, rarity: null,
  }
  for (const chip of blocksByClass(fragment, 'span', 'chip')) {
    const classes = tagAttr(chip, 'span', 'class') ?? ''
    const element = classes.match(/\belement-([a-z0-9-]+)\b/)?.[1]
    if (element) {
      chips.element = element
      chips.elementLabel = stripTags(chip)
      chips.elementIcon = firstImage(chip)
      continue
    }
    if (/\bchip-role\b/.test(classes)) {
      chips.roleLabel = stripTags(chip)
      chips.roleIcon = firstImage(chip)
      chips.role = roleCode(chips.roleIcon)
      continue
    }
    if (/\bchip-stage\b/.test(classes)) {
      chips.tierLabel = stripTags(chip)
      continue
    }
    if (/\bchip-rarity\b/.test(classes)) chips.rarity = stripTags(chip)
  }
  return chips
}

// --- skill / horde parameter sections -------------------------------------

/**
 * The parameter structure shared by the base skill panel and each horde
 * advance. Effect sections (`<h3>` + optional note) sit *beside* the
 * `<details class="skill-parameters">` block while the parameters live
 * *inside* it: the first inner section has no heading (the skill's base
 * parameters) and the rest repeat the effect headings as per-effect
 * parameter lists. Returns raw text - callers gloss it.
 */
function parseSections(fragment) {
  const interior = innerHtml(fragment)
  const details = firstBlockByClass(fragment, 'details', 'skill-parameters')
  const detailsStart = details === null ? -1 : interior.indexOf(details)
  const before = detailsStart === -1 ? interior : interior.slice(0, detailsStart)
  const inside = details === null ? [] : blocksByClass(details, 'section', 'skill-section')

  const effects = []
  for (const section of blocksByClass(before, 'section', 'skill-section')) {
    const name = headingText(section, 3)
    if (name === null) continue
    effects.push({ name, description: firstText(section, 'p'), parameters: [] })
  }

  let base = []
  for (const section of inside) {
    const name = headingText(section, 3)
    const parameters = labelValuePairs(section)
    if (name === null) {
      base = parameters
      continue
    }
    // Matched on glossed text so a heading the site renders in English in one
    // place and Chinese in the other still joins up.
    const target = effects.find((effect) => gloss(effect.name).english === gloss(name).english)
    if (target) {
      if (target.description === null) target.description = firstText(section, 'p')
      target.parameters = parameters
    } else {
      effects.push({ name, description: firstText(section, 'p'), parameters })
    }
  }
  return { base, effects }
}

// --- detail ----------------------------------------------------------------

/**
 * One /tatari/<slug>/ page. Returns `{ record, unresolved }`:
 * `record` mirrors the page's panels in document order, `unresolved` collects
 * every Chinese string the glossary answered only partially (see
 * makeLocalizer) for the scraper's manifest report.
 *
 * The Animations gallery, the Wild Tatari Dex (eyebrow: "Lineage connection")
 * and the Zobo Horde advances panels are deliberately not read, and the skill
 * video stage carries no data - pageAssets skips those same containers so
 * their images are not downloaded either.
 *
 * `options.slug` backfills the record's identity when the page-level
 * `data-tatari-live-page` attribute is ever renamed away.
 */
export function parseDetail(html, options = {}) {
  const source = String(html)
  const unresolved = []
  const put = makeLocalizer(unresolved)

  const pageArticle = firstBlockByAttr(source, 'article', 'data-tatari-updated-at') ?? ''
  const record = {
    slug: options.slug ?? tagAttr(pageArticle, 'article', 'data-tatari-live-page'),
    url: null,
    updatedAt: tagAttr(pageArticle, 'article', 'data-tatari-updated-at'),
    art: { normal: null, glitter: null },
    skill: { icon: null, name: null, description: null, baseParameters: [], effects: [] },
  }
  record.url = record.slug ? `/tatari/${record.slug}/` : null

  // --- header -------------------------------------------------------------
  const header = firstBlockByClass(source, 'header', 'detail-summary') ?? ''
  put(record, 'verified', firstText(blocksByClass(header, 'span', 'eyebrow')[0] ?? '', 'span'))
  put(record, 'name', firstText(header, 'h1'))

  const chips = parseChips(header)
  record.element = chips.element
  put(record, 'elementLabel', chips.elementLabel)
  record.elementIcon = chips.elementIcon
  record.role = chips.role
  put(record, 'roleLabel', chips.roleLabel)
  record.roleIcon = chips.roleIcon
  record.tierLabel = chips.tierLabel
  record.tier = tierNumber(chips.tierLabel)
  record.rarity = chips.rarity
  put(record, 'description', firstText(header, 'p'))

  // --- art and skill ------------------------------------------------------
  const media = firstBlockByAttr(source, 'section', 'data-tatari-media') ?? ''
  record.art.normal = firstImage(media, 'data-normal-art')
  record.art.glitter = firstImage(media, 'data-glitter-art')

  const skillPanel = firstBlockByClass(source, 'section', 'skill-panel') ?? ''
  const skillItem = firstBlockByClass(skillPanel, 'div', 'skill-item') ?? ''
  record.skill.icon = firstImage(skillItem)
  put(record.skill, 'name', firstText(skillItem, 'strong'))
  put(record.skill, 'description', firstText(skillItem, 'p'))
  const skillSections = parseSections(skillPanel)
  record.skill.baseParameters = localizePairs(skillSections.base, 'skill.baseParameters', put)
  record.skill.effects = localizeEffects(skillSections.effects, 'skill.effects', put)

  // --- lineage ------------------------------------------------------------
  const evolutionPanel = blockByHeading(source, 'Evolution line') ?? ''
  record.evolutionLine = deepBlocks(evolutionPanel, 'li').map((li) => {
    const anchor = findBlocks(li, 'a')[0] ?? null
    const url = anchor === null ? null : tagAttr(anchor.html, 'a', 'href')
    return {
      slug: url === null ? null : (url.match(/^\/tatari\/([^/]+)\/?$/)?.[1] ?? null),
      url,
      name: firstText(li, 'strong'),
      tier: tierNumber(firstText(li, 'small')),
      art: firstImage(li),
      current: hasClass(li, 'li', 'is-current'),
    }
  })

  const requirementsPanel = blockByHeading(source, 'Next evolution requirements') ?? ''
  record.requirements = deepBlocks(requirementsPanel, 'li').map((li, index) => {
    const entry = {}
    put(entry, 'text', stripTags(li), `requirements[${index}]`)
    return entry
  })

  const foodsPanel = blockByHeading(source, 'Compatible foods') ?? ''
  const foodsList = firstBlockByAttr(foodsPanel, 'div', 'data-live-foods')
  record.foods = foodsList === null
    ? []
    : deepBlocks(foodsList, 'a').map((anchor, index) => {
        const url = tagAttr(anchor, 'a', 'href')
        const entry = {
          slug: url === null ? null : (url.match(/^\/foods\/([^/]+)\/?$/)?.[1] ?? null),
          url,
          icon: firstImage(anchor),
        }
        put(entry, 'name', firstText(anchor, 'small'), `foods[${index}].name`)
        return entry
      })

  // --- related content ----------------------------------------------------
  record.tierReferences = []
  record.related = []
  for (const cluster of blocksByClass(source, 'section', 'related-cluster')) {
    const heading = headingText(cluster, 3)
    for (const anchor of deepBlocks(cluster, 'a')) {
      const url = tagAttr(anchor, 'a', 'href')
      const rankBlock = blocksByClass(anchor, 'span', 'related-rank')[0] ?? null
      const rank = rankBlock === null ? '' : stripTags(rankBlock)
      if (rank) {
        const [category, date] = splitCategoryDate(firstText(anchor, 'small'))
        const index = record.tierReferences.length
        const entry = { url, rank, category: null, date, title: null }
        put(entry, 'category', category, `tierReferences[${index}].category`)
        put(entry, 'title', firstText(anchor, 'strong'), `tierReferences[${index}].title`)
        record.tierReferences.push(entry)
      } else {
        const index = record.related.length
        const entry = { cluster: null, url, icon: firstImage(anchor), label: null, title: null }
        put(entry, 'cluster', heading, `related[${index}].cluster`)
        put(entry, 'label', firstText(anchor, 'small'), `related[${index}].label`)
        put(entry, 'title', firstText(anchor, 'strong'), `related[${index}].title`)
        record.related.push(entry)
      }
    }
  }

  // --- feeding ------------------------------------------------------------
  const feedingList = firstBlockByAttr(source, 'ol', 'data-live-feeding')
  record.feeding = feedingList === null
    ? []
    : deepBlocks(feedingList, 'li').map((li, index) => {
        const badge = blocksByClass(li, 'span', 'grade-badge')[0] ?? null
        const grade = badge === null ? null : stripTags(badge)
        const requirement = blocksByClass(li, 'span', 'star-requirement')[0] ?? null
        const entry = {
          stat: tagAttr(openingTags(li, 'img')[0] ?? '', 'img', 'alt') || null,
          icon: firstImage(li),
          grade,
          initial: hasClass(li, 'li', 'is-initial'),
        }
        put(entry, 'effect', withoutGrade(firstText(li, 'strong'), grade), `feeding[${index}].effect`)
        put(entry, 'requirement', requirement === null ? null : stripTags(requirement), `feeding[${index}].requirement`)
        return entry
      })

  return { record, unresolved }
}

/** `综合 · 2026-07-04` -> [`综合`, `2026-07-04`]; no dot -> [text, null]. */
function splitCategoryDate(text) {
  const parts = String(text ?? '').split('·').map((part) => part.trim())
  if (parts.length < 2) return [text || null, null]
  return [parts[0] || null, parts.slice(1).join(' · ').trim() || null]
}

/** `DATK +5%` with grade `D` -> `ATK +5%` (the badge renders inside the strong). */
function withoutGrade(text, grade) {
  if (!text || !grade || !text.startsWith(grade)) return text
  return text.slice(grade.length).trim()
}
