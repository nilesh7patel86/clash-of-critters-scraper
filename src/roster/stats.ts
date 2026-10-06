// Roster-only pieces of the pet model: the sort vocabulary, the saved snapshot
// shapes and the grid ordering built on them. The pet read-side itself (names,
// art, star maths, stat maths, trials) lives in src/petHelpers.ts, which the
// card-sample lab shares.
import type { PetUnit } from '../gameData'
import type { GymState, TrainerState } from '../domain'
import { computeStats, getEvolution, getStageName, petKey } from '../petHelpers'
import type { PetState } from '../petHelpers'

export const SORT_KEYS = ['evostar', 'id', 'pow', 'evo', 'star', 'grade', 'el', 'name', 'own'] as const

export type SortKey = (typeof SORT_KEYS)[number]

export type RosterState = Record<string, PetState>

export type Snapshot = { R: RosterState; GYM: GymState; TR: TrainerState }

// Decorate-sort-undecorate. Every comparator reads values derived from the
// snapshot - stat maths, evolution quality, stage names - and Array.sort makes
// O(n log n) comparisons, so computing them inside a comparator redoes each
// value ~2·log n times per pet. They are computed once per pet here instead,
// and only for the key in use: computeStats is not cheap, and sorting by name
// is the only place getStageName belongs.
export function sortIds(pets: PetUnit[], snapshot: Snapshot, sort: SortKey): number[] {
  const keyed = pets.map((pet) => {
    const state = snapshot.R[petKey(pet.id)]
    return {
      pet,
      state,
      quality: getEvolution(pet.id, state.evo)?.q || 2,
      grade: state.gA + state.gD + state.gH,
      power: sort === 'pow' ? computeStats(pet, state, snapshot.TR, snapshot.GYM).atk : 0,
      name: sort === 'name' ? getStageName(pet, state.evo) : '',
    }
  })
  const byId = (first: (typeof keyed)[number], second: (typeof keyed)[number]) => first.pet.id - second.pet.id
  const compare: Record<SortKey, (first: (typeof keyed)[number], second: (typeof keyed)[number]) => number> = {
    evostar: (first, second) => second.quality - first.quality || second.state.star - first.state.star || byId(first, second),
    id: byId,
    pow: (first, second) => second.power - first.power,
    evo: (first, second) => second.state.evo - first.state.evo || byId(first, second),
    star: (first, second) => second.state.star - first.state.star || byId(first, second),
    grade: (first, second) => second.grade - first.grade || byId(first, second),
    el: (first, second) => first.pet.el - second.pet.el || byId(first, second),
    name: (first, second) => first.name.localeCompare(second.name),
    // Owned first is the pass below's job, so this only has to break what it
    // leaves: id order.
    own: byId,
  }
  const primary = compare[sort]
  keyed.sort((first, second) => Number(second.state.own) - Number(first.state.own) || primary(first, second))
  return keyed.map((entry) => entry.pet.id)
}
