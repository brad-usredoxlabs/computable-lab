/**
 * DeckToolbar — the chips that used to live in `EventEditorShell.tsx`'s
 * topbar middle slot, lifted into the workspace's `viewerToolbar` slot.
 *
 * Renders only when the active workspace tab is `kind: 'deck'`. Each chip
 * reads from `useEventEditor()`, so this component MUST be mounted inside
 * the same `EventEditorProvider` subtree that wraps `DeckViewer`. The
 * provider is set up in `ProjectWorkspacePage` so it covers both slots.
 */

import { UndoRedoControls } from '../../topbar/UndoRedoControls'
import { DeckModeSwitcher } from '../../topbar/DeckModeSwitcher'
import { VocabSwitcher } from '../../topbar/VocabSwitcher'
import { ToolSwitcher } from '../../topbar/ToolSwitcher'
import { TipChip } from '../../topbar/TipChip'
import { EventGraphChip } from '../../topbar/EventGraphChip'

export function DeckToolbar() {
  return (
    // `event-editor` scopes the chip/undo/tip/graph styles, which are written
    // as `.event-editor .x`. The workspace AppShell doesn't add that scope to
    // the toolbar slot, so (mirroring DeckViewer) we self-scope here.
    <div className="event-editor viewer-toolbar viewer-toolbar--deck">
      <UndoRedoControls />
      <DeckModeSwitcher />
      <VocabSwitcher />
      <ToolSwitcher />
      <TipChip />
      <EventGraphChip />
    </div>
  )
}
