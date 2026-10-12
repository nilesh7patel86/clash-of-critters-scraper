# Code review — findings & recommendations

> Temporary working file created during the review of `scraper/*.js` and `src/*`.
> Items are ordered by decreasing benefit. Effort: **S** (<1 h), **M** (1–3 h), **L** (3–6 h).
> Update the status column as items are implemented.

Status key: `todo` · `in progress` · `done` · `skipped`

## Batch 1 (fast wins) — implemented & verified

| # | Change | Where | Status |
|---|--------|-------|--------|
| 1 | Emit `artIndex.json` (`name → {normal, glitter}`) and fetch that for portraits instead of all 328 KB of `tataris.json` | `wiki_gg_scraper.js`, `src/wikiArt.ts`, new `scraper/art_index.js` | done |
| 2 | Write `tataris.json` / `zoboHorde.json` compact (~131 KB saved on codex first load; `reference` + `feedingUpgrades` stay pretty) | `wiki_gg_scraper.js`, `tatary_enrichment.js` | done |
| 3 | Decorate-sort-undecorate in `sortIds` so stats are computed once instead of O(n log n) times (now `roster/stats.ts`) | `src/roster/stats.ts` | done |
| 4 | Precompute `search` / `topRarity` / `inGame` / `roles` per line in `buildModel`, consume in the codex filter+sort | `src/wikiCodex.ts`, `src/CodexPage.tsx` | done |
| 8 | Debounce the localStorage save (+ flush on `pagehide`/unmount); now the `useRosterSave` hook (moved in batch 2) | `src/roster/persistence.ts` | done |

Verification notes for batch 1:

- **1** — Browser check: roster fetches `artIndex.json` (16.7 KB, HTTP 200) and never requests `tataris.json` (327.9 KB); 65 portraits render, 0 broken images, no console warnings. `art_index.js` doubles as a standalone rebuilder (`node scraper/art_index.js`) so the index can be regenerated without a re-scrape; the scraper writes it on every run and registers it in `manifest.json`.
- **2** — Existing files compacted in place: `tataris.json` 327.9 → 233.7 KB, `zoboHorde.json` 71.3 → 47.9 KB (−131 KB off the codex's first load, −295 KB off the roster's old fetch). Writers updated in `wiki_gg_scraper.js` (per-file `PRETTY` set) and `tatary_enrichment.js`, so `npm run enrich` can no longer re-pretty-print the file.
- **3** — A/B tested: orders captured for all 9 sort keys (65 cards each, 585 entries) with the new code, then `git stash` restored the old `RosterPage.tsx` and the same 9 orders were captured — **0 mismatches**. `tsc` clean.
- **4** — Cross-checked against an independent recomputation from the raw JSON: line count (72), null-rarity set (6), wiki-only set (7), rarity counts (54 Rainbow / 10 Purple / 2 Red / 6 null), and search hits for `volt`, `rock`, `chain`, `zzzz` all match the rendered DOM exactly. Codex still fetches the four full data files (it needs them); only the roster switched to the index.
- **8** — Instrumented `Storage.prototype.setItem`: after an edit there are **0 writes at 100 ms and 250 ms, exactly 1 write by 400 ms**; a second burst inside the window coalesces into one write. Flushes on `pagehide` and on unmount (switching to the codex view) so a pending save can't be dropped.

Remaining `todo` items below are unchanged.

## Fast wins

Implemented — see **Batch 1** above (items 1, 2, 3, 4, 8).

## Batch 2 (structural) — implemented & verified

| # | Change | Where | Status |
|---|--------|-------|--------|
| 5 | Split `RosterPage.tsx` (1,394 lines): components → `src/roster/components/` (8 files), pure star/stat math → `src/roster/stats.ts`, persistence → `src/roster/persistence.ts` — page shell now 367 lines | `src/RosterPage.tsx` | done |
| 13 | `React.memo` for `PetCard` + stable callbacks (new reducer action `{ type: 'update', updater }` so handlers no longer depend on `current`); `artEpoch` prop busts the memo when async wiki art lands | `src/roster/components/PetCard.tsx`, `persistence.ts` | done |
| 14 | Remove repeated per-render work: `stageStyles` precompute (kills the double `getQuality` per evolution button and per-render `readableInk`), cached `getStageName`/`readableInk`, `trialLines()` WeakMap + shared `NO_TRIALS` | `src/roster/stats.ts`, `PetCard.tsx` | done |

Verification notes for batch 2:

- **5** — Transcription checked mechanically: a script extracted all 98 top-level declarations from the pre-refactor `RosterPage.tsx` (via `git show HEAD:`) and compared them line-by-line against the new modules — 78 byte-identical; every one of the 20 differences reviewed and explained (added `export`s, the intentional item-13/14 changes, or console-encoding artifacts of the extraction itself). `tsc -b` clean, `oxlint` clean (only the pre-existing `wiki_gg_scraper.js:281` warning). One behavior note: `handleShiny`'s shiny-unavailable guard moved *inside* the reducer updater so it survives the stable-callback refactor — same outcome, now race-proof.
- **13/14** — A/B DOM-signature test: identical 36-step scenario (9 sorts, 6 filters, own/evo/grade/shiny/star-picker/trials-tip/cost-modal/trainer/badge/resort/undo/redo/bulk) run against the pre-refactor baseline and the refactored build on port 5199 — **36/36 steps byte-identical, 0 mismatches** (2,420,424 chars both runs, 0 console errors). Test artifacts (`__ab_*`, `coc_roster*`) removed afterwards.

## Structural

Implemented — see **Batch 2** above (items 5, 13, 14).

## Batch 3 (dedup) — implemented & verified

| # | Change | Where | Status |
|---|--------|-------|--------|
| 6 | Shared pet-helper module: new `src/petHelpers.ts` (356 lines, moved out of `roster/stats.ts`) holds the pet read-side both features need; `roster/stats.ts` shrinks to roster-only (48 lines: `SORT_KEYS`, `SortKey`, `RosterState`, `Snapshot`, `sortIds`); `cardSampleModel.ts` 578 → 327 lines — lab-specific only (rarity-divergent `getQuality` now a shared `getQuality(stage, pet, colorOverride?)` parameter, stat ceiling, view model, scenario seeds) + a re-export facade so its 3 consumers are untouched; `NO_SHINY_*` literals → `shared/shiny.json` (`resolveJsonModule`) read by petHelpers and `tatary_xyz_scraper.js` | `src/*`, `shared/shiny.json`, `scraper/*` | done |
| 19 | Consolidate duplicates: `isRecord` now exported from `src/domain.ts` (persistence, RosterPage, wikiCodex import it); `wikiImageUrl` lives only in `src/wikiArt.ts` (copy + `IMAGE_ROOT` deleted from `wikiCodex.ts`; `CodexPage.tsx` imports from `./wikiArt`) | `src/*` | done |

Verification notes for batch 3:

- **6** — Consumers' import lists were enumerated exhaustively and the facade re-exports exactly those symbols; dead sample-only exports (`getUnit`, `UNIT_BY_ID`, `SPECIAL_START`, `CAREER_LABELS`, `POSITION_LABELS`, mirrored helpers) verified unreferenced and dropped. `tsc -b` clean, oxlint clean (only the pre-existing `wiki_gg_scraper.js:281` warning), vite build passes. Scraper loads the shared JSON: `node scraper/tatary_xyz_scraper.js --help` runs clean.
- **6/19 A/B** — Roster: identical 36-step scenario, **36/36 steps byte-identical** (2,420,424 chars both, 0 errors). Samples: identical 6-step script (compare default + 4 scenarios + density), **6/6 steps byte-identical** (747,939 chars both, 0 errors). The first samples baseline started in an anomalous density mode, so it was redone controlled: baseline captured under `git stash` (HEAD code), working tree restored, same script re-run. Codex smoke: renders with 388 wiki images through the shared `wikiImageUrl`. All `__ab_*` test keys removed afterwards.
- Note: batch-2's `roster/stats.ts` body now lives in `src/petHelpers.ts` (item 14's caches travel with it), and `roster/persistence.ts` / `RosterPage.tsx` imports are split across the two modules.

## Deduplication

Implemented — see **Batch 3** above (items 6, 19).

## Batch 4 (scraper) — implemented & verified

| # | Change | Where | Status |
|---|--------|-------|--------|
| 7 | Worker pool for tatary image downloads (was serial `await` in a loop); new `--image-concurrency` flag (default 4), results pre-allocated by sorted index so the manifest stays byte-deterministic | `tatary_xyz_scraper.js` | done |
| 9 | Wikitext parsers extracted verbatim into `scraper/lib/wikitext.js` (12 pure functions); 430-line `main()` split into named phases (`fetchIndexPages` → `fetchRosterDetails` → `resolveArtwork` → `buildEvolutionLines` → `buildRosterRows` → `groupImageJobs` → `downloadImages` → `writeOutputs`), log order unchanged | `wiki_gg_scraper.js` | done |
| 10 | `node:test` coverage for the parsers + CLI spec (33 tests), `npm test` / `npm run check` scripts, `.github/workflows/ci.yml` (tsc + oxlint + tests + build), `.githooks/pre-commit` (enable: `git config core.hooksPath .githooks`) | new `scraper/test/*`, `package.json` | done |
| 12 | Shared `scraper/lib/http.js` (`fetchWithRetry`: backoff, Retry-After, per-attempt gate hook, `handleStatus`) + `scraper/lib/cli.js` (`log`/`warn`/`sleep`, spec-based `parseCliArgs` replacing the three divergent `parseArgs`); retry policy unified to transport + 429 + 5xx (tatary used to retry every status incl. permanent 403s); `--delay 0` now clamps to the documented floor instead of silently becoming the default | `scraper/lib/*`, all 4 scrapers | done |
| 15 | Async I/O in the wiki image pool: `stat` (replaces `existsSync`/`statSync`), `writeFile`, `mkdir` — the pool no longer stalls the event loop it runs on | `wiki_gg_scraper.js` | done |
| 16 | File-write cleanups: `redirects.json` written once per run (dirty flag + `flushRedirectMap()` after the last wikitext fetch), `mkdirSync` once per run (`ensureCacheDir`), O(n²) `batch.filter` → one-pass target→titles grouping in `fetchWikitext`, image sniffing → strict `content-type: image/*` checked *before* reading the body. The double `JSON.stringify` sub-item was already fixed in batch 1 (item 2) | `wiki_gg_scraper.js` | done |

Verification notes for batch 4:

- **Wiki A/B** — full run under `git stash` (old code) vs restored working tree (new code), `--skip-images --delay 250 --out <tmp>`: all 6 outputs (`reference`, `artIndex`, `tataris`, `zoboHorde`, `feedingUpgrades`, `manifest`) **byte-identical** after normalising `scrapedAt` and the output directory; stdout **identical line-for-line** (modulo timestamps/paths). One real bug caught by this run: `apiGate` is a pacing primitive (`await gate()`), not a queue-with-task — first new-code run threw inside `resolveFiles`; fixed before proceeding.
- **Tatary A/B** — `--skip-images` old vs new: `manifest.json` **byte-identical** (75,710 chars after `scrapedAt`), stdout **identical** (37 lines). Manifest restored via `git checkout` afterwards.
- **Pool download** — deleted `Attack.png`/`Tank.png`/`Water.png`, ran the new code without `--skip-images`: `downloaded=3 cached=575 failed=0`, content-type gate exercised, files **byte-identical to git HEAD** on re-run. An intermediate run returned same-dimension, differently-encoded variants (extra `pHYs`, recompressed) for the same URL — diagnosed chunk-by-chunk (identical pixels, no concatenation, live fetch matches HEAD) as a transient upstream/CDN re-encode, not a code difference; reproduced HEAD bytes on the next run.
- `npm run check` green (tsc clean, oxlint clean apart from the pre-existing `no-control-regex` warning now at `wiki_gg_scraper.js:240`, 33/33 tests), `npm run build` green, `--help` smoke on both scrapers green. `git status` after all runs: only the intended edits + new files, no stray cache writes. Committed as `228634b`; the pre-commit hook ran `npm run check` live during the commit (after fixing its missing `#!/bin/sh` shebang and setting the index mode to 100755 with `git update-index --chmod=+x`).
- Deliberate behaviour changes (all intentional, from the divergence findings): tatary no longer retries non-retriable statuses (403/404 asked five times); tatary gains `--image-concurrency`; `scrape_all.js` log gained one `[INFO]` space (now uniform); `--delay 0` clamps to the floor (250) instead of silently becoming 1000; image errors now say what content-type arrived instead of "non-image payload".

## Batch 5 (cleanup tail) — implemented & verified

| # | Change | Where | Status |
|---|--------|-------|--------|
| 17 | `cards.html` added to `build.rollupOptions.input` — `vite build` now emits `dist/cards.html` alongside `index.html` (was 404 after build) | `vite.config.ts` | done |
| 18 | Codex nits: `idBase` from grid index → `useId()` (stable, collision-proof ids; the `index` prop is gone); `StageNode.broken` → `failedSrc`, so a re-scraped portrait clears a stale failure instead of hiding behind it; tab panels no longer double-hide — content always renders and `hidden` does the hiding | `CodexPage.tsx` | done |
| 20 | Stale docs & CLI edges: tatary HELP usage now `node scraper/tatary_xyz_scraper.js`; `RARITY_ORDER` hoisted to the mapping tables; inline `await import('node:fs/promises')` → top-level `writeFile` import. The `wikiArt.ts` "96 KB" comment and the `--delay 0` idiom were already fixed in batches 1/4 | `tatary_xyz_scraper.js`, `tatary_enrichment.js` | done |
| 21 | Micro: `Intl.NumberFormat` built once at module level (`formatCost`), `STAR_COST` prefix sums make `duplicateCost` O(1), `STAR_FAMILIES` hoisted out of the `StarPicker` render | `src/petHelpers.ts`, `StarPicker.tsx` | done |

Verification notes for batch 5:

- `npm run check` green (tsc clean, oxlint unchanged, 33/33 tests); `npm run build` green and now emits `dist/cards.html` (7.04 kB) + `dist/assets/cards-*.js` (multi-entry confirmed on the console).
- Browser (dev server 5199): codex renders 72 cards; a card's dossier shows all three panels mounted with exactly one visible per tab (`hidden` toggling and `aria-selected` correct — verified switching Stage → Horde → Food Track on **Ashlarva**, `:r*:`-style `useId` ids); `StageNode` images load with 0 broken; roster star picker opens the five families from the hoisted constant (24 options) with cost hints intact; `cards.html` renders 248 tataris across 67 groups with summary + `scrapedAt` populated. No console errors at any step.
- Remaining tail: 22 (README, do last). Item 11 was resolved by user decision in batch 6 — the sort UI was removed, not auto-wired.

## Batch 6 (sort UI removal) — implemented per user decision

| # | Change | Where | Status |
|---|--------|-------|--------|
| 11 | Sorting UX removed on request: Sort dropdown + "Resort" button deleted from the roster toolbar; `order` frozen at the first-load sort (one-time `useState` init, setter dropped). The sort machinery is kept intact for a later rebuild: `sortIds` (now `roster/stats.ts`), `SORT_KEYS`, `isSortKey`, and `ui.srt` in the persisted UI (`persistence.ts` still validates/saves it, so exported/imported rosters are unchanged) | `RosterPage.tsx` | done |

Verification notes for batch 6:

- `npm run check` green (tsc clean, oxlint unchanged — only the pre-existing `wiki_gg_scraper.js:240` warning, 33/33 tests); `npm run build` green.
- Browser (dev server 5199): toolbar now shows Undo / Redo / Cost reference only — no "Resort" button, no Sort `<select>` (verified in the DOM); the grid keeps rendering (65 cards under the saved element filter) in the same first-load order as before. No load errors.
- Deliberate: the grid order no longer changes at all while editing (it already didn't, except via the button); undo/import/adopt no longer have a stale-order mismatch *because there is no re-sort to be stale against*. `ui.srt` stays in saved exports so the rebuild can read the last key.

## Batch 7 (README architecture) — implemented

| # | Change | Where | Status |
|---|--------|-------|--------|
| 22 | Replaced the stock Vite-template README with project documentation: the four views (`/`, `?view=codex`, `?view=samples`, `/cards.html`), quick start (incl. `--port 5199` localStorage note), the scrape pipeline (wiki master → game tables → enrichment, flags), and an **Architecture** section covering the data split (`tatary-cache` baked at build via `__GAME_DATA__` vs `wiki-cache` fetched at runtime, `artIndex.json`, `shared/shiny.json`), the `--out`/manifest contract (roster-naming `--out`, siblings beside it, manifest provenance + determinism), `cards.html` (build-free, dual base paths, multi-entry build), the frontend module layout, and the quality gates (check/test/build, pre-commit hook, CI) | `README.md` | done |

Verification notes for batch 7:

- Every factual claim checked against the code before writing: `DATA` is `payload.units` (65 pets in the current tables — the roster editor runs on the game roster, not the wiki's 248), the codex is `/?view=codex` and the samples lab `/?view=samples` (App.tsx `viewFromLocation`), the wiki scraper's `writeOutputs` writes all five data files beside the `--out` file and registers them (incl. `artIndex`) in `manifest.data`, `--delay` floor is 250 ms on the wiki side (`min: 250`) with `TATARY_SCRAPER_DELAY` as the game-side fallback, and both manifests are byte-deterministic.
- Markdown lint is not part of the toolchain (`npm run check` doesn't cover it), so the README was reviewed by eye; no check/build impact (docs only).

## Cleanup tail (remaining)

None — the review list is complete. `REVIEW-findings.md` stays untracked.

## Parked (only if profiling justifies it)

- `encodeState` builds its binary string one byte at a time (`roster/persistence.ts:160`).
- `__GAME_DATA__` inlines ~570 KB of JSON parsed at startup regardless of view (`vite.config.ts`); the config comment deliberately rejects trading it for a request.

## Notes / facts discovered

- Data file sizes: `tataris.json` 327.9 KB pretty → 233.7 KB compact; `zoboHorde.json` 71.3 → 47.9; `feedingUpgrades.json` 19.6 → 14.5; `reference.json` 4.6 → 3.4. `units.json` is 1,574 KB pretty → ~570 KB compact (already re-stringified compact by `vite`'s `define`).
- `public/wiki-cache/**` and `public/tatary-cache/**` are git-tracked, so compact JSON trades diff readability for payload size.
- `wikiArt.ts:11` claims `tataris.json` is 96 KB — it is 327.9 KB (stale).
- `tatary_xyz_scraper.js:43` help text says `node scripts/scraper-tatary.js` — the real path is `scraper/tatary_xyz_scraper.js`.
