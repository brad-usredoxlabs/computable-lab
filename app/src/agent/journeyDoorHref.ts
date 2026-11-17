/**
 * journeyDoorHref — the ONE place the chat card turns a DECLARED journey door
 * into a URL.
 *
 * L2-NOUN-CREATION-JOURNEY-1 (unit u1journey). Nothing here decides a fact:
 *   - the door's identity, surface and the journey's checkpoint come from the
 *     server's projection of config/journey/declarations/noun-create.yaml;
 *   - the ROUTE comes from the ONE route authority,
 *     app/src/shared/surfaces/surfaceRoute.ts (`declaredSurfaceRoute`), over the
 *     declarative surface registry (schema/registry/surfaces/surfaces.yaml via
 *     GET /api/surfaces);
 *   - the created record type that fills a surface's `:token` comes from the
 *     journey declaration (`human_task.output_port.record_type`, projected as
 *     `createdType`) — never from a constant in this file.
 *
 * Fail CLOSED: when the registry cannot answer the surface, or the declaration
 * names no created type for a surface whose path carries a token, this function
 * returns null and the card renders a dead door (no href) instead of a route
 * that would land on the wrong page. There is no TypeScript fallback route.
 *
 * The query string carries:
 *   prefillName  the person's own noun (a CANDIDATE — the landing surface shows
 *                it; nothing is minted here)
 *   surface      the DECLARED surface id (`ingestion` / `record-create`)
 *   door         the DECLARED alternative_id the person picked
 *   journey      the DECLARED journey id
 *   checkpoint   the DECLARED return checkpoint_ref (the origin prompt resumes
 *                there once a creation is committed)
 * so a RELOAD of the URL still shows the candidate and the journey identity:
 * there is no in-memory hand-off.
 */
import { useEffect, useState } from 'react'
import type { SurfaceSpec } from '../shared/surfaces'
import { loadSurfaceRegistry } from '../shared/surfaces/registry'
import { declaredSurfaceRoute } from '../shared/surfaces/surfaceRoute'

export interface JourneyDoorLink {
  id: string
  surface: string
  candidateLabel: string
}

export interface JourneyDoorContext {
  journeyId: string
  checkpointRef: string
  /**
   * The DECLARED record type the journey's completion creates
   * (`human_task.output_port.record_type`). Absent when the declaration names
   * none — a door bound to a `:token` surface then has no route.
   */
  createdType?: string
}

/**
 * The URL for a declared door, or null when no truthful route exists (the
 * registry has not answered, does not declare the surface, or the declaration
 * names no created type for a token surface). Callers render a dead door for
 * null — never a guessed destination.
 */
export function journeyDoorHref(
  door: JourneyDoorLink,
  journey: JourneyDoorContext,
  registry?: readonly SurfaceSpec[],
): string | null {
  if (registry === undefined) return null
  const route = declaredSurfaceRoute(
    journey.createdType === undefined
      ? { surface: door.surface }
      : { surface: door.surface, createdType: journey.createdType },
    registry,
  )
  if (route === null) return null
  const params = new URLSearchParams({
    prefillName: door.candidateLabel,
    surface: door.surface,
    door: door.id,
    journey: journey.journeyId,
    checkpoint: journey.checkpointRef,
  })
  return `${route}?${params.toString()}`
}

/**
 * The surface registry for a door list — loaded ONLY when the host renders a
 * journey door (`enabled`). A host with no declared journey never asks the
 * server for a registry it cannot use (and a test double without the surfaces
 * route is never exercised). Undefined until loaded: the href builder then has
 * no route, so the door is DEAD until the registry answers — a visible dead
 * door beats a silently wrong route.
 */
export function useJourneyDoorSurfaces(enabled: boolean): readonly SurfaceSpec[] | undefined {
  const [registry, setRegistry] = useState<SurfaceSpec[] | undefined>(undefined)
  useEffect(() => {
    if (!enabled || registry !== undefined) return
    let cancelled = false
    // Promise-wrapped so a client without the surfaces method degrades to a
    // dead door instead of throwing during the effect.
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
