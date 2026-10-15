// Shared stage identity bridge.
//
// The game tables speak in `{ petId, stage }`, while the wiki and image data
// speak in stage names such as "Shellshy". Rather than rebuilding that bridge
// in each feature, this module owns the name <-> identity correspondence. Both
// the roster and the codex import from here, so there is exactly one place to
// update when a naming convention changes.
import { PET_NAMES } from './gameData'

export interface GameStageIdentity {
  petId: number
  stage: number
}

const identityByName = new Map<string, GameStageIdentity>()
const nameByIdentity = new Map<string, string>()

for (const [petId, entry] of Object.entries(PET_NAMES)) {
  for (const [stage, localized] of Object.entries(entry?.evos ?? {})) {
    const name = localized?.en
    if (typeof name === 'string' && name) {
      const identity = { petId: Number(petId), stage: Number(stage) }
      identityByName.set(name, identity)
      nameByIdentity.set(`${identity.petId}:${identity.stage}`, name)
    }
  }
}

/** Every stage name that has a real game-id/stage identity behind it. */
export const GAME_STAGE_NAMES: ReadonlySet<string> = new Set(identityByName.keys())

export function gameIdentityForStageName(name: string | null | undefined): GameStageIdentity | null {
  if (!name) return null
  return identityByName.get(name) ?? null
}

export function stageNameForIdentity(petId: number, stage: number): string | null {
  return nameByIdentity.get(`${petId}:${stage}`) ?? null
}

export function hasGameStage(name: string | null | undefined): boolean {
  return gameIdentityForStageName(name) !== null
}