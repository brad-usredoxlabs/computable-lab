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
import { SurfaceFocusHeader } from './SurfaceFocusHeader'
import './HarnessChatPane.css'

export interface HarnessChatPaneProps {
  /** Host review handler threaded into ChatLog's Review-action button. */
  onReviewProposal?: (proposal: Record<string, unknown>, userRequest?: string) => void
}

export function HarnessChatPane({ onReviewProposal }: HarnessChatPaneProps) {
  const { chat } = useAiPanel()
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
