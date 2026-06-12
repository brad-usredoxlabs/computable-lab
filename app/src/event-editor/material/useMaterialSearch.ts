import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiClient,
  type FormulationSummary,
  type MaterialSearchItem,
  type ResolveCandidate,
} from '../../shared/api/client'

/**
 * Debounced material search combining local DB (records + formulations)
 * with on-demand ontology lookups. The two layers are kept separate so we
 * can render them as distinct sections in the modal:
 *
 *  • local → instant, the 80% case (something you've already saved)
 *  • ontology → button-triggered, surfaces things you haven't created
 *    locally yet (e.g., a ChEBI compound the user wants to add)
 *
 * The ontology layer goes through the same `/resolve` spine the AI prompt
 * route uses — so the suggestions are the on-box ontology snapshot (OAK)
 * plus remote OLS4, ranked identically and carrying definitions for the
 * hover card. This is what makes the picker's results match the AI route.
 */

const LOCAL_DEBOUNCE_MS = 200
// Ontology resolve reaches remote OLS4, so it's debounced a little longer than
// the local DB layer to avoid hammering it on every keystroke.
const ONTOLOGY_DEBOUNCE_MS = 350
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
  ontologyResults: ResolveCandidate[]
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
  const [ontologyResults, setOntologyResults] = useState<ResolveCandidate[]>([])
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [loadingOntology, setLoadingOntology] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track the latest query so an outdated network response doesn't
  // overwrite the results for a newer query.
  const latestQueryRef = useRef('')
  latestQueryRef.current = query

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

  const setQuery = useCallback((value: string) => setQueryRaw(value), [])

  const runOntologySearch = useCallback(async (trimmed: string) => {
    if (trimmed.length < 2) return
    setLoadingOntology(true)
    setError(null)
    try {
      const { candidates } = await apiClient.resolve({
        term: trimmed,
        surface: 'material-picker',
        kinds: ['material'],
        limit: SEARCH_LIMIT,
      })
      if (latestQueryRef.current.trim() !== trimmed) return
      // Keep the true ontology tiers (on-box OAK snapshot + remote OLS4) that
      // carry a CURIE. Local records are already in their own section, and the
      // tier-5 "mint" affordance is handled by "Create new material…".
      setOntologyResults(
        (candidates ?? []).filter(
          (c) => (c.source === 'oak' || c.source === 'ols4') && Boolean(c.curie),
        ),
      )
    } catch (err) {
      if (latestQueryRef.current.trim() !== trimmed) return
      setError(err instanceof Error ? err.message : 'Ontology search failed')
    } finally {
      if (latestQueryRef.current.trim() === trimmed) setLoadingOntology(false)
    }
  }, [])

  // Auto-fire the ontology resolve (debounced) alongside the local search, so a
  // single keystroke-driven search surfaces local terms AND ontology hits — the
  // user never has to click a second "search ontologies" button. Mirrors the AI
  // prompt's resolve() behavior.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setOntologyResults([])
      setLoadingOntology(false)
      return
    }
    const handle = window.setTimeout(() => { void runOntologySearch(trimmed) }, ONTOLOGY_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [query, runOntologySearch])

  // Retained for callers that want to force a re-search; the effect above means
  // it's rarely needed now.
  const searchOntology = useCallback(
    () => runOntologySearch(latestQueryRef.current.trim()),
    [runOntologySearch],
  )
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
