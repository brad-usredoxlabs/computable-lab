import { useState } from 'react'
import { apiClient } from '../../shared/api/client'
import type { IssueExplanation, IngestionIssueRecord } from '../../types/ingestion'

interface Props {
  issue: IngestionIssueRecord
  jobId: string
}

export function IngestionIssueExplainer({ issue, jobId }: Props) {
  const [explanation, setExplanation] = useState<IssueExplanation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExplain() {
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.explainIngestionIssue({ issueId: issue.recordId, jobId })
      setExplanation(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get explanation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="issue-explainer">
      {!explanation && !loading && (
        <button
          type="button"
          className="btn btn-sm btn-ghost issue-explainer__btn"
          onClick={() => { void handleExplain() }}
          disabled={loading}
        >
          <span className="ai-suggestion__icon" style={{ width: '1.2rem', height: '1.2rem', fontSize: '0.6rem' }}>AI</span>
          Explain
        </button>
      )}
      {loading && <span className="issue-explainer__loading">Analyzing issue...</span>}
      {error && <div className="issue-explainer__error">{error}</div>}
      {explanation && (
        <div className="issue-explainer__result">
          <div className="issue-explainer__explanation">
            <strong>Explanation</strong>
            <p>{explanation.explanation}</p>
          </div>
          <div className="issue-explainer__fix">
            <strong>Suggested Fix</strong>
            <p>{explanation.suggestedFix}</p>
          </div>
        </div>
      )}
      <style>{`
        .issue-explainer { margin-top: 0.4rem; }
        .issue-explainer__btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.5rem; border: 1px solid #bac8ff; border-radius: 8px; background: #edf2ff; color: #364fc7; font-size: 0.78rem; cursor: pointer; }
        .issue-explainer__btn:hover { background: #dbe4ff; }
        .issue-explainer__loading { color: #5c7cfa; font-size: 0.82rem; font-style: italic; }
        .issue-explainer__error { color: #c92a2a; font-size: 0.82rem; }
        .issue-explainer__result { margin-top: 0.4rem; padding: 0.6rem 0.75rem; border: 1px solid #bac8ff; border-radius: 10px; background: #f8f9ff; font-size: 0.85rem; }
        .issue-explainer__result strong { display: block; margin-bottom: 0.2rem; color: #364fc7; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .issue-explainer__result p { margin: 0 0 0.5rem; color: #495057; }
        .issue-explainer__fix { border-top: 1px solid #dbe4ff; padding-top: 0.5rem; }
        .btn-ghost { background: transparent; border: 1px solid #ced4da; }
      `}</style>
    </div>
  )
}
