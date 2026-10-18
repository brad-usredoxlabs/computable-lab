/**
 * useSurfaceChat — ONE call that gives a surface the universal chat AND its
 * proposal flow, already wired to the shared pane.
 *
 * Why this exists: the pane (HarnessChatPane) is a pure CONSUMER of the
 * AiPanelContext seam, while the draft pipeline (compile → card → accept /
 * reject) needs callbacks at the point the chat hook is created. Before this
 * hook every surface had to wire the three proposal callbacks itself (and the
 * event editor didn't, so drafts vanished when the pane changed).
 *
 * Semantics are unchanged from AiTabPanel's mount:
 *  - workstate / analysis / record-drafting intents all ride the SAME flow,
 *    differing only by adapter constant (no forks);
 *  - the flow is registered alongside the chat so the pane can render the one
 *    pending card and drive accept/reject;
 *  - tier-1 agent actions go through flow.handleAgentAction, which is the
 *    single narrowing point for agent_action frames.
 */
import { useAiChat, type UseAiChatOptions, type UseAiChatReturn } from '../shared/hooks/useAiChat'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import {
  useWorkstateProposalFlow,
  type WorkstateProposalFlow,
} from '../shared/ai/useWorkstateProposalFlow'

export interface SurfaceChat {
  chat: UseAiChatReturn
  flow: WorkstateProposalFlow
}

export function useSurfaceChat(options: UseAiChatOptions): SurfaceChat {
  const flow = useWorkstateProposalFlow()

  const chat = useAiChat({
    ...options,
    // QMS7-7: one adapter constant per intent; the flow body is shared.
    onWorkstateProposal: (intent) => void flow.proposeWorkstate('workstate', intent),
    onAnalysisProposal: (intent) => void flow.proposeWorkstate('analysis', intent),
    onRecordDraftProposal: (intent) => void flow.proposeWorkstate('record-drafting', intent),
    // PB-CH-8: an agent_action frame is tier-1 — narrow + execute, never guess.
    onAgentAction: (action) => flow.handleAgentAction(action),
  })

  useRegisterAiChat(chat, flow)

  return { chat, flow }
}
