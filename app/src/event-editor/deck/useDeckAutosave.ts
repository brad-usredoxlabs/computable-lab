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

export interface DeckAutosaveOptions {
  /** A save failed: report it VISIBLY (a placement that never reached the
   *  server would otherwise vanish on reload with no trace). */
  onError?: (message: string) => void
  /** A save resolved: clear any previously reported error. */
  onSaved?: () => void
}

export function useDeckAutosave(options: DeckAutosaveOptions = {}): void {
  const { state } = useEventEditor()
  const lastSignature = useRef<string | null>(null)
  const saving = useRef(false)
  // Latest callbacks without re-arming the debounce on every render.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

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
    // Wait until the graph has LOADED before taking a baseline: the first
    // observation of the loaded state is the load, not an edit. (Before
    // 'ready' the editor is still empty — a placement arriving then is a real
    // edit, and treating it as a baseline would silently drop it.) A sparse
    // mock with no loadState is treated as loaded.
    const loadState = (state as { loadState?: string }).loadState
    if (loadState !== undefined && loadState !== 'ready') return
    if (lastSignature.current === null) {
      // First observation of the loaded graph = baseline, not an edit.
      lastSignature.current = signature
      return
    }
    // Nothing to persist yet, and never persist an empty deck over a saved one.
    if (state.placements.length === 0 && state.events.length === 0) return
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
          optionsRef.current.onSaved?.()
        })
        .catch((err) => {
          // Still non-fatal to editing, but NEVER silent: the surface that
          // mounted this hook reports it visibly (d2persist D4).
          console.warn('Deck autosave failed; the next edit will retry.', err)
          const message = err instanceof Error && err.message ? err.message : String(err)
          optionsRef.current.onError?.(message)
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
