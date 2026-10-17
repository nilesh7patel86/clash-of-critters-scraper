// A filter dropdown that can show artwork beside its options.
//
// A native <select> cannot render an image inside an <option>, and the elements
// and roles these filters talk about are exactly the things the game draws as
// icons. So this is a listbox: a trigger showing the current choice and a menu
// whose rows carry the icon beside the text.
//
// It is the game-table twin of CodexFilterSelect, which paints the codex's dark
// angular palette. This one reads a handful of --is-* tokens with --page-*
// fallbacks, so the roster and the card lab get their own colours while sharing
// one behaviour. The menu is portalled to the body - the roster toolbar and the
// trials filter bar are clipped, which would cut a menu anchored inside them off
// at the panel edge - so it carries its own light/dark token pair, the same way
// the codex menu does.
//
// Two optional extras widen it past a plain list. An option may carry a live
// `preview` node instead of artwork (the roster's card picker shows a miniature
// of each design), and an optional `description` line under the label. Setting
// `rich` opens the room that needs - taller, wider rows and a roomier menu -
// while the default stays the compact icon list the element filters use.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './IconSelect.css'

export interface IconSelectOption {
  value: string
  label: string
  /** Artwork for this option, when the game draws one. */
  icon?: string | null
  /** Hue for the swatch used when there is no artwork. */
  tint?: string | null
  /** A live node shown in place of artwork, for options better shown than named. */
  preview?: ReactNode
  /** A second, smaller line under the label. */
  description?: string
}

interface IconSelectProps {
  label: string
  value: string
  options: IconSelectOption[]
  onChange: (value: string) => void
  /** Extra classes for the root, so a page can slot it into its control row. */
  className?: string
  /** Open the taller, wider variant used by options that carry a preview. */
  rich?: boolean
}

/** The floor width a rich menu opens to, so previews and descriptions have
 * room even when the trigger itself is narrow. */
const RICH_MENU_WIDTH = 320

type Anchor = { left: number; top: number; bottom: number; width: number }

export default function IconSelect({ label, value, options, onChange, className, rich = false }: IconSelectProps) {
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
    // A fixed menu cannot follow its trigger up a scrolling page, so a scroll of
    // the page (or any ancestor) closes it rather than leaving it floating over
    // the content. Scrolling *inside* the menu itself must not close it: the
    // menu is its own scroll container, so a scroll whose target is inside it is
    // the user browsing the options, not the page moving underneath.
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
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
    <div className={`icon-select${rich ? ' icon-select--rich' : ''}${className ? ` ${className}` : ''}`}>
      <span className="icon-select-caption" id={`${listId}-label`}>
        {label}
      </span>
      <span className="icon-select-control">
        <button
          ref={triggerRef}
          type="button"
          className={`icon-select-trigger${open ? ' open' : ''}${selected?.preview ? ' has-preview' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={`${listId}-label ${listId}-value`}
          onClick={() => (open ? close() : show())}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="icon-select-value" id={`${listId}-value`}>
            {selected?.icon ? (
              <img className="icon-select-icon" src={selected.icon} alt="" loading="lazy" />
            ) : selected?.tint ? (
              <span className="icon-select-swatch" style={{ background: selected.tint } as React.CSSProperties} />
            ) : null}
            <span className="icon-select-text">{selected?.label ?? ''}</span>
          </span>
          <svg className="icon-select-caret" viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* The preview is overlaid on the trigger rather than placed inside it:
            a live card carries its own buttons, and a button cannot contain a
            button. It is inert and ignores the pointer, so clicks fall through
            to the trigger underneath. */}
        {selected?.preview ? (
          <span className="icon-select-trigger-preview" aria-hidden="true">{selected.preview}</span>
        ) : null}
      </span>

      {open && anchor
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={`${listId}-label`}
              aria-activedescendant={`${listId}-opt-${active}`}
              className={`icon-select-menu${dropUp ? ' icon-select-menu-up' : ''}${rich ? ' icon-select-menu--rich' : ''}`}
              style={menuStyle(anchor, dropUp, rich)}
              onKeyDown={onMenuKeyDown}
            >
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  className={`icon-select-option${rich ? ' icon-select-option--rich' : ''}${index === active ? ' active' : ''}${option.value === value ? ' selected' : ''}`}
                  style={{ '--is-option-tint': option.tint ?? 'transparent' } as React.CSSProperties}
                  // pointerdown, not click: choosing must not cost the menu its
                  // focus before the handler runs.
                  onPointerDown={(event) => {
                    event.preventDefault()
                    choose(option.value)
                  }}
                  onPointerEnter={() => setActive(index)}
                >
                  {option.preview ? (
                    <span className="icon-select-option-preview">{option.preview}</span>
                  ) : option.icon ? (
                    <img className="icon-select-option-icon" src={option.icon} alt="" loading="lazy" />
                  ) : option.tint ? (
                    <span className="icon-select-option-swatch" />
                  ) : (
                    <span className="icon-select-option-icon" aria-hidden="true" />
                  )}
                  {option.description ? (
                    <span className="icon-select-option-body">
                      <span className="icon-select-option-label">{option.label}</span>
                      <span className="icon-select-option-desc">{option.description}</span>
                    </span>
                  ) : (
                    <span className="icon-select-option-label">{option.label}</span>
                  )}
                  {option.value === value ? (
                    <svg className="icon-select-option-check" viewBox="0 0 12 12" aria-hidden="true">
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

/**
 * Where the portalled menu sits, relative to its trigger.
 *
 * A plain list matches the trigger's width and hugs its left edge. A rich menu
 * opens to a floor width so previews have room, which means it can run off the
 * right of a narrow viewport if it simply follows the trigger, so its left edge
 * is pulled back inside the window and its width is capped to fit.
 */
function menuStyle(anchor: Anchor, dropUp: boolean, rich: boolean): React.CSSProperties {
  const vertical = dropUp ? { bottom: window.innerHeight - anchor.top + 6 } : { top: anchor.bottom + 6 }
  if (!rich) return { left: anchor.left, minWidth: anchor.width, ...vertical }
  const width = Math.min(Math.max(anchor.width, RICH_MENU_WIDTH), window.innerWidth - 16)
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))
  return { left, width, ...vertical }
}
