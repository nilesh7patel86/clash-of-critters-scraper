// Generic HTML helpers for the Tatadex scraper, extracted so the parsers in
// tatadex.js stay about the page rather than about scanning strings.
//
// tatadex.org is a static Astro site: every value the scraper wants is in the
// server-rendered HTML (robots.txt disallows /api/, so there is no JSON
// endpoint to prefer). There is no DOM in Node and the project deliberately has
// no HTML parser dependency, so these are pure string functions - no network,
// no filesystem, no configuration - which is what makes them worth unit testing
// (see scraper/test/html.test.js).

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  bull: '•',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
  reg: '®',
  times: '×',
  laquo: '«',
  raquo: '»',
  deg: '°',
}

/** `&amp;` `&#39;` `&#x27;` -> the character. One pass, no double decoding. */
export function decodeEntities(value) {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1] === 'x' || entity[1] === 'X'
      const code = Number.parseInt(hex ? entity.slice(2) : entity.slice(1), hex ? 16 : 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()]
    return named === undefined ? whole : named
  })
}

export const squash = (value) => String(value).replace(/\s+/g, ' ').trim()

/**
 * The readable text of an HTML fragment: scripts and styles first (a `<p>` is
 * never inside one, but the language switcher and JSON-LD live in the same
 * document and would otherwise leak into every scraped string), then tags as
 * spaces so two adjacent elements do not fuse into one word - except before
 * punctuation, where `</strong>.` must not become "stars .".
 */
export function stripTags(html) {
  return squash(
    decodeEntities(
      String(html)
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' '),
    ),
  ).replace(/\s+([,.;:!?…])/g, '$1')
}

/**
 * Every balanced `<tag>...</tag>` range in `html`, outermost first, as
 * `{ start, end, html }` where `end` is one past the closing `>`.
 *
 * Balanced matching rather than "up to the next `</tag>`" is what makes nested
 * markup parseable: `<section>` contains `<section class="skill-section">`
 * inside the skill parameters block, and `<ul>` sits inside `<details>` inside
 * `<article>`. Only the given tag is counted, so `<li>` inside `<ul>` cannot
 * end the `<ul>` early.
 *
 * Self-closing tags (`<img ...>`) are not matched - none of the tags this
 * scraper walks are self-closing - and a void element is therefore invisible to
 * the depth count rather than a source of imbalance.
 */
export function findBlocks(html, tag) {
  const source = String(html)
  const token = new RegExp(`</?${tag}(?=\\s|>|/)`, 'g')
  const blocks = []
  let depth = 0
  let start = null
  let match
  while ((match = token.exec(source)) !== null) {
    const closing = match[0][1] === '/'
    if (!closing) {
      if (depth === 0) start = match.index
      depth += 1
      continue
    }
    if (depth === 0) continue
    depth -= 1
    if (depth === 0 && start !== null) {
      const end = source.indexOf('>', match.index)
      const stop = end === -1 ? source.length : end + 1
      blocks.push({ start, end: stop, html: source.slice(start, stop) })
      start = null
    }
  }
  return blocks
}

/** The contents of a fragment between its own opening and closing tag. */
export function innerHtml(fragment) {
  const source = String(fragment)
  const open = source.match(/^<([a-z0-9]+)(\s[^>]*)?>/i)
  if (!open) return source
  const start = open[0].length
  const end = source.lastIndexOf(`</${open[1]}>`)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

/**
 * Every `tag` block at any depth, document order.
 *
 * findBlocks only returns outermost blocks, which is right for walking a
 * document but not for querying one: `<span class="chip">` sits inside
 * `<span class="tatari-card__meta">` and `<section class="related-cluster">`
 * inside `<section class="tatari-related">`, so an outermost-only scan would
 * silently never see them. Descending through each block's interior is what
 * turns "outermost matches" into "all matches".
 */
export function deepBlocks(html, tag) {
  const found = []
  const visit = (fragment) => {
    for (const block of findBlocks(fragment, tag)) {
      found.push(block.html)
      visit(innerHtml(block.html))
    }
  }
  visit(String(html))
  return found
}

/** The opening tag of a fragment, e.g. `<article class="tatari-card" ...>`. */
export function openingTag(fragment, tag) {
  const match = String(fragment).match(new RegExp(`<${tag}(?=\\s|>|/)[^>]*>`))
  return match ? match[0] : null
}

/** One attribute of a fragment's opening tag, decoded, or null. */
export function tagAttr(fragment, tag, name) {
  const tagHtml = openingTag(fragment, tag)
  if (!tagHtml) return null
  const match = tagHtml.match(new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+)))?`, 'i'))
  if (!match) return null
  // The value groups are undefined for a bare attribute (`hidden`), which is a
  // present-but-empty flag - the callers below treat '' and null alike.
  const value = match[2] ?? match[3] ?? match[4] ?? ''
  return decodeEntities(value)
}

/** Every opening `<tag ...>` in `html`, as raw strings. */
export function openingTags(html, tag) {
  return String(html).match(new RegExp(`<${tag}(?=\\s|>|/)[^>]*>`, 'gi')) ?? []
}

/** The first `<tag ...>` in `html` carrying `attr`, or null. */
export function tagWithAttr(html, tag, attr) {
  return openingTags(html, tag).find((tagHtml) => hasAttr(tagHtml, tag, attr)) ?? null
}

const classPattern = (className) => new RegExp(`(^|\\s)${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`)

/** Whether an element's class attribute lists `className` as a whole word. */
export function hasClass(fragment, tag, className) {
  const tagHtml = openingTag(fragment, tag)
  if (!tagHtml) return false
  const classes = tagAttr(fragment, tag, 'class')
  return classes !== null && classPattern(className).test(classes)
}

/** Whether a fragment's opening tag carries `attr` (valueless flags count). */
export function hasAttr(fragment, tag, attr) {
  return new RegExp(`(^|\\s)${attr}(\\s|=|>|/|$)`, 'i').test(openingTag(fragment, tag) ?? '')
}

/** The blocks of `tag` whose class attribute lists `className`, at any depth. */
export function blocksByClass(html, tag, className) {
  return deepBlocks(html, tag).filter((blockHtml) => hasClass(blockHtml, tag, className))
}

/** The first of those, or null. */
export function firstBlockByClass(html, tag, className) {
  return blocksByClass(html, tag, className)[0] ?? null
}

/**
 * The blocks of `tag` whose opening tag carries `attr`, which is how every
 * live region on a Tatari detail page is marked up: `data-tatari-media`,
 * `data-horde-skill-panel`, `data-wild-related`, `data-live-foods`,
 * `data-live-feeding`. The attributes are the contract the page's own JS
 * targets, so they are more stable than the surrounding class names.
 */
export function blocksByAttr(html, tag, attr) {
  return deepBlocks(html, tag).filter((blockHtml) => hasAttr(blockHtml, tag, attr))
}

/** The first of those, or null. */
export function firstBlockByAttr(html, tag, attr) {
  return blocksByAttr(html, tag, attr)[0] ?? null
}

/** The text of the first `tag` carrying `attr`, or null. */
export function textByAttr(html, tag, attr) {
  const block = firstBlockByAttr(html, tag, attr)
  return block === null ? null : stripTags(block)
}

/** The `<h3>` heading text inside a fragment, or null. */
export function headingText(fragment, level = 3) {
  const match = String(fragment).match(new RegExp(`<h${level}(?:\\s[^>]*)?>([\\s\\S]*?)</h${level}>`, 'i'))
  return match ? stripTags(match[1]) : null
}

/**
 * The `<section>` (or whatever `tag` wraps the heading) that contains a heading
 * with exactly `heading`. Section names in the markup are classes, not ids, so
 * the visible heading is the stable thing to anchor on - and every panel on a
 * Tatari page has one.
 */
export function blockByHeading(html, heading, tag = 'section') {
  const needle = `<h2>${heading}</h2>`
  return deepBlocks(html, tag).find((blockHtml) => blockHtml.includes(needle)) ?? null
}

/**
 * `<li><span>label</span><strong>value</strong></li>` pairs, which is how both
 * the skill parameters and the feeding timeline are marked up. Returns
 * `[{ label, value }]` in document order, skipping list items that do not have
 * that shape (the feeding timeline's markers, for instance).
 */
export function labelValuePairs(html) {
  const pairs = []
  for (const block of findBlocks(html, 'li')) {
    const match = block.html.match(/<span[^>]*>([\s\S]*?)<\/span>\s*<strong[^>]*>([\s\S]*?)<\/strong>/i)
    if (!match) continue
    pairs.push({ label: stripTags(match[1]), value: stripTags(match[2]) })
  }
  return pairs
}

/** `href` of the first anchor in a fragment, resolved against the site root. */
export const hrefOf = (fragment) => tagAttr(openingTag(fragment, 'a') ?? '', 'a', 'href')
