/**
 * activeProjectFromTabs — "which project am I in?", derived from the open-tabs
 * store rather than the route.
 *
 * Surfaces like /ingestion, /claims and /find are reached from the global nav
 * while the user is still notionally working inside a project tab. The route
 * alone cannot answer the question (there's no studyId in those paths), so the
 * answer has to come from session state.
 *
 * Resolution order:
 *   1. the ACTIVE tab, when it is a project tab;
 *   2. otherwise the most recently VISITED project tab (across-tab history —
 *      this is what keeps "the project I'm working in" stable when you click
 *      away to Ingestion or Claims);
 *   3. otherwise the last project tab still open.
 */
import type { OpenTabsState } from './OpenTabsContext'

export interface ActiveProject {
  studyId: string
  title: string
}

export function activeProjectFromTabs(
  state: OpenTabsState | null | undefined,
): ActiveProject | null {
  if (!state) return null

  const projectOf = (tabId: string | null | undefined): ActiveProject | null => {
    if (!tabId) return null
    const entry = state.tabs.find((t) => t.tab.id === tabId)
    if (!entry || entry.tab.kind !== 'project') return null
    return { studyId: entry.tab.studyId, title: entry.tab.title }
  }

  const active = projectOf(state.activeTabId)
  if (active) return active

  const cursor = Math.min(state.historyCursor, state.history.length - 1)
  for (let i = cursor; i >= 0; i--) {
    const visited = projectOf(state.history[i])
    if (visited) return visited
  }

  for (let i = state.tabs.length - 1; i >= 0; i--) {
    const tab = state.tabs[i]!.tab
    if (tab.kind === 'project') return { studyId: tab.studyId, title: tab.title }
  }

  return null
}
