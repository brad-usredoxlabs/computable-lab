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

import { useCallback, useMemo, useState } from 'react'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { useOptionalEventEditor } from '../../EventEditorContext'
import { getPlatformManifest, getVariantManifest } from '../../../shared/lib/platformRegistry'
import type { AiLabwareAddition, AiLabwareRequirement } from '../../../types/ai'
import type { PlateEvent } from '../../../types/events'
import { systemPromptForViewer } from './systemPromptForViewer'
import { SourcesStrip, type AddedSource } from './SourcesStrip'
import { MessageLog } from './MessageLog'
import { ChatInput } from './ChatInput'
import { RunInEventEditorButton } from './RunInEventEditorButton'
import { useChatThread } from './useChatThread'
import { buildPreviewFromDraft } from './draftPreview'
import type { AssistDraftResult } from './assistStream'
import { AddSourceModal } from './AddSourceModal'
import './ai.css'

export function AiTabPanel() {
  const ws = useWorkspace()
  const activeTab = useMemo(() => {
    if (!ws.state.activeTabId) return null
    return ws.state.tabs.find((t) => t.id === ws.state.activeTabId) ?? null
  }, [ws.state.activeTabId, ws.state.tabs])

  const systemPrompt = systemPromptForViewer(activeTab?.kind ?? null)

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
    return {
      studyId: ws.state.studyId,
      activeTabKind: activeTab?.kind ?? null,
      activeArtifactId,
      activeEventGraphId,
      systemPromptId: systemPrompt.id,
      systemPromptBody: systemPrompt.body,
      // Deck tabs: send the live editor state the way the standalone dock
      // does, so the model drafts against real labware/placements instead
      // of a blank deck.
      ...(editorState
        ? {
            labwares: Object.values(editorState.labwares).map((lw) => ({
              labwareId: lw.labwareId,
              labwareType: lw.labwareType,
              name: lw.name,
            })),
            eventSummary:
              editorState.events.length === 0
                ? 'No events yet.'
                : `${editorState.events.length} event${editorState.events.length === 1 ? '' : 's'} in graph.`,
            deckPlatform: editorState.platformId,
            deckVariant: editorState.variantId,
            deckPlacements: editorState.placements.map((p) => ({
              slotId: p.location.kind === 'slot' ? p.location.slotId : 'lawn',
              labwareId: p.labwareId,
            })),
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
      // backend as graphLemur revision context.
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
    [editor],
  )

  const chat = useChatThread({
    surface: systemPrompt.id,
    context,
    onDraftResult,
  })

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

  return (
    <div className="right-panel ai-tab" data-testid="ai-tab">
      <section className="ai-tab__section ai-tab__section--system-prompt">
        <span
          className="ai-tab__system-prompt-kind"
          data-testid="ai-tab-system-prompt"
        >
          {systemPrompt.label}
        </span>
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
        <MessageLog state={chat.state} />
      </section>

      <section className="ai-tab__section ai-tab__section--actions">
        <RunInEventEditorButton
          activeTab={activeTab}
          promptDraft=""
          onPrefilled={(text) => setPrefill(text)}
        />
      </section>

      <section className="ai-tab__section ai-tab__section--input">
        <ChatInput
          isStreaming={chat.isStreaming}
          onSend={handleSend}
          onStop={chat.stop}
          prefill={prefill}
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
