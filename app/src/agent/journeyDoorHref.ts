/**
 * journeyDoorHref — the ONE place the chat card turns a DECLARED journey door
 * into a URL.
 *
 * L2-NOUN-CREATION-JOURNEY-1 (unit u1journey). The door's identity, surface
 * and the journey's checkpoint come from the server's projection of
 * config/journey/declarations/noun-create.yaml (never from this file). The
 * ROUTE each declared surface lands on comes from the declarative surface
 * registry (schema/registry/surfaces/surfaces.yaml via GET /api/surfaces) —
 * the registry is the authority for surface paths, never a TS literal. This
 * module only fills the registry's `:token` placeholders and carries:
 *
 *   prefillName  the person's own noun (a CANDIDATE — the target surface seeds
 *                its search/name field from it; nothing is minted here)
 *   surface      the DECLARED surface id (`ingestion` / `record-create`)
 *   door         the DECLARED alternative_id the person picked
 *   journey      the DECLARED journey id
 *   checkpoint   the DECLARED return checkpoint_ref (the origin prompt resumes
 *                there once a creation is committed)
 *   nodeType     `material` — the noun this journey creates, so a generic
 *                `:token` surface can fill its placeholder
 *
 * Every value rides the query string, so a RELOAD of the URL still shows the
 * candidate and the journey identity: there is no in-memory hand-off.
 */
import { useEffect, useState } from 'react'
import type { SurfaceSpec } from '../shared/surfaces'
import { loadSurfaceRegistry } from '../shared/surfaces/registry'

export interface JourneyDoorLink {
  id: string
  surface: string
  candidateLabel: string
}

export interface JourneyDoorContext {
  journeyId: string
  checkpointRef: string
}

/**
 * FALLBACK route when the surface registry has not loaded (or does not declare
 * the door's surface). It is NOT the authority: `/lab/materials/new` is the
 * historical material-create page, kept so an offline/unavailable registry
 * still navigates somewhere truthful. With the registry present the door
 * lands on its DECLARED surface path.
 */
export const DECLARED_SURFACE_ROUTE = '/lab/materials/new'

/** The object type the noun-create journey creates — fills a surface's `:token`. */
const JOURNEY_NODE_TYPE = 'material'

/**
 * Route for a declared surface: the registry spec's `path` with every
 * `:token` filled (the journey only holds one context value, the material
 * node type). Undeclared surface -> the documented fallback.
 */
function surfaceRouteFor(surface: string, registry: readonly SurfaceSpec[] | undefined): string {
  const spec = registry?.find((candidate) => candidate.id === surface)
  if (spec === undefined) return DECLARED_SURFACE_ROUTE
  const tokens = [...spec.path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1]!)
  let route = spec.path
  for (const token of tokens) {
    route = route.replace(`:${token}`, encodeURIComponent(JOURNEY_NODE_TYPE))
  }
  return route
}

export function journeyDoorHref(
  door: JourneyDoorLink,
  journey: JourneyDoorContext,
  registry?: readonly SurfaceSpec[],
): string {
  const params = new URLSearchParams({
    prefillName: door.candidateLabel,
    surface: door.surface,
    door: door.id,
    journey: journey.journeyId,
    checkpoint: journey.checkpointRef,
  })
  const spec = registry?.find((candidate) => candidate.id === door.surface)
  if (spec !== undefined) params.set('nodeType', JOURNEY_NODE_TYPE)
  return `${surfaceRouteFor(door.surface, registry)}?${params.toString()}`
}

/**
 * The surface registry for a door list — loaded ONLY when the host renders a
 * journey door (`enabled`). A host with no declared journey never asks the
 * server for a registry it cannot use (and a test double without the surfaces
 * route is never exercised). Undefined until loaded: the href builder then
 * uses DECLARED_SURFACE_ROUTE.
 */
export function useJourneyDoorSurfaces(enabled: boolean): readonly SurfaceSpec[] | undefined {
  const [registry, setRegistry] = useState<SurfaceSpec[] | undefined>(undefined)
  useEffect(() => {
    if (!enabled || registry !== undefined) return
    let cancelled = false
    // Promise-wrapped so a client without the surfaces method degrades to the
    // fallback route instead of throwing during the effect.
    void Promise.resolve()
      .then(() => loadSurfaceRegistry())
      .then((surfaces) => {
        if (!cancelled) setRegistry(surfaces)
      })
      .catch(() => {
        if (!cancelled) setRegistry([])
      })
    return () => {
      cancelled = true
    }
  }, [enabled, registry])
  return registry
}

/** The button text for a declared door: its own id, spaced (data, not copy). */
export function journeyDoorLabel(doorId: string): string {
  const spaced = doorId.replace(/[-_]+/g, ' ').trim()
  return spaced.length === 0 ? doorId : `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`
}
