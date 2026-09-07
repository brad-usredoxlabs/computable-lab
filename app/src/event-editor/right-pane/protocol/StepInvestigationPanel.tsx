/**
 * StepInvestigationPanel — the run-editor surface for a single protocol STEP.
 *
 * MODEL: a step is a human CONCEPT ("wash the media off the cells") and its
 * sub-graph is the concrete REALIZATION (the specific events that actualize
 * it). This panel shows the concept and four realization actions:
 *   - Draft with AI   — inline chat that realizes the concept into a ghost
 *   - Edit by hand    — keep the deck live and compose the realization manually
 *   - Revise          — the feedback loop: "close, but use a deepwell, not 96-well"
 *   - Accept / Discard — commit or clear the ghost realization
 *
 * Inline chat stays IN this tab (not a hop to the AI tab). Past steps dim and
 * the focused step highlights via ProtocolSelectionContext/ProtocolPreviewBridge.
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
import type { AssistDraftResult } from '../ai/assistStream'
import type { AiLabwareAddition, AiLabwareRequirement } from '../../../types/ai'
import type { PlateEvent } from '../../../types/events'
import './StepInvestigationPanel.css'

/** Stable surface id the backend can use to fork the agent prompt. */
export const PROTOCOL_LOCALIZE_SURFACE = 'protocol-step-localization'

/** Plate-setting rows declared on the run's local protocol (read-only context). */
export interface LocalProtocolSetupRows {
  labwares?: Array<Record<string, unknown>>
  equipment?: Array<Record<string, unknown>>
  materials?: Array<Record<string, unknown>>
}

export interface StepShape {
  stepId: string
  label: string
  ordinal?: number
  description?: string
}

export interface StepInvestigationPanelProps {
  runId: string
  /** The step CONCEPT: id + human label (a noun, e.g. "Wash the cells"). */
  step: StepShape
  /**
   * Full long-form step text, sent as context so the AI knows the concept.
   * Often a split-human-steps section or the step's long description.
   */
  stepText?: string
  /** Plate-setting sections from the run's local protocol (AI context). */
  localProtocolSetup?: LocalProtocolSetupRows
  /** Focus this step's realization on the deck (setFocusedStep). */
  onFocusStep?: (step: { stepId: string; label: string; ordinal?: number } | null) => void
  /** Accepted protocols a step can realize by reference (the riff's best answer:
   *  "for this assay, use HepRG — reference our cell protocol"). Each is a
   *  {id, title} summary the picker renders; commit writes subGraphRef → protocol. */
  availableProtocolRefs?: Array<{ id: string; title: string; type?: 'protocol' | 'local-protocol' }>
  /** Commit the step's realization as a reference to an existing protocol. */
  onCommitStepRef?: (ref: { kind: 'record'; type: 'protocol' | 'local-protocol'; id: string }) => void
  /** Commit the focused step's realization (events + labware map). Caller persists. */
  onSaveRealization?: (events: Record<string, unknown>[], labwares: Record<string, unknown>) => void
}

export function StepInvestigationPanel({
  runId,
  step,
  stepText,
  localProtocolSetup,
  onFocusStep,
  availableProtocolRefs,
  onCommitStepRef,
  onSaveRealization,
}: StepInvestigationPanelProps) {
  const ws = useWorkspace()
  const editor = useOptionalEventEditor()
  const editorState = editor?.state ?? null

  // Realization actions + feedback loop state.
  const [mode, setMode] = useState<'idle' | 'ai' | 'manual'>('idle')
  const [refPickerOpen, setRefPickerOpen] = useState(false)
  const [lastInstruction, setLastInstruction] = useState<string | null>(null)
  const [whatToDoDifferently, setWhatToDoDifferently] = useState('')
  const [revisionCount, setRevisionCount] = useState(0)

  // Minimal deck scope for placement validation (mirror AiTabPanel).
  const activeDeckScope = useMemo(() => {
    if (!editorState) return undefined
    const variant = getVariantManifest(editorState.platforms, editorState.platformId, editorState.variantId)
    if (!variant) return undefined
    const surfaces = [
      ...(variant.slots.length > 0 ? ['slot' as const] : []),
      ...(variant.surface || variant.sideLawn ? ['lawn' as const] : []),
    ]
    if (!surfaces.length) return undefined
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
    }
  }, [editorState])

  // The step concept + its full text are carried to the model.
  const protocolStepContext = useMemo(
    () => ({
      runId,
      stepId: step.stepId,
      stepLabel: step.label,
      ...(stepText ? { fullStepText: stepText } : {}),
    }),
    [runId, step.stepId, step.label, stepText],
  )

  // Compact AiContext: study + accepted-graph projection + step context.
  const context = useMemo(() => {
    const variant = editorState
      ? getVariantManifest(editorState.platforms, editorState.platformId, editorState.variantId)
      : null
    const deckAllowedSurfaces = variant
      ? [...(variant.slots.length > 0 ? ['slot' as const] : []), ...(variant.surface || variant.sideLawn ? ['lawn' as const] : [])]
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
      const hasPreview = preview.previewPlacements.length > 0 || preview.previewEvents.length > 0
      if (!hasPreview) return
      const previousPreview = state.preview
      const revisionHistory = previousPreview
        ? [...(previousPreview.revisionHistory ?? []), { prompt, createdAt: new Date().toISOString() }]
        : undefined
      actions.setPreview({
        ...preview,
        sourcePrompt: prompt,
        labwareRequirements: [...labwareRequirements],
        labwareAdditions: [...labwareAdditions],
        ...(skips.length > 0 ? { sourceSkips: skips } : {}),
        ...(revisionHistory ? { revisionHistory } : {}),
      })
    },
    [activeDeckScope, editor],
  )

  const chat = useChatThread({ surface: PROTOCOL_LOCALIZE_SURFACE, context, onDraftResult })

  const previewActive = Boolean(
    editorState?.preview &&
      (editorState.preview.previewPlacements.length > 0 || editorState.preview.previewEvents.length > 0),
  )

  const handleLocalize = useCallback(
    (instruction: string) => {
      setLastInstruction(instruction)
      const composed = composeFullLocalizePrompt({ step, titleText: step.label, fullText: stepText, instruction })
      void chat.send(composed, {
        enableThinking: false,
        protocolStepContext: {
          stepId: step.stepId,
          stepLabel: step.label,
          highlightedSection: stepText || '',
          selectedText: instruction,
        },
      })
      setMode('ai')
    },
    [chat, step, stepText],
  )

  const handleRevise = useCallback(() => {
    if (!whatToDoDifferently.trim()) return
    const correction = whatToDoDifferently
    setWhatToDoDifferently('')
    const base = lastInstruction ?? ''
    const redraftPrompt = composeFullLocalizePrompt({
      step,
      titleText: step.label,
      fullText: stepText,
      instruction: `${base}${base ? '\n' : ''}Correction: ${correction}`,
    })
    void chat.send(redraftPrompt, {
      enableThinking: false,
      protocolStepContext: {
        stepId: step.stepId,
        stepLabel: step.label,
        highlightedSection: stepText || '',
        selectedText: correction,
      },
    })
    setRevisionCount((n) => n + 1)
  }, [chat, step, stepText, lastInstruction, whatToDoDifferently])

  const handleAccept = useCallback(() => {
    if (!editor) return
    const { state, actions } = editor
    const committedEvents = [...state.events, ...(state.preview?.previewEvents ?? [])] as unknown as Record<string, unknown>[]
    const committedLabwares = { ...state.labwares, ...(state.preview?.previewLabwares ?? {}) } as Record<string, unknown>
    actions.commitPreview()
    onSaveRealization?.(committedEvents, committedLabwares)
    setRevisionCount(0)
  }, [editor, onSaveRealization])

  const handleDiscard = useCallback(() => {
    editor?.actions.clearPreview()
    setRevisionCount(0)
  }, [editor])

  const handleManualSave = useCallback(() => {
    if (!editor) return
    const events = [...editor.state.events] as unknown as Record<string, unknown>[]
    const labwares = { ...editor.state.labwares } as Record<string, unknown>
    onSaveRealization?.(events, labwares)
  }, [editor, onSaveRealization])

  const conceptTitle = `STEP ${step.ordinal ?? '?'}: ${step.label}`

  return (
    <div className="step-investigation-panel" data-testid="step-investigation-panel">
      <header className="step-investigation-panel__head">
        <span className="step-investigation-panel__concept" data-testid="step-investigate-concept">
          {conceptTitle}
        </span>
        <span className="step-investigation-panel__model-hint">concept → realize in a sub-graph</span>
      </header>

      <div className="step-investigation-panel__actions">
        <button
          type="button"
          className="step-investigation-panel__btn"
          data-testid="step-investigate-draft-ai"
          onClick={() => setMode(mode === 'ai' ? 'idle' : 'ai')}
        >
          {mode === 'ai' ? 'Hide AI' : 'Draft with AI'}
        </button>
        <button
          type="button"
          className="step-investigation-panel__btn"
          data-testid="step-investigate-edit-hand"
          onClick={() => setMode(mode === 'manual' ? 'idle' : 'manual')}
        >
          {mode === 'manual' ? 'Exit manual' : 'Edit events by hand'}
        </button>
        {availableProtocolRefs && availableProtocolRefs.length > 0 ? (
          <button
            type="button"
            className="step-investigation-panel__btn"
            data-testid="step-investigate-ref-protocol"
            onClick={() => setRefPickerOpen(!refPickerOpen)}
            title="Realize this step by referencing an existing protocol"
          >
            {refPickerOpen ? 'Close reference' : 'Reference a protocol'}
          </button>
        ) : null}
        <button
          type="button"
          className="step-investigation-panel__btn"
          data-testid="step-investigate-focus-on"
          onClick={() => onFocusStep?.({ stepId: step.stepId, label: step.label, ordinal: step.ordinal })}
          title="Isolate this step's realization on the deck"
        >
          Investigate on deck
        </button>
      </div>

      {/* Inline AI chat — stays in THIS tab, revealed by "Draft with AI". */}
      {mode === 'ai' ? (
        <ChatInput
          isStreaming={chat.isStreaming}
          onSend={handleLocalize}
          onStop={chat.stop}
          sendLabel={previewActive ? 'Revise' : 'Realize step'}
          placeholder="e.g. wash the media off the cells — 8-channel pipette, aspirate, dispense 200 µL PBS, shake 30 s, aspirate"
        />
      ) : null}

      {/* Manual-edit mode: deck stays live; user composes the realization. */}
      {mode === 'manual' ? (
        <div className="step-investigation-panel__manual" data-testid="step-investigate-manual">
          <p className="step-investigation-panel__manual-hint">
            Build this step's realization on the deck (add events / labware). Events you add now realize
            <strong> {step.label}</strong> — the Step indicator shows which concept you're populating.
          </p>
          <button
            type="button"
            className="step-investigation-panel__btn"
            data-testid="step-investigate-manual-save"
            onClick={handleManualSave}
          >
            Save step
          </button>
        </div>
      ) : null}

      {/* Reference a protocol picker: realize this step by pointing at an
          existing protocol (the riff's best answer). Writes subGraphRef →
          protocol / local-protocol, so the step's localization is a reference. */}
      {refPickerOpen && availableProtocolRefs ? (
        <div className="step-investigation-panel__refpicker" data-testid="step-investigate-refpicker">
          <p className="step-investigation-panel__refpicker-hint">
            Realize <strong>{step.label}</strong> by referencing an existing protocol — e.g. "use our cell culture"
            for a growth step. The referenced protocol becomes this step's realization.
          </p>
          <ul className="step-investigation-panel__refpicker-list">
            {availableProtocolRefs.map((ref) => (
              <li key={ref.id}>
                <button
                  type="button"
                  className="step-investigation-panel__btn"
                  onClick={() => {
                    onCommitStepRef?.({ kind: 'record', type: ref.type ?? 'protocol', id: ref.id })
                    setRefPickerOpen(false)
                  }}
                >
                  {ref.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Ghost preview: feedback loop — revise the realization, then Accept/Discard. */}
      {previewActive ? (
        <div className="step-investigation-panel__revise" data-testid="step-investigate-revise">
          <div className="step-investigation-panel__revise-head">
            <span className="step-investigation-panel__revise-status">
              {revisionCount > 0 ? `Revising (revision ${revisionCount})` : 'AI drafted a realization'}
            </span>
            <span className="step-investigation-panel__revise-hint">
              — describe a change and press Revise, or Accept / Discard on the deck.
            </span>
          </div>
          <textarea
            data-testid="step-investigate-revise-input"
            placeholder="e.g. use a deepwell plate, not the 96-well"
            rows={2}
            value={whatToDoDifferently}
            onChange={(e) => setWhatToDoDifferently(e.target.value)}
          />
          <button
            type="button"
            className="step-investigation-panel__btn"
            data-testid="step-investigate-revise-btn"
            disabled={!whatToDoDifferently.trim() || chat.isStreaming}
            onClick={handleRevise}
          >
            {chat.isStreaming ? 'Re-Drafting…' : 'Revise'}
          </button>
          <div className="step-investigation-panel__resolve">
            <button
              type="button"
              className="step-investigation-panel__btn step-investigation-panel__btn--primary"
              data-testid="step-investigate-accept"
              disabled={!previewActive}
              onClick={handleAccept}
            >
              Accept
            </button>
            <button
              type="button"
              className="step-investigation-panel__btn"
              data-testid="step-investigate-discard"
              disabled={!previewActive}
              onClick={handleDiscard}
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}