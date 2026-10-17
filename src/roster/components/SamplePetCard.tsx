// Renders one of the card-lab layouts for a single roster pet.
//
// The roster's own PetCard stays the default look; this is what lets any of the
// thirteen designs from the card lab stand in for it. It builds the lab's view
// model from the same saved pet state the roster card reads, so a design shown
// here behaves exactly as it does in the gallery: same numbers, same artwork,
// same controls - and those controls edit the real roster, because the lab's
// CardHandlers surface is deliberately identical to the roster's.
//
// Memoised on the same stable props PetCard is, so switching a roster of sixty
// five to a sample layout still only re-renders the cards that changed. The
// gallery stylesheet comes in with this module, which is the only thing the
// roster imports that knows the designs exist.

import { memo } from 'react'
import type { PetUnit } from '../../gameData'
import type { GymState, TrainerState } from '../../domain'
import type { PetState } from '../../petHelpers'
import { buildCardModel } from '../../cardSamples/cardSampleModel'
import type { CardHandlers } from '../../cardSamples/cardSampleModel'
import type { Tint } from '../../cardSamples/cardSampleKit'
import type { Variant } from '../../cardSamples/cardSampleVariants'
import '../../cardSamples/CardSamplesPage.css'

export const SamplePetCard = memo(function SamplePetCard({
  variant,
  pet,
  state,
  trainer,
  gym,
  disabled,
  artEpoch,
  tint,
  handlers,
}: {
  variant: Variant
  pet: PetUnit
  state: PetState
  trainer: TrainerState
  gym: GymState
  disabled: boolean
  /** Bumped when the async wiki artwork lands, matching PetCard. */
  artEpoch: number
  /** The Backdrop choice: what, if anything, the card panel is recoloured by. */
  tint: Tint
  handlers: CardHandlers
}) {
  // Read so the memo re-runs once the wiki cache lands: the portrait URL is
  // resolved while the model is built, so a memo that ignored this would keep
  // handing back the in-game icon it picked before the cache existed.
  void artEpoch
  const model = buildCardModel(pet, state, trainer, gym)
  const Layout = variant.render
  return <Layout model={model} disabled={disabled} tint={tint} handlers={handlers} />
})
