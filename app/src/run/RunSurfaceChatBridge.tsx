/**
 * RunSurfaceChatBridge — L2-CHAT-1: the run workspace's universal chat.
 *
 * Runs INSIDE the run page's EventEditorProvider, so the single
 * `useSurfaceChat` call can finally carry what the page's old top-level call
 * never could (it sat ABOVE the provider):
 *
 *  - `onAcceptEvent: actions.appendEvent` — ChatPreviewCard Apply actually
 *    applies: accepted events land on the deck through the SAME editor action
 *    the deck canvas uses. With the handler absent, a done with mountable
 *    events used to be a silent no-op (spec §1 defect); useAiChat now reports
 *    the missing-handler case loudly instead.
 *  - the GHOST MOUNT (useDeckGhostMount): an event-bearing proposal mounts
 *    deck ghosts + the revision trail on the editor state; Discard clears.
 *    ADOPTION (placements/labwares → committed) rides the deck's own
 *    PreviewActionBar commitPreview path — the same one the /deck/:id route
 *    uses: one event/ghost path, no second adopter.
 *
 * The pane (HarnessChatPane in the page's rightPane slot) is a pure consumer
 * of the app-level AiPanelContext, so registering from inside the provider
 * changes nothing about what the pane reads.
 */
import { useEventEditor } from '../event-editor/EventEditorContext'
import { useDeckGhostMount } from '../event-editor/deck/useDeckGhostMount'
import {
  adoptStagedPreview,
  type DeckPreviewLike,
} from '../event-editor/deck/deckAdoption'
import type {
  DeckAdoptionOutcome as HookDeckAdoptionOutcome,
  DeckPreviewLike as HookDeckPreviewLike,
} from '../shared/hooks/useAiChat'
import { useSurfaceChat } from '../agent/useSurfaceChat'
import type { AiContext } from '../types/aiContext'

export function RunSurfaceChatBridge({ aiContext }: { aiContext: AiContext }) {
  const { state, actions } = useEventEditor()
  const { onProposalDrafted, onPreviewDiscarded } = useDeckGhostMount()

  // L2-CHAT-1 FIX3 D1: the COMPLETE-adopter seam (run workspace) — a
  // chat-card Apply commits the FULL staged editor preview through the
  // shared deck adoption core (one adopter with the deck bar). termDecisions
  // is {} on purpose: sign-off decisions live in the deck bar's local
  // ProposedGraphModal state, so unsigned decisionNeeded terms REFUSE the
  // chat Apply visibly instead of silently materializing.
  const onPreviewAccept = (preview: HookDeckPreviewLike) =>
    adoptStagedPreview(
      preview as unknown as DeckPreviewLike,
      {
        eventGraphId: state.eventGraphId,
        runId: state.runId,
        ...(state.platformId ? { platformId: state.platformId } : {}),
        ...(state.variantId ? { variantId: state.variantId } : {}),
        events: state.events,
        labwares: state.labwares,
        equipments: state.equipments,
        placements: state.placements,
      },
      {
        termDecisions: {},
        commit: (previewEvents, persisted) =>
          actions.commitPreview(previewEvents, persisted.eventGraphId, persisted.commit),
      },
    ) as Promise<HookDeckAdoptionOutcome>

  useSurfaceChat({
    aiContext,
    endpoint: 'event-editor',
    // L2-THREAD-SCOPED-1 (SUITEA-D3 amendment A-1, review D1 wiring): same
    // deck-scope treatment as DeckSurfaceChat — this bridge owns a deck
    // chat on the run workspace, so it forwards the loaded eventGraphId as
    // the thread scope (unsaved => no scope => the server's "_").
    ...(state.eventGraphId ? { scope: state.eventGraphId } : {}),
    onAcceptEvent: actions.appendEvent,
    onProposalDrafted,
    onPreviewDiscarded,
    // L2-CHAT-1 FIX3 D1: the full adoption seam + the staged EXTRAS the
    // adoption commit / a revise turn's draftRevision need (D1 + D3).
    onPreviewAccept,
    onStagedExtras: () => {
      const preview = state.preview
      if (!preview) return null
      return {
        previewLabwares: preview.previewLabwares as Record<string, unknown>,
        previewPlacements: preview.previewPlacements,
        ...(preview.previewEquipments ? { previewEquipments: preview.previewEquipments as Record<string, unknown> } : {}),
        ...(preview.ontologyBindings ? { ontologyBindings: preview.ontologyBindings } : {}),
        ...(preview.recordCreations ? { recordCreations: preview.recordCreations } : {}),
        ...(preview.sourceSkips ? { sourceSkips: preview.sourceSkips } : {}),
      }
    },
  })

  return null
}
