/**
 * openSurface — the AI's "go there" primitive: a surface context in, a live tab
 * out. Uses the registry (surfaceRoute) for the URL and the existing tab store
 * for the tab. No route table of its own.
 */
import type { OpenTabsContextValue } from '../shell/OpenTabsContext'
import type { SurfaceSpec } from '../surfaces'
import { surfaceRoute, type SurfaceTarget } from '../surfaces/surfaceRoute'
import { openContent } from '../lib/openContent'
import type { WorkspaceTab } from '../../event-editor/workspace/types'
import { projectTabId, runTabId } from '../../event-editor/workspace/types'

/** Map a resolved surface target to the tab record the store expects. */
export function tabForSurface(target: SurfaceTarget & { title?: string }): WorkspaceTab | null {
  const title = target.title ?? target.active.objectId
  switch (target.active.objectType) {
    case 'run':
      return { id: runTabId(target.active.objectId), kind: 'run', runId: target.active.objectId, title }
    case 'project':
      return { id: projectTabId(target.active.objectId), kind: 'project', studyId: target.active.objectId, title }
    default:
      return null
  }
}

/**
 * Open `target` in the ACTIVE tab. Returns the route used, or null when the
 * context cannot be turned into a route (surface not deep-linkable, or the
 * objectType does not fill any token).
 */
export function openSurface(
  openTabs: OpenTabsContextValue | null,
  navigate: (path: string) => void,
  registry: SurfaceSpec[],
  target: SurfaceTarget & { title?: string },
): string | null {
  const route = surfaceRoute(target, registry)
  const tab = tabForSurface(target)
  if (!route || !tab) return null
  openContent(openTabs, navigate, tab, route)
  return route
}
