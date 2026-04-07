import { Link } from 'react-router-dom'
import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'
import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'
import type { UseResultInterpretationReturn } from '../hooks/useResultInterpretation'
import type { UseEvidenceAssemblyReturn } from '../hooks/useEvidenceAssembly'
import type { RunWorkspaceResponse } from '../../shared/api/client'
import { RunAiSuggestions } from './RunAiSuggestions'
import { RunClaimDraftPanel } from './RunClaimDraftPanel'
import { ResultInterpretationPanel } from './ResultInterpretationPanel'
import { EvidenceAssemblyPanel } from './EvidenceAssemblyPanel'

interface RunResultsTabProps {
  summary: RunWorkspaceSummary
  runId: string
  chat: UseAiChatReturn
  interpretation: UseResultInterpretationReturn
  assembly: UseEvidenceAssemblyReturn
  workspace: RunWorkspaceResponse | null
}

export function RunResultsTab({ summary, runId, chat, interpretation, assembly, workspace }: RunResultsTabProps) {
  return (
    <section className="run-workspace-card">
      <h2>Results</h2>
      <p>Results mode stages run-linked interpretation of instrument files on the same plate geometry before canonical measurement publish.</p>
      <Link to={`/runs/${encodeURIComponent(summary.runId)}/editor/results`} className="run-workspace-card__link">
        Open Results Mode
      </Link>
      <ResultInterpretationPanel interpretation={interpretation} workspace={workspace} />
      <EvidenceAssemblyPanel assembly={assembly} workspace={workspace} />
      <RunClaimDraftPanel runId={runId} chat={chat} onRefresh={async () => {}} />
      <RunAiSuggestions runId={runId} tab="results" chat={chat} />
    </section>
  )
}
