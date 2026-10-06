// Codex page.
//
// Where the roster editor answers "what do I own", the codex answers "what
// exists". It is built from the wiki cache alone, so it can show lines the game
// tables have no id for - the Dolphie family, the six ungrouped rows, and the
// Rainbow fourth forms the game stops short of.
//
// Everything numeric on a card comes from the wiki. A stage with no growth
// record says so; it is never given a made-up value.

import { useCallback, useEffect, useMemo, useState } from 'react'
import SiteHeader from './SiteHeader'
import type { PageView } from './SiteHeader'
import CodexFilterSelect from './CodexFilterSelect'
import {
  ELEMENT_COLORS,
  ELEMENT_ORDER,
  RARITY_COLORS,
  RARITY_NEON,
  RARITY_ORDER,
  gradeWeight,
  loadCodex,
  rarityRank,
  wikiImageUrl,
} from './wikiCodex'
import type { CodexModel, WikiStage } from './wikiCodex'
import './CodexPage.css'

type Theme = 'light' | 'dark'

type SortKey = 'name' | 'element' | 'rarity' | 'size'

type DossierTab = 1 | 2 | 3

/** Element or role name to the wiki's icon for it, skipping anything unmapped. */
function iconLookup(entries: { name: string; image: string }[] | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of entries ?? []) {
    const url = entry.name ? wikiImageUrl(entry.image) : null
    if (url) map[entry.name] = url
  }
  return map
}

/**
 * A wiki icon beside a label. The tag already spells the name out in text, so
 * the image is decorative for a screen reader and only carries a tooltip.
 */
function WikiIcon({ src, alt }: { src: string | null | undefined; alt: string }) {
  if (!src) return null
  return <img className="cx-tag-icon" src={src} alt="" title={alt} loading="lazy" />
}

type Filters = {
  query: string
  element: string
  rarity: string
  role: string
  group: 'all' | 'documented' | 'wiki-only' | 'in-game'
  sort: SortKey
}

const ELEMENT_RANK = new Map(ELEMENT_ORDER.map((element, index) => [element, index]))

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'element', label: 'Element' },
  { key: 'rarity', label: 'Top rarity' },
  { key: 'size', label: 'Line length' },
]

// The dossier of a four-stage line is taller than any screen, so its sections
// are tabs rather than one long column: the stage itself, the Horde line, then
// the food track.
const DOSSIER_TABS: { id: DossierTab; label: string }[] = [
  { id: 1, label: 'Stage' },
  { id: 2, label: 'Zobo Horde' },
  { id: 3, label: 'Food Track' },
]

function gradeLabel(grade: string | undefined): string {
  return grade ? grade : '-'
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function StatBar({ label, icon, grade, tint }: { label: string; icon: string | null; grade: string | undefined; tint: string }) {
  const weight = gradeWeight(grade)
  return (
    <div className="cx-stat" title={`${label}: ${gradeLabel(grade)}`}>
      <span className="cx-stat-label">
        {icon ? <img className="cx-stat-icon" src={wikiImageUrl(icon) ?? ''} alt="" loading="lazy" /> : null}
        {label}
      </span>
      <span className="cx-stat-track">
        <span className="cx-stat-fill" style={{ width: percent(weight), background: tint }} />
      </span>
      <span className="cx-stat-grade">{gradeLabel(grade)}</span>
    </div>
  )
}

function StageNode({ stage, active, onSelect }: { stage: WikiStage; active: boolean; onSelect: () => void }) {
  const [broken, setBroken] = useState(false)
  const src = wikiImageUrl(stage.normal)
  const tint = stage.element ? ELEMENT_COLORS[stage.element] : '#8892a8'
  // The art disc is lit from the stage's own rarity, so --cx-rarity and its
  // neon core --cx-glow both sit on the button: the gradient, the ring and the
  // glow outside it all read from the same pair.
  const rarityTint = stage.rarity ? RARITY_COLORS[stage.rarity] : undefined
  const rarityGlow = stage.rarity ? RARITY_NEON[stage.rarity] : undefined
  return (
    <button
      type="button"
      className={`cx-node${active ? ' cx-node-active' : ''}${broken ? ' cx-node-broken' : ''}`}
      style={{ '--cx-tint': tint, '--cx-rarity': rarityTint, '--cx-glow': rarityGlow } as React.CSSProperties}
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${stage.name}, stage ${stage.stage} of ${stage.family ?? stage.name}${stage.rarity ? `, ${stage.rarity} rarity` : ''}`}
    >
      <span className="cx-node-art">
        {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <span className="cx-node-art-fallback">{stage.name.slice(0, 2)}</span>}
        {stage.glitter ? <span className="cx-node-glitter" title="Glitter artwork available" /> : null}
      </span>
      <span className="cx-node-stage">{stage.stage}</span>
      <span className="cx-node-name">{stage.name}</span>
    </button>
  )
}

function CodexCard({
  model,
  line,
  index,
  elementIcons,
  roleIcons,
}: {
  model: CodexModel
  line: CodexModel['lines'][number]
  index: number
  elementIcons: Record<string, string>
  roleIcons: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  // Selection is per card, so opening one line's dossier can never show a
  // stage from another line.
  const [selected, setSelected] = useState<WikiStage | null>(null)
  // Tab choice is per card as well, and always restarts on the stage tab: a
  // newly picked stage has its food track and Horde line one click away.
  const [tab, setTab] = useState<DossierTab>(1)
  const tint = line.element ? ELEMENT_COLORS[line.element] : '#8892a8'
  const rarity = line.topRarity
  const wikiOnly = !line.inGame
  const partial = line.stages.some((stage) => !stage.growth)
  const growth = selected?.growth ?? line.stages.find((stage) => stage.growth)?.growth ?? null
  // A line can carry more than one role, so the card lists the roles it covers
  // rather than picking one for the line.
  const lineRoles = line.roles
  // Ids come from the grid position: every card can be open at once, and a line
  // key is a display name, so it is not safe to put in an id.
  const idBase = `cx-card-${index}`
  // A tab with nothing in it is disabled rather than hidden, so the three tabs
  // always stay in the same three places.
  const counts: Record<DossierTab, number | null> = { 1: null, 2: line.hordeSkills.length, 3: selected?.feeding.length ?? 0 }

  const showStage = (stage: WikiStage) => {
    setSelected(stage)
    setTab(1)
    setOpen(true)
  }

  return (
    <article className={`cx-card${open ? ' cx-card-open' : ''}`} style={{ '--cx-tint': tint } as React.CSSProperties}>
      <div className="cx-card-frame" aria-hidden="true" />
      <header className="cx-card-head">
        <div className="cx-card-title">
          <h3>{line.name}</h3>
          <div className="cx-card-tags">
            {line.element ? (
              <span className="cx-tag cx-tag-element">
                <WikiIcon src={elementIcons[line.element]} alt={line.element} />
                {line.element}
              </span>
            ) : (
              <span className="cx-tag cx-tag-muted">Element unknown</span>
            )}
            {lineRoles.map((role) => (
              <span className="cx-tag cx-tag-role" key={role}>
                <WikiIcon src={roleIcons[role]} alt={role} />
                {role}
              </span>
            ))}
            {rarity ? <span className="cx-tag cx-tag-rarity" style={{ '--cx-tag': RARITY_COLORS[rarity] ?? '#8892a8' } as React.CSSProperties}>{rarity}</span> : null}
            <span className={`cx-tag${wikiOnly ? ' cx-tag-warn' : ' cx-tag-ok'}`}>{wikiOnly ? 'Wiki only' : 'In game tables'}</span>
            {!line.documented ? <span className="cx-tag cx-tag-muted">Undocumented</span> : null}
          </div>
        </div>
        <div className="cx-card-meter" aria-hidden="true">
          <span>{line.stages.length}</span>
          <small>{line.stages.length === 1 ? 'stage' : 'stages'}</small>
        </div>
      </header>

      <div className="cx-rail">
        <span className="cx-rail-line" aria-hidden="true" />
        {line.stages.map((stage) => (
          <StageNode key={stage.name} stage={stage} active={selected?.name === stage.name} onSelect={() => showStage(stage)} />
        ))}
      </div>

      <button
        type="button"
        className="cx-card-toggle"
        onClick={() => {
          if (open) setTab(1)
          setOpen((value) => !value)
        }}
        aria-expanded={open}
      >
        {open ? 'Hide dossier' : 'Dossier'}
      </button>

      {open ? (
        <div className="cx-dossier">
          <div className="cx-tabs" role="tablist" aria-label={`${line.name} dossier sections`}>
            {DOSSIER_TABS.map((entry) => {
              const count = counts[entry.id]
              const empty = count === 0
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  id={`${idBase}-tab-${entry.id}`}
                  className={`cx-tab${tab === entry.id ? ' cx-tab-active' : ''}`}
                  aria-selected={tab === entry.id}
                  aria-controls={`${idBase}-panel-${entry.id}`}
                  disabled={empty}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                  {count ? <span className="cx-tab-count">{count}</span> : null}
                </button>
              )
            })}
          </div>

          <div
            className="cx-tabpanel"
            role="tabpanel"
            id={`${idBase}-panel-1`}
            aria-labelledby={`${idBase}-tab-1`}
            hidden={tab !== 1}
          >
            {tab !== 1 ? null : selected ? (
              <StageDossier model={model} stage={selected} growth={growth} partial={partial} notes={line.notes} roleIcons={roleIcons} />
            ) : (
              <p className="cx-dossier-empty">Pick a stage above to read its dossier.</p>
            )}
          </div>

          <div
            className="cx-tabpanel"
            role="tabpanel"
            id={`${idBase}-panel-2`}
            aria-labelledby={`${idBase}-tab-2`}
            hidden={tab !== 2}
          >
            {tab !== 2 ? null : <HordePanel skills={line.hordeSkills} />}
          </div>

          <div
            className="cx-tabpanel"
            role="tabpanel"
            id={`${idBase}-panel-3`}
            aria-labelledby={`${idBase}-tab-3`}
            hidden={tab !== 3}
          >
            {tab !== 3 ? null : <FoodTrack stage={selected} />}
          </div>
        </div>
      ) : null}
    </article>
  )
}

function HordePanel({ skills }: { skills: CodexModel['lines'][number]['hordeSkills'] }) {
  return (
    <div className="cx-horde">
      <ol>
        {skills.map((skill) => (
          <li key={`${skill.level}-${skill.name}`}>
            <span className="cx-horde-level">Lv {skill.level}</span>
            <span className="cx-horde-name">{skill.name}</span>
            <span className="cx-horde-desc">{skill.description}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function FoodTrack({ stage }: { stage: WikiStage | null }) {
  if (!stage) return <p className="cx-dossier-empty">Pick a stage above to read its food track.</p>
  return (
    <div className="cx-feeding">
      <span className="cx-feeding-label">Food track · {stage.feeding.length} upgrades</span>
      {stage.feeding.length > 0 ? (
        <ol className="cx-feeding-list">
          {stage.feeding.map((step) => (
            <li key={step.index}>
              <span className={`cx-feed-grade cx-feed-${step.grade.toLowerCase()}`}>{step.grade}</span>
              <span className="cx-feed-type">{step.type}</span>
              <span className="cx-feed-effect">{step.effect}</span>
              {step.requiredStarLevel !== null ? <span className="cx-feed-star">needs {step.requiredStarLevel}★</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="cx-missing">No food track recorded.</p>
      )}
    </div>
  )
}

function StageDossier({ model, stage, growth, partial, notes, roleIcons }: { model: CodexModel; stage: WikiStage; growth: WikiStage['growth']; partial: boolean; notes: string | null; roleIcons: Record<string, string> }) {
  const tint = stage.element ? ELEMENT_COLORS[stage.element] : '#8892a8'
  return (
    <div className="cx-stage-dossier">
      <div className="cx-stage-head">
        <div className="cx-stage-name">
          <h4>{stage.name}</h4>
          <span className="cx-stage-sub">
            {stage.family ? `${stage.family} · ` : 'Ungrouped · '}stage {stage.stage}
            {stage.inGameCache ? '' : ' · no game tables'}
          </span>
        </div>
        <div className="cx-stage-chips">
          {stage.rarity ? <span className="cx-tag cx-tag-rarity" style={{ '--cx-tag': RARITY_COLORS[stage.rarity] ?? '#8892a8' } as React.CSSProperties}>{stage.rarity}</span> : null}
          {stage.role ? (
            <span className="cx-tag cx-tag-role">
              <WikiIcon src={roleIcons[stage.role]} alt={stage.role} />
              {stage.role}
            </span>
          ) : (
            <span className="cx-tag cx-tag-muted">Role unknown</span>
          )}
        </div>
      </div>

      {stage.skill ? (
        <div className="cx-skill">
          {wikiImageUrl(stage.skill.image) ? <img className="cx-skill-icon" src={wikiImageUrl(stage.skill.image) ?? ''} alt="" loading="lazy" /> : null}
          <div>
            <strong>{stage.skill.name}</strong>
            <p>{stage.skill.description}</p>
            {stage.skill.types.length > 0 ? <div className="cx-skill-types">{stage.skill.types.map((type) => <span key={type}>{type}</span>)}</div> : null}
          </div>
        </div>
      ) : (
        <p className="cx-missing">The wiki has no skill recorded for this stage.</p>
      )}

      <div className="cx-matchups">
        <div><span className="cx-match-label">Counters</span><strong>{stage.counters || '-'}</strong></div>
        <div><span className="cx-match-label">Countered by</span><strong>{stage.counteredBy || '-'}</strong></div>
      </div>

      {stage.grades ? (
        <div className="cx-stats">
          <StatBar label="Attack" icon={model.statIcons.attack} grade={stage.grades.attack} tint={tint} />
          <StatBar label="HP" icon={model.statIcons.hp} grade={stage.grades.hp} tint={tint} />
          <StatBar label="Defense" icon={model.statIcons.defense} grade={stage.grades.defense} tint={tint} />
        </div>
      ) : null}

      {growth ? (
        <div className="cx-growth">
          <span className="cx-growth-label">Growth</span>
          <div className="cx-growth-grid">
            <span>ATK {growth.attackGrowth.toFixed(2)}</span>
            <span>DEF {growth.defenseGrowth.toFixed(2)}</span>
            <span>HP {growth.hpGrowth.toFixed(2)}</span>
            <span>SPD {growth.speedGrowth.toFixed(2)}</span>
          </div>
        </div>
      ) : (
        <p className="cx-missing">No growth record. {partial ? 'Some stages in this line have one.' : ''}The game tables have no id for this stage, so nothing numeric can be derived.</p>
      )}

      {notes ? <p className="cx-notes">{notes}</p> : null}

      <footer className="cx-stage-foot">
        {stage.portraitRepaired ? <span className="cx-note cx-note-fixed">Portrait repaired: the wiki pointed this row at another unit&apos;s file.</span> : null}
        {stage.portraitOddName ? <span className="cx-note cx-note-warn">Upstream stores this portrait as {stage.normal}.</span> : null}
        {stage.detailsPage ? <a className="cx-wiki-link" href={stage.detailsPage} target="_blank" rel="noreferrer noopener">Open wiki page ↗</a> : null}
      </footer>
    </div>
  )
}

interface CodexPageProps {
  theme: Theme
  onToggleTheme: () => void
  onNavigate: (view: PageView) => void
}

export default function CodexPage({ theme, onToggleTheme, onNavigate }: CodexPageProps) {
  const [model, setModel] = useState<CodexModel | null>(null)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<Filters>({ query: '', element: '', rarity: '', role: '', group: 'all', sort: 'name' })

  useEffect(() => {
    let live = true
    loadCodex()
      .then((value) => {
        if (live) setModel(value)
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      live = false
    }
  }, [])

  const roles = useMemo(() => {
    if (!model) return []
    return [...new Set(model.stages.map((stage) => stage.role).filter(Boolean))].sort()
  }, [model])

  // The wiki draws every element and role, so both filters and every card tag
  // can show the artwork instead of a bare word.
  const elementIcons = useMemo(() => iconLookup(model?.elements), [model])
  const roleIcons = useMemo(() => iconLookup(model?.roles), [model])

  const visible = useMemo(() => {
    if (!model) return []
    const query = filters.query.trim().toLowerCase()
    const filtered = model.lines.filter((line) => {
      if (filters.element && !line.stages.some((stage) => stage.element === filters.element)) return false
      if (filters.rarity && !line.stages.some((stage) => stage.rarity === filters.rarity)) return false
      if (filters.role && !line.stages.some((stage) => stage.role === filters.role)) return false
      if (filters.group === 'wiki-only' && line.inGame) return false
      if (filters.group === 'in-game' && !line.inGame) return false
      if (filters.group === 'documented' && !line.documented) return false
      if (query && !line.search.includes(query)) return false
      return true
    })

    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (filters.sort === 'element') {
        const left = ELEMENT_RANK.get(a.element ?? 'Rock') ?? 99
        const right = ELEMENT_RANK.get(b.element ?? 'Rock') ?? 99
        return left - right || a.name.localeCompare(b.name)
      }
      if (filters.sort === 'rarity') {
        return rarityRank(b.topRarity) - rarityRank(a.topRarity) || a.name.localeCompare(b.name)
      }
      if (filters.sort === 'size') return b.stages.length - a.stages.length || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
    return sorted
  }, [model, filters])

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }, [])

  const stats = useMemo(() => {
    if (!model) return null
    return {
      lines: model.lines.length,
      stages: model.stages.length,
      wikiOnly: model.stages.filter((stage) => !stage.inGameCache).length,
      documented: model.lines.filter((line) => line.documented).length,
    }
  }, [model])

  return (
    <div className="cx-shell">
      <SiteHeader theme={theme} view="codex" onToggleTheme={onToggleTheme} onNavigate={onNavigate} />
      <main className="cx-page">
        <div className="cx-backdrop" aria-hidden="true" />

        <section className="cx-hero">
          <div className="cx-hero-copy">
            <span className="eyebrow">Wiki cache</span>
            <h1>Tatari Codex</h1>
            <p>
              Every line the wiki documents, including the stages the game tables have no id for. Nothing here is editable
              and nothing is invented: a stage without a growth record is shown as having none.
            </p>
          </div>
          {stats ? (
            <dl className="cx-hero-stats">
              <div><dt>Lines</dt><dd>{stats.lines}</dd></div>
              <div><dt>Stages</dt><dd>{stats.stages}</dd></div>
              <div><dt>Horde documented</dt><dd>{stats.documented}</dd></div>
              <div className="cx-hero-stat-warn"><dt>No game tables</dt><dd>{stats.wikiOnly}</dd></div>
            </dl>
          ) : null}
        </section>

        {error ? (
          <div className="cx-error" role="alert">
            <strong>Could not read the wiki cache.</strong>
            <span>{error}</span>
            <span>Run <code>npm run scrape_all</code> to rebuild it.</span>
          </div>
        ) : null}

        {model ? (
          <>
            <section className="cx-controls" aria-label="Filter the codex">
              <label className="cx-search">
                <span className="sr-only">Search names and skills</span>
                <input
                  type="search"
                  value={filters.query}
                  placeholder="Search a name or a skill…"
                  onChange={(event) => set('query', event.target.value)}
                />
              </label>
              <CodexFilterSelect
                label="Element"
                value={filters.element}
                onChange={(value) => set('element', value)}
                options={[
                  { value: '', label: 'All' },
                  ...ELEMENT_ORDER.map((element) => ({ value: element, label: element, icon: elementIcons[element] ?? null, tint: ELEMENT_COLORS[element] })),
                ]}
              />
              <CodexFilterSelect
                label="Rarity"
                value={filters.rarity}
                onChange={(value) => set('rarity', value)}
                options={[
                  { value: '', label: 'All' },
                  ...RARITY_ORDER.map((rarity) => ({ value: rarity, label: rarity, tint: RARITY_COLORS[rarity] })),
                ]}
              />
              <CodexFilterSelect
                label="Role"
                value={filters.role}
                onChange={(value) => set('role', value)}
                options={[
                  { value: '', label: 'All' },
                  ...roles.map((role) => ({ value: role, label: role, icon: roleIcons[role] ?? null })),
                ]}
              />
              <CodexFilterSelect
                label="Source"
                value={filters.group}
                onChange={(value) => set('group', value as Filters['group'])}
                options={[
                  { value: 'all', label: 'All lines' },
                  { value: 'in-game', label: 'Backed by game tables' },
                  { value: 'wiki-only', label: 'Wiki only' },
                  { value: 'documented', label: 'Horde documented' },
                ]}
              />
              <CodexFilterSelect
                label="Sort"
                value={filters.sort}
                onChange={(value) => set('sort', value as SortKey)}
                options={SORTS.map((sort) => ({ value: sort.key, label: sort.label }))}
              />
              <p className="cx-result-count" role="status">
                {visible.length} of {model.lines.length} lines
              </p>
            </section>

            <section className="cx-grid" aria-label="Tatari lines">
              {visible.map((line, index) => (
                <CodexCard key={line.key} model={model} line={line} index={index} elementIcons={elementIcons} roleIcons={roleIcons} />
              ))}
            </section>

            {visible.length === 0 ? <div className="cx-empty">No line matches these filters.</div> : null}
          </>
        ) : error ? null : (
          <div className="cx-loading" role="status">
            <span className="cx-loading-bar" aria-hidden="true" />
            Reading the wiki cache…
          </div>
        )}
      </main>
    </div>
  )
}
