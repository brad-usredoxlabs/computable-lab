/**
 * "/" is not a destination — it is "resume my session". The active tab's route
 * wins; if that tab has no route (viewer tabs like project-details return null
 * from tabPath), fall back to the first tab that does; only an empty session
 * gets the /splash launcher.
 *
 * This is only correct because OpenTabsProvider hydrates SYNCHRONOUSLY — do not
 * reintroduce a useEffect-based load (see OpenTabsContext.hydration.test.ts).
 */
import { Navigate } from 'react-router-dom'
import { useOpenTabs } from './OpenTabsContext'
import { tabPath } from './WorkspaceTabStrip'

export function HomeRedirect() {
  const { state } = useOpenTabs()
  const active = state.tabs.find((t) => t.tab.id === state.activeTabId)
  const activePath = active ? tabPath(active.tab) : null
  if (activePath) return <Navigate to={activePath} replace />

  const fallback = state.tabs
    .map((t) => tabPath(t.tab))
    .find((p): p is string => p !== null)
  if (fallback) return <Navigate to={fallback} replace />

  return <Navigate to="/splash" replace />
}
