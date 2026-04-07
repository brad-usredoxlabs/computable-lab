import { useState } from 'react'
import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'

interface RunClaimDraftPanelProps {
  runId: string
  chat: UseAiChatReturn
  onRefresh?: () => Promise<void>
}

export function RunClaimDraftPanel({ runId, chat }: RunClaimDraftPanelProps) {
  const [draftContent, setDraftContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleDraftClaims = () => {
    if (chat.isStreaming || loading) return
    setLoading(true)
    setDraftContent(null)
    chat.sendPrompt(
      `Draft claims from the results of this run (${runId}). Use the run_draft_claims tool to analyze the measurements, well role assignments, and biological context. Propose structured claim and evidence records with confidence levels and note any unresolved questions.`
    )
    const check = setInterval(() => {
      const messages = chat.messages
      const last = messages[messages.length - 1]
      if (last && last.role === 'assistant' && !last.isStreaming && last.content) {
        setDraftContent(last.content)
        setLoading(false)
        clearInterval(check)
      }
    }, 500)
    setTimeout(() => {
      clearInterval(check)
      setLoading(false)
    }, 60_000)
  }

  return (
    <div className="run-claim-draft-panel">
      <div className="run-claim-draft-panel__header">
        <h3>AI Claim Drafting</h3>
        <button
          type="button"
          className="run-ai-action-btn"
          onClick={handleDraftClaims}
          disabled={chat.isStreaming || loading}
        >
          {loading ? 'Drafting claims...' : 'Draft claims from results'}
        </button>
      </div>
      {draftContent ? (
        <div className="run-claim-draft-panel__content">
          <div className="run-claim-draft-panel__text">{draftContent}</div>
          <p className="run-ai-summary__draft-notice">
            These are AI-drafted claim proposals. No records have been saved. Review carefully before accepting.
          </p>
        </div>
      ) : (
        <p className="run-claim-draft-panel__placeholder">
          Click "Draft claims from results" to have AI analyze measurements and propose structured claim and evidence records.
        </p>
      )}

      <style>{`
        .run-claim-draft-panel {
          margin-top: 1rem;
          padding: 1rem;
          background: #fefce8;
          border: 1px solid #fde68a;
          border-radius: 12px;
        }
        .run-claim-draft-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.75rem;
        }
        .run-claim-draft-panel__header h3 { margin: 0; }
        .run-claim-draft-panel__content {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 1rem;
        }
        .run-claim-draft-panel__text {
          white-space: pre-wrap;
          line-height: 1.6;
          color: #1e293b;
        }
        .run-claim-draft-panel__placeholder {
          color: #94a3b8;
        }
      `}</style>
    </div>
  )
}
