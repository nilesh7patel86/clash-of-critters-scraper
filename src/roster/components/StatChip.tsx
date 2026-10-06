import type { FeedRank } from '../../gameData'
import { attrUrl, formatStat } from '../stats'
import type { StatKey } from '../stats'

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
    <button type="button" className="stat-chip" onClick={onClick} onContextMenu={(event) => { event.preventDefault(); onContextMenu() }} disabled={disabled} title={`${label}: ${Math.round(value).toLocaleString('en-US')}. Click to cycle grade; right-click to go back.`}>
      <span className="stat-icon">
        <img src={attrUrl(stat)} alt="" loading="lazy" />
        <b style={{ background: grade.rgb }}>{grade.name}</b>
      </span>
      <span className="stat-copy">
        <strong>{formatStat(value)}</strong>
        <small>food +{feed}% · badge +{badge}%</small>
      </span>
    </button>
  )
}
