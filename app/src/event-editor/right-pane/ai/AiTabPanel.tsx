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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { RunInEventEditorButton } from './RunInEventEditorButton'
import { useChatThread } from './useChatThread'
import { buildPreviewFromDraft } from './draftPreview'
import type { AssistDraftResult } from './assistStream'
import { AddSourceModal } from './AddSourceModal'
import './ai.css'

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
    return {
      studyId: ws.state.studyId,
      activeTabKind: activeTab?.kind ?? null,
      activeArtifactId,
      activeEventGraphId,
      systemPromptId: systemPrompt.id,
      systemPromptBody: systemPrompt.body,
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
      ...(sourceProtocolCandidate || sourcePdf
        ? {
            graphLemur: {
              ...(editorState?.preview ? { revisionMode: true } : {}),
              ...(sourceProtocolCandidate ? { sourceProtocolCandidate } : {}),
              ...(sourcePdf ? { sourcePdf } : {}),
            },
          }
        : {}),
    }
  }, [ws.state.studyId, activeTab, systemPrompt, editorState])

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
    },
    [editor],
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

  const handleSend = useCallback(
    async (text: string) => {
      setPrefill(undefined)
      await chat.send(text)
    },
    [chat],
  )

  const handleClarificationAnswer = useCallback(
    async (answer: AiClarificationAnswer, request: AiClarificationRequest) => {
      const label = answer.label ?? answer.value ?? answer.optionId ?? 'answer'
      const prompt = `Use ${label} for ${request.entityType ?? request.kind}.`
      await chat.send(prompt, { clarificationAnswers: [answer] })
    },
    [chat],
  )

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
          {systemPrompt.label}
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

      <section className="ai-tab__section ai-tab__section--log">
        <MessageLog state={chat.state} onClarificationAnswer={handleClarificationAnswer} />
      </section>

      <section className="ai-tab__section ai-tab__section--actions">
        <RunInEventEditorButton
          activeTab={activeTab}
          promptDraft=""
          onPrefilled={(text) => setPrefill(text)}
        />
      </section>

      {previewActive ? (
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

      <AddSourceModal
        isOpen={addSourceOpen}
        studyId={ws.state.studyId}
        onIngested={handleSourceIngested}
        onClose={() => setAddSourceOpen(false)}
      />
    </div>
  )
}
