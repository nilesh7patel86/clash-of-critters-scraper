import { memo } from 'react'
import type { CSSProperties } from 'react'
import { DATA } from '../../gameData'
import type { PetUnit } from '../../gameData'
import { ELEMENTS } from '../../domain'
import type { GymState, TrainerState } from '../../domain'
import {
  MAX_STAR,
  STAR_COST,
  boxUrl,
  careerUrl,
  computeStats,
  getCareerName,
  getEvoRange,
  getEvolution,
  getPetImage,
  getQuality,
  getStageName,
  gradeUrl,
  hasShiny,
  nextEvolution,
  POSITION_LABELS,
  positionUrl,
  readableInk,
  trialHintAvailable,
} from '../../petHelpers'
import type { GradeKey, PetState } from '../../petHelpers'
import { PetImage } from './PetImage'
import { StarPicker } from './StarPicker'
import { StarVisual } from './StarVisual'
import { StatChip } from './StatChip'

interface PetCardProps {
  pet: PetUnit
  state: PetState
  trainer: TrainerState
  gym: GymState
  disabled: boolean
  starOpen: boolean
  // Bumped when the async wiki artwork lands. The card is memoised on its
  // props, so this counter is what tells every portrait to re-resolve once the
  // cache finishes loading.
  artEpoch: number
  onOwn: (id: number, own: boolean) => void
  onShiny: (id: number) => void
  onStarMenu: (id: number) => void
  onStarType: (id: number, type: number) => void
  onStarCount: (id: number, count: number) => void
  onEvolution: (id: number, stage: number) => void
  onGrade: (id: number, key: GradeKey, direction: number) => void
  onTrials: (id: number, anchor: HTMLElement) => void
}

export const PetCard = memo(function PetCard({ pet, state, trainer, gym, disabled, starOpen, artEpoch, onOwn, onShiny, onStarMenu, onStarType, onStarCount, onEvolution, onGrade, onTrials }: PetCardProps) {
  const stats = computeStats(pet, state, trainer, gym)
  const grade = DATA.feedrank[Math.min(state.gA, state.gD, state.gH)] || DATA.feedrank[0]
  const [minEvo, maxEvo] = getEvoRange(pet.id)
  const next = nextEvolution(pet, state.star, state.evo)
  const stageName = getStageName(pet, state.evo)
  const shinyAvailable = hasShiny(pet, state.evo)
  const art = getPetImage(pet, state.evo, state.shiny && shinyAvailable)

  // One pass over the selectable stages. The card wears its own stage's
  // quality, each evolution button wears the colour of the stage it switches
  // to, and the q tag reads the same lookup - so getQuality and readableInk
  // are each asked once per stage instead of twice per button per render.
  const stageStyles = Array.from({ length: maxEvo - minEvo + 1 }, (_, index) => index + minEvo).map((stage) => {
    const quality = getQuality(stage, pet)
    return { stage, color: quality.color, grad: quality.grad, ink: readableInk(quality.color), q: getEvolution(pet.id, stage)?.q || 2 }
  })
  const quality = stageStyles.find((entry) => entry.stage === state.evo) || stageStyles[0]

  const style = { '--qc-accent': quality.color, borderColor: quality.color } as CSSProperties
  const nextText = !next
    ? 'Evolution max'
    : next.gate === null
      ? `Evo ${next.stage} gate unavailable`
      : next.ready
        ? `Evo ${next.stage} ready · ★${next.gate}`
        : `${next.cost} → ★${next.gate} · Evo ${next.stage}`
  const trialNext = next && trialHintAvailable(next) ? next : null
  const nextLabel = trialNext ? `${nextText} · +${trialNext.trials.length} trials` : nextText
  const nextTone = `cost-hint evolution-hint${next ? (next.gate === null ? ' cost-error' : next.ready ? ' ready' : ' pending') : ' maxed'}`
  return (
    <article className={`pet-card ${state.own ? '' : 'not-owned'} ${state.shiny && shinyAvailable ? 'is-shiny' : ''} ${starOpen ? 'is-picking' : ''} ${stats.evolutionValid ? '' : 'has-data-error'}`} style={style}>
      <div className="quality-bg" style={{ '--qc-wash': quality.grad.map((color) => `color-mix(in srgb, ${color} 16%, transparent)`).join(', ') } as CSSProperties} />
      <div className="pet-card-holo" aria-hidden="true" />
      <div className="pet-card-inner">
        <div className="pet-card-head">
          <span className="quality-tag" style={{ backgroundColor: quality.color, color: quality.ink }}>q{quality.q}</span>
          <label className="own-toggle">
            <input type="checkbox" checked={state.own} onChange={(event) => onOwn(pet.id, event.target.checked)} disabled={disabled} aria-label={`Own ${stageName}`} />
            <span>Own</span>
          </label>
        </div>
        <div className="pet-card-top">
          <div className="pet-portrait">
            <PetImage key={`${pet.id}-${state.evo}-${state.shiny && shinyAvailable ? 'flash' : 'normal'}-${artEpoch}`} className="pet-art" src={art.src} fallbackSrc={art.fallbackSrc} alt={stageName} />
          </div>
          <div className="pet-summary">
            <strong title={stageName}>{stageName}</strong>
            <div className="pet-element-row">
              <span className={`element-badge ${ELEMENTS[pet.el].className}`}>{ELEMENTS[pet.el].label}</span>
              {shinyAvailable ? <button type="button" className={`shiny-toggle ${state.shiny ? 'active' : ''}`} onClick={() => onShiny(pet.id)} disabled={disabled} aria-label="Toggle shiny art">✦</button> : null}
            </div>
            <div className="pet-role-row">
              <span className="career-label"><img src={careerUrl(pet)} alt="" loading="lazy" /><span className="role-text">{getCareerName(pet)}</span></span>
              <span className="position-label">{pet.pos !== 2 ? <img src={positionUrl(pet)} alt="" loading="lazy" /> : null}<span className="role-text">{POSITION_LABELS[pet.pos] || `Position ${pet.pos}`}</span></span>
              <img className="rank-icon" src={gradeUrl(grade)} alt={`${grade.name} rank`} title={`Minimum grade: ${grade.name}`} loading="lazy" />
            </div>
          </div>
        </div>
        <StarVisual star={state.star} />
        <div className="pet-controls">
          <StarPicker id={pet.id} star={state.star} open={starOpen} disabled={disabled} onToggle={() => onStarMenu(pet.id)} onType={(type) => onStarType(pet.id, type)} onCount={(count) => onStarCount(pet.id, count)} />
          <div className="cost-hints">
            <span className="cost-hint"><img src={boxUrl()} alt="" loading="lazy" />{state.star >= MAX_STAR ? '★ max' : `${STAR_COST[state.star] || 0} → ★${state.star + 1}`}</span>
            {trialNext ? (
              <button type="button" className={`${nextTone} clickable`} onClick={(event) => onTrials(pet.id, event.currentTarget)} aria-label={`Show trial requirements for evolution ${trialNext.stage}`}><img src={boxUrl()} alt="" loading="lazy" />{nextLabel}</button>
            ) : (
              <span className={nextTone}><img src={boxUrl()} alt="" loading="lazy" />{nextLabel}</span>
            )}
          </div>
          <div className="evolution-row">
            <span className="control-label">Evolution</span>
            <div className="evolution-buttons">
              {stageStyles.map(({ stage, color, ink }) => (
                <button type="button" key={stage} className={`evolution-button ${state.evo === stage ? 'selected' : ''}`} onClick={() => onEvolution(pet.id, stage)} disabled={disabled} style={{ '--evolution-color': color, '--qc-ink': ink } as CSSProperties}>
                  {stage}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="stat-list">
          <StatChip stat="atk" label="Attack" value={stats.atk} grade={DATA.feedrank[state.gA] || DATA.feedrank[0]} feed={stats.feed.a} badge={stats.badge.a} disabled={disabled} onClick={() => onGrade(pet.id, 'gA', 1)} onContextMenu={() => onGrade(pet.id, 'gA', -1)} />
          <StatChip stat="hp" label="HP" value={stats.hp} grade={DATA.feedrank[state.gH] || DATA.feedrank[0]} feed={stats.feed.h} badge={stats.badge.h} disabled={disabled} onClick={() => onGrade(pet.id, 'gH', 1)} onContextMenu={() => onGrade(pet.id, 'gH', -1)} />
          <StatChip stat="def" label="Defense" value={stats.def} grade={DATA.feedrank[state.gD] || DATA.feedrank[0]} feed={stats.feed.d} badge={stats.badge.d} disabled={disabled} onClick={() => onGrade(pet.id, 'gD', 1)} onContextMenu={() => onGrade(pet.id, 'gD', -1)} />
        </div>
        {!stats.evolutionValid ? <div className="data-warning">Evolution data missing; factor 1 fallback</div> : null}
        <div className="pet-card-footer"><span>Badges {stats.badge.a}/{stats.badge.d}/{stats.badge.h}%</span><span>Battle level {stats.battleLevel}</span></div>
      </div>
    </article>
  )
})
