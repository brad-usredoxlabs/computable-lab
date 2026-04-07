import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'

interface RunWorkspaceRightRailProps {
  summary: RunWorkspaceSummary
}

export function RunWorkspaceRightRail({ summary }: RunWorkspaceRightRailProps) {
  return (
    <aside className="run-workspace-right-rail">
      <section>
        <h3>AI Copilot</h3>
        <p>Use the editor modes to draft event steps, biological meaning, readout mappings, and result interpretation in context.</p>
      </section>
      <section>
        <h3>Next Actions</h3>
        <ul>
          {summary.nextActions.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
      <section>
        <h3>Method Summary</h3>
        <p>{summary.methodSummary}</p>
      </section>
    </aside>
  )
}
