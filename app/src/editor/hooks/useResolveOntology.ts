/**
 * useResolveOntology — ontology search backed by the resolve() spine.
 *
 * Drop-in replacement for `useOLSSearch` inside the material picker: same
 * `{ results: ResolveCandidate[], loading, fromCache }` shape, but the results
 * come from `POST /resolve` (local OAK → remote OLS4, ranked) instead of OLS4
 * alone. This makes the picker agree with the slash menu, the agent, and the
 * compiler — one resolution path, one answer.
 *
 * On the appliance (OAK configured) the on-box ontology hits dominate; bare CL
 * falls back to OLS4. Tier-1 local records and tier-4 vendor hits are preserved
 * when the backend returns CURIE-like ids so TapTab comboboxes do not silently
 * lose local-first results. Tier-5 mint remains the caller's explicit create row.
 */

import { useState, useEffect, useRef } from 'react'
import { apiClient, type ResolveCandidate } from '../../shared/api/client'
import { rankByLabelMatch } from '../../shared/search/rankByLabelMatch'

export interface UseResolveOntologyOptions {
  query: string
  enabled?: boolean
  debounceMs?: number
  minQueryLength?: number
  maxResults?: number
}

export interface UseResolveOntologyResult {
  results: ResolveCandidate[]
  loading: boolean
  fromCache: boolean
}

export function useResolveOntology(opts: UseResolveOntologyOptions): UseResolveOntologyResult {
  const { query, enabled = true, debounceMs = 300, minQueryLength = 2, maxResults = 10 } = opts

  const [results, setResults] = useState<ResolveCandidate[]>([])
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
        // Keep true ontology tiers (OAK + OLS4) that carry a CURIE. Re-rank
        // so the exact/shortest match leads (exact → prefix → substring → other, shortest first).
        const filtered = (candidates ?? []).filter(
          (c) => (c.source === 'oak' || c.source === 'ols4') && Boolean(c.curie),
        )
        setResults(rankByLabelMatch(filtered, (c) => c.label, q).slice(0, maxResults))
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
