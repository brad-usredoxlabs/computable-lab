/**
 * SlashSuggestionList — popover UI for the slash-menu extension.
 *
 * Keyboard navigation (arrow up/down, Enter/Tab to insert, Escape to close)
 * lives here so the TipTap extension only has to forward keystrokes via
 * `onKeyDown`. The component is intentionally presentational: it does not
 * fetch suggestions — that is the extension's job.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { SlashSuggestion } from './types'
import { badgeStyles } from './tokens'

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
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setSelected(0)
  }, [items])

  useEffect(() => {
    const node = listRef.current?.querySelector(
      `[data-slash-row="${selected}"]`,
    ) as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (event.key === 'ArrowDown') {
        setSelected((idx) => Math.min(idx + 1, Math.max(items.length - 1, 0)))
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelected((idx) => Math.max(idx - 1, 0))
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[selected]
        if (item && !item.disabled) {
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
      <div style={containerStyle}>
        <div style={emptyStyle}>Searching…</div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={emptyStyle}>{emptyLabel ?? 'No matches'}</div>
      </div>
    )
  }

  return (
    <div ref={listRef} role="listbox" style={containerStyle}>
      {items.map((item, index) => {
        const colors = badgeStyles(item.badge)
        const focused = index === selected
        return (
          <button
            key={item.key}
            data-slash-row={index}
            type="button"
            disabled={item.disabled}
            onMouseDown={(e) => {
              e.preventDefault()
              if (!item.disabled) command(item)
            }}
            style={{
              display: 'flex',
              width: '100%',
              padding: '10px 12px',
              border: 'none',
              background: focused ? '#f1f5f9' : 'white',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              opacity: item.disabled ? 0.6 : 1,
              alignItems: 'flex-start',
              gap: '10px',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
            }}
          >
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: colors.color,
                background: colors.background,
                border: `1px solid ${colors.border}`,
                borderRadius: '999px',
                padding: '2px 6px',
                marginTop: '2px',
                whiteSpace: 'nowrap',
              }}
            >
              {item.badge}
            </span>
            <span style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.9rem', color: '#0f172a' }}>{item.label}</div>
              {item.subtitle && (
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                  {item.subtitle}
                </div>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
})

SlashSuggestionList.displayName = 'SlashSuggestionList'

const containerStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #d0d5dd',
  borderRadius: '8px',
  boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
  // Cap at ~40% of viewport so the popover always fits even when the
  // trigger is near the screen edge; scroll internally beyond that.
  maxHeight: 'min(280px, 40vh)',
  overflowY: 'auto',
  minWidth: '260px',
  // Without a max-width, long CHEBI/CL/etc. labels can stretch the popover
  // across the whole viewport. Cap it so it stays a panel, not a banner.
  maxWidth: 'min(420px, 90vw)',
}

const emptyStyle: React.CSSProperties = {
  padding: '12px',
  fontSize: '0.85rem',
  color: '#64748b',
}
