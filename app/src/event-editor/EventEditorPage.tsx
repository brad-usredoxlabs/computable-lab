/**
 * EventEditorPage — Phase 10 cutover. The legacy route component is now a
 * thin resolver that redirects to the new `/project/:studyId/...`
 * workspace shell. Three legacy routes funnel through here:
 *
 *   /event-editor               → /project/STU-scratch (fresh deck tab)
 *   /event-editor/:eventGraphId → resolve parent study → /project/<study>/event-graph/<graphId>
 *   /runs/:runId/event-editor   → resolve parent study → /project/<study>
 *
 * Resolution is best-effort: any failure falls through to STU-scratch so
 * the redirect never dead-ends. The plan calls for these redirects to
 * live for one release before the routes themselves are deleted; this
 * file is the entire surface the cleanup will need to remove.
 */

import { useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import {
  resolveLegacyEventGraphRoute,
  resolveLegacyNoParamsRoute,
  resolveLegacyRunRoute,
  SCRATCH_STUDY_ID,
  type ResolvedLegacyRoute,
} from './legacyRouteResolution'

export function EventEditorPage() {
  const params = useParams<{ runId?: string; eventGraphId?: string }>()
  const [searchParams] = useSearchParams()

  // The legacy `?id=` query param was an alternate way to deep-link a
  // graph. Treat it the same as the path-param form.
  const eventGraphId =
    params.eventGraphId ?? searchParams.get('id') ?? undefined
  const runId = params.runId

  const [resolved, setResolved] = useState<ResolvedLegacyRoute | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      let route: ResolvedLegacyRoute
      if (eventGraphId) {
        route = await resolveLegacyEventGraphRoute(eventGraphId)
      } else if (runId) {
        route = await resolveLegacyRunRoute(runId)
      } else {
        route = resolveLegacyNoParamsRoute()
      }
      if (cancelled) return
      setResolved(route)
    })()
    return () => {
      cancelled = true
    }
  }, [eventGraphId, runId])

  if (!resolved) {
    // Render an empty frame until the resolution returns. The legacy
    // routes used to mount a full splash; the redirect path is fast
    // enough that an empty frame avoids the visual jank of a transient
    // splash that immediately unmounts.
    return (
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )
  }

  const target = buildRedirectTarget(resolved)
  return (
    <ThemeProvider>
      <Navigate to={target} replace />
    </ThemeProvider>
  )
}

function buildRedirectTarget(resolved: ResolvedLegacyRoute): string {
  const base = `/project/${encodeURIComponent(resolved.studyId)}`
  if (resolved.openTab?.kind === 'deck' && resolved.openTab.eventGraphId) {
    return `${base}/event-graph/${encodeURIComponent(resolved.openTab.eventGraphId)}`
  }
  return base
}

export { SCRATCH_STUDY_ID }
export default EventEditorPage
