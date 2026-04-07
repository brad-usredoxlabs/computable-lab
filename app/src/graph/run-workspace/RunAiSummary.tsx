import { useState } from 'react'
import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'

interface RunAiSummaryProps {
  runId: string
  chat: UseAiChatReturn
}

interface SummaryData {
  content: string
  timestamp: number
}

export function RunAiSummary({ runId, chat }: RunAiSummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSummarize = () => {
    if (chat.isStreaming || loading) return
    setLoading(true)
    setSummary(null)
    chat.sendPrompt(
      `Summarize this run (${runId}). Provide a structured summary including: run intent, key materials used, event count, measurement status, and open questions. Use the run_summarize tool to gather the data first.`
    )
    // Watch for the response to complete
    const check = setInterval(() => {
      const messages = chat.messages
      const last = messages[messages.length - 1]
      if (last && last.role === 'assistant' && !last.isStreaming && last.content) {
        setSummary({ content: last.content, timestamp: Date.now() })
        setLoading(false)
        clearInterval(check)
      }
    }, 500)
    // Safety timeout
    setTimeout(() => {
      clearInterval(check)
      setLoading(false)
    }, 60_000)
  }

  return (
    <section className="run-workspace-card run-ai-summary">
      <div className="run-ai-summary__header">
        <h2>AI Summary</h2>
        <button
          type="button"
          className="run-ai-action-btn"
          onClick={handleSummarize}
          disabled={chat.isStreaming || loading}
        >
          {loading ? 'Summarizing...' : 'Summarize this run'}
        </button>
      </div>
      {summary ? (
        <div className="run-ai-summary__content">
          <div className="run-ai-summary__text">{summary.content}</div>
          <p className="run-ai-summary__draft-notice">
            This is an AI-generated draft summary. It has not been saved to any record.
          </p>
        </div>
      ) : (
        <p className="run-ai-summary__placeholder">
          Click "Summarize this run" to generate an AI-powered structured summary of this run's intent, materials, events, and status.
        </p>
      )}

      <style>{`
        .run-ai-summary__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.75rem;
        }
        .run-ai-summary__header h2 { margin: 0; }
        .run-ai-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.85rem;
          border-radius: 999px;
          border: 1px solid #b6d1ff;
          background: #eff6ff;
          color: #0969da;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .run-ai-action-btn:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .run-ai-summary__content {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1rem;
        }
        .run-ai-summary__text {
          white-space: pre-wrap;
          line-height: 1.6;
          color: #1e293b;
        }
        .run-ai-summary__draft-notice {
          margin-top: 0.75rem;
          font-size: 0.8rem;
          color: #94a3b8;
          font-style: italic;
        }
        .run-ai-summary__placeholder {
          color: #94a3b8;
        }
      `}</style>
    </section>
  )
}
