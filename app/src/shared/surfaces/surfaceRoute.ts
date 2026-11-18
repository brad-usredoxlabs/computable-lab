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
 * A surface a DECLARED journey door navigates to in CREATE mode: the person is
 * not going to an existing object, they are going to a surface that will author
 * the journey's declared output. `createdType` is the journey declaration's
 * `human_task.output_port.record_type` — the ONLY fill for a `:token`; there is
 * no TypeScript default.
 */
export interface DeclaredSurfaceTarget {
  /** Registry surface id declared by the door (`ingestion`, `record-create`, ...). */
  surface: string
  /**
   * The DECLARED created record type. Absent when the declaration names none —
   * a surface whose path carries a `:token` then has no route (fail closed).
   */
  createdType?: string
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

/**
 * Resolve a DECLARED CREATE surface (a journey door's destination) to a route,
 * or null when the registry cannot answer (unknown surface, an undeclared
 * `:token`, or a token with no declared created type).
 *
 * Same authority and same registry as `surfaceRoute`; the one difference is
 * what fills a token. An object route carries an EXISTING object (`active`),
 * and its `params` binding is a type check (`nodeType: record` means the token
 * holds a record of the active object's type). A CREATE route has no existing
 * object: its token holds the record type the journey's completion will create,
 * declared as `human_task.output_port.record_type`. So this helper requires the
 * registry to declare the slot (`params[token]`) and the DECLARATION to name
 * the type, and refuses everything else:
 *   - no declared `params` for a token  -> null (the registry says no slot)
 *   - no declared created type          -> null (never a TS default)
 *   - more than one token               -> null (one completion, one record;
 *                                          a multi-slot create route is not
 *                                          decidable from the declaration)
 *
 * A surface whose path has NO token is its own route (nothing to fill): the
 * door still lands there, carrying the candidate in the query string.
 */
export function declaredSurfaceRoute(target: DeclaredSurfaceTarget, registry: readonly SurfaceSpec[]): string | null {
  const spec = registry.find((s) => s.id === target.surface)
  if (spec === undefined) return null
  const tokens = [...spec.path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]!)
  if (tokens.length === 0) return spec.path
  if (tokens.length > 1) return null
  const createdType = target.createdType
  if (createdType === undefined || createdType.length === 0) return null
  let route = spec.path
  for (const token of tokens) {
    if (!spec.params?.[token]) return null
    route = route.replace(`:${token}`, encodeURIComponent(createdType))
  }
  return route
}
