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
import { systemPromptForViewer } from './systemPromptForViewer'
import { SourcesStrip, type AddedSource } from './SourcesStrip'
import { MessageLog } from './MessageLog'
import { ChatInput } from './ChatInput'
import { RunInEventEditorButton } from './RunInEventEditorButton'
import { useChatThread } from './useChatThread'
import { AddSourceModal } from './AddSourceModal'
import './ai.css'

export function AiTabPanel() {
  const ws = useWorkspace()
  const activeTab = useMemo(() => {
    if (!ws.state.activeTabId) return null
    return ws.state.tabs.find((t) => t.id === ws.state.activeTabId) ?? null
  }, [ws.state.activeTabId, ws.state.tabs])

  const systemPrompt = systemPromptForViewer(activeTab?.kind ?? null)

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
    }
  }, [ws.state.studyId, activeTab, systemPrompt])

  const chat = useChatThread({
    surface: systemPrompt.id,
    context,
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
