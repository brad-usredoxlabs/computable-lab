/**
 * StudyPickerPopover — small popover for "open a study" from the
 * ProjectTabStrip's `+` button. Lists all studies (via
 * `apiClient.listRecordsByKind('study')`), filterable by title; click a
 * row to call `onPick(studyId, title)`.
 *
 * Intentionally minimal — for the workspace redesign's first cut this
 * does not support search-as-you-type against a remote endpoint (the
 * record set is small enough to fetch once and filter client-side) and
 * does not differentiate state (draft / accepted) since the user can see
 * the title.
 *
 * Tap-outside and Escape both dismiss via `onDismiss`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import './StudyPickerPopover.css'

interface StudyOption {
  studyId: string
  title: string
}

/** listRecordsByKind fetch cap; when hit, the footer says so (§4.4). */
const FETCH_LIMIT = 200

export interface StudyPickerPopoverProps {
  onPick: (studyId: string, title: string) => void
  onDismiss: () => void
  /**
   * When provided, the picker offers creation: a persistent footer action
   * and, when the filter matches nothing, "Create '<query>'" so a search
   * for a project that doesn't exist flows straight into making it.
   */
  onCreateNew?: (query: string) => void
}

export function StudyPickerPopover({ onPick, onDismiss, onCreateNew }: StudyPickerPopoverProps) {
  const [studies, setStudies] = useState<StudyOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { records } = await apiClient.listRecordsByKind('study', 200)
        if (cancelled) return
        const options: StudyOption[] = []
        for (const env of records) {
          const payload = env.payload as Record<string, unknown>
          const title = typeof payload.title === 'string' ? payload.title : env.recordId
          options.push({ studyId: env.recordId, title })
        }
        options.sort((a, b) => a.title.localeCompare(b.title))
        setStudies(options)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStudies([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Autofocus the search input so keyboard users can type immediately.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Tap-outside to dismiss.
  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (target && containerRef.current?.contains(target)) return
      onDismiss()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onDismiss])

  const filtered = useMemo(() => {
    if (!studies) return []
    const q = query.trim().toLowerCase()
    if (!q) return studies
    return studies.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.studyId.toLowerCase().includes(q),
    )
  }, [studies, query])

  // Clamp highlightedIndex into the visible range so arrow keys can never
  // point at an unrendered row.
  const clampedHighlight = filtered.length === 0
    ? -1
    : Math.min(Math.max(highlightedIndex, 0), filtered.length - 1)

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex((i) =>
          filtered.length === 0 ? 0 : (i + 1) % filtered.length,
        )
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex((i) =>
          filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
        )
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const choice = filtered[clampedHighlight]
        if (choice) {
          onPick(choice.studyId, choice.title)
        } else if (onCreateNew && query.trim()) {
          // No match — Enter flows into creating what was searched for.
          onCreateNew(query.trim())
        }
      }
    },
    [clampedHighlight, filtered, onDismiss, onPick, onCreateNew, query],
  )

  return (
    <div
      className="study-picker-popover"
      ref={containerRef}
      role="dialog"
      aria-label="Open another study"
      data-testid="study-picker-popover"
    >
      <input
        type="text"
        ref={inputRef}
        className="study-picker-popover__input"
        placeholder="Search studies"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlightedIndex(0)
        }}
        onKeyDown={handleKeyDown}
        data-testid="study-picker-input"
      />
      {error ? (
        <div className="study-picker-popover__error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="study-picker-popover__list" role="listbox">
        {studies === null ? (
          <div className="study-picker-popover__empty">Loading…</div>
        ) : filtered.length === 0 ? (
          onCreateNew ? (
            <button
              type="button"
              className="study-picker-popover__row study-picker-popover__row--create"
              onClick={() => onCreateNew(query.trim())}
              data-testid="study-picker-create-from-query"
            >
              {query.trim()
                ? `No studies match — create "${query.trim()}"`
                : 'No studies yet — create the first project'}
            </button>
          ) : (
            <div className="study-picker-popover__empty">No studies match.</div>
          )
        ) : (
          filtered.map((s, i) => {
            const isHighlighted = i === clampedHighlight
            return (
              <button
                key={s.studyId}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                className={
                  isHighlighted
                    ? 'study-picker-popover__row study-picker-popover__row--highlighted'
                    : 'study-picker-popover__row'
                }
                onMouseEnter={() => setHighlightedIndex(i)}
                onClick={() => onPick(s.studyId, s.title)}
                data-testid={`study-picker-row-${s.studyId}`}
              >
                <span className="study-picker-popover__row-title">{s.title}</span>
                <span className="study-picker-popover__row-id">{s.studyId}</span>
              </button>
            )
          })
        )}
      </div>
      {studies !== null && studies.length >= FETCH_LIMIT ? (
        <div className="study-picker-popover__footer-note">
          First {FETCH_LIMIT} studies shown — refine your search.
        </div>
      ) : null}
      {onCreateNew ? (
        <button
          type="button"
          className="study-picker-popover__footer-create"
          onClick={() => onCreateNew(query.trim())}
          data-testid="study-picker-new-project"
        >
          + New project
        </button>
      ) : null}
    </div>
  )
}
