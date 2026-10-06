import { specialIcon, starLevels, starUrl } from '../../petHelpers'
import { Emblem } from './Emblem'

export function StarVisual({ star, large = false }: { star: number; large?: boolean }) {
  const icon = specialIcon(star)
  return (
    <div className={`star-visual ${large ? 'large' : ''} ${icon ? 'special' : ''}`} role="img" aria-label={`${star} stars`}>
      {icon ? <Emblem star={star} height={large ? 58 : 46} /> : starLevels(star).map((type, index) => <img key={`${type}-${index}`} src={starUrl(type)} alt="" loading="lazy" />)}
    </div>
  )
}
