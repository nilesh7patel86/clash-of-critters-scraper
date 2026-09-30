// Filter dropdown for the codex.
//
// A native <select> cannot show artwork in its options, and these filters are
// about elements and roles, which the wiki draws as icons. So this is a
// listbox: a trigger that shows the current choice, and a menu whose rows carry
// the wiki image beside the text.
//
// The menu is portalled to the body. The filter bar is clipped with clip-path,
// which would cut a dropdown anchored inside it clean off at the panel edge, and
// a menu rendered in the flow would push the card grid around as it opened.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './CodexFilterSelect.css'

export interface FilterOption {
  value: string
  label: string
  /** Wiki artwork for this option, when the cache has one. */
  icon?: string | null
  /** Hue for the swatch used when there is no artwork, or none at all. */
  tint?: string | null
}

interface CodexFilterSelectProps {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}

type Anchor = { left: number; top: number; bottom: number; width: number }

export default function CodexFilterSelect({ label, value, options, onChange }: CodexFilterSelectProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [dropUp, setDropUp] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selected = options.find((option) => option.value === value) ?? options[0]

  const close = useCallback((refocus = false) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])

  const show = useCallback(() => {
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    setOpen(true)
  }, [options, value])

  const choose = useCallback(
    (next: string) => {
      if (next !== value) onChange(next)
      close(true)
    },
    [close, onChange, value],
  )

  // Track the trigger so the portalled menu stays pinned to it.
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect) setAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width })
    }
    measure()
    window.addEventListener('resize', measure)
    // A fixed menu cannot follow its trigger up a scrolling page, so any scroll
    // closes it rather than leaving it floating over the grid.
    const onScroll = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  // The menu only mounts once it has an anchor, so the focus move waits for
  // that: without the anchor in the deps the listbox never takes focus and the
  // arrow keys go nowhere.
  useLayoutEffect(() => {
    if (open && anchor) menuRef.current?.focus()
  }, [open, anchor])

  // Flip above the trigger when there is no room below, and keep the row the
  // keyboard is on inside the scroll box.
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!open || !menu || !anchor) return
    const height = menu.offsetHeight
    setDropUp(anchor.bottom + 6 + height > window.innerHeight - 8 && anchor.top - 6 - height > 8)
    const row = menu.children[active] as HTMLElement | undefined
    if (!row) return
    if (row.offsetTop < menu.scrollTop) menu.scrollTop = Math.max(0, row.offsetTop - 4)
    else if (row.offsetTop + row.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = row.offsetTop + row.offsetHeight - menu.clientHeight + 4
    }
  }, [open, anchor, active])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      show()
    }
  }

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index - 1 + options.length) % options.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(options.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = options[active]
      if (option) choose(option.value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="cx-select">
      <span className="cx-select-label" id={`${listId}-label`}>
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className={`cx-dropdown${open ? ' cx-dropdown-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${listId}-label ${listId}-value`}
        onClick={() => (open ? close() : show())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="cx-dropdown-value" id={`${listId}-value`}>
          {selected?.icon ? <img className="cx-dropdown-icon" src={selected.icon} alt="" loading="lazy" /> : null}
          {selected?.tint ? <span className="cx-dropdown-swatch" style={{ background: selected.tint, '--cx-swatch': selected.tint } as React.CSSProperties} /> : null}
          {selected?.label ?? ''}
        </span>
        <svg className="cx-dropdown-caret" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && anchor
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={`${listId}-label`}
              aria-activedescendant={`${listId}-opt-${active}`}
              className={`cx-dropdown-menu${dropUp ? ' cx-dropdown-menu-up' : ''}`}
              style={
                {
                  left: anchor.left,
                  minWidth: anchor.width,
                  ...(dropUp ? { bottom: window.innerHeight - anchor.top + 6 } : { top: anchor.bottom + 6 }),
                } as React.CSSProperties
              }
              onKeyDown={onMenuKeyDown}
            >
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  className={`cx-option${index === active ? ' cx-option-active' : ''}${option.value === value ? ' cx-option-selected' : ''}`}
                  style={{ '--cx-option-tint': option.tint ?? 'transparent' } as React.CSSProperties}
                  // pointerdown, not click: choosing must not cost the menu its
                  // focus before the handler runs.
                  onPointerDown={(event) => {
                    event.preventDefault()
                    choose(option.value)
                  }}
                  onPointerEnter={() => setActive(index)}
                >
                  {option.icon ? (
                    <img className="cx-option-icon" src={option.icon} alt="" loading="lazy" />
                  ) : option.tint ? (
                    <span className="cx-option-swatch" />
                  ) : (
                    <span className="cx-option-icon" aria-hidden="true" />
                  )}
                  <span className="cx-option-label">{option.label}</span>
                  {option.value === value ? (
                    <svg className="cx-option-check" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2 6.4l2.7 2.7L10 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}