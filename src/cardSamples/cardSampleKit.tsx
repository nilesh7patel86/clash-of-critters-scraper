// The functional atoms every sample layout is built from.
//
// The point of this file is that a layout is only ever allowed to decide where
// things sit and what they look like. Anything a player can *do* to a Tatari -
// own it, flip to Glitter art, pick a star family, cycle a food grade, step the
// evolution, open the trial requirements - is written once, here, with the same
// behaviour the roster card gives it:
//
//   own toggle    checkbox bound to state.own
//   Glitter       swaps the portrait, hidden when the pet has no Glitter art
//   star picker   four families plus twelve emblem tiers, and a count selector
//   star upgrade  duplicate boxes needed for the next single star
//   evolution     next gate, its cost, whether it is reachable right now
//   trials        a button that opens the trial requirements, only when the
//                 scraped cache actually has some for that transition
//   stat rows     attack / HP / defence with grade, food and badge breakdown;
//                 click steps the grade up, right-click steps it back down
//   data warning  shown when the evolution factors are missing and the card is
//                 quietly falling back to 1
//
// So the layouts can be judged on layout alone. If a design cannot find room for
// one of these, the answer is to make room, not to drop it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { DATA } from '../gameData'
import type { FeedRank } from '../gameData'
import {
  MAX_STAR,
  MAX_STAR_ICON,
  SPECIAL_PLUS_START,
  STAR_GRADE,
  STAR_NAMES,
  attrUrl,
  boxUrl,
  careerUrl,
  formatStat,
  gradeUrl,
  positionUrl,
  specialIcon,
  starBackgroundUrl,
  starLevels,
  starParts,
  starUrl,
  trialIconUrl,
  trialLines,
} from './cardSampleModel'
import type { CardHandlers, CardModel, EvolutionStep, StatKey } from './cardSampleModel'

// The emblem plates come off the data tables so their per-icon geometry stays in
// step with the roster without this module importing anything from it.
const STAR_BG = DATA.starbg
const STAR_GEO = DATA.stargeo
const STAR_SIZE = DATA.starsize

/** Portrait with the same three-step fallback chain the roster uses. */
export function CardArt({ model, className = '' }: { model: CardModel; className?: string }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const { art, stageName, pet, state, shinyAvailable } = model
  const active = art.src && !failed.has(art.src)
    ? art.src
    : art.fallbackSrc && !failed.has(art.fallbackSrc)
      ? art.fallbackSrc
      : null
  if (!active) return <span className={`${className} s-no-art`}>No art</span>
  return (
    <img
      // Remounting on the art key stops a sprite that failed from poisoning the
      // next one, which matters because Glitter swaps the src in place.
      key={`${pet.id}-${state.evo}-${state.shiny && shinyAvailable ? 'flash' : 'normal'}`}
      className={className}
      src={active}
      alt={stageName}
      loading="lazy"
      onError={() => setFailed((current) => new Set(current).add(active))}
    />
  )
}

/**
 * A star badge drawn over the emblem plate the game uses for its special tiers.
 * The emblem is a two-part sprite plus a per-icon geometry table, so the icon
 * sits at a percentage of the plate rather than being blindly centred.
 */
export function Emblem({ star, height }: { star: number; height: number }) {
  const icon = specialIcon(star)
  if (!icon) return null
  const plus = star >= SPECIAL_PLUS_START
  const background = STAR_BG[plus ? 'plus' : 'special'] || [141, 65]
  const [plateWidth, plateHeight] = background
  const geometry = STAR_GEO[String(icon)]
  const iconSize = STAR_SIZE[String(icon)] || [20, 20]
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
        width: `${(iconSize[0] / plateWidth) * 100}%`,
        height: `${(iconSize[1] / plateHeight) * 100}%`,
      }

  // The plate is sized in CSS rather than in inline width/height, and the
  // requested height arrives as a *fallback* rather than a hard value. That
  // matters because a bare inline height cannot be overridden by a class rule
  // without !important, and the emblem appears at three different scales -
  // the star row, the picker button and the picker menu - which want
  // different sizes per skin.
  const style = {
    '--s-emblem-ar': `${plateWidth} / ${plateHeight}`,
    '--s-emblem-h-default': `${height}px`,
  } as CSSProperties

  return (
    <span className="s-emblem" style={style}>
      <img className="s-emblem-bg" src={starBackgroundUrl(plus)} alt="" loading="lazy" />
      <img className="s-emblem-icon" src={starUrl(icon)} alt="" loading="lazy" style={iconStyle} />
    </span>
  )
}

/** Read-only star display: a row of family icons, or the emblem for the top tiers. */
export function StarRow({ star, large = false }: { star: number; large?: boolean }) {
  const icon = specialIcon(star)
  return (
    <div
      className={`s-star-row${large ? ' large' : ''}${icon ? ' special' : ''}`}
      role="img"
      aria-label={`${star} stars`}
    >
      {icon
        ? <Emblem star={star} height={large ? 58 : 46} />
        : starLevels(star).map((type, index) => (
          <img key={`${type}-${index}`} src={starUrl(type)} alt="" loading="lazy" />
        ))}
    </div>
  )
}

/** Capacity bar, the readout the schematic layout wears instead of star icons. */
export function StarBar({ star }: { star: number }) {
  const cells = 10
  const filled = Math.max(0, Math.min(cells, Math.round((star / MAX_STAR) * cells)))
  return <span className="s-star-bar" aria-hidden="true">{`[${'|'.repeat(filled)}${' '.repeat(cells - filled)}]`}</span>
}

export function QualityTag({ model }: { model: CardModel }) {
  return (
    <span
      className="s-quality-tag"
      style={{ backgroundColor: model.quality.color, color: model.qualityInk }}
      title={`Quality ${model.qualityIndex}`}
    >
      q{model.qualityIndex}
    </span>
  )
}

export function OwnToggle({ model, disabled, onOwn }: { model: CardModel; disabled: boolean; onOwn: (id: number, own: boolean) => void }) {
  const { pet, state, stageName } = model
  return (
    <label className="s-own">
      <input
        type="checkbox"
        checked={state.own}
        onChange={(event) => onOwn(pet.id, event.target.checked)}
        disabled={disabled}
        aria-label={`Own ${stageName}`}
      />
      <span>Own</span>
    </label>
  )
}

export function ShinyToggle({ model, disabled, onShiny }: { model: CardModel; disabled: boolean; onShiny: (id: number) => void }) {
  const { pet, state, shinyAvailable } = model
  if (!shinyAvailable) return null
  return (
    <button
      type="button"
      className={`s-shiny${state.shiny ? ' active' : ''}`}
      onClick={() => onShiny(pet.id)}
      disabled={disabled}
      aria-pressed={state.shiny}
      aria-label="Toggle Glitter art"
      title="Glitter art"
    >
      {'\u2726'}
    </button>
  )
}

export function RankBadge({ model }: { model: CardModel }) {
  return (
    <img
      className="s-rank"
      src={gradeUrl(model.rank)}
      alt={`${model.rank.name} rank`}
      title={`Weakest food grade: ${model.rank.name}`}
      loading="lazy"
    />
  )
}

/** Element, career, position and rank - the tags under the name. */
export function IdentityMeta({ model }: { model: CardModel }) {
  const { pet, element, career, position } = model
  return (
    <div className="s-identity-meta">
      <span className={`s-element ${element.className}`}>{element.label}</span>
      <span className="s-role">
        <img src={careerUrl(pet)} alt="" loading="lazy" />
        <span className="s-role-text">{career}</span>
      </span>
      <span className="s-role">
        {pet.pos !== 2 ? <img src={positionUrl(pet)} alt="" loading="lazy" /> : null}
        <span className="s-role-text">{position}</span>
      </span>
      <RankBadge model={model} />
    </div>
  )
}

export function IdentityBlock({ model }: { model: CardModel }) {
  return (
    <div className="s-identity">
      <strong className="s-name" title={model.stageName}>{model.stageName}</strong>
      <IdentityMeta model={model} />
    </div>
  )
}

interface StarPickerProps {
  model: CardModel
  open: boolean
  disabled: boolean
  onToggle: () => void
  onType: (type: number) => void
  onCount: (count: number) => void
}

export function StarPicker({ model, open, disabled, onToggle, onType, onCount }: StarPickerProps) {
  const { state } = model
  const parts = starParts(state.star)
  const countMax = Math.min(STAR_GRADE, MAX_STAR - (parts.type - 1) * STAR_GRADE)
  const families = [
    { label: 'Stars', types: [1, 2, 3] },
    { label: 'Moons', types: [4, 5, 6] },
    { label: 'Suns', types: [7, 8, 9] },
    { label: 'Crowns', types: [10, 11, 12] },
  ]
  const special = specialIcon(state.star)
  return (
    <div className="s-star-picker" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="s-star-picker-button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        aria-label={`Star tier for ${model.stageName}`}
      >
        {state.star === 0
          ? <span className="s-star-zero">{'\u2606'}</span>
          : special
            ? <Emblem star={state.star} height={26} />
            : <img src={starUrl(parts.type)} alt="" />}
        <span className="s-star-picker-label">
          {state.star === 0 ? '\u26050' : special ? 'Emblem' : STAR_NAMES[parts.type] || `Family ${parts.type}`}
        </span>
        <span className="s-chevron">{'\u2304'}</span>
      </button>
      {!special && state.star > 0 ? (
        <select
          className="s-star-count"
          value={parts.count}
          onChange={(event) => onCount(Number(event.target.value))}
          disabled={disabled}
          aria-label={`Star count for ${model.stageName}`}
        >
          {Array.from({ length: countMax }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>{'\u00d7'}{count}</option>
          ))}
        </select>
      ) : null}
      <span className="s-star-number">{'\u2605'}{state.star}</span>
      {open ? (
        <div className="s-star-menu" onClick={(event) => event.stopPropagation()}>
          {families.map((family) => (
            <div className="s-star-family" key={family.label}>
              <div className="s-star-family-label">{family.label}</div>
              <div className="s-star-options">
                {family.types.map((type) => {
                  const low = (type - 1) * STAR_GRADE + 1
                  const high = Math.min(MAX_STAR, type * STAR_GRADE)
                  return (
                    <button
                      type="button"
                      className={`s-star-option${parts.type === type && !special ? ' selected' : ''}`}
                      key={type}
                      onClick={() => onType(type)}
                      disabled={disabled}
                    >
                      <img src={starUrl(type)} alt="" />
                      <span>{'\u2605'}{low}{'\u2013'}{high}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="s-star-family">
            <div className="s-star-family-label">Emblems</div>
            <div className="s-star-options s-emblem-options">
              {Array.from({ length: MAX_STAR_ICON - 12 }, (_, index) => index + 13).map((type) => {
                const emblemStar = 72 + type - 12
                return (
                  <button
                    type="button"
                    className={`s-star-option s-emblem-option${special === type ? ' selected' : ''}`}
                    key={type}
                    onClick={() => onType(type)}
                    disabled={disabled}
                  >
                    <Emblem star={emblemStar} height={36} />
                    <span>{'\u2605'}{emblemStar}</span>
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
    <button
      type="button"
      className="s-stat"
      onClick={onClick}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu()
      }}
      disabled={disabled}
      title={`${label}: ${Math.round(value).toLocaleString('en-US')}. Click to cycle grade; right-click to go back.`}
    >
      <span className="s-stat-icon">
        <img src={attrUrl(stat)} alt="" loading="lazy" />
        <b style={{ background: grade.rgb }}>{grade.name}</b>
      </span>
      <span className="s-stat-copy">
        <strong>{formatStat(value)}</strong>
        <small>food +{feed}% {'\u00b7'} badge +{badge}%</small>
      </span>
    </button>
  )
}

export function StatList({ model, disabled, onGrade }: { model: CardModel; disabled: boolean; onGrade: CardHandlers['onGrade'] }) {
  const { pet, stats, grades } = model
  return (
    <ul className="s-stats">
      <StatChip
        stat="atk"
        label="Attack"
        value={stats.atk}
        grade={grades.atk}
        feed={stats.feed.a}
        badge={stats.badge.a}
        disabled={disabled}
        onClick={() => onGrade(pet.id, 'gA', 1)}
        onContextMenu={() => onGrade(pet.id, 'gA', -1)}
      />
      <StatChip
        stat="hp"
        label="HP"
        value={stats.hp}
        grade={grades.hp}
        feed={stats.feed.h}
        badge={stats.badge.h}
        disabled={disabled}
        onClick={() => onGrade(pet.id, 'gH', 1)}
        onContextMenu={() => onGrade(pet.id, 'gH', -1)}
      />
      <StatChip
        stat="def"
        label="Defense"
        value={stats.def}
        grade={grades.def}
        feed={stats.feed.d}
        badge={stats.badge.d}
        disabled={disabled}
        onClick={() => onGrade(pet.id, 'gD', 1)}
        onContextMenu={() => onGrade(pet.id, 'gD', -1)}
      />
    </ul>
  )
}

export function EvolutionRow({ model, disabled, onEvolution }: { model: CardModel; disabled: boolean; onEvolution: CardHandlers['onEvolution'] }) {
  const { pet, state } = model
  return (
    <div className="s-evo">
      <span className="s-control-label">Evolution</span>
      <div className="s-evo-buttons" role="group" aria-label={`Evolution stage for ${model.stageName}`}>
        {model.stageQuality.map(({ stage, color, ink }) => (
          <button
            type="button"
            key={stage}
            className={`s-evo-button${state.evo === stage ? ' selected' : ''}`}
            onClick={() => onEvolution(pet.id, stage)}
            disabled={disabled}
            aria-pressed={state.evo === stage}
            style={{ '--evo-color': color, '--evo-ink': ink } as CSSProperties}
          >
            {stage}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Duplicate-box costs. The star step is a static readout; the next evolution is
 * a button whenever the trial cache has something to show behind it.
 */
export function CostHints({ model, onTrials }: { model: CardModel; onTrials?: CardHandlers['onTrials'] }) {
  const { pet } = model
  return (
    <div className="s-cost">
      <span className="s-cost-hint">
        <img src={boxUrl()} alt="" loading="lazy" />
        {model.starUpgradeLabel}
      </span>
      {model.trials && onTrials ? (
        <button
          type="button"
          className={`s-cost-hint s-evo-hint ${model.nextTone} clickable`}
          onClick={(event) => onTrials(pet.id, event.currentTarget)}
          aria-label={`Show trial requirements for evolution ${model.next?.stage}`}
        >
          <img src={boxUrl()} alt="" loading="lazy" />
          {model.nextLabel}
        </button>
      ) : (
        <span className={`s-cost-hint s-evo-hint ${model.nextTone}`}>
          <img src={boxUrl()} alt="" loading="lazy" />
          {model.nextLabel}
        </span>
      )}
    </div>
  )
}

export function CardFooter({ model }: { model: CardModel }) {
  return (
    <div className="s-foot">
      <span>Badges {model.stats.badge.a}/{model.stats.badge.d}/{model.stats.badge.h}%</span>
      <span>Battle level {model.stats.battleLevel}</span>
    </div>
  )
}

export function DataWarning({ model }: { model: CardModel }) {
  if (model.stats.evolutionValid) return null
  return <div className="s-warn">Evolution data missing; factor 1 fallback</div>
}

/**
 * Floating trial requirements. Positioned against the button that opened it and
 * kept there through scroll and resize, dismissed by Escape or an outside click
 * - the same behaviour the roster tooltip has.
 */
export function TrialsTip({
  model,
  next,
  anchor,
  onClose,
}: {
  model: CardModel
  next: EvolutionStep
  anchor: HTMLElement
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  const place = useCallback(() => {
    const node = ref.current
    if (!node) return
    const gap = 10
    const margin = 8
    const rect = node.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const offscreen = anchorRect.bottom < 0 || anchorRect.top > window.innerHeight || anchorRect.right < 0 || anchorRect.left > window.innerWidth
    if (offscreen) {
      onClose()
      return
    }
    const above = anchorRect.top - rect.height - gap
    const preferred = above < margin ? anchorRect.bottom + gap : above
    const top = Math.max(margin, Math.min(preferred, window.innerHeight - rect.height - margin))
    const centered = anchorRect.left + anchorRect.width / 2 - rect.width / 2
    const left = Math.max(margin, Math.min(centered, window.innerWidth - rect.width - margin))
    setStyle((prev) => (prev.top === top && prev.left === left ? prev : { top, left, visibility: 'visible' }))
  }, [anchor, onClose])

  useLayoutEffect(() => {
    place()
  }, [place])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    let frame = 0
    const reposition = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        place()
      })
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [place, onClose])

  const lines = trialLines(next.trials)
  return (
    <div className="s-trials" ref={ref} style={style} role="dialog" aria-label={`Evolution ${next.stage} trials for ${model.stageName}`}>
      <button type="button" className="s-trials-close" onClick={onClose} aria-label="Close trial details">{'\u00d7'}</button>
      <h4>{model.stageName} {'\u00b7'} Evolution {next.stage} trials</h4>
      <p className="s-trials-gate">
        Requires {'\u2605'}{next.gate ?? '?'}{next.ready ? ' \u00b7 ready now' : ` \u00b7 ${next.cost} boxes`}
      </p>
      {lines.length === 0 ? <p className="s-trials-empty">No trial data in the cache.</p> : null}
      <ul className="s-trials-list">
        {lines.map((line, index) => (
          <li key={index}>
            {line.icon ? <img src={trialIconUrl(line.icon)} alt="" /> : null}
            <span>
              {line.text}
              {line.alt ? <em className="s-trials-alt">{line.alt}</em> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The shared body every layout starts from: ten regions in a fixed order, which
 * each layout then places with its own grid template. Fixing the order keeps tab
 * order and screen-reader order identical across the designs, so comparing two
 * samples compares layout and nothing else.
 */
export function CardBody({
  model,
  disabled,
  starOpen,
  handlers,
  extras,
}: {
  model: CardModel
  disabled: boolean
  starOpen: boolean
  handlers: CardHandlers
  /** Extra readouts a design wants alongside the quality tag. */
  extras?: ReactNode
}) {
  const { pet, state } = model
  return (
    <div className="s-body">
      <div className="s-head">
        <QualityTag model={model} />
        {extras}
        <OwnToggle model={model} disabled={disabled} onOwn={handlers.onOwn} />
        <ShinyToggle model={model} disabled={disabled} onShiny={handlers.onShiny} />
      </div>
      <div className="s-portrait">
        <CardArt model={model} className="s-art" />
      </div>
      <IdentityBlock model={model} />
      <div className="s-stars">
        <StarRow star={state.star} />
      </div>
      <div className="s-picker">
        <StarPicker
          model={model}
          open={starOpen}
          disabled={disabled}
          onToggle={() => handlers.onStarMenu(pet.id)}
          onType={(type) => handlers.onStarType(pet.id, type)}
          onCount={(count) => handlers.onStarCount(pet.id, count)}
        />
      </div>
      <CostHints model={model} onTrials={handlers.onTrials} />
      <EvolutionRow model={model} disabled={disabled} onEvolution={handlers.onEvolution} />
      <StatList model={model} disabled={disabled} onGrade={handlers.onGrade} />
      <DataWarning model={model} />
      <CardFooter model={model} />
    </div>
  )
}

/**
 * What the card backdrop is coloured by, if anything.
 *
 * This is deliberately a backdrop-only control. When one of these is on, the
 * skin swaps its --s-panel and nothing else: borders, frames, radii, grids,
 * bezels, type and every control keep the colours the design chose for them.
 * That way recolouring a card can never quietly restyle it.
 */
export type Tint = 'none' | 'element' | 'rarity'

/** Wrapper that carries the modifiers every skin reacts to. */
export function CardShell({
  model,
  skin,
  disabled,
  starOpen,
  tint = 'none',
  handlers,
  extras,
  children,
}: {
  model: CardModel
  skin: string
  disabled: boolean
  starOpen: boolean
  tint?: Tint
  handlers: CardHandlers
  extras?: ReactNode
  children?: ReactNode
}) {
  const shiny = model.state.shiny && model.shinyAvailable
  const className = [
    's-card',
    skin,
    model.state.own ? '' : 'not-owned',
    shiny ? 'is-shiny' : '',
    starOpen ? 'is-picking' : '',
    model.stats.evolutionValid ? '' : 'has-data-error',
  ]
    .filter(Boolean)
    .join(' ')

  // Element and rarity are both already on the model, so nothing is derived
  // here beyond picking which of the two the backdrop should follow.
  //
  // Only the rarity reference is a gradient, so only rarity mode publishes three
  // stops. Element mode publishes the single --s-tint it always did and leaves
  // the others unset; the stylesheet chains them back to --s-tint, which means
  // an element backdrop resolves to exactly the same colours as before rather
  // than to a flat end stop.
  const tintColor = tint === 'element'
    ? model.element.color
    : tint === 'rarity'
      ? model.rarityPalette.mid
      : null

  const style = {
    '--s-accent': model.quality.color,
    ...(tintColor ? { '--s-tint': tintColor } : {}),
    ...(tint === 'rarity'
      ? {
          '--s-tint-hi': model.rarityPalette.hi,
          '--s-tint-mid': model.rarityPalette.mid,
          '--s-tint-lo': model.rarityPalette.lo,
        }
      : {}),
  } as CSSProperties

  return (
    <article
      className={className}
      style={style}
      data-tint={tint === 'none' ? undefined : tint}
      aria-label={`${model.stageName} card`}
    >
      <div className="s-chrome" aria-hidden="true">{children}</div>
      <CardBody model={model} disabled={disabled} starOpen={starOpen} handlers={handlers} extras={extras} />
    </article>
  )
}