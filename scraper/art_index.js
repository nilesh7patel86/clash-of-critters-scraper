// The roster's portrait index.
//
//   node scraper/art_index.js            # rebuild data/artIndex.json from tataris.json
//
// The roster only ever reads two columns out of tataris.json - `name`,
// `normalImage` and `glitterImage` - but fetched the whole file to get them,
// which is 328KB of skill text, feeding tracks and stat grades to draw a grid
// of portraits. This file is the same three columns and nothing else, so the
// roster's first paint costs ~11KB instead.
//
// It is derived data: the scraper writes it next to tataris.json on every run
// (see wiki_gg_scraper.js), and this script exists to rebuild it from a cache
// that is already on disk, without a re-scrape.
//
// The shape keeps `normal` rather than falling back to a invented name, for the
// same reason the scraper does: a stage whose artwork the wiki has not got yet
// must read as missing so the card falls back to the game's own icon, rather
// than pointing at a file that was never downloaded.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_TATARIS = path.join(ROOT, 'public', 'wiki-cache', 'data', 'tataris.json')
const DEFAULT_OUT = path.join(ROOT, 'public', 'wiki-cache', 'data', 'artIndex.json')

export const ART_INDEX_VERSION = 1

/**
 * `{ version, scrapedAt, rows: { <name>: { normal, glitter? } } }` from a
 * roster array. `glitter` is omitted rather than set to null when a stage has
 * no Glitter artwork, which is 20 of the 248 rows today.
 */
export function buildArtIndex(rows, scrapedAt = null) {
  const index = {}
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row?.name !== 'string' || !row.name) continue
    const normal = typeof row.normalImage === 'string' ? row.normalImage : null
    const glitter = typeof row.glitterImage === 'string' && row.glitterImage ? row.glitterImage : null
    index[row.name] = glitter ? { normal, glitter } : { normal }
  }
  return { version: ART_INDEX_VERSION, scrapedAt, rows: index }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const rows = JSON.parse(readFileSync(DEFAULT_TATARIS, 'utf8'))
  if (!Array.isArray(rows)) throw new Error('tataris.json is not an array')
  const index = buildArtIndex(rows)
  mkdirSync(path.dirname(DEFAULT_OUT), { recursive: true })
  writeFileSync(DEFAULT_OUT, `${JSON.stringify(index)}\n`, 'utf8')
  console.log(
    `[${new Date().toISOString()}] [INFO] Wrote ${path.relative(ROOT, DEFAULT_OUT).replaceAll('\\', '/')} ` +
      `(${Object.keys(index.rows).length} portraits, ${(Buffer.byteLength(JSON.stringify(index)) / 1024).toFixed(1)}KB)`,
  )
}
