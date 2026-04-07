import { useState } from 'react'
import { apiClient } from '../../shared/api/client'
import type { IngestionSourceKind, SourceKindSuggestion, RunMappingSuggestion } from '../../types/ingestion'

interface SourceKindSuggestionProps {
  suggestion: SourceKindSuggestion | null
  loading: boolean
  onAccept: (kind: IngestionSourceKind) => void
}

export function SourceKindSuggestionBadge({ suggestion, loading, onAccept }: SourceKindSuggestionProps) {
  if (loading) {
    return <span className="ai-suggestion ai-suggestion--loading">Analyzing file...</span>
  }
  if (!suggestion) return null

  const confidenceLabel = suggestion.confidence >= 0.7 ? 'high' : suggestion.confidence >= 0.4 ? 'medium' : 'low'

  return (
    <div className="ai-suggestion ai-suggestion--source-kind">
      <span className="ai-suggestion__icon">AI</span>
      <div className="ai-suggestion__body">
        <div className="ai-suggestion__head">
          <strong>{suggestion.suggestedKind.replace(/_/g, ' ')}</strong>
          <span className={`ai-suggestion__confidence ai-suggestion__confidence--${confidenceLabel}`}>
            {Math.round(suggestion.confidence * 100)}%
          </span>
        </div>
        <p className="ai-suggestion__reasoning">{suggestion.reasoning}</p>
      </div>
      <button
        type="button"
        className="btn btn-sm btn-primary ai-suggestion__accept"
        onClick={() => onAccept(suggestion.suggestedKind)}
      >
        Accept
      </button>
      <style>{`
        .ai-suggestion { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 10px; background: #edf2ff; border: 1px solid #bac8ff; font-size: 0.85rem; }
        .ai-suggestion--loading { color: #5c7cfa; background: #f3f6ff; border-color: #dbe4ff; font-style: italic; }
        .ai-suggestion__icon { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem; border-radius: 999px; background: #4263eb; color: white; font-size: 0.7rem; font-weight: 700; flex-shrink: 0; }
        .ai-suggestion__body { flex: 1; min-width: 0; }
        .ai-suggestion__head { display: flex; align-items: center; gap: 0.5rem; }
        .ai-suggestion__head strong { text-transform: capitalize; }
        .ai-suggestion__confidence { font-size: 0.78rem; border-radius: 999px; padding: 0.1rem 0.4rem; }
        .ai-suggestion__confidence--high { background: #d3f9d8; color: #2b8a3e; }
        .ai-suggestion__confidence--medium { background: #fff3bf; color: #e67700; }
        .ai-suggestion__confidence--low { background: #ffe3e3; color: #c92a2a; }
        .ai-suggestion__reasoning { margin: 0.2rem 0 0; color: #495057; font-size: 0.82rem; }
        .ai-suggestion__accept { flex-shrink: 0; }
        .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.8rem; border-radius: 8px; border: none; cursor: pointer; }
      `}</style>
    </div>
  )
}

interface RunMappingPanelProps {
  jobId: string | null
  sourceKind: IngestionSourceKind
}

export function RunMappingPanel({ jobId, sourceKind }: RunMappingPanelProps) {
  const [suggestions, setSuggestions] = useState<RunMappingSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  async function handleMapToRun() {
    if (!jobId) return
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.suggestIngestionMapping({ jobId, suggestedKind: sourceKind })
      setSuggestions(response.suggestions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get run mapping suggestions')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="run-mapping-panel">
      <div className="run-mapping-panel__head">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => { void handleMapToRun() }}
          disabled={loading || !jobId}
        >
          <span className="ai-suggestion__icon" style={{ width: '1.2rem', height: '1.2rem', fontSize: '0.6rem' }}>AI</span>
          {loading ? 'Mapping...' : 'AI Map to Run'}
        </button>
      </div>
      {error && <div className="run-mapping-panel__error">{error}</div>}
      {suggestions.length > 0 && (
        <div className="run-mapping-panel__list">
          {suggestions.map((s) => (
            <div
              key={s.runId}
              className={`run-mapping-panel__item ${selectedRunId === s.runId ? 'run-mapping-panel__item--selected' : ''}`}
              onClick={() => setSelectedRunId(s.runId)}
            >
              <div className="run-mapping-panel__item-head">
                <strong>{s.runTitle}</strong>
                <span className={`ai-suggestion__confidence ai-suggestion__confidence--${s.confidence >= 0.7 ? 'high' : s.confidence >= 0.4 ? 'medium' : 'low'}`}>
                  {Math.round(s.confidence * 100)}%
                </span>
              </div>
              <p className="run-mapping-panel__reasoning">{s.reasoning}</p>
              {s.readEventIndex !== undefined && <span className="run-mapping-panel__detail">Read Event {s.readEventIndex}</span>}
              {s.measurementContextId && <span className="run-mapping-panel__detail">Context: {s.measurementContextId}</span>}
            </div>
          ))}
        </div>
      )}
      <style>{`
        .run-mapping-panel { margin-top: 0.75rem; }
        .run-mapping-panel__head { display: flex; align-items: center; gap: 0.5rem; }
        .run-mapping-panel__error { margin-top: 0.5rem; color: #c92a2a; font-size: 0.85rem; }
        .run-mapping-panel__list { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem; }
        .run-mapping-panel__item { padding: 0.6rem 0.75rem; border: 1px solid #e9ecef; border-radius: 10px; cursor: pointer; background: white; }
        .run-mapping-panel__item:hover { border-color: #bac8ff; background: #f8f9ff; }
        .run-mapping-panel__item--selected { border-color: #4263eb; background: #edf2ff; }
        .run-mapping-panel__item-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
        .run-mapping-panel__reasoning { margin: 0.2rem 0 0; color: #495057; font-size: 0.82rem; }
        .run-mapping-panel__detail { display: inline-block; margin-top: 0.25rem; margin-right: 0.5rem; font-size: 0.78rem; color: #5c7cfa; }
      `}</style>
    </div>
  )
}
