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
 *
 * Once the user Accepts a committed graph, a "Save to corpus" button appears
 * and POSTs one anonymized (prompt → accepted graph) pair to the cl-appliance
 * Corpus Service (THE MOAT) via the server-side bridge. Save is best-effort
 * and never blocks or fails the app.
 */

import { useCallback, useMemo, useState } from 'react'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { useOptionalEventEditor } from '../../EventEditorContext'
import { getPlatformManifest, getVariantManifest } from '../../../shared/lib/platformRegistry'
import { getVerbsForDisplay } from '../../../shared/vocab/registry'
import { buildAcceptedEventGraphProjection } from '../../../graph/lib/acceptedEventGraphProjection'
import { buildPreviewFromDraft } from '../ai/draftPreview'
import { useChatThread } from '../ai/useChatThread'
import { ChatInput } from '../ai/ChatInput'
import { composeFullLocalizePrompt } from '../../../run/protocol-planning/protocolStepSelection'
import { EditableProtocolText } from '../../../run/protocol-planning/EditableProtocolText'
import { apiClient } from '../../../shared/api/client'
import type { AssistDraftResult } from '../ai/assistStream'
import type { AiLabwareAddition, AiLabwareRequirement } from '../../../types/ai'
import type { PlateEvent } from '../../../types/events'

/** Stable surface id the backend can use to fork the agent prompt. */
export const PROTOCOL_LOCALIZE_SURFACE = 'protocol-step-localization'

/**
 * Plate-setting rows declared on the run's local protocol — read-only
 * context for step localization. Mirrors the local-protocol schema shape:
 * each row is { role, description?, ref? }.
 */
export interface LocalProtocolSetupRows {
  labwares?: Array<Record<string, unknown>>
  equipment?: Array<Record<string, unknown>>
  materials?: Array<Record<string, unknown>>
}

export interface StepLocalizationPaneProps {
  runId: string
  step: { stepId: string; label: string }
  /** Full long-form step text, sent as context so the AI knows the step. */
  stepText?: string
  /**
   * Plate-setting sections (Labwares/Equipment/Materials) from the run's
   * local protocol. Rides in the assist context as `localProtocolSetup` so
   * the model localizes steps against an already-declared setup.
   */
  localProtocolSetup?: LocalProtocolSetupRows
}

export function StepLocalizationPane({ runId, step, stepText, localProtocolSetup }: StepLocalizationPaneProps) {
  const ws = useWorkspace()
  const editor = useOptionalEventEditor()
  const editorState = editor?.state ?? null

  // Editable surfaces — title and full text the user can tweak before sending.
  const [titleText, setTitleText] = useState('')
  const [fullText, setFullText] = useState(stepText ?? '')

  // Track the last accepted/committed graph + the instruction that produced it,
  // and whether the user has confirmed (accepted) that graph.
  const [lastInstruction, setLastInstruction] = useState<string | null>(null)
  const [lastComposed, setLastComposed] = useState<string | null>(null)
  const [whatToDoDifferently, setWhatToDoDifferently] = useState('')
  const [lastAcceptedGraph, setLastAcceptedGraph] = useState<{
    events: Record<string, unknown>[]
    labwares: Record<string, unknown>
  } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

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
      ...(localProtocolSetup ? { localProtocolSetup } : {}),
      ...acceptedGraphProjection,
    }
  }, [editorState, ws.state.studyId, protocolStepContext, localProtocolSetup])

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

  const handleLocalize = useCallback(
    (instruction: string) => {
      // Record the instruction so Save-to-corpus has the prompt that produced
      // the (eventually) accepted graph.
      setLastInstruction(instruction)
      const composed = composeFullLocalizePrompt({ step, titleText, fullText, instruction })
      setLastComposed(composed)
      void chat.send(composed, {
        enableThinking: false,
        protocolStepContext: {
          stepId: step.stepId,
          stepLabel: step.label,
          highlightedSection: fullText || stepText || '',
          selectedText: instruction,
        },
      })
    },
    [chat, step, titleText, fullText, stepText],
  )

  const handleRedraft = useCallback(() => {
    if (!whatToDoDifferently.trim()) return
    const correction = whatToDoDifferently
    setWhatToDoDifferently('')
    const base = lastInstruction ?? ''
    const redraftPrompt = composeFullLocalizePrompt({
      step,
      titleText,
      fullText,
      instruction: `${base}${base ? '\n' : ''}Correction: ${correction}`,
    })
    setLastComposed(redraftPrompt)
    void chat.send(redraftPrompt, { enableThinking: false })
  }, [chat, step, titleText, fullText, lastInstruction, whatToDoDifferently])

  const handleAccept = useCallback(() => {
    if (!editor) return
    const { state, actions } = editor
    // Snapshot the COMMITTED (never the preview-ghost) graph. Per
    // commit_preview reducer semantics, commit merges current state with the
    // preview's events/labwares. We persist an anonymized copy for corpus save.
    const committedEvents = [
      ...state.events,
      ...(state.preview?.previewEvents ?? []),
    ] as unknown as Record<string, unknown>[]
    const committedLabwares = {
      ...state.labwares,
      ...(state.preview?.previewLabwares ?? {}),
    } as Record<string, unknown>
    setLastAcceptedGraph({ events: committedEvents, labwares: committedLabwares })
    setConfirmed(true)
    setSaveMsg(null)
    actions.commitPreview()
  }, [editor])

  const handleDiscard = useCallback(() => {
    editor?.actions.clearPreview()
  }, [editor])

  const handleSaveToCorpus = useCallback(async () => {
    if (!lastAcceptedGraph || !lastInstruction || saving) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const entry = {
        source: 'protocol-loop' as const,
        sourceType: 'app' as const,
        prompt: {
          user: lastComposed ?? composeFullLocalizePrompt({ step, titleText, fullText, instruction: lastInstruction ?? '' }),
          step_context: {
            stepId: step.stepId,
            stepLabel: step.label,
            ...(stepText ? { stepText } : {}),
          },
        },
        acceptedGraph: {
          events: lastAcceptedGraph.events,
          labwares: Object.values(lastAcceptedGraph.labwares),
        },
        confirmedBy: 'user' as const,
      }
      const res = await apiClient.saveCorpusEntry(entry)
      setSaveMsg(res?.ok ? (res.deduped ? 'Already saved' : 'Saved to corpus') : `Not saved: ${res?.error}`)
    } catch (err) {
      setSaveMsg(`Not saved: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }, [lastAcceptedGraph, lastInstruction, lastComposed, saving, step, stepText, titleText, fullText])

  return (
    <div className="step-localization-pane" data-testid="step-localization-pane">
      <div className="step-localization-pane__head">
        <span className="step-localization-pane__title">
          Localize step {step.stepId} — {step.label} to this lab
        </span>
      </div>

      <label className="step-localization-pane__label">Step title</label>
      <EditableProtocolText
        key={'title-'+step.stepId}
        kind="title"
        initial={step.label}
        onChange={setTitleText}
        testId="sl-title"
        placeholder="Step title"
      />

      <label className="step-localization-pane__label">Full step text (edit / trim, then localize)</label>
      <EditableProtocolText
        key={'text-'+step.stepId}
        initial={stepText ?? ''}
        onChange={setFullText}
        testId="sl-text"
        placeholder="Full step text"
      />

      {chat.isStreaming ? (
        <div className="step-localization-pane__streaming">Drafting…</div>
      ) : null}

      {previewActive ? (
        <div className="step-localization-pane__popup" data-testid="sl-popup">
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

          <textarea
            data-testid="what-differently-input"
            placeholder="What to do differently? (e.g. use the 96-well plate, single-channel pipette)"
            rows={2}
            value={whatToDoDifferently}
            onChange={(e) => setWhatToDoDifferently(e.target.value)}
          />

          <button
            type="button"
            className="step-localization-pane__btn"
            data-testid="redraft-btn"
            disabled={!whatToDoDifferently.trim() || chat.isStreaming}
            onClick={handleRedraft}
          >
            {chat.isStreaming ? 'Re-Drafting…' : 'Re-Draft / Re-Try'}
          </button>
        </div>
      ) : (
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
      )}

      {confirmed && lastInstruction ? (
        <div className="step-localization-pane__corpus">
          <button
            type="button"
            className="step-localization-pane__btn step-localization-pane__btn--corpus"
            onClick={() => { void handleSaveToCorpus() }}
            disabled={saving}
            data-testid="step-localization-save"
          >
            {saving ? 'Saving…' : 'Save to corpus'}
          </button>
          {saveMsg ? (
            <span className="step-localization-pane__save-msg" data-testid="step-localization-save-msg">
              {saveMsg}
            </span>
          ) : null}
        </div>
      ) : null}

      <ChatInput
        isStreaming={chat.isStreaming}
        onSend={handleLocalize}
        onStop={chat.stop}
        sendLabel={previewActive ? 'Revise' : 'Localize Step'}
        placeholder="e.g. we only have a QuantStudio 5 — adapt the thermal steps"
      />
    </div>
  )
}
