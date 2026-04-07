import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'
import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'
import { RunAiSummary } from './RunAiSummary'
import { RunSimilarRuns } from './RunSimilarRuns'

interface RunOverviewTabProps {
  summary: RunWorkspaceSummary
  runId: string
  chat: UseAiChatReturn
}

export function RunOverviewTab({ summary, runId, chat }: RunOverviewTabProps) {
  return (
    <>
      <div className="run-workspace-tab-grid">
        <section className="run-workspace-card">
          <h2>Run Snapshot</h2>
          <p>Status: <strong>{summary.status}</strong></p>
          <p>{summary.methodSummary}</p>
        </section>
        <section className="run-workspace-card">
          <h2>Progress Map</h2>
          <ul>
            <li>Plan: {summary.counts.plan}</li>
            <li>Biology: {summary.counts.biology}</li>
            <li>Readouts: {summary.counts.readouts}</li>
            <li>Results: {summary.counts.results}</li>
            <li>Claims: {summary.counts.claims}</li>
          </ul>
        </section>
      </div>
      <RunAiSummary runId={runId} chat={chat} />
      <RunSimilarRuns runId={runId} chat={chat} />
    </>
  )
}
