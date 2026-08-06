/**
 * SplashSearch — cross-type search for the splash landing. Hits /tree/search
 * once, groups results by entity type, and offers type filter chips.
 */
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchRecords } from '../../shared/api/treeClient'
import type { IndexEntry } from '../../types/tree'
import {
  KIND_LABEL, kindToSearchEntityType, recordRoute,
  type SearchEntityType,
} from '../lib/kindMeta'
import { useOptionalOpenTabs } from './OpenTabsContext'
import {
  projectTabId, runTabId, claimTabId, labEntityTabId,
  type WorkspaceTab,
} from '../../event-editor/workspace/types'
import { resolveProtocolPick, isProtocolKind } from '../lib/protocolRouting'
import { openContent, openInNewTab } from '../lib/openContent'
import './SplashSearch.css'

export interface SplashSearchResult {
  recordId: string
  title: string
  kind: string
  typeLabel: string
  entityType: SearchEntityType
  path: string
}

/** Pure mapping + grouping (unit-testable). */
export function normalizeSearchResults(entries: IndexEntry[]): SplashSearchResult[] {
  const results: SplashSearchResult[] = []
  for (const entry of entries) {
    const entityType = kindToSearchEntityType(entry.kind ?? '')
    if (!entityType) continue
    results.push({
      recordId: entry.recordId,
      title: entry.title ?? entry.recordId,
      kind: entry.kind ?? '',
      typeLabel: KIND_LABEL[entry.kind ?? ''] ?? entry.kind ?? '',
      entityType,
      path: recordRoute(entry.recordId, entry.kind ?? '', entityType),
    })
  }
  return results
}

const TYPE_ORDER: SearchEntityType[] = ['project', 'run', 'claim', 'lab']
const TYPE_LABELS: Record<SearchEntityType, string> = {
  project: 'Projects', run: 'Runs', claim: 'Claims', lab: 'Lab',
}

export function SplashSearch() {
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SplashSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeType, setActiveType] = useState<SearchEntityType | 'all'>('all')

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const resp = await searchRecords(query.trim(), { limit: 40 })
        setResults(normalizeSearchResults(resp.records ?? []))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  const grouped = useMemo(() => {
    const buckets: Record<SearchEntityType, SplashSearchResult[]> = {
      project: [], run: [], claim: [], lab: [],
    }
    for (const r of results) buckets[r.entityType].push(r)
    return buckets
  }, [results])

  const visible = activeType === 'all' ? results : grouped[activeType]

  const countFor = (t: SearchEntityType) => grouped[t].length

  const buildTab = (r: SplashSearchResult): { tab: WorkspaceTab; route: string } => {
    if (r.entityType === 'project') {
      return {
        tab: { id: projectTabId(r.recordId), kind: 'project', studyId: r.recordId, title: r.title },
        route: r.path,
      }
    }
    if (r.entityType === 'run') {
      return {
        tab: { id: runTabId(r.recordId), kind: 'run', runId: r.recordId, title: r.title },
        route: r.path,
      }
    }
    if (r.entityType === 'claim') {
      return {
        tab: { id: claimTabId(r.recordId), kind: 'claim', claimId: r.recordId, title: r.title },
        route: r.path,
      }
    }
    return {
      tab: { id: labEntityTabId(r.recordId), kind: 'lab-entity', schemaId: '', recordId: r.recordId, entityType: r.kind, title: r.title },
      route: r.path,
    }
  }

  const openResult = async (r: SplashSearchResult) => {
    if (isProtocolKind(r.kind)) {
      const dest = await resolveProtocolPick(r.recordId, r.path)
      if (dest.kind === 'project' && dest.studyId) {
        openContent(openTabs, navigate, {
          id: projectTabId(dest.studyId), kind: 'project', studyId: dest.studyId, title: r.title,
        }, dest.route)
        return
      }
      // fall through: lab-global protocol → open as lab-entity
    }
    const { tab, route } = buildTab(r)
    openContent(openTabs, navigate, tab, route)
  }

  const openInNewTabResult = (e: MouseEvent, r: SplashSearchResult) => {
    e.preventDefault()
    e.stopPropagation()
    const { tab, route } = buildTab(r)
    openInNewTab(openTabs, navigate, tab, route)
  }

  return (
    <div className="splash-search">
      <input
        className="splash-page__search"
        data-testid="splash-search"
        placeholder="Search everything…"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim().length >= 2 ? (
        <div className="splash-search__panel" data-testid="splash-search-panel">
          <div className="splash-search__filters">
            <button
              type="button"
              className={`splash-search__filter${activeType === 'all' ? ' splash-search__filter--active' : ''}`}
              onClick={() => setActiveType('all')}
            >
              All{results.length ? ` (${results.length})` : ''}
            </button>
            {TYPE_ORDER.map((t) =>
              countFor(t) === 0 ? null : (
                <button
                  key={t}
                  type="button"
                  className={`splash-search__filter${activeType === t ? ' splash-search__filter--active' : ''}`}
                  onClick={() => setActiveType(t)}
                >
                  {TYPE_LABELS[t]} ({countFor(t)})
                </button>
              ),
            )}
          </div>
          {loading ? (
            <p className="splash-search__hint">Searching…</p>
          ) : visible.length === 0 ? (
            <p className="splash-search__hint">No matches.</p>
          ) : (
            <ul className="splash-search__list">
              {visible.map((r) => (
                <li key={`${r.kind}:${r.recordId}`}>
                  <button
                    type="button"
                    className="splash-search__result"
                    data-testid={`splash-search-result-${r.recordId}`}
                    onClick={() => openResult(r)}
                    onContextMenu={(e) => openInNewTabResult(e, r)}
                    title="Left-click: open here · Right-click: open in new tab"
                  >
                    <span className={`splash-search__type splash-search__type--${r.entityType}`}>
                      {r.typeLabel}
                    </span>
                    <span className="splash-search__title">{r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
