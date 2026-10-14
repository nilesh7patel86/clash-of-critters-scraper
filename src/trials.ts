// Trials reference data layer.
//
// units.json ties every pet to the quests its evolutions ask for:
// `DATA.evoquest[petId][transition]` is the list of quest ids, and trials.json
// carries the quest and tip text behind those ids. petHelpers already turns one
// such list into rendered lines for the roster's trial tip, so the model here
// only has to walk every transition of every pet once and keep the result.
//
// Nothing here touches React or localStorage: the page filters and renders what
// `buildTrials` hands back. Trial text is resolved once per transition, because
// `trialLines` caches on the quest array's identity.

import { DATA, TRIALS } from './gameData'
import type { PetUnit } from './gameData'
import { ELEMENTS } from './domain'
import { getEvoRange, getStageName, nextEvolution, trialLines, trialText } from './petHelpers'
import type { TrialLine } from './petHelpers'

export interface TrialTransition {
  /** 1-based stage the evolution leaves. */
  from: number
  /** 1-based stage the evolution unlocks. */
  to: number
  /** Display name of the stage it unlocks. */
  toName: string
  /** Star gate for the evolution, or null when the tables carry no gate. */
  gate: number | null
  /** The quests, already resolved to icon + text. */
  entries: TrialLine[]
}

export interface TatariTrials {
  id: number
  /** Display name of the first stage - what the line is called in game. */
  name: string
  element: number
  elementLabel: string
  transitions: TrialTransition[]
  /** Trials across every transition. Zero for a single-stage Tatari. */
  count: number
  /** Distinct trial parameters this Tatari's trials ask for, sorted by name. */
  params: string[]
  /** Lowercased name, stage names and trial text, ready for includes(). */
  search: string
}

// A star value is not needed to read a transition's trials or gate, so every
// step is asked from 0 and only those two fields are kept. The loop derives the
// stage names once, which `getStageName` memoises anyway.
export function buildTrials(pets: PetUnit[]): TatariTrials[] {
  return pets.map((pet) => {
    const [minStage, maxStage] = getEvoRange(pet.id)
    const transitions: TrialTransition[] = []
    for (let stage = minStage; stage < maxStage; stage += 1) {
      const step = nextEvolution(pet, 0, stage)
      if (!step) continue
      transitions.push({
        from: stage,
        to: step.stage,
        toName: getStageName(pet, step.stage),
        gate: step.gate,
        entries: trialLines(step.trials),
      })
    }
    const count = transitions.reduce((total, transition) => total + transition.entries.length, 0)
    const params = [...new Set(transitions.flatMap((transition) => transition.entries.flatMap((entry) => entry.counts)))].sort(
      (a, b) => a.localeCompare(b),
    )
    const search = [
      pet.name,
      ...transitions.flatMap((transition) => [
        transition.toName,
        ...transition.entries.flatMap((entry) => [entry.text, entry.alt, ...entry.counts]),
      ]),
    ]
      .join(' ')
      .toLowerCase()
    return {
      id: pet.id,
      name: getStageName(pet, minStage),
      element: pet.el,
      elementLabel: ELEMENTS[pet.el]?.label ?? 'Unknown',
      transitions,
      count,
      params,
      search,
    }
  })
}

// A trial parameter is a quest's tip, and the tables draw that tip as the
// `_small` cut of a trial icon. Only the full-size file is shipped, so the
// suffix is dropped: it is the same picture, and a filter menu scales it down
// anyway. A tip drawn with anything else (a mission or element chip) is skipped
// rather than pointed at a file that does not exist.
function parameterIconKey(icon: string | undefined): string | null {
  if (!icon || !icon.startsWith('txui_trial_')) return null
  return icon.replace(/_small$/, '')
}

/**
 * Parameter name -> trial icon key, tallied over the quests the evolutions
 * actually ask for. A name the tables draw more than one way keeps the icon it
 * is drawn with most often.
 */
export function buildParameterIcons(pets: PetUnit[]): Record<string, string> {
  const tally = new Map<string, Map<string, number>>()
  for (const pet of pets) {
    const transitions = DATA.evoquest[String(pet.id)]
    if (!transitions) continue
    for (const questIds of Object.values(transitions)) {
      for (const questId of questIds) {
        for (const tipId of TRIALS.quests[String(questId)]?.tips ?? []) {
          const tip = TRIALS.tips[String(tipId)]
          const name = trialText(tip)
          const key = parameterIconKey(tip?.icon)
          if (!name || !key) continue
          const counts = tally.get(name)
          if (counts) counts.set(key, (counts.get(key) ?? 0) + 1)
          else tally.set(name, new Map([[key, 1]]))
        }
      }
    }
  }
  const icons: Record<string, string> = {}
  for (const [name, counts] of tally) {
    let best = ''
    let bestCount = 0
    for (const [key, count] of counts) {
      if (count > bestCount) {
        best = key
        bestCount = count
      }
    }
    if (best) icons[name] = best
  }
  return icons
}
