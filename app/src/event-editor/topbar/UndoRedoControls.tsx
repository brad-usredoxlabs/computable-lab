/**
 * UndoRedoControls — undo/redo buttons for the deck toolbar, plus the
 * keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; ⌘ on Mac).
 *
 * Mounting the shortcut hook here scopes it to exactly the right lifecycle:
 * DeckToolbar renders only while a deck tab is active, inside the
 * EventEditorProvider. Handlers are passed only when the corresponding stack
 * is non-empty, so with nothing to undo the browser keeps its native Ctrl+Z
 * (the hook only preventDefaults for wired handlers).
 */

import { useEventEditor } from '../EventEditorContext'
import {
  SHORTCUT_LABELS,
  useEditorKeyboardShortcuts,
} from '../../editor/hooks/useEditorKeyboardShortcuts'

export function UndoRedoControls() {
  const { state, actions } = useEventEditor()
  const canUndo = state.history.past.length > 0
  const canRedo = state.history.future.length > 0

  useEditorKeyboardShortcuts({
    ...(canUndo ? { onUndo: actions.undo } : {}),
    ...(canRedo ? { onRedo: actions.redo } : {}),
  })

  return (
    <div className="undo-redo" role="group" aria-label="Undo and redo">
      <button
        type="button"
        className="undo-redo__btn"
        disabled={!canUndo}
        onClick={actions.undo}
        title={`Undo (${SHORTCUT_LABELS.undo})`}
        aria-label="Undo"
        data-testid="deck-undo"
      >
        ↩
      </button>
      <button
        type="button"
        className="undo-redo__btn"
        disabled={!canRedo}
        onClick={actions.redo}
        title={`Redo (${SHORTCUT_LABELS.redo})`}
        aria-label="Redo"
        data-testid="deck-redo"
      >
        ↪
      </button>
    </div>
  )
}
