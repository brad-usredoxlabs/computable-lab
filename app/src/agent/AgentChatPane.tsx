import { ChatContextHeader } from '../event-editor/right-pane/ai/ChatContextHeader'
import { AiTabPanel } from '../event-editor/right-pane/ai/AiTabPanel'
import './AgentChatPane.css'

export function AgentChatPane() {
  return (
    <div className="agent-chat-pane" data-testid="agent-chat-pane">
      <div className="agent-chat-pane__header">
        <ChatContextHeader />
      </div>
      <div className="agent-chat-pane__body">
        <AiTabPanel />
      </div>
    </div>
  )
}
