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
 *
 * L2-CHAT-1 (universal chat revision loop): an event-bearing proposal the
 * universal chat staged is MOUNTED AS GHOSTS on the editor state through the
 * `onProposalDrafted` seam — the same setPreview contract AiTabPanel's
 * onDraftResult uses (AiTabPanel.tsx:608-669): events ghosted, a placement
 * per resolved labware offer, and the revision trail appended so the deck
 * review modal shows the draft chain. Discard clears the ghosts.
 */
import { useEffect, useMemo } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { useSurfaceChat } from '../../agent/useSurfaceChat'
import type { AiContext } from '../../types/aiContext'
import { useSetChatFocus } from '../../agent/ChatFocusContext'
import { useDeckGhostMount } from './useDeckGhostMount'

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

  // L2-CHAT-1: the universal GHOST MOUNT (extracted to useDeckGhostMount so
  // the run workspace shares the SAME implementation — one event/ghost path).
  const { onProposalDrafted, onPreviewDiscarded } = useDeckGhostMount()

  useSurfaceChat({
    aiContext,
    endpoint: 'event-editor',
    onAcceptEvent: actions.appendEvent,
    // L2-CHAT-1: event-bearing proposals mount deck ghosts; a chat discard
    // clears the preview (the hook's discard seam is a no-op — adoption is
    // the deck's PreviewActionBar's job — so the clear rides the editor).
    onProposalDrafted,
    onPreviewDiscarded: () => {
      onPreviewDiscarded()
      actions.clearPreview()
    },
  })

  // Publish the pane's working-focus box. Without this the universal pane's
  // SurfaceFocusHeader renders NOTHING (it is a carrier, not a deriver), which
  // is why the deck lost the "what are we looking at" box when it moved off the
  // legacy pane. Derived from resolved editor state only — zero model calls.
  const setFocus = useSetChatFocus()
  const deckLabel = state.eventGraphId ? `Deck ${state.eventGraphId}` : 'Deck (unsaved)'
  const selectionLabel = state.selection?.wells?.length
    ? `${state.selection.wells.length} well${state.selection.wells.length === 1 ? '' : 's'} selected`
    : null
  const focusDetail = [state.platformId, state.variantId, selectionLabel].filter(Boolean).join(' · ')
  useEffect(() => {
    setFocus({ surface: 'event-editor', label: deckLabel, detail: focusDetail })
    return () => setFocus(null)
  }, [setFocus, deckLabel, focusDetail])

  return null
}
