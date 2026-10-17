# Data Unification Plan — From Multiple Tatari Sources to One Source

## Problem

The app currently has two effectively separate datasets for "Tatatris":

- `units.json` / `pet_names.json`: numeric and evolution data for the 65 game pets.
- `tataris.json`: wiki-derived stages, skills, rarities, roles, counters, feeding tracks, and line data.

Both describe the same entity: **Tatari stages**. The connection is currently name-based, which makes the data harder to relate, query, and evolve.

## Goal

Create a single authoritative data source for pet/stage identity while retaining the specialized lookup tables where they are genuinely useful.

Target outcome:

- One normalized critter record contains game IDs, stage names, wiki profile, portraits, counters, skills, feeding tracks, and optional game metadata.
- Roster and Codex both read from the same stage identity model.
- Standalone tables remain only for large shared lookup sets (game economy, trial text, asset discovery).

## Canonical key

Use a stable stage-level key derived from the game side where possible:

```text
{ petId, stage }
```

Fallback key for wiki-only lines:

```text
{ lineName, stageIndex }
```

Do not rely on display names alone. Names remain display-only and may be localized or change.

## Proposed normalized schema

```jsonc
{
  "pets": [
    {
      "petId": 1,
      "petName": "HermitCrab",
      "element": 2,
      "pos": 1,
      "deploy": 1,
      "career": 2,
      "stages": [
        {
          "stage": 1,
          "stageName": "Shellshy",
          "wikiKey": "Shellshy",
          "hasGameData": true
        },
        {
          "stage": 2,
          "stageName": "Boldclaw",
          "wikiKey": "Boldclaw",
          "hasGameData": true
        }
      ]
    }
  ],
  "stages": {
    "Shellshy": {
      "name": "Shellshy",
      "line": "Shellshy",
      "element": "Water",
      "rarity": "B",
      "role": "Striker",
      "growth": { "attack": 1.2, "defense": 1.1, "hp": 1.0 },
      "counters": "Fire",
      "skill": {
        "name": "...",
        "description": "...",
        "types": [],
        "image": "tatari-skills/Example.png"
      },
      "feeding": [],
      "portrait": "tatari/Shellshy.png",
      "glitterPortrait": "tatari-glitter/Shellshy_glitter.png",
      "gamePetId": 1,
      "gameStage": 1,
      "documented": true
    }
  },
  "stageIndex": {
    "Shellshy": { "petId": 1, "stage": 1 },
    "Boldclaw": { "petId": 1, "stage": 2 }
  },
  "gameTables": {
    "starCosts": {},
    "levelStats": {},
    "feedRanks": [],
    "badgeBonuses": {}
  }
}
```

## Data that should remain separate

Keep these separate because they are cross-cutting or independently refreshed:

- `feedingUpgrades.json`: reusable upgrade catalog.
- `trials.json`: quest and tip text, not stage display identity.
- `zoboHorde.json`: family/skill reference view; can derive from normalized stage rows, but keep separate at first.
- `artIndex.json`: thin portrait cache until embedded portraits are proven harmless for bundle size.
- game economy tables: star costs, badge bonuses, level stats, evolution gates.

## Phase 1 — Add join keys, no behavior change

1. Add `gamePetId` and `gameStage` to each wiki stage row where a game unit exists.
2. Add an optional wiki image or stage name bridge in `pet_names.json` processing if needed.
3. Keep `units.json` and `tataris.json` as separate source files.
4. Add tests or assertions for every unit pet/stage pair that is expected to bridge.

Acceptance criteria:

- App still builds and renders unchanged.
- Bridge can resolve ` Shellshy -> { petId: 1, stage: 1 }`.
- No display-name matching is performed at runtime.

## Phase 2 — Shared in-memory bridge

1. Implement a shared loader that exposes:
   - `getPet(petId)`
   - `getStageName(petId, stage)`
   - `getWikiStage(stageName)`
   - `getStagePortrait(stageName)`
2. Update roster card to use the shared lookup.
3. Update codex card to use the same lookup for stage names and portraits.
4. Update trials tips to use the same stage-name map.
5. Keep all current rendering behavior identical.

Acceptance criteria:

- Roster and Codex use one stage-name resolution path.
- No duplicate image/name lookup logic in components.
- Tests still pass.

## Phase 3 — Normalize runtime data

1. Build a normalized runtime document, for example `critters.json`.
2. Replace direct access to:
   - `units.json` game tables access,
   - `pet_names.json` stage names,
   - `tataris.json` stage profile access, and
   - related `artIndex.json` references.
3. Split normalized data into:
   - stable pet records,
   - stage records,
   - global game tables,
   - optional wiki profiles.
4. Introduce build-time validation that every game stage resolves to exactly one wiki stage.

Acceptance criteria:

- Roster tab renders the same stats as before.
- Codex tab renders the same wiki data as before.
- Build fails clearly if a bridge is missing.
- `critters.json` size is measured before and after; no surprise bundle growth.

## Phase 4 — Retire redundant sources

1. Remove direct `pet_names.json` usage after normalized stage names exist.
2. Consider embedding roster portrait references directly in the normalized stage record; keep or remove `artIndex.json` based on bundle impact.
3. Keep `units.json` as a generated game-table source only if still useful to scraper validation; otherwise retire it.
4. Keep tataris-style raw wiki cache only if the scraper still needs a raw capture.

Acceptance criteria:

- No page reads more than one source for the same stage identity.
- `getStageName` has a single implementation.
- Regeneration and pruning behavior is documented.

## Risks

- Name changes could break name-based bridges; use `{ petId, stage }` first.
- Cross-source mapping can drift if `pet_names.json` is not normalized on scrape.
- Large schema changes can affect bundle size and runtime parsing.
- Wiki-only lines do not have game IDs, so they must remain optional wiki profiles.
- Tests must be updated alongside the shared lookup.

## Suggested next step

Implement Phase 1 first:

- Add stable `gamePetId` and `gameStage` fields to wiki stages.
- Keep all current files unchanged.
- Validate the game-to-wiki mapping.
- Only after that, move to the shared bridge and normalized document.