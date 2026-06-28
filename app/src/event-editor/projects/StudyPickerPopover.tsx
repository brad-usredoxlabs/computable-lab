/**
 * StudyPickerPopover — small popover for "open a study" from the
 * ProjectTabStrip's `+` button. Lists all studies (via
 * `apiClient.listRecordsByKind('study')`), filterable by title; click a
 * row to call `onPick(studyId, title)`.
 *
 * When the user types a search query, it delegates to the JSON-LD search
 * index via `apiClient.searchProjects()` which returns full-text matches
 * grouped by study with hierarchical paths (Study → Experiment → Run →
 * Component). Empty query still shows all studies (existing behavior).
 *
 * Tap-outside and Escape both dismiss via `onDismiss`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient, type StudySearchHit, type StudySearchMatch } from '../../shared/api/client'
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
  const [searchHits, setSearchHits] = useState<StudySearchHit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)
  // Guard: when onPick fires, the mousedown tap-outside handler must not
  // dismiss before the pick handler completes (§1: click-race fix).
  const pickedRef = useRef(false)

  // Fetch all studies for the empty-query case.
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
        options.sort((a, b) =>
          (a.title || a.studyId).localeCompare(b.title || b.studyId),
        )
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

  const handleQueryChange = useCallback((nextQuery: string) => {
    const trimmed = nextQuery.trim()
    const seq = searchSeqRef.current + 1
    searchSeqRef.current = seq

    if (searchTimerRef.current !== null) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }

    setQuery(nextQuery)
    setHighlightedIndex(0)

    if (!trimmed) {
      setSearchHits(null)
      setIsSearching(false)
      setError(null)
      return
    }

    setIsSearching(true)
    setSearchHits(null)
    setError(null)

    searchTimerRef.current = setTimeout(() => {
      searchTimerRef.current = null
      void (async () => {
        try {
          const result = await apiClient.searchProjects(trimmed)
          if (searchSeqRef.current !== seq) return
          setSearchHits(result.studies)
          setError(null)
        } catch (err) {
          if (searchSeqRef.current !== seq) return
          setSearchHits([])
          const message = err instanceof Error ? err.message : String(err)
          setError('Search failed: ' + message)
        } finally {
          if (searchSeqRef.current === seq) setIsSearching(false)
        }
      })()
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      searchSeqRef.current += 1
      if (searchTimerRef.current !== null) {
        clearTimeout(searchTimerRef.current)
        searchTimerRef.current = null
      }
    }
  }, [])

  // Autofocus the search input so keyboard users can type immediately.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Tap-outside to dismiss.
  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (pickedRef.current) {
        pickedRef.current = false
        return
      }
      const target = event.target as Node | null
      if (target && containerRef.current?.contains(target)) return
      onDismiss()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onDismiss])

  // When query is non-empty, use search hits; otherwise use all studies.
  const isSearchMode = query.trim().length > 0

  const filtered = useMemo(() => {
    if (isSearchMode) {
      // searchHits is already filtered by the backend
      return searchHits ?? []
    }
    if (!studies) return []
    const q = query.trim().toLowerCase()
    if (!q) return studies.map((s) => ({
      studyId: s.studyId,
      title: s.title,
      matches: [] as StudySearchMatch[],
    }))
    return studies
      .filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.studyId.toLowerCase().includes(q),
      )
      .map((s) => ({
        studyId: s.studyId,
        title: s.title,
        matches: [] as StudySearchMatch[],
      }))
  }, [studies, searchHits, query, isSearchMode])

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
          pickedRef.current = true
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
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        data-testid="study-picker-input"
      />
      {error ? (
        <div className="study-picker-popover__error" role="alert">
          {error}
        </div>
      ) : null}
      {isSearching ? (
        <div className="study-picker-popover__empty" role="status">
          Searching projects for "{query.trim().slice(0, 40)}{query.trim().length > 40 ? '…' : ''}"…
        </div>
      ) : null}
      {/* aria-live region for result count (§9: accessibility). */}
      <div className="study-picker-popover__sr-only" aria-live="polite" aria-atomic="true">
        {filtered.length} {filtered.length === 1 ? 'result' : 'results'} available
      </div>
      <div className="study-picker-popover__list" role="listbox">
        {studies === null && !isSearchMode ? (
          <div className="study-picker-popover__empty">Loading…</div>
        ) : isSearching ? null : filtered.length === 0 ? (
          onCreateNew ? (
            <button
              type="button"
              className="study-picker-popover__row study-picker-popover__row--create"
              onClick={() => onCreateNew(query.trim())}
              data-testid="study-picker-create-from-query"
            >
              {query.trim()
                ? `No studies match — create "${query.trim().slice(0, 30)}${query.trim().length > 30 ? '…' : ''}"`
                : 'No studies yet — create the first project'}
            </button>
          ) : (
            <div className="study-picker-popover__empty">No studies match.</div>
          )
        ) : (
          filtered.map((hit, i) => {
            const isHighlighted = i === clampedHighlight
            return (
              <div
                key={hit.studyId}
                className={
                  isHighlighted
                    ? 'study-picker-popover__row study-picker-popover__row--highlighted'
                    : 'study-picker-popover__row'
                }
                role="option"
                aria-selected={isHighlighted}
                onMouseEnter={() => setHighlightedIndex(i)}
                onClick={() => {
                  pickedRef.current = true
                  onPick(hit.studyId, hit.title)
                }}
                data-testid={`study-picker-row-${hit.studyId}`}
              >
                <span className="study-picker-popover__row-title">{hit.title}</span>
                <span className="study-picker-popover__row-id">{hit.studyId}</span>
                {hit.matches && hit.matches.length > 0 ? (
                  <span className="study-picker-popover__match-path">
                    Matched in: {hit.matches[0].path}
                    {hit.matches.length > 1 && ` (+${hit.matches.length - 1} more)`}
                  </span>
                ) : null}
              </div>
            )
          })
        )}
      </div>
      {studies !== null && studies.length >= FETCH_LIMIT && !isSearchMode ? (
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
