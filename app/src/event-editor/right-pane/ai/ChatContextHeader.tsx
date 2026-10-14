/**
 * ChatContextHeader — the authoritative "where am I / what are we realizing"
 * header above the permanent AI chat (three-pane agent harness, plan §9).
 *
 * It derives its label from the RESOLVED working focus (the focused protocol
 * step in ProtocolSelectionContext) — never an AI-authored note. This is the
 * shared conversational subject: "EDITING: Step 3 — <concept>". When no step
 * is focused it says so plainly.
 *
 * HARNESS-SEQ-1 delegation: when a ChatFocusContext is present AND non-null,
 * the header renders that published focus instead. The run page publishes no
 * ChatFocusContext, so its output is the existing useProtocolSelection path
 * byte-for-byte (same testid, same strings, same data-attr).
 */

import { useChatFocus } from '../../../agent/ChatFocusContext'
import { useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import './ChatContextHeader.css'

export function ChatContextHeader() {
  const chatFocus = useChatFocus()
  const sel = useProtocolSelection()
  const focused = sel?.focusedStep

  if (chatFocus) {
    return (
      <div className="chat-context-header chat-context-header--active" data-testid="chat-context-header">
        <span className="chat-context-header__label">Working focus</span>
        <span className="chat-context-header__value" title={chatFocus.detail ?? chatFocus.label}>{chatFocus.label}</span>
      </div>
    )
  }

  if (!focused) {
    return (
      <div className="chat-context-header" data-testid="chat-context-header">
        <span className="chat-context-header__label">Working focus</span>
        <span className="chat-context-header__value">No step focused — ask the AI to navigate</span>
      </div>
    )
  }

  const step = sel?.steps.find(step => step.stepId === focused.stepId) ?? focused
  const description = 'description' in step && typeof step.description === 'string' ? step.description.trim() : ''
  const text = description || step.label
  const title = `Step ${step.ordinal ?? '?'}: ${text}`
  const tooltip = description && !description.startsWith(step.label)
    ? `Step ${step.ordinal ?? '?'}: ${step.label}\n\n${description}` : title
  return (
    <div
      className="chat-context-header chat-context-header--active"
      data-testid="chat-context-header"
      data-ctx-step={focused.stepId}
    >
      <span className="chat-context-header__label">EDITING</span>
      <span className="chat-context-header__value" title={tooltip}>{title}</span>
    </div>
  )
}
