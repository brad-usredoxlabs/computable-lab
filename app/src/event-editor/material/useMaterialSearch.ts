import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient, type FormulationSummary, type MaterialSearchItem } from '../../shared/api/client'
import { searchOLS, type OLSSearchResult } from '../../shared/api/olsClient'
import { useOntologyConfig } from './useOntologyConfig'

/**
 * Debounced material search combining local DB (records + formulations)
 * with on-demand ontology lookups (OLS across all configured
 * ontologies). The two layers are kept separate so we can render them
 * as distinct sections in the modal:
 *
 *  • local → instant, the 80% case (something you've already saved)
 *  • ontology → button-triggered, surfaces things you haven't created
 *    locally yet (e.g., a ChEBI compound the user wants to add)
 *
 * The default ontology list is pulled from `MATERIAL_OLS_ONTOLOGIES`
 * (`app/src/types/material.ts`) so all material UIs share one source
 * of truth. Phase 6 will move this behind a per-project setting.
 */

const LOCAL_DEBOUNCE_MS = 200
const SEARCH_LIMIT = 12

export interface UseMaterialSearchResult {
  /** Current input value the modal binds to. */
  query: string
  setQuery: (value: string) => void
  /** Local DB hits (saved materials, vendor reagents, prepared instances). */
  localResults: MaterialSearchItem[]
  /** Saved formulations matching the query. */
  formulations: FormulationSummary[]
  /** Ontology hits — empty until `searchOntology()` is called. */
  ontologyResults: OLSSearchResult[]
  /** True while local fetches are in-flight. */
  loadingLocal: boolean
  /** True while ontology fetch is in-flight. */
  loadingOntology: boolean
  /** Latest error message from either layer, if any. */
  error: string | null
  /** Explicitly fire an ontology lookup with the current query. */
  searchOntology: () => Promise<void>
  /** Clear ontology results (e.g. when the query changes). */
  clearOntology: () => void
}

export function useMaterialSearch(): UseMaterialSearchResult {
  const [query, setQueryRaw] = useState('')
  const [localResults, setLocalResults] = useState<MaterialSearchItem[]>([])
  const [formulations, setFormulations] = useState<FormulationSummary[]>([])
  const [ontologyResults, setOntologyResults] = useState<OLSSearchResult[]>([])
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [loadingOntology, setLoadingOntology] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track the latest query so an outdated network response doesn't
  // overwrite the results for a newer query.
  const latestQueryRef = useRef('')
  latestQueryRef.current = query

  const { ontologies } = useOntologyConfig()

  // Debounced local search. Fires on every query change but only
  // commits results if the query hasn't been superseded.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setLocalResults([])
      setFormulations([])
      setLoadingLocal(false)
      return
    }
    setLoadingLocal(true)
    setError(null)
    const handle = window.setTimeout(async () => {
      try {
        const [materialResponse, formulationsResponse] = await Promise.all([
          apiClient.searchMaterials({ q: trimmed, limit: SEARCH_LIMIT }),
          apiClient.getFormulationsSummary({ q: trimmed, limit: SEARCH_LIMIT }),
        ])
        if (latestQueryRef.current !== query) return
        setLocalResults(materialResponse.items ?? [])
        setFormulations(formulationsResponse ?? [])
      } catch (err) {
        if (latestQueryRef.current !== query) return
        setError(err instanceof Error ? err.message : 'Material search failed')
      } finally {
        if (latestQueryRef.current === query) setLoadingLocal(false)
      }
    }, LOCAL_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [query])

  const setQuery = useCallback((value: string) => {
    setQueryRaw(value)
    // Clearing ontology results on every keystroke keeps the search
    // section honest: ontology hits are stamped to the query they were
    // requested for, not the current input.
    setOntologyResults([])
  }, [])

  const searchOntology = useCallback(async () => {
    const trimmed = latestQueryRef.current.trim()
    if (trimmed.length < 2) return
    setLoadingOntology(true)
    setError(null)
    try {
      const results = await searchOLS({
        query: trimmed,
        ontologies,
        rows: SEARCH_LIMIT,
      })
      if (latestQueryRef.current.trim() !== trimmed) return
      setOntologyResults(results ?? [])
    } catch (err) {
      if (latestQueryRef.current.trim() !== trimmed) return
      setError(err instanceof Error ? err.message : 'Ontology search failed')
    } finally {
      if (latestQueryRef.current.trim() === trimmed) setLoadingOntology(false)
    }
  }, [ontologies])

  const clearOntology = useCallback(() => setOntologyResults([]), [])

  return {
    query,
    setQuery,
    localResults,
    formulations,
    ontologyResults,
    loadingLocal,
    loadingOntology,
    error,
    searchOntology,
    clearOntology,
  }
}
