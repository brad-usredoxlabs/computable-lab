import { Navigate } from 'react-router-dom'
import { useOpenTabs } from './OpenTabsContext'
import { tabPath } from './WorkspaceTabStrip'

export function HomeRedirect() {
  const { state } = useOpenTabs()
  const active = state.tabs.find((t) => t.tab.id === state.activeTabId)
  if (active) {
    const path = tabPath(active.tab)
    if (path) return <Navigate to={path} replace />
  }
  return <Navigate to="/splash" replace />
}
