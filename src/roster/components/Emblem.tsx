import type { CSSProperties } from 'react'
import { DATA } from '../../gameData'
import { SPECIAL_PLUS_START, specialIcon, starBackgroundUrl, starUrl } from '../../petHelpers'

export function Emblem({ star, height }: { star: number; height: number }) {
  const icon = specialIcon(star)
  if (!icon) return null
  const plus = star >= SPECIAL_PLUS_START
  const background = DATA.starbg[plus ? 'plus' : 'special'] || [141, 65]
  const geometry = DATA.stargeo[String(icon)]
  const iconSize = DATA.starsize[String(icon)] || [20, 20]
  const width = (height * background[0]) / background[1]
  const iconStyle: CSSProperties = geometry
    ? {
        left: `${geometry.l}%`,
        top: `${geometry.t}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
      }
    : {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${(iconSize[0] / background[0]) * 100}%`,
        height: `${(iconSize[1] / background[1]) * 100}%`,
      }
  return (
    <span className="emblem" style={{ width: `${width.toFixed(1)}px`, height: `${height}px` }}>
      <img className="emblem-bg" src={starBackgroundUrl(plus)} alt="" loading="lazy" />
      <img className="emblem-icon" src={starUrl(icon)} alt="" loading="lazy" style={iconStyle} />
    </span>
  )
}
