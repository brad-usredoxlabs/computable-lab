/**
 * ProtocolLocalizationThread — the CHAT-FIRST one-shot localization surface.
 *
 * The user pastes/loads a universal protocol, clicks Localize. The small model
 * reads it, asks high-level branch questions (emit_branch_questions), the user
 * answers them inline, and the model emits a ONE-SHOT LOCAL MACRO
 * (scientist-intent) which the deterministic compiler resolves into events +
 * a deck plan. BEFORE anything ghosts onto the canvas, the thread shows a
 * "Review deck & labware" step: the compiler's suggested labware (from
 * resolve_labware / plan_deck_layout) appears as a checkable list, the user can
 * pick the deck platform (unless the run deck is locked), and events ghost ONLY
 * after the user confirms "Load onto deck & ghost events". This guarantees the
 * deck is never blank when events appear for review.
 *
 * The user then browses the steps and refines them in this same thread (per-step
 * `Correction:` re-drafts that fold back into the final macro). On Accept the
 * graph commits, a local-protocol is persisted, and the WHOLE accepted flow +
 * final macro is posted to the corpus moat (THE MOAT).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useOptionalEventEditor } from '../../EventEditorContext'
import { buildPreviewFromDraft } from '../ai/draftPreview'
import { getPlatformManifest, getVariantManifest } from '../../../shared/lib/platformRegistry'
import { apiClient } from '../../../shared/api/client'
import type { PlateEvent } from '../../../types/events'
import type {
  AiLabwareAddition,
  AiLabwareRequirement,
} from '../../../types/ai'

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

/** One row in the Review-deck labware checklist. */
export interface DeckLabwareSuggestion {
  key: string
  label: string
  deckSlot?: string
  reason?: string
  requirement: boolean
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

/** Fold the compile's labwareAdditions + labwareRequirements into a review list. */
function deriveDeckLabware(terminalArtifacts: Record<string, unknown>): DeckLabwareSuggestion[] {
  const additions = (terminalArtifacts.labwareAdditions ?? []) as AiLabwareAddition[]
  const requirements = (terminalArtifacts.labwareRequirements ?? []) as AiLabwareRequirement[]
  const out: DeckLabwareSuggestion[] = []
  const seen = new Set<string>()
  for (const req of requirements) {
    if (!req?.classCurie || seen.has(req.classCurie)) continue
    seen.add(req.classCurie)
    out.push({
      key: req.classCurie,
      label: req.classCurie,
      ...(req.deckSlot ? { deckSlot: req.deckSlot } : {}),
      requirement: true,
    })
  }
  for (const add of additions) {
    if (!add?.recordId || seen.has(add.recordId)) continue
    seen.add(add.recordId)
    out.push({
      key: add.recordId,
      label: add.recordId,
      ...(add.deckSlot ? { deckSlot: add.deckSlot } : {}),
      ...(add.reason ? { reason: add.reason } : {}),
      requirement: false,
    })
  }
  return out
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
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info')

  const setErrorMsg = useCallback((m: string) => {
    setMessage(m)
    setMessageKind('error')
  }, [])
  const setInfoMsg = useCallback((m: string) => {
    setMessage(m)
    setMessageKind('info')
  }, [])

  // Review-deck gate: the compiled (not-yet-ghosted) draft + labware suggestions
  // + the chosen deck platform. Events ghost ONLY after the user confirms.
  const [pendingDraft, setPendingDraft] = useState<Record<string, unknown> | null>(null)
  const [proposedLabware, setProposedLabware] = useState<DeckLabwareSuggestion[]>([])
  const [deckPicked, setDeckPicked] = useState<Set<string>>(new Set())
  const [deckPlatform, setDeckPlatform] = useState<string>('')
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

  // Default the chosen deck platform to the editor's current platform.
  useEffect(() => {
    if (deckPlatform || !editorState?.platformId) return
    setDeckPlatform(editorState.platformId)
  }, [deckPlatform, editorState?.platformId])

  const deckLocked = editorState?.runDeckLock?.locked === true

  // Minimal deck scope for preview (mirror StepLocalizationPane). Built from an
  // explicit platform/variant so the Review-deck gate can ghost onto the deck
  // the USER chose (not just the editor's current stack).
  const activeDeckScope = useCallback((
    platformId?: string,
    variantId?: string,
  ) => {
    if (!editorState) return undefined
    const platformId_ = platformId ?? editorState.platformId
    const manifest = getPlatformManifest(editorState.platforms, platformId_)
    const variantId_ = variantId ?? (editorState.platformId === platformId_
      ? editorState.variantId
      : (manifest?.defaultVariant ?? (manifest?.variants[0]?.id ?? '')))
    const variant = getVariantManifest(editorState.platforms, platformId_, variantId_)
    if (!variant) return undefined
    const surfaces = [
      ...(variant.slots.length > 0 ? ['slot' as const] : []),
      ...(variant.surface || variant.sideLawn ? ['lawn' as const] : []),
    ]
    if (!surfaces.length) return undefined
    return {
      locked: Boolean(editorState.runId),
      ...(editorState.runId ? { runId: editorState.runId } : {}),
      platformId: platformId_,
      variantId: variantId_,
      allowedSurfaces: surfaces,
      allowedSlots: variant.slots
        .filter((s) => s.kind !== 'trash' && s.kind !== 'special' && s.reachable !== false)
        .map((s) => s.id),
      allowedLabwareIds: Object.keys(editorState.labwares),
    }
  }, [editorState])

  // Ghost the confirmed deck + compiled events onto the canvas. Only a deck
  // the user has reviewed/confirmed is ever presented here.
  const ghostEvents = useCallback((terminalArtifacts: Record<string, unknown>) => {
    if (!editor) return
    const { state, actions } = editor
    const events = (terminalArtifacts.events ?? []) as PlateEvent[]
    // The deck the user reviewed/confirmed. When they picked a different
    // platform, adopt it on the editor too (respecting the run-deck lock).
    const chosenPlatformId = deckPlatform && !deckLocked ? deckPlatform : state.platformId
    if (deckPlatform && !deckLocked && deckPlatform !== state.platformId) {
      actions.setPlatform(deckPlatform)
    }
    const platform = getPlatformManifest(state.platforms, chosenPlatformId)
    const variant = getVariantManifest(state.platforms, chosenPlatformId, state.variantId)
    const reviewedAdditions: AiLabwareAddition[] = proposedLabware
      .filter((lw) => !lw.requirement && deckPicked.has(lw.key))
      .map((lw) => ({
        recordId: lw.key,
        ...(lw.deckSlot ? { deckSlot: lw.deckSlot } : {}),
        ...(lw.reason ? { reason: lw.reason } : {}),
      }))
    const reviewedRequirements: AiLabwareRequirement[] = proposedLabware
      .filter((lw) => lw.requirement && deckPicked.has(lw.key))
      .map((lw) => ({
        classCurie: lw.key,
        ...(lw.deckSlot ? { deckSlot: lw.deckSlot } : {}),
      }))
    const { preview } = buildPreviewFromDraft({
      platform,
      variant,
      events,
      labwareAdditions: reviewedAdditions,
      labwareRequirements: reviewedRequirements,
      existingLabwares: state.labwares,
      existingPlacements: state.placements,
      activeDeckScope: activeDeckScope(chosenPlatformId),
    })
    const hasPreview =
      preview.previewPlacements.length > 0 || preview.previewEvents.length > 0
    if (!hasPreview) return
    actions.setPreview({
      ...preview,
      sourcePrompt: 'one-shot localized draft',
      labwareRequirements: reviewedRequirements,
      labwareAdditions: reviewedAdditions,
    })
  }, [editor, activeDeckScope, deckPlatform, deckPicked, proposedLabware, deckLocked])

  // Route a finished compile through the Review-deck gate (never ghost blindly).
  const holdForReview = useCallback((terminalArtifacts: Record<string, unknown>) => {
    setPendingDraft(terminalArtifacts)
    const lab = deriveDeckLabware(terminalArtifacts)
    setProposedLabware(lab)
    setDeckPicked(new Set(lab.map((p) => p.key)))
  }, [])

  const handleLocalize = useCallback(async () => {
    const text = protocolText.trim()
    if (!text) { setErrorMsg('Paste a universal protocol to localize.'); return }
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
        setPendingDraft(null)
        setInfoMsg('Answer the branch questions to localize.')
      } else if (res.localMacro && res.terminalArtifacts) {
        setNeedsAnswers(false)
        setLocalMacro(res.localMacro as LocalMacro)
        setMessage(
          `Localized: ${res.outcome} — review the deck & labware, then load onto deck `
          + `(${(res.terminalArtifacts.events as unknown[])?.length ?? 0} events).`,
        )
        holdForReview(res.terminalArtifacts)
      } else {
        setErrorMsg('One-shot returned no draft.')
      }
    } catch (err) {
      setErrorMsg(`Localize failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLocalizing(false)
    }
  }, [protocolText, sourceProtocolId, holdForReview])

  // Task 1/Point 3 — when a universal protocol is attached (sourceProtocolId +
  // text present), AUTO-RUN the branch-question extraction so the if/then
  // branches are asked BEFORE the user lands on raw "a. If ... b. If ..." steps.
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
        setMessage('Ready — review the deck & labware, then place them.')
        holdForReview(res.terminalArtifacts)
      } else {
        setErrorMsg('One-shot returned no draft after answers.')
      }
    } catch (err) {
      setErrorMsg(`Localize failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLocalizing(false)
    }
  }, [protocolText, sourceProtocolId, answers, holdForReview])

  // Per-step refinement: append a Correction, re-localize with the correction
  // (refinements fold into the final macro), then re-hold it through the gate.
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
        setMessage('Revised — corrections folded into the macro. Review the deck, then place.')
        holdForReview(res.terminalArtifacts)
      } else {
        setErrorMsg('No revised draft.')
      }
    } catch (err) {
      setErrorMsg(`Revision failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLocalizing(false)
    }
  }, [input, protocolText, sourceProtocolId, answers, holdForReview])

  const toggleDeckLabware = useCallback((key: string) => {
    setDeckPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Confirm deck + ghost: the ONLY path that ghosts. Requires at least one
  // picked labware so the deck is never blank when events appear.
  const handleLoadDeck = useCallback(() => {
    if (!pendingDraft) return
    ghostEvents(pendingDraft)
    setMessage(
      `Deck ${deckPlatform || 'ready'} — ${deckPicked.size} labware placed, `
      + `${(pendingDraft.events as unknown[])?.length ?? 0} events ghosted.`
    )
    setPendingDraft(null)
  }, [pendingDraft, deckPicked, ghostEvents, deckPlatform])

  // Accept: commit the graph + persist local-protocol + post the macro-focused
  // training pair to the moat.
  const handleAccept = useCallback(async () => {
    if (!localMacro || !editor) return
    if (!editorState?.preview) return
    const hasProposed = (editorState.preview.previewPlacements.length > 0
      || editorState.preview.previewEvents.length > 0)
    if (!hasProposed) return
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
      const acceptRes = await apiClient.intentAccept({
        sourceProtocolId: sourceProtocolId ?? '',
        sourceTitle,
        ...(localMacro.intentId ? { title: (sourceTitle ? `${sourceTitle}: ` : '') + localMacro.intentId } : {}),
        localMacro,
        answers,
        ...(links ? { links } : {}),
      })
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
      setErrorMsg(`Accept failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAccepting(false)
    }
  }, [localMacro, editor, editorState, sourceProtocolId, sourceTitle, answers, corrections, links])

  const hasPreview = Boolean(
    editorState?.preview &&
      (editorState.preview.previewPlacements.length > 0 ||
        editorState.preview.previewEvents.length > 0),
  )
  const hasDeckReview = pendingDraft !== null
  const canAccept = Boolean(localMacro && hasPreview && !accepting)

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

      {hasDeckReview ? (
        <div className="protocol-localization-thread__deckreview" data-testid="pl-deck-review">
          <p className="pl-deckreview-title">Review deck &amp; labware</p>
          <p className="protocol-localization-thread__hint">
            The run proposed these labware for the deck. Review, add/remove, then
            confirm to place them and ghost the events — events only appear after
            the deck has labware.
          </p>

          <div className="pl-deckreview-labware" data-testid="pl-deck-review-labware">
            {proposedLabware.length === 0 ? (
              <p className="protocol-localization-thread__hint" data-testid="pl-deckreview-empty">
                No labware resolved yet — you&apos;ll start with an empty deck.
              </p>
            ) : (
              proposedLabware.map((lw) => (
                <label key={lw.key} className="pl-deckreview-item">
                  <input
                    type="checkbox"
                    checked={deckPicked.has(lw.key)}
                    onChange={() => toggleDeckLabware(lw.key)}
                    data-testid={`deck-labware-${lw.key}`}
                  />
                  <span className="pl-deckreview-item__label">{lw.label}</span>
                  {lw.deckSlot ? (
                    <code className="pl-deckreview-item__slot">{lw.deckSlot}</code>
                  ) : null}
                </label>
              ))
            )}
          </div>

          {deckLocked ? (
            <p className="protocol-localization-thread__hint" data-testid="pl-deck-locked">
              Deck is locked to {deckPlatform || 'the run platform'} for this run.
            </p>
          ) : (
            <div className="pl-deckreview-platform" data-testid="pl-deck-review-platform">
              <span className="pl-deckreview-platform__label">Deck platform</span>
              <select
                value={deckPlatform}
                onChange={(e) => setDeckPlatform(e.target.value)}
                data-testid="pl-deck-platform"
              >
                {(editorState?.platforms ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            data-testid="pl-load-deck"
            disabled={localizing}
            onClick={() => handleLoadDeck()}
          >
            Load onto deck &amp; ghost events ({deckPicked.size})
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
          disabled={!canAccept}
          onClick={() => { void handleAccept() }}
        >
          {accepting ? 'Accepting…' : 'Accept &amp; Save'}
        </button>
        {message ? (
          <span
            className={`protocol-localization-thread__msg${
              messageKind === 'error' ? ' protocol-localization-thread__msg--error' : ''
            }`}
            data-testid="pl-msg"
          >
            {message}
          </span>
        ) : null}
      </div>
    </div>
  )
}