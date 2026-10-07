/**
 * AnalysisChatPanel — PB-CH-6: the Analysis-local chat (OQ2 ruling (a):
 * compact chat column in the right pane above the artifact area).
 *
 * There was NO chat surface at /analysis before this item — AnalysisPage's
 * only AI affordance was the one-shot `analysis-ai-author` box (kept
 * byte-identical; PB-CH-5 depends on it). This panel is composed from the
 * existing channel parts, NOT AiTabPanel dragged onto the page (it requires
 * useWorkspace, which throws outside WorkspaceProvider):
 *   - `useAiChat({ aiContext })` on the new `analysis` AiSurface (memory-only
 *     thread — no ApplianceEndpoint hunk; the mount-time call set of
 *     AnalysisPage stays list-only until the user sends);
 *   - `useWorkstateProposalFlow` — the ONE compile→card→accept/reject
 *     implementation (shared with AiTabPanel; no fork here);
 *   - `WorkstateProposalCard` rendered inline in the panel.
 *
 * Missing-capability arms (each NAMED + tested, never a silent no-op):
 *   - aiAvailable === false ⇒ disabled input + reason line, send never fires;
 *   - executor NO_TAB_STORE / other executor diagnostics ⇒ surfaced verbatim
 *     on the blocked card (the flow's tested behavior);
 *   - canAccept:false ⇒ the card's blocked phase (existing, unchanged).
 */
import { useCallback, useMemo, useState } from 'react'
import { useAiChat } from '../shared/hooks/useAiChat'
import { useWorkstateProposalFlow } from '../shared/ai/useWorkstateProposalFlow'
import { WorkstateProposalCard } from '../event-editor/right-pane/ai/WorkstateProposalCard'
import type { AiContext } from '../types/aiContext'

export function AnalysisChatPanel() {
  // The `analysis` surface carries no params (surfaces.yaml:57-62 — an
  // AI-context surface, not deep-linkable), so the context payload is the
  // surface identity + a stable summary; per-run detail rides the prompt.
  const aiContext = useMemo<AiContext>(
    () => ({
      surface: 'analysis',
      summary: 'Analysis work surface — methods (revisions), runs, and rendered outputs.',
      surfaceContext: {},
    }),
    [],
  )

  const flow = useWorkstateProposalFlow()
  const aiChat = useAiChat({
    aiContext,
    onWorkstateProposal: (intent) => {
      void flow.proposeWorkstate('workstate', intent)
    },
    onAgentAction: flow.handleAgentAction,
  })

  const [draft, setDraft] = useState('')
  // Health gate: `null` = health check still in flight (input usable — the
  // check is fast and a failed send surfaces its own error); `false` = the
  // named unavailable arm below. Never a dead button without a reason.
  const unavailable = aiChat.aiAvailable === false

  const send = useCallback(() => {
    const text = draft.trim()
    if (!text || unavailable || aiChat.isStreaming) return
    aiChat.sendPrompt(text)
    setDraft('')
  }, [draft, unavailable, aiChat])

  return (
    <div className="analysis-chat" data-testid="analysis-chat-panel">
      <div className="analysis-chat__header">
        <span className="analysis-chat__title">Ask about this analysis</span>
        <span className="analysis-chat__hint">Proposals arrive as a card — nothing is written until you Accept.</span>
      </div>

      <div className="analysis-chat__messages" data-testid="analysis-chat-messages">
        {aiChat.messages.map((m) => (
          <div key={m.id} className={`analysis-chat__message analysis-chat__message--${m.role}`}>
            <span className="analysis-chat__role">{m.role === 'user' ? 'You' : m.role === 'assistant' ? 'AI' : 'System'}</span>
            <span className="analysis-chat__content">{m.content}</span>
          </div>
        ))}
        {aiChat.messages.length === 0 ? (
          <p className="analysis-chat__empty">
            Ask the assistant to compose a workspace, open a run, or explain a method.
          </p>
        ) : null}
      </div>

      {flow.card ? (
        // The tier-2 review card rides the chat itself (same discipline as
        // the run page): while a card is pending NO proposed tab is rendered
        // anywhere — the workspace adopts a workstate only through Accept →
        // the single writer.
        <WorkstateProposalCard
          phase={flow.card.phase}
          {...(flow.card.summary !== undefined ? { summary: flow.card.summary } : {})}
          {...(flow.card.tabs ? { tabs: flow.card.tabs } : {})}
          {...(flow.card.resolvedTerms ? { resolvedTerms: flow.card.resolvedTerms } : {})}
          {...(flow.card.diagnostics ? { diagnostics: flow.card.diagnostics } : {})}
          {...(flow.card.draftId !== undefined ? { draftId: flow.card.draftId } : {})}
          {...(flow.card.revision !== undefined ? { revision: flow.card.revision } : {})}
          onAccept={() => void flow.acceptWorkstate()}
          onReject={flow.rejectWorkstate}
        />
      ) : null}

      {unavailable ? (
        <div className="analysis-chat__unavailable" data-testid="analysis-chat-unavailable" role="status">
          The local AI is unavailable right now — chat is disabled until the model is healthy. Everything else on this page still works.
        </div>
      ) : null}

      <div className="analysis-chat__input-area">
        <textarea
          data-testid="analysis-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. compose the workspace: open the analysis surface"
          rows={2}
          disabled={unavailable || aiChat.isStreaming}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          type="button"
          data-testid="analysis-chat-send"
          onClick={send}
          disabled={unavailable || aiChat.isStreaming || draft.trim().length === 0}
        >
          {aiChat.isStreaming ? 'Thinking…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
