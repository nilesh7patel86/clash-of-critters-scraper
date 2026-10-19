# Liquid Glass UI — Review & Status Tracker

A tracked list of findings and enhancement opportunities for the app's liquid-glass
design language (the shared header + roster chrome), covering both the light and
dark sheets.

- **Reviewed at:** `f8d66be` on `star-menu-redesign` (working tree clean)
- **Last pass:** 2026-10-19 — cleanup pass (GL-16, GL-17, GL-18, GL-21, GL-22,
  GL-23) plus live verification of the already-coded fidelity pair (GL-12,
  GL-13), all in `index.css` + `RosterPage.css`, uncommitted. Earlier passes in
  the tree: the fidelity pass (GL-09–GL-11), the robustness pass (GL-06–GL-08),
  the material token pass (GL-04, GL-05) and the quick-wins pass (GL-15, GL-19,
  GL-20) — all uncommitted — plus the contrast pass (GL-01–GL-03, landed in
  `d404e6b`). Only GL-14 (a stretch experiment the entry itself says should not
  be a default) and GL-24 (info) are left open.
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
| GL-04 | Consistency | ~13 blur/saturate combinations vs the documented "one pair" | Medium | M | Done |
| GL-05 | Consistency | Codex / Trials / card lab use `blur()` with no `saturate()` | Low | S | Done |
| GL-06 | Robustness | No `@supports` fallback when `backdrop-filter` is unavailable | Medium | S | Done |
| GL-07 | Robustness | `prefers-reduced-transparency` ignored | Medium | S | Done |
| GL-08 | Robustness | `prefers-contrast` ignored | Low | S | Done |
| GL-09 | Fidelity | Edge light is top-only; panes have no lower rim | Medium | S | Done |
| GL-10 | Fidelity | No grain/frost texture; frosted panes read as flat | Medium | S | Done |
| GL-11 | Fidelity | No `:active` (pressed) state anywhere in the app | Medium | S | Done |
| GL-12 | Fidelity | No pointer-tracked specular highlight (the "lens" cue) | Medium | M | Done |
| GL-13 | Fidelity | No chromatic dispersion at the rim | Low | S | Done |
| GL-14 | Fidelity | (Stretch) SVG displacement refraction | Low | L | Open |
| GL-15 | Bug | `.route-fallback` ("Loading…") has no CSS at all | Medium | S | Done |
| GL-16 | Bug | `.modal-backdrop` has no dark override; navy scrim in light | Low | S | Done |
| GL-17 | Bug | `.star-modal`'s blur sits behind a 84–94% opaque sheet → inert | Low | S | Done |
| GL-18 | Perf | Nested `backdrop-filter` 3 deep; 67 cards re-blur a frosted parent | Medium | M | Done |
| GL-19 | Polish | Scrollbars unstyled on `.star-menu` / `.star-modal` / `.sidebar` | Low | S | Done |
| GL-20 | A11y | Focus ring misses links (`a`); faint on dark glass | Medium | S | Done |
| GL-21 | Polish | Ad-hoc radius scale (15 distinct values, no tokens) | Low | M | Done |
| GL-22 | Docs | Comment drift above `.has-data-error`; "65" vs 67 cards | Low | S | Done |
| GL-23 | Polish | `background-attachment: fixed` ignored by iOS Safari | Low | S | Done |
| GL-24 | Info | Card lab vs roster: two card material languages coexist | Info | — | Open |
| GL-25 | Legibility | Light sheet reads as white-on-white; panes have no visible contour | High | M | Done |

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

### GL-25 — Light sheet reads as white-on-white; panes have no contour `High` `M`

Reported after the fidelity passes landed: *"in light theme all UI elements look
kinda white, components seem to be blended with whatever is in the background."*
Both symptoms confirmed by decoding a screenshot of the live page:

- **Washed out** — mean luminance **231/255**, with **57.8% of all pixels above
  235** (near-white) and a mean saturation of just **0.068**. Three near-white
  layers stack on the day sheet: page `#eef1f8` → panels (white gradient
  0.44–0.74) → cards (`0.52` white plus another white shoulder gradient), and
  the bevel rims (GL-09) and specular (GL-12) add *more* white on top.
- **No visible edge** — the pane outline `--glass-line` was
  `rgba(255, 255, 255, 0.72)`: a white hairline on a near-white sheet, i.e. no
  contour at all. It outlines ~35 rules, so every component bled into the page.
  (The review's own GL-08 note already conceded "a white hairline is invisible
  there" for the high-contrast case; the base day value had the same problem.)

The base day fills/rim/hairline are **unchanged from the last commit** — the
fidelity passes only added white *on top* of an already white-on-white sheet, so
this is cumulative, not a regression from any one finding.

**The binding constraint** is GL-01's AA fix. The pane face is the *lighter*
surface in the `--ink-muted` comparison, so darkening the field behind it (or
thinning the fill) lowers text contrast. The committed baseline clears AA by
only 0.29 (4.79:1), so there is almost no headroom: measured worst case (the
strongest aurora corner composited under the pane's thinnest stop, per the
GL-01 method) must stay ≥ 4.5:1. A first attempt that deepened the field more
aggressively landed at **4.07:1 — below AA** and was rejected.

**Resolved** (2026-10-19) — four coordinated edits, all on the day sheet:

1. **`--glass-line` → `rgba(118, 134, 172, 0.4)`** — a cool grey in the
   `--glass-edge` family. This is the "no visible edge" fix and it costs no
   contrast (it is a border, not a fill). Dark keeps its own faint white
   override, where white does read; `prefers-contrast` still darkens it further.
2. **Aurora lifted, not deepened** — the blue corner radial is cooler and
   stronger (0.44 over a `#edf0f9` mid stop, up from 0.42 over `#f6f8fd`), and
   `--page-bg` follows the base at `#edf0f9`. Chroma, not darkness, is what
   kills the whiteout, and chroma costs less contrast.
3. **Pane fills cooled a few points off pure white**, with the alpha floors
   raised ~0.04 (`--glass-surface` 0.44 → 0.48 low stop) to pay for the field
   lift. `--glass-specular` eased 0.2 → 0.14 so the cursor glow stops adding a
   white wash over already-white panes.
4. **Cards** — `--qc-surface` cooled to `rgba(248, 250, 255, 0.5)` and
   `--qc-hairline` changed from white to `rgba(128, 142, 176, 0.5)`, so the
   67-card contour (a 32% accent mix over the hairline) has something to sit on.

Contrast re-verified by the GL-01 method: panel face worst case **4.53:1**,
typical **5.18:1**; card face worst case **5.16:1** (strong ink 11.1:1). A
screenshot re-measured after the change: near-white pixels **57.8% → 50.9%**,
mean saturation **0.068 → 0.086**, mean luminance **231 → 227**. The lift is
deliberately modest — the AA floor above is what bounds it, not effort. The
remaining whiteout is the light sheet's inherent character; pushing further
would mean darkening `--ink-muted` (re-opening GL-01) or making the panes
opaque (losing the material).

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

**Resolved** (2026-10-17) — `index.css` now defines a four-step blur ramp plus one
saturation token, and `--glass-backdrop` is composed from them:

| Token | Value | Used by |
| --- | --- | --- |
| `--glass-blur-sm` | 12px | nav pill, chrome buttons, inputs |
| `--glass-blur-md` | 18px | header, panels, banner, pet-card (== `--glass-backdrop`) |
| `--glass-blur-lg` | 24px | modal sheet, modal backdrop |
| `--glass-blur-xl` | 30px | the drawer |
| `--glass-saturate` | 175% light / 160% dark | every surface |

All eight literal overrides were replaced with `blur(var(--glass-blur-*))
saturate(var(--glass-saturate))`, and the default `--glass-backdrop` is now
`blur(var(--glass-blur-md)) saturate(var(--glass-saturate))` — so the token pair
is preserved exactly (`18px` @ `175%` / `160%`) and the dark block only swaps the
one saturation value. Verified live: header `blur(18px) saturate(1.75)` light,
`blur(18px) saturate(1.6)` dark. Distinct blur/saturate pairs across the app drop
from ~13 to 4 ramp steps sharing one saturation.

### GL-05 — Unsaturated blur in three sheets `Low` `S`

`CodexPage.css:220`, `TrialsPage.css:149` and `CardSamplesPage.css:118 / 1529 /
1563 / 1613` use `blur()` with **no `saturate()`**, so those panes are visibly
less chromatic than the roster's for the same intended material.

**Fix:** fold into the GL-04 scale (or at least add a shared saturate value).

**Resolved** (2026-10-17) — the three page-level control bars (`.cx-controls`,
`.tr-controls`, `.cs-controls`) now read `var(--glass-backdrop)`, so they pick up
the default blur + saturate pair. The `.s-prism` card internals — the one glass
card-lab design — keep their own small blurs (`10px` / `8px`) but now append
`saturate(var(--glass-saturate))`, giving them the same chromatic lift as the
roster without touching their layout, colour or type. (Card designs remain
otherwise out of scope; the decorative `filter: blur()` glows in the card lab are
not `backdrop-filter` frosting and are untouched.)

---

## C. Robustness

### GL-06 — No `@supports` fallback `Medium` `S`

Zero `@supports` blocks app-wide. Where `backdrop-filter` is unavailable the
panes fall back to 44–68% opaque fills over a *colourful* aurora, so body text
sits on a tinted wash.

**Fix:** `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`
raising the surface/sheet/fill alphas to near-opaque.

**Resolved** (2026-10-17) — `index.css` gains that exact `@supports not` block. It
re-points `--glass-surface` / `--glass-bar` / `--glass-sheet` / `--glass-fill` /
`--glass-fill-hover` to near-opaque values for the light sheet, with a mirrored
`:root[data-theme='dark']` set inside the same block. Every pane that reads the
tokens then sits on a ~95–99% fill instead of the 44–68% wash. (Sheet-local panel
tokens — Codex/Trials `--cx-panel`/`--tr-panel` — are already 0.78–0.86 opaque
and were left; the card-lab `--s-glass` internals follow GL-24's card-design
scope.)

### GL-07 — `prefers-reduced-transparency` ignored `Medium` `S`

The OS "Reduce transparency" / "Transparency effects" setting is not honoured
(0 matches).

**Fix:** under `@media (prefers-reduced-transparency: reduce)`, drop the blurs
and use opaque fills.

**Resolved** (2026-10-17) — the same near-opaque token set is applied under
`@media (prefers-reduced-transparency: reduce)`, and the frost is removed twice
over: `--glass-backdrop` becomes `none` (for token readers) while the blur ramp
collapses to `0px` and `--glass-saturate` to `100%` (for the rules that compose
`blur(var(--glass-blur-*))` directly), so every surface flattens. Verified by
forcing the reduced-transparency token values on the live DOM: header and panels
compute `backdrop-filter: none`, the nav pill and inputs `blur(0px) saturate(1)`,
and fills resolve to ≥0.94 alpha.

### GL-08 — `prefers-contrast` ignored `Low` `S`

**Fix:** optionally strengthen `--glass-line` / `--glass-rim` under
`@media (prefers-contrast: more)`.

**Resolved** (2026-10-17) — `@media (prefers-contrast: more)` now darkens
`--glass-line` / `--glass-edge` on the light sheet (a white hairline is invisible
there) and brightens them on the dark sheet, with `--glass-rim` pushed to full
strength. Scoped to the outlines, as suggested — text ink is already AA.

---

## D. Fidelity — making it read as glass

### GL-09 — Edge light is top-only `Medium` `S`

Every pane uses only `inset 0 1px 0 var(--glass-rim)`. Real glass also shows a
bright *lower* edge where light exits.

**Fix:** add a low-alpha `inset 0 -1px 0` (and faint left/right) to give panes
thickness.

**Resolved** (2026-10-17) — every pane/control that carried the lone top rim now
drops in a single `--glass-bevel` token: `inset 0 1px 0 var(--glass-rim)` plus a
low-alpha bottom catch (`--glass-rim-low`) and faint side catches
(`--glass-rim-side`). 33 rules in `RosterPage.css` switched to the token, so the
whole edge stack is defined once per theme (light `0.95 / 0.38 / 0.22`, dark
`0.14 / 0.07 / 0.045`). Verified live: the header computes all four edges (top,
bottom, left, right). The `.pet-card` pane already pools light along its lower
edge (`inset 0 -28px 40px …`), so it was left as-is.

### GL-10 — No grain/frost texture `Medium` `S`

Frosted panes have smooth gradients only, which reads as flat plastic. A 2–4%
tiled noise/data-URI overlay is the classic fix.

**Fix:** add a theme-aware grain layer; keep it subtle and cheap.

**Resolved** (2026-10-17) — `--glass-grain` is a 128px tile of desaturated
fractal noise (`feTurbulence` + a desaturating `feColorMatrix` whose alpha row is
pinned to `1`, so the tile's own `opacity` is the only intensity dial). It is
layered *onto the pane's own gradient* — `--glass-surface` / `--glass-bar` /
`--glass-sheet` now read `var(--glass-grain), <gradient>` — at 4% light / 3% dark,
so the blur cannot smear it (grain on the backdrop would blur to nothing). The
night sheet runs a *lighter* grain than the day one: a grey speck is far more
visible against a near-black pane than against an almost-white one, so the same
opacity would read as dust on dark and as nothing on light. One SVG is decoded
once and tiled; verified live that the browser decodes it to 128×128 and that the
header and panel compute it as their first background layer.
The flattening modes (`@supports not`, `prefers-reduced-transparency`) re-declare
the fills without the grain, so those fallbacks stay deliberately flat.

### GL-11 — No pressed state anywhere `Medium` `S`

Verified: **not a single `:active` rule in any stylesheet.** Buttons lift on
hover but never compress, so the material never feels like glass under a press.

**Fix:** `:active { transform: translateY(1px) scale(.985) }` plus a deepened
inner shadow on the chrome buttons.

**Resolved** (2026-10-17) — one global rule gives every enabled `button` (and
`summary`) the press: `translate: 0 1px; scale: 0.985`. It uses the independent
`translate` / `scale` properties rather than `transform`, so the press *composes*
with any transform a control already carries (the drawer handle, the icon-select
trigger) instead of overwriting it. The chrome family plus the two close buttons
additionally swap their cast shadow for a deepened inner one via
`--glass-press-shadow` (a token, so the light/dark variants differ); the dark
sheet restates that swap with the dark selector to stay ahead of the dark shadow
overrides. Verified live: the rule parses to `translate: 0px 1px; scale: 0.985`,
both declarations are supported, and `--glass-press-shadow` resolves to the
themed value in both themes. (`:active` cannot be triggered from script, so the
pressed state was confirmed via the CSSOM plus a forced-class cascade check.)

### GL-12 — No pointer-tracked specular highlight `Medium` `M`

The highest-impact "liquid" cue: a radial highlight whose origin follows the
cursor via one CSS custom property updated on `pointermove` (rAF-throttled),
making panes behave like a lens.

**Fix:** add to the primary panels/chrome; gate behind
`prefers-reduced-motion` (there is already a block at `index.css:207`).

**Resolved** — the work was already in the tree, untracked and unmarked:
`src/useGlassSpecular.ts` runs one rAF-throttled `pointermove` listener and
writes the pointer's position within each surface to `--glass-spec-x` /
`--glass-spec-y` as a percentage of that surface's own box (read all boxes,
then write all properties, so no synchronous layout is forced per surface);
`App.tsx` mounts it once. `.site-header` and `.panel`/`.badge-panel` paint the
highlight as their *first* background layer from `--glass-specular`, from
`RosterPage.css` rather than from a root token — a `var()` substituted at
`:root` could never see the per-element coordinate. Verified 2026-10-19 on the
live DOM: before any pointer movement the layer parks at `-220px -220px`
(off the widest pane), and a `pointermove` to (500, 220) sets
`156.25% / 145.70%` on the header with the computed background following to
`radial-gradient(200px at 156.25% 145.7%, …)`. Reduced motion short-circuits
the effect, so those surfaces keep the parked fallback. (In this headless
session `requestAnimationFrame` does not fire for a hidden tab, so the paint
step was driven through a stubbed rAF for the measurement — a visible desktop
window needs no such nudge.)

### GL-13 — No chromatic dispersion at the rim `Low` `S`

A 1–2px blue/warm hue shift on the edge reads strongly as refraction.

**Resolved** — `--glass-dispersion` is a one-pixel cool catch
(`rgba(130, 168, 255, .12)`) on the top-left and a warm one
(`rgba(255, 158, 122, .1)`) on the bottom-right, and it rides *inside*
`--glass-bevel`, so every pane and control that already dropped in the GL-09
bevel picks up the split for free instead of needing its own declaration. The
dark sheet halves both alphas (`.07` / `.06`), since a full-strength split
reads as a coloured outline on night glass. Verified live: `.panel`'s computed
box-shadow resolves all six insets — top rim, bottom catch, two side catches,
then the two dispersion pixels.

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

**Resolved** (2026-10-17) — `App.tsx` now wraps the label in a
`.route-fallback-chip` span, and `RosterPage.css` styles the wrapper as a
full-height centring grid and the chip as a small glass pane (`--glass-surface`
fill, `--glass-backdrop` frost, rim + float shadow, 14px radius). The classes
live in `RosterPage.css`, which `App.tsx` imports eagerly, so the style is
present for the very first Suspense paint.

### GL-16 — `.modal-backdrop` has no dark override `Low` `S`

`RosterPage.css:1809` is the only rule for it. The navy
`rgba(22, 29, 48, .42)` scrim is used in *both* themes; in light mode it
composites to ≈`#969aa6`, a heavy grey that fights the light theme's luminous
promise.

**Fix:** provide a light-theme scrim (lighter/cooler) and keep the navy for dark.

**Resolved** (2026-10-19) — the veil is now the theme-swapped `--glass-scrim`
token: light `rgba(205, 215, 243, 0.6)`, which composites to ≈`#dee5f6` over
the day aurora — a cool haze in keeping with the sheet — where the navy used to
land on a heavy `#969aa6` grey; the dark sheet keeps the original
`rgba(22, 29, 48, 0.42)`, which reads as dimming over a night backdrop. The
one `.modal-backdrop` rule reads the token. Verified live in both themes:
`rgba(205, 215, 243, 0.6)` light, `rgba(22, 29, 48, 0.42)` dark.

### GL-17 — The star modal's blur is inert `Low` `S`

`--glass-sheet` is 84–94% opaque and the backdrop behind it is *already* blurred
22px (`:1817`), so `.star-modal`'s `blur(28px)` (`:1830`) sits behind a
near-opaque layer at effectively no visible benefit.

**Fix:** drop the inner blur (or thin the sheet so it actually shows).

**Resolved** (2026-10-19) — the inner blur was dropped rather than the sheet
thinned: legibility under the sheet is the whole point of `--glass-sheet`, and
the backdrop already frosts the page at the `lg` step behind it. One
full-viewport blur pass gone, with a comment on the rule so it does not come
back. Verified live: `.star-modal` computes `backdrop-filter: none` while
`.modal-backdrop` still computes `blur(24px) saturate(1.75)`; the sheet keeps
its grain, bevel and cast shadow.

### GL-18 — Nested `backdrop-filter`, and 67 cards `Medium` `M`

`.star-menu` (`:1417`) → `.pet-card` (`:936`) → `.panel` (`:499`) are all backdrop
roots, so an inner blur re-blurs an already-flat frosted parent: the visible
depth comes from the gradients, rims and shadows, not the nested blur. With
**67 cards** rendered, that is 67 extra blur passes for little gain.

**Fix:** test removing `backdrop-filter` from `.pet-card` (the card's glass reads
from its `--qc-*` gradients/rims/shadows). Confirm visually — see the note in
[Verification method](#verification-method).

**Resolved** (2026-10-19) — `backdrop-filter` was removed from `.pet-card` (the
experiment the entry suggested), with a comment recording why. The chain is now
two backdrop roots deep instead of three — panel frosts the aurora, cards sit on
it with their own fills, the dropdown frosts above them — so the grid stops
asking for 67 extra blur passes over an already-frosted parent. The card's own
three-layer fill, lit shoulder, lower pooling, rim and cast shadow are untouched,
so the only visible difference is what shows *through* the translucent face: the
panel's own frosted grain, crisply, instead of a blurred copy of it — which also
means the panel's single GL-12 specular is no longer re-blurred 67 times. The
miniatures inside `.card-thumb` already carried a `backdrop-filter: none`
override for exactly this reason. Verified on the live DOM: **0 of 68**
`.pet-card` elements compute a backdrop-filter, while `.site-header` and
`.panel` still compute `blur(18px) saturate(1.6)`; `npm run build` passes. A
screenshot was not possible in this session (see
[Verification method](#verification-method)), so a quick eyeball on a visible
desktop window is the remaining sanity check.

### GL-19 — Scrollbars unstyled on roster surfaces `Low` `S`

`.star-menu:1410`, `.star-modal:1825` and `.sidebar:376` scroll with **no
scrollbar styling**, so dark glass sheets get default chunky light Windows bars.
The Codex already does `scrollbar-width: thin` (`CodexPage.css:687 / 892`).

**Fix:** apply the same thin/themed treatment to the roster's scrolling surfaces.

**Resolved** (2026-10-17) — `.star-menu`, `.star-modal` and `.sidebar-body` now
share `scrollbar-width: thin; scrollbar-color: var(--scroll-thumb) transparent`.
`--scroll-thumb` is a theme-swapped token (`index.css`), so the handle tints with
the sheet instead of the platform default. The standard properties are enough
for modern Chromium, so the Codex's extra `::-webkit-scrollbar` fallback was not
needed. Verified live: `scrollbarWidth: thin`,
`scrollbarColor: rgba(150,163,196,.4) transparent` on the dark sheet.

### GL-20 — Focus ring misses links `Medium` `S`

The shared rule at `RosterPage.css:34-40` covers `button`, `input`, `select`,
`summary` but **not `a`**, so `.site-nav-link` and `.brand` fall back to the UA
ring — inconsistent with the rest. The ring colour `rgba(89, 117, 255, .32)`
(`:38`) is also faint on dark glass.

**Fix:** add `a:focus-visible` and use a two-tone / higher-alpha ring.

**Resolved** (2026-10-17) — the shared rule now also covers `a:focus-visible`, so
`.site-nav-link` and `.brand` get the app ring. The old translucent
`rgba(89, 117, 255, .32)` wash was replaced with a solid `--focus-ring` token
(light `#4a5ede`, dark `#9fadff`): ≈5:1 on the light glass and ≈6:1 on the dark,
versus the wash that all but vanished over dark panes. The `outline-offset` gap
lets the sheet behind it read as the second tone, so one ring works on both
sheets.

### GL-21 — Ad-hoc radius scale `Low` `M`

15 distinct radii with no tokens: 5, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 23,
24, 28, 999. The near-neighbours (14/15/16/18/20) could collapse.

**Fix:** a 4-step radius scale (`sm`/`md`/`lg`/`pill`).

**Resolved** (2026-10-19) — the scale lives in `index.css` and every roster
chrome corner reads it: `--radius-sm: 8px` (controls — inputs, small buttons,
chips, code beads), `--radius-md: 14px` (medium furniture — banners, tooltips,
dropdowns, toasts, the loading chip), `--radius-lg: 24px` (panes — panels,
cards, the modal sheet), `--radius-pill: 999px`. The collapse follows the
nearest step: 5/6/8/9/10 → sm, 12/14/15/16 → md, 18/20/23/24/28 → lg — so
small controls and large panes are pixel-identical to before and only the
14–20 mid-range moves (by at most 4px). 42 declarations in `RosterPage.css`
now read a token (including the two logical-corner ones on `.sidebar-open-btn`
and the one-line rules at the file's foot). Two values deliberately stay
outside the scale: `50%` for circles, and `.quality-bg`'s
`calc(var(--radius-lg) - 1px)` (resolves to the same 23px as before) because it
fills the card's *padding* box and has to stay concentric under the pane's 1px
border. A live sweep of every element on the roster page resolves to
{8, 14, 23, 24, 999, 50%, and the sidebar tab's logical `8px 0 0 8px`} —
the only remaining stragglers are the card-lab picker's miniature frames in
`CardThumb.css` (7/5px, card artwork) and the local scales in
`IconSelect.css` / `CodexPage.css` / `TrialsPage.css`, all of which sat outside
the 15-value count this finding measured (the Codex/Trials angular language is
deliberate — see GL-24).

### GL-22 — Comment drift `Low` `S`

- `RosterPage.css:1015-1017`: the comment describes Glitter artwork / an animated
  rim (that is `.pet-card.is-shiny::after` at `:984`) but sits above the unrelated
  `.pet-card.has-data-error` rule (`:1018`).
- "The grid holds 65 of these" — the grid renders **67** `.pet-card` elements.

**Resolved** (2026-10-19) — the misplaced comment now describes the rule it sits
on (an amber outline for a card whose evolution data failed validation) and
names `.pet-card.is-shiny` as the home of the animated rim, so the pointer is
useful instead of duplicative. Both "grid of 65" counts now read **67**, which
matches the live grid: 67 `.pet-card` elements inside `.roster-grid`. (The page
holds a 68th `.pet-card`, the Card picker's `CardThumb` miniature — not part of
the grid, and a plausible source of the confusion.)

### GL-23 — `background-attachment: fixed` on `body` `Low` `S`

`index.css:162 / 172`. Ignored by iOS Safari, where the aurora would scroll and
move the "spotlight" behind the glass. Fine for a local desktop tool; a fixed
pseudo-element is the portable equivalent.

**Resolved** (2026-10-19) — the aurora stack (all four radials plus the base
wash) moved onto `body::before` with `position: fixed; inset: 0; z-index: -1;
pointer-events: none`, declared once per theme, and `background-attachment:
fixed` is gone from the file. `html`'s existing `background: var(--page-bg)`
(declared in `RosterPage.css`) is the canvas underneath, so the pseudo-element
always has something to paint over and the layer cannot fall through to white;
body itself no longer carries a background at all. Nothing creates a stacking
context on `body`, so `z-index: -1` keeps the aurora behind every in-flow
element without extra plumbing. Verified live in both themes: `body` computes
`background-image: none`, the pseudo-element computes `position: fixed;
z-index: -1; pointer-events: none` with the full gradient stack (light's
`rgba(122, 146, 255, …)` field, dark's `rgba(94, 118, 255, …)`), and
`background-attachment` reports no `fixed` anywhere in the app.

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
   GL-20 (focus ring). ✅ **Done** (2026-10-17).
3. **Token pass** — GL-04, GL-05. Makes everything after it easier.
   ✅ **Done** (2026-10-17).
4. **Robustness** — GL-06, GL-07, (GL-08). ✅ **Done** (2026-10-17).
5. **Fidelity** — GL-09, GL-10, GL-11 (highest polish-per-line), then GL-12 /
   GL-13 as a deliberate design step. ✅ **All done** — GL-09–GL-11 (2026-10-17),
   GL-12 / GL-13 verified and marked (2026-10-19).
6. **Cleanups** — GL-16, GL-17, GL-18, GL-21, GL-22, GL-23.
   ✅ **Done** (2026-10-19).
7. **Light-sheet balance** — GL-25 (found by eyeballing the result of steps 5–6
   in light theme; the fidelity passes had stacked white on white). Constrained
   by GL-01's AA floor, so the lift is chroma and contour, not darkness.
   ✅ **Done** (2026-10-19).
8. **Optional** — GL-14 (SVG displacement refraction) stays an experiment per
   its own entry: worth trying only as an opt-in layer, never as a default.

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
- The 2026-10-19 pass (GL-16, GL-17, GL-18, GL-21, GL-22, GL-23) was verified
  the same way: computed styles on the live DOM in both themes, a CSSOM read for
  rules that could not be instantiated on screen (the `.route-fallback-chip`
  rule, and `.star-modal`'s `max-width: 620px` override), and an all-elements
  sweep collecting every computed `border-radius` on the roster page.
- Screenshots were unavailable for most of this review (they need a visible
  desktop window), so GL-17 and GL-18's "confirm visually" rests on the
  computed styles plus the paint-order argument in their Resolved notes. When a
  visible window became available mid-pass, screenshots became measurable: the
  PNG is decoded and reduced to luminance/saturation statistics rather than
  viewed (this model cannot read images), which is how GL-25's before/after
  (57.8% → 50.9% near-white pixels, saturation 0.068 → 0.086) was established.
  Those numbers are exact pixel samples, not estimates.
- GL-25 is the one finding whose numbers came **first** from pixels and then
  from the composite method: the screenshot diagnosed the washout, and the
  GL-01-style composite then *bounded* the fix, because the AA floor rules out
  the amount of deepening the pixels alone would suggest. Its contrast figures
  are computed by the same method as GL-01, over the same worst case.
- `requestAnimationFrame` does not run for a hidden tab in this environment, so
  the GL-12 paint step was driven through a stubbed rAF for the measurement;
  the parked-fallback and pointer-following values it produced are exact.
