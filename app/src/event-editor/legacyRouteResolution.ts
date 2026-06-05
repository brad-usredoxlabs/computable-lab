/**
 * Resolve the parent study for legacy /event-editor routes — Phase 10
 * cutover. Given an event-graph id or a run id, walk the link chain to
 * find the study the workspace should land on.
 *
 *   event-graph → links.studyId   (preferred)
 *   event-graph → links.runId / payload.runId → run.studyId
 *   run         → run.studyId
 *
 * When any step fails (missing record, unresolved links), fall through to
 * the `STU-scratch` study so the redirect can't dead-end. The scratch
 * study is real — see records/studies/STU-scratch__scratch.yaml — so the
 * workspace shell renders the same way it does for any study.
 */

import { apiClient } from '../shared/api/client'

export const SCRATCH_STUDY_ID = 'STU-scratch'

export interface ResolvedLegacyRoute {
  studyId: string
  /** Pre-filled tab for the workspace to open. `null` for the no-params
   *  legacy entrypoint — the workspace lands on whatever the user had
   *  last (the per-study workspace.yaml restore). */
  openTab:
    | null
    | {
        kind: 'deck'
        id: string
        eventGraphId: string
        title: string
      }
}

interface MinimalGraphPayload {
  recordId?: string
  name?: string
  runId?: string
  links?: { studyId?: string; experimentId?: string; runId?: string }
}

interface MinimalRunPayload {
  recordId?: string
  studyId?: string
  experimentId?: string
}

/**
 * Top-level entry for the /event-editor/:eventGraphId route. Falls
 * through to scratch when anything is missing or fails.
 */
export async function resolveLegacyEventGraphRoute(
  eventGraphId: string,
): Promise<ResolvedLegacyRoute> {
  const fallback: ResolvedLegacyRoute = {
    studyId: SCRATCH_STUDY_ID,
    openTab: {
      kind: 'deck',
      id: `tab-deck-${eventGraphId}`,
      eventGraphId,
      title: eventGraphId,
    },
  }
  try {
    const env = await apiClient.getRecord(eventGraphId)
    const payload = (env.payload ?? {}) as MinimalGraphPayload
    const directStudy = payload.links?.studyId
    if (directStudy && /^STU-[A-Za-z0-9_-]+$/.test(directStudy)) {
      return makeRoute(directStudy, eventGraphId, payload.name)
    }
    const runId = payload.links?.runId ?? payload.runId
    if (runId) {
      const runStudy = await resolveStudyForRun(runId)
      if (runStudy) return makeRoute(runStudy, eventGraphId, payload.name)
    }
    return fallback
  } catch {
    // Record lookup failed (404 / network) — graph might be brand new and
    // unsaved. Hand off to scratch with the user's intended graph id so
    // when they hit Save, the workspace already knows the id.
    return fallback
  }
}

/**
 * Entry for the /runs/:runId/event-editor route. We don't have an
 * event-graph id, so the redirect lands on the resolved study with no
 * tab open (workspace.yaml supplies the last view).
 */
export async function resolveLegacyRunRoute(
  runId: string,
): Promise<ResolvedLegacyRoute> {
  const studyId = (await resolveStudyForRun(runId)) ?? SCRATCH_STUDY_ID
  return { studyId, openTab: null }
}

/**
 * Entry for the no-params /event-editor entrypoint. Workspace lands on
 * the scratch study with a fresh deck tab — same affordance the Phase 4
 * empty state used to offer.
 */
export function resolveLegacyNoParamsRoute(): ResolvedLegacyRoute {
  return {
    studyId: SCRATCH_STUDY_ID,
    openTab: {
      kind: 'deck',
      id: `tab-deck-${Date.now().toString(36)}`,
      eventGraphId: '',
      title: 'New deck',
    },
  }
}

/**
 * Phase 12: the legacy global endpoints (`/protocols`, `/browser`,
 * `/literature`) no longer correspond to in-workspace modes. They
 * redirect to `/` (the Welcome screen). Query strings are dropped — the
 * mode-specific params (`?view=foundry` etc.) have no meaning in the
 * Phase-12 workspace.
 */
export function resolveLegacyModeRoute(): { target: string } {
  return { target: '/' }
}

async function resolveStudyForRun(runId: string): Promise<string | null> {
  try {
    const env = await apiClient.getRecord(runId)
    const payload = (env.payload ?? {}) as MinimalRunPayload
    if (payload.studyId && /^STU-[A-Za-z0-9_-]+$/.test(payload.studyId)) {
      return payload.studyId
    }
    return null
  } catch {
    return null
  }
}

function makeRoute(
  studyId: string,
  eventGraphId: string,
  title?: string,
): ResolvedLegacyRoute {
  return {
    studyId,
    openTab: {
      kind: 'deck',
      id: `tab-deck-${eventGraphId}`,
      eventGraphId,
      title: title || eventGraphId,
    },
  }
}
