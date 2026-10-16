import type { FeedRank } from '../../gameData'
import { attrUrl, formatStat, gradeUrl } from '../../petHelpers'
import type { StatKey } from '../../petHelpers'

export function StatChip({
  stat,
  label,
  value,
  grade,
  feed,
  badge,
  disabled,
  onClick,
  onContextMenu,
}: {
  stat: StatKey
  label: string
  value: number
  grade: FeedRank
  feed: number
  badge: number
  disabled: boolean
  onClick: () => void
  onContextMenu: () => void
}) {
  return (
    <div className="stat-chip" aria-label={`${label}: ${Math.round(value).toLocaleString('en-US')}, grade ${grade.name}`}>
      <button type="button" className="stat-chip-main" onClick={onClick} disabled={disabled} title={`${label}: click to cycle grade, right-click to go back.`}>
        <span className="stat-icon">
          <img src={attrUrl(stat)} alt="" loading="lazy" />
          <img className="stat-grade" src={gradeUrl(grade)} alt="" title={`${label} grade ${grade.name}`} loading="lazy" decoding="async" />
        </span>
        <span className="stat-copy">
          <strong>{formatStat(value)}</strong>
          <small>food +{feed}% · badge +{badge}%</small>
        </span>
      </button>
      <span className="stat-chip-grade-controls" aria-label={`${label} grade controls`}>
        <button type="button" onClick={(event) => { event.stopPropagation(); onContextMenu() }} disabled={disabled} aria-label={`Decrease ${label} grade`}>−</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onClick() }} disabled={disabled} aria-label={`Increase ${label} grade`}>+</button>
      </span>
    </div>
  )
}