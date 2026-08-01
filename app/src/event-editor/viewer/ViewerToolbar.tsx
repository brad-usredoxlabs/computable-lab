/**
 * ViewerToolbar — content for AppShell's `viewerToolbar` slot. Mirror of
 * `Viewer`: switches on the active tab's `kind` and renders the toolbar
 * that matches the surface.
 *
 *   - deck     → DeckToolbar (the existing chips lifted out of EventEditorShell)
 *   - pdf      → PdfToolbar (placeholder until Phase 5)
 *   - document → DocumentToolbar (placeholder until Phase 6)
 *
 * When no tab is active, renders nothing — the viewerToolbar slot just
 * collapses, giving the empty-state viewer maximum vertical space.
 */

import { DeckToolbar } from './deck/DeckToolbar'
import { PdfToolbar } from './pdf/PdfToolbar'
import { DocumentToolbar } from './document/DocumentToolbar'
import { DeckModeSwitcher } from '../topbar/DeckModeSwitcher'
import type { WorkspaceTab } from '../workspace/types'

export interface ViewerToolbarProps {
  /** The active workspace tab, or null when no tab is open. */
  tab: WorkspaceTab | null
}

export function ViewerToolbar({ tab }: ViewerToolbarProps) {
  if (!tab) return null
  switch (tab.kind) {
    case 'deck':
      return <DeckToolbar tab={tab} />
    case 'pdf':
      return <PdfToolbar artifactId={tab.artifactId} />
    case 'document':
      return <DocumentToolbar artifactId={tab.artifactId} />
    case 'project-details':
    case 'record-create':
    case 'record-edit':
    case 'project':
    case 'run':
    case 'claim':
    case 'lab-entity':
    case 'collection':
      // These surfaces carry their own headers inside the viewer body —
      // no per-surface toolbar.
      return null
    case 'execution':
      // Show mode switcher so user can navigate back to plan/deck view.
      return (
        <div className="event-editor viewer-toolbar viewer-toolbar--execution">
          <DeckModeSwitcher />
        </div>
      )
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? null
    }
  }
}