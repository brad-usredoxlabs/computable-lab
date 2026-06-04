/**
 * DeckViewer — workspace viewer for `kind: 'deck'` tabs.
 *
 * The existing `DeckStage` (deck slots + lawn + PreviewActionBar) is
 * untouched — it just renders inside this wrapper instead of inside the
 * top-level `EventEditorPage`. The wrapper handles the loading / error
 * states that `EventEditorShell` previously surfaced as full-screen splash.
 *
 * The required `EventEditorProvider` is mounted ONE LEVEL UP (in
 * `ProjectWorkspacePage`) so the same provider state is shared with the
 * `DeckToolbar` rendered into AppShell's `viewerToolbar` slot — outside
 * this component's subtree. See ProjectWorkspacePage for the wiring.
 */

import { useEventEditor } from '../../EventEditorContext'
import { DeckStage } from '../../deck/DeckStage'

export function DeckViewer() {
  const { state } = useEventEditor()

  if (state.loadState === 'loading' || state.loadState === 'idle') {
    return (
      <div className="viewer-placeholder viewer-placeholder--deck">
        <div className="splash">Loading platforms…</div>
      </div>
    )
  }

  if (state.loadState === 'error') {
    return (
      <div className="viewer-placeholder viewer-placeholder--deck viewer-placeholder--error">
        <div className="splash splash--error">
          Failed to load platforms: {state.loadError ?? 'unknown error'}
        </div>
      </div>
    )
  }

  // The DeckStage's existing CSS lives under `.event-editor .stage`; wrap
  // in `.event-editor` so the deck/lawn/well selectors continue to scope
  // correctly even when the deck is rendered inside the workspace shell
  // (no longer the page root class).
  return (
    <div className="event-editor event-editor__stage-host">
      <DeckStage />
    </div>
  )
}
