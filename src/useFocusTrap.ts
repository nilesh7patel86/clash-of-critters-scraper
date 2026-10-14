import { useEffect } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>, onEscape?: () => void) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const focusable = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hasAttribute('disabled'))

    const firstFocusable = focusable()[0]
    firstFocusable?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault()
        onEscape()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const activeElement = document.activeElement as HTMLElement | null
      if (event.shiftKey) {
        if (activeElement === first || !container.contains(activeElement)) {
          event.preventDefault()
          last.focus()
        }
        return
      }
      if (activeElement === last || !container.contains(activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [active, containerRef, onEscape])
}