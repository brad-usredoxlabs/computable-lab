import { useState } from 'react'
import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'

interface RunSimilarRunsProps {
  runId: string
  chat: UseAiChatReturn
}

export function RunSimilarRuns({ runId, chat }: RunSimilarRunsProps) {
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFindSimilar = () => {
    if (chat.isStreaming || loading) return
    setLoading(true)
    setMessage(null)
    chat.sendPrompt(
      `Find runs similar to this run (${runId}). Use the run_find_similar tool to search for runs with overlapping experiments, materials, event types, or biological contexts. Present the results as a ranked list.`
    )
    const check = setInterval(() => {
      const messages = chat.messages
      const last = messages[messages.length - 1]
      if (last && last.role === 'assistant' && !last.isStreaming && last.content) {
        setMessage(last.content)
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
    <section className="run-workspace-card run-similar-runs">
      <div className="run-similar-runs__header">
        <h2>Similar Runs</h2>
        <button
          type="button"
          className="run-ai-action-btn"
          onClick={handleFindSimilar}
          disabled={chat.isStreaming || loading}
        >
          {loading ? 'Searching...' : 'Find similar runs'}
        </button>
      </div>
      {message ? (
        <div className="run-similar-runs__content">
          <div className="run-similar-runs__text">{message}</div>
          <p className="run-ai-summary__draft-notice">
            AI-generated similarity analysis. Results may not be exhaustive.
          </p>
        </div>
      ) : (
        <p className="run-similar-runs__placeholder">
          Click "Find similar runs" to search for runs with comparable materials, methods, or biological contexts.
        </p>
      )}

      <style>{`
        .run-similar-runs__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.75rem;
        }
        .run-similar-runs__header h2 { margin: 0; }
        .run-similar-runs__content {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1rem;
        }
        .run-similar-runs__text {
          white-space: pre-wrap;
          line-height: 1.6;
          color: #1e293b;
        }
        .run-similar-runs__placeholder {
          color: #94a3b8;
        }
      `}</style>
    </section>
  )
}
