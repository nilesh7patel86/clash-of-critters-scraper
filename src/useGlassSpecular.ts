import { useEffect } from 'react'

/** The surfaces that carry the highlight. Kept in step with the panes that paint
 * it in RosterPage.css (GL-12). */
const SURFACES = '.site-header, .panel, .badge-panel'

/**
 * A pointer-tracked specular highlight (GL-12).
 *
 * One rAF-throttled `pointermove` listener writes the pointer's position within
 * each glass surface to `--glass-spec-x` / `--glass-spec-y`, as a percentage of
 * that surface's own box; the surfaces paint it as their first background layer
 * so the glint sits on the glass, under the content, and stays put as the page
 * scrolls.
 *
 * Nothing is written until the pointer moves, and nothing at all under
 * `prefers-reduced-motion: reduce`, so those surfaces keep the parked fallback
 * position and stay flat. The surface list is re-queried once per painted frame
 * (~0.2ms on the app's DOM) rather than cached, so lazily-mounted routes and
 * panels that appear later are picked up without any extra bookkeeping.
 */
export function useGlassSpecular() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let touch = { x: 0, y: 0 }
    let frame = 0

    const paint = () => {
      frame = 0
      const { x, y } = touch
      const surfaces = Array.from(document.querySelectorAll<HTMLElement>(SURFACES))
      // Read every box first, then write every custom property: interleaving the
      // two would force a synchronous layout on each surface.
      const boxes = surfaces.map((surface) => surface.getBoundingClientRect())
      surfaces.forEach((surface, index) => {
        const box = boxes[index]
        if (!box.width || !box.height) return
        surface.style.setProperty('--glass-spec-x', `${(((x - box.left) / box.width) * 100).toFixed(2)}%`)
        surface.style.setProperty('--glass-spec-y', `${(((y - box.top) / box.height) * 100).toFixed(2)}%`)
      })
    }

    const handleMove = (event: PointerEvent) => {
      touch = { x: event.clientX, y: event.clientY }
      if (!frame) frame = window.requestAnimationFrame(paint)
    }

    window.addEventListener('pointermove', handleMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handleMove)
      if (frame) window.cancelAnimationFrame(frame)
      // Leave no inline coordinates behind for a remount to inherit.
      document.querySelectorAll<HTMLElement>(SURFACES).forEach((surface) => {
        surface.style.removeProperty('--glass-spec-x')
        surface.style.removeProperty('--glass-spec-y')
      })
    }
  }, [])
}
