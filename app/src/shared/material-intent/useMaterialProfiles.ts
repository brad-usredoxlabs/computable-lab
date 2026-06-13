/**
 * useMaterialProfiles — load the backend material-profile registry once and
 * expose it to the shared "material intent" surface.
 *
 * The 6 v1 profiles (chemical, cell_line, media_composition,
 * single_active_formulation, sample, other) drive which builders and fields the
 * type picker shows, replacing the event-editor's hand-rolled `MaterialKind`
 * enum. Backed by `GET /materials/profiles` (apiClient.listMaterialProfiles).
 */

import { useEffect, useState } from 'react'
import { apiClient, type MaterialProfile } from '../api/client'

interface UseMaterialProfilesResult {
  profiles: MaterialProfile[]
  loading: boolean
  error: string | null
}

// Module-level cache: the registry is static for a session, so we fetch once
// and share across every surface instance.
let cache: MaterialProfile[] | null = null
let inflight: Promise<MaterialProfile[]> | null = null

function fetchProfiles(): Promise<MaterialProfile[]> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = apiClient
      .listMaterialProfiles()
      .then((res) => {
        cache = res.profiles
        return cache
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useMaterialProfiles(): UseMaterialProfilesResult {
  const [profiles, setProfiles] = useState<MaterialProfile[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cache) {
      setProfiles(cache)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchProfiles()
      .then((list) => {
        if (!cancelled) setProfiles(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { profiles, loading, error }
}

/** Test-only: reset the module cache between tests. */
export function __resetMaterialProfilesCache(): void {
  cache = null
  inflight = null
}
