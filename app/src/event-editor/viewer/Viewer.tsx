/**
 * Viewer — the workspace's left-pane dispatcher.
 *
 * Switches on the active workspace tab's `kind`:
 *   - `deck`     → DeckViewer (existing DeckStage + PreviewActionBar)
 *   - `pdf`      → PdfViewer (placeholder until Phase 5)
 *   - `document` → DocumentEditor (placeholder until Phase 6)
 *
 * When no tab is active, renders an empty state pointing the user at the
 * right pane's Browse mode (Phase 7) — for now it just explains that
 * Phase 3 ships the chrome and Phase 4+ fill in the surfaces.
 *
 * Important coupling: the deck case relies on `EventEditorProvider` being
 * mounted higher in the tree (see ProjectWorkspacePage). This component
 * does NOT mount the provider — the toolbar's chips need to read the same
 * state from the same provider, and the toolbar lives outside the left
 * pane in AppShell's `viewerToolbar` slot.
 */

import { DeckViewer } from './deck/DeckViewer'
import { PdfViewer } from './pdf/PdfViewer'
import { DocumentEditor } from './document/DocumentEditor'
import type { WorkspaceTab } from '../workspace/types'

export interface ViewerProps {
  /** The active workspace tab, or null when no tab is open. */
  tab: WorkspaceTab | null
  /** Called when the user selects text from a PDF and wants to send it to AI. */
  onSendSelection?: (text: string, pageNumber: number) => void
}

export function Viewer({ tab, onSendSelection }: ViewerProps) {
  if (!tab) return <EmptyViewerState />
  switch (tab.kind) {
    case 'deck':
      return <DeckViewer />
    case 'pdf':
      return (
        <PdfViewer
          artifactId={tab.artifactId}
          title={tab.title}
          onSendSelection={onSendSelection}
        />
      )
    case 'document':
      return <DocumentEditor artifactId={tab.artifactId} title={tab.title} />
    case 'project-details':
    case 'record-create':
    case 'record-edit':
      // ProjectWorkspacePage's LeftPane renders these kinds directly
      // (ProjectDetailsView / RecordCreatePanel / RecordEditPanel) and doesn't
      // call Viewer; these arms exist so a future caller can't crash by
      // handing one in.
      return <EmptyViewerState />
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? <EmptyViewerState />
    }
  }
}

function EmptyViewerState() {
  return (
    <div className="viewer-empty">
      <div className="viewer-empty__inner">
        <h2>No viewer open</h2>
        <p>
          Use the right pane's <strong>Find</strong> tab to open a deck, a
          PDF, or a document. State persists per-study via
          <code>workspace.yaml</code>.
        </p>
      </div>
    </div>
  )
}
