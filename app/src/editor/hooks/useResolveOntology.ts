/**
 * useResolveOntology — ontology search backed by the resolve() spine.
 *
 * Drop-in replacement for `useOLSSearch` inside the material picker: same
 * `{ results: OLSSearchResult[], loading, fromCache }` shape, but the results
 * come from `POST /resolve` (local OAK → remote OLS4, ranked) instead of OLS4
 * alone. This makes the picker agree with the slash menu, the agent, and the
 * compiler — one resolution path, one answer.
 *
 * On the appliance (OAK configured) the on-box ontology hits dominate; bare CL
 * falls back to OLS4. Record (tier 1) and mint (tier 5) candidates are excluded
 * here — the picker surfaces local records and the "+ Create Local" affordance
 * through its own paths.
 */

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '../../shared/api/client'
import { rankByLabelMatch } from '../../shared/search/rankByLabelMatch'
import type { OLSSearchResult } from '../../shared/api/olsClient'

export interface UseResolveOntologyOptions {
  query: string
  enabled?: boolean
  debounceMs?: number
  minQueryLength?: number
  maxResults?: number
}

export interface UseResolveOntologyResult {
  results: OLSSearchResult[]
  loading: boolean
  fromCache: boolean
}

export function useResolveOntology(opts: UseResolveOntologyOptions): UseResolveOntologyResult {
  const { query, enabled = true, debounceMs = 300, minQueryLength = 2, maxResults = 10 } = opts

  const [results, setResults] = useState<OLSSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const latestQueryRef = useRef(query)
  latestQueryRef.current = query
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!enabled || query.trim().length < minQueryLength) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    timerRef.current = setTimeout(async () => {
      const q = query.trim()
      try {
        // Fetch a wider window than we return so the exact/shortest term isn't
        // buried below the spine's cutoff by longer derivatives; then re-rank
        // (exact → prefix → substring → other, shortest first) and return the
        // caller's requested count with the closest match on top.
        const fetchLimit = Math.max(maxResults, 40)
        const { candidates } = await apiClient.resolve({ term: q, kinds: ['material'], limit: fetchLimit })
        if (latestQueryRef.current !== query) return
        const mapped: OLSSearchResult[] = candidates
          .filter((c) => (c.source === 'oak' || c.source === 'ols4') && c.curie)
          .map((c) => ({
            obo_id: c.curie,
            label: c.label,
            iri: c.uri ?? '',
            ontology_name: c.namespace.toLowerCase(),
          }))
        setResults(rankByLabelMatch(mapped, (r) => r.label, q).slice(0, maxResults))
      } catch {
        if (latestQueryRef.current === query) setResults([])
      } finally {
        if (latestQueryRef.current === query) setLoading(false)
      }
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, enabled, debounceMs, minQueryLength, maxResults])

  return { results, loading, fromCache: false }
}
