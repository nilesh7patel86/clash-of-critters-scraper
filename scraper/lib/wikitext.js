// The MediaWiki wikitext parser family, extracted from wiki_gg_scraper.js.
//
// Raw wikitext is the scraper's source of truth - grades, stage lists and
// skill tags sit in the infobox as plain `|Key=Value` pairs, where the rendered
// page hides them inside generated divs and CSS classes - so these helpers do
// the markup work and everything above them deals in ordinary strings. They are
// pure functions of their input: no network, no filesystem, no configuration,
// which is what makes them worth testing directly (see scraper/test/).

/**
 * The `{{Name ...}}` call at or after `from`: its body, plus the index just past
 * its closing braces, or null if the template is not on the page.
 *
 * Brace depth is tracked so that a nested template ({{Feedrow|...}}, {{st|AoE}})
 * cannot end the search early - the first `}}` on a Tatari page closes its first
 * `{{st|...}}`, not the infobox. The depth starts at 1 because the opening `{{`
 * has already been consumed. The end index is what lets a caller walk a run of
 * repeated calls instead of rediscovering the first one forever.
 */
export function templateCall(text, name, from = 0) {
  const start = text.indexOf(`{{${name}`, from)
  if (start === -1) return null
  const open = start + 2
  let depth = 1
  for (let i = open; i < text.length; ) {
    if (text.startsWith('{{', i)) {
      depth += 1
      i += 2
      continue
    }
    if (text.startsWith('}}', i)) {
      depth -= 1
      if (depth === 0) return { body: text.slice(open + name.length, i), end: i + 2 }
      i += 2
      continue
    }
    i += 1
  }
  return null
}

/** The body of the first `{{Name ...}}` call, or null if there is none. */
export function templateBody(text, name, from = 0) {
  return templateCall(text, name, from)?.body ?? null
}

/**
 * Every `{{Name ...}}` call in `text`, in order.
 *
 * A single parameter can hold a whole run of them - `Feeding Upgrade List`
 * carries ten to sixteen `{{Feedrow}}` calls - and reading only the first would
 * publish a fraction of a Tatari's upgrades as if it were all of them.
 */
export function templateBodies(text, name) {
  const bodies = []
  for (let call = templateCall(text, name); call; call = templateCall(text, name, call.end)) {
    bodies.push(call.body)
  }
  return bodies
}

/**
 * Splits on `target` at brace depth 0 only, returning the separators in place:
 * for `'a=b'` the result is `['a', '=', 'b']`. Interleaving them is what lets a
 * caller take "everything after the first `=`" without losing the separators.
 */
export function splitTopLevel(text, target) {
  const parts = []
  let depth = 0
  let current = ''
  for (let i = 0; i < text.length; i += 1) {
    const two = text.slice(i, i + 2)
    if (two === '{{' || two === '{|') {
      depth += 1
      current += two
      i += 1
      continue
    }
    if (two === '}}' || two === '|}') {
      depth -= 1
      current += two
      i += 1
      continue
    }
    if (depth === 0 && text[i] === target) {
      parts.push(current, target)
      current = ''
      continue
    }
    current += text[i]
  }
  parts.push(current)
  return parts
}

/** The same split, keeping only the chunks. */
export const splitChunks = (text, target) => splitTopLevel(text, target).filter((_, index) => index % 2 === 0)

/**
 * The named parameters of a template body, keyed by lowercased,
 * whitespace-collapsed name so that `|Skill Name = Volt Bolt` and
 * `|skill name=Volt Bolt` agree.
 *
 * Only the first `=` of an argument separates key from value, which is
 * MediaWiki's own rule and the reason a description containing an equals sign
 * survives intact. Values may contain `|` as long as it is inside a nested
 * template.
 *
 * Takes a body rather than a page so that a run of repeated calls can be parsed
 * one at a time; templateParams is the single-call wrapper.
 */
export function parseParams(body) {
  const params = new Map()
  for (const argument of splitChunks(body, '|').slice(1)) {
    const parts = splitTopLevel(argument, '=')
    const key = squash(parts[0]).toLowerCase()
    if (!key) continue
    params.set(key, parts.slice(1).join('').replace(/^=/, ''))
  }
  return params
}

/** The first `{{Name ...}}` call's parameters, or null if the template is absent. */
export function templateParams(text, name) {
  const body = templateBody(text, name)
  return body === null ? null : parseParams(body)
}

export const squash = (value) => value.replace(/\s+/g, ' ').trim()

/** Strip wiki markup down to readable text. */
export function plain(value) {
  return squash(
    value
      .replace(/\[\[File:[^\]]*\]\]/gi, '')
      .replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/'''?/g, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
}

/** `[[File:Some Name.png|100px]]` -> `Some Name.png` */
export function fileName(cell) {
  const match = cell.match(/\[\[File:([^\]|]+)/i)
  return match ? squash(match[1]) : null
}

/**
 * Splits one wikitable row into its cells. A cell begins on a line starting
 * with `|`; lines that follow without one are continuations of the cell above,
 * so a description wrapped over three lines stays in one piece.
 */
export function splitCells(rowText) {
  const cells = []
  for (const line of rowText.split('\n')) {
    if (/^\s*\|/.test(line) && !/^\s*\|-/.test(line)) cells.push(line.replace(/^\s*\|/, ''))
    else if (cells.length) cells[cells.length - 1] += `\n${line}`
  }
  return cells
}

/**
 * The data rows of the first wikitable at or after `marker`, so that a page
 * with several tables is disambiguated by the header that introduces it rather
 * than by position.
 */
export function tableRows(text, marker) {
  const at = text.indexOf(marker)
  if (at === -1) throw new Error(`marker not found: ${marker}`)
  const start = text.lastIndexOf('{|', at)
  const end = text.indexOf('\n|}', start)
  const body = text.slice(start, end === -1 ? undefined : end)
  // Slice(1) drops the header block; the first `|-` has already separated it.
  return body.split(/\n\|-+[^\n]*\n/).slice(1).filter((row) => row.trim())
}
