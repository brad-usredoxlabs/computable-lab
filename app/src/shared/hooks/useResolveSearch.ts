/**
 * useResolveSearch — React hook for searching via the backend resolve() spine.
 *
 * Replaces useOLSSearch: all ontology searches now route through POST /api/resolve
 * which implements a 5-tier resolution strategy (local records → OAK → OLS4 → vendor → mint).
 *
 * Features:
 * - Debounced search (default 300ms)
 * - Loading/error state
 * - Automatic abort on unmount or new search
 * - Server-side caching (no localStorage needed)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { apiClient, type ResolveCandidate } from '../api/client'

/**
 * Options for the useResolveSearch hook
 */
export interface UseResolveSearchOptions {
  /** Search query string */
  query: string
  /** Whether search is enabled (default: true) */
  enabled?: boolean
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number
  /** Minimum query length to trigger search (default: 2) */
  minQueryLength?: number
  /** Maximum results to fetch (default: 10) */
  maxResults?: number
  /** Skip remote tiers (OLS4, vendor) — local only */
  localOnly?: boolean
  /** Restrict to candidate kinds (e.g. ['material','labware']) */
  kinds?: string[]
  /** Material layer to bias toward */
  level?: ResolveCandidate['level']
}

/**
 * Return type for useResolveSearch
 */
export interface UseResolveSearchResult {
  /** Ranked candidates from the resolve spine */
  results: ResolveCandidate[]
  /** Loading state */
  loading: boolean
  /** Error if search failed */
  error: Error | null
  /** Manually trigger a search */
  refetch: () => Promise<void>
  /** Clear results */
  clear: () => void
}

/**
 * Hook for searching via the backend resolve() spine with debouncing.
 *
 * @example
 * const { results, loading, error } = useResolveSearch({
 *   query: searchTerm,
 *   enabled: searchTerm.length >= 2
 * })
 */
export function useResolveSearch(opts: UseResolveSearchOptions): UseResolveSearchResult {
  const {
    query,
    enabled = true,
    debounceMs = 300,
    minQueryLength = 2,
    maxResults = 10,
    localOnly = false,
    kinds,
    level,
  } = opts

  const [results, setResults] = useState<ResolveCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Abort controller for canceling pending requests
  const abortRef = useRef<AbortController | null>(null)
  // Timer ref for debouncing
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Perform the actual search
  const doSearch = useCallback(async () => {
    if (!enabled || query.length < minQueryLength) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    // Cancel any pending request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)

    try {
      const data = await apiClient.resolve({
        term: query,
        limit: maxResults,
        localOnly,
        kinds,
        level,
      })

      // Check if this request was aborted
      if (abortRef.current?.signal.aborted) {
        return
      }

      setResults(data.candidates ?? [])
      setError(null)
    } catch (e) {
      // Don't set error if aborted
      if (abortRef.current?.signal.aborted) {
        return
      }
      setError(e as Error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query, enabled, minQueryLength, maxResults, localOnly, kinds, level])

  // Debounced effect
  useEffect(() => {
    // Clear any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // If not enabled or query too short, clear results immediately
    if (!enabled || query.length < minQueryLength) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    // Show loading state while waiting for debounce
    setLoading(true)

    // Debounce the search
    timerRef.current = setTimeout(() => {
      doSearch()
    }, debounceMs)

    // Cleanup
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [query, enabled, minQueryLength, debounceMs, doSearch])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  // Manual refetch
  const refetch = useCallback(async () => {
    await doSearch()
  }, [doSearch])

  // Clear results
  const clear = useCallback(() => {
    setResults([])
    setError(null)
    setLoading(false)
  }, [])

  return {
    results,
    loading,
    error,
    refetch,
    clear,
  }
}
