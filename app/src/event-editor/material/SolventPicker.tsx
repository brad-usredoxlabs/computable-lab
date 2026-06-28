import { useEffect, useRef, useState } from 'react'
import { apiClient, type MaterialSearchItem, type ResolveCandidate } from '../../shared/api/client'
import { resolveCandidateToRef, tierBadge, type ResolveRef } from '../../shared/api/resolveUtil'

/**
 * Inline picker for the solvent slot in BuildCompoundForm. Searches
 * local materials first (preferring records the user already created)
 * and then the backend resolve() spine for ontology solvent terms.
 * Returns a `MaterialRef`-compatible shape that `createFormulation`'s
 * `solventRef` accepts.
 *
 * Bias toward chemistry: resolve spine will naturally surface ChEBI
 * terms for solvent queries since those are the most relevant ontology
 * matches for chemical solvents.
 */

const DEBOUNCE_MS = 200
const RESULT_LIMIT = 6

export type PickedSolvent =
  | { kind: 'record'; recordId: string; label: string }
  | ResolveRef

export interface SolventPickerProps {
  picked: PickedSolvent | null
  onChange: (next: PickedSolvent | null) => void
}

/** Tier badge style helper */
function tierBadgeStyle(variant: string) {
  switch (variant) {
    case 'local':
      return 'bg-emerald-50 text-emerald-600'
    case 'new':
      return 'bg-orange-50 text-orange-600'
    default:
      return 'bg-purple-50 text-purple-600'
  }
}

export function SolventPicker({ picked, onChange }: SolventPickerProps) {
  const [query, setQuery] = useState('')
  const [localResults, setLocalResults] = useState<MaterialSearchItem[]>([])
  const [ontologyResults, setOntologyResults] = useState<ResolveCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const latestQueryRef = useRef('')
  latestQueryRef.current = query

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2 || picked) {
      setLocalResults([])
      setOntologyResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const handle = window.setTimeout(async () => {
      try {
        const [local, resolve] = await Promise.all([
          apiClient.searchMaterials({ q: trimmed, limit: RESULT_LIMIT }),
          apiClient.resolve({ term: trimmed, limit: RESULT_LIMIT }),
        ])
        if (latestQueryRef.current !== query) return
        setLocalResults(local.items ?? [])
        setOntologyResults(resolve.candidates ?? [])
      } catch {
        if (latestQueryRef.current !== query) return
        setLocalResults([])
        setOntologyResults([])
      } finally {
        if (latestQueryRef.current === query) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [query, picked])

  if (picked) {
    return (
      <div className="add-material-solvent-picked">
        <span className="add-material-field-label">Solvent</span>
        <div className="add-material-solvent-chip">
          {picked.kind === 'record' ? (
            <>
              <span className="add-material-ref-label">{picked.label}</span>
              <code className="add-material-ref-id">{picked.recordId}</code>
            </>
          ) : (
            <>
              <span className="add-material-ref-namespace">{picked.namespace}</span>
              <span className="add-material-ref-label">{picked.label}</span>
              <code className="add-material-ref-id">{picked.id}</code>
            </>
          )}
          <button
            type="button"
            className="add-material-ref-remove"
            onClick={() => { onChange(null); setQuery('') }}
            aria-label="Clear solvent"
          >×</button>
        </div>
      </div>
    )
  }

  return (
    <div className="add-material-solvent-search">
      <span className="add-material-field-label">Solvent</span>
      <div className="add-material-ref-search">
        <input
          type="text"
          className="add-material-input"
          placeholder="Search solvents (e.g., DMSO, water, ethanol)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? <span className="add-material-spinner" aria-hidden /> : null}
      </div>

      {(localResults.length > 0 || ontologyResults.length > 0) ? (
        <ul className="add-material-ref-results">
          {localResults.map((item) => (
            <li key={item.recordId}>
              <button
                type="button"
                className="add-material-row"
                data-category={item.category}
                onClick={() => onChange({ kind: 'record', recordId: item.recordId, label: item.title })}
              >
                <span className="add-material-row-title">{item.title}</span>
                <span className="add-material-row-meta">
                  {item.category.replace(/-/g, ' ')}
                  {item.subtitle ? ` · ${item.subtitle}` : ''}
                </span>
              </button>
            </li>
          ))}
          {ontologyResults.map((candidate) => {
            const ref = resolveCandidateToRef(candidate)
            const badge = tierBadge(candidate)
            return (
              <li key={candidate.curie}>
                <button
                  type="button"
                  className="add-material-row"
                  data-category="ontology"
                  onClick={() => onChange(ref)}
                >
                  <span className="add-material-row-title">
                    {candidate.label}
                    <span className="add-material-row-ontology">
                      {candidate.namespace}
                    </span>
                  </span>
                  <span className="add-material-row-meta">
                    {candidate.curie}
                    <span className={`text-[9px] ${tierBadgeStyle(badge.variant)} rounded px-1 py-0.5 ml-1`}>
                      {badge.label}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
