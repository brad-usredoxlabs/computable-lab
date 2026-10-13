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
import { ClarificationPicker, requestHasPicker } from '../ai/ClarificationPicker'
import { heldFactToClarificationRequest } from './ProtocolLocalizationThread.clarificationAdapter'
import type { PlateEvent } from '../../../types/events'
import type {
  AiClarificationAnswer,
  AiClarificationRequest,
  AiLabwareAddition,
  AiLabwareRequirement,
  AiResolvedLabware,
} from '../../../types/ai'

export interface BranchQuestionAxis {
  axisId: string
  question: string
  choices: Array<{ value: string; label: string }>
}

/**
 * W2-8 (spec §3 W4): the FAMILY's questions are DATA on the protocol record
 * (`branch_axes[]` — the merged BranchAxis datatype: axisId/label/conditions).
 * This pure adapter maps one protocol branch_axis onto an answerable
 * thread axis WITHOUT inventing anything: label -> question, condition id ->
 * choice value, condition label -> choice label (ids flow verbatim, spec §8
 * bait 4). An axis with no answerable conditions yields nothing — the thread
 * never asks a question the family did not state.
 */
export function protocolBranchAxesToQuestionAxes(branchAxes: unknown): BranchQuestionAxis[] {
  if (!Array.isArray(branchAxes)) return []
  const out: BranchQuestionAxis[] = []
  for (const raw of branchAxes) {
    if (typeof raw !== 'object' || raw === null) continue
    const axis = raw as { axisId?: unknown; label?: unknown; conditions?: unknown }
    if (typeof axis.axisId !== 'string' || !axis.axisId) continue
    const choices = Array.isArray(axis.conditions)
      ? axis.conditions
          .filter((c): c is { id: string; label?: string } =>
            typeof c === 'object' && c !== null && typeof (c as { id?: unknown }).id === 'string' && !!c.id)
          .map((c) => ({ value: c.id, label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : c.id }))
      : []
    if (choices.length === 0) continue
    out.push({
      axisId: axis.axisId,
      question: typeof axis.label === 'string' && axis.label.trim() ? axis.label.trim() : axis.axisId,
      choices,
    })
  }
  return out
}

/**
 * Merge the family's axes with the AI-emitted axes, deduped by axisId: the
 * FAMILY's declared axis wins (it is the protocol's own data; the AI pass is a
 * guess over the same document — spec §8 bait 9).
 */
function mergeQuestionAxes(family: BranchQuestionAxis[], ai: BranchQuestionAxis[]): BranchQuestionAxis[] {
  const byId = new Map<string, BranchQuestionAxis>()
  for (const axis of family) byId.set(axis.axisId, axis)
  for (const axis of ai) if (!byId.has(axis.axisId)) byId.set(axis.axisId, axis)
  return [...byId.values()]
}

export interface LocalMacro {
  intentId?: string
  actions?: unknown[]
  [key: string]: unknown
}

/** One row in the Review-deck labware checklist. `kind` is the compiler
 *  vocabulary (one term per entity): an addition to author, a symbolic
 *  requirement, or a hint resolved against an EXISTING inventory record. */
export interface DeckLabwareSuggestion {
  key: string
  label: string
  deckSlot?: string
  reason?: string
  kind: 'addition' | 'requirement' | 'resolved'
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

/** Fold the compile's labwareAdditions + labwareRequirements + resolvedLabwares
 *  into a review list. */
function deriveDeckLabware(terminalArtifacts: Record<string, unknown>): DeckLabwareSuggestion[] {
  const additions = (terminalArtifacts.labwareAdditions ?? []) as AiLabwareAddition[]
  const requirements = (terminalArtifacts.labwareRequirements ?? []) as AiLabwareRequirement[]
  const resolved = Array.isArray(terminalArtifacts.resolvedLabwares)
    ? (terminalArtifacts.resolvedLabwares as Array<{ hint?: unknown; recordId?: unknown; title?: unknown; deckSlot?: unknown }>)
      .filter((r) => r && typeof r.recordId === 'string' && r.recordId.length > 0)
    : []
  const out: DeckLabwareSuggestion[] = []
  const seen = new Set<string>()
  for (const req of requirements) {
    if (!req?.classCurie || seen.has(req.classCurie)) continue
    seen.add(req.classCurie)
    out.push({
      key: req.classCurie,
      label: req.classCurie,
      ...(req.deckSlot ? { deckSlot: req.deckSlot } : {}),
      kind: 'requirement',
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
      kind: 'addition',
    })
  }
  // Resolved rows fold LAST through the same `seen` Set: when a recordId is
  // both an addition (deckSlot arms on non-shorthand pipelines) and a resolved
  // row, the entity gets ONE checkbox and the addition kind wins. The row
  // label is the record's REAL title (never a string-guess).
  for (const res of resolved) {
    const recordId = res.recordId as string
    if (seen.has(recordId)) continue
    seen.add(recordId)
    const title = typeof res.title === 'string' && res.title.length > 0 ? res.title : undefined
    out.push({
      key: recordId,
      label: title ?? recordId,
      // Tolerant shape: deckSlot is not on this path today; if a pipeline ever
      // carries one it rides through the same conditional-spread idiom
      // (exactOptionalPropertyTypes — absent-or-value, never :undefined).
      ...(typeof res.deckSlot === 'string' && res.deckSlot.length > 0 ? { deckSlot: res.deckSlot } : {}),
      kind: 'resolved',
    })
  }
  return out
}

export function ProtocolLocalizationThread(props: ProtocolLocalizationThreadProps) {
  const { initialProtocolText = '', sourceProtocolId, sourceTitle, links } = props
  const editor = useOptionalEventEditor()

  const [protocolText, setProtocolText] = useState(initialProtocolText)
  const [axes, setAxes] = useState<BranchQuestionAxis[]>([])
  // W2-8 (spec §3 W4): the FAMILY's own questions — the source protocol record's
  // branch_axes[] — loaded once here. Question-asking moved from extraction
  // review to this realization entry; the answers ride the existing `answers`
  // state so POST /intent/accept records them as branch_resolution (server
  // unchanged, IntentAcceptHandlers.ts:77).
  const [familyAxes, setFamilyAxes] = useState<BranchQuestionAxis[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [needsAnswers, setNeedsAnswers] = useState(false)
  const [localMacro, setLocalMacro] = useState<LocalMacro | null>(null)
  const [corrections, setCorrections] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [localizing, setLocalizing] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info')
  // THREAD-ASK-1 (Leg 2): the held 422's structured clarifications, kept as
  // picker requests so the bar is ANSWERABLE where it is shown. Replaced whole
  // on every fold (a re-send's held result re-folds through foldHeldBundle).
  const [heldCards, setHeldCards] = useState<AiClarificationRequest[]>([])
  // Answers picked on the cards, keyed by the clarification's own LABEL — the
  // same key the server-side binding test pins (answers[<label>] = the
  // [[material:MAT-…|label]] mention the picker produced).
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({})

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
      .filter((lw) => lw.kind === 'addition' && deckPicked.has(lw.key))
      .map((lw) => ({
        recordId: lw.key,
        ...(lw.deckSlot ? { deckSlot: lw.deckSlot } : {}),
        ...(lw.reason ? { reason: lw.reason } : {}),
      }))
    const reviewedRequirements: AiLabwareRequirement[] = proposedLabware
      .filter((lw) => lw.kind === 'requirement' && deckPicked.has(lw.key))
      .map((lw) => ({
        classCurie: lw.key,
        ...(lw.deckSlot ? { deckSlot: lw.deckSlot } : {}),
      }))
    // The third kind: a picked resolved row ghosts a PLACEMENT of the EXISTING
    // record (draftPreview's resolved arm — labwareId/sourceRecordId ===
    // recordId, no proposedRecord; submitSuggestionTool.ts:311). reason stays
    // addition-only; the row label carries the record's real title.
    const reviewedResolved: AiResolvedLabware[] = proposedLabware
      .filter((lw) => lw.kind === 'resolved' && deckPicked.has(lw.key))
      .map((lw) => ({
        recordId: lw.key,
        ...(lw.deckSlot ? { deckSlot: lw.deckSlot } : {}),
        ...(lw.label !== lw.key ? { title: lw.label } : {}),
      }))
    const { preview } = buildPreviewFromDraft({
      platform,
      variant,
      events,
      labwareAdditions: reviewedAdditions,
      labwareRequirements: reviewedRequirements,
      resolvedLabwares: reviewedResolved,
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

  /**
   * W2-8 A5 (C leg, gate A5c root cause 2): the server's 422 bar HOLDS the
   * parseable macro + terminalArtifacts + structured clarifications (OQ4(a))
   * precisely so the client folds them into the review flow instead of
   * discarding them. The apiClient now surfaces that bundle as a discriminated
   * `{ held: true }` result; folding here is EXACTLY the 2xx branch
   * (setLocalMacro + holdForReview) plus an honest info message listing the
   * unresolved facts (labels + reasons) the scientist should review before
   * accepting. Nothing is silently resolved on the user's behalf.
   */
  const foldHeldBundle = useCallback((held: {
    clarifications: Array<Record<string, unknown>>
    localMacro: { intentId?: string; actions?: unknown[]; [key: string]: unknown }
    terminalArtifacts: Record<string, unknown>
  }) => {
    setNeedsAnswers(false)
    setLocalMacro(held.localMacro as LocalMacro)
    const facts = held.clarifications
      .map((c) => `${String(c.label ?? 'unnamed fact')} (${String(c.reason ?? 'unresolved')})`)
      .join('; ')
    setInfoMsg(facts
      ? `Compiled — unresolved facts to review before accepting: ${facts}`
      : 'Compiled — review the deck & labware, then place them.')
    // THREAD-ASK-1 (Leg 2): the same held facts ALSO render as answerable
    // cards (picker + mint) — additive. Facts with no answer surface map to
    // null and stay infoMsg-only (no picker-less card). Card state is set
    // BEFORE the gate call; the gate call itself is byte-unchanged.
    setHeldCards(held.clarifications
      .map((fact, index) => heldFactToClarificationRequest(fact, index))
      .filter((request): request is AiClarificationRequest => request !== null))
    holdForReview(held.terminalArtifacts)
  }, [holdForReview])

  // THREAD-ASK-1 (Leg 2): the answers map that rides every compile round-trip
  // — the branch-axis answers (byte-unchanged axis semantics) merged with the
  // clarification answers picked on the held cards (additive; a clarification
  // answer's key is the fact's own label, its value the picker's
  // [[material:MAT-…|label]] mention — the exact data shape Leg 1 binds).
  const compileAnswers = useCallback((): Record<string, string> => ({
    ...answers,
    ...clarificationAnswers,
  }), [answers, clarificationAnswers])

  // A pick on a held card records the answer and RE-SENDS through the SAME
  // apiClient.intentCompileFromPrompt round-trip the answers/corrections flows
  // use (no new endpoint, no new fetch path). A re-send that re-bars re-folds
  // through foldHeldBundle — never straight to the canvas.
  const handleClarificationPick = useCallback((
    answer: AiClarificationAnswer,
    request: AiClarificationRequest,
  ) => {
    const label = request.prompt
    const value = answer.mentionToken ?? answer.label ?? answer.value
    if (!value) return
    setClarificationAnswers((prev) => ({ ...prev, [label]: value }))
    setLocalizing(true)
    void (async () => {
      try {
        const res = await apiClient.intentCompileFromPrompt({
          protocolText: protocolText.trim(),
          ...(sourceProtocolId ? { sourceProtocolId } : {}),
          answers: { ...answers, ...clarificationAnswers, [label]: value },
        })
        if ('held' in res && res.held === true) {
          // The re-bar re-folds through the SAME gate path (cards refresh from
          // the fresh held facts; the answered fact is gone when the spine
          // bound it).
          foldHeldBundle(res)
        } else if (res.localMacro && res.terminalArtifacts) {
          setNeedsAnswers(false)
          setHeldCards([])
          setLocalMacro(res.localMacro as LocalMacro)
          setMessage('Ready — review the deck & labware, then place them.')
          holdForReview(res.terminalArtifacts)
        } else {
          setErrorMsg('One-shot returned no draft after the clarification answer.')
        }
      } catch (err) {
        setErrorMsg(`Localize failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setLocalizing(false)
      }
    })()
  }, [protocolText, sourceProtocolId, answers, clarificationAnswers, foldHeldBundle, holdForReview])

  // W2-8 (spec §3 W4): load the FAMILY's questions once per source protocol.
  // The protocol record's branch_axes[] are its declared questions (data, not
  // a re-derivation); a record without them asks nothing extra here. A read
  // failure is a gap, not an error — the AI-emitted axes still work alone.
  useEffect(() => {
    if (!sourceProtocolId) return
    let cancelled = false
    void (async () => {
      try {
        const record = await apiClient.getRecord(sourceProtocolId)
        const payload = (record?.payload ?? {}) as Record<string, unknown>
        const mapped = protocolBranchAxesToQuestionAxes(payload.branch_axes)
        if (!cancelled) setFamilyAxes(mapped)
      } catch {
        if (!cancelled) setFamilyAxes([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sourceProtocolId])

  // The answerable axes: the family's declared axes merged with the AI-emitted
  // ones, deduped by axisId (the family's own data wins).
  const allAxes = mergeQuestionAxes(familyAxes, axes)

  const handleLocalize = useCallback(async () => {
    const text = protocolText.trim()
    if (!text) { setErrorMsg('Paste a universal protocol to localize.'); return }
    setLocalizing(true)
    setMessage(null)
    firstUserPrompt.current = text
    try {
      const res = await apiClient.intentCompileFromPrompt({ protocolText: text, sourceProtocolId })
      if ('held' in res && res.held === true) {
        // Defensive: the ask call sends no answers, so a held 422 should not
        // occur here; if the server ever holds one, fold it honestly rather
        // than discarding it.
        foldHeldBundle(res)
      } else if (res.needsAnswers) {
        setAxes(res.axes ?? [])
        setNeedsAnswers(true)
        setAnswers({})
        setLocalMacro(null)
        setPendingDraft(null)
        // THREAD-ASK-1 fix cycle 2 (D1 residual): this arm DISCARDS the macro
        // (setLocalMacro(null) + setPendingDraft(null) above), so the cycle-1
        // invariant applies here too — no stale answerable card survives over
        // a replaced/discarded macro. Reachable: the always-rendered "Localize
        // (one-shot)" button sends no answers, so the server returns
        // needsAnswers while a prior held fold's cards are open. Only the card
        // SURFACE clears; the clarificationAnswers map is deliberately NOT
        // cleared — the Leg-1 answers keep riding re-drafts (compileAnswers).
        setHeldCards([])
        setInfoMsg('Answer the branch questions to localize.')
      } else if (res.localMacro && res.terminalArtifacts) {
        setNeedsAnswers(false)
        // THREAD-ASK-1 fix cycle 1 (D1): a success that RESOLVES the macro
        // collapses the held cards — the same lifecycle the pick's 2xx arm
        // already has (:405). No stale answerable card survives over a
        // resolved macro. The picked answers stay in the answers map (Leg 1
        // data keeps riding re-drafts); only the card surface clears.
        setHeldCards([])
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
  }, [protocolText, sourceProtocolId, holdForReview, foldHeldBundle])

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
        // THREAD-ASK-1: the clarification answers ride ADDITIVELY (with no
        // picks this is the same map as before — axis semantics byte-unchanged).
        answers: compileAnswers(),
      })
      if ('held' in res && res.held === true) {
        // The 422 bar with a held macro: fold it EXACTLY like the 2xx branch
        // and surface the unresolved facts honestly (OQ4(a) as designed).
        foldHeldBundle(res)
      } else if (res.localMacro && res.terminalArtifacts) {
        setNeedsAnswers(false)
        // THREAD-ASK-1 fix cycle 1 (D1): resolved macro -> held cards collapse
        // (same lifecycle as the pick's 2xx arm; see handleLocalize).
        setHeldCards([])
        setLocalMacro(res.localMacro as LocalMacro)
        setMessage('Ready — review the deck & labware, then place them.')
        holdForReview(res.terminalArtifacts)
      } else {
        setErrorMsg('One-shot returned no draft after answers.')
      }
    } catch (err) {
      // A 422 WITHOUT a held macro (or any other failure) keeps the error path.
      setErrorMsg(`Localize failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLocalizing(false)
    }
  }, [protocolText, sourceProtocolId, compileAnswers, holdForReview, foldHeldBundle])

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
        // THREAD-ASK-1: clarification answers ride additively (see above).
        answers: compileAnswers(),
      })
      if ('held' in res && res.held === true) {
        // A re-draft that bars with a held macro folds the same honest way
        // (OQ4(a)) instead of discarding the held bundle.
        foldHeldBundle(res)
      } else if (res.localMacro && res.terminalArtifacts) {
        // THREAD-ASK-1 fix cycle 1 (D1): a correction that resolves the macro
        // collapses the held cards too (same lifecycle as the pick's 2xx arm;
        // see handleLocalize).
        setHeldCards([])
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
  }, [input, protocolText, sourceProtocolId, compileAnswers, holdForReview, foldHeldBundle])

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
        const pairRes = await apiClient.intentTrainingPair({
          userPrompt: firstUserPrompt.current,
          thread: corrections.map((c) => ({ role: 'user', content: c })),
          sourceProtocolId,
          acceptedProtocolId: acceptRes.recordId,
          acceptedGraph,
          localMacro,
          confirmedAt: new Date().toISOString(),
        })
        // SHORTHAND-CORPUS WS2 — honest surfacing: the message follows the
        // POST response, three-way, and never claims a capture that may not
        // have happened. `corpus.disabled` is a NORMAL response (lane default
        // is remote-off); the server-side local JSONL append rides the same
        // request but only fires when CLA_CORPUS_LOCAL_PATH is set — the
        // client cannot see that toggle (OQ2), so the wording states the
        // CONDITION, not a completed local capture (cycle-1 DEFECT-2).
        // A failed post must not claim corpus capture either.
        if (pairRes?.ok) {
          setMessage('Accepted — protocol saved and added to training corpus.')
        } else if (pairRes?.error === 'corpus.disabled') {
          setMessage('Accepted — protocol saved; remote corpus disabled — pair forwarded to the server (local capture only if enabled).')
        } else {
          setMessage(`Accepted — protocol saved; training pair not posted (${pairRes?.error ?? 'corpus.post-failed'}).`)
        }
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

      {familyAxes.length > 0 || (needsAnswers && axes.length > 0) ? (
        <div className="protocol-localization-thread__clarify" data-testid="pl-clarify">
          <p>Answer to localize:</p>
          {allAxes.map((axis) => (
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
            disabled={localizing || allAxes.some((a) => !answers[a.axisId])}
            onClick={() => { void handleSubmitAnswers() }}
          >
            Apply &amp; compile
          </button>
        </div>
      ) : null}

      {heldCards.length > 0 ? (
        <div
          className="protocol-localization-thread__held-clarifications"
          data-testid="pl-clarification-cards"
        >
          <p className="pl-held-clarifications-title">Answer the unresolved facts</p>
          {heldCards.map((request) => (
            <section
              key={request.id}
              className="pl-held-clarification-card"
              data-testid="pl-clarification-card"
            >
              <div className="pl-held-clarification-head">
                <span className="pl-held-clarification-menu">{request.menuProvider}</span>
                <span className="pl-held-clarification-label">{request.prompt}</span>
              </div>
              {request.options.length > 0 ? (
                <div className="pl-held-clarification-options">
                  {request.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="pl-held-clarification-option"
                      disabled={localizing}
                      data-testid={`pl-clarification-option-${request.id}`}
                      onClick={() => handleClarificationPick({
                        requestId: request.id,
                        optionId: option.id,
                        label: option.label,
                        ...(option.ref ? { ref: option.ref } : {}),
                      }, request)}
                    >
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {requestHasPicker(request) ? (
                <ClarificationPicker request={request} onPick={handleClarificationPick} />
              ) : null}
            </section>
          ))}
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