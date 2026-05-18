import { useEffect, useRef, useState } from 'react'
import { searchOLS, olsResultToRef, type OLSResultRef, type OLSSearchResult } from '../../shared/api/olsClient'
import { apiClient, type MaterialSearchItem } from '../../shared/api/client'

/**
 * Inline picker for the solvent slot in BuildCompoundForm. Searches
 * local materials first (preferring records the user already created)
 * and then ChEBI for solvent ontology terms. Returns a `MaterialRef`-
 * compatible shape that `createFormulation`'s `solventRef` accepts.
 *
 * Bias toward chemistry: only searches ChEBI for the ontology fallback,
 * because solvents are almost always ChEBI terms.
 */

const DEBOUNCE_MS = 200
const RESULT_LIMIT = 6

export type PickedSolvent =
  | { kind: 'record'; recordId: string; label: string }
  | OLSResultRef

export interface SolventPickerProps {
  picked: PickedSolvent | null
  onChange: (next: PickedSolvent | null) => void
}

export function SolventPicker({ picked, onChange }: SolventPickerProps) {
  const [query, setQuery] = useState('')
  const [localResults, setLocalResults] = useState<MaterialSearchItem[]>([])
  const [ontologyResults, setOntologyResults] = useState<OLSSearchResult[]>([])
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
        const [local, ontology] = await Promise.all([
          apiClient.searchMaterials({ q: trimmed, limit: RESULT_LIMIT }),
          searchOLS({ query: trimmed, ontologies: ['chebi'], rows: RESULT_LIMIT }),
        ])
        if (latestQueryRef.current !== query) return
        setLocalResults(local.items ?? [])
        setOntologyResults(ontology ?? [])
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
          {ontologyResults.map((result) => (
            <li key={result.iri}>
              <button
                type="button"
                className="add-material-row"
                data-category="ontology"
                onClick={() => onChange(olsResultToRef(result))}
              >
                <span className="add-material-row-title">
                  {result.label}
                  <span className="add-material-row-ontology">
                    {result.ontology_prefix ?? result.ontology_name}
                  </span>
                </span>
                <span className="add-material-row-meta">{result.obo_id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
