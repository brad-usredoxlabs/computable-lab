/**
 * ResultsTable — schema-driven table of JSON-LD search hits.
 *
 * Columns are read from the active schema's `*.ui.yaml` (`list.columns`).
 * Cell values come from each hit's `facets` payload — which the projector
 * already keys by the same ui.yaml column paths in Phase 1. No per-type
 * code, no record refetch for the row body; the detail pane handles deep
 * inspection.
 *
 * When no type is selected, we render a small default column set (id,
 * type, label, updated) so "All records" stays useful.
 */

import { useEffect, useState } from 'react'
import { apiClient } from '../shared/api/client'
import type { ListColumn, UISpec } from '../types/uiSpec'
import type {
  FacetValue,
  JsonLdHit,
  JsonLdSearchResponse,
} from '../shared/api/jsonLdSearchClient'

export interface ResultsTableProps {
  schemaId: string | null
  response: JsonLdSearchResponse | null
  loading: boolean
  selectedId: string | null
  onSelect: (recordId: string) => void
  onNextPage: () => void
  onPrevPage: () => void
  hasPrev: boolean
}

const DEFAULT_COLUMNS: ListColumn[] = [
  { path: '$.recordId', label: 'ID', width: '160px' },
  { path: '$.kind', label: 'Type', width: '120px' },
  { path: '$.title', label: 'Title' },
  { path: '$.updatedAt', label: 'Updated', width: '180px' },
]

export function ResultsTable({
  schemaId,
  response,
  loading,
  selectedId,
  onSelect,
  onNextPage,
  onPrevPage,
  hasPrev,
}: ResultsTableProps) {
  const [uiSpec, setUiSpec] = useState<UISpec | null>(null)
  const [uiError, setUiError] = useState<string | null>(null)

  useEffect(() => {
    setUiError(null)
    if (!schemaId) {
      setUiSpec(null)
      return
    }
    let cancelled = false
    apiClient
      .getUiSpec(schemaId)
      .then((spec) => {
        if (!cancelled) setUiSpec(spec)
      })
      .catch((err: unknown) => {
        if (!cancelled) setUiError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [schemaId])

  const columns: ListColumn[] = uiSpec?.list?.columns?.length
    ? uiSpec.list.columns
    : DEFAULT_COLUMNS

  return (
    <section className="cl-browser__results" aria-label="Search results">
      {uiError && (
        <div className="cl-browser__results-warn">UI spec failed to load: {uiError}</div>
      )}
      <div className="cl-browser__results-scroll">
        <table className="cl-browser__results-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.path}
                  style={col.width ? { width: typeof col.width === 'number' ? `${col.width}px` : col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !response && (
              <tr>
                <td colSpan={columns.length} className="cl-browser__results-empty">
                  Loading…
                </td>
              </tr>
            )}
            {response && response.hits.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="cl-browser__results-empty">
                  No records match this query.
                </td>
              </tr>
            )}
            {response?.hits.map((hit) => (
              <tr
                key={hit.recordId}
                className={`cl-browser__results-row${
                  selectedId === hit.recordId ? ' is-selected' : ''
                }`}
                onClick={() => onSelect(hit.recordId)}
              >
                {columns.map((col) => (
                  <td key={col.path}>{renderCell(hit, col)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="cl-browser__results-footer">
        <span className="cl-browser__results-count">
          {response ? `${response.hits.length} of ${response.total}` : '—'}
        </span>
        <div className="cl-browser__results-pager">
          <button
            type="button"
            onClick={onPrevPage}
            disabled={!hasPrev || loading}
            className="cl-browser__pager-btn"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={onNextPage}
            disabled={!response?.nextCursor || loading}
            className="cl-browser__pager-btn"
          >
            Next →
          </button>
        </div>
      </footer>
    </section>
  )
}

function renderCell(hit: JsonLdHit, column: ListColumn): string {
  const path = column.path
  // Built-in projections — these are always present on a hit and don't
  // require the UI spec to declare them as facets.
  if (path === '$.recordId') return hit.recordId
  if (path === '$.kind' || path === '$.@type' || path === '$.type') return hit.kind
  if (path === '$.title' || path === '$.label' || path === '$.name') return hit.label
  if (path === '$.updatedAt') return formatTimestamp(hit.updatedAt)

  const values = hit.facets[path]
  if (!values || values.length === 0) return ''
  return values.map(formatFacetValue).join(', ')
}

function formatFacetValue(value: FacetValue): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}
