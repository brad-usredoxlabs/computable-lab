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

  if (state.loadState === 'missing') {
    // danglingplan (L2-SUBPROTOCOL-EXPAND-1): the run's plan graph is a
    // stale pointer — name the missing graph and the way back to the run.
    // A plain anchor (not a router Link); no new fetch, no auto-retry.
    return (
      <div className="viewer-placeholder viewer-placeholder--deck">
        <div className="splash splash--missing">
          This surface points at plan graph{' '}
          <span className="splash--missing-id">{state.missingGraphId ?? 'unknown graph'}</span>,
          which does not exist yet. Rebuild the plan graph from the run
          workspace.
          {state.runId ? (
            <>
              <br />
              <a className="splash--missing-link" href={`/runs/${state.runId}`}>
                Back to run {state.runId}
              </a>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  if (state.loadState === 'error') {
    return (
      <div className="viewer-placeholder viewer-placeholder--deck viewer-placeholder--error">
        <div className="splash splash--error">
          Failed to load: {state.loadError ?? 'unknown error'}
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
