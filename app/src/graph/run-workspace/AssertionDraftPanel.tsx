import { useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { streamPipelineSSE } from '../../shared/api/aiClient'
import type { AiStreamEvent } from '../../types/ai'
import type { UseEvidenceAssemblyReturn } from '../hooks/useEvidenceAssembly'
import type { RunWorkspaceResponse } from '../../shared/api/client'

function extractContent(event: AiStreamEvent): string {
  if (event.type === 'done') {
    const result = event.result
    if (result.notes?.length) return result.notes.join('\n')
    if (result.error) return result.error
    return JSON.stringify(result, null, 2)
  }
  if (event.type === 'tool_result' && event.result != null) {
    return typeof event.result === 'string' ? event.result : JSON.stringify(event.result, null, 2)
  }
  return ''
}

interface AssertionDraftPanelProps {
  runId: string
  assembly: UseEvidenceAssemblyReturn
  workspace: RunWorkspaceResponse | null
}

export function AssertionDraftPanel({ runId, assembly, workspace }: AssertionDraftPanelProps) {
  const [contradictionCheck, setContradictionCheck] = useState<string | null>(null)
  const [contradictionLoading, setContradictionLoading] = useState(false)
  const [contradictionError, setContradictionError] = useState<string | null>(null)
  const [checkStatement, setCheckStatement] = useState('')
  const [checkScope, setCheckScope] = useState('')

  const evidenceIds = workspace?.evidence.map((e) => e.recordId) ?? []

  const handleDraftAssertions = () => {
    assembly.draftAssertions(evidenceIds.length > 0 ? evidenceIds : undefined, true)
  }

  const handleCheckContradiction = async () => {
    if (!checkStatement.trim()) return
    setContradictionLoading(true)
    setContradictionError(null)
    setContradictionCheck(null)

    const { url, init } = apiClient.checkContradictions(runId, {
      statement: checkStatement,
      scope: checkScope || undefined,
    })

    let content = ''
    try {
      for await (const event of streamPipelineSSE(url, init)) {
        if (event.type === 'error') {
          setContradictionError(event.message ?? 'Check failed')
          break
        }
        const chunk = extractContent(event)
        if (chunk) content += (content ? '\n' : '') + chunk
        setContradictionCheck(content)
      }
      setContradictionCheck(content)
    } catch (err) {
      setContradictionError(err instanceof Error ? err.message : String(err))
    } finally {
      setContradictionLoading(false)
    }
  }

  return (
    <div className="assertion-draft-panel">
      <div className="assertion-draft-panel__header">
        <h3>Assertion Drafting</h3>
        <button
          type="button"
          className="run-ai-action-btn"
          onClick={handleDraftAssertions}
          disabled={assembly.assertionLoading}
        >
          {assembly.assertionLoading ? 'Drafting assertions...' : 'Draft assertions'}
        </button>
      </div>

      {assembly.assertionError && (
        <div className="assertion-draft-panel__error">{assembly.assertionError}</div>
      )}

      {assembly.assertionResult && (
        <div className="assertion-draft-panel__content">
          <div className="assertion-draft-panel__text">
            {assembly.assertionResult.content || 'Processing...'}
          </div>
          <p className="assertion-draft-panel__notice">
            These are AI-drafted assertion proposals with confidence scores and evidence links.
            Review for accuracy before accepting.
          </p>
          <button type="button" className="assertion-draft-panel__clear" onClick={assembly.clearAssertions}>
            Clear proposals
          </button>
        </div>
      )}

      <div className="assertion-draft-panel__contradiction-section">
        <h4>Contradiction Check</h4>
        <p className="assertion-draft-panel__hint">
          Enter a statement to check against existing assertions and claims.
        </p>
        <div className="assertion-draft-panel__contradiction-form">
          <input
            type="text"
            placeholder="Assertion statement to check..."
            value={checkStatement}
            onChange={(e) => setCheckStatement(e.target.value)}
            className="assertion-draft-panel__input"
          />
          <input
            type="text"
            placeholder="Scope (optional)"
            value={checkScope}
            onChange={(e) => setCheckScope(e.target.value)}
            className="assertion-draft-panel__input assertion-draft-panel__input--scope"
          />
          <button
            type="button"
            className="run-ai-action-btn"
            onClick={() => void handleCheckContradiction()}
            disabled={contradictionLoading || !checkStatement.trim()}
          >
            {contradictionLoading ? 'Checking...' : 'Check'}
          </button>
        </div>

        {contradictionError && (
          <div className="assertion-draft-panel__error">{contradictionError}</div>
        )}

        {contradictionCheck && (
          <div className="assertion-draft-panel__contradiction-result">
            <div className="assertion-draft-panel__text">{contradictionCheck}</div>
          </div>
        )}
      </div>

      <style>{`
        .assertion-draft-panel {
          margin-top: 1rem;
          padding: 1rem;
          background: #faf5ff;
          border: 1px solid #e9d5ff;
          border-radius: 12px;
        }
        .assertion-draft-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.5rem;
        }
        .assertion-draft-panel__header h3 { margin: 0; }
        .assertion-draft-panel__error {
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #b91c1c;
          border-radius: 8px;
          padding: 0.6rem 0.85rem;
          font-size: 0.85rem;
          margin-bottom: 0.75rem;
        }
        .assertion-draft-panel__content {
          background: #fdf4ff;
          border: 1px solid #e9d5ff;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .assertion-draft-panel__text {
          white-space: pre-wrap;
          line-height: 1.6;
          color: #1e293b;
          font-size: 0.9rem;
        }
        .assertion-draft-panel__notice {
          font-size: 0.8rem;
          color: #6b21a8;
          margin-top: 0.75rem;
          font-style: italic;
        }
        .assertion-draft-panel__clear {
          margin-top: 0.5rem;
          padding: 0.3rem 0.6rem;
          border-radius: 999px;
          border: 1px solid #d8dee4;
          background: #ffffff;
          font-size: 0.75rem;
          cursor: pointer;
          color: #64748b;
        }
        .assertion-draft-panel__contradiction-section {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e9d5ff;
        }
        .assertion-draft-panel__contradiction-section h4 {
          margin: 0 0 0.25rem;
          font-size: 0.9rem;
        }
        .assertion-draft-panel__hint {
          font-size: 0.8rem;
          color: #64748b;
          margin: 0 0 0.5rem;
        }
        .assertion-draft-panel__contradiction-form {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .assertion-draft-panel__input {
          flex: 1;
          min-width: 200px;
          padding: 0.4rem 0.7rem;
          border: 1px solid #d8dee4;
          border-radius: 8px;
          font-size: 0.85rem;
        }
        .assertion-draft-panel__input--scope {
          flex: 0.5;
          min-width: 120px;
        }
        .assertion-draft-panel__contradiction-result {
          margin-top: 0.75rem;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 8px;
          padding: 0.75rem;
        }
      `}</style>
    </div>
  )
}
