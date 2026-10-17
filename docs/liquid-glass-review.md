# Liquid Glass UI — Review & Status Tracker

A tracked list of findings and enhancement opportunities for the app's liquid-glass
design language (the shared header + roster chrome), covering both the light and
dark sheets.

- **Reviewed at:** `f8d66be` on `star-menu-redesign` (working tree clean)
- **Last pass:** 2026-10-17 — contrast pass (GL-01, GL-02, GL-03) implemented in
  `index.css` + `RosterPage.css`; verified on the live DOM, uncommitted.
- **Scope:** `src/index.css` (tokens + aurora), `src/RosterPage.css` (glass chrome),
  plus `src/CodexPage.css`, `src/TrialsPage.css`, `src/cardSamples/CardSamplesPage.css`
- **Card designs:** deliberately out of scope — see [Card designs](#card-designs).

## Status legend

| Status | Meaning |
| --- | --- |
| `Open` | Confirmed, not started. |
| `In progress` | Being worked on. |
| `Done` | Implemented and verified. |
| `Deferred` | Accepted, deliberately postponed. |
| `Won't fix` | Reviewed and rejected. |

Severity is user impact (not effort). Effort is a rough size: **S** ≈ minutes,
**M** ≈ an hour or two, **L** ≈ a dedicated pass.

## Summary

| ID | Area | Finding | Severity | Effort | Status |
| --- | --- | --- | --- | --- | --- |
| GL-01 | Legibility | Light-theme muted/tertiary ink fails WCAG AA (2.4–3.7:1) | High | S | Done |
| GL-02 | Legibility | Dark theme: `.field` / `.select-field` / `.bulk-field` labels keep the light literal → 3.59:1 | High | S | Done |
| GL-03 | Legibility | Ink family hardcoded as near-duplicate greys instead of tokens | Medium | M | Done |
| GL-04 | Consistency | ~13 blur/saturate combinations vs the documented "one pair" | Medium | M | Open |
| GL-05 | Consistency | Codex / Trials / card lab use `blur()` with no `saturate()` | Low | S | Open |
| GL-06 | Robustness | No `@supports` fallback when `backdrop-filter` is unavailable | Medium | S | Open |
| GL-07 | Robustness | `prefers-reduced-transparency` ignored | Medium | S | Open |
| GL-08 | Robustness | `prefers-contrast` ignored | Low | S | Open |
| GL-09 | Fidelity | Edge light is top-only; panes have no lower rim | Medium | S | Open |
| GL-10 | Fidelity | No grain/frost texture; frosted panes read as flat | Medium | S | Open |
| GL-11 | Fidelity | No `:active` (pressed) state anywhere in the app | Medium | S | Open |
| GL-12 | Fidelity | No pointer-tracked specular highlight (the "lens" cue) | Medium | M | Open |
| GL-13 | Fidelity | No chromatic dispersion at the rim | Low | S | Open |
| GL-14 | Fidelity | (Stretch) SVG displacement refraction | Low | L | Open |
| GL-15 | Bug | `.route-fallback` ("Loading…") has no CSS at all | Medium | S | Open |
| GL-16 | Bug | `.modal-backdrop` has no dark override; navy scrim in light | Low | S | Open |
| GL-17 | Bug | `.star-modal`'s blur sits behind a 84–94% opaque sheet → inert | Low | S | Open |
| GL-18 | Perf | Nested `backdrop-filter` 3 deep; 67 cards re-blur a frosted parent | Medium | M | Open |
| GL-19 | Polish | Scrollbars unstyled on `.star-menu` / `.star-modal` / `.sidebar` | Low | S | Open |
| GL-20 | A11y | Focus ring misses links (`a`); faint on dark glass | Medium | S | Open |
| GL-21 | Polish | Ad-hoc radius scale (15 distinct values, no tokens) | Low | M | Open |
| GL-22 | Docs | Comment drift above `.has-data-error`; "65" vs 67 cards | Low | S | Open |
| GL-23 | Polish | `background-attachment: fixed` ignored by iOS Safari | Low | S | Open |
| GL-24 | Info | Card lab vs roster: two card material languages coexist | Info | — | Open |

---

## A. Legibility and contrast

### GL-01 — Light-theme muted ink fails WCAG AA `High` `S`

The light sheet's tertiary ink family fails AA (4.5:1), worst where the type is
smallest and uppercase. Contrast was computed from each element's exact computed
`color` composited against the glass surface over the aurora (see
[Verification method](#verification-method)).

| Element | Colour | Size | Contrast on glass |
| --- | --- | --- | --- |
| `.site-nav-label` | `#8a93a8` | 10.9px | 2.37 – 3.03 |
| `.section-count` | `#8993a9` | 12.2px | 2.37 – 3.04 |
| `.bulk-field` label (Star / Evolution / Grade) | `#7c879e` | 11.8px | 2.78 – 3.55 |
| `.icon-select-caption` (Element) | `#7c879e` | 11.2px | 2.78 – 3.55 |
| `.section-description` | `#7b869d` | — | 2.82 – 3.60 |
| `.local-label` (Local roster) | `#7a859d` | 11.8px | 2.85 – 3.65 |
| `.eyebrow` (Collection) | `#5c6a8c` | 11.8px | 4.15 (marginal) |
| `.theme-toggle` | `#5263b7` | 12.5px | 4.22 (marginal) |

Several are below even the 3:1 non-text floor. The dark sheet is fine
(4.32 – 5.91) because it has a proper override block.

**Fix:** darken the light muted family to ≈`#66718a` (≥4.5:1) and read it from a
token. Locations: `RosterPage.css:136` (`.site-nav-label`), `:178`
(`.local-label`), `:248` (`.eyebrow`), `:479` (`.section-count`), `:490`
(`.section-description`), `:524` (`.field` / `.select-field` / `.bulk-field`).

**Resolved** (2026-10-17) — all of the above now read one `--ink-muted` token
(light `#58627b`). Re-measured on the live DOM: **5.74:1** on the panel and
**4.69:1** against even the most-tinted aurora corner — up from 2.95–3.55. The
`.eyebrow` and `.cost-table` entries that were merely marginal also moved onto the
token, so the whole family clears AA.

### GL-02 — Dark theme misses three label overrides `High` `S`

`.field`, `.select-field` and `.bulk-field` labels use the light literal
`#7c879e` (`RosterPage.css:524`) and are **not** re-inked by the dark block, so
they land at **3.59:1** in dark mode — dimmer than every other muted label
(4.32 – 5.91).

The adjacent IconSelect tokens show the intended pattern and *were* handled
correctly — `--is-muted: #7c879e` at `:857` is overridden to `#8995b1` at
`:871`. The `.field` family was simply missed. (In the dark sweep, the only
sub-4.5 label was `label.bulk-field` at 3.59.)

**Fix:** add `.field`, `.select-field`, `.bulk-field` to the dark override block
(with `#8995b1`), or tokenise per GL-03.

**Resolved** (2026-10-17) — the `.field` family now inherits `--ink-muted`, so the
dark sheet re-inks it automatically (~5.0:1) and the missed override no longer
exists. The now-redundant `--is-muted` override on `.roster-toolbar .select-field`
was dropped at the same time.

### GL-03 — Ink family is hardcoded, not tokenised `Medium` `M`

`index.css` defines `--page-muted` (light `#7b869d` at `:92`, dark `#8995b1` at
`:119`) but components hardcode their own near-identical greys: `#7a859d`,
`#7b869d`, `#7c879e`, `#8993a9`, `#8a93a8`, `#96a3be`. This duplication is the
root cause of GL-01 and GL-02 — each component needed its own dark override and
three were missed.

**Fix:** introduce `--ink-muted` / `--ink-faint` (theme-swapped) and replace the
literals. Deletes a large fraction of the dark override block.

**Resolved** (2026-10-17) — a single `--ink-muted` token was added (light `#58627b`,
dark `#8995b1`); 12 rules switched from literals to it, and 5 dark overrides were
deleted (`.site-nav-label`, the six-selector secondary-label list collapsed to just
`.pet-card-footer`, and the toolbar `--is-muted`). A second `--ink-faint` tier was
dropped: the 4.5:1 floor leaves too little room for a perceptible ramp, so hierarchy
now rests on size / weight / case instead — which is the more robust pattern anyway.
Three things were deliberately left: `--page-muted` (the card lab reads it as opaque
chrome), the card internals `.pet-role-row` / `.pet-card-footer` (still ≥5:1), and the
`.cost-table` dark override `#96a3be` (a shade lighter than the token for the modal).

---

## B. Material consistency

### GL-04 — ~13 blur/saturation combinations `Medium` `M`

`index.css:100` documents `--glass-backdrop` as *"one blur + saturation pair, so
the frosted look is identical wherever it is applied."* In practice:

- Token: `blur(18px) saturate(175%)` light / `blur(18px) saturate(160%)` dark.
- Literal overrides in `RosterPage.css`: nav `12/160` (`:126`), chrome buttons
  `12/155` (`:200`), banner `14/175` (`:299`), sidebar `30/185` (`:357`), inputs
  `8/140` (`:544`), pet-card `16/180` (`:936`), modal backdrop `22/140`
  (`:1817`), star-modal `28/180` (`:1830`).

**Fix:** a small scale — `--glass-blur-sm|md|lg|xl` plus a single
`--glass-saturate` — and map each surface to a step. The token is then the only
source of truth, as its comment already claims.

### GL-05 — Unsaturated blur in three sheets `Low` `S`

`CodexPage.css:220`, `TrialsPage.css:149` and `CardSamplesPage.css:118 / 1529 /
1563 / 1613` use `blur()` with **no `saturate()`**, so those panes are visibly
less chromatic than the roster's for the same intended material.

**Fix:** fold into the GL-04 scale (or at least add a shared saturate value).

---

## C. Robustness

### GL-06 — No `@supports` fallback `Medium` `S`

Zero `@supports` blocks app-wide. Where `backdrop-filter` is unavailable the
panes fall back to 44–68% opaque fills over a *colourful* aurora, so body text
sits on a tinted wash.

**Fix:** `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`
raising the surface/sheet/fill alphas to near-opaque.

### GL-07 — `prefers-reduced-transparency` ignored `Medium` `S`

The OS "Reduce transparency" / "Transparency effects" setting is not honoured
(0 matches).

**Fix:** under `@media (prefers-reduced-transparency: reduce)`, drop the blurs
and use opaque fills.

### GL-08 — `prefers-contrast` ignored `Low` `S`

**Fix:** optionally strengthen `--glass-line` / `--glass-rim` under
`@media (prefers-contrast: more)`.

---

## D. Fidelity — making it read as glass

### GL-09 — Edge light is top-only `Medium` `S`

Every pane uses only `inset 0 1px 0 var(--glass-rim)`. Real glass also shows a
bright *lower* edge where light exits.

**Fix:** add a low-alpha `inset 0 -1px 0` (and faint left/right) to give panes
thickness.

### GL-10 — No grain/frost texture `Medium` `S`

Frosted panes have smooth gradients only, which reads as flat plastic. A 2–4%
tiled noise/data-URI overlay is the classic fix.

**Fix:** add a theme-aware grain layer; keep it subtle and cheap.

### GL-11 — No pressed state anywhere `Medium` `S`

Verified: **not a single `:active` rule in any stylesheet.** Buttons lift on
hover but never compress, so the material never feels like glass under a press.

**Fix:** `:active { transform: translateY(1px) scale(.985) }` plus a deepened
inner shadow on the chrome buttons.

### GL-12 — No pointer-tracked specular highlight `Medium` `M`

The highest-impact "liquid" cue: a radial highlight whose origin follows the
cursor via one CSS custom property updated on `pointermove` (rAF-throttled),
making panes behave like a lens.

**Fix:** add to the primary panels/chrome; gate behind
`prefers-reduced-motion` (there is already a block at `index.css:207`).

### GL-13 — No chromatic dispersion at the rim `Low` `S`

A 1–2px blue/warm hue shift on the edge reads strongly as refraction.

### GL-14 — (Stretch) SVG displacement refraction `Low` `L`

`backdrop-filter: url(#filter)` with `feDisplacementMap` is the "real" lensing
version. Expensive and fiddly; keep as an experiment, not a default.

---

## E. Bugs and polish

### GL-15 — `.route-fallback` has no CSS `Medium` `S`

`App.tsx:73` renders `<div className="route-fallback" role="status">Loading…</div>`
and **no stylesheet matches it** (verified by grep — the only hit is `App.tsx`).
The first thing a cold load paints is an unstyled text node, unlike every other
surface.

**Fix:** style it as a glass pane / centered status.

### GL-16 — `.modal-backdrop` has no dark override `Low` `S`

`RosterPage.css:1809` is the only rule for it. The navy
`rgba(22, 29, 48, .42)` scrim is used in *both* themes; in light mode it
composites to ≈`#969aa6`, a heavy grey that fights the light theme's luminous
promise.

**Fix:** provide a light-theme scrim (lighter/cooler) and keep the navy for dark.

### GL-17 — The star modal's blur is inert `Low` `S`

`--glass-sheet` is 84–94% opaque and the backdrop behind it is *already* blurred
22px (`:1817`), so `.star-modal`'s `blur(28px)` (`:1830`) sits behind a
near-opaque layer at effectively no visible benefit.

**Fix:** drop the inner blur (or thin the sheet so it actually shows).

### GL-18 — Nested `backdrop-filter`, and 67 cards `Medium` `M`

`.star-menu` (`:1417`) → `.pet-card` (`:936`) → `.panel` (`:499`) are all backdrop
roots, so an inner blur re-blurs an already-flat frosted parent: the visible
depth comes from the gradients, rims and shadows, not the nested blur. With
**67 cards** rendered, that is 67 extra blur passes for little gain.

**Fix:** test removing `backdrop-filter` from `.pet-card` (the card's glass reads
from its `--qc-*` gradients/rims/shadows). Confirm visually — see the note in
[Verification method](#verification-method).

### GL-19 — Scrollbars unstyled on roster surfaces `Low` `S`

`.star-menu:1410`, `.star-modal:1825` and `.sidebar:376` scroll with **no
scrollbar styling**, so dark glass sheets get default chunky light Windows bars.
The Codex already does `scrollbar-width: thin` (`CodexPage.css:687 / 892`).

**Fix:** apply the same thin/themed treatment to the roster's scrolling surfaces.

### GL-20 — Focus ring misses links `Medium` `S`

The shared rule at `RosterPage.css:34-40` covers `button`, `input`, `select`,
`summary` but **not `a`**, so `.site-nav-link` and `.brand` fall back to the UA
ring — inconsistent with the rest. The ring colour `rgba(89, 117, 255, .32)`
(`:38`) is also faint on dark glass.

**Fix:** add `a:focus-visible` and use a two-tone / higher-alpha ring.

### GL-21 — Ad-hoc radius scale `Low` `M`

15 distinct radii with no tokens: 5, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 23,
24, 28, 999. The near-neighbours (14/15/16/18/20) could collapse.

**Fix:** a 4-step radius scale (`sm`/`md`/`lg`/`pill`).

### GL-22 — Comment drift `Low` `S`

- `RosterPage.css:1015-1017`: the comment describes Glitter artwork / an animated
  rim (that is `.pet-card.is-shiny::after` at `:984`) but sits above the unrelated
  `.pet-card.has-data-error` rule (`:1018`).
- "The grid holds 65 of these" — the grid renders **67** `.pet-card` elements.

### GL-23 — `background-attachment: fixed` on `body` `Low` `S`

`index.css:162 / 172`. Ignored by iOS Safari, where the aurora would scroll and
move the "spotlight" behind the glass. Fine for a local desktop tool; a fixed
pseudo-element is the portable equivalent.

---

## Card designs

Not in scope — the request was to leave them untouched. One observation only:

### GL-24 — Two card material languages coexist `Info`

The 13 card-lab designs are deliberately **opaque plates**, while the roster card
is a **glass pane** (`--qc-*`). With the roster's Card picker, both can appear on
the same page. That is a coherent "cards in a glass case" look, but it is a
deliberate split worth being aware of. If unity is ever wanted, the lab's Prism
design is the closest to liquid glass.

---

## Suggested work order

1. **Contrast pass** — GL-01, GL-02, and (ideally) GL-03. Real accessibility,
   small diff. ✅ **Done** (2026-10-17).
2. **Visible quick wins** — GL-15 (unstyled fallback), GL-19 (scrollbars),
   GL-20 (focus ring).
3. **Token pass** — GL-04, GL-05. Makes everything after it easier.
4. **Robustness** — GL-06, GL-07, (GL-08).
5. **Fidelity** — GL-09, GL-10, GL-11 (highest polish-per-line), then GL-12 /
   GL-13 as a deliberate design step.
6. **Cleanups** — GL-16, GL-17, GL-18, GL-21, GL-22, GL-23.

## Verification method

- Ink colours and surface tokens were read from the **live DOM** with
  `getComputedStyle` (elements' own `color`, and the `--glass-*` / `--page-*`
  custom properties).
- Contrast ratios composite the glass fill over the aurora gradient (the aurora
  is a static stack of radial gradients over a linear base), then apply the WCAG
  relative-luminance formula. The **inputs are exact**; the results are accurate
  estimates of the real render, not pixel samples (screenshots need a visible
  desktop window, unavailable here).
- Light backdrop extremes used: aurora `#f6f8fd` (base) and `#bec9fb` (strongest
  corner tint), with `--glass-surface` alpha 0.44–0.74.
- Dark backdrop extremes used: aurora `#10141f` (base) and `#273162` (glow peak),
  with `--glass-surface` `rgba(38,47,73,.68)` → `rgba(22,28,46,.46)`.
- GL-17 and GL-18 need a visual check (or a compositor-side trace) before and
  after; the analysis there follows the filter-effects backdrop-root rules, and is
  reasoning rather than a measurement.
