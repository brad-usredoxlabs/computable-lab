/**
 * useOLSSearch - React hook for searching OLS with debouncing and caching.
 * 
 * Features:
 * - Debounced search (default 300ms)
 * - Local cache layer
 * - Loading/error state
 * - Automatic abort on unmount or new search
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { searchOLS, type OLSSearchResult, type OLSSearchOptions } from '../api/olsClient'
import {
  getCachedOLSResults,
  setCachedOLSResults,
  makeCacheKey,
  cacheLabelsFromResults,
} from '../api/olsCache'

/**
 * Options for the useOLSSearch hook
 */
export interface UseOLSSearchOptions {
  /** Search query string */
  query: string
  /** Ontology names to search (e.g., ['cl', 'chebi']) */
  ontologies?: string[]
  /** Whether search is enabled (default: true) */
  enabled?: boolean
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number
  /** Minimum query length to trigger search (default: 2) */
  minQueryLength?: number
  /** Maximum results to fetch (default: 10) */
  maxResults?: number
  /** Additional OLS search options */
  searchOptions?: Partial<OLSSearchOptions>
}

/**
 * Return type for useOLSSearch
 */
export interface UseOLSSearchResult {
  /** Search results */
  results: OLSSearchResult[]
  /** Loading state */
  loading: boolean
  /** Error if search failed */
  error: Error | null
  /** Whether results came from cache */
  fromCache: boolean
  /** Manually trigger a search */
  refetch: () => Promise<void>
  /** Clear results */
  clear: () => void
}

/**
 * Hook for searching OLS with debouncing and caching.
 * 
 * @example
 * const { results, loading, error } = useOLSSearch({
 *   query: searchTerm,
 *   ontologies: ['cl', 'chebi'],
 *   enabled: searchTerm.length >= 2
 * })
 */
export function useOLSSearch(opts: UseOLSSearchOptions): UseOLSSearchResult {
  const {
    query,
    ontologies = [],
    enabled = true,
    debounceMs = 300,
    minQueryLength = 2,
    maxResults = 10,
    searchOptions,
  } = opts

  const [results, setResults] = useState<OLSSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fromCache, setFromCache] = useState(false)

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
      setFromCache(false)
      return
    }

    // Check cache first
    const cacheKey = makeCacheKey(query, ontologies)
    const cached = getCachedOLSResults(cacheKey)
    if (cached) {
      setResults(cached)
      setFromCache(true)
      setLoading(false)
      setError(null)
      return
    }

    // Cancel any pending request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)
    setFromCache(false)

    try {
      const data = await searchOLS({
        query,
        ontologies,
        rows: maxResults,
        ...searchOptions,
      })

      // Check if this request was aborted
      if (abortRef.current?.signal.aborted) {
        return
      }

      // Cache the results
      setCachedOLSResults(cacheKey, data)
      cacheLabelsFromResults(data)

      setResults(data)
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
  }, [query, ontologies, enabled, minQueryLength, maxResults, searchOptions])

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
      setFromCache(false)
      return
    }

    // Check cache synchronously
    const cacheKey = makeCacheKey(query, ontologies)
    const cached = getCachedOLSResults(cacheKey)
    if (cached) {
      setResults(cached)
      setFromCache(true)
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
  }, [query, ontologies, enabled, minQueryLength, debounceMs, doSearch])

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
    // Clear cache entry and search again
    const cacheKey = makeCacheKey(query, ontologies)
    try {
      localStorage.removeItem(`ols_cache_${cacheKey}`)
    } catch {
      // Ignore storage errors
    }
    await doSearch()
  }, [query, ontologies, doSearch])

  // Clear results
  const clear = useCallback(() => {
    setResults([])
    setError(null)
    setFromCache(false)
    setLoading(false)
  }, [])

  return {
    results,
    loading,
    error,
    fromCache,
    refetch,
    clear,
  }
}

/**
 * Hook for searching a single ontology.
 * Convenience wrapper around useOLSSearch.
 */
export function useOntologySearch(
  query: string,
  ontology: string,
  opts?: Partial<UseOLSSearchOptions>
): UseOLSSearchResult {
  return useOLSSearch({
    query,
    ontologies: [ontology],
    ...opts,
  })
}
