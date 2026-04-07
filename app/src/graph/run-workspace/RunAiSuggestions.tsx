import { useState } from 'react'
import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'

type SuggestionTab = 'biology' | 'readouts' | 'results' | 'claims'

interface RunAiSuggestionsProps {
  runId: string
  tab: SuggestionTab
  chat: UseAiChatReturn
}

const TAB_PROMPTS: Record<SuggestionTab, string> = {
  biology: 'Review the biology layer of this run and suggest improvements. Look for wells without biological role assignments, missing controls (vehicle, positive, negative), and any inconsistencies in replicate grouping. Be specific about well IDs and counts.',
  readouts: 'Review the readouts configuration of this run and suggest improvements. Look for read events without measurement contexts, measurement contexts without instruments or assay definitions, and any gaps in readout coverage.',
  results: 'Review the results of this run and suggest improvements. Look for measurement files that have not been ingested, measurement contexts without linked measurements, and any QC concerns.',
  claims: 'Review the claims layer of this run and suggest improvements. Look for measurement contexts with results but no associated claims, evidence gaps, and assertions without supporting evidence.',
}

export function RunAiSuggestions({ runId, tab, chat }: RunAiSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleGetSuggestions = () => {
    if (chat.isStreaming || loading) return
    setLoading(true)
    setSuggestions(null)
    chat.sendPrompt(`For run ${runId}: ${TAB_PROMPTS[tab]}`)
    const check = setInterval(() => {
      const messages = chat.messages
      const last = messages[messages.length - 1]
      if (last && last.role === 'assistant' && !last.isStreaming && last.content) {
        setSuggestions(last.content)
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
    <div className="run-ai-suggestions">
      <div className="run-ai-suggestions__header">
        <span className="run-ai-suggestions__label">AI Suggestions</span>
        <button
          type="button"
          className="run-ai-suggestions__btn"
          onClick={handleGetSuggestions}
          disabled={chat.isStreaming || loading}
        >
          {loading ? 'Analyzing...' : 'Get suggestions'}
        </button>
      </div>
      {suggestions ? (
        <div className="run-ai-suggestions__content">
          <div className="run-ai-suggestions__text">{suggestions}</div>
        </div>
      ) : null}

      <style>{`
        .run-ai-suggestions {
          margin-top: 1rem;
          padding: 0.75rem 1rem;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 12px;
        }
        .run-ai-suggestions__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .run-ai-suggestions__label {
          font-weight: 700;
          font-size: 0.85rem;
          color: #15803d;
        }
        .run-ai-suggestions__btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          border: 1px solid #86efac;
          background: #dcfce7;
          color: #15803d;
          font-weight: 600;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .run-ai-suggestions__btn:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .run-ai-suggestions__content {
          margin-top: 0.6rem;
        }
        .run-ai-suggestions__text {
          white-space: pre-wrap;
          line-height: 1.5;
          color: #1e293b;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  )
}
