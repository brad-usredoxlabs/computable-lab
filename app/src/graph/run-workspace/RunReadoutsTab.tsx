import { Link } from 'react-router-dom'
import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'
import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'
import { RunAiSuggestions } from './RunAiSuggestions'

interface RunReadoutsTabProps {
  summary: RunWorkspaceSummary
  runId: string
  chat: UseAiChatReturn
}

export function RunReadoutsTab({ summary, runId, chat }: RunReadoutsTabProps) {
  return (
    <section className="run-workspace-card">
      <h2>Readouts</h2>
      <p>Readouts mode binds planned read events to instruments, channels, and assay contexts while preserving one shared biological meaning layer.</p>
      <Link to={`/runs/${encodeURIComponent(summary.runId)}/editor/readouts`} className="run-workspace-card__link">
        Open Readouts Mode
      </Link>
      <RunAiSuggestions runId={runId} tab="readouts" chat={chat} />
    </section>
  )
}
