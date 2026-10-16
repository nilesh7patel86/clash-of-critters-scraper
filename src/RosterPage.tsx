import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DATA } from './gameData'
import { ELEMENT_ORDER, ELEMENTS, clamp, clampProgress, elementIconUrl, isRecord, maxProgressForLevel } from './domain'
import type { ElementId } from './domain'
import Sidebar from './Sidebar'
import IconSelect from './IconSelect'
import { loadWikiStageArt } from './wikiArt'
import { MAX_STAR, UNIT_BY_ID, boxUrl, getEvoRange, getStageName, getUnit, hasShiny, nextEvolution, petKey } from './petHelpers'
import type { GradeKey, PetState } from './petHelpers'
import { sortIds } from './roster/stats'
import type { Snapshot } from './roster/stats'
import { FILTERS, encodeState, hydrateStoredState, initialLoad, integer, modelReducer, normalizePet, normalizeSnapshot, normalizeTrainer, normalizeUi, useRosterSave } from './roster/persistence'
import { PetCard } from './roster/components/PetCard'
import { StarCostModal } from './roster/components/StarCostModal'
import { TrialsTip } from './roster/components/TrialsTip'

type RosterPageProps = {
  header: ReactNode
}

type Status = { id: number; message: string; tone: 'info' | 'success' | 'error' }

// The element filter's menu, built once: the labels and their artwork never
// change, and every entry carries the element's own icon and colour so the row
// reads the same as the badge on a card.
const ELEMENT_FILTER_OPTIONS = [
  { value: '0', label: 'All elements' },
  ...ELEMENT_ORDER.map((element) => ({
    value: String(element),
    label: ELEMENTS[element].label,
    icon: elementIconUrl(element),
    tint: ELEMENTS[element].color,
  })),
]

function RosterPage({ header }: RosterPageProps) {
  const [initial] = useState(initialLoad)
  const [model, dispatch] = useReducer(modelReducer, initial.model)
  const [shared, setShared] = useState(initial.shared)
  const [statuses, setStatuses] = useState<Status[]>(initial.error ? [{ id: 1, message: initial.error, tone: 'error' }] : [])
  const dismissStatus = useCallback((id: number) => {
    setStatuses((current) => current.filter((entry) => entry.id !== id))
  }, [])
  const [modalOpen, setModalOpen] = useState(false)
  const [trialsTip, setTrialsTip] = useState<{ id: number; anchor: HTMLElement } | null>(null)
  const closeTrialsTip = useCallback(() => setTrialsTip(null), [])
  const [bulkStar, setBulkStar] = useState(64)
  const [bulkEvolution, setBulkEvolution] = useState(4)
  const [bulkGrade, setBulkGrade] = useState(0)
  const [order] = useState(() => sortIds(DATA.pets, initial.model.present, initial.model.ui.srt))
  const [hydrated, setHydrated] = useState(initial.shared)
  const fileInput = useRef<HTMLInputElement>(null)
  const current = model.present
  const trialsPet = trialsTip ? getUnit(trialsTip.id) : null
  const trialsState = trialsTip ? current.R[petKey(trialsTip.id)] : undefined
  const trialsNext = trialsPet && trialsState ? nextEvolution(trialsPet, trialsState.star, trialsState.evo) : null
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === 'undefined' ? false : window.localStorage.getItem('tt_sidebar') === '1'))
  const [wikiArtFailed, setWikiArtFailed] = useState(false)
  // Counts the wiki artwork loads. The cards are memoised on their props, so
  // this is what tells them to re-resolve their portraits when the cache
  // finishes loading after first paint.
  const [artEpoch, setArtEpoch] = useState(0)

  useEffect(() => {
    let active = true
    loadWikiStageArt().then(
      () => { if (active) setArtEpoch((count) => count + 1) },
      // A failed fetch leaves the cards without portraits, so this is a notice
      // rather than an error - but a silent catch would look like the scrape had
      // simply never found any artwork.
      () => { if (active) setWikiArtFailed(true) },
    )
    return () => { active = false }
  }, [])

  const showStatus = useCallback((message: string, tone: Status['tone'] = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setStatuses((current) => [...current, { id, message, tone }])
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        setStatuses((current) => current.filter((entry) => entry.id !== id))
      }, 5000)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('tt_sidebar', sidebarOpen ? '1' : '0')
    } catch {
      return
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (!sidebarOpen || typeof window === 'undefined') return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [sidebarOpen])

  // The true store is IndexedDB, whose read is asynchronous. First paint uses
  // the synchronous localStorage mirror, then this adopts the IndexedDB copy
  // (a no-op when they match, which is the normal case). Shared #r= links skip
  // this so the shared roster is never clobbered. Saves stay gated on
  // `hydrated` so an early edit can't race the adoption.
  const skipRestore = initial.shared
  useEffect(() => {
    if (skipRestore) return
    let active = true
    void hydrateStoredState().then((stored) => {
      if (!active) return
      if (stored) {
        dispatch({ type: 'ui', ui: stored.ui })
        dispatch({ type: 'adopt', snapshot: stored.snapshot })
      }
      setHydrated(true)
    })
    return () => {
      active = false
    }
  }, [skipRestore])

  useRosterSave(current, model.ui, shared, hydrated)

  useEffect(() => {
    if (!modalOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [modalOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shared || !(event.ctrlKey || event.metaKey)) return
      const target = event.target
      const textInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)
      if (textInput) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      } else if (key === 'y') {
        event.preventDefault()
        dispatch({ type: 'redo' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shared])

  // Updates arrive as an updater rather than a finished snapshot so the
  // reducer can apply them to the newest state, and so the callbacks handed to
  // every card stay identical across edits - React.memo on PetCard is only as
  // good as the stability of these.
  const updateSnapshot = useCallback((updater: (snapshot: Snapshot) => Snapshot) => {
    if (shared) return
    dispatch({ type: 'update', updater })
  }, [shared])

  const updatePet = useCallback((id: number, updater: (state: PetState) => PetState) => {
    updateSnapshot((snapshot) => {
      const pet = getUnit(id)
      const next = normalizePet(pet, updater(snapshot.R[petKey(id)]))
      return { ...snapshot, R: { ...snapshot.R, [petKey(id)]: next } }
    })
  }, [updateSnapshot])

  const handleOwn = useCallback((id: number, own: boolean) => updatePet(id, (state) => ({ ...state, own })), [updatePet])
  const handleShiny = useCallback((id: number) => {
    // The guard lives inside the updater: a pet without glitter art returns its
    // own state, which the reducer treats as the no-op it is.
    updatePet(id, (state) => (hasShiny(getUnit(id), state.evo) ? { ...state, shiny: !state.shiny } : state))
  }, [updatePet])
  const handleEvolution = useCallback((id: number, stage: number) => updatePet(id, (state) => ({ ...state, evo: stage })), [updatePet])
  const handleGrade = useCallback((id: number, key: GradeKey, direction: number) => {
    updatePet(id, (state) => ({ ...state, [key]: clamp(state[key] + direction, 0, DATA.feedrank.length - 1) }))
  }, [updatePet])
  const handleStarIncrement = useCallback((id: number) => {
    updatePet(id, (state) => ({ ...state, star: Math.min(MAX_STAR, state.star + 1) }))
  }, [updatePet])
  const handleStarDecrement = useCallback((id: number) => {
    updatePet(id, (state) => ({ ...state, star: Math.max(0, state.star - 1) }))
  }, [updatePet])
  const handleTrials = useCallback((id: number, anchor: HTMLElement) => setTrialsTip({ id, anchor }), [])
  const handleBadge = useCallback((element: ElementId, floor: number) => {
    updateSnapshot((snapshot) => {
      const key = String(element)
      return { ...snapshot, GYM: { ...snapshot.GYM, [key]: snapshot.GYM[key] === floor ? Math.max(0, floor - 1) : floor } }
    })
  }, [updateSnapshot])
  const handleTrainer = useCallback((field: 'lvl' | 'pr', value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    updateSnapshot((snapshot) => {
      const level = field === 'lvl' ? clamp(Math.trunc(parsed), 1, DATA.maxtrainer || 2400) : snapshot.TR.lvl
      return { ...snapshot, TR: { lvl: level, pr: field === 'pr' ? clampProgress(level, Math.trunc(parsed)) : clampProgress(level, snapshot.TR.pr) } }
    })
  }, [updateSnapshot])

  const handleUndo = useCallback(() => {
    if (!shared) dispatch({ type: 'undo' })
  }, [shared])
  const handleRedo = useCallback(() => {
    if (!shared) dispatch({ type: 'redo' })
  }, [shared])

  // Sorting was removed on request: the "Resort" button and Sort dropdown no
  // longer exist, and `order` is frozen at the first-load sort so the grid
  // keeps a stable sequence while the roster is edited. A new sort UI can be
  // rebuilt on top of the still-intact `sortIds`/`SORT_KEYS` vocabulary in
  // roster/stats.ts, and `ui.srt` is still persisted for it to read back.

  const handleFilter = useCallback((value: string) => {
    if (!FILTERS.includes(value as (typeof FILTERS)[number])) return
    dispatch({ type: 'ui', ui: { flt: value } })
  }, [])

  const handleBulkApply = useCallback(() => {
    updateSnapshot((snapshot) => {
      const R = { ...snapshot.R }
      for (const pet of DATA.pets) {
        const [, maxEvo] = getEvoRange(pet.id)
        R[petKey(pet.id)] = normalizePet(pet, { ...R[petKey(pet.id)], star: bulkStar, evo: Math.min(bulkEvolution, maxEvo), gA: bulkGrade, gD: bulkGrade, gH: bulkGrade })
      }
      return { ...snapshot, R }
    })
    showStatus('Bulk roster values applied.', 'success')
  }, [bulkEvolution, bulkGrade, bulkStar, showStatus, updateSnapshot])
  const handleOwnAll = useCallback((owned: boolean) => {
    updateSnapshot((snapshot) => {
      const R = { ...snapshot.R }
      for (const pet of DATA.pets) R[petKey(pet.id)] = { ...R[petKey(pet.id)], own: owned }
      return { ...snapshot, R }
    })
    showStatus(owned ? 'All Tatari marked owned.' : 'All Tatari marked unowned.', 'success')
  }, [showStatus, updateSnapshot])
  const handleResetGrades = useCallback(() => {
    updateSnapshot((snapshot) => {
      const R = { ...snapshot.R }
      for (const pet of DATA.pets) R[petKey(pet.id)] = { ...R[petKey(pet.id)], gA: 0, gD: 0, gH: 0 }
      return { ...snapshot, R }
    })
    showStatus('All grades reset to E.', 'success')
  }, [showStatus, updateSnapshot])

  const handleExport = useCallback(() => {
    const payload = { v: 2, R: current.R, GYM: current.GYM, ui: model.ui }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'coc_roster.json'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    showStatus('Roster exported as coc_roster.json.', 'success')
  }, [current, model.ui, showStatus])

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file || shared) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isRecord(parsed) || !isRecord(parsed.R ?? parsed.r)) throw new Error('Roster data is required')
      const snapshot = normalizeSnapshot(parsed, true, false, parsed.r === undefined)
      snapshot.TR = parsed.TR || parsed.t ? normalizeTrainer(parsed.TR ?? parsed.t) : current.TR
      dispatch({ type: 'commit', snapshot })
      dispatch({ type: 'ui', ui: normalizeUi(parsed.ui) })
      showStatus(`Imported ${file.name}.`, 'success')
    } catch {
      showStatus('That file is not a valid roster JSON file.', 'error')
    } finally {
      input.value = ''
    }
  }, [current.TR, shared, showStatus])

  const handleShare = useCallback(async () => {
    const roster: Record<string, number[]> = {}
    DATA.pets.forEach((pet) => {
      const state = current.R[petKey(pet.id)]
      if (state?.own) roster[petKey(pet.id)] = [state.star, state.evo, state.gA, state.gD, state.gH, state.shiny ? 1 : 0]
    })
    const payload = { v: 1, r: roster, g: current.GYM, t: current.TR }
    let encoded = ''
    try {
      encoded = encodeState(payload)
      const link = `${window.location.origin}${window.location.pathname}${window.location.search}#r=${encoded}`
      try {
        window.history.replaceState(null, '', `#r=${encoded}`)
      } catch {
        showStatus('Roster link is ready to copy.', 'info')
      }
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'Tatari roster', text: 'Tatari roster', url: link })
          showStatus('Roster shared.', 'success')
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            showStatus('Share cancelled.', 'info')
            return
          }
        }
      }
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(link)
          showStatus('Share link copied to the clipboard.', 'success')
          return
        } catch {
          showStatus('Copy this roster link:', 'info')
        }
      }
      if (typeof window.prompt === 'function') window.prompt('Copy this roster link:', link)
      showStatus('Roster link ready to share.', 'success')
    } catch {
      showStatus('Could not create a roster link.', 'error')
    }
  }, [current, showStatus])

  const handleUseShared = useCallback(() => {
    if (!shared) return
    dispatch({ type: 'adopt', snapshot: current })
    setShared(false)
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    } catch {
      showStatus('Shared roster adopted locally.', 'success')
      return
    }
    showStatus('Shared roster is now your local roster.', 'success')
  }, [current, shared, showStatus])

  const [rosterQuery, setRosterQuery] = useState('')
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'roomy'>(() => {
    try { return (localStorage.getItem('tt_roster_density') as 'compact' | 'comfortable' | 'roomy') || 'comfortable' } catch { return 'comfortable' }
  })
  useEffect(() => { try { localStorage.setItem('tt_roster_density', density) } catch {} }, [density])

  const visibleIds = useMemo(() => {
    const known = new Set(order)
    const complete = [...order.filter((id) => UNIT_BY_ID.has(id)), ...DATA.pets.map((pet) => pet.id).filter((id) => !known.has(id))]
    const needle = rosterQuery.trim().toLowerCase()
    return complete.filter((id) => {
      const pet = getUnit(id)
      if (model.ui.flt !== '0' && pet.el !== Number(model.ui.flt)) return false
      if (!needle) return true
      const stageName = getStageName(pet, current.R[petKey(id)].evo) || ''
      return `${stageName} ${pet.name ?? ''}`.toLowerCase().includes(needle)
    })
  }, [model.ui.flt, order, rosterQuery, current])
  const visiblePets = useMemo(() => visibleIds.map((id) => getUnit(id)), [visibleIds])
  const ownedCount = DATA.pets.filter((pet) => current.R[petKey(pet.id)].own).length
  const trainer = current.TR
  const gym = current.GYM
  const progressMax = maxProgressForLevel(trainer.lvl)

  return (
    <div className="app-shell">
      {header}
      <main className="page">

        {shared ? <div className="shared-banner" role="status"><div><strong>Shared roster view</strong><span>Edits are disabled so this link cannot change your saved roster.</span></div><button type="button" onClick={handleUseShared}>Use this roster</button></div> : null}
        {wikiArtFailed ? <div className="data-warning-banner" role="status">Could not load the artwork cache, so the cards have no portraits. Run <code>npm run scrape_app</code> to refresh the cache.</div> : null}
        <div className="page-layout">
          <section className="roster-section">
            <div className="section-heading roster-heading"><div><span className="eyebrow">Collection</span><h2>Roster editor</h2></div><div className="owned-count"><strong>{ownedCount}</strong><span>of {DATA.pets.length} owned</span></div></div>
            <div className="panel roster-panel">
              <div className="roster-toolbar">
                <button type="button" onClick={handleUndo} disabled={shared || model.past.length === 0}>Undo</button><button type="button" onClick={handleRedo} disabled={shared || model.future.length === 0}>Redo</button>
                <label className="bulk-field">Star <input type="number" min="0" max={MAX_STAR} value={bulkStar} onChange={(event) => setBulkStar(clamp(integer(Number(event.target.value), 0), 0, MAX_STAR))} disabled={shared} /></label>
                <label className="bulk-field">Evolution <input type="number" min="1" max="4" value={bulkEvolution} onChange={(event) => setBulkEvolution(clamp(integer(Number(event.target.value), 1), 1, 4))} disabled={shared} /></label>
                <label className="bulk-field">Grade <select value={bulkGrade} onChange={(event) => setBulkGrade(Number(event.target.value))} disabled={shared}>{DATA.feedrank.map((grade, index) => <option value={index} key={grade.name}>{grade.name} +{grade.atk}%</option>)}</select></label>
                <button type="button" onClick={handleBulkApply} disabled={shared}>Apply to all</button>
                <button type="button" onClick={() => handleOwnAll(true)} disabled={shared}>Own all</button>
                <button type="button" onClick={() => handleOwnAll(false)} disabled={shared}>Own none</button>
                <button type="button" onClick={handleResetGrades} disabled={shared}>Reset grades</button>
                <IconSelect className="select-field" label="Element" value={model.ui.flt} onChange={handleFilter} options={ELEMENT_FILTER_OPTIONS} />
                <input type="search" className="roster-search" value={rosterQuery} onChange={(event) => setRosterQuery(event.target.value)} placeholder="Search" aria-label="Search roster" />
                <label className="density-field">Density <select value={density} onChange={(event) => setDensity(event.target.value as 'compact' | 'comfortable' | 'roomy')}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="roomy">Roomy</option></select></label>
                <button type="button" className="cost-reference-button" onClick={() => setModalOpen(true)}><img src={boxUrl()} alt="" />Cost reference</button>
              </div>
              <div className={`roster-grid density-${density}`}>{visiblePets.map((pet) => <PetCard key={pet.id} pet={pet} state={current.R[petKey(pet.id)]} trainer={current.TR} gym={current.GYM} disabled={shared} artEpoch={artEpoch} onOwn={handleOwn} onShiny={handleShiny} onStarIncrement={handleStarIncrement} onStarDecrement={handleStarDecrement} onEvolution={handleEvolution} onGrade={handleGrade} onTrials={handleTrials} />)}</div>
              {visiblePets.length === 0 ? <div className="empty-state">{rosterQuery.trim() ? 'No pets match your search.' : 'No Tatari match this element.'}</div> : null}
            </div>
          </section>
          <Sidebar open={sidebarOpen} trainer={trainer} gym={gym} progressMax={progressMax} shared={shared} fileInput={fileInput} onTrainer={handleTrainer} onBadge={handleBadge} onShare={handleShare} onExport={handleExport} onImport={handleImport} onOpen={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)} />
        </div>
      </main>
      {statuses.length ? <div className="toast-stack" aria-live="polite">{statuses.map((status) => <div key={status.id} className={`toast ${status.tone}`} role="status" style={{ bottom: `${22 + statuses.indexOf(status) * 74}px` }}><span className="toast-message">{status.message}</span><button type="button" className="toast-dismiss" aria-label="Dismiss status" onClick={() => dismissStatus(status.id)}>x</button></div>)}</div> : null}
      {modalOpen ? <StarCostModal onClose={() => setModalOpen(false)} /> : null}
      {trialsTip && trialsPet && trialsState && trialsNext ? <TrialsTip pet={trialsPet} state={trialsState} next={trialsNext} anchor={trialsTip.anchor} onClose={closeTrialsTip} /> : null}
    </div>
  )
}

export default RosterPage
