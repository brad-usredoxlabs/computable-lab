/**
 * ProtocolLocalizationThread — the CHAT-FIRST one-shot localization surface.
 *
 * The user pastes/loads a universal protocol, clicks Localize. The small model
 * reads it, asks high-level branch questions (emit_branch_questions), the user
 * answers them inline, and the model emits a ONE-SHOT LOCAL MACRO
 * (scientist-intent) which the deterministic compiler ghosts as the FULL event
 * graph onto the deck. The user then browses the steps and refines them in this
 * same thread (per-step `Correction:` re-drafts that fold back into the macro).
 * On Accept, the graph commits, a local-protocol is persisted, and the WHOLE
 * accepted flow + final macro is posted to the corpus moat (THE MOAT) to train
 * the small model to emit correct macros.
 *
 * No new streaming machinery — reuses the existing preview/commit actions on
 * EventEditorContext and the apiClient methods.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useOptionalEventEditor } from '../../EventEditorContext'
import { buildPreviewFromDraft } from '../ai/draftPreview'
import { getPlatformManifest, getVariantManifest } from '../../../shared/lib/platformRegistry'
import { apiClient } from '../../../shared/api/client'
import type { PlateEvent } from '../../../types/events'
import type { AiLabwareAddition, AiLabwareRequirement } from '../../../types/ai'

export interface BranchQuestionAxis {
  axisId: string
  question: string
  choices: Array<{ value: string; label: string }>
}

export interface LocalMacro {
  intentId?: string
  actions?: unknown[]
  [key: string]: unknown
}

export interface ProtocolLocalizationThreadProps {
  runId?: string
  /** Initial universal protocol text (e.g. selected from a record). */
  initialProtocolText?: string
  /** Source universal protocol record id (persisted on accept). */
  sourceProtocolId?: string
  sourceTitle?: string
  /** Optional project filing links for the accepted local-protocol. */
  links?: { studyId?: string; experimentId?: string; runId?: string }
}

export function ProtocolLocalizationThread(props: ProtocolLocalizationThreadProps) {
  const { initialProtocolText = '', sourceProtocolId, sourceTitle, links } = props
  const editor = useOptionalEventEditor()

  const [protocolText, setProtocolText] = useState(initialProtocolText)
  const [axes, setAxes] = useState<BranchQuestionAxis[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [needsAnswers, setNeedsAnswers] = useState(false)
  const [localMacro, setLocalMacro] = useState<LocalMacro | null>(null)
  const [corrections, setCorrections] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [localizing, setLocalizing] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const firstUserPrompt = useRef<string>(initialProtocolText.trim())

  // Keep protocolText in sync with a late-arriving initialProtocolText (the
  // universal protocol's humanStepsText loads async and lands after mount).
  useEffect(() => {
    if (protocolText.trim()) return
    if (!initialProtocolText.trim()) return
    setProtocolText(initialProtocolText.trim())
    firstUserPrompt.current = initialProtocolText.trim()
  }, [initialProtocolText, protocolText])

  const editorState = editor?.state ?? null

  // Minimal deck scope for preview (mirror StepLocalizationPane).
  const activeDeckScope = useCallback(() => {
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
    return {
      locked: Boolean(editorState.runId),
      ...(editorState.runId ? { runId: editorState.runId } : {}),
      platformId: editorState.platformId,
      variantId: editorState.variantId,
      allowedSurfaces: surfaces,
      allowedSlots: variant.slots
        .filter((s) => s.kind !== 'trash' && s.kind !== 'special' && s.reachable !== false)
        .map((s) => s.id),
      allowedLabwareIds: Object.keys(editorState.labwares),
    }
  }, [editorState])

  // Ghost the compiled one-shot events onto the deck.
  const ghostEvents = useCallback((terminalArtifacts: Record<string, unknown>) => {
    if (!editor) return
    const { state, actions } = editor
    const events = (terminalArtifacts.events ?? []) as PlateEvent[]
    const labwareAdditions = (terminalArtifacts.labwareAdditions ?? []) as AiLabwareAddition[]
    const labwareRequirements = (terminalArtifacts.labwareRequirements ?? []) as AiLabwareRequirement[]
    const platform = getPlatformManifest(state.platforms, state.platformId)
    const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)
    const { preview } = buildPreviewFromDraft({
      platform,
      variant,
      events,
      labwareAdditions,
      labwareRequirements,
      existingLabwares: state.labwares,
      existingPlacements: state.placements,
      activeDeckScope: activeDeckScope(),
    })
    const hasPreview =
      preview.previewPlacements.length > 0 || preview.previewEvents.length > 0
    if (!hasPreview) return
    actions.setPreview({
      ...preview,
      sourcePrompt: 'one-shot localized draft',
      labwareRequirements,
      labwareAdditions,
    })
  }, [editor, activeDeckScope])

  const handleLocalize = useCallback(async () => {
    const text = protocolText.trim()
    if (!text) { setMessage('Paste a universal protocol to localize.'); return }
    setLocalizing(true)
    setMessage(null)
    firstUserPrompt.current = text
    try {
      const res = await apiClient.intentCompileFromPrompt({ protocolText: text, sourceProtocolId })
      if (res.needsAnswers) {
        setAxes(res.axes ?? [])
        setNeedsAnswers(true)
        setAnswers({})
        setLocalMacro(null)
        setMessage('Answer the branch questions to localize.')
      } else if (res.localMacro && res.terminalArtifacts) {
        setNeedsAnswers(false)
        setLocalMacro(res.localMacro as LocalMacro)
        ghostEvents(res.terminalArtifacts)
        setMessage(`One-shot localized: ${res.outcome} — draft ghosted (${(res.terminalArtifacts.events as unknown[])?.length ?? 0} events).`)
      } else {
        setMessage('One-shot returned no draft.')
      }
    } catch (err) {
      setMessage(`Localize failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLocalizing(false)
    }
  }, [protocolText, sourceProtocolId, ghostEvents])

  // Task 1/Point 3 — when a universal protocol is attached (sourceProtocolId +
  // text present), AUTO-RUN the branch-question extraction so the if/then
  // branches are asked BEFORE the user lands on raw "a. If ... b. If ..." steps.
  // Runs once per source protocol so later reloads don't re-ask.
  const autoAskedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!sourceProtocolId || !protocolText.trim()) return
    if (autoAskedRef.current === sourceProtocolId) return
    autoAskedRef.current = sourceProtocolId
    void handleLocalize()
  }, [sourceProtocolId, protocolText, handleLocalize])

  const handleAnswerAxis = useCallback((axisId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [axisId]: value }))
  }, [])

  const handleSubmitAnswers = useCallback(async () => {
    setLocalizing(true)
    setMessage(null)
    try {
      const res = await apiClient.intentCompileFromPrompt({
        protocolText: protocolText.trim(),
        sourceProtocolId,
        answers,
      })
      if (res.localMacro && res.terminalArtifacts) {
        setNeedsAnswers(false)
        setLocalMacro(res.localMacro as LocalMacro)
        ghostEvents(res.terminalArtifacts)
        setMessage(`One-shot localized: ${res.outcome} — draft ghosted.`)
      } else {
        setMessage('One-shot returned no draft after answers.')
      }
    } catch (err) {
      setMessage(`Localize failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLocalizing(false)
    }
  }, [protocolText, sourceProtocolId, answers, ghostEvents])

  // Per-step / whole-macro refinement: append a Correction, re-localize with
  // the correction (Q6: refinements fold into the final macro).
  const handleSendCorrection = useCallback(async () => {
    const text = input.trim()
    if (!text) return
    const correctedText = `${protocolText.trim()}\n\nCorrection (agreed): ${text}`
    setCorrections((prev) => [...prev, text])
    setInput('')
    setLocalizing(true)
    setMessage(null)
    try {
      const res = await apiClient.intentCompileFromPrompt({
        protocolText: correctedText,
        sourceProtocolId,
        answers,
      })
      if (res.localMacro && res.terminalArtifacts) {
        setLocalMacro(res.localMacro as LocalMacro)
        ghostEvents(res.terminalArtifacts)
        setMessage('Revised — corrections folded into the macro.')
      } else {
        setMessage('No revised draft.')
      }
    } catch (err) {
      setMessage(`Revision failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLocalizing(false)
    }
  }, [input, protocolText, sourceProtocolId, answers, ghostEvents])

  // Accept: commit the graph + persist local-protocol + post the macro-focused
  // training pair to the moat.
  const handleAccept = useCallback(async () => {
    if (!localMacro || !editor) return
    setAccepting(true)
    setMessage(null)
    const { state, actions } = editor
    const acceptedEvents = [
      ...state.events,
      ...(state.preview?.previewEvents ?? []),
    ] as unknown[]
    actions.commitPreview()
    const acceptedGraph = { events: acceptedEvents, labwares: state.labwares }
    try {
      // 1) persist local-protocol
      const acceptRes = await apiClient.intentAccept({
        sourceProtocolId: sourceProtocolId ?? '',
        sourceTitle,
        ...(localMacro.intentId ? { title: (sourceTitle ? `${sourceTitle}: ` : '') + localMacro.intentId } : {}),
        localMacro,
        answers,
        ...(links ? { links } : {}),
      })
      // 2) post the whole accepted flow + FINAL macro to the moat
      if (acceptRes.recordId) {
        await apiClient.intentTrainingPair({
          userPrompt: firstUserPrompt.current,
          thread: corrections.map((c) => ({ role: 'user', content: c })),
          sourceProtocolId,
          acceptedProtocolId: acceptRes.recordId,
          acceptedGraph,
          localMacro,
          confirmedAt: new Date().toISOString(),
        })
        setMessage('Accepted — protocol saved and added to training corpus.')
      } else {
        setMessage('Accepted on deck, but local-protocol save failed.')
      }
    } catch (err) {
      setMessage(`Accept failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAccepting(false)
    }
  }, [localMacro, editor, sourceProtocolId, sourceTitle, answers, corrections, links])

  const hasPreview = Boolean(
    editorState?.preview &&
      (editorState.preview.previewPlacements.length > 0 ||
        editorState.preview.previewEvents.length > 0),
  )

  return (
    <div className="protocol-localization-thread" data-testid="protocol-localization-thread">
      <div className="protocol-localization-thread__head">
        <span>Localize a universal protocol in chat (one-shot)</span>
      </div>

      <label className="protocol-localization-thread__label">Universal protocol text</label>
      <textarea
        data-testid="pl-protocol-text"
        rows={4}
        value={protocolText}
        onChange={(e) => setProtocolText(e.target.value)}
        placeholder="Paste the universal protocol text to localize…"
      />

      <button
        type="button"
        data-testid="pl-localize-btn"
        disabled={localizing || !protocolText.trim()}
        onClick={() => { void handleLocalize() }}
      >
        {localizing ? 'Localizing…' : 'Localize (one-shot)'}
      </button>

      {needsAnswers && axes.length > 0 ? (
        <div className="protocol-localization-thread__clarify" data-testid="pl-clarify">
          <p>Answer to localize:</p>
          {axes.map((axis) => (
            <div key={axis.axisId} className="pl-axis">
              <span className="pl-axis__q">{axis.question}</span>
              <div className="pl-axis__choices">
                {axis.choices.map((choice) => (
                  <label key={choice.value} className="pl-axis__choice">
                    <input
                      type="radio"
                      name={axis.axisId}
                      checked={answers[axis.axisId] === choice.value}
                      onChange={() => handleAnswerAxis(axis.axisId, choice.value)}
                    />
                    <span>{choice.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            data-testid="pl-submit-answers"
            disabled={localizing || axes.some((a) => !answers[a.axisId])}
            onClick={() => { void handleSubmitAnswers() }}
          >
            Apply &amp; compile
          </button>
        </div>
      ) : null}

      {localMacro ? (
        <div className="protocol-localization-thread__refine" data-testid="pl-refine">
          <div className="pl-macro">
            <span className="pl-macro__label">One-shot macro ({localMacro.intentId ?? 'draft'}):</span>
            <pre data-testid="pl-macro-view">{(localMacro.actions ?? []).length} actions</pre>
          </div>
          <textarea
            data-testid="pl-refine-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Correct a step, e.g. "do step 5 in the Beckman centrifuge"'
          />
          <button
            type="button"
            data-testid="pl-refine-send"
            disabled={localizing || !input.trim()}
            onClick={() => { void handleSendCorrection() }}
          >
            {localizing ? 'Revising…' : 'Refine / Re-Draft'}
          </button>
        </div>
      ) : null}

      <div className="protocol-localization-thread__actions">
        <button
          type="button"
          data-testid="pl-accept"
          disabled={accepting || !localMacro || !hasPreview}
          onClick={() => { void handleAccept() }}
        >
          {accepting ? 'Accepting…' : 'Accept &amp; Save'}
        </button>
        {message ? (
          <span className="protocol-localization-thread__msg" data-testid="pl-msg">
            {message}
          </span>
        ) : null}
      </div>
    </div>
  )
}