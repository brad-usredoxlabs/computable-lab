import { useState } from 'react'
import { useResolveSearch } from '../../shared/hooks/useResolveSearch'
import { resolveCandidateToRef, tierBadge, type ResolveRef } from '../../shared/api/resolveUtil'
/**
 * Single-value ontology picker. Renders as either a search input with
 * inline result list, or a chip + clear button when a term is picked.
 *
 * Used in the cell + sample builder forms for "the one organism" /
 * "the one cell type" / "the one tissue" slots — fields where exactly
 * one ontology ref is expected, unlike the multi-ref `class` array.
 *
 * Searches now route through the backend resolve() spine (POST /api/resolve)
 * which implements a 5-tier resolution strategy (local records → OAK → OLS4 → vendor → mint).
 */

export interface OntologyPickerProps {
  label: string
  /** Placeholder shown in the empty search input. */
  placeholder?: string
  /** Field hint rendered below the search input. */
  hint?: string
  /** OLS ontology slugs — kept for backward compatibility, backend resolves via config. */
  ontologies?: string[]
  /** Optional flag for required slots — drives the label decoration. */
  required?: boolean
  picked: ResolveRef | null
  onChange: (next: ResolveRef | null) => void
}

export function OntologyPicker({
  label,
  placeholder = 'Search ontology…',
  hint,
  required,
  picked,
  onChange,
}: OntologyPickerProps) {
  const [query, setQuery] = useState('')

  const { results, loading } = useResolveSearch({
    query,
    enabled: !picked && query.trim().length >= 2,
    debounceMs: 200,
    maxResults: 6,
  })

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
          {results.map((candidate) => (
            <li key={candidate.curie}>
              <button
                type="button"
                className="add-material-row"
                data-category="ontology"
                onClick={() => onChange(resolveCandidateToRef(candidate))}
              >
                <span className="add-material-row-title">
                  {candidate.label}
                  <span className="add-material-row-ontology">
                    {candidate.namespace}
                  </span>
                </span>
                <span className="add-material-row-meta">
                  {candidate.curie}
                  {candidate.definition ? ` · ${candidate.definition}` : ''}
                </span>
                <span className={`text-[9px] ${
                  candidate.source === 'mint' ? 'bg-orange-50 text-orange-600' :
                  candidate.tier <= 2 ? 'bg-emerald-50 text-emerald-600' :
                  'bg-purple-50 text-purple-600'
                } rounded px-1 py-0.5`}>
                  {tierBadge(candidate).label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
