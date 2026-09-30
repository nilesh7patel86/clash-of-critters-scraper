// The sample gallery.
//
// A review harness for the roster card, not part of the roster. It renders the
// seven sample layouts over live game data so they can be judged side by side
// and in bulk, and it edits its own copy of the roster state under a separate
// storage key so nothing here can touch a real saved roster.
//
// Two ways to look:
//
//   Compare  one pet across every layout, which is the only way to see what a
//            design change actually costs another design
//   Density  one layout across many pets, which is the only way to find out
//            whether sixty-five of them is a wall of noise
//
// The scenario switch seeds the roster with the states a layout has to survive:
// unowned, star zero, an emblem tier, a not-yet-evolved pet, and a maxed one.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { DATA } from '../gameData'
import type { PetUnit } from '../gameData'
import { ELEMENT_ORDER, ELEMENTS, clamp } from '../domain'
import { loadWikiStageArt } from '../wikiArt'
import { RARITY_NAMES, RARITY_PALETTE } from './cardSampleRarity'
import {
  MAX_STAR,
  STAR_GRADE,
  buildCardModel,
  createGym,
  createRoster,
  createTrainer,
  duplicateCost,
  getEvoRange,
  nextEvolution,
  petKey,
  readableInk,
  starFromParts,
  trialLines,
} from './cardSampleModel'
import type { CardHandlers, CardModel, PetState, Scenario } from './cardSampleModel'
import { TrialsTip } from './cardSampleKit'
import type { Tint } from './cardSampleKit'
import { VARIANTS } from './cardSampleVariants'
import './CardSamplesPage.css'

const SCENARIOS: { id: Scenario; label: string; hint: string }[] = [
  { id: 'fresh', label: 'Fresh', hint: 'Everything at star 1, owned' },
  { id: 'midgame', label: 'Mid game', hint: 'Mixed stars, some Glitter, some not owned' },
  { id: 'maxed', label: 'Maxed', hint: 'Every pet at star 84, final stage, SSS food' },
  { id: 'mixed', label: 'Edge cases', hint: 'Unowned, star 0, emblems and maxed in rotation' },
]

type Roster = Record<string, PetState>

type Action =
  | { type: 'reseed'; scenario: Scenario }
  | { type: 'pet'; id: number; patch: Partial<PetState> }
  | { type: 'ownAll'; own: boolean }

function clampState(pet: PetUnit, patch: Partial<PetState>, current: PetState): PetState {
  const [minEvo, maxEvo] = getEvoRange(pet.id)
  const next: PetState = { ...current, ...patch }
  return {
    own: typeof next.own === 'boolean' ? next.own : true,
    star: clamp(Math.trunc(next.star) || 0, 0, MAX_STAR),
    evo: clamp(Math.trunc(next.evo) || minEvo, minEvo, maxEvo),
    gA: clamp(Math.trunc(next.gA) || 0, 0, DATA.feedrank.length - 1),
    gD: clamp(Math.trunc(next.gD) || 0, 0, DATA.feedrank.length - 1),
    gH: clamp(Math.trunc(next.gH) || 0, 0, DATA.feedrank.length - 1),
    shiny: Boolean(next.shiny),
  }
}

function reducer(state: Roster, action: Action): Roster {
  if (action.type === 'reseed') return createRoster(action.scenario)
  if (action.type === 'ownAll') {
    return Object.fromEntries(Object.entries(state).map(([key, pet]) => [key, { ...pet, own: action.own }]))
  }
  const key = petKey(action.id)
  const current = state[key]
  if (!current) return state
  return { ...state, [key]: clampState(DATA.pets.find((pet) => pet.id === action.id) as PetUnit, action.patch, current) }
}

const PETS_BY_ID = new Map(DATA.pets.map((pet) => [pet.id, pet]))

function petName(id: number): string {
  return PETS_BY_ID.get(id)?.name ?? `Pet ${id}`
}

interface CardSamplesPageProps {
  header: ReactNode
}

export default function CardSamplesPage({ header }: CardSamplesPageProps) {
  const [scenario, setScenario] = useState<Scenario>('midgame')
  const [roster, dispatch] = useReducer(reducer, scenario, createRoster)
  const [mode, setMode] = useState<'compare' | 'density'>('compare')
  const [variantId, setVariantId] = useState<string>(VARIANTS[0].id)
  const [element, setElement] = useState<string>('0')
  const [focusId, setFocusId] = useState<number>(2)
  const [openStar, setOpenStar] = useState<string | null>(null)
  const [tint, setTint] = useState<Tint>('none')
  const [trials, setTrials] = useState<{ id: number; anchor: HTMLElement } | null>(null)
  // Bumped once the wiki artwork cache lands. It has to be a dependency of the
  // model memo below, not just a nudge towards a re-render: the portrait URL is
  // resolved while the model is built, so a memo that ignores this keeps handing
  // back the in-game icon it picked before the cache existed.
  const [artVersion, setArtVersion] = useState(0)
  const [artNote, setArtNote] = useState('')

  // The portraits come from the wiki cache, which is fetched at runtime rather
  // than baked in. Until it lands the cards fall back to the game's own icons,
  // which is worth saying out loud rather than letting it look like a scrape
  // failure.
  useEffect(() => {
    let active = true
    loadWikiStageArt().then(
      () => { if (active) setArtVersion((count) => count + 1) },
      () => { if (active) setArtNote('Wiki artwork unavailable - showing the in-game pet icons instead.') },
    )
    return () => { active = false }
  }, [])

  const trainer = useMemo(() => createTrainer(640), [])
  const gym = useMemo(() => createGym(), [])

  const pool = useMemo(
    () => (element === '0' ? DATA.pets : DATA.pets.filter((pet) => pet.el === Number(element))),
    [element],
  )

  // Narrowing by element can leave the compared pet outside the filter, which
  // would show an empty stage with no obvious cause. Resolved during render
  // rather than by pushing a correction back into state.
  const activeFocusId = useMemo(
    () => (pool.some((pet) => pet.id === focusId) ? focusId : pool[0]?.id ?? focusId),
    [focusId, pool],
  )

  const visiblePets = useMemo(
    () => (mode === 'compare' ? pool.filter((pet) => pet.id === activeFocusId) : pool),
    [activeFocusId, mode, pool],
  )

  const updatePet = useCallback((id: number, patch: Partial<PetState>) => dispatch({ type: 'pet', id, patch }), [])

  const handlers = useMemo<CardHandlers>(() => ({
    onOwn: (id, own) => updatePet(id, { own }),
    onShiny: (id) => updatePet(id, { shiny: !roster[petKey(id)]?.shiny }),
    onStarMenu: () => undefined,
    onStarType: (id, type) => {
      updatePet(id, { star: type > 12 ? 72 + type - 12 : starFromParts(type, 1) })
      setOpenStar(null)
    },
    onStarCount: (id, count) => {
      const current = roster[petKey(id)]
      if (!current) return
      const grade = Math.ceil(current.star / STAR_GRADE) - 1
      updatePet(id, { star: starFromParts(grade + 1, count) })
    },
    onEvolution: (id, stage) => updatePet(id, { evo: stage }),
    onGrade: (id, key, direction) => {
      const current = roster[petKey(id)]
      if (!current) return
      const length = DATA.feedrank.length
      updatePet(id, { [key]: (current[key] + direction + length) % length } as Partial<PetState>)
    },
    onTrials: (id, anchor) => setTrials({ id, anchor }),
  }), [roster, updatePet])

  // Compare mode draws the same Tatari in every layout, so an open star menu
  // keyed only on the pet id would open seven popovers at once. The key carries
  // the layout as well, which makes exactly one card's menu open at a time and
  // still gives that card its own stacking context.
  const handlersFor = useCallback((layoutId: string): CardHandlers => ({
    ...handlers,
    onStarMenu: (id) => {
      const key = `${layoutId}#${id}`
      setTrials(null)
      setOpenStar((value) => (value === key ? null : key))
    },
  }), [handlers])

  // Clicking away from an open star menu closes it, the same as the roster.
  useEffect(() => {
    if (openStar === null) return
    const closeMenu = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('.s-star-picker')) setOpenStar(null)
    }
    document.addEventListener('click', closeMenu)
    return () => document.removeEventListener('click', closeMenu)
  }, [openStar])

  // Any change of what is on stage dismisses the floating bits, done here in the
  // handlers that cause the change rather than watched in an effect.
  const dismissFloaters = useCallback(() => {
    setOpenStar(null)
    setTrials(null)
  }, [])

  const changeMode = useCallback((next: 'compare' | 'density') => {
    dismissFloaters()
    setMode(next)
  }, [dismissFloaters])

  const changeElement = useCallback((next: string) => {
    dismissFloaters()
    setElement(next)
  }, [dismissFloaters])

  const changeFocus = useCallback((next: number) => {
    dismissFloaters()
    setFocusId(next)
  }, [dismissFloaters])

  const changeVariant = useCallback((next: string) => {
    dismissFloaters()
    setVariantId(next)
  }, [dismissFloaters])

  // Recolouring the backdrop is a look, not an edit, so it deliberately does not
  // dismiss the star menu: you can hold a picker open while checking the tint.
  const changeTint = useCallback((next: Tint) => setTint(next), [])

  const showDensity = useCallback((next: string) => {
    dismissFloaters()
    setVariantId(next)
    setMode('density')
  }, [dismissFloaters])

  const models = useMemo(() => {
    // Read so this memo is genuinely invalidated when the wiki artwork cache
    // lands. The portrait URL is resolved here, out of a module-level cache the
    // fetch fills in behind our back, so without this the memo would keep
    // handing back the in-game icon it picked before the cache existed.
    void artVersion
    return visiblePets.map((pet) => buildCardModel(pet, roster[petKey(pet.id)], trainer, gym))
  }, [artVersion, gym, roster, trainer, visiblePets])

  const trialsPet = trials ? PETS_BY_ID.get(trials.id) : null
  const trialsModel = trials && trialsPet
    ? buildCardModel(trialsPet, roster[petKey(trials.id)], trainer, gym)
    : null
  const trialsNext = trialsModel ? nextEvolution(trialsModel.pet, trialsModel.state.star, trialsModel.state.evo) : null

  const variant = VARIANTS.find((entry) => entry.id === variantId) ?? VARIANTS[0]

  return (
    <div className="cs-shell">
      {header}
      <main className="cs-page">
        <div className="cs-intro">
          <div>
            <span className="cs-eyebrow">Card samples</span>
            <h1>Seven futures for the roster card</h1>
            <p>
              Every design below renders the same live game data and carries the same controls as the
              current roster card: ownership, Glitter art, star family and count, duplicate-box costs,
              evolution gates, trial requirements, food grades on click and right-click, and the
              badge and battle-level readouts. Only the arrangement and the material change.
            </p>
            <p className="cs-intro-extra">
              <strong>Backdrop</strong> recolours the card panel from the Tatari's element or its
              rarity. It is a backdrop control only: frames, borders, grids, bevels, type and every
              input stay exactly as the design sets them, so the card stays recognisable.
            </p>
          </div>
          <p className="cs-intro-note">
            Nothing here is wired into the roster. Edits made on this page are kept in their own
            storage key, so a real saved roster cannot be disturbed while these are being judged.
          </p>
        </div>

        <section className="cs-controls">
          <div className="cs-control">
            <span className="cs-label">Look at</span>
            <div className="cs-segmented" role="group" aria-label="Comparison mode">
              <button type="button" className={mode === 'compare' ? 'on' : ''} onClick={() => changeMode('compare')}>Compare layouts</button>
              <button type="button" className={mode === 'density' ? 'on' : ''} onClick={() => changeMode('density')}>Density grid</button>
            </div>
          </div>

          <div className="cs-control">
            <span className="cs-label">Backdrop</span>
            <div className="cs-segmented" role="group" aria-label="Backdrop colouring">
              <button type="button" className={tint === 'none' ? 'on' : ''} onClick={() => changeTint('none')}>Design</button>
              <button type="button" className={tint === 'element' ? 'on' : ''} onClick={() => changeTint('element')}>Element</button>
              <button type="button" className={tint === 'rarity' ? 'on' : ''} onClick={() => changeTint('rarity')}>Rarity</button>
            </div>
          </div>

          {tint === 'rarity' && (
            <div className="cs-control cs-rarity-key">
              <span className="cs-label">Rarity key</span>
              {/* The reference the cards are painted from, shown so the five
                  tiers can be told apart at a glance. Each swatch is the
                  gradient a panel actually mixes, not the raw stops. */}
              <ul className="cs-rarity-list">
                {RARITY_NAMES.map((name) => {
                  const entry = RARITY_PALETTE[name]
                  return (
                    <li key={name} className="cs-rarity-item">
                      <span
                        className="cs-rarity-swatch"
                        style={{
                          backgroundImage: `linear-gradient(140deg, ${entry.hi}, ${entry.mid} 52%, ${entry.lo})`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="cs-rarity-name">{entry.name}</span>
                      <span className="cs-rarity-hex">{entry.mid}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <label className="cs-control cs-select">
            <span className="cs-label">Scenario</span>
            <select value={scenario} onChange={(event) => {
              const next = event.target.value as Scenario
              setScenario(next)
              dispatch({ type: 'reseed', scenario: next })
            }}>
              {SCENARIOS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} - {entry.hint}</option>)}
            </select>
          </label>

          <label className="cs-control cs-select">
            <span className="cs-label">Element</span>
            <select value={element} onChange={(event) => changeElement(event.target.value)}>
              <option value="0">All elements</option>
              {ELEMENT_ORDER.map((entry) => <option key={entry} value={String(entry)}>{ELEMENTS[entry].label}</option>)}
            </select>
          </label>

          {mode === 'compare' ? (
            <label className="cs-control cs-select">
              <span className="cs-label">Pet</span>
              <select value={String(activeFocusId)} onChange={(event) => changeFocus(Number(event.target.value))}>
                {pool.map((pet) => (
                  <option key={pet.id} value={String(pet.id)}>{petName(pet.id)}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="cs-control cs-select">
              <span className="cs-label">Layout</span>
              <select value={variantId} onChange={(event) => changeVariant(event.target.value)}>
                {VARIANTS.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
          )}

          <div className="cs-control cs-actions">
            <span className="cs-label">Bulk</span>
            <button type="button" onClick={() => dispatch({ type: 'ownAll', own: true })}>Own all</button>
            <button type="button" onClick={() => dispatch({ type: 'ownAll', own: false })}>Own none</button>
          </div>
        </section>

        {artNote ? <p className="cs-note" role="status">{artNote}</p> : null}

        {mode === 'compare' ? (
          <>
            <section className="cs-picker">
              <span className="cs-label">Or pick a pet</span>
              <div className="cs-picker-strip">
                {DATA.pets.slice(0, 24).map((pet) => {
                  const state = roster[petKey(pet.id)]
                  return (
                    <button
                      type="button"
                      key={pet.id}
                      className={`cs-pick${activeFocusId === pet.id ? ' on' : ''}`}
                      onClick={() => changeFocus(pet.id)}
                      title={`${petName(pet.id)} - star ${state?.star ?? 0}, evolution ${state?.evo ?? 1}${state?.own ? '' : ', not owned'}`}
                    >
                      <span style={{ background: ELEMENTS[pet.el].color }} />
                      {petName(pet.id)}
                    </button>
                  )
                })}
              </div>
            </section>

            <div className="cs-compare">
              {VARIANTS.map((entry) => (
                <section className="cs-entry" key={entry.id}>
                  <header className="cs-entry-head">
                    <div>
                      <h2>{entry.name}</h2>
                      <p className="cs-tagline">{entry.tagline}</p>
                    </div>
                    <button type="button" className="cs-open-density" onClick={() => showDensity(entry.id)}>See in a grid</button>
                  </header>
                  <p className="cs-note-text">{entry.note}</p>
                  <div className="cs-stage">
                    {models.map((model) => (
                      <entry.render
                        key={model.pet.id}
                        model={model}
                        disabled={false}
                        starOpen={openStar === `${entry.id}#${model.pet.id}`}
                        tint={tint}
                        handlers={handlersFor(entry.id)}
                      />
                    ))}
                  </div>
                  <footer className="cs-entry-foot">
                    <span>From {entry.source}</span>
                    <span>{entry.density}</span>
                  </footer>
                </section>
              ))}
            </div>
          </>
        ) : (
          <section className="cs-density">
            <header className="cs-density-head">
              <div>
                <h2>{variant.name}</h2>
                <p className="cs-note-text">{variant.note}</p>
              </div>
              <span className="cs-count">{models.length} cards shown</span>
            </header>
            <div className={`cs-stage cs-stage--${variant.id} cs-stage--grid`}>
              {models.map((model) => (
                <variant.render
                  key={model.pet.id}
                  model={model}
                  disabled={false}
                  starOpen={openStar === `${variant.id}#${model.pet.id}`}
                  tint={tint}
                  handlers={handlersFor(variant.id)}
                />
              ))}
            </div>
            {models.length === 0 ? <p className="cs-empty">No Tatari match this element.</p> : null}
          </section>
        )}

        <DetailPanel models={models} onPatch={updatePet} />
      </main>

      {trials && trialsModel && trialsNext && trialsNext.trials.length > 0 ? (
        <TrialsTip model={trialsModel} next={trialsNext} anchor={trials.anchor} onClose={() => setTrials(null)} />
      ) : null}
    </div>
  )
}

/**
 * A side panel that spells out the maths behind whichever card is on screen, so
 * a design can be judged against real numbers rather than the impression of
 * them. It also exposes the awkward controls - star straight to a tier, the
 * emblem jump - that a design may or may not have given a comfortable home.
 */
function DetailPanel({ models, onPatch }: { models: CardModel[]; onPatch: (id: number, patch: Partial<PetState>) => void }) {
  const model = models[0]
  const anchor = useRef<HTMLDivElement>(null)
  if (!model) return null
  const { pet, state, stats, next } = model
  const totalBoxes = duplicateCost(1, MAX_STAR)
  const trialRows = next ? trialLines(next.trials) : []

  return (
    <section className="cs-detail" ref={anchor}>
      <h2>Readout for {model.stageName}</h2>
      <div className="cs-detail-grid">
        <div>
          <h3>Combat maths</h3>
          <dl className="cs-kv">
            <dt>Battle level</dt><dd>{stats.battleLevel}</dd>
            <dt>Attack</dt><dd>{stats.atk.toFixed(1)}</dd>
            <dt>HP</dt><dd>{stats.hp.toFixed(1)}</dd>
            <dt>Defense</dt><dd>{stats.def.toFixed(1)}</dd>
            <dt>Evolution factors</dt>
            <dd>{stats.evolutionValid ? 'present' : 'missing, falling back to 1'}</dd>
            <dt>Badges</dt><dd>{stats.badge.a} / {stats.badge.d} / {stats.badge.h}%</dd>
            <dt>Full 1 to {MAX_STAR}</dt><dd>{totalBoxes.toLocaleString('en-US')} boxes</dd>
          </dl>
        </div>

        <div>
          <h3>Star jumps</h3>
          <div className="cs-jump-row">
            <label>
              <span>Set star</span>
              <input
                type="number"
                min={0}
                max={MAX_STAR}
                value={state.star}
                onChange={(event) => onPatch(pet.id, { star: Number(event.target.value) })}
              />
            </label>
            <button type="button" onClick={() => onPatch(pet.id, { star: 0 })}>Zero</button>
            <button type="button" onClick={() => onPatch(pet.id, { star: STAR_GRADE * 12 })}>Crown</button>
            <button type="button" onClick={() => onPatch(pet.id, { star: 73 })}>Emblem</button>
            <button type="button" onClick={() => onPatch(pet.id, { star: MAX_STAR })}>Max</button>
          </div>

          <h3>Food grades</h3>
          <div className="cs-jump-row">
            {DATA.feedrank.map((grade, index) => (
              <button
                type="button"
                key={grade.name}
                className={`cs-grade${state.gA === index ? ' on' : ''}`}
                style={{ '--grade-color': grade.rgb, '--grade-ink': readableInk(grade.rgb) } as CSSProperties}
                onClick={() => onPatch(pet.id, { gA: index, gD: index, gH: index })}
              >
                {grade.name}
              </button>
            ))}
          </div>

          <h3>Next stage</h3>
          <p className="cs-note-text">
            {next
              ? `Stage ${next.stage} unlocks at star ${next.gate ?? '?'}. ${next.ready ? 'Reachable now.' : `${next.cost} duplicate boxes short.`}`
              : `${pet.name} is at its final stage.`}
          </p>
          {trialRows.length > 0 ? (
            <ul className="cs-trials">
              {trialRows.map((line, index) => <li key={index}>{line.text}{line.alt ? <em> {line.alt}</em> : null}</li>)}
            </ul>
          ) : (
            <p className="cs-note-text">No trial data cached for this transition.</p>
          )}
        </div>
      </div>
    </section>
  )
}