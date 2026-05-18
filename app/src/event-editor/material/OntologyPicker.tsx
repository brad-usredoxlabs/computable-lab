import { useEffect, useRef, useState } from 'react'
import { olsResultToRef, searchOLS, type OLSResultRef, type OLSSearchResult } from '../../shared/api/olsClient'

/**
 * Single-value ontology picker. Renders as either a search input with
 * inline result list, or a chip + clear button when a term is picked.
 *
 * Used in the cell + sample builder forms for "the one organism" /
 * "the one cell type" / "the one tissue" slots — fields where exactly
 * one ontology ref is expected, unlike the multi-ref `class` array.
 *
 * `ontologies` narrows the OLS query (e.g., `['ncbitaxon']` for
 * organisms). Falls back to the default material ontology list when
 * empty, but the caller almost always wants to narrow it.
 */

const DEBOUNCE_MS = 200
const RESULT_LIMIT = 6

export interface OntologyPickerProps {
  label: string
  /** Placeholder shown in the empty search input. */
  placeholder?: string
  /** Field hint rendered below the search input. */
  hint?: string
  /** OLS ontology slugs to search (e.g. ['ncbitaxon'] for organisms). */
  ontologies: string[]
  /** Optional flag for required slots — drives the label decoration. */
  required?: boolean
  picked: OLSResultRef | null
  onChange: (next: OLSResultRef | null) => void
}

export function OntologyPicker({
  label,
  placeholder = 'Search ontology…',
  hint,
  ontologies,
  required,
  picked,
  onChange,
}: OntologyPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OLSSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const latestQueryRef = useRef('')
  latestQueryRef.current = query

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2 || picked) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const handle = window.setTimeout(async () => {
      try {
        const hits = await searchOLS({
          query: trimmed,
          ontologies,
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
  }, [query, picked, ontologies])

  if (picked) {
    return (
      <div className="add-material-solvent-picked">
        <span className="add-material-field-label">
          {label}{required ? ' *' : ''}
        </span>
        <div className="add-material-solvent-chip">
          <span className="add-material-ref-namespace">{picked.namespace}</span>
          <span className="add-material-ref-label">{picked.label}</span>
          <code className="add-material-ref-id">{picked.id}</code>
          <button
            type="button"
            className="add-material-ref-remove"
            onClick={() => { onChange(null); setQuery('') }}
            aria-label={`Clear ${label}`}
          >×</button>
        </div>
        {hint ? <span className="add-material-field-hint">{hint}</span> : null}
      </div>
    )
  }

  return (
    <div className="add-material-solvent-search">
      <span className="add-material-field-label">
        {label}{required ? ' *' : ''}
      </span>
      <div className="add-material-ref-search">
        <input
          type="text"
          className="add-material-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? <span className="add-material-spinner" aria-hidden /> : null}
      </div>
      {hint ? <span className="add-material-field-hint">{hint}</span> : null}
      {results.length > 0 ? (
        <ul className="add-material-ref-results">
          {results.map((result) => (
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
