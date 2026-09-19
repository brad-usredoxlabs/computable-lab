/**
 * Stable tab id for a tab VALUE — the ONE id policy, reusing the id helpers
 * declared in app/src/event-editor/workspace/types.ts (no second convention).
 *
 * Used when rebuilding a session from a YAML document, where the document
 * deliberately carries no ids.
 */
import {
  claimTabId,
  collectionTabId,
  deckTabId,
  executionTabId,
  labEntityTabId,
  projectTabId,
  recordCreateTabId,
  recordEditTabId,
  runTabId,
  type WorkspaceTab,
} from '../../event-editor/workspace/types'

/** A unique-ish slot suffix, so a rebuilt tab never collides with an open one. */
function slotSuffix(): string {
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
}

export function stableTabId(tab: WorkspaceTab): string {
  switch (tab.kind) {
    case 'project':
      return projectTabId(tab.studyId)
    case 'project-details':
      // No stable identifier exists on this kind (it is auto-opened per study by
      // the workspace provider), so a rebuilt one gets a fresh slot.
      return `project-details:${slotSuffix()}`
    case 'run':
      return runTabId(tab.runId)
    case 'execution':
      return executionTabId(tab.eventGraphId)
    case 'deck':
      return deckTabId(tab.eventGraphId)
    case 'claim':
      return claimTabId(tab.claimId)
    case 'lab-entity':
      return labEntityTabId(tab.recordId)
    case 'record-edit':
      return recordEditTabId(tab.recordId)
    case 'record-create':
      return recordCreateTabId(
        tab.nodeType,
        tab.nodeType === 'run' ? tab.experimentId : tab.studyId,
      )
    case 'collection':
      return collectionTabId(tab.collection)
    case 'pdf':
    case 'document':
      return `${tab.kind}:${tab.artifactId}`
    case 'splash':
      return `splash:${slotSuffix()}`
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? 'unknown'
    }
  }
}
