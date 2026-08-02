/**
 * GlobalSearchBar — global search input in the navbar.
 *
 * Retrieves projects, runs, claims, lab entities, and documents in one
 * result set using the existing /tree/search endpoint.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.1, §2.4
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchRecords } from '../../shared/api/treeClient'
import type { IndexEntry } from '../../types/tree'
import {
  kindToSearchEntityType, KIND_LABEL, recordRoute,
  type SearchEntityType,
} from '../lib/kindMeta'
import { resolveProtocolPick, isProtocolKind } from '../lib/protocolRouting'
import { projectTabId } from '../../event-editor/workspace/types'
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
        openTabs?.openTab({ id: projectTabId(dest.studyId), kind: 'project', studyId: dest.studyId, title: result.title }, true)
        navigate(dest.route)
        return
      }
    }
    navigate(resultPath(result))
  }

  return (
    <div className="global-search-bar" ref={containerRef}>
      <input
        className="global-search-bar__input"
        data-testid="global-search-bar"
        placeholder="Find anything…"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
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
