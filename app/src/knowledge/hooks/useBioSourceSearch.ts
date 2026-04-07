/**
 * useBioSourceSearch — Debounced search hook for bio-source proxy endpoints.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { searchBioSource } from '../../shared/api/biosourceClient'
import type { BioSourceId, BioSourceResult } from '../../types/biosource'

export interface UseBioSourceSearchOptions {
  source: BioSourceId
  query: string
  enabled?: boolean
  debounceMs?: number
  limit?: number
}

export interface UseBioSourceSearchReturn {
  results: BioSourceResult[]
  loading: boolean
  error: string | null
  total: number
}

export function useBioSourceSearch(opts: UseBioSourceSearchOptions): UseBioSourceSearchReturn {
  const {
    source,
    query,
    enabled = true,
    debounceMs = 400,
    limit = 10,
  } = opts

  const [results, setResults] = useState<BioSourceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  // Stale-response guard
  const latestRef = useRef({ source, query })
  latestRef.current = { source, query }

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (src: BioSourceId, q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setTotal(0)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const resp = await searchBioSource(src, q, limit)
      // Only apply if still the latest query
      if (latestRef.current.source === src && latestRef.current.query === q) {
        setResults(resp.results)
        setTotal(resp.total)
      }
    } catch (e) {
      if (latestRef.current.source === src && latestRef.current.query === q) {
        setError(e instanceof Error ? e.message : 'Search failed')
        setResults([])
        setTotal(0)
      }
    } finally {
      if (latestRef.current.source === src && latestRef.current.query === q) {
        setLoading(false)
      }
    }
  }, [limit])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!enabled || query.trim().length < 2) {
      setResults([])
      setTotal(0)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)

    timerRef.current = setTimeout(() => {
      doSearch(source, query)
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [source, query, enabled, debounceMs, doSearch])

  return { results, loading, error, total }
}
