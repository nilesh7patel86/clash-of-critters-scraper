import type { ChangeEvent, RefObject } from 'react'
import { DATA } from './gameData'
import { ELEMENT_ORDER, ELEMENTS, assetUrl, badgeBonuses, battleLevel, storyLabel } from './domain'
import type { ElementId, GymState, TrainerState } from './domain'

interface SidebarProps {
  open: boolean
  trainer: TrainerState
  gym: GymState
  progressMax: number
  shared: boolean
  fileInput: RefObject<HTMLInputElement | null>
  onTrainer: (field: 'lvl' | 'pr', value: string) => void
  onBadge: (element: ElementId, floor: number) => void
  onShare: () => void
  onExport: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onOpen: () => void
  onClose: () => void
}

function BadgePanel({ element, gym, disabled, onFloor }: { element: ElementId; gym: GymState; disabled: boolean; onFloor: (element: ElementId, floor: number) => void }) {
  const badges = DATA.badges.filter((badge) => badge.el === element).sort((first, second) => first.floor - second.floor)
  const current = gym[String(element)] || 0
  const bonus = badgeBonuses(element, gym)
  const top = badges[badges.length - 1]?.floor || 0
  const info = ELEMENTS[element]
  return (
    <article className="badge-panel">
      <div className="badge-panel-heading">
        <span className={`element-badge ${info.className}`}>{info.label}</span>
        <span className="badge-floor">Floor {current}/{top}</span>
      </div>
      <div className="badge-list">
        {badges.map((badge) => {
          const active = badge.floor <= current
          return (
            <button type="button" className={`badge-choice ${active ? 'active' : ''}`} key={badge.id} onClick={() => onFloor(element, badge.floor)} disabled={disabled} aria-pressed={active} aria-label={`${info.label} floor ${badge.floor}`}>
              <img src={assetUrl(`badge/${badge.img}`)} alt="" loading="lazy" />
              <span>{badge.floor}</span>
            </button>
          )
        })}
      </div>
      <div className="badge-bonus"><span>ATK +{bonus.a}%</span><span>DEF +{bonus.d}%</span><span>HP +{bonus.h}%</span></div>
    </article>
  )
}

export default function Sidebar({ open, trainer, gym, progressMax, shared, fileInput, onTrainer, onBadge, onShare, onExport, onImport, onOpen, onClose }: SidebarProps) {
  return (
    <aside className={`sidebar${open ? ' sidebar-open' : ''}`} id="trainer-sidebar" aria-label="Trainer profile and badge floors">
      <button type="button" className="sidebar-open-btn" onClick={onOpen} tabIndex={-1} aria-hidden={open} aria-label="Open trainer sidebar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M4 8h9M18 8h2M4 16h4M13 16h7" /><circle cx="15.5" cy="8" r="2.2" /><circle cx="10.5" cy="16" r="2.2" /></svg>
      </button>
      <div className="sidebar-header">
        <div className="sidebar-heading">
          <span className="eyebrow">Sidebar</span>
          <h2 className="sidebar-title">Trainer &amp; badges</h2>
        </div>
        <button type="button" className="sidebar-close" onClick={onClose} aria-label="Collapse sidebar">×</button>
      </div>
      <div className="sidebar-body">
        <section className="sidebar-section">
          <div className="section-heading"><div><span className="eyebrow">Trainer</span><h2>Profile</h2></div><span className="section-count">Local only</span></div>
          <div className="panel profile-panel">
            <div className="profile-fields">
              <label className="field"><span>Trainer level</span><input type="number" min="1" max={DATA.maxtrainer || 2400} value={trainer.lvl} onChange={(event) => onTrainer('lvl', event.target.value)} disabled={shared} /></label>
              <label className="field"><span>Progress</span><input type="number" min="0" max={progressMax} value={trainer.pr} onChange={(event) => onTrainer('pr', event.target.value)} disabled={shared} /></label>
              <div className="field story-field"><span>Story</span><strong className="story-value">{storyLabel(trainer)}</strong></div>
            </div>
            <div className="battle-levels"><span className="control-label">Battle levels</span><div>{ELEMENT_ORDER.map((element) => <span className="battle-pill" key={element}><i style={{ background: ELEMENTS[element].color }} />{ELEMENTS[element].label}<strong>{battleLevel(element, trainer)}</strong></span>)}</div></div>
            <div className="profile-actions"><button type="button" className="primary-button" onClick={onShare}>Share roster</button><div className="button-row"><button type="button" onClick={onExport}>Export JSON</button><button type="button" onClick={() => fileInput.current?.click()} disabled={shared}>Import JSON</button></div><input ref={fileInput} type="file" accept="application/json,.json" onChange={onImport} hidden /></div>
          </div>
        </section>
        <section className="sidebar-section">
          <div className="section-heading"><div><span className="eyebrow">Element power</span><h2>Badge floors</h2></div><span className="section-count">Cumulative buffs</span></div>
          <p className="section-description">Choose the highest cleared floor for each element. Tap the active top floor again to step back one.</p>
          <div className="badges-grid">{ELEMENT_ORDER.map((element) => <BadgePanel key={element} element={element} gym={gym} disabled={shared} onFloor={onBadge} />)}</div>
        </section>
      </div>
    </aside>
  )
}
