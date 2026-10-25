/**
 * Surface registry client — loads the declarative work-surface registry from
 * the server once per app lifetime. The registry (GET /api/surfaces ← schema/
 * registry/surfaces/surfaces.yaml) is the single source of truth for surface
 * identity (repo rule: registry is data, never a TS literal union).
 */
import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import type { SurfaceSpec } from '../surfaces'

let cachedPromise: Promise<SurfaceSpec[]> | null = null

/** Module-level promise cache — one GET /api/surfaces per app load. */
export function loadSurfaceRegistry(): Promise<SurfaceSpec[]> {
  if (!cachedPromise) {
    cachedPromise = apiClient
      .getSurfaces()
      .then((res) => res.surfaces)
      .catch(() => {
        // Registry unavailable (server boot failure) → retryable empty cache.
        cachedPromise = null
        return [] as SurfaceSpec[]
      })
  }
  return cachedPromise
}

/** Returns null until the registry has loaded (render nothing/placeholder). */
export function useSurfaceRegistry(): SurfaceSpec[] | null {
  const [registry, setRegistry] = useState<SurfaceSpec[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadSurfaceRegistry().then((surfaces) => {
      if (!cancelled) setRegistry(surfaces)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return registry
}
