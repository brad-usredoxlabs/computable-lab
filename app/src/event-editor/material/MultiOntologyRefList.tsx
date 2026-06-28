import { useCallback, useState } from 'react'
import { useResolveSearch } from '../../shared/hooks/useResolveSearch'
import { resolveCandidateToRef, tierBadge, type ResolveRef } from '../../shared/api/resolveUtil'
import type { ResolveCandidate } from '../../shared/api/client'

/**
 * Edits an array of ontology refs. Renders each ref as a removable chip
 * plus an inline mini-search to add more via the backend resolve() spine.
 * Used by every builder form (compound / mixture / cells / sample) to populate
 * the eventual `material.class` array — which the schema already accepts as
 * `Array<Ref>` with `uniqueItems: true`.
 *
 * Searches route through POST /api/resolve (5-tier: local records → OAK → OLS4 → vendor → mint).
 *
 * Deduplicates by CURIE on add, so accidental double-clicks are harmless.
 */

export interface MultiOntologyRefListProps {
  refs: ResolveRef[]
  onChange: (next: ResolveRef[]) => void
  /** Hint text rendered above the input. */
  label?: string
  /** Legacy scoped ontology list; backend resolve config is authoritative. */
  ontologies?: string[]
}

export function MultiOntologyRefList({
  refs,
  onChange,
  label = 'Ontology references',
}: MultiOntologyRefListProps) {
  const [query, setQuery] = useState('')

  const { results, loading } = useResolveSearch({
    query,
    enabled: query.trim().length >= 2,
    debounceMs: 200,
    maxResults: 8,
  })

  const handleAdd = useCallback((candidate: ResolveCandidate) => {
    const ref = resolveCandidateToRef(candidate)
    // Deduplicate by curie or uri
    if (refs.some((existing) => existing.uri === ref.uri || existing.id === ref.id)) return
    onChange([...refs, ref])
    setQuery('')
  }, [onChange, refs])

  const handleRemove = useCallback((target: ResolveRef) => {
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
          {results.map((candidate) => (
            <li key={candidate.curie}>
              <button
                type="button"
                className="add-material-row"
                data-category="ontology"
                onClick={() => handleAdd(candidate)}
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
