/**
 * useDeckGhostMount — the universal GHOST MOUNT seam (L2-CHAT-1).
 *
 * A surface whose chat registers with `useSurfaceChat`/`useAiChat` can hand
 * the returned callbacks to `onProposalDrafted` / `onPreviewDiscarded`: an
 * event-bearing proposal the universal chat staged is MOUNTED AS GHOSTS on
 * the editor state through `buildPreviewFromDraft` — the same setPreview
 * contract AiTabPanel's onDraftResult uses (AiTabPanel.tsx:608-669): events
 * ghosted, a placement per resolved labware offer, and the revision trail
 * appended so the deck review modal shows the draft chain. Discard clears
 * the ghosts.
 *
 * Ported verbatim from DeckSurfaceChat (2026-10-26) so the /deck/:id route
 * and the run workspace (RunWorkspacePage) share ONE implementation — the
 * spec's "one chat, one event/ghost path".
 */
import { useMemo } from 'react'
import { useEventEditor } from '../EventEditorContext'
import type { AiProposalDraft } from '../../agent/useSurfaceChat'
import { buildPreviewFromDraft } from '../right-pane/ai/draftPreview'
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'

export interface DeckGhostMount {
  /** Wire as useAiChat/useSurfaceChat `onProposalDrafted`. */
  onProposalDrafted: (draft: AiProposalDraft) => void
  /** Wire as useAiChat/useSurfaceChat `onPreviewDiscarded`. */
  onPreviewDiscarded: () => void
}

export function useDeckGhostMount(): DeckGhostMount {
  const { state, actions } = useEventEditor()

  // The deck scope the ghost mount validates against (ported from
  // AiTabPanel.tsx:195-216 — the SAME rule: locked when a runId is present,
  // allowed surfaces from the variant, non-trash reachable slots). Without it
  // a locked run deck would scope-violate or misplace resolved offers.
  const activeDeckScope = useMemo(() => {
    const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)
    if (!variant) return undefined
    const surfaces = [
      ...(variant.slots.length > 0 ? ['slot' as const] : []),
      ...(variant.surface || variant.sideLawn ? ['lawn' as const] : []),
    ]
    if (!surfaces.length) return undefined
    const placement = state.focusPlacementId
      ? state.placements.find((p) => p.placementId === state.focusPlacementId) ?? null
      : null
    const allowedSlots = variant.slots
      .filter((slot) => slot.kind !== 'trash' && slot.kind !== 'special' && slot.reachable !== false)
      .map((slot) => slot.id)
    return {
      locked: Boolean(state.runId),
      ...(state.runId ? { runId: state.runId } : {}),
      platformId: state.platformId,
      variantId: state.variantId,
      allowedSurfaces: surfaces,
      allowedSlots,
      allowedLabwareIds: Object.keys(state.labwares),
      ...(placement?.labwareId ? { focusedLabwareId: placement.labwareId } : {}),
    }
  }, [state])

  // A plain function (never memoized): it must see the LATEST editor state at
  // the moment the draft lands, and useAiChat always invokes the current
  // closure through a ref.
  const onProposalDrafted = (draft: AiProposalDraft) => {
    const platform = getPlatformManifest(state.platforms, state.platformId)
    const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)
    const { preview, skips } = buildPreviewFromDraft({
      platform,
      variant,
      events: draft.events,
      labwareAdditions: draft.labwareAdditions,
      labwareRequirements: [],
      resolvedLabwares: draft.resolvedLabwares,
      equipmentRequirements: [],
      recordCreations: [],
      activeDeckScope,
      existingLabwares: state.labwares,
      existingPlacements: state.placements,
    })
    if (preview.previewPlacements.length === 0 && preview.previewEvents.length === 0) return
    // A follow-up draft while a preview is mounted is a revision: replace the
    // ghosts and append to the revision trail (the deck review modal's chain).
    const previousPreview = state.preview
    const revisionHistory = previousPreview
      ? [
          ...(previousPreview.revisionHistory ?? []),
          { prompt: draft.prompt, createdAt: new Date().toISOString() },
        ]
      : undefined
    actions.setPreview({
      ...preview,
      sourcePrompt: draft.prompt,
      labwareAdditions: [...draft.labwareAdditions],
      ...(skips.length > 0 ? { sourceSkips: skips } : {}),
      ...(revisionHistory ? { revisionHistory } : {}),
    })
  }

  return {
    onProposalDrafted,
    onPreviewDiscarded: actions.clearPreview,
  }
}
