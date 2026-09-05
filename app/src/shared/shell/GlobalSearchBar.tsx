/**
 * GlobalSearchBar — global search input in the navbar.
 *
 * Retrieves projects, runs, claims, lab entities, and documents in one
 * result set using the existing /tree/search endpoint.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.1, §2.4
 */

import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchRecords } from '../../shared/api/treeClient'
import type { IndexEntry } from '../../types/tree'
import {
  kindToSearchEntityType, KIND_LABEL, recordRoute,
  type SearchEntityType,
} from '../lib/kindMeta'
import { resolveProtocolPick, isProtocolKind } from '../lib/protocolRouting'
import { openContent, openInNewTab } from '../lib/openContent'
import { projectTabId, runTabId, claimTabId, labEntityTabId, type WorkspaceTab } from '../../event-editor/workspace/types'
import { useOptionalOpenTabs } from '../shell/OpenTabsContext'
import './GlobalSearchBar.css'

interface SearchResult {
  recordId: string
  title: string
  kind: string
  typeLabel: string
  entityType: SearchEntityType
}

function resultPath(result: SearchResult): string {
  return recordRoute(result.recordId, result.kind, result.entityType)
}

/** Build the top-level tab + route for a search result (non-protocol branches). */
function buildResultTab(result: SearchResult): { tab: WorkspaceTab; route: string } {
  const route = resultPath(result)
  if (result.entityType === 'project') {
    return { tab: { id: projectTabId(result.recordId), kind: 'project', studyId: result.recordId, title: result.title }, route }
  }
  if (result.entityType === 'run') {
    return { tab: { id: runTabId(result.recordId), kind: 'run', runId: result.recordId, title: result.title }, route }
  }
  if (result.entityType === 'claim') {
    return { tab: { id: claimTabId(result.recordId), kind: 'claim', claimId: result.recordId, title: result.title }, route }
  }
  return { tab: { id: labEntityTabId(result.recordId), kind: 'lab-entity', schemaId: '', recordId: result.recordId, entityType: result.kind, title: result.title }, route }
}

export function GlobalSearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const openTabs = useOptionalOpenTabs()

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const response = await searchRecords(query, { limit: 20 })
        const mapped: SearchResult[] = response.records
          .map((entry: IndexEntry) => {
            const entityType = kindToSearchEntityType(entry.kind ?? '')
            if (!entityType) return null
            return {
              recordId: entry.recordId,
              title: entry.title ?? entry.recordId,
              kind: entry.kind ?? '',
              typeLabel: KIND_LABEL[entry.kind ?? ''] ?? entry.kind ?? '',
              entityType,
            }
          })
          .filter((r): r is SearchResult => r !== null)
        setResults(mapped)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleSelect = async (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    setResults([])
    if (isProtocolKind(result.kind)) {
      const dest = await resolveProtocolPick(result.recordId, resultPath(result))
      if (dest.kind === 'project' && dest.studyId) {
        openContent(openTabs, navigate, {
          id: projectTabId(dest.studyId), kind: 'project', studyId: dest.studyId, title: result.title,
        }, dest.route)
        return
      }
    }
    const { tab, route } = buildResultTab(result)
    openContent(openTabs, navigate, tab, route)
  }

  const handleOpenInNewTab = (e: ReactMouseEvent, result: SearchResult) => {
    e.preventDefault()
    setOpen(false)
    setQuery('')
    setResults([])
    if (isProtocolKind(result.kind)) {
      void resolveProtocolPick(result.recordId, resultPath(result)).then((dest) => {
        if (dest.kind === 'project' && dest.studyId) {
          openInNewTab(openTabs, navigate, {
            id: projectTabId(dest.studyId), kind: 'project', studyId: dest.studyId, title: result.title,
          }, dest.route)
          return
        }
        const { tab, route } = buildResultTab(result)
        openInNewTab(openTabs, navigate, tab, route)
      })
      return
    }
    const { tab, route } = buildResultTab(result)
    openInNewTab(openTabs, navigate, tab, route)
  }

  return (
    <div className="global-search-bar" ref={containerRef}>
      <form
        role="search"
        data-testid="global-search-form"
        className="global-search-bar__form"
        onSubmit={(e) => {
          // Master search: a full query without a picked result lands on the
          // /find graph-search endpoint which runs the semantic search.
          e.preventDefault()
          const q = query.trim()
          if (q.length === 0) return
          setOpen(false)
          if (results.length === 1) {
            // Single clear record match → open it directly.
            void handleSelect(results[0]!)
            return
          }
          navigate(`/find?q=${encodeURIComponent(q)}`)
        }}
      >
        <input
          className="global-search-bar__input"
          data-testid="global-search-bar"
          placeholder="Find anything…"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
      </form>
      {open && results.length > 0 ? (
        <div className="global-search-bar__results" role="listbox">
          {results.map((r) => (
            <button
              key={`${r.kind}:${r.recordId}`}
              type="button"
              role="option"
              className={`global-search-bar__result global-search-bar__result--${r.entityType}`}
              data-testid={`global-search-result-${r.recordId}`}
              onClick={() => handleSelect(r)}
              onContextMenu={(e) => handleOpenInNewTab(e, r)}
              title="Left-click: open here · Right-click: open in new tab"
            >
              <span className={`global-search-bar__result-type global-search-bar__result-type--${r.entityType}`}>
                {r.typeLabel}
              </span>
              <span className="global-search-bar__result-title">{r.title}</span>
            </button>
          ))}
        </div>
      ) : null}
      {loading && query.length >= 2 ? (
        <div className="global-search-bar__loading">Searching…</div>
      ) : null}
    </div>
  )
}
