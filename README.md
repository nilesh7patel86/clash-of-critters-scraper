# Clash of Critters — roster editor, wiki codex & Tatari reference

A React app for Clash of Critters plus the Node scraper that feeds it. Data comes
from three public sources — the [wiki.gg](https://clashofcritters.wiki.gg) wiki
(the prose, roster and evolution lines), the game's own resource tables on
[tatary.xyz](https://tatary.xyz) (the numbers behind the stats) and
[tatadex.org](https://tatadex.org) (the card and skill artwork) — and is cached
into `public/` so the pages never depend on any of those sites being up.

Five views are served from the same repo (the SPA switches view via the `view`
query parameter — `/` is the roster):

| View | URL | What it is | Entry |
|------|-----|-----------|-------|
| Roster editor | `/` (default) | The game's pets (65 units in the current tables, displayed with wiki names + artwork): stars, evolution, grades, shiny, bulk controls, trainer & gym state, export/import/share, undo/redo | `src/RosterPage.tsx` |
| Codex | `/?view=codex` | Every Tatari card with stage portraits, horde skills and feeds | `src/CodexPage.tsx` |
| Trials reference | `/?view=trials` | Every Tatari's evolution quests from the game tables, with the star gate each one needs | `src/TrialsPage.tsx` |
| Card-sample lab | `/?view=samples` | The shared card layout, swapped between design skins | `src/cardSamples/CardSamplesPage.tsx` |
| Reference viewer | `/cards.html` | Build-free Tatari reference: search, type/role/rarity filters, evolution-chain dialog | `cards.html` |

## Quick start

```sh
npm install
npm run dev          # Vite dev server
npm run build        # tsc + production build to dist/
npm run preview      # serve the build
```

The roster is saved per-port in `localStorage` (the saved roster lives at the
default port). To develop without touching it, run the server on another port:

```sh
npm run dev -- --port 5199
```

The scraped data and images are committed, so `npm install && npm run dev` is
enough to run everything out of the box.

## Scraping

`scraper/app_scraper.js` (`npm run scrape_app`) is the single pass that produces
the app's data set and images. It runs once over the three sources in a fixed
order, and never touches any other cache:

1. **wiki.gg** (`scraper/app/wiki.js`) — the master source. Owns the roster,
   family structure, skills and all prose. Goes through the MediaWiki API
   (`api.php`) rather than rendered HTML: Cloudflare doesn't challenge it, up to
   50 titles fit one request, and the infobox values (`|Key=Value` pairs) are
   plain text in the raw wikitext, parsed by the pure functions in
   `scraper/lib/wikitext.js`.
2. **tatary.xyz** (`scraper/app/tatary.js`) — the game's resource JSON
   (`?v=`-pinned): the numbers behind the stats (growth multipliers, rarity and
   role ids the wiki never states) plus the game-only icons.
3. **tatadex.org** (`scraper/app/tatadex.js`) — the Tatari/Glitter portraits and
   the skill-icon fallback. Scrapes the static `/tatari/` catalog (240 cards)
   plus every detail page. Chinese-only strings are glossed into English by
   `scraper/lib/zh_en.js`; the site's original is kept beside it as `xZh`.

The game tables are then merged into the wiki rows by the pure `applyEnrichment`
in `scraper/tatary_enrichment.js` (element/rarity ids → names, growth
multipliers, rarity and role corrections). The wiki stays the master: only
growth, rarity and role cross over; the family structure, newer roster, skills
and prose are untouched.

Output roots:

| Path | Contents |
|------|----------|
| `public/app-cache/data/` | `units.json`, `pet_names.json`, `trials.json` (roster game tables) and `tataris.json`, `reference.json`, `zoboHorde.json`, `feedingUpgrades.json`, `artIndex.json` (codex) |
| `public/app-cache/manifest.json` | run provenance + the per-image ledger |
| `public/app-cache/wikitext/`, `public/app-cache/tatadex/` | cached raw wiki page text and tatadex catalog/detail HTML |
| `public/images/<category>/` | the images, one directory per category |

Image categories and their sources:

| Category | Source | Rule |
|----------|--------|------|
| `tatari`, `tatari-glitter` | tatadex.org | wiki.gg when tatadex has no art |
| `tatari-skills` | wiki.gg | tatadex icon when the wiki has no art |
| `attributes` | tatary.xyz (`atk`/`def`/`hp`) | wiki `Attack`/`HP`/`Defense` when tatary has none |
| `elements`, `roles` | wiki.gg | — |
| `grade`, `stars`, `dojo`, `trials`, `misc` | tatary.xyz | — |

Portraits are filed under the Tatari's own name, and the `artIndex`/`tataris.json`
fields carry a `category/filename` reference (`tatari/Volt Bolt.png`) that a
reader resolves directly under `images/`.

Before downloading, the run lists every category with its image count and asks
`y/N` per category. `--yes` downloads all, `--only <a,b>` selects categories, and
`--skip-images` writes the data and manifest without downloading. `--force`
re-fetches pages and re-downloads images; `--limit <n>` trims each source's
detail pages for a fast smoke test; `--delay <ms>` paces the requests and
`--image-concurrency <n>` (default 4) sizes the download pool. The image rules
are unit-tested in `scraper/test/app_scraper.test.js`.

The wiki's raw page text and tatadex's catalog/detail HTML are cached under
`public/app-cache/wikitext/` and `public/app-cache/tatadex/`, so a re-run is a
local read rather than hundreds of requests — worth knowing because tatadex.org
throttles hard with HTTP 503. `--force` refreshes the caches.

npm scripts: `scrape_app` (the full pass), `force_app` (the same with `--force`)
and `data_app` (data + manifest only, no images).

## Architecture

### Data split

The SPA renders out of two roots, both written by `scraper/app_scraper.js`:

**`public/app-cache/data/`** — the app's data set. The game tables are read
**at build time** and baked into the bundle; the documented set is fetched **at
runtime**:

| File | Contents | Readers |
|------|----------|---------|
| `data/units.json` | units, evolutions, star costs, feed ranks, badges, careers, qualities | `vite.config.ts` → `__GAME_DATA__` (all views) |
| `data/pet_names.json` | display names | `vite.config.ts` → `__GAME_DATA__` |
| `data/trials.json` | trial (trials of strength) tables | `vite.config.ts` → `__GAME_DATA__` |
| `data/tataris.json` | the roster: names, type/role/rarity, skills, art references, feeding tracks, counters | `CodexPage.tsx` |
| `data/reference.json` | vocabularies (types, roles, icons, stat icons, meta) | `CodexPage.tsx` |
| `data/zoboHorde.json` | evolution families + Zobo Horde skills | `CodexPage.tsx` |
| `data/feedingUpgrades.json` | shared feeding dictionary | `CodexPage.tsx` |
| `data/artIndex.json` | `name → {normal, glitter}` art references — the only columns the roster grid reads | `RosterPage.tsx` via `src/wikiArt.ts` |

The game tables are a static dump that never goes stale on its own, so they are
inlined via `define.__GAME_DATA__` — a consumer never waits on a ~1.5 MB request
to render the roster. The documented set is fetched at runtime instead, because a
stale copy inside the bundle would be the wrong trade for data the scraper owns.

**`public/images/<category>/`** — every image the app draws, one directory per
category. The data carries `category/filename` references (e.g.
`tatari/Volt Bolt.png`) that `src/wikiArt.ts` (`wikiImageUrl`) and
`src/domain.ts` (`assetUrl`) resolve directly under this root.

**`shared/shiny.json`** — the one curated list of pets/stages with no Glitter
art. Both the scraper (fallback shiny rules) and the app (`hasShiny`) read the
same file, so the two cannot drift.

### The manifest

`public/app-cache/manifest.json` records the run — what it wrote, and why each
image was fetched:

```jsonc
{
  "version": 1,
  "scrapedAt": "…",
  "sources": { "wiki": "…", "tatary": "…", "tatadex": "…" },
  "options": { "limit": 0, "force": false, "selectedCategories": ["tatari", "…"] },
  "data": { "tataris": { "path": "data/tataris.json", "count": 248 } },
  "enrichment": { "enriched": 248, "unmatched": 0, "rarityFixes": 0, "roleFixes": 0, "typeDisagreements": 0 },
  "counts": { "imageJobs": 662, "downloaded": 0, "cached": 662, "missing": 0, "skipped": 0 },
  "categories": [{ "name": "tatari", "total": 248, "cachedOnDisk": 248 }],
  "assets": [{
    "category": "tatari",
    "filename": "Anglerbear.png",
    "localFile": "public/images/tatari/Anglerbear.png",
    "origin": "tatadex",
    "remotePath": "…",
    "url": "…",
    "sources": ["tatadex:Anglerbear:normal"],   // what asked for it
    "status": "cached"
  }]
}
```

Every file the pages read is listed in `data`, and every image in `assets` with
the record of *why* it was downloaded (`sources`) — a mini provenance ledger that
also drives caching (a file already on disk is not re-fetched unless `--force`).

### `cards.html`

`cards.html` is a self-contained viewer with **no build step**: a single
`<script type="module">` fetches `tataris.json` + `zoboHorde.json` +
`reference.json` from `public/app-cache/data/` and defers `feedingUpgrades.json`
to the first card opened. It tries two base paths (`/app-cache/data/` under Vite
and `./public/app-cache/data/` under a plain static server rooted at the repo),
derives the image root (`/images/` or `./public/images/`) from whichever works,
and resolves the evolution chain's art from each row's own portrait reference. It
is listed in `build.rollupOptions.input`, so `vite build` emits `dist/cards.html`
alongside `index.html` — a static host that only serves `dist/` gets the
reference page too. All wiki-sourced text is inserted via `textContent`, never
`innerHTML`.

### Frontend layout

- `src/gameData.ts` — types + the `__GAME_DATA__` bundle (units, stars,
  evolutions, feed ranks, badges).
- `src/petHelpers.ts` — the pet read-side shared by roster and codex (names,
  art lookups, star/stat maths, trials, evolution quality).
- `src/roster/` — the roster editor: `RosterPage.tsx` (shell), `stats.ts`
  (snapshot shapes + `sortIds`), `persistence.ts` (reducer, undo/redo, debounced
  localStorage save, import/export/share encoders), `components/` (memoised
  `PetCard`, `StarPicker`, `StarCostModal`, `TrialsTip`, `Sidebar`).
- `src/wikiCodex.ts` + `src/CodexPage.tsx` — the codex's data model and view
  (line cards, stage dossier tabs, search/type/rarity filters).
- `src/trials.ts` + `src/TrialsPage.tsx` — the trials reference's data model and
  view (one card per Tatari: each evolution's star gate and quests, with
  search and element filters).
- `src/cardSamples/` — the card-sample lab: `cardSampleModel.ts` builds a sample
  card's data, `cardSampleLayouts.tsx` / `cardSampleKit.tsx` render it in a
  fixed-region layout that swaps skins without touching data.
- `src/wikiArt.ts` — runtime artwork lookup for the roster (art index + image URLs).
- `src/domain.ts` — `assetUrl`/`ASSET_ROOT` (the image root) and shared game helpers.

## Quality gates

```sh
npm run check   # tsc -b && oxlint && node --test scraper/test/*.test.js
npm test        # just the scraper tests (lib parsers + app-scraper image rules)
npm run build   # tsc -b && vite build (emits dist/index.html, dist/cards.html)
```

A pre-commit hook (`.githooks/pre-commit`, enable with
`git config core.hooksPath .githooks`) runs `npm run check` on every commit, and
`.github/workflows/ci.yml` runs the same check plus the build on push/PR.
`scraper/lib/` holds the shared pieces the scraper builds on: `http.js`
(retry/backoff/`Retry-After`), `cli.js` (logging + spec-based arg parsing),
`wikitext.js`, `html.js`, `tatadex.js` and `zh_en.js` (the parser test surface),
and `scraper/tatary_enrichment.js` holds the pure enrichment merge.
