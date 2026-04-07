import { useState } from 'react'
import type { UseEvidenceAssemblyReturn } from '../hooks/useEvidenceAssembly'
import type { RunWorkspaceResponse } from '../../shared/api/client'

interface EvidenceAssemblyPanelProps {
  assembly: UseEvidenceAssemblyReturn
  workspace: RunWorkspaceResponse | null
}

export function EvidenceAssemblyPanel({ assembly, workspace }: EvidenceAssemblyPanelProps) {
  const [includeWellGrouping, setIncludeWellGrouping] = useState(true)
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([])

  const contexts = workspace?.measurementContexts ?? []

  const handleAssemble = () => {
    const ids = selectedContextIds.length > 0 ? selectedContextIds : undefined
    assembly.assembleEvidence(ids, includeWellGrouping)
  }

  const handleBatchAll = () => {
    assembly.assembleEvidence(undefined, includeWellGrouping)
  }

  const toggleContext = (id: string) => {
    setSelectedContextIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  return (
    <div className="evidence-assembly-panel">
      <div className="evidence-assembly-panel__header">
        <h3>Evidence Assembly</h3>
        <div className="evidence-assembly-panel__actions">
          <button
            type="button"
            className="run-ai-action-btn"
            onClick={handleAssemble}
            disabled={assembly.assemblyLoading}
          >
            {assembly.assemblyLoading ? 'Assembling...' : 'Build evidence from results'}
          </button>
          {contexts.length > 1 && (
            <button
              type="button"
              className="run-ai-action-btn run-ai-action-btn--secondary"
              onClick={handleBatchAll}
              disabled={assembly.assemblyLoading}
            >
              Batch all contexts
            </button>
          )}
        </div>
      </div>

      {contexts.length > 1 && !assembly.assemblyResult && (
        <div className="evidence-assembly-panel__filters">
          <div className="evidence-assembly-panel__context-filter">
            <span>Filter by context:</span>
            {contexts.map((ctx) => (
              <label key={ctx.recordId} className="evidence-assembly-panel__context-chip">
                <input
                  type="checkbox"
                  checked={selectedContextIds.includes(ctx.recordId)}
                  onChange={() => toggleContext(ctx.recordId)}
                />
                {ctx.payload.name}
              </label>
            ))}
          </div>
          <label className="evidence-assembly-panel__well-toggle">
            <input
              type="checkbox"
              checked={includeWellGrouping}
              onChange={(e) => setIncludeWellGrouping(e.target.checked)}
            />
            Group by well groups
          </label>
        </div>
      )}

      {assembly.assemblyError && (
        <div className="evidence-assembly-panel__error">{assembly.assemblyError}</div>
      )}

      {assembly.assemblyResult && (
        <div className="evidence-assembly-panel__content">
          <div className="evidence-assembly-panel__text">
            {assembly.assemblyResult.content || 'Processing...'}
          </div>
          <p className="evidence-assembly-panel__notice">
            These are AI-proposed evidence records. Review carefully before accepting.
            No records have been saved yet.
          </p>
          <button type="button" className="evidence-assembly-panel__clear" onClick={assembly.clearAssembly}>
            Clear proposals
          </button>
        </div>
      )}

      <style>{`
        .evidence-assembly-panel {
          margin-top: 1rem;
          padding: 1rem;
          background: #fefce8;
          border: 1px solid #fde68a;
          border-radius: 12px;
        }
        .evidence-assembly-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.5rem;
          flex-wrap: wrap;
        }
        .evidence-assembly-panel__header h3 { margin: 0; }
        .evidence-assembly-panel__actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .run-ai-action-btn--secondary {
          background: #ffffff !important;
          color: #0969da !important;
          border-color: #b6d1ff !important;
        }
        .evidence-assembly-panel__filters {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .evidence-assembly-panel__context-filter {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          font-size: 0.85rem;
          color: #475569;
        }
        .evidence-assembly-panel__context-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.2rem 0.5rem;
          background: #fef9c3;
          border-radius: 999px;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .evidence-assembly-panel__well-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.85rem;
          color: #475569;
        }
        .evidence-assembly-panel__error {
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #b91c1c;
          border-radius: 8px;
          padding: 0.6rem 0.85rem;
          font-size: 0.85rem;
          margin-bottom: 0.75rem;
        }
        .evidence-assembly-panel__content {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 1rem;
        }
        .evidence-assembly-panel__text {
          white-space: pre-wrap;
          line-height: 1.6;
          color: #1e293b;
          font-size: 0.9rem;
        }
        .evidence-assembly-panel__notice {
          font-size: 0.8rem;
          color: #92400e;
          margin-top: 0.75rem;
          font-style: italic;
        }
        .evidence-assembly-panel__clear {
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
