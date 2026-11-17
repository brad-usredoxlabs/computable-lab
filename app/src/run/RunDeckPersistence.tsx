/**
 * RunDeckPersistence — d2persist (L2-PROMPT1b-GATE-1 u1).
 *
 * The run deck (/runs/:runId, plan mode) had NO save path for a hand-placed
 * labware: `place_new_labware` only mutated editor memory, so the placement
 * never reached the event graph and vanished on reload (gate r2 §D2). The
 * /deck route already solved this with `useDeckAutosave`; this mounts the SAME
 * governed seam (`persistAcceptedEventGraph` -> `apiClient.saveEventGraph`)
 * inside the run workspace's EventEditorProvider — one placement authority
 * (the graph's editorLayout), no localStorage shadow copy.
 *
 * The one thing this surface adds: a failed save is VISIBLE. A placement that
 * silently stays in memory is a placement the user will lose.
 */
import { useState } from 'react'
import { useDeckAutosave } from '../event-editor/deck/useDeckAutosave'

export function RunDeckPersistence() {
  const [error, setError] = useState<string | null>(null)

  useDeckAutosave({
    onError: (message) => setError(message),
    onSaved: () => setError(null),
  })

  if (!error) return null
  return (
    <p className="run-deck-save-error" role="alert" data-testid="run-deck-save-error">
      Deck not saved: {error}. The latest placement is still only in this tab — it will be lost
      on reload. Make another edit to retry.
    </p>
  )
}
