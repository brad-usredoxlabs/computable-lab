/**
 * DeckSurfaceChat — mounts the deck route's UNIVERSAL chat.
 *
 * Why: `/deck/:eventGraphId` rendered the right pane with no registered chat,
 * so it fell back to the legacy AiTabPanel, whose engine (`useChatThread`)
 * keeps state in memory and per-mount — every reload started from zero, and the
 * conversation was never persisted. `useSurfaceChat` registers a `useAiChat`
 * thread (persisted to /api/ai/threads/event-editor) plus the proposal flow, and
 * RightPane renders HarnessChatPane for it automatically.
 *
 * Draft-apply ownership on this route: an accepted AI proposal appends its
 * events through the SAME editor action the deck canvas uses (`appendEvent`).
 * Labware *additions* proposed by the model are not materialised here yet —
 * that needs the deck-slot placement decision the full editor owns; leaving the
 * callback absent is honest (no silent half-apply), and the events still land.
 */
import { useMemo } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { useSurfaceChat } from '../../agent/useSurfaceChat'
import type { AiContext } from '../../types/aiContext'

export function DeckSurfaceChat() {
  const { state, actions } = useEventEditor()

  const aiContext = useMemo<AiContext>(() => {
    const selection = state.selection
    return {
      surface: 'event-editor',
      summary: `Deck ${state.eventGraphId ?? '(unsaved)'} — ${state.platformId} / ${state.variantId}`,
      surfaceContext: {
        eventGraphId: state.eventGraphId,
        runId: state.runId,
        platformId: state.platformId,
        variantId: state.variantId,
        vocabPackId: state.vocabPackId,
        placementCount: state.placements.length,
        eventCount: state.events.length,
        // `wells` is always an ARRAY: the server-side prompt/context builder
        // reads `.length` on it, and an absent value crashed the turn
        // ("Cannot read properties of undefined (reading 'length')").
        selection: selection
          ? { labwareId: selection.labwareId, wells: selection.wells ?? [] }
          : null,
      },
      editorMode: 'deck',
    }
  }, [
    state.eventGraphId,
    state.runId,
    state.platformId,
    state.variantId,
    state.vocabPackId,
    state.placements.length,
    state.events.length,
    state.selection,
  ])

  useSurfaceChat({
    aiContext,
    endpoint: 'event-editor',
    onAcceptEvent: actions.appendEvent,
  })

  return null
}
