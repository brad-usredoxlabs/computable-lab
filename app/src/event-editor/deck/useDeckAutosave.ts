/**
 * useDeckAutosave — keep a deck edit from dying on reload.
 *
 * The deck route had NO save path for hand-placed labware: `persistAcceptedEventGraph`
 * was only called when you accepted an AI proposal, so a plate placed by hand
 * lived in editor memory and vanished on every reload / tab discard — "I look at
 * it and I'm back to zero".
 *
 * Contract:
 *  - debounced (1.4s idle) so a burst of edits is ONE commit, not one per click;
 *  - only for a graph that already exists (`eventGraphId`), never a phantom one;
 *  - a no-op when the content signature is unchanged (no empty commits, no
 *    re-committing what the last save already wrote);
 *  - failures are logged, never thrown into the UI: an autosave must not break
 *    editing, and the next edit retries.
 */
import { useEffect, useRef } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { persistAcceptedEventGraph } from '../eventGraphPersistence'

const IDLE_MS = 1400

export function useDeckAutosave(): void {
  const { state } = useEventEditor()
  const lastSignature = useRef<string | null>(null)
  const saving = useRef(false)

  const signature = JSON.stringify({
    graph: state.eventGraphId,
    labwares: Object.keys(state.labwares).sort(),
    placements: state.placements.map((p) => `${p.placementId}:${p.labwareId}:${p.location?.kind ?? ''}`),
    events: state.events.map((e) => e.eventId),
    platform: state.platformId,
    variant: state.variantId,
  })

  useEffect(() => {
    const eventGraphId = state.eventGraphId
    if (!eventGraphId) return
    // Nothing to persist yet, and never persist an empty deck over a saved one
    // just because the editor mounted.
    if (state.placements.length === 0 && state.events.length === 0) return
    if (lastSignature.current === null) {
      // First observation after mount = the loaded state, not an edit.
      lastSignature.current = signature
      return
    }
    if (lastSignature.current === signature) return

    const timer = setTimeout(() => {
      if (saving.current) return
      saving.current = true
      const savingSignature = signature
      void persistAcceptedEventGraph({
        eventGraphId,
        runId: state.runId,
        events: state.events,
        labwares: state.labwares,
        placements: state.placements,
        ...(state.runId ? { platformId: state.platformId, variantId: state.variantId } : {}),
      })
        .then(() => {
          lastSignature.current = savingSignature
        })
        .catch((err) => {
          console.warn('Deck autosave failed; the next edit will retry.', err)
        })
        .finally(() => {
          saving.current = false
        })
    }, IDLE_MS)

    return () => clearTimeout(timer)
  }, [
    signature,
    state.eventGraphId,
    state.runId,
    state.platformId,
    state.variantId,
    state.placements,
    state.events,
    state.labwares,
  ])
}
