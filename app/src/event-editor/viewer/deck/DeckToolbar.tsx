/**
 * DeckToolbar — the chips that used to live in `EventEditorShell.tsx`'s
 * topbar middle slot, lifted into the workspace's `viewerToolbar` slot.
 *
 * Renders only when the active workspace tab is `kind: 'deck'`. Each chip
 * reads from `useEventEditor()`, so this component MUST be mounted inside
 * the same `EventEditorProvider` subtree that wraps `DeckViewer`. The
 * provider is set up in `ProjectWorkspacePage` so it covers both slots.
 *
 * When the deck tab has a runId:
 *   1. RunBreadcrumb shows the project path (clickable, navigates back)
 *   2. EditableTitle shows the run name (click-to-edit, persists to server)
 * Together they read: [Project] › [Run Name]
 */

import { UndoRedoControls } from '../../topbar/UndoRedoControls'
import { DeckModeSwitcher } from '../../topbar/DeckModeSwitcher'
import { VocabSwitcher } from '../../topbar/VocabSwitcher'
import { ToolSwitcher } from '../../topbar/ToolSwitcher'
import { TipChip } from '../../topbar/TipChip'
import { EventGraphChip } from '../../topbar/EventGraphChip'
import { useEventEditor } from '../../EventEditorContext'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { EditableTitle } from '../../../shared/shell/EditableTitle'
import { TabBreadcrumb } from '../../../shared/shell/TabBreadcrumb'
import { RunBreadcrumb } from './RunBreadcrumb'
import { apiClient } from '../../../shared/api/client'
import type { BreadcrumbItem, WorkspaceTab } from '../../workspace/types'

export interface DeckToolbarProps {
  tab: WorkspaceTab | null
  breadcrumb?: BreadcrumbItem[]
}

export function DeckToolbar({ tab, breadcrumb }: DeckToolbarProps) {
  const { state } = useEventEditor()
  const ws = useWorkspace()
  const runDeckLocked = state.runDeckLock?.locked === true

  // Only show the editable title for deck tabs that have a runId
  const hasRun = tab?.kind === 'deck' && tab.runId
  const runId = tab?.kind === 'deck' ? tab.runId : undefined
  const tabTitle = tab?.kind === 'deck' ? tab.title : undefined

  const handleRename = async (newTitle: string) => {
    if (!tab || !runId) return
    // Update the workspace tab title immediately (optimistic)
    ws.renameTab(tab.id, newTitle)
    // Persist to the run record on the server
    try {
      const existing = await apiClient.getRecord(runId)
      const payload = existing.payload as Record<string, unknown>
      payload.title = newTitle
      await apiClient.updateRecord(runId, payload)
    } catch (err) {
      // Revert the tab title on failure
      ws.renameTab(tab.id, tabTitle ?? 'Run')
      console.error('Failed to rename run:', err)
    }
  }

  const useBreadcrumb = hasRun && breadcrumb && breadcrumb.length > 0

  return (
    <div className="event-editor viewer-toolbar viewer-toolbar--deck">
      {useBreadcrumb ? (
        <>
          <TabBreadcrumb crumbs={breadcrumb} />
          <span className="deck-toolbar__separator" aria-hidden />
          <EditableTitle
            title={tabTitle ?? 'Untitled Run'}
            onCommit={handleRename}
            testId="run-title"
          />
        </>
      ) : hasRun ? (
        <>
          <RunBreadcrumb runId={runId} />
          <EditableTitle
            title={tabTitle ?? 'Untitled Run'}
            onCommit={handleRename}
            testId="run-title"
          />
        </>
      ) : null}
      {hasRun ? <span className="deck-toolbar__separator" aria-hidden /> : null}
      <UndoRedoControls />
      {!runDeckLocked ? (
        <>
          <DeckModeSwitcher />
          <VocabSwitcher />
        </>
      ) : null}
      <ToolSwitcher />
      <TipChip />
      <EventGraphChip />
    </div>
  )
}
