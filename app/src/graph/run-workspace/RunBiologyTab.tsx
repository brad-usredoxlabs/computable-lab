import { Link } from 'react-router-dom'
import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'
import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'
import { RunAiSuggestions } from './RunAiSuggestions'

interface RunBiologyTabProps {
  summary: RunWorkspaceSummary
  runId: string
  chat: UseAiChatReturn
}

export function RunBiologyTab({ summary, runId, chat }: RunBiologyTabProps) {
  return (
    <section className="run-workspace-card">
      <h2>Biology</h2>
      <p>Biology mode labels wells by experimental meaning: controls, treatments, dose ladders, replicates, and expected biological state.</p>
      <Link to={`/runs/${encodeURIComponent(summary.runId)}/editor/biology`} className="run-workspace-card__link">
        Open Biology Mode
      </Link>
      <RunAiSuggestions runId={runId} tab="biology" chat={chat} />
    </section>
  )
}
