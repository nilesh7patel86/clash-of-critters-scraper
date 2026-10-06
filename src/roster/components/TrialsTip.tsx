import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PetUnit } from '../../gameData'
import { getStageName, trialIconUrl, trialLines } from '../../petHelpers'
import type { EvolutionStep, PetState } from '../../petHelpers'

export function TrialsTip({ pet, state, next, anchor, onClose }: { pet: PetUnit; state: PetState; next: EvolutionStep; anchor: HTMLElement; onClose: () => void }) {
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
  const stageName = getStageName(pet, state.evo)
  return (
    <div className="trials-tip" ref={ref} style={style} role="dialog" aria-label={`Evolution ${next.stage} trials for ${stageName}`}>
      <button type="button" className="trials-close" onClick={onClose} aria-label="Close trial details">×</button>
      <h4>{stageName} · Evolution {next.stage} trials</h4>
      <p className="trials-gate">Requires ★{next.gate ?? '?'}{next.ready ? ' · ready now' : ` · ${next.cost} boxes`}</p>
      {lines.length === 0 ? <p className="trials-empty">No trial data in the cache.</p> : null}
      <ul className="trials-list">
        {lines.map((line, index) => (
          <li key={index}>
            {line.icon ? <img src={trialIconUrl(line.icon)} alt="" /> : null}
            <span>{line.text}{line.alt ? <em className="trials-alt">{line.alt}</em> : null}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
