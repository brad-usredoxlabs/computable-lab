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
import { useEffect, useMemo } from 'react'
import { useEventEditor } from '../event-editor/EventEditorContext'
import { useDeckGhostMount } from '../event-editor/deck/useDeckGhostMount'
import { useSetChatFocus } from '../agent/ChatFocusContext'
import { useProtocolSelection } from '../event-editor/protocol/ProtocolSelectionContext'
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

  // WELL-SELECTION CHANNEL (same defect as the deck chat): the page builds its
  // AiContext ABOVE the EventEditorProvider, so it cannot see the deck
  // selection at all — and the server's prompt builder only reads
  // `context.selectedWells` (systemPrompt.ts:672). Net: the run chat told the
  // model "(none selected)" every turn and drafted events with no wells (no
  // placement => nothing ghosts). The bridge runs INSIDE the provider, so it is
  // the one place that can put the selection on the wire under the receiver's
  // declared name.
  const chatContext = useMemo<AiContext>(() => {
    const selection = state.selection
    return {
      ...aiContext,
      surfaceContext: {
        ...aiContext.surfaceContext,
        selectedWells: selection
          ? { labwareId: selection.labwareId, wells: selection.wells ?? [] }
          : null,
      },
    }
  }, [aiContext, state.selection])

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
    aiContext: chatContext,
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

  // LEG E / E-α: publish the pane's working-focus box. The run page moved its
  // permanent chat onto the universal HarnessChatPane during the chat standard,
  // and the pane's SurfaceFocusHeader is a CARRIER (it renders the published
  // ChatFocus only) — without a publish it renders NOTHING, which is how the
  // run surface lost its "what are we looking at" header (the legacy
  // ChatContextHeader died with LEG D). Publish EXACTLY as the deck does
  // (DeckSurfaceChat.tsx:207-216): derived from resolved state only, zero
  // model calls, the focused-step truth from ProtocolSelectionContext — the
  // SAME focusedStep the deleted ChatContextHeader read (ChatContextHeader.tsx:
  // 22-23). The detail key is CONDITIONAL: absent (never `undefined`) when no
  // step is focused (exactOptionalPropertyTypes discipline — the same
  // conditional-spread rule HarnessChatPane's chain spreads use).
  const setFocus = useSetChatFocus()
  const selection = useProtocolSelection()
  const focusedStep = selection?.focusedStep ?? null
  const runLabel = `Run ${state.runId ?? '(unsaved)'}`
  const focusDetail = focusedStep
    ? `Step ${focusedStep.ordinal ?? '?'}: ${focusedStep.label}`
    : undefined
  useEffect(() => {
    setFocus({
      surface: 'run-workspace',
      label: runLabel,
      ...(focusDetail !== undefined ? { detail: focusDetail } : {}),
    })
    return () => setFocus(null)
  }, [setFocus, runLabel, focusDetail])

  return null
}
