import { useState } from 'react'
import type { AnalyzeIngestionResponse, AnalyzeIngestionDraftSpec } from '../../types/ingestion'

interface AiAnalysisPanelProps {
  analysis: AnalyzeIngestionResponse
  onReAnalyze: (answers: string[]) => void
  onConfirmAndRun: (spec: AnalyzeIngestionDraftSpec) => void
  isRunning: boolean
}

export function AiAnalysisPanel({ analysis, onReAnalyze, onConfirmAndRun, isRunning }: AiAnalysisPanelProps) {
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({})

  if (!analysis.analysis && !analysis.draftSpec) {
    return null
  }

  const handleAnswerChange = (questionIndex: number, value: string) => {
    setQuestionAnswers(prev => ({ ...prev, [questionIndex]: value }))
  }

  const handleReAnalyze = () => {
    const answers = analysis.questions?.map((_, index) => questionAnswers[index] || '') || []
    onReAnalyze(answers)
  }

  const handleConfirmAndRun = () => {
    if (analysis.draftSpec) {
      onConfirmAndRun(analysis.draftSpec)
    }
  }

  // Render draft spec in a human-readable format
  const renderDraftSpecSummary = (spec: AnalyzeIngestionDraftSpec) => {
    const parts: string[] = []

    // Target record types
    if (spec.targets && spec.targets.length > 0) {
      const targetNames = spec.targets.map(t => {
        const mappings = t.fieldMappings?.map(fm => `${fm.targetField}`).join(', ') || 'various fields'
        return `${t.recordKind || t.targetSchema} (maps: ${mappings})`
      })
      parts.push(`Will extract: ${targetNames.join(', ')}`)
    }

    // Defaults
    if (spec.targets) {
      for (const target of spec.targets) {
        if (target.defaults && Object.keys(target.defaults).length > 0) {
          const defaultsStr = Object.entries(target.defaults)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(', ')
          parts.push(`Defaults for ${target.recordKind || target.targetSchema}: ${defaultsStr}`)
        }
      }
    }

    // Matching config
    if (spec.matching) {
      if (spec.matching.ontologyPreferences && spec.matching.ontologyPreferences.length > 0) {
        parts.push(`Will match against: ${spec.matching.ontologyPreferences.join(', ')}`)
      }
      if (spec.matching.batchSize) {
        parts.push(`Batch size: ${spec.matching.batchSize}`)
      }
    }

    // Table extraction info
    if (spec.tableExtraction) {
      const extractionInfo = [`Method: ${spec.tableExtraction.method}`]
      if (spec.tableExtraction.columns && spec.tableExtraction.columns.length > 0) {
        extractionInfo.push(`Columns: ${spec.tableExtraction.columns.join(', ')}`)
      }
      if (spec.tableExtraction.headerRow !== undefined) {
        extractionInfo.push(`Header row: ${spec.tableExtraction.headerRow}`)
      }
      parts.push(`Table extraction: ${extractionInfo.join(', ')}`)
    }

    return parts.map((part, i) => (
      <div key={i} className="ai-analysis__spec-item">{part}</div>
    ))
  }

  return (
    <div className="ai-analysis-panel">
      {analysis.error && (
        <div className="ai-analysis__error">
          <strong>Error:</strong> {analysis.error}
        </div>
      )}

      {analysis.analysis && (
        <div className="ai-analysis__section">
          <h4>File Analysis</h4>
          <div className="ai-analysis__summary">
            <div className="ai-analysis__badge">
              File type: {analysis.analysis.fileType}
            </div>
            <p><strong>Content:</strong> {analysis.analysis.contentSummary}</p>
            <p><strong>Structure:</strong> {analysis.analysis.detectedStructure}</p>
            {analysis.analysis.tableCount !== undefined && (
              <p><strong>Tables detected:</strong> {analysis.analysis.tableCount}</p>
            )}
            {analysis.analysis.rowEstimate !== undefined && (
              <p><strong>Estimated rows:</strong> {analysis.analysis.rowEstimate}</p>
            )}
          </div>
        </div>
      )}

      {analysis.draftSpec && (
        <div className="ai-analysis__section">
          <h4>Draft Extraction Spec</h4>
          <div className="ai-analysis__spec">
            {renderDraftSpecSummary(analysis.draftSpec)}
          </div>
        </div>
      )}

      {analysis.questions && analysis.questions.length > 0 && (
        <div className="ai-analysis__section">
          <h4>Clarifying Questions</h4>
          <div className="ai-analysis__questions">
            {analysis.questions.map((question, index) => (
              <div key={index} className="ai-analysis__question">
                <p><strong>Q{index + 1}:</strong> {question}</p>
                <input
                  type="text"
                  placeholder={`Answer for question ${index + 1}`}
                  value={questionAnswers[index] || ''}
                  onChange={(e) => handleAnswerChange(index, e.target.value)}
                  className="ai-analysis__question-input"
                />
              </div>
            ))}
            <button
              className="btn btn-secondary"
              onClick={handleReAnalyze}
              disabled={isRunning}
            >
              Re-analyze with Answers
            </button>
          </div>
        </div>
      )}

      <div className="ai-analysis__actions">
        <button
          className="btn btn-primary"
          onClick={handleConfirmAndRun}
          disabled={isRunning || !analysis.draftSpec}
        >
          {isRunning ? 'Running...' : 'Confirm & Run'}
        </button>
      </div>

      <style>{`
        .ai-analysis-panel {
          margin-top: 1.5rem;
          padding: 1rem;
          border: 1px solid #e9ecef;
          border-radius: 12px;
          background: #fafbfc;
        }
        .ai-analysis__error {
          margin-bottom: 1rem;
          padding: 0.75rem;
          border: 1px solid #ffc9c9;
          background: #fff5f5;
          color: #c92a2a;
          border-radius: 8px;
        }
        .ai-analysis__section {
          margin-bottom: 1.5rem;
        }
        .ai-analysis__section h4 {
          margin: 0 0 0.75rem 0;
          color: #495057;
          font-size: 0.95rem;
        }
        .ai-analysis__summary {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          border: 1px solid #e9ecef;
        }
        .ai-analysis__badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          background: #edf2ff;
          color: #364fc7;
          border-radius: 999px;
          font-size: 0.82rem;
          margin-bottom: 0.75rem;
        }
        .ai-analysis__summary p {
          margin: 0.5rem 0;
          color: #495057;
        }
        .ai-analysis__spec {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          border: 1px solid #e9ecef;
        }
        .ai-analysis__spec-item {
          margin: 0.5rem 0;
          color: #495057;
          font-size: 0.9rem;
        }
        .ai-analysis__questions {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          border: 1px solid #e9ecef;
          margin-bottom: 1rem;
        }
        .ai-analysis__question {
          margin-bottom: 1rem;
        }
        .ai-analysis__question p {
          margin: 0 0 0.5rem 0;
          color: #495057;
        }
        .ai-analysis__question-input {
          width: 100%;
          padding: 0.65rem 0.75rem;
          border: 1px solid #ced4da;
          border-radius: 8px;
          font-size: 0.9rem;
        }
        .ai-analysis__actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 1rem;
        }
      `}</style>
    </div>
  )
}
