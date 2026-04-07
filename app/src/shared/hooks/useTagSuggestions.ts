/**
 * useTagSuggestions — React hook for querying local tag/keyword suggestions.
 *
 * Debounced (200ms), abort-safe, follows useOLSSearch patterns.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { apiClient } from '../api/client'

export interface TagSuggestion {
  value: string
  count: number
  source: 'local'
}

export interface UseTagSuggestionsOptions {
  query: string
  field: 'keywords' | 'tags'
  enabled?: boolean
  debounceMs?: number
  limit?: number
}

export interface UseTagSuggestionsResult {
  suggestions: TagSuggestion[]
  loading: boolean
  error: Error | null
}

export function useTagSuggestions(opts: UseTagSuggestionsOptions): UseTagSuggestionsResult {
  const {
    query,
    field,
    enabled = true,
    debounceMs = 200,
    limit = 20,
  } = opts

  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async () => {
    if (!enabled || query.length < 1) {
      setSuggestions([])
      setLoading(false)
      setError(null)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)

    try {
      const data = await apiClient.suggestTags(query, field, limit)

      if (abortRef.current?.signal.aborted) return

      setSuggestions(
        data.suggestions.map((s) => ({ ...s, source: 'local' as const })),
      )
    } catch (e) {
      if (abortRef.current?.signal.aborted) return
      setError(e as Error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [query, field, enabled, limit])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!enabled || query.length < 1) {
      setSuggestions([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    timerRef.current = setTimeout(() => { doSearch() }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, field, enabled, debounceMs, doSearch])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { suggestions, loading, error }
}
