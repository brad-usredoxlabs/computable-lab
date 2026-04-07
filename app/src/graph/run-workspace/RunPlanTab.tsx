import { Link } from 'react-router-dom'
import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'

interface RunPlanTabProps {
  summary: RunWorkspaceSummary
}

export function RunPlanTab({ summary }: RunPlanTabProps) {
  return (
    <section className="run-workspace-card">
      <h2>Plan</h2>
      <p>The current plate editor remains the central authoring surface. Use Plan mode for transfers, additions, reads, and platform-aware setup.</p>
      <Link to={`/runs/${encodeURIComponent(summary.runId)}/editor/plan`} className="run-workspace-card__link">
        Open Plan Mode
      </Link>
    </section>
  )
}
