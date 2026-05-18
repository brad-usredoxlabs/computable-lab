import { useCallback, useEffect, useRef, useState } from 'react'
import { olsResultToRef, searchOLS, type OLSResultRef, type OLSSearchResult } from '../../shared/api/olsClient'
import { MATERIAL_OLS_ONTOLOGIES } from '../../types/material'

/**
 * Edits an array of ontology refs. Renders each ref as a removable chip
 * plus an inline mini-search to add more from the configured OLS
 * ontologies. Used by every builder form (compound / mixture / cells /
 * sample) to populate the eventual `material.class` array — which the
 * schema already accepts as `Array<Ref>` with `uniqueItems: true`.
 *
 * Deduplicates by IRI on add, so accidental double-clicks are harmless.
 */

const DEBOUNCE_MS = 200
const RESULT_LIMIT = 8

export interface MultiOntologyRefListProps {
  refs: OLSResultRef[]
  onChange: (next: OLSResultRef[]) => void
  /**
   * Override the default ontology list (`MATERIAL_OLS_ONTOLOGIES`) — e.g.,
   * the cells builder may want to bias toward CL + NCBITaxon. Empty array
   * falls back to the default list.
   */
  ontologies?: string[]
  /** Hint text rendered above the input. */
  label?: string
}

export function MultiOntologyRefList({
  refs,
  onChange,
  ontologies,
  label = 'Ontology references',
}: MultiOntologyRefListProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OLSSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const latestQueryRef = useRef('')
  latestQueryRef.current = query

  const effectiveOntologies = ontologies && ontologies.length > 0
    ? ontologies
    : MATERIAL_OLS_ONTOLOGIES

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const handle = window.setTimeout(async () => {
      try {
        const hits = await searchOLS({
          query: trimmed,
          ontologies: effectiveOntologies,
          rows: RESULT_LIMIT,
        })
        if (latestQueryRef.current !== query) return
        setResults(hits ?? [])
      } catch {
        if (latestQueryRef.current !== query) return
        setResults([])
      } finally {
        if (latestQueryRef.current === query) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [query, effectiveOntologies])

  const handleAdd = useCallback((result: OLSSearchResult) => {
    const ref = olsResultToRef(result)
    if (refs.some((existing) => existing.uri === ref.uri || existing.id === ref.id)) return
    onChange([...refs, ref])
    setQuery('')
    setResults([])
  }, [onChange, refs])

  const handleRemove = useCallback((target: OLSResultRef) => {
    onChange(refs.filter((existing) => existing.uri !== target.uri))
  }, [onChange, refs])

  return (
    <div className="add-material-ref-list">
      <div className="add-material-field-label">{label}</div>

      {refs.length > 0 ? (
        <ul className="add-material-ref-chips">
          {refs.map((ref) => (
            <li key={ref.uri} className="add-material-ref-chip">
              <span className="add-material-ref-namespace">{ref.namespace}</span>
              <span className="add-material-ref-label">{ref.label}</span>
              <code className="add-material-ref-id">{ref.id}</code>
              <button
                type="button"
                className="add-material-ref-remove"
                onClick={() => handleRemove(ref)}
                aria-label={`Remove ${ref.label}`}
              >×</button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="add-material-ref-search">
        <input
          type="text"
          className="add-material-input"
          placeholder={refs.length === 0 ? 'Search ontologies to add a reference…' : 'Add another…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? <span className="add-material-spinner" aria-hidden /> : null}
      </div>

      {results.length > 0 ? (
        <ul className="add-material-ref-results">
          {results.map((result) => (
            <li key={result.iri}>
              <button
                type="button"
                className="add-material-row"
                data-category="ontology"
                onClick={() => handleAdd(result)}
              >
                <span className="add-material-row-title">
                  {result.label}
                  <span className="add-material-row-ontology">
                    {result.ontology_prefix ?? result.ontology_name}
                  </span>
                </span>
                <span className="add-material-row-meta">
                  {result.obo_id}
                  {result.description?.[0] ? ` · ${result.description[0]}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
