import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient, type VendorExaCategory, type VendorExaHit } from '../api/client'

/**
 * useVendorExaSearch — debounced Exa web search for vendor products, shared by
 * the event-editor Add-material / Add-labware flows and any rich surface that
 * wants to discover vendor products off the web.
 *
 * Mirrors the shape of `event-editor/material/useMaterialSearch.ts` (debounce +
 * stale-response guard) so callers render results the same way. Results arrive
 * as `VendorExaHit`s carrying the provenance the server needs to mint a local
 * record via `createFromVendorExa`.
 */

const DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 2
const DEFAULT_LIMIT = 8

export interface UseVendorExaSearchResult {
  /** Current input value the caller binds to. */
  query: string
  setQuery: (value: string) => void
  /** Exa vendor-product hits — empty until a search completes. */
  exaResults: VendorExaHit[]
  /** True while a fetch is in-flight. */
  loading: boolean
  /** Latest error message, if any. */
  error: string | null
  /** Whether Exa is configured (server returned `configured: false` / 503). */
  configured: boolean
}

export function useVendorExaSearch(category?: VendorExaCategory): UseVendorExaSearchResult {
  const [query, setQueryRaw] = useState('')
  const [exaResults, setExaResults] = useState<VendorExaHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState(true)

  // Track the latest query so an outdated network response doesn't overwrite
  // the results for a newer query.
  const latestQueryRef = useRef('')
  latestQueryRef.current = query

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setExaResults([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const handle = window.setTimeout(async () => {
      try {
        const response = await apiClient.searchVendorExa({
          q: trimmed,
          ...(category ? { category } : {}),
          limit: DEFAULT_LIMIT,
        })
        if (latestQueryRef.current !== query) return
        setConfigured(response.configured)
        setExaResults(response.items ?? [])
      } catch (err) {
        if (latestQueryRef.current !== query) return
        setConfigured(false)
        setError(err instanceof Error ? err.message : 'Vendor Exa search failed')
      } finally {
        if (latestQueryRef.current === query) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
    // `category` is a stable per-mount scope — intentionally NOT in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const setQuery = useCallback((value: string) => setQueryRaw(value), [])

  return { query, setQuery, exaResults, loading, error, configured }
}