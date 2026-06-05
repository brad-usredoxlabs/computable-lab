/**
 * LegacyModeRedirect — `/protocols`, `/browser`, `/literature` are no
 * longer top-level destinations. They redirect into the project
 * workspace dispatcher (Phase 11: modes within a project; project
 * switch = topbar tab switch).
 *
 * The redirect preserves the query string so deep-links like
 * `/protocols?view=foundry&sessionId=PIS-X` survive. Lands on the
 * scratch study by default; once the user is inside a real project,
 * the in-workspace ProjectModeSelector keeps them within that project.
 */

import { Navigate, useLocation } from 'react-router-dom'
import {
  resolveLegacyModeRoute,
} from '../legacyRouteResolution'

export interface LegacyModeRedirectProps {
  mode: 'protocols' | 'browser' | 'literature'
}

export function LegacyModeRedirect({ mode }: LegacyModeRedirectProps) {
  const location = useLocation()
  const { studyId, mode: m } = resolveLegacyModeRoute(mode)
  const target = `/project/${encodeURIComponent(studyId)}/${m}${location.search}`
  return <Navigate to={target} replace />
}
