import { MAX_STAR, MAX_STAR_ICON, STAR_GRADE, STAR_NAMES, specialIcon, starParts, starUrl } from '../../petHelpers'
import { Emblem } from './Emblem'

interface StarPickerProps {
  id: number
  star: number
  open: boolean
  disabled: boolean
  onToggle: () => void
  onType: (type: number) => void
  onCount: (count: number) => void
}

// The star menu's four families are the same on every card, so the list is
// built once at module load rather than on each render.
const STAR_FAMILIES = [
  { label: 'Stars', types: [1, 2, 3] },
  { label: 'Moons', types: [4, 5, 6] },
  { label: 'Suns', types: [7, 8, 9] },
  { label: 'Crowns', types: [10, 11, 12] },
]

export function StarPicker({ id, star, open, disabled, onToggle, onType, onCount }: StarPickerProps) {
  const parts = starParts(star)
  const countMax = Math.min(STAR_GRADE, MAX_STAR - (parts.type - 1) * STAR_GRADE)
  const special = specialIcon(star)
  return (
    <div className="star-picker" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="star-picker-button" onClick={onToggle} disabled={disabled} aria-expanded={open}>
        {star === 0 ? <span className="star-zero">☆</span> : special ? <Emblem star={star} height={26} /> : <img src={starUrl(parts.type)} alt="" />}
        <span>{star === 0 ? '★0' : special ? 'Emblem' : STAR_NAMES[parts.type] || `Family ${parts.type}`}</span>
        <span className="chevron">⌄</span>
      </button>
      {!special && star > 0 ? (
        <select className="star-count" value={parts.count} onChange={(event) => onCount(Number(event.target.value))} disabled={disabled} aria-label={`Star count for pet ${id}`}>
          {Array.from({ length: countMax }, (_, index) => index + 1).map((count) => <option key={count} value={count}>×{count}</option>)}
        </select>
      ) : null}
      <span className="star-number">★{star}</span>
      {open ? (
        <div className="star-menu" onClick={(event) => event.stopPropagation()}>
          {STAR_FAMILIES.map((family) => (
            <div className="star-family" key={family.label}>
              <div className="star-family-label">{family.label}</div>
              <div className="star-options">
                {family.types.map((type) => {
                  const low = (type - 1) * STAR_GRADE + 1
                  const high = Math.min(MAX_STAR, type * STAR_GRADE)
                  return (
                    <button type="button" className={`star-option ${parts.type === type && !special ? 'selected' : ''}`} key={type} onClick={() => onType(type)} disabled={disabled}>
                      <img src={starUrl(type)} alt="" />
                      <span>★{low}–{high}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="star-family">
            <div className="star-family-label">Emblems</div>
            <div className="star-options emblem-options">
              {Array.from({ length: MAX_STAR_ICON - 12 }, (_, index) => index + 13).map((type) => {
                const emblemStar = 72 + type - 12
                return (
                  <button type="button" className={`star-option emblem-option ${special === type ? 'selected' : ''}`} key={type} onClick={() => onType(type)} disabled={disabled}>
                    <Emblem star={emblemStar} height={36} />
                    <span>★{emblemStar}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
