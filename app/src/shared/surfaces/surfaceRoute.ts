/**
 * surfaceRoute — turn "where I am / where the AI wants to go" into a URL, using
 * the declarative registry as the ONLY source of surface identity and route
 * patterns. Pure and unit-tested; no fetch, no DOM.
 *
 * This is the deterministic-navigation hinge: an AI (or a stored session, or a
 * test) can utter a surface context — `{ surface, active: { objectType, objectId } }`
 * — and the registry, not a TypeScript switch, decides the route.
 */
import type { SurfaceSpec } from '../surfaces'

export interface SurfaceTarget {
  /** Registry surface id (controlled vocabulary — GET /api/surfaces). */
  surface: string
  /** The active object the surface is scoped to. */
  active: { objectType: string; objectId: string }
}

/**
 * Resolve `target` to a route, or null when the surface is not deep-linkable
 * (no `params`) or the context cannot fill every token.
 */
export function surfaceRoute(target: SurfaceTarget, registry: SurfaceSpec[]): string | null {
  const spec = registry.find((s) => s.id === target.surface)
  if (!spec?.params) return null
  const tokens = [...spec.path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]!)
  if (tokens.length === 0) return null
  let route = spec.path
  for (const token of tokens) {
    const wantedType = spec.params[token]
    if (!wantedType) return null
    if (wantedType !== target.active.objectType) return null
    if (!target.active.objectId) return null
    route = route.replace(`:${token}`, encodeURIComponent(target.active.objectId))
  }
  return route
}
