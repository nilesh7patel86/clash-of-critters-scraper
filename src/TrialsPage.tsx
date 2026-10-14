// Trials page.
//
// A read-only reference: one card per Tatari, listing the quests each of its
// evolutions asks for and the star gate that evolution sits behind. The roster
// shows the same lines in a tip when a card's evolution hint is clicked; this
// view lays the data out flat so every Tatari can be compared at once.
//
// Everything comes from the baked game tables (units.json + trials.json), so the
// page renders synchronously - there is no fetch and no error state, unlike the
// wiki-backed codex.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { DATA } from './gameData'
import { ELEMENT_ORDER, ELEMENTS, elementIconUrl } from './domain'
import SiteHeader from './SiteHeader'
import type { PageView } from './SiteHeader'
import IconSelect from './IconSelect'
import { trialIconUrl } from './petHelpers'
import { loadWikiStageArt, wikiImageUrl, wikiStageArt } from './wikiArt'
import { RARITY_COLORS } from './wikiCodex'
import { buildParameterIcons, buildTrials } from './trials'
import type { TatariTrials } from './trials'
import './TrialsPage.css'

type Theme = 'light' | 'dark'

// The tables are a static dump baked into the bundle, so the model is built once
// at module load rather than on every mount.
const MODEL = buildTrials(DATA.pets)

// Every trial parameter the tables use - the "counts" each quest advances
// (Feed, Shield, Glitter Fruit...), deduped and sorted for the filter menu.
const PARAMETERS = [...new Set(MODEL.flatMap((tatari) => tatari.params))].sort((a, b) => a.localeCompare(b))

// Each evolution step is tagged with the codex disc colour of the rarity it
// unlocks: the first step is Gold, the second Red, and the last Rainbow. Naming
// the rarities here (rather than restating hex) keeps these rows on the same
// palette the codex reads from.
const EVO_RARITY: Record<number, string | undefined> = { 1: 'Gold', 2: 'Red', 3: 'Rainbow' }

// The element filter's menu, built once: each row carries the element's own
// artwork and colour, matching the tag on a card.
const ELEMENT_FILTER_OPTIONS = [
  { value: '', label: 'All elements' },
  ...ELEMENT_ORDER.map((id) => ({
    value: String(id),
    label: ELEMENTS[id]?.label ?? String(id),
    icon: elementIconUrl(id),
    tint: ELEMENTS[id]?.color,
  })),
]

// The parameter filter's menu, built once too: a parameter is the tip a quest
// advances, drawn with that tip's trial icon, so the row reads like the quest
// line on the card below. A parameter the tables give no trial icon stays
// text-only rather than pointing at a missing file.
const PARAMETER_ICONS = buildParameterIcons(DATA.pets)
const PARAMETER_OPTIONS = [
  { value: '', label: 'All parameters' },
  ...PARAMETERS.map((name) => ({
    value: name,
    label: name,
    icon: PARAMETER_ICONS[name] ? trialIconUrl(PARAMETER_ICONS[name]) : null,
  })),
]

function rarityStyle(step: number): CSSProperties | undefined {
  const rarity = EVO_RARITY[step]
  if (!rarity) return undefined
  return { '--tr-rarity': RARITY_COLORS[rarity] } as CSSProperties
}

// A stage portrait out of the art index, shared by the card header (the line's
// base form) and each evolution row (the stage it unlocks). The index loads
// after first paint, so `epoch` (bumped by the page when it arrives) is used as
// the image key: it swaps the initials fallback for the real portrait.
function StagePortrait({ name, epoch, className }: { name: string; epoch: number; className: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = wikiImageUrl(wikiStageArt(name)?.normal)
  const broken = src !== null && failedSrc === src
  return (
    <div className={className}>
      {src && !broken ? (
        <img key={`${name}-${epoch}`} src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)} />
      ) : (
        <span className={`${className}-fallback`} aria-hidden="true">
          {name.slice(0, 2)}
        </span>
      )}
    </div>
  )
}

function TrialsCard({ tatari, artEpoch }: { tatari: TatariTrials; artEpoch: number }) {
  const tint = ELEMENTS[tatari.element]?.color ?? '#8892a8'
  const elementIcon = elementIconUrl(tatari.element)
  return (
    <article className={`tr-card${tatari.count === 0 ? ' tr-card-empty' : ''}`} style={{ '--tr-tint': tint } as CSSProperties}>
      <header className="tr-card-head">
        <StagePortrait name={tatari.name} epoch={artEpoch} className="tr-portrait" />
        <div className="tr-card-title">
          <h3>{tatari.name}</h3>
          <span className="tr-tag tr-tag-element">{elementIcon ? <img className="tr-tag-icon" src={elementIcon} alt="" loading="lazy" /> : null}{tatari.elementLabel}</span>
        </div>
        <div className="tr-card-meter" aria-hidden="true">
          <span>{tatari.count}</span>
          <small>{tatari.count === 1 ? 'trial' : 'trials'}</small>
        </div>
      </header>

      {tatari.transitions.length > 0 ? (
        <ol className="tr-transitions">
          {tatari.transitions.map((transition) => (
            <li
              key={transition.from}
              className={`tr-transition tr-evo-${transition.from}`}
              style={rarityStyle(transition.from)}
            >
              <div className="tr-transition-head">
                <StagePortrait name={transition.toName} epoch={artEpoch} className="tr-stage-portrait" />
                <span className="tr-step">
                  Evo {transition.from} {'\u2192'} {transition.to}
                </span>
                <span className="tr-stage" title={transition.toName}>
                  {transition.toName}
                </span>
                <span className="tr-gate" title="Star gate">
                  {'\u2605'}
                  {transition.gate ?? '?'}
                </span>
              </div>
              {transition.entries.length > 0 ? (
                <ul className="tr-trial-list">
                  {transition.entries.map((entry, index) => (
                    <li key={index}>
                      {entry.icon ? <img src={trialIconUrl(entry.icon)} alt="" loading="lazy" /> : null}
                      <span className="tr-trial-text">
                        {entry.text}
                        {entry.alt ? <em className="tr-trial-alt">{entry.alt}</em> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tr-none">No trial data for this evolution.</p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="tr-none">Single stage - this Tatari has no evolutions, so no trials.</p>
      )}
    </article>
  )
}

interface TrialsPageProps {
  theme: Theme
  onToggleTheme: () => void
  onNavigate: (view: PageView) => void
}

export default function TrialsPage({ theme, onToggleTheme, onNavigate }: TrialsPageProps) {
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    if (params.has('q')) return params.get('q') || ''
    try { return JSON.parse(localStorage.getItem('tt_trials_filters') || '{}').query || '' } catch { return '' }
  })
  const [element, setElement] = useState(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    if (params.has('element')) return params.get('element') || ''
    try { return JSON.parse(localStorage.getItem('tt_trials_filters') || '{}').element || '' } catch { return '' }
  })
  const [parameter, setParameter] = useState(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    if (params.has('parameter')) return params.get('parameter') || ''
    try { return JSON.parse(localStorage.getItem('tt_trials_filters') || '{}').parameter || '' } catch { return '' }
  })
  const [copied, setCopied] = useState(false)
  // The portraits come from the async art index; counting the load tells the
  // cards to re-resolve once it lands, and a failure is surfaced rather than
  // left looking like the Tatari simply have no art.
  const [artEpoch, setArtEpoch] = useState(0)
  const [artFailed, setArtFailed] = useState(false)

  useEffect(() => {
    let active = true
    loadWikiStageArt().then(
      () => {
        if (active) setArtEpoch((count) => count + 1)
      },
      () => {
        if (active) setArtFailed(true)
      },
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('tt_trials_filters', JSON.stringify({ query, element, parameter })) } catch {}
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (query) url.searchParams.set('q', query)
    else url.searchParams.delete('q')
    if (element) url.searchParams.set('element', element)
    else url.searchParams.delete('element')
    if (parameter) url.searchParams.set('parameter', parameter)
    else url.searchParams.delete('parameter')
    url.searchParams.set('view', 'trials')
    window.history.replaceState(null, '', url.toString())
  }, [query, element, parameter])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return MODEL.filter((tatari) => {
      if (element && String(tatari.element) !== element) return false
      if (parameter && !tatari.params.includes(parameter)) return false
      if (needle && !tatari.search.includes(needle)) return false
      return true
    }).sort((a, b) => {
      // Tatari with no trial data sink to the bottom, so the ones that actually
      // have trials lead the page rather than being scattered alphabetically.
      const aEmpty = a.count === 0
      const bEmpty = b.count === 0
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
      return a.name.localeCompare(b.name)
    })
  }, [query, element, parameter])

  const stats = useMemo(
    () => ({
      tatari: MODEL.length,
      withTrials: MODEL.filter((tatari) => tatari.count > 0).length,
      trials: MODEL.reduce((total, tatari) => total + tatari.count, 0),
    }),
    [],
  )

  const handleExport = useCallback(async () => {
    const rows = visible.map((tatari) => tatari.transitions.flatMap((transition) => transition.entries.map((entry) => `${tatari.name}\tEvo ${transition.from}->${transition.to}\t${transition.gate ?? ''}\t${entry.text}`))).join('\n')
    try {
      await navigator.clipboard.writeText(['Tatari\tEvolution\tStar gate\tTrial'].concat(rows ? [rows] : []).join('\n'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy the trials reference:', rows)
    }
  }, [visible])

  return (
    <div className="tr-shell">
      <SiteHeader theme={theme} view="trials" onToggleTheme={onToggleTheme} onNavigate={onNavigate} />
      <main className="tr-page">
        <div className="tr-backdrop" aria-hidden="true" />

        <section className="tr-hero">
          <div className="tr-hero-copy">
            <span className="eyebrow">Game tables</span>
            <h1>Evolution Trials</h1>
            <p>
              Every quest a Tatari&apos;s evolution asks for, straight from the game&apos;s trial tables. Each row is one
              evolution: the stage it unlocks, the star gate it needs and the quests to clear first.
            </p>
          </div>
          <dl className="tr-hero-stats">
            <div>
              <dt>Tatari</dt>
              <dd>{stats.tatari}</dd>
            </div>
            <div>
              <dt>With trials</dt>
              <dd>{stats.withTrials}</dd>
            </div>
            <div>
              <dt>Trials</dt>
              <dd>{stats.trials}</dd>
            </div>
          </dl>
        </section>

        <section className="tr-controls" aria-label="Filter the trials reference">
          <label className="tr-search">
            <span className="sr-only">Search Tatari and trial text</span>
            <input
              type="search"
              value={query}
              placeholder="Search a Tatari, a stage or a trial…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <IconSelect className="tr-field" label="Element" value={element} onChange={setElement} options={ELEMENT_FILTER_OPTIONS} />
          <IconSelect className="tr-field tr-field-param" label="Trial parameter" value={parameter} onChange={setParameter} options={PARAMETER_OPTIONS} />
          <p className="tr-result-count" role="status">
            {visible.length} of {MODEL.length} Tatari
          </p>
          <button type="button" className="tr-export" onClick={handleExport}>{copied ? 'Copied' : 'Copy visible trials'}</button>
        </section>

        <section className="tr-grid" aria-label="Tatari evolution trials">
          {visible.map((tatari) => (
            <TrialsCard key={tatari.id} tatari={tatari} artEpoch={artEpoch} />
          ))}
        </section>

        {visible.length === 0 ? <div className="tr-empty">No Tatari matches these filters.</div> : null}

        {artFailed ? (
          <div className="tr-warning" role="status">
            Could not load the artwork cache, so the cards show initials instead of portraits. Run{' '}
            <code>npm run scrape_app</code> to refresh it.
          </div>
        ) : null}
      </main>
    </div>
  )
}
