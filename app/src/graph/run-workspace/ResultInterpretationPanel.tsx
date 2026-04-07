import { useState } from 'react'
import type { UseResultInterpretationReturn } from '../hooks/useResultInterpretation'
import type { RunWorkspaceResponse } from '../../shared/api/client'

interface ResultInterpretationPanelProps {
  interpretation: UseResultInterpretationReturn
  workspace: RunWorkspaceResponse | null
}

export function ResultInterpretationPanel({ interpretation, workspace }: ResultInterpretationPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([])

  const contexts = workspace?.measurementContexts ?? []

  const handleInterpret = () => {
    const ids = selectedContextIds.length > 0 ? selectedContextIds : undefined
    interpretation.interpret(ids)
  }

  const toggleContext = (id: string) => {
    setSelectedContextIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  return (
    <div className="result-interpretation-panel">
      <div className="result-interpretation-panel__header">
        <h3>Result Interpretation</h3>
        <div className="result-interpretation-panel__actions">
          {interpretation.interpretation && (
            <button type="button" className="result-interpretation-panel__toggle" onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
          )}
          <button
            type="button"
            className="run-ai-action-btn"
            onClick={handleInterpret}
            disabled={interpretation.loading}
          >
            {interpretation.loading ? 'Interpreting...' : 'Interpret results'}
          </button>
        </div>
      </div>

      {contexts.length > 1 && !interpretation.interpretation && (
        <div className="result-interpretation-panel__context-filter">
          <span>Filter by context:</span>
          {contexts.map((ctx) => (
            <label key={ctx.recordId} className="result-interpretation-panel__context-chip">
              <input
                type="checkbox"
                checked={selectedContextIds.includes(ctx.recordId)}
                onChange={() => toggleContext(ctx.recordId)}
              />
              {ctx.payload.name}
            </label>
          ))}
        </div>
      )}

      {interpretation.error && (
        <div className="result-interpretation-panel__error">{interpretation.error}</div>
      )}

      {interpretation.interpretation && !collapsed && (
        <div className="result-interpretation-panel__content">
          <div className="result-interpretation-panel__text">
            {interpretation.interpretation.content || 'Processing...'}
          </div>
          <p className="result-interpretation-panel__notice">
            This is an AI-generated interpretation. It is informational only and not saved as a record.
          </p>
          <button type="button" className="result-interpretation-panel__clear" onClick={interpretation.clear}>
            Clear interpretation
          </button>
        </div>
      )}

      <style>{`
        .result-interpretation-panel {
          margin-top: 1rem;
          padding: 1rem;
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 12px;
        }
        .result-interpretation-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.5rem;
        }
        .result-interpretation-panel__header h3 { margin: 0; }
        .result-interpretation-panel__actions {
          display: flex;
          gap: 0.5rem;
        }
        .result-interpretation-panel__toggle {
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          border: 1px solid #d8dee4;
          background: #ffffff;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .result-interpretation-panel__context-filter {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 0.75rem;
          font-size: 0.85rem;
          color: #475569;
        }
        .result-interpretation-panel__context-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.2rem 0.5rem;
          background: #e0f2fe;
          border-radius: 999px;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .result-interpretation-panel__error {
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #b91c1c;
          border-radius: 8px;
          padding: 0.6rem 0.85rem;
          font-size: 0.85rem;
          margin-bottom: 0.75rem;
        }
        .result-interpretation-panel__content {
          background: #ffffff;
          border: 1px solid #e0f2fe;
          border-radius: 8px;
          padding: 1rem;
        }
        .result-interpretation-panel__text {
          white-space: pre-wrap;
          line-height: 1.6;
          color: #1e293b;
          font-size: 0.9rem;
        }
        .result-interpretation-panel__notice {
          font-size: 0.8rem;
          color: #64748b;
          margin-top: 0.75rem;
          font-style: italic;
        }
        .result-interpretation-panel__clear {
          margin-top: 0.5rem;
          padding: 0.3rem 0.6rem;
          border-radius: 999px;
          border: 1px solid #d8dee4;
          background: #ffffff;
          font-size: 0.75rem;
          cursor: pointer;
          color: #64748b;
        }
      `}</style>
    </div>
  )
}
