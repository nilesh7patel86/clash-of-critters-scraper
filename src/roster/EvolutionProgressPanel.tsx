// Trials Progress: the roster's evolution requirements as a list.
//
// One row per Tatari - the star gate its next evolution asks for, the stars it
// is still missing and the duplicate boxes that closes the gap - read from the
// same saved roster the editor uses. The maths is evolutionProgress', which is
// itself petHelpers' own, so a number here matches the hint on a roster card.
//
// This panel only reads. The roster comes from the session copy of
// persistence.ts, read once the way RosterPage reads it for first paint - minus
// the save hook, because edits belong on the Roster tab.
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { DATA } from '../gameData'
import type { PetUnit } from '../gameData'
import { ELEMENT_ORDER, ELEMENTS, elementIconUrl } from '../domain'
import { UNIT_BY_ID, boxUrl, formatCost, getEvoRange, getPetImage, petKey, qualityValue } from '../petHelpers'
import IconSelect from '../IconSelect'
import { RARITY_COLORS, rarityName } from '../wikiCodex'
import { evolutionProgress, progressTotals } from './evolutionProgress'
import type { EvolutionProgressRow } from './evolutionProgress'
import { initialLoad } from './persistence'
import type { Snapshot } from './stats'
import './EvolutionProgressPanel.css'

type SortChoice = 'least' | 'boxes' | 'progress' | 'name'

// The sort menu, built once: what each choice orders the list by, since the
// labels are longer than the value the state holds.
const SORT_OPTIONS: { value: SortChoice; label: string; description: string }[] = [
  { value: 'least', label: 'Least boxes first', description: 'Cheapest next evolution leads, maxed last' },
  { value: 'boxes', label: 'Most boxes first', description: 'Biggest next-evolution ask leads' },
  { value: 'progress', label: 'Least progress first', description: 'Furthest from its gate leads' },
  { value: 'name', label: 'Name A-Z', description: 'Stage name order' },
]

// The element menu, same rows the reference subtab's filter uses so the two
// controls read as one vocabulary across both tabs.
const ELEMENT_FILTER_OPTIONS = [
  { value: '', label: 'All elements' },
  ...ELEMENT_ORDER.map((id) => ({
    value: String(id),
    label: ELEMENTS[id]?.label ?? String(id),
    icon: elementIconUrl(id),
    tint: ELEMENTS[id]?.color,
  })),
]

// The tiers a Tatari can be sitting on now: the stage numbers the tables give
// an evolution chain, so 1 up to the longest chain in the data. Every tier the
// tables define is listed rather than only the ones currently occupied, which
// keeps the menu steady while the roster moves between tiers. No icon and no
// tint is set: the tables have no evolution-tier artwork (only star icons,
// which would read as star tiers), and a tier's rarity depends on the Tatari
// wearing it - tier 1 is Blue for a two-tier chain and Purple for a four-tier
// one - so one colour here would contradict the rows it filters.
const MAX_TIERS = Math.max(...DATA.pets.map((pet) => getEvoRange(pet.id)[1]))
const TIER_OPTIONS = [
  { value: '', label: 'All tiers' },
  ...Array.from({ length: MAX_TIERS }, (_, index) => ({
    value: String(index + 1),
    label: `Tier ${index + 1}`,
  })),
]

// The roster is the session copy in persistence.ts - memory, nothing written to
// browser storage - so this list follows whatever the Roster tab left there.
// Shared (#r=) links are shown as-is and never hydrated over, the same rule
// RosterPage applies - a shared link must not silently fall back to the session
// roster half a second after mount.
function useStoredSnapshot(): { snapshot: Snapshot; shared: boolean } {
  const [initial] = useState(initialLoad)
  return { snapshot: initial.model.present, shared: initial.shared }
}

function statusLabel(row: EvolutionProgressRow): string {
  if (row.status === 'maxed') return 'Maxed'
  if (row.status === 'no-gate') return 'No gate'
  if (row.status === 'ready') return row.trials > 0 ? 'Trials only' : 'Ready'
  return row.unreachable ? 'Gate unreachable' : 'Boxes needed'
}

// Statuses share one chip shape and differ by tone; the class is derived here
// so the table row never has to branch.
function statusTone(row: EvolutionProgressRow): string {
  if (row.status === 'maxed') return 'maxed'
  if (row.status === 'ready') return 'ready'
  return row.unreachable ? 'nogate' : 'blocked'
}

function pluralTrials(count: number): string {
  return `${count} ${count === 1 ? 'trial' : 'trials'}`
}

// One evolution tier in the "Boxes -> next" line: the word "Tier", its number
// and, when the chain ends here, that too. The tier is painted in the rarity of
// the stage it names - the quality id the game stores on that stage, read
// through the same rarity vocabulary the codex and the reference subtab use, so
// "Tier 1" is Purple for a Tatari whose first form is Purple and Blue for one
// whose first form is Blue.
function TierToken({ pet, stage, final }: { pet: PetUnit | undefined; stage: number; final?: boolean }) {
  const rarity = pet ? rarityName(qualityValue(stage, pet)) : null
  const tint = rarity ? RARITY_COLORS[rarity] : undefined
  return (
    <span className="tp-tier" style={tint ? ({ '--tp-tier': tint } as CSSProperties) : undefined} title={rarity ?? undefined}>
      Tier {stage}
      {final ? ' (final)' : ''}
    </span>
  )
}

// The tier line under "Boxes -> next": which evolution tier the Tatari sits on
// now and which one the boxes buy. Tier counts up from 1 in the order the
// evolution chain runs, so a two-tier Tatari only ever shows two numbers and a
// maxed one reports its last tier as final.
function TierLine({ row, pet }: { row: EvolutionProgressRow; pet: PetUnit | undefined }) {
  if (row.nextStage === null) return <TierToken pet={pet} stage={row.stage} final />
  if (row.stage === row.nextStage) return <TierToken pet={pet} stage={row.stage} />
  return (
    <>
      <TierToken pet={pet} stage={row.stage} />
      <span className="tp-tier-arrow"> → </span>
      <TierToken pet={pet} stage={row.nextStage} />
    </>
  )
}

function ProgressRow({ row, epoch, shiny }: { row: EvolutionProgressRow; epoch: number; shiny: boolean }) {
  const pet = UNIT_BY_ID.get(row.id)
  const element = pet ? ELEMENTS[pet.el] : undefined
  const elementIcon = pet ? elementIconUrl(pet.el) : null
  // The roster's Glitter flag picks the portrait variant, exactly as on a card.
  const art = pet ? getPetImage(pet, row.stage, shiny) : { src: '', fallbackSrc: null }
  const src = art.src || art.fallbackSrc || ''
  const percent = Math.round(row.progress * 100)
  return (
    <tr style={{ '--tp-element': element?.color ?? 'var(--tr-tint-default)' } as CSSProperties}>
      <th scope="row" className="tp-cell-name">
        <span className="tp-name-inner">
          <span className="tp-portrait" aria-hidden="true">
            {src ? <img key={`${row.id}-${epoch}`} src={src} alt="" loading="lazy" decoding="async" /> : row.name.slice(0, 2)}
          </span>
          <span>
            <span className="tp-stage-name">{row.name}</span>
            <span className="tp-el-tag">
              {elementIcon ? <img src={elementIcon} alt="" loading="lazy" decoding="async" /> : null}
              {element?.label ?? 'Unknown'}
            </span>
          </span>
        </span>
      </th>
      <td className="tp-cell-next">
        {row.nextName ? (
          <>
            <span className="tp-next-name">{row.nextName}</span>
            <span className="tp-sub">{row.trials > 0 ? pluralTrials(row.trials) : 'No trials'}</span>
          </>
        ) : (
          <span className="tp-sub">Last stage</span>
        )}
      </td>
      <td className="tp-cell-num">
        {row.gate === null ? (
          <span className="tp-sub">—</span>
        ) : (
          <>
            <span className="tp-stars">
              <strong>★{row.star}</strong> / ★{row.gate}
            </span>
            <span className="tp-sub">{row.starsNeeded > 0 ? `${row.starsNeeded} to go` : 'Gate met'}</span>
          </>
        )}
      </td>
      <td className="tp-cell-num">
        <span className="tp-box-count">
          <img className="tp-box" src={boxUrl()} alt="" loading="lazy" decoding="async" />
          {row.status === 'maxed' ? '—' : formatCost(row.boxes)}
        </span>
        <span className="tp-sub">
          <TierLine row={row} pet={pet} />
        </span>
      </td>
      <td className="tp-cell-num">
        <span className="tp-box-count">
          <img className="tp-box" src={boxUrl()} alt="" loading="lazy" decoding="async" />
          {formatCost(row.boxesToFinal)}
        </span>
        <span className="tp-sub">all remaining gates</span>
      </td>
      <td className="tp-cell-progress">
        <span className="tp-bar">
          <span className="tp-bar-fill" style={{ width: `${percent}%` }} />
        </span>
        <span className="tp-pct">{percent}%</span>
      </td>
      <td className="tp-cell-status">
        <span className={`tp-chip tp-chip--${statusTone(row)}`}>{statusLabel(row)}</span>
      </td>
    </tr>
  )
}

export function EvolutionProgressPanel({ artEpoch }: { artEpoch: number }) {
  const { snapshot, shared } = useStoredSnapshot()
  const [query, setQuery] = useState('')
  const [element, setElement] = useState('')
  const [tier, setTier] = useState('')
  const [ownedOnly, setOwnedOnly] = useState(true)
  const [sort, setSort] = useState<SortChoice>('least')

  const all = useMemo(() => evolutionProgress(snapshot), [snapshot])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = all.filter((row) => {
      if (ownedOnly && !row.owned) return false
      if (element && String(UNIT_BY_ID.get(row.id)?.el ?? '') !== element) return false
      if (tier && String(row.stage) !== tier) return false
      if (needle && !`${row.name} ${row.nextName ?? ''}`.toLowerCase().includes(needle)) return false
      return true
    })
    if (sort === 'name') return rows.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'progress') return rows.sort((a, b) => a.progress - b.progress || b.boxes - a.boxes || a.id - b.id)
    if (sort === 'least')
      // Maxed Tatari own zero boxes, so an ascending order would fill the top
      // of the list with rows there is nothing to do about; they sink to the
      // bottom instead, the way the reference sinks Tatari with no trials.
      return rows.sort(
        (a, b) => (a.status === 'maxed' ? 1 : 0) - (b.status === 'maxed' ? 1 : 0) || a.boxes - b.boxes || a.id - b.id,
      )
    return rows.sort((a, b) => b.boxes - a.boxes || a.id - b.id)
  }, [all, element, ownedOnly, query, sort, tier])

  // The hero counts always describe the whole owned roster, not the filtered
  // list: they are the "where do I stand" numbers, and the filtered count sits
  // next to the controls where it belongs.
  const totals = useMemo(() => progressTotals(all.filter((row) => row.owned)), [all])

  return (
    <div className="tp-root">
      <section className="tr-hero">
        <div className="tr-hero-copy">
          <span className="eyebrow">Your roster</span>
          <h1>Trials Progress</h1>
          <p>
            How far each Tatari is from its next evolution, priced in duplicate boxes: the star gate the stage asks
            for, the stars still missing and the box cost of closing the gap.
          </p>
        </div>
        <dl className="tr-hero-stats">
          <div>
            <dt>Owned</dt>
            <dd>
              {totals.owned}
              <span className="tp-stat-of">/{DATA.pets.length}</span>
            </dd>
          </div>
          <div>
            <dt>Gate met</dt>
            <dd>{totals.ready}</dd>
          </div>
          <div>
            <dt>Boxes → next</dt>
            <dd>{formatCost(totals.boxes)}</dd>
          </div>
          <div>
            <dt>Boxes → final</dt>
            <dd>{formatCost(totals.boxesToFinal)}</dd>
          </div>
        </dl>
      </section>

      <section className="tr-controls" aria-label="Filter the evolution progress">
        <label className="tr-search">
          <span className="sr-only">Search Tatari stages</span>
          <input
            type="search"
            value={query}
            placeholder="Search a stage…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <IconSelect className="tr-field" label="Element" value={element} onChange={setElement} options={ELEMENT_FILTER_OPTIONS} />
        <IconSelect className="tr-field" label="Current tier" value={tier} onChange={setTier} options={TIER_OPTIONS} />
        <IconSelect
          className="tr-field tr-field-param"
          label="Order by"
          value={sort}
          onChange={(value) => setSort(value as SortChoice)}
          options={SORT_OPTIONS}
        />
        <button type="button" className="tp-toggle" aria-pressed={ownedOnly} onClick={() => setOwnedOnly((on) => !on)}>
          Owned only
        </button>
        <p className="tr-result-count" role="status">
          {visible.length} of {all.length} Tatari
        </p>
      </section>

      {visible.length > 0 ? (
        <div className="tp-scroll">
          <table className="tp-table">
            <caption className="sr-only">
              Evolution progress: star gate, boxes needed and progress for each Tatari
            </caption>
            <thead>
              <tr>
                <th scope="col">Tatari</th>
                <th scope="col">Next evolution</th>
                <th scope="col">Stars / gate</th>
                <th scope="col">Boxes → next</th>
                <th scope="col">Boxes → final</th>
                <th scope="col">Progress</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <ProgressRow
                  key={row.id}
                  row={row}
                  epoch={artEpoch}
                  shiny={snapshot.R[petKey(row.id)]?.shiny ?? false}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tr-empty">No Tatari matches these filters.</div>
      )}

      <p className="tp-source">
        {shared
          ? 'Showing the shared roster link. Your session roster is not used while a shared link is open.'
          : 'Stars and stages come from the roster this session is holding - edit them on the Roster tab and this list follows. Nothing is saved, so export a copy if you want to keep it.'}
      </p>
    </div>
  )
}
