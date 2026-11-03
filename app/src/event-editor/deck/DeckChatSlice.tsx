/**
 * DeckChatSlice — CHATHOST-CONSOLIDATE-1: the deck slice PUBLISHER.
 *
 * It reads the event editor's live state/actions (useEventEditor) and PUBLISHES
 * the `deck` slice bundle into the SurfaceSliceStore (usePublishSurfaceSlice) —
 * the ONE collector (collectSurfaceContext) and the ONE registrar
 * (SurfaceChatBridge) then consume it. It replaces the two old per-host deck
 * per-host deck bridges (the retired deck bridge + the retired run bridge), whose useSurfaceChat call
 * is now the registrar's single call.
 *
 * The bundle carries exactly what the retired deck bridge put on the wire
 * (the buildAcceptedEventGraphProjection + the deck fields the prompt builder
 * reads) plus the ghost/adoption/deck-layout handler closures — so a deck door
 * (event-editor) and a deck-backed door (run-workspace, which was the old
 * the run door) get ONE shared deck context + ONE shared event/ghost
 * path, per the spec's "one context collector, one registrar".
 *
 * Defensive against sparse editor state (the T-3 retarget pins mock
 * useEventEditor with a minimal state): every state field the bundle reads is
 * defaulted (?? {} / ?? []), so publishing never throws on a mocked or
 * half-loaded editor. The handler closures are plain functions (never
 * memoized) so they see the latest editor state when invoked — the same
 * convention the old bridges relied on (useAiChat invokes the current closure
 * through a ref).
 */
import { useMemo } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { useDeckGhostMount } from './useDeckGhostMount'
import { adoptStagedPreview, type DeckPreviewLike } from './deckAdoption'
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import { getVerbsForDisplay } from '../../shared/vocab/registry'
import { buildAcceptedEventGraphProjection } from '../../graph/lib/acceptedEventGraphProjection'
import { usePublishSurfaceSlice, type DeckSliceBundle } from '../../shared/context/SurfaceSliceStore'
import type {
  DeckAdoptionOutcome as HookDeckAdoptionOutcome,
  DeckPreviewLike as HookDeckPreviewLike,
} from '../../shared/hooks/useAiChat'

/** The deck's appliance endpoint + posted surface (the deck thread store). */
const DECK_ENDPOINT = 'event-editor' as const
const DECK_SURFACE = 'event-editor'

export function DeckChatSlice() {
  const { state, actions } = useEventEditor()
  // The universal GHOST MOUNT seam (one event/ghost path shared by /deck and
  // the run workspace — the SAME implementation the old two bridges used).
  const { onProposalDrafted, onPreviewDiscarded } = useDeckGhostMount()

  const bundle = useMemo<DeckSliceBundle>(() => {
    // Defensive reads (sparse-mock-safe): the T-3 retarget pins mock
    // useEventEditor with a minimal state that omits labwares/equipments/
    // platforms/selection; the old bridges assumed the full real state, but the
    // publisher must never throw on a mocked editor.
    const labwares = state.labwares ?? {}
    const events = state.events ?? []
    const placements = state.placements ?? []
    const platforms = state.platforms ?? []
    const selection = state.selection

    const variant = getVariantManifest(platforms, state.platformId, state.variantId)
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
      ? placements.find((p) => p.placementId === state.focusPlacementId) ?? null
      : null

    // The SAME projection the retired deck bridge put on the wire (the
    // server's own vocabulary — field names, selection shape, well-state
    // snapshot). Guarded: the publisher must not throw on a sparse mock.
    const projection = buildAcceptedEventGraphProjection({
      labwares: new Map(Object.entries(labwares)),
      events,
      vocabPackId: state.vocabPackId ?? '',
      availableVerbs: getVerbsForDisplay(state.vocabPackId ?? '').map((v) => v.verb),
      ...(selection
        ? {
            sourceSelection: {
              labware: labwares[selection.labwareId],
              selectedWells: selection.wells,
            },
          }
        : {}),
      deckPlatform: state.platformId,
      deckVariant: state.variantId,
      deckPlacements: placements.map((p) => ({
        slotId: p.location.kind === 'slot' ? p.location.slotId : 'lawn',
        labwareId: p.labwareId,
      })),
      ...(allowedSurfaces && allowedSurfaces.length > 0 ? { deckAllowedSurfaces: [...allowedSurfaces] } : {}),
      ...(allowedSlots && allowedSlots.length > 0 ? { deckAllowedSlots: allowedSlots } : {}),
      ...(focusedPlacement?.labwareId ? { focusedLabwareId: focusedPlacement.labwareId } : {}),
      ...(state.runId ? { runId: state.runId } : {}),
      ...(state.eventGraphId ? { eventGraphId: state.eventGraphId } : {}),
    })

    const onPreviewAccept = (preview: HookDeckPreviewLike) =>
      // The core's DeckAdoptionResult is structurally a DeckAdoptionOutcome;
      // the cast names the one-way relationship (shared/hooks never imports
      // event-editor, so the types are declared independently). termDecisions:
      // {} on purpose — sign-off decisions live in the deck bar's LOCAL state,
      // so unsigned decisionNeeded terms REFUSE the chat Apply visibly.
      adoptStagedPreview(
        preview as unknown as DeckPreviewLike,
        {
          eventGraphId: state.eventGraphId,
          runId: state.runId,
          ...(state.platformId ? { platformId: state.platformId } : {}),
          ...(state.variantId ? { variantId: state.variantId } : {}),
          events,
          labwares,
          equipments: state.equipments ?? {},
          placements,
        },
        {
          termDecisions: {},
          commit: (previewEvents, persisted) =>
            actions.commitPreview(previewEvents, persisted.eventGraphId, persisted.commit),
        },
      ) as Promise<HookDeckAdoptionOutcome>

    // A plain function (never memoized): it must see the LATEST editor state at
    // the moment the done lands (useAiChat invokes the current closure via a ref).
    const onDeckLayout = (deckLayout: { platformId: string; variantId: string }): boolean => {
      const platform = getPlatformManifest(platforms, deckLayout.platformId)
      if (!platform) return false
      const v = getVariantManifest(platforms, deckLayout.platformId, deckLayout.variantId)
      if (!v) return false
      // Platform-first: cross-platform deck switches work (set_platform resets
      // to the platform default, then set_variant applies the delivered one).
      actions.setPlatform(deckLayout.platformId)
      actions.setVariant(deckLayout.variantId)
      return true
    }

    return {
      endpoint: DECK_ENDPOINT,
      surface: DECK_SURFACE,
      summary: `Deck ${state.eventGraphId ?? '(unsaved)'} — ${state.platformId} / ${state.variantId}`,
      // The editor mode the deck posts (top-level AiContext field the server's
      // systemPrompt reads) — the retired deck bridge posted 'deck'.
      editorMode: 'deck',
      ...(state.eventGraphId ? { scope: state.eventGraphId } : {}),
      // The deck's working focus (the pane's SurfaceFocusHeader box) — the
      // SAME derivation the retired deck bridge published: label =
      // `Deck <eventGraphId>`, detail = `platform · variant · N wells` (the
      // deck's layout/selection, NOT the run door's protocol step). The
      // registrar publishes this ONLY for the deck door (the collector's
      // deckSurfaceWins signal), so the run door keeps its step focus.
      focus: (() => {
        const label = state.eventGraphId ? `Deck ${state.eventGraphId}` : 'Deck (unsaved)'
        const wellCount = selection?.wells?.length
        const selectionLabel = wellCount
          ? `${wellCount} well${wellCount === 1 ? '' : 's'} selected`
          : null
        const detail = [state.platformId, state.variantId, selectionLabel]
          .filter(Boolean)
          .join(' · ')
        return { label, ...(detail ? { detail } : {}) }
      })(),
      contextPatch: {
        ...projection,
        eventGraphId: state.eventGraphId,
        runId: state.runId,
        platformId: state.platformId,
        variantId: state.variantId,
        vocabPackId: state.vocabPackId,
        placementCount: placements.length,
        eventCount: events.length,
        // Object form on purpose: the projection's array form loses WHICH labware
        // the wells belong to, and the server prints "Labware: <id>, A1, ..."
        // only for the object form. `wells` stays an ARRAY (the server reads
        // `.length`; an absent value crashed a turn).
        selectedWells: selection
          ? { labwareId: selection.labwareId, wells: selection.wells ?? [] }
          : null,
      },
      handlers: {
        onAcceptEvent: actions.appendEvent,
        onProposalDrafted,
        // A chat discard clears the ghosts AND the editor preview (the hook's
        // discard seam is a no-op — adoption is the deck bar's job — so the
        // clear rides the editor).
        onPreviewDiscarded: () => {
          onPreviewDiscarded()
          actions.clearPreview()
        },
        onPreviewAccept,
        // The staged EXTRAS on the editor's preview — the adoption commit needs
        // them (D1) and a revise turn's draftRevision carries them back (D3).
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
        onDeckLayout,
      },
    }
    // The bundle is recreated when any editor field the context/handlers read
    // changes (the same deps the retired deck bridge memoized on), so the
    // registrar re-renders (the slice version bumps) and re-wires fresh handlers.
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
    state.equipments,
    state.preview,
    actions,
    onProposalDrafted,
    onPreviewDiscarded,
  ])

  // Publish the deck slice into the store (render-safe write + version bump on
  // identity change + clear on unmount — the registrar re-renders on the bump).
  usePublishSurfaceSlice('deck', bundle)

  return null
}
