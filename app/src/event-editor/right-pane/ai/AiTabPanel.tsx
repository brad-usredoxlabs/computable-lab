/**
 * AiTabPanel — workspace AI chat. Phase 7b replaces the Phase 7
 * placeholder with the real composition:
 *   - header with the selected per-viewer system prompt label
 *   - SourcesStrip (auto-attached chips for study + active viewer)
 *   - MessageLog (streaming chat history)
 *   - RunInEventEditorButton (visible for non-deck viewers)
 *   - ChatInput (textarea + send/stop)
 *
 * Chat state is per-mount (in-memory). The system prompt id is sent
 * server-side as the `surface` so future orchestrator strategies can
 * fork on it without bumping the API.
 */

import { useCallback, useEffect, useMemo, useRef, useReducer, useState } from 'react'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { useOptionalEventEditor } from '../../EventEditorContext'
import { apiClient, type AiWarmStatus } from '../../../shared/api/client'
import { getPlatformManifest, getVariantManifest } from '../../../shared/lib/platformRegistry'
import { getVerbsForDisplay } from '../../../shared/vocab/registry'
import { buildAcceptedEventGraphProjection } from '../../../graph/lib/acceptedEventGraphProjection'
import type { AiClarificationAnswer, AiClarificationRequest, AiLabwareAddition, AiLabwareRequirement } from '../../../types/ai'
import type { PlateEvent } from '../../../types/events'
import { systemPromptForViewer, systemPromptKindForTab } from './systemPromptForViewer'
import { SourcesStrip, type AddedSource } from './SourcesStrip'
import { MessageLog } from './MessageLog'
import { ChatInput } from './ChatInput'
import { QuestionsPanel } from './QuestionsPanel'
import { RunInEventEditorButton } from './RunInEventEditorButton'
import { useChatThread } from './useChatThread'
import { buildPreviewFromDraft } from './draftPreview'
import type { AssistDraftResult } from './assistStream'
import { AddSourceModal } from './AddSourceModal'
import { ProtocolBuilderOrchestrator } from '../../protocol-builder'
import { sidebarReducer, initialSidebarState, isChatEnabled, headerLabel } from './sidebarState'
import './ai.css'

export function clarificationAnswerPrompt(
  answer: AiClarificationAnswer,
  request: AiClarificationRequest,
): string {
  const target = request.entityType ?? request.kind
  const value = answer.mentionToken ?? answer.label ?? answer.value ?? answer.optionId ?? 'answer'
  return `Use ${value} for ${target}.`
}

/** Combine a batch of clarification answers into a single prompt sentence-set. */
export function clarificationAnswersPrompt(
  answers: AiClarificationAnswer[],
  requests: AiClarificationRequest[],
): string {
  const byId = new Map(requests.map((r) => [r.id, r]))
  return answers
    .map((a) => {
      const req = byId.get(a.requestId)
      const target = req?.entityType ?? req?.kind ?? 'material'
      const value = a.mentionToken ?? a.label ?? a.value ?? a.optionId ?? 'answer'
      return `Use ${value} for ${target}.`
    })
    .join(' ')
}

/**
 * Tiny prefill-progress chip for the panel header. llama.cpp exposes no
 * mid-prefill percentage, so this is a three-phase indicator: pulsing while
 * the warm is pending/running, a checkmark with the prefilled token count
 * once the context is in the KV cache, and a muted failure note otherwise.
 */
export function WarmIndicator({ status }: { status: AiWarmStatus }) {
  if (status.state === 'pending' || status.state === 'warming') {
    return (
      <span
        className="ai-tab__warm ai-tab__warm--busy"
        data-testid="ai-tab-warm"
        title="Pre-filling the model's KV cache with the system prompt + current event graph so the next draft starts fast"
      >
        <span className="ai-tab__warm-dot" aria-hidden />
        pre-filling context…
      </span>
    )
  }
  if (status.state === 'warmed') {
    const tokens =
      status.promptTokens != null ? ` · ${status.promptTokens.toLocaleString()} tok` : ''
    return (
      <span
        className="ai-tab__warm ai-tab__warm--ready"
        data-testid="ai-tab-warm"
        title={`Context is pre-filled in the model's KV cache${status.ms != null ? ` (warmed in ${(status.ms / 1000).toFixed(1)}s)` : ''} — the next draft only pays prefill for your prompt`}
      >
        ✓ context ready{tokens}
      </span>
    )
  }
  if (status.state === 'failed') {
    return (
      <span
        className="ai-tab__warm ai-tab__warm--failed"
        data-testid="ai-tab-warm"
        title="Background pre-fill failed — drafting still works, the first request just pays full prefill"
      >
        pre-fill failed
      </span>
    )
  }
  return null
}

export function AiTabPanel() {
  const ws = useWorkspace()
  const activeTab = useMemo(() => {
    if (!ws.state.activeTabId) return null
    return ws.state.tabs.find((t) => t.id === ws.state.activeTabId) ?? null
  }, [ws.state.activeTabId, ws.state.tabs])

  const systemPrompt = systemPromptForViewer(systemPromptKindForTab(activeTab))

  // Present only when the active tab is a deck (EventEditorProvider wraps
  // the pane then); null on pdf/document/project tabs.
  const editor = useOptionalEventEditor()
  const editorState = editor?.state ?? null

  // Active deck scope for preview placement validation — computed outside
  // useMemo so it's accessible as a stable reference in useCallback deps.
  const activeDeckScope = useMemo(() => {
    if (!editorState) return undefined
    const variant = getVariantManifest(editorState.platforms, editorState.platformId, editorState.variantId)
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
      .filter((slot) => slot.kind !== 'trash' && slot.kind !== 'special' && slot.reachable !== false)
      .map((slot) => slot.id)
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

  // Context the agent should know about. Keep this small — full bodies
  // ride in `attachments` when Phase 9 adds upload support; today the
  // agent can ask the user to dispatch via Run-in-event-editor when it
  // needs the viewer's body to draft a graph.
  const context = useMemo(() => {
    const activeArtifactId =
      activeTab && (activeTab.kind === 'pdf' || activeTab.kind === 'document')
        ? activeTab.artifactId
        : null
    const activeEventGraphId =
      activeTab?.kind === 'deck' ? activeTab.eventGraphId : null
    const activeVariant = editorState
      ? getVariantManifest(editorState.platforms, editorState.platformId, editorState.variantId)
      : null
    const activePlacement = editorState?.focusPlacementId
      ? editorState.placements.find((p) => p.placementId === editorState.focusPlacementId) ?? null
      : null
    const deckAllowedSurfaces = activeVariant
      ? [
          ...(activeVariant.slots.length > 0 ? ['slot' as const] : []),
          ...(activeVariant.surface || activeVariant.sideLawn ? ['lawn' as const] : []),
        ]
      : undefined
    const deckAllowedSlots = activeVariant?.slots
      .filter((slot) => slot.kind !== 'trash' && slot.kind !== 'special' && slot.reachable !== false)
      .map((slot) => slot.id)
    const acceptedGraphProjection = editorState
      ? buildAcceptedEventGraphProjection({
          labwares: new Map(Object.entries(editorState.labwares)),
          events: editorState.events,
          vocabPackId: editorState.vocabPackId,
          availableVerbs: getVerbsForDisplay(editorState.vocabPackId).map((v) => v.verb),
          sourceSelection: editorState.selection
            ? {
                labware: editorState.labwares[editorState.selection.labwareId],
                selectedWells: editorState.selection.wells,
              }
            : undefined,
          deckPlatform: editorState.platformId,
          deckVariant: editorState.variantId,
          deckPlacements: editorState.placements.map((p) => ({
            slotId: p.location.kind === 'slot' ? p.location.slotId : 'lawn',
            labwareId: p.labwareId,
          })),
          ...(deckAllowedSurfaces ? { deckAllowedSurfaces } : {}),
          ...(deckAllowedSlots ? { deckAllowedSlots } : {}),
          ...(activePlacement?.labwareId ? { focusedLabwareId: activePlacement.labwareId } : {}),
          ...(editorState.runId ? { runId: editorState.runId } : {}),
          ...(editorState.eventGraphId ? { eventGraphId: editorState.eventGraphId } : {}),
        })
      : {}
    const previewDraft = editorState?.preview
      ? {
          events: editorState.preview.previewEvents,
          labwareRequirements: editorState.preview.labwareRequirements ?? [],
          labwareAdditions: editorState.preview.labwareAdditions ?? [],
          ...(editorState.preview.ontologyBindings ? { ontologyBindings: editorState.preview.ontologyBindings } : {}),
          ...(editorState.preview.sourcePrompt ? { sourcePrompt: editorState.preview.sourcePrompt } : {}),
          ...(editorState.preview.sourceSkips ? { sourceSkips: editorState.preview.sourceSkips } : {}),
        }
      : null
    const sourceProtocolCandidate = editorState?.preview?.sourceProtocolCandidate
      ?? editorState?.graphLemurSource?.sourceProtocolCandidate
    const sourcePdf = editorState?.preview?.sourcePdf ?? editorState?.graphLemurSource?.sourcePdf
    const implCtx = editorState?.graphLemurSource?.implementationContext
    return {
      studyId: ws.state.studyId,
      activeTabKind: activeTab?.kind ?? null,
      activeArtifactId,
      activeEventGraphId,
      systemPromptId: systemPrompt.id,
      systemPromptBody: systemPrompt.body,
      activeDeckScope,
      // Deck tabs send the same accepted event graph projection used by the
      // standalone editor; this context object is shared by warm and draft.
      ...acceptedGraphProjection,
      ...(previewDraft
        ? {
            draftRevision: {
              currentPreviewDraft: previewDraft,
              revisionHistory: editorState?.preview?.revisionHistory ?? [],
            },
          }
        : {}),
      ...(sourceProtocolCandidate || sourcePdf || implCtx
        ? {
            graphLemur: {
              ...(editorState?.preview ? { revisionMode: true } : {}),
              ...(sourceProtocolCandidate ? { sourceProtocolCandidate } : {}),
              ...(sourcePdf ? { sourcePdf } : {}),
              ...(implCtx ? { implementationContext: implCtx } : {}),
            },
          }
        : {}),
    }
  }, [ws.state.studyId, activeTab, systemPrompt, editorState, activeDeckScope])

  // Promote draft results into the editor's ghost preview so the user gets
  // the draft → ghost → Accept/Discard loop the standalone dock has.
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
        activeDeckScope,
      })
      const hasPreview =
        preview.previewPlacements.length > 0 || preview.previewEvents.length > 0
      if (!hasPreview) return
      // A follow-up draft while a preview is mounted is a revision: replace
      // the ghosts and append to the revision trail that rides back to the
      // backend as structured draftRevision context.
      const previousPreview = state.preview
      const sourceProtocolCandidate = previousPreview?.sourceProtocolCandidate
        ?? state.graphLemurSource?.sourceProtocolCandidate
      const sourcePdf = previousPreview?.sourcePdf ?? state.graphLemurSource?.sourcePdf
      const graphLemurIngest = previousPreview?.ingest ?? state.graphLemurSource?.ingest
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
        ...(sourceProtocolCandidate ? { sourceProtocolCandidate } : {}),
        ...(sourcePdf ? { sourcePdf } : {}),
        ...(graphLemurIngest ? { ingest: graphLemurIngest } : {}),
        ...(revisionHistory ? { revisionHistory } : {}),
      })
      // Transition sidebar state based on draft result
      const draftId = `draft-${Date.now()}`
      if (result.clarificationRequests && result.clarificationRequests.length > 0) {
        sidebarDispatch({ type: 'clarifications-needed', draftId, questions: result.clarificationRequests })
      } else {
        sidebarDispatch({ type: 'draft-ready', draftId, interpretation: { operations: [] }, changes: [], warnings: [] })
      }
    },
    [activeDeckScope, editor],
  )

  const chat = useChatThread({
    surface: systemPrompt.id,
    context,
    onDraftResult,
  })

  // Pre-warm the KV cache while the user reads/types: whenever the deck
  // context changes (tab opened, graph loaded, draft accepted, labware
  // edited) or a turn completes, ship the exact context + history the next
  // draft request will carry to POST /ai/context/warm. The server debounces
  // (2s), dedups by prompt hash, and defers to interactive traffic, so this
  // can fire eagerly; the client timeout just coalesces rapid edits. Skipped
  // while streaming (messages mutate per-chunk) and on non-deck tabs.
  const messagesRef = useRef(chat.state.messages)
  messagesRef.current = chat.state.messages
  const hasDeckEditor = editorState !== null
  // Prefill indicator state: the cache key the server warms for this deck
  // plus its last reported lifecycle. Null until a warm is accepted (also
  // null on backends with warming disabled — the indicator hides).
  const [warm, setWarm] = useState<{ key: string; status: AiWarmStatus } | null>(null)
  useEffect(() => {
    if (!hasDeckEditor || chat.isStreaming) return
    let cancelled = false
    const timer = setTimeout(() => {
      const history = messagesRef.current
        .filter((m) => m.text)
        .map((m) => ({ role: m.role, content: m.text }))
      void apiClient.warmAiContext(context, history, systemPrompt.id).then((res) => {
        if (!cancelled && res) setWarm(res)
      })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [hasDeckEditor, chat.isStreaming, chat.state.messages.length, context, systemPrompt.id])

  // While a warm is pending/in-flight, poll its status so the indicator
  // flips to "ready" (or "failed") without a page interaction. The 38k-token
  // cold prefill takes tens of seconds on the appliance GPU, so poll gently.
  const warmState = warm?.status.state
  useEffect(() => {
    if (!warm || (warmState !== 'pending' && warmState !== 'warming')) return
    const interval = setInterval(() => {
      void apiClient.getAiWarmStatus(warm.key).then((status) => {
        if (!status) return
        setWarm((prev) => (prev && prev.key === warm.key ? { key: prev.key, status } : prev))
      })
    }, 1500)
    return () => clearInterval(interval)
  }, [warm, warmState])

  // Run-in-event-editor pushes a composed prompt into ChatInput; the user
  // reviews then sends. We hold the prefill here so a re-render doesn't
  // forget what was staged.
  const [prefill, setPrefill] = useState<string | undefined>(undefined)

  // "+ Add source" state: open/close + the session list of ingested
  // PDFs. Per-session in memory; durable artifact records still land on
  // disk via the Phase 9 ingest path. Chips reflect which ones the user
  // is "carrying" into this AI conversation.
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [addedSources, setAddedSources] = useState<AddedSource[]>([])

  // Extended thinking is always OFF for the workspace agent: on this appliance
  // the model's chain-of-thought consumes the turn before it emits the draft
  // tool call (so the native tool call never lands and the slow compiler-arg
  // fallback fires), with no offsetting quality gain. We send enableThinking:
  // false explicitly because the chat template defaults reasoning ON. The
  // user-facing toggle was removed; re-add it here if a future model benefits.

  // Clarification answers accumulated across a multi-turn resolution, keyed by
  // the grounded material id (request ids aren't material-stable across
  // re-drafts). Every clarification submit re-sends the FULL set so a material
  // resolved earlier never re-surfaces — no ping-pong if the model re-grounds
  // inconsistently. Reset when the user types a fresh prompt.
  const resolvedClarificationsRef = useRef<Map<string, AiClarificationAnswer>>(new Map())

  // Sidebar state machine: drives UI transitions (ready → interpreting → clarifying → reviewing).
  // Coexists alongside the chat reducer — it adds state-driven UI behavior on top of the existing chat.
  const [sidebar, sidebarDispatch] = useReducer(sidebarReducer, initialSidebarState)

  const handleSend = useCallback(
    async (text: string) => {
      setPrefill(undefined)
      resolvedClarificationsRef.current.clear()
      sidebarDispatch({ type: 'start-interpreting', prompt: text })
      await chat.send(text, { enableThinking: false })
    },
    [chat],
  )

  const handleClarificationsSubmit = useCallback(
    async (answers: AiClarificationAnswer[], requests: AiClarificationRequest[]) => {
      for (const a of answers) {
        const refId = a.ref && typeof a.ref.id === 'string' ? a.ref.id : undefined
        resolvedClarificationsRef.current.set(refId ?? a.requestId, a)
      }
      const all = [...resolvedClarificationsRef.current.values()]
      const answerMap = Object.fromEntries(answers.map((a) => [a.requestId, a]))
      sidebarDispatch({ type: 'submit-answers', answers: answerMap })
      await chat.send(clarificationAnswersPrompt(answers, requests), {
        clarificationAnswers: all,
        enableThinking: false,
      })
    },
    [chat],
  )

  const handleCancelDraft = useCallback(() => {
    sidebarDispatch({ type: 'cancel' })
    resolvedClarificationsRef.current.clear()
    editor?.actions.clearPreview()
  }, [editor])

  const handleSourceIngested = useCallback(
    (
      artifactId: string,
      info: { title?: string; sourceUrl: string; vendor?: string },
    ) => {
      setAddedSources((prev) => {
        if (prev.some((s) => s.artifactId === artifactId)) return prev
        return [...prev, { artifactId, title: info.title ?? artifactId }]
      })
    },
    [],
  )

  const handleOpenSource = useCallback(
    (artifactId: string) => {
      const existing = addedSources.find((s) => s.artifactId === artifactId)
      ws.openTab({
        id: `tab-pdf-${artifactId}`,
        kind: 'pdf',
        artifactId,
        title: existing?.title ?? artifactId,
      })
    },
    [addedSources, ws],
  )

  // Listen for text selection events from the PDF viewer.
  // When the user selects text and clicks "Send to AI", the PDF viewer dispatches
  // a custom event with the selected text. This handler catches it and sends it
  // as a message to the AI chat.
  useEffect(() => {
    const handlePdfSelection = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text: string; pageNumber: number }
      if (!detail || !detail.text) return
      // Send the selected text as a prompt to the AI chat
      void chat.send(`Here is a protocol section from the PDF (page ${detail.pageNumber}):\n\n${detail.text}`, {
        enableThinking: false,
      })
    }
    window.addEventListener('pdf-text-selection', handlePdfSelection)
    return () => window.removeEventListener('pdf-text-selection', handlePdfSelection)
  }, [chat])

  // A ghost preview is on the deck → the next prompt revises it (the context
  // builder attaches draftRevision). Surface that explicitly in the input.
  const previewActive = Boolean(
    editorState?.preview &&
      (editorState.preview.previewPlacements.length > 0 ||
        editorState.preview.previewEvents.length > 0),
  )
  const revisionCount = editorState?.preview?.revisionHistory?.length ?? 0

  return (
    <div className="right-panel ai-tab" data-testid="ai-tab">
      <section className="ai-tab__section ai-tab__section--system-prompt">
        <span
          className="ai-tab__system-prompt-kind"
          data-testid="ai-tab-system-prompt"
        >
          {headerLabel(sidebar)}
        </span>
        {warm ? <WarmIndicator status={warm.status} /> : null}
      </section>

      <section className="ai-tab__section ai-tab__section--sources">
        <SourcesStrip
          studyId={ws.state.studyId}
          activeTab={activeTab}
          addedSources={addedSources}
          onAddSource={() => setAddSourceOpen(true)}
          onOpenSource={handleOpenSource}
        />
      </section>

      {/* Protocol builder — interactive configuration surface for extracted
       *  protocol candidates. Replaces the flat ProtocolSourcePanel with:
       *  - Step preview with inline overrides (skip, quantities)
       *  - Labware mapping panel (concrete record + deck slot assignment)
       *  - Draft → ghost → feedback → redraft → promote workflow
       *
       *  When active tab is a PDF but no candidate has been extracted yet,
       *  show a CTA banner so the user can trigger extraction without typing
       *  a manual prompt. */}
      {chat.state.protocolCandidate ? (
        <section className="ai-tab__section ai-tab__section--protocol">
          <ProtocolBuilderOrchestrator
            candidate={chat.state.protocolCandidate}
            availableLabware={
              editorState
                ? Object.values(editorState.labwares).map((lw) => ({
                    id: lw.labwareId,
                    label: lw.name ?? lw.labwareId,
                    type: lw.labwareType ?? 'plate',
                  }))
                : []
            }
            onDraft={(draftPrompt) => {
              resolvedClarificationsRef.current.clear()

              // Push the protocol candidate into the editor's graphLemurSource
              // so the context builder includes it in the graphLemur block.
              if (editor && chat.state.protocolCandidate) {
                editor.actions.setGraphLemurSource({
                  sourceProtocolCandidate: chat.state.protocolCandidate,
                  ...(chat.state.sourcePdf ? { sourcePdf: chat.state.sourcePdf } : {}),
                })
              }

              void chat.send(draftPrompt, { enableThinking: false })
            }}
            onPromote={() => {
              // Accept the ghost preview events into the event graph
              editor?.actions.commitPreview()
              chat.clearProtocolCandidate()
            }}
            previewActive={previewActive}
            isStreaming={chat.isStreaming}
          />
        </section>
      ) : activeTab && activeTab.kind === 'pdf' && !chat.isStreaming ? (
        <section className="ai-tab__section ai-tab__section--protocol-cta" data-testid="ai-tab-protocol-cta">
          <div className="ai-tab__protocol-cta-banner">
            <h3 className="ai-tab__protocol-cta-title">Extract Protocol from PDF</h3>
            <p className="ai-tab__protocol-cta-desc">
              Click below to extract steps, materials, and labware from the active PDF viewer tab.
            </p>
            <button
              type="button"
              className="ai-tab__protocol-cta-btn"
              onClick={() => {
                resolvedClarificationsRef.current.clear()
                void chat.send(
                  `Extract a protocol from the PDF in the active tab. Identify the procedure steps, materials, and labware.`,
                  { enableThinking: false },
                )
              }}
              data-testid="ai-tab-extract-protocol-btn"
            >
              Extract Protocol
            </button>
          </div>
        </section>
      ) : null}

      <section className="ai-tab__section ai-tab__section--log">
        <MessageLog state={chat.state} />
      </section>

      {sidebar.mode === 'clarifying' ? (
        <section className="ai-tab__section ai-tab__section--questions">
          <QuestionsPanel
            questions={sidebar.questions}
            answers={sidebar.answers}
            activeQuestionId={sidebar.activeQuestionId}
            onAnswer={(qId, ans) => sidebarDispatch({ type: 'answer-question', questionId: qId, answer: ans })}
            onChangeQuestion={(qId) => sidebarDispatch({ type: 'change-question', questionId: qId })}
            onSubmit={() => {
              if (sidebar.mode !== 'clarifying') return
              void handleClarificationsSubmit(Object.values(sidebar.answers), sidebar.questions)
            }}
            onCancel={handleCancelDraft}
          />
        </section>
      ) : null}

      <section className="ai-tab__section ai-tab__section--actions">
        <RunInEventEditorButton
          activeTab={activeTab}
          promptDraft=""
          onPrefilled={(text) => setPrefill(text)}
        />
      </section>

      {previewActive && !chat.state.protocolCandidate ? (
        <section className="ai-tab__section ai-tab__section--revision">
          <div className="ai-tab__revision-hint" role="status">
            <span className="ai-tab__revision-icon" aria-hidden>✎</span>
            <span className="ai-tab__revision-text">
              {revisionCount > 0
                ? `Revising the proposed draft (revision ${revisionCount + 1})`
                : 'Revising the proposed draft'}
              {' — describe a change and press Revise, or Accept / Discard it on the deck.'}
            </span>
            <button
              type="button"
              className="ai-tab__revision-discard"
              onClick={() => editor?.actions.clearPreview()}
              disabled={chat.isStreaming}
              title="Discard the proposed draft and start fresh"
            >Discard</button>
          </div>
        </section>
      ) : null}

      {isChatEnabled(sidebar) ? (
        <section className="ai-tab__section ai-tab__section--input">
          <ChatInput
            isStreaming={chat.isStreaming}
            onSend={handleSend}
            onStop={chat.stop}
            prefill={prefill}
            sendLabel={previewActive ? 'Revise' : 'Send'}
            {...(previewActive ? { placeholder: 'Describe a revision to the proposed draft…' } : {})}
          />
        </section>
      ) : sidebar.mode === 'clarifying' ? (
        <section className="ai-tab__section ai-tab__section--input-disabled">
          <p className="ai-tab__input-disabled-text">
            Answer the questions above to continue.
          </p>
          <button
            type="button"
            className="ai-tab__input-cancel"
            onClick={handleCancelDraft}
          >
            Cancel this draft and start a new prompt
          </button>
        </section>
      ) : null}

      <AddSourceModal
        isOpen={addSourceOpen}
        studyId={ws.state.studyId}
        onIngested={handleSourceIngested}
        onClose={() => setAddSourceOpen(false)}
      />
    </div>
  )
}
