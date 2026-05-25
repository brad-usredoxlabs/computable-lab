/**
 * OntologyAxisPicker — small popover that searches OLS for ontology terms,
 * scoped to a single recipe axis (chemical/CHEBI, organism/NCBITaxon,
 * anatomy/Uberon, cellular-compartment/GO, cell-line/CL, or open).
 *
 * Used inside the wizard's Recipe and Mechanism panels. The picker only
 * surfaces ontology terms; local-material search is intentionally out of
 * scope here because the wizard's job is to ground *concepts*, not pick
 * specific instances.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { searchOLS, olsResultToRef, type OLSSearchResult } from '../../../shared/api/olsClient'
import type { Ref } from '../../../types/ref'
import type { RecipeAxis } from './WizardDraft'

const AXIS_TO_ONTOLOGIES: Record<RecipeAxis, string[]> = {
  chemical: ['chebi'],
  organism: ['ncbitaxon'],
  anatomy: ['uberon'],
  'cellular-compartment': ['go'],
  'cell-line': ['cl'],
  other: ['chebi', 'ncbitaxon', 'uberon', 'go', 'cl', 'ncit'],
}

export const AXIS_LABELS: Record<RecipeAxis, string> = {
  chemical: 'Chemical (CHEBI)',
  organism: 'Organism (NCBITaxon)',
  anatomy: 'Anatomy (Uberon)',
  'cellular-compartment': 'Cellular (GO)',
  'cell-line': 'Cell line (CL)',
  other: 'Other ontology',
}

export const AXIS_OPTIONS: RecipeAxis[] = [
  'chemical',
  'organism',
  'anatomy',
  'cellular-compartment',
  'cell-line',
  'other',
]

interface Props {
  axis: RecipeAxis
  value: Ref | null
  onChange: (ref: Ref | null) => void
  placeholder?: string
  buttonLabel?: string
}

const SEARCH_DEBOUNCE_MS = 250
const SEARCH_LIMIT = 12

export function OntologyAxisPicker({ axis, value, onChange, placeholder, buttonLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OLSSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      const handle2 = window.requestAnimationFrame(() => inputRef.current?.focus())
      return () => window.cancelAnimationFrame(handle2)
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const handle = window.setTimeout(async () => {
      try {
        const ontologies = AXIS_TO_ONTOLOGIES[axis]
        const hits = await searchOLS({ query: trimmed, ontologies, rows: SEARCH_LIMIT })
        setResults(hits ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ontology search failed')
      } finally {
        setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [axis, query])

  const clear = useCallback(() => onChange(null), [onChange])

  return (
    <div className="cl-axis-picker">
      <div className="cl-axis-picker__row">
        <button
          type="button"
          className="cl-axis-picker__value"
          onClick={() => setOpen((current) => !current)}
        >
          {value ? value.label || value.id : buttonLabel ?? 'Search ontology'}
        </button>
        {value ? (
          <button type="button" className="cl-axis-picker__clear" aria-label="Clear" onClick={clear}>
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="cl-axis-picker__popover" role="listbox">
          <input
            ref={inputRef}
            className="cl-axis-picker__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder ?? `Search ${AXIS_LABELS[axis]}`}
          />
          {query.trim().length < 2 ? (
            <div className="cl-axis-picker__hint">Type at least two characters.</div>
          ) : null}
          {loading ? <div className="cl-axis-picker__hint">Searching…</div> : null}
          {error ? <div className="cl-axis-picker__error">{error}</div> : null}
          {results.map((result) => {
            const ref = olsResultToRef(result)
            return (
              <button
                key={result.iri}
                type="button"
                className="cl-axis-picker__row-btn"
                onClick={() => {
                  onChange(ref)
                  setOpen(false)
                  setQuery('')
                  setResults([])
                }}
              >
                <span className="cl-axis-picker__row-title">{ref.label || ref.id}</span>
                <span className="cl-axis-picker__row-meta">
                  {ref.kind === 'ontology' ? ref.namespace || result.ontology_prefix : 'ontology'} · {ref.id}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
