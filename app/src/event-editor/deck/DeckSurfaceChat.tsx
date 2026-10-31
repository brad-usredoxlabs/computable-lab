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
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import { useSetChatFocus } from '../../agent/ChatFocusContext'
import { useDeckGhostMount } from './useDeckGhostMount'
import {
  adoptStagedPreview,
  type DeckPreviewLike,
} from './deckAdoption'
import type {
  DeckAdoptionOutcome as HookDeckAdoptionOutcome,
  DeckPreviewLike as HookDeckPreviewLike,
} from '../../shared/hooks/useAiChat'
import { getVerbsForDisplay } from '../../shared/vocab/registry'
import { buildAcceptedEventGraphProjection } from '../../graph/lib/acceptedEventGraphProjection'

export function DeckSurfaceChat() {
  const { state, actions } = useEventEditor()

  const aiContext = useMemo<AiContext>(() => {
    const selection = state.selection
    // PORTED CAPABILITY (2026-10-31). The deleted AiTabPanel built its deck
    // context with buildAcceptedEventGraphProjection (AiTabPanel.tsx:254-278 @
    // 8ff1892f^). LEG D replaced the pane and hand-rolled a SUBSET of that
    // projection, renaming the selection to `selection` — a name NO server code
    // reads. Consequence, measured live: the prompt builder reported
    // "(none selected)" on every deck turn, so the drafted shorthand carried no
    // targetWells and no placement, and nothing could ghost onto the deck.
    // This is the same builder the old pane used, so the field names, the
    // selection shape and the well-state snapshot are the server's own
    // vocabulary instead of a second dialect.
    const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)
    const allowedSurfaces = variant
      ? ([
          ...(variant.slots.length > 0 ? (['slot'] as const) : []),
          ...(variant.surface || variant.sideLawn ? (['lawn'] as const) : []),
        ] as const)
      : undefined
    const allowedSlots = variant
      ? variant.slots
          .filter((slot) => slot.kind !== 'trash' && slot.kind !== 'special' && slot.reachable !== false)
          .map((slot) => slot.id)
      : undefined
    const focusedPlacement = state.focusPlacementId
      ? state.placements.find((p) => p.placementId === state.focusPlacementId) ?? null
      : null
    const projection = buildAcceptedEventGraphProjection({
      labwares: new Map(Object.entries(state.labwares)),
      events: state.events,
      vocabPackId: state.vocabPackId,
      availableVerbs: getVerbsForDisplay(state.vocabPackId).map((v) => v.verb),
      ...(selection
        ? {
            sourceSelection: {
              labware: state.labwares[selection.labwareId],
              selectedWells: selection.wells,
            },
          }
        : {}),
      deckPlatform: state.platformId,
      deckVariant: state.variantId,
      deckPlacements: state.placements.map((p) => ({
        slotId: p.location.kind === 'slot' ? p.location.slotId : 'lawn',
        labwareId: p.labwareId,
      })),
      ...(allowedSurfaces && allowedSurfaces.length > 0
        ? { deckAllowedSurfaces: [...allowedSurfaces] }
        : {}),
      ...(allowedSlots && allowedSlots.length > 0 ? { deckAllowedSlots: allowedSlots } : {}),
      ...(focusedPlacement?.labwareId ? { focusedLabwareId: focusedPlacement.labwareId } : {}),
      ...(state.runId ? { runId: state.runId } : {}),
      ...(state.eventGraphId ? { eventGraphId: state.eventGraphId } : {}),
    })
    return {
      surface: 'event-editor',
      summary: `Deck ${state.eventGraphId ?? '(unsaved)'} — ${state.platformId} / ${state.variantId}`,
      surfaceContext: {
        ...projection,
        eventGraphId: state.eventGraphId,
        runId: state.runId,
        platformId: state.platformId,
        variantId: state.variantId,
        vocabPackId: state.vocabPackId,
        placementCount: state.placements.length,
        eventCount: state.events.length,
        // Object form on purpose: the projection's array form loses WHICH
        // labware the wells belong to, and the server prints
        // "Labware: <id>, A1, ..." only for the object form. `wells` stays an
        // ARRAY (the server reads `.length`; an absent value crashed a turn).
        selectedWells: selection
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
    state.platforms,
    state.placements,
    state.focusPlacementId,
    state.events,
    state.selection,
    state.labwares,
  ])

  // L2-CHAT-1: the universal GHOST MOUNT (extracted to useDeckGhostMount so
  // the run workspace shares the SAME implementation — one event/ghost path).
  const { onProposalDrafted, onPreviewDiscarded } = useDeckGhostMount()

  // L2-CHAT-1 FIX3 D1: the COMPLETE-adopter seam — a chat-card Apply on the
  // /deck route commits the FULL staged editor preview through the shared
  // deck adoption core (the SAME module PreviewActionBar uses), so the chat
  // and the deck bar are one adopter, not two.
  //
  // termDecisions: {} on purpose — the sign-off decisions live in the deck
  // bar's LOCAL state (PreviewActionBar's ProposedGraphModal), NOT on the
  // editor preview. Unsigned decisionNeeded terms therefore REFUSE the chat
  // Apply visibly ("N ontology terms need sign-off in the changes panel");
  // the scientist signs off in the changes panel and commits through the
  // bar's Accept (the path the sign-off flow was built for). Never silently
  // materialize.
  const onPreviewAccept = (preview: HookDeckPreviewLike) =>
    // The core's DeckAdoptionResult is structurally a DeckAdoptionOutcome;
    // the cast names the one-way relationship (shared/hooks never imports
    // event-editor, so the types are declared independently).
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

  // L2-SUITE-A-uifix1 D1 (+ F4 fix1): a deck_layout done is MOUNTED through
  // the SAME native editor actions the manual deck bar uses (setPlatform +
  // setVariant) — the universal done arm (useAiChat) has no deck of its own,
  // so it hands the delivered layout to this surface. The client guards the
  // variant against the platform manifest: the server validates loosely, the
  // deck must not switch to a variant the manifest does not declare.
  // Returns whether the layout was ACCEPTED: the done arm gates the
  // empty-success bubble on the mount SUCCEEDING, not on this seam being
  // registered (a refused mount must not suppress the bubble — the deck
  // did not change).
  // A plain function (never memoized): it must see the LATEST editor state at
  // the moment the done lands, and useAiChat always invokes the current
  // closure through a ref (same convention as onProposalDrafted).
  const onDeckLayout = (deckLayout: { platformId: string; variantId: string }): boolean => {
    const platform = getPlatformManifest(state.platforms, deckLayout.platformId)
    if (!platform) return false
    const variant = getVariantManifest(state.platforms, deckLayout.platformId, deckLayout.variantId)
    if (!variant) return false
    // Platform-first: the action family is platform-first so a cross-platform
    // deck switch also works (set_platform resets to the platform default,
    // then set_variant applies the delivered one). Same-platform turns pay
    // for the no-op first dispatch (the reducer short-circuits it).
    actions.setPlatform(deckLayout.platformId)
    actions.setVariant(deckLayout.variantId)
    return true
  }

  useSurfaceChat({
    aiContext,
    endpoint: 'event-editor',
    // L2-THREAD-SCOPED-1 (SUITEA-D3 amendment A-1, review D1 wiring): the
    // deck's INSTANCE identity is the thread scope — one thread per
    // (tab, deck). An unsaved deck (no eventGraphId) sends no scope and
    // lives under the server's reserved "_" segment (amendment edge (i)).
    ...(state.eventGraphId ? { scope: state.eventGraphId } : {}),
    onAcceptEvent: actions.appendEvent,
    // L2-CHAT-1: event-bearing proposals mount deck ghosts; a chat discard
    // clears the preview (the hook's discard seam is a no-op — adoption is
    // the deck's PreviewActionBar's job — so the clear rides the editor).
    onProposalDrafted,
    onDeckLayout,
    onPreviewDiscarded: () => {
      onPreviewDiscarded()
      actions.clearPreview()
    },
    // L2-CHAT-1 FIX3 D1: the full adoption seam (the chat Apply adopts
    // through the shared core — one adopter with the deck bar).
    onPreviewAccept,
    // L2-CHAT-1 FIX3 D1+D3: the staged EXTRAS on the editor's preview —
    // the adoption commit needs them (D1) and a revise turn's
    // draftRevision carries them back to the server (D3, legacy parity).
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
