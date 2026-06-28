/**
 * useMaterialSearch — Combined local record + OLS ontology search hook.
 *
 * Runs both searches in parallel and guards against stale responses.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient, type MaterialSearchItem, type ResolveCandidate } from '../../shared/api/client'
import { useResolveOntology } from './useResolveOntology'
import { formatConcentration } from '../../types/material'

export interface UseMaterialSearchResult {
  localResults: MaterialSearchItem[]
  olsResults: ResolveCandidate[]
  localLoading: boolean
  olsLoading: boolean
  loading: boolean
  error: string | null
  olsFromCache: boolean
}

export interface UseMaterialSearchOptions {
  query: string
  enabled?: boolean
  debounceMs?: number
  minQueryLength?: number
  maxResults?: number
  localKinds?: string[]
}

export function useMaterialSearch(opts: UseMaterialSearchOptions): UseMaterialSearchResult {
  const {
    query,
    enabled = true,
    debounceMs = 300,
    minQueryLength = 2,
    maxResults = 10,
    localKinds = ['material'],
  } = opts

  const [localResults, setLocalResults] = useState<MaterialSearchItem[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stale-response guard
  const latestQueryRef = useRef(query)
  latestQueryRef.current = query

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ontology search via the resolve() spine (local OAK → remote OLS4, ranked).
  // Replaces the OLS4-only path so the picker agrees with the slash menu,
  // the agent, and the compiler — one resolution path.
  const {
    results: olsResults,
    loading: olsLoading,
    fromCache: olsFromCache,
  } = useResolveOntology({
    query,
    enabled: enabled && query.length >= minQueryLength,
    debounceMs,
    minQueryLength,
    // The picker dropdown scrolls, so show a wider ranked list than the default;
    // useResolveOntology re-ranks (exact/shortest first) and returns this many.
    maxResults: Math.max(maxResults, 40),
  })

  // Local record search (debounced)
  const doLocalSearch = useCallback(async (q: string) => {
    if (q.length < minQueryLength) {
      setLocalResults([])
      setLocalLoading(false)
      return
    }

    setLocalLoading(true)
    setError(null)

    try {
      const settled = await Promise.allSettled([
        apiClient.searchMaterials({ q, limit: maxResults * 4 }),
        apiClient.getFormulationsSummary({ q, limit: maxResults * 2 }),
      ])
      const materialResp = settled[0].status === 'fulfilled' ? settled[0].value : { items: [] }
      const formulationResp = settled[1].status === 'fulfilled' ? settled[1].value : []
      const formulationItems: MaterialSearchItem[] = formulationResp.map((summary) => ({
        recordId: summary.outputSpec.id,
        kind: 'material-spec',
        title: summary.outputSpec.name,
        category: 'saved-stock',
        subtitle: [
          formatConcentration(summary.outputSpec.concentration),
          summary.outputSpec.solventLabel ? `in ${summary.outputSpec.solventLabel}` : null,
        ].filter(Boolean).join(' ') || 'Saved stock or formulation',
      }))
      const merged = [...formulationItems, ...materialResp.items]
      const deduped = merged.filter((item, index) => merged.findIndex((candidate) => candidate.recordId === item.recordId) === index)
      const filtered = deduped.filter((record) => {
        const kind = record.kind || ''
        return localKinds.length === 0 || localKinds.includes(kind)
      }).slice(0, maxResults)
      // Only apply results if this is still the latest query
      if (latestQueryRef.current === q) {
        setLocalResults(filtered)
        if (settled.every((entry) => entry.status === 'rejected')) {
          const firstError = settled.find((entry) => entry.status === 'rejected')
          setError(firstError?.reason instanceof Error ? firstError.reason.message : 'Search failed')
        }
      }
    } catch (e) {
      if (latestQueryRef.current === q) {
        setError(e instanceof Error ? e.message : 'Search failed')
        setLocalResults([])
      }
    } finally {
      if (latestQueryRef.current === q) {
        setLocalLoading(false)
      }
    }
  }, [localKinds, minQueryLength, maxResults])

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    if (!enabled || query.length < minQueryLength) {
      setLocalResults([])
      setLocalLoading(false)
      setError(null)
      return
    }

    setLocalLoading(true)

    timerRef.current = setTimeout(() => {
      doLocalSearch(query)
    }, debounceMs)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [query, enabled, minQueryLength, debounceMs, doLocalSearch])

  return {
    localResults,
    olsResults,
    localLoading,
    olsLoading,
    loading: localLoading || olsLoading,
    error,
    olsFromCache,
  }
}
