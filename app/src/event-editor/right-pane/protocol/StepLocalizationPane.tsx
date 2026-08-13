/**
 * StepLocalizationPane — compact AI thread scoped to a single protocol step,
 * embedded in the right-pane Protocol tab (Phase D).
 *
 * The user reads the step (its full text is shown above in StepDetailPane),
 * types a plain-English explanation of HOW to localize it to THIS lab, and the
 * AI drafts the step's events onto the event graph as a ghost. Past steps are
 * dimmed and the current step highlighted (via ProtocolSelectionContext /
 * ProtocolPreviewBridge). Subsequent sends ride `draftRevision` so the user's
 * corrections revise the ghost until they Accept. Reuses the workspace AI
 * thread + draft→preview machinery (useChatThread, buildPreviewFromDraft).
 */

import { useCallback, useMemo } from 'react'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { useOptionalEventEditor } from '../../EventEditorContext'
import { getPlatformManifest, getVariantManifest } from '../../../shared/lib/platformRegistry'
import { getVerbsForDisplay } from '../../../shared/vocab/registry'
import { buildAcceptedEventGraphProjection } from '../../../graph/lib/acceptedEventGraphProjection'
import { buildPreviewFromDraft } from '../ai/draftPreview'
import { useChatThread } from '../ai/useChatThread'
import { ChatInput } from '../ai/ChatInput'
import { buildStepLocalizePrompt } from '../../../run/protocol-planning/protocolStepSelection'
import type { AssistDraftResult } from '../ai/assistStream'
import type { AiLabwareAddition, AiLabwareRequirement } from '../../../types/ai'
import type { PlateEvent } from '../../../types/events'

/** Stable surface id the backend can use to fork the agent prompt. */
export const PROTOCOL_LOCALIZE_SURFACE = 'protocol-step-localization'

export interface StepLocalizationPaneProps {
  runId: string
  step: { stepId: string; label: string }
  /** Full long-form step text, sent as context so the AI knows the step. */
  stepText?: string
}

export function StepLocalizationPane({ runId, step, stepText }: StepLocalizationPaneProps) {
  const ws = useWorkspace()
  const editor = useOptionalEventEditor()
  const editorState = editor?.state ?? null

  // Minimal deck scope for placement validation (mirror AiTabPanel).
  const activeDeckScope = useMemo(() => {
    if (!editorState) return undefined
    const variant = getVariantManifest(
      editorState.platforms,
      editorState.platformId,
      editorState.variantId,
    )
    if (!variant) return undefined
    const surfaces = [
      ...(variant.slots.length > 0 ? ['slot' as const] : []),
      ...(variant.surface || variant.sideLawn ? ['lawn' as const] : []),
    ]
    if (!surfaces.length) return undefined
    const placement = editorState.focusPlacementId
      ? editorState.placements.find((p) => p.placementId === editorState.focusPlacementId) ?? null
      : null
    const allowedSlots = variant.slots
      .filter((s) => s.kind !== 'trash' && s.kind !== 'special' && s.reachable !== false)
      .map((s) => s.id)
    return {
      locked: Boolean(editorState.runId),
      ...(editorState.runId ? { runId: editorState.runId } : {}),
      platformId: editorState.platformId,
      variantId: editorState.variantId,
      allowedSurfaces: surfaces,
      allowedSlots,
      allowedLabwareIds: Object.keys(editorState.labwares),
      ...(placement?.labwareId ? { focusedLabwareId: placement.labwareId } : {}),
    }
  }, [editorState])

  // The step + its full text are carried to the model (structured context).
  const protocolStepContext = useMemo(
    () => ({
      runId,
      stepId: step.stepId,
      stepLabel: step.label,
      ...(stepText ? { fullStepText: stepText } : {}),
    }),
    [runId, step.stepId, step.label, stepText],
  )

  // Compact AiContext: study + accepted-graph projection + step context so the
  // draft is shaped for THIS deck. Mirrors AiTabPanel's context builder.
  const context = useMemo(() => {
    const variant = editorState
      ? getVariantManifest(editorState.platforms, editorState.platformId, editorState.variantId)
      : null
    const deckAllowedSurfaces = variant
      ? [
          ...(variant.slots.length > 0 ? ['slot' as const] : []),
          ...(variant.surface || variant.sideLawn ? ['lawn' as const] : []),
        ]
      : undefined
    const deckAllowedSlots = variant?.slots
      .filter((s) => s.kind !== 'trash' && s.kind !== 'special' && s.reachable !== false)
      .map((s) => s.id)
    const acceptedGraphProjection = editorState
      ? buildAcceptedEventGraphProjection({
          labwares: new Map(Object.entries(editorState.labwares)),
          events: editorState.events,
          vocabPackId: editorState.vocabPackId,
          availableVerbs: getVerbsForDisplay(editorState.vocabPackId).map((v) => v.verb),
          ...(editorState.selection
            ? {
                sourceSelection: {
                  labware: editorState.labwares[editorState.selection.labwareId],
                  selectedWells: editorState.selection.wells,
                },
              }
            : {}),
          deckPlatform: editorState.platformId,
          deckVariant: editorState.variantId,
          deckPlacements: editorState.placements.map((p) => ({
            slotId: p.location.kind === 'slot' ? p.location.slotId : 'lawn',
            labwareId: p.labwareId,
          })),
          ...(deckAllowedSurfaces ? { deckAllowedSurfaces } : {}),
          ...(deckAllowedSlots ? { deckAllowedSlots } : {}),
          ...(editorState.runId ? { runId: editorState.runId } : {}),
          ...(editorState.eventGraphId ? { eventGraphId: editorState.eventGraphId } : {}),
        })
      : {}
    return {
      studyId: ws.state.studyId,
      activeTabKind: 'run',
      protocolStepContext,
      ...acceptedGraphProjection,
    }
  }, [editorState, ws.state.studyId, protocolStepContext])

  // Promote the draft into the editor's ghost preview (revision-aware).
  const onDraftResult = useCallback(
    (result: AssistDraftResult, prompt: string) => {
      if (!editor) return
      const { state, actions } = editor
      const events = (result.events ?? []) as PlateEvent[]
      const labwareAdditions = (result.labwareAdditions ?? []) as AiLabwareAddition[]
      const labwareRequirements = (result.labwareRequirements ?? []) as AiLabwareRequirement[]
      const platform = getPlatformManifest(state.platforms, state.platformId)
      const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)
      const { preview, skips } = buildPreviewFromDraft({
        platform,
        variant,
        events,
        labwareAdditions,
        labwareRequirements,
        existingLabwares: state.labwares,
        existingPlacements: state.placements,
        activeDeckScope,
      })
      const hasPreview =
        preview.previewPlacements.length > 0 || preview.previewEvents.length > 0
      if (!hasPreview) return
      const previousPreview = state.preview
      const revisionHistory = previousPreview
        ? [
            ...(previousPreview.revisionHistory ?? []),
            { prompt, createdAt: new Date().toISOString() },
          ]
        : undefined
      actions.setPreview({
        ...preview,
        sourcePrompt: prompt,
        labwareRequirements: [...labwareRequirements],
        labwareAdditions: [...labwareAdditions],
        ...(skips.length > 0 ? { sourceSkips: skips } : {}),
        ...(result.ontologyBindings?.length
          ? { ontologyBindings: result.ontologyBindings as never }
          : {}),
        ...(revisionHistory ? { revisionHistory } : {}),
      })
    },
    [activeDeckScope, editor],
  )

  const chat = useChatThread({
    surface: PROTOCOL_LOCALIZE_SURFACE,
    context,
    onDraftResult,
  })

  const previewActive = Boolean(
    editorState?.preview &&
      (editorState.preview.previewPlacements.length > 0 ||
        editorState.preview.previewEvents.length > 0),
  )

  const handleSend = useCallback(
    (text: string) => {
      void chat.send(buildStepLocalizePrompt(step, text), { enableThinking: false })
    },
    [chat, step],
  )

  const handleAccept = useCallback(() => {
    editor?.actions.commitPreview()
  }, [editor])

  const handleDiscard = useCallback(() => {
    editor?.actions.clearPreview()
  }, [editor])

  return (
    <div className="step-localization-pane" data-testid="step-localization-pane">
      <div className="step-localization-pane__head">
        <span className="step-localization-pane__title">
          Localize step {step.stepId} — {step.label} to this lab
        </span>
      </div>

      {chat.isStreaming ? (
        <div className="step-localization-pane__streaming">Drafting…</div>
      ) : null}

      <div className="step-localization-pane__actions">
        <button
          type="button"
          className="step-localization-pane__btn"
          onClick={handleAccept}
          disabled={!previewActive}
          data-testid="step-localization-accept"
        >
          Accept
        </button>
        <button
          type="button"
          className="step-localization-pane__btn"
          onClick={handleDiscard}
          disabled={!previewActive}
          data-testid="step-localization-discard"
        >
          Discard
        </button>
      </div>

      <ChatInput
        isStreaming={chat.isStreaming}
        onSend={handleSend}
        onStop={chat.stop}
        sendLabel={previewActive ? 'Revise' : 'Localize Step'}
        placeholder="e.g. we only have a QuantStudio 5 — adapt the thermal steps"
      />
    </div>
  )
}
