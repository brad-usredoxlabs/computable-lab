/**
 * journeyDoorHref — the ONE place the chat card turns a DECLARED journey door
 * into a URL.
 *
 * L2-NOUN-CREATION-JOURNEY-1 (unit u1journey). The door's identity, surface
 * and the journey's checkpoint come from the server's projection of
 * config/journey/declarations/noun-create.yaml (never from this file). The
 * card only chooses the ROUTE each declared surface lands on and carries:
 *
 *   prefillName  the person's own noun (a CANDIDATE — the target surface seeds
 *                its search/name field from it; nothing is minted here)
 *   surface      the DECLARED surface id (`ingestion` / `record-create`)
 *   door         the DECLARED alternative_id the person picked
 *   journey      the DECLARED journey id
 *   checkpoint   the DECLARED return checkpoint_ref (the origin prompt resumes
 *                there once a creation is committed)
 *
 * Every value rides the query string, so a RELOAD of the URL still shows the
 * candidate and the journey identity: there is no in-memory hand-off.
 */

export interface JourneyDoorLink {
  id: string;
  surface: string;
  candidateLabel: string;
}

export interface JourneyDoorContext {
  journeyId: string;
  checkpointRef: string;
}

/**
 * The create surface a declared door lands on. ONE material-create page exists
 * today (`/lab/materials/new`, App.tsx): every declared surface ("ingestion",
 * "record-create") lands there and the surface id rides the query so the page
 * and the resume leg can tell the declared paths apart.
 */
export const DECLARED_SURFACE_ROUTE = '/lab/materials/new'

export function journeyDoorHref(door: JourneyDoorLink, journey: JourneyDoorContext): string {
  const params = new URLSearchParams({
    prefillName: door.candidateLabel,
    surface: door.surface,
    door: door.id,
    journey: journey.journeyId,
    checkpoint: journey.checkpointRef,
  })
  return `${DECLARED_SURFACE_ROUTE}?${params.toString()}`
}

/** The button text for a declared door: its own id, spaced (data, not copy). */
export function journeyDoorLabel(doorId: string): string {
  const spaced = doorId.replace(/[-_]+/g, ' ').trim()
  return spaced.length === 0 ? doorId : `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`
}
