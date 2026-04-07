import { Link } from 'react-router-dom'
import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'

interface RunWorkspaceHeaderProps {
  summary: RunWorkspaceSummary
  onExportAnalysis?: () => void
  exporting?: boolean
}

export function RunWorkspaceHeader({ summary, onExportAnalysis, exporting = false }: RunWorkspaceHeaderProps) {
  return (
    <div className="run-workspace-header">
      <div>
        <div className="run-workspace-header__eyebrow">Run Workspace</div>
        <h1>{summary.title}</h1>
        <p>{summary.objective}</p>
      </div>
      <div className="run-workspace-header__actions">
        <Link to={`/runs/${encodeURIComponent(summary.runId)}/editor/plan`} className="run-workspace-header__primary">
          Open Plate Editor
        </Link>
        <Link to={`/runs/${encodeURIComponent(summary.runId)}/editor/biology`} className="run-workspace-header__secondary">
          Biology Mode
        </Link>
        <Link to={`/runs/${encodeURIComponent(summary.runId)}/editor/readouts`} className="run-workspace-header__secondary">
          Readouts Mode
        </Link>
        <Link to={`/runs/${encodeURIComponent(summary.runId)}/editor/results`} className="run-workspace-header__secondary">
          Results Mode
        </Link>
        {onExportAnalysis ? (
          <button type="button" className="run-workspace-header__secondary" onClick={onExportAnalysis} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Analysis'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
