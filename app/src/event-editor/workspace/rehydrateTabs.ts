/**
 * Rehydration helpers for the unified-tab migration (Phase 4.2).
 *
 * The per-study `WorkspaceContext` persists viewer sub-tabs (deck / pdf /
 * document / execution / record-*) in `records/studies/<id>/workspace.yaml`.
 * Under the flat browser-tab model those surfaces have TOP-LEVEL identities
 * (their own tab strip entry + host route). `workspaceTabsToOpenTabs` maps a
 * persisted workspace tab to its top-level tab shape ADDITIVELY — it never
 * deletes or rewrites workspace.yaml, it just surfaces the same content in the
 * top-level strip. Tabs without a top-level identity (project-details = the
 * project view itself, collection) are dropped.
 */

import {
  deckTabId,
  executionTabId,
  recordCreateTabId,
  recordEditTabId,
  type WorkspaceTab,
} from './types'

/**
 * Map a per-study workspace tab to its top-level (OpenTabs) tab shape, or
 * null when it has no top-level identity.
 */
export function workspaceTabToOpenTab(tab: WorkspaceTab): WorkspaceTab | null {
  switch (tab.kind) {
    case 'project':
    case 'run':
    case 'claim':
    case 'lab-entity':
    case 'splash':
      // Already top-level shapes — pass through unchanged.
      return tab
    case 'deck':
      // A fresh unsaved canvas has no eventGraphId and therefore no host
      // route — skip it. Only persisted (named) graphs rehydrate.
      if (!tab.eventGraphId) return null
      return {
        id: deckTabId(tab.eventGraphId),
        kind: 'deck',
        eventGraphId: tab.eventGraphId,
        ...(tab.runId ? { runId: tab.runId } : {}),
        title: tab.title,
      }
    case 'pdf':
      return {
        id: `tab-pdf-${tab.artifactId}`,
        kind: 'pdf',
        artifactId: tab.artifactId,
        title: tab.title,
      }
    case 'document':
      return {
        id: `tab-doc-${tab.artifactId}`,
        kind: 'document',
        artifactId: tab.artifactId,
        title: tab.title,
      }
    case 'execution':
      return {
        id: executionTabId(tab.eventGraphId),
        kind: 'execution',
        eventGraphId: tab.eventGraphId,
        runId: tab.runId,
        title: tab.title,
      }
    case 'record-edit':
      return {
        id: recordEditTabId(tab.recordId),
        kind: 'record-edit',
        recordId: tab.recordId,
        ...(tab.recordKind ? { recordKind: tab.recordKind } : {}),
        title: tab.title,
      }
    case 'record-create': {
      const parent =
        tab.nodeType === 'run'
          ? tab.experimentId
          : tab.nodeType === 'experiment'
            ? tab.studyId
            : undefined
      return {
        id: recordCreateTabId(tab.nodeType, parent),
        kind: 'record-create',
        nodeType: tab.nodeType,
        ...(tab.studyId ? { studyId: tab.studyId } : {}),
        ...(tab.experimentId ? { experimentId: tab.experimentId } : {}),
        title: tab.title,
      }
    }
    case 'project-details':
    case 'collection':
      // The project homepage IS the project view (already the visible tab);
      // collection tabs are superseded by the GlobalNavbar — neither needs a
      // distinct top-level rehydration.
      return null
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? null
    }
  }
}

/** Map a full list, dropping tabs with no top-level identity. */
export function workspaceTabsToOpenTabs(tabs: WorkspaceTab[]): WorkspaceTab[] {
  const out: WorkspaceTab[] = []
  for (const tab of tabs) {
    const top = workspaceTabToOpenTab(tab)
    if (top) out.push(top)
  }
  return out
}
