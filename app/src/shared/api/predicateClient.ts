/**
 * Client for `GET /predicates` — fetches the curated relationship-predicate
 * registry once per session and caches it in memory. Used by the new-group
 * wizard's mechanism step to populate the predicate picker.
 */

import { API_BASE } from './base'

export interface PredicateEntry {
  id: string
  label: string
  namespace: string
  family: string
  subject_kinds: string[]
  object_kinds: string[]
  description?: string
}

export interface PredicateFamily {
  name: string
  description: string
}

export interface PredicatesResponse {
  registryVersion: number
  families: PredicateFamily[]
  predicates: PredicateEntry[]
}

let cache: Promise<PredicatesResponse> | null = null

export function loadPredicates(): Promise<PredicatesResponse> {
  if (!cache) {
    cache = fetch(`${API_BASE}/predicates`)
      .then(async (res) => {
        if (!res.ok) {
          const detail = (await res.json().catch(() => null)) as { message?: string } | null
          throw new Error(detail?.message ?? `Failed to load predicates: ${res.status}`)
        }
        return (await res.json()) as PredicatesResponse
      })
      .catch((err) => {
        cache = null
        throw err
      })
  }
  return cache
}

/** Test-only: discard the cached predicate registry so the next call refetches. */
export function _resetPredicateCache(): void {
  cache = null
}
