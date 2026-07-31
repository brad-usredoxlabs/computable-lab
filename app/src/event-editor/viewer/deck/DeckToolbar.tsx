/**
 * DeckToolbar — the chips that used to live in `EventEditorShell.tsx`'s
 * topbar middle slot, lifted into the workspace's `viewerToolbar` slot.
 *
 * Renders only when the active workspace tab is `kind: 'deck'`. Each chip
 * reads from `useEventEditor()`, so this component MUST be mounted inside
 * the same `EventEditorProvider` subtree that wraps `DeckViewer`. The
 * provider is set up in `ProjectWorkspacePage` so it covers both slots.
 *
 * Phase 2 of quick-run-creation plan: when the deck tab has a runId, the
 * run name is shown as an EditableTitle at the left of the toolbar.
 * Clicking it opens an inline input; Enter commits the rename to both
 * the workspace tab (optimistic) and the run record on the server.
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
import { apiClient } from '../../../shared/api/client'
import type { WorkspaceTab } from '../../workspace/types'

export interface DeckToolbarProps {
  tab: WorkspaceTab | null
}

export function DeckToolbar({ tab }: DeckToolbarProps) {
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

  return (
    <div className="event-editor viewer-toolbar viewer-toolbar--deck">
      {hasRun ? (
        <EditableTitle
          title={tabTitle ?? 'Untitled Run'}
          onCommit={handleRename}
          testId="run-title"
        />
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
