/**
 * SlashSuggestionList — popover UI for the slash-menu extension.
 *
 * Keyboard navigation (arrow up/down, Enter/Tab to insert, Escape to close)
 * lives here so the TipTap extension only has to forward keystrokes via
 * `onKeyDown`. The component is intentionally presentational: it does not
 * fetch suggestions — that is the extension's job.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { firstDefaultFocusIndex } from './clarifyPickerRanking'
import type { SlashSuggestion, SlashSuggestionDetail } from './types'
import { badgeStyles, detailOntologyFieldLabel } from './tokens'
import './SlashSuggestionList.css'

export interface SlashSuggestionListProps {
  items: SlashSuggestion[]
  loading: boolean
  emptyLabel?: string
  command: (item: SlashSuggestion) => void
}

export interface SlashSuggestionListHandle {
  onKeyDown(event: KeyboardEvent): boolean
}

export const SlashSuggestionList = forwardRef<
  SlashSuggestionListHandle,
  SlashSuggestionListProps
>(({ items, loading, emptyLabel, command }, ref) => {
  // L2-CLARIFY-PICKER-1 (P1): the focused (keyboard) default starts at the
  // FIRST row whose canBeDefault !== false (the data-declared never-default
  // flag — a composition row is never the default when the data says so; the
  // W1 wrong-material commit). When no row carries canBeDefault: false this
  // is 0 — the slash editor's byte-stable default (bait 6). The rule lives in
  // ONE place: the exported firstDefaultFocusIndex (advc-c1 DEFECT 6 deleted
  // the duplicated closure). Arrows may move the highlight over a
  // non-defaultable row (the list stays fully navigable) but Enter/Tab
  // commits the highlighted row ONLY when it is defaultable — a non-defaultable
  // row can never be Enter-committed (W1).
  const [selected, setSelected] = useState(() => firstDefaultFocusIndex(items))
  const listRef = useRef<HTMLDivElement | null>(null)
  // Hover tooltip: which row is hovered + where its button sits on screen.
  // Rendered through a portal because the list scrolls internally and would
  // clip any child positioned outside its box.
  const [hover, setHover] = useState<{ index: number; anchor: DOMRect } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    setHover(null)
  }

  const scheduleHover = (index: number, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    // Small delay so sweeping the cursor through the list doesn't flash a
    // tooltip per row.
    hoverTimer.current = setTimeout(() => {
      setHover({ index, anchor: el.getBoundingClientRect() })
    }, 150)
  }

  useEffect(() => {
    setSelected(firstDefaultFocusIndex(items))
    clearHover()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
  }, [])

  useEffect(() => {
    const node = listRef.current?.querySelector(
      `[data-slash-row="${selected}"]`,
    ) as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        setSelected((idx) => Math.min(idx + 1, Math.max(items.length - 1, 0)))
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        setSelected((idx) => Math.max(idx - 1, 0))
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        const item = items[selected]
        // L2-CLARIFY-PICKER-1 (P1): a non-defaultable row (canBeDefault: false
        // — the data flag; a composition row regardless of rank) can NEVER be
        // Enter-committed: the W1 wrong-material commit was Enter on the
        // focused default landing a composition. Display may rest on it
        // (navigable); committing requires the defaultable flag.
        if (item && !item.disabled && item.canBeDefault !== false) {
          command(item)
          return true
        }
        return items.length > 0
      }
      return false
    },
  }))

  if (loading && items.length === 0) {
    return (
      <div className="slash-suggestion-list">
        <div className="slash-suggestion-list__empty">Searching…</div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="slash-suggestion-list">
        <div className="slash-suggestion-list__empty">{emptyLabel ?? 'No matches'}</div>
      </div>
    )
  }

  const hoveredDetail =
    hover && items[hover.index]?.detail ? items[hover.index]!.detail! : null

  return (
    <div
      ref={listRef}
      role="listbox"
      className="slash-suggestion-list"
      onScroll={clearHover}
      onMouseLeave={clearHover}
    >
      {items.map((item, index) => {
        const colors = badgeStyles(item.badge)
        const focused = index === selected
        return (
          <button
            key={item.key}
            data-slash-row={index}
            type="button"
            disabled={item.disabled}
            onMouseEnter={(e) => {
              if (item.detail) scheduleHover(index, e.currentTarget)
              else clearHover()
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              if (!item.disabled) command(item)
            }}
            className={
              focused
                ? 'slash-suggestion-list__row slash-suggestion-list__row--focused'
                : 'slash-suggestion-list__row'
            }
          >
            {/* Badge colours are per-badge semantics (tokens.ts), not theme
                chrome — they stay inline; everything else is CSS. */}
            <span
              className="slash-suggestion-list__badge"
              style={{
                color: colors.color,
                background: colors.background,
                border: `1px solid ${colors.border}`,
              }}
            >
              {item.badge}
            </span>
            <span className="slash-suggestion-list__body">
              {item.sectionLabel && (
                <div className="slash-suggestion-list__section">
                  {item.sectionLabel}
                </div>
              )}
              <div className="slash-suggestion-list__label">{item.label}</div>
              {item.subtitle && (
                <div className="slash-suggestion-list__subtitle">{item.subtitle}</div>
              )}
              {/* L2-CLARIFY-PICKER-1 (P2): the per-row commit-consequence line —
                  what committing THIS row binds, generated from the row's own
                  record (the resolver attaches it; the W3 hover-card
                  unreachability stops mattering: the bind is on the row, not
                  behind a hover). DetailTooltip + `detail` stay (kept, bait 2). */}
              {item.consequence && (
                <div className="slash-suggestion-list__consequence">
                  {item.consequence}
                </div>
              )}
            </span>
          </button>
        )
      })}
      {hover && hoveredDetail
        ? createPortal(
            <DetailTooltip
              detail={hoveredDetail}
              anchor={hover.anchor}
              listRect={listRef.current?.getBoundingClientRect() ?? hover.anchor}
            />,
            document.body,
          )
        : null}
    </div>
  )
})

SlashSuggestionList.displayName = 'SlashSuggestionList'

/**
 * Side-docked hover card for one suggestion. Docks to the right edge of the
 * suggestion popover (left when the viewport runs out), vertically aligned
 * with the hovered row. Pointer-events stay off so it never steals the
 * hover/click from the list underneath it.
 */
export function DetailTooltip({
  detail,
  anchor,
  listRect,
}: {
  detail: SlashSuggestionDetail
  anchor: DOMRect
  listRect: DOMRect
}) {
  const WIDTH = 300
  const GAP = 8
  const fitsRight = listRect.right + GAP + WIDTH <= window.innerWidth - GAP
  const left = fitsRight
    ? listRect.right + GAP
    : Math.max(GAP, listRect.left - GAP - WIDTH)
  const top = Math.min(Math.max(anchor.top, GAP), window.innerHeight - 200)

  return (
    <div
      role="tooltip"
      className="slash-suggestion-detail"
      style={{ position: 'fixed', left, top, width: WIDTH }}
    >
      {detail.source && (
        <div
          className="slash-suggestion-detail__source"
          style={{ marginBottom: detail.definition || detail.id ? '6px' : 0 }}
        >
          {detail.source}
        </div>
      )}
      {detail.definition && (
        <p className="slash-suggestion-detail__definition">{detail.definition}</p>
      )}
      <dl className="slash-suggestion-detail__rows">
        {detail.ontology && <TooltipRow label={detailOntologyFieldLabel(detail.ontology)} value={detail.ontology} />}
        {detail.id && <TooltipRow label="ID" value={detail.id} mono />}
        {detail.iri && <TooltipRow label="IRI" value={detail.iri} mono />}
        {(detail.extra ?? []).map((row) => (
          <TooltipRow key={row.label} label={row.label} value={row.value} />
        ))}
      </dl>
    </div>
  )
}

function TooltipRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <>
      <dt className="slash-suggestion-detail__label">{label}</dt>
      <dd
        className="slash-suggestion-detail__value"
        style={mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.72rem' } : undefined}
      >
        {value}
      </dd>
    </>
  )
}

