/**
 * LegacyModeRedirect — `/protocols`, `/browser`, `/literature` no longer
 * have a Phase-12 home in the workspace. They redirect to `/` (Welcome).
 *
 * Query strings are dropped — they were mode-specific (`?view=foundry`,
 * `?type=material`) and have no meaning in the new navigation model. The
 * component stays because the routes are still wired in App.tsx for one
 * deprecation window; removing them entirely would 404 a working
 * bookmark.
 */

import { Navigate } from 'react-router-dom'
import { resolveLegacyModeRoute } from '../legacyRouteResolution'

export interface LegacyModeRedirectProps {
  mode: 'protocols' | 'browser' | 'literature'
}

export function LegacyModeRedirect(_props: LegacyModeRedirectProps) {
  const { target } = resolveLegacyModeRoute()
  return <Navigate to={target} replace />
}
