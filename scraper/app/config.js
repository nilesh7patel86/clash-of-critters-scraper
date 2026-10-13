// Configuration for the unified app scraper.
//
// The app scraper is a single pass over all three upstream sources in a fixed
// order - wiki.gg, then tatary.xyz, then tatadex.org - that produces the lean
// data set and image set the Roster and Codex tabs actually read, under one
// cache root (public/app-cache) and one image root (public/images).
//
// It shares the low-level, side-effect-free helpers in scraper/lib with the
// three standalone scrapers, but never imports or spawns them: each of those
// runs its own main() on import, so the wiki/tatary/tatadex parsing this pass
// needs lives in scraper/app/*.js instead.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCliArgs } from '../lib/cli.js'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// One cache root beside the other three, so a run never writes into the caches
// the standalone scrapers own. Images live outside it, under public/images, as
// the app's single, category-organised image root.
export const CACHE_ROOT = path.join(ROOT, 'public', 'app-cache')
export const DATA_DIR = path.join(CACHE_ROOT, 'data')
export const WIKITEXT_DIR = path.join(CACHE_ROOT, 'wikitext')
export const TATADEX_DIR = path.join(CACHE_ROOT, 'tatadex')
export const MANIFEST_FILE = path.join(CACHE_ROOT, 'manifest.json')
export const IMAGES_ROOT = path.join(ROOT, 'public', 'images')

// ---------------------------------------------------------------- sources

export const WIKI_BASE = 'https://clashofcritters.wiki.gg'
export const WIKI_API_URL = `${WIKI_BASE}/api.php`
export const WIKI_IMAGE_BASE = `${WIKI_BASE}/images`

export const WIKI_PAGE = 'Tatari'
export const WIKI_ZOBO_PAGE = 'Zobo Horde Invasion'

export const TATARY_BASE = (process.env.TATARY_BASE_URL || 'https://tatary.xyz').replace(/\/+$/, '')
// A cache-buster the live site publishes; the file path is the same with or
// without it, so an override is only ever needed while debugging.
export const TATARY_VERSION = process.env.TATARY_VERSION || '67f6264a'

export const TATADEX_BASE = (process.env.TATADEX_BASE_URL || 'https://tatadex.org').replace(/\/+$/, '')

// The User-Agents are self-identifying on purpose. wiki.gg's Cloudflare serves
// a descriptive bot string normally and challenges a browser imitation with a
// 403, which is the same reason the standalone wiki scraper does this.
export const WIKI_UA = 'clash-of-critters-app-scraper/1.0 (local dev tool; +https://clashofcritters.wiki.gg)'
export const TATARY_UA = 'clash-of-critters-app-cache/1.0'
export const TATADEX_UA = 'clash-of-critters-app-cache/1.0'

// ---------------------------------------------------------------- categories

// The image categories, and therefore the directories under public/images.
// `tatari`, `tatari-glitter` and `tatari-skills` come from tatadex (with the
// wiki as fallback for the first two and the primary source for the third);
// `grade`, `stars`, `dojo`, `trials` and `misc` are game icons only tatary.xyz
// publishes; `attributes`, `elements` and `roles` are the shared UI chips the
// Roster and Codex read.
export const CATEGORIES = [
  'tatari',
  'tatari-glitter',
  'tatari-skills',
  'attributes',
  'elements',
  'roles',
  'grade',
  'stars',
  'dojo',
  'trials',
  'misc',
]

export const DEFAULT_DELAY_MS = 250
export const DEFAULT_IMAGE_CONCURRENCY = 4

const HELP = `
Clash of Critters unified app scraper

  node scraper/app_scraper.js [options]

Scrapes the three sources in order - wiki.gg, tatary.xyz, tatadex.org - into
the lean data set and categorised image set the Roster and Codex tabs use:

  public/app-cache/data/*.json   data (units, pet_names, trials, tataris,
                                 reference, zoboHorde, feedingUpgrades, artIndex)
  public/app-cache/manifest.json run manifest: data paths + per-image ledger
  public/app-cache/wikitext/     cached wiki.gg raw page text
  public/app-cache/tatadex/      cached tatadex.org catalog and detail pages
  public/images/<category>/      downloaded images, one directory per category
                                 (tatari, tatari-glitter, tatari-skills,
                                 attributes, elements, roles, grade, stars,
                                 dojo, trials, misc)

Image precedence:
  Tatari portraits  tatadex.org, falling back to wiki.gg
  Skill icons       wiki.gg, falling back to tatadex.org
  Other icons       the source that publishes them (tatary.xyz for game icons,
                    wiki.gg for element/role chips)

Options:
  --force                  Re-fetch every page AND re-download every image
  --skip-images            Write the data and manifest without downloading images
  --yes, -y                Download every category without prompting
  --only <a,b,...>         Download only the named categories (comma/space list)
  --limit <n>              Scrape only the first n detail pages of each source
  --delay <ms>             Minimum gap between remote request starts (default ${DEFAULT_DELAY_MS})
  --image-concurrency <n>  Parallel image downloads (default ${DEFAULT_IMAGE_CONCURRENCY})
  --tatary-version <v>     tatary.xyz cache-buster query value
  --help, -h               Show this help
`

/** Parse `--only` into a validated Set of category names, or null for "all". */
function parseOnly(raw) {
  const names = String(raw ?? '')
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter(Boolean)
  if (!names.length) return null
  const valid = new Set(CATEGORIES)
  const chosen = new Set()
  for (const name of names) {
    if (valid.has(name)) chosen.add(name)
    else throw new Error(`unknown --only category "${name}" (known: ${CATEGORIES.join(', ')})`)
  }
  return chosen
}

export function createConfig(argv) {
  const config = parseCliArgs(argv, {
    flags: {
      force: ['--force'],
      skipImages: ['--skip-images'],
      yes: ['--yes', '-y'],
      help: ['--help', '-h'],
    },
    options: {
      limit: { flag: '--limit', number: true, min: 0, default: 0 },
      delay: { flag: '--delay', number: true, min: 0, default: DEFAULT_DELAY_MS },
      imageConcurrency: { flag: '--image-concurrency', number: true, min: 1, default: DEFAULT_IMAGE_CONCURRENCY },
      only: { flag: '--only', default: '' },
      tataryVersion: { flag: '--tatary-version', default: TATARY_VERSION },
    },
  })
  config.onlyCategories = parseOnly(config.only)
  return config
}

export { HELP }
