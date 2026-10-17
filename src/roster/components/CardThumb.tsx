// A live miniature of a card, for the roster's card-style picker.
//
// The picker shows what each design actually looks like rather than a name in a
// list, so this mounts the real card - the roster's own PetCard, or one of the
// card-lab layouts - at the width it is designed for, then scales and centres it
// to fit the slot it is handed. It measures itself, so a thumbnail stays right
// whatever the card's content does: a pet with fewer evolution stages is a
// shorter card, and the scale follows.
//
// The miniature is purely decorative. It is hidden from assistive tech, it
// cannot take focus, and nothing inside it answers the pointer, so a scaled copy
// of a card full of buttons is safe to sit inside a menu row. Only the slot's
// size is read, and that comes from CSS, so the same miniature serves both the
// picker's trigger and the wider rows of its menu.

import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import './CardThumb.css'

export function CardThumb({ width, children }: { width: number; children: ReactNode }) {
  const slotRef = useRef<HTMLSpanElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const slot = slotRef.current
    const inner = innerRef.current
    if (!slot || !inner) return

    const fit = () => {
      const slotWidth = slot.clientWidth
      const slotHeight = slot.clientHeight
      const width = inner.offsetWidth
      const height = inner.offsetHeight
      if (!slotWidth || !slotHeight || !width || !height) return
      const scale = Math.min(slotWidth / width, slotHeight / height)
      const x = (slotWidth - width * scale) / 2
      const y = (slotHeight - height * scale) / 2
      // Written straight to the node rather than through state: the miniature
      // re-measures on its own, and routing that through a render would redraw
      // the whole card for a purely visual correction.
      inner.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(slot)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <span className="card-thumb" ref={slotRef} aria-hidden="true" inert>
      <span className="card-thumb-inner" ref={innerRef} style={{ width }}>
        {children}
      </span>
    </span>
  )
}
