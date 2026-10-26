/**
 * HarnessChatPane — the shared right-pane chat for harness surfaces
 * (HARNESS-SEQ-1).
 *
 * It CONSUMES the chat registered through the seam (useAiPanel().chat from
 * AiPanelContext) — it never registers a chat itself and never wraps its
 * subtree in another AiPanelProvider (nested providers would shadow
 * registrations). `chat === null` is a first-class state: an honest empty
 * state, no placeholder messages, disabled composer.
 *
 * The composer state is LOCAL to the pane; Send goes through the registered
 * chat's sendPrompt. A clarification turn answers through the same chat
 * (the next turn), never a blocking card.
 */
import { useState } from 'react'
import { useAiPanel } from '../shared/context/AiPanelContext'
import { ChatLog } from './ChatLog'
import { WorkstateProposalCard } from '../event-editor/right-pane/ai/WorkstateProposalCard'
import { ChatPreviewCard } from './ChatPreviewCard'
import { SurfaceFocusHeader } from './SurfaceFocusHeader'
import './HarnessChatPane.css'

export interface HarnessChatPaneProps {
  /** Host review handler threaded into ChatLog's Review-action button. */
  onReviewProposal?: (proposal: Record<string, unknown>, userRequest?: string) => void
}

export function HarnessChatPane({ onReviewProposal }: HarnessChatPaneProps) {
  // `proposalFlow` is registered by the SAME surface that owns the chat: the
  // pane renders the one pending compile card and drives accept/reject through
  // it. Absent flow (a surface that only chats) = no card, no dead controls.
  const { chat, proposalFlow } = useAiPanel()
  const [prompt, setPrompt] = useState('')

  if (!chat) {
    return (
      <aside className="harness-chat-pane" data-testid="harness-chat-pane">
        <SurfaceFocusHeader />
        <div className="harness-chat-pane__empty" role="status">
          No surface has registered a chat with this panel.
        </div>
        <label>Message<textarea rows={4} value={prompt} disabled onChange={event => setPrompt(event.target.value)}/></label>
        <button disabled>Send</button>
      </aside>
    )
  }

  return (
    <div className="harness-chat-pane" data-testid="harness-chat-pane">
      <SurfaceFocusHeader />
      {/* L2-CHAT-1 §3: the universal honest-failure wall — a success that
          produced nothing mountable is a REPORTED failure in plain language
          (the universal port of AiTabPanel's ai-tab-honest-wall). Owned by
          its turn: the next send clears it in useAiChat.
          L2-CHAT-1 FIX1 D5: role=alert (assertive) — parity with the legacy
          ai-tab-honest-wall (AiTabPanel.tsx:1437); a reported failure must
          be announced loudly, not as a polite status. */}
      {chat.honestWall ? (
        <div className="harness-chat-pane__honest-wall" data-testid="honest-wall" role="alert">
          {chat.honestWall}
        </div>
      ) : null}
      {/* Staged deck proposal: apply/discard + per-event drop, reachable even
          when the deck itself is off screen (mobile drawer). */}
      <ChatPreviewCard chat={chat} />
      {proposalFlow?.card ? (
        <div className="harness-chat-pane__proposal" data-testid="harness-chat-proposal">
          <WorkstateProposalCard
            {...proposalFlow.card}
            onAccept={() => void proposalFlow.acceptWorkstate()}
            onReject={() => proposalFlow.rejectWorkstate()}
          />
        </div>
      ) : null}
      <ChatLog
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        prompt={prompt}
        onPromptChange={setPrompt}
        onSend={() => { chat.sendPrompt(prompt); setPrompt('') }}
        onCancel={chat.cancelStream}
        {...(onReviewProposal ? { onReview: onReviewProposal } : {})}
        onClarificationPick={(answerText) => { chat.sendPrompt(answerText) }}
      />
    </div>
  )
}
