# Clash of Critters — roster editor, wiki codex & Tatari reference

A React app for Clash of Critters plus the Node scrapers that feed it. Data comes
from two public sources — the [wiki.gg](https://clashofcritters.wiki.gg) wiki
(the prose, roster and evolution lines) and the game's own resource tables on
[tatary.xyz](https://tatary.xyz) (the numbers behind the stats) — and is cached
into `public/` so the pages never depend on either site being up.

Three views are served from the same repo (the SPA switches view via the `view` query parameter — `/` is the roster):

| View | URL | What it is | Entry |
|------|-----|-----------|-------|
| Roster editor | `/` (default) | The game's pets (65 units in the current tables, displayed with wiki names + artwork): stars, evolution, grades, shiny, bulk controls, trainer & gym state, export/import/share, undo/redo | `src/RosterPage.tsx` |
| Codex | `/?view=codex` | Every Tatari card with stage portraits, horde skills and feeds | `src/CodexPage.tsx` |
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

The scraped caches are committed, so `npm install && npm run dev` is enough to
run everything out of the box.

## Scraping

The two scrapers and one enrichment step are orchestrated by `scraper/scrape_all.js`:

1. **wiki.gg** (`scraper/wiki_gg_scraper.js`) — the master source. Owns the
   roster, family structure and all prose. Goes through the MediaWiki API
   (`api.php`) rather than rendered HTML: Cloudflare doesn't challenge it, up to
   50 titles fit one request, and the infobox values (`|Key=Value` pairs) are
   plain text in the raw wikitext. Raw pages are parsed by the pure functions in
   `scraper/lib/wikitext.js`.
2. **tatary.xyz** (`scraper/tatary_xyz_scraper.js`) — the game's resource JSON
   (`?v=`-pinned), enriched from. Downloads the game's own pet/stage/attr icons.
3. **Enrichment** (`scraper/tatary_enrichment.js`) — merges the game tables into
   the wiki's `tataris.json`: element/rarity ids → names, growth multipliers,
   initial stat grades, trials. It never replaces a wiki value wholesale and
   never rewrites the vocabularies. `--no-fix-rarity` reports rarity
   disagreements without correcting them.

npm scripts: `scrape_wikigg`, `force_wikigg`, `scrape_tatary`, `force_tatary`,
`scrape_all`, `force_all`, `enrich`. `--force` re-fetches data *and* re-downloads
images; `--skip-images` builds the JSON only; `--delay` (floor 250 ms on the wiki
side, `TATARY_SCRAPER_DELAY` env fallback on the game side) paces the API calls;
`--image-concurrency` (default 4) sizes the download worker pool.

The caches are git-tracked, so a local run rewrites committed files. To review a
wiki run without dirtying the tree, point its output elsewhere:
`node scraper/wiki_gg_scraper.js --skip-images --out <tmpdir>/tataris.json`.
After a tatary run, restore the tracked manifest with `git checkout -- public/tatary-cache/manifest.json`.

## Architecture

### Data split

Everything a page renders comes out of `public/`. The two caches mirror each
other's layouts (`data/`, `img/`, `manifest.json`):

**`public/tatary-cache/`** — the game's tables, read **at build time** and baked
into the bundle:

| File | Contents | Readers |
|------|----------|---------|
| `data/units.json` | units, evolutions, star costs, feed ranks, badges, careers, qualities | `vite.config.ts` → `__GAME_DATA__` (all views) |
| `data/pet_names.json` | display names | `vite.config.ts` → `__GAME_DATA__` |
| `data/trials.json` | trial (trials of strength) tables | `vite.config.ts` → `__GAME_DATA__` |
| `img/…` | official icons (`pet/`, `attr/`, `grade/`, `career/`, …) | runtime, alongside the game data |
| `manifest.json` | provenance of every file above | humans, diff review |

The tables are a static dump that never goes stale on its own, so they are
inlined via `define.__GAME_DATA__` — a consumer never waits on a ~1.5 MB request
to render the roster.

**`public/wiki-cache/`** — the wiki's output, read **at runtime** (it is the
thing the scrapers refresh):

| File | Contents | Readers |
|------|----------|---------|
| `data/tataris.json` | the roster: names, type/role/rarity, skills, stage images, feeding tracks, counters | `CodexPage.tsx`, `cards.html` |
| `data/reference.json` | vocabularies (types, roles, icons, stat icons, meta) | `CodexPage.tsx`, `cards.html` |
| `data/zoboHorde.json` | evolution families + Zobo Horde skills | `CodexPage.tsx`, `cards.html` |
| `data/feedingUpgrades.json` | shared feeding dictionary (fetched lazily, once) | `cards.html` |
| `data/artIndex.json` | `name → {normal, glitter}` — the only three columns the roster grid reads | `RosterPage.tsx` via `src/wikiArt.ts` |
| `img/` | ~578 wiki artwork files (normal + glitter) | the views that draw portraits |
| `wikitext/<Title>.wiki` | raw page text cached per run | the wiki scraper |
| `manifest.json` | provenance: what was written and every asset's sources | humans, diff review |

The wiki data is fetched at runtime instead of baked because a stale copy inside
the bundle would be the wrong trade for data the scraper owns. `artIndex.json`
exists because the roster needs two filename columns, not 328 KB of skill text —
it is derived data, rebuildable without a re-scrape: `node scraper/art_index.js`.

**`shared/shiny.json`** — the one curated list of pets/stages with no Glitter
art. Both the scraper (fallback shiny rules) and the app (`hasShiny`) read the
same file, so the two cannot drift.

### The `--out` / manifest contract

`--out <path>` on the wiki scraper *names the roster*: `tataris.json` lands at
`<path>` and the rest of the wiki data set (`reference`, `zoboHorde`,
`feedingUpgrades`, `artIndex`) is written **beside it** in the same directory,
so a custom `--out` directory collects the whole set rather than scattering
siblings. `scrape_all.js` forwards the flag to the enrichment step so it rewrites
the roster in the same place.

Each cache carries a `manifest.json`:

```jsonc
{
  "version": 1,
  "source": "https://clashofcritters.wiki.gg",
  "scrapedAt": "…",                 // when the run finished
  "data": { "tataris": { "path": "public/wiki-cache/data/tataris.json" } },
  "assets": [{
    "filename": "Anglerbear.png",
    "url": "…",
    "sources": ["tatari:Anglerbear:evolution-stage-4", "…"],  // what asked for it
    "status": "cached",
    "localFile": "public/wiki-cache/img/Anglerbear.png"
  }]
}
```

Every file the pages read is listed in `data`, and every downloaded image in
`assets` with the record of *why* it was downloaded (`sources`) — a mini
provenance ledger that also drives caching (a source already satisfied by a
cached file is not re-fetched) and `--force` semantics. Both manifests are
written byte-deterministically (stable ordering, one `scrapedAt` timestamp), so
a rerun over unchanged sources produces identical output — the A/B tests used to
verify refactors byte-compare these files.

### `cards.html`

`cards.html` is a self-contained viewer with **no build step**: a single
`<script type="module">` fetches `tataris.json` + `zoboHorde.json` +
`reference.json` from the wiki cache and defers `feedingUpgrades.json` to the
first card opened. It tries two base paths (`/wiki-cache/data/` under Vite and
`./public/wiki-cache/data/` under a plain static server rooted at the repo) and
derives the image base from whichever works. It is listed in
`build.rollupOptions.input`, so `vite build` emits `dist/cards.html` alongside
`index.html` — a static host that only serves `dist/` gets the reference page
too. All wiki-sourced text is inserted via `textContent`, never `innerHTML`.

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
- `src/cardSamples/` — the card-sample lab: `cardSampleModel.ts` builds a sample
  card's data, `cardSampleLayouts.tsx` / `cardSampleKit.tsx` render it in a
  fixed-region layout that swaps skins without touching data.
- `src/wikiArt.ts` — runtime wiki artwork lookup for the roster.

## Quality gates

```sh
npm run check   # tsc -b && oxlint && node --test scraper/test/*.test.js
npm test        # just the scraper tests (33: wikitext parsers + CLI spec)
npm run build   # tsc -b && vite build (emits dist/index.html + dist/cards.html)
```

A pre-commit hook (`.githooks/pre-commit`, enable with
`git config core.hooksPath .githooks`) runs `npm run check` on every commit, and
`.github/workflows/ci.yml` runs the same check plus the build on push/PR.
`scraper/lib/` holds the shared pieces the scrapers build on: `http.js`
(retry/backoff/`Retry-After`), `cli.js` (logging + spec-based arg parsing),
`wikitext.js` (the parser test surface).