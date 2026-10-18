/**
 * ChatLog — the shared conversation log + composer for the harness chat pane
 * (promoted from sequences/SequenceChat.tsx, HARNESS-SEQ-1).
 *
 * The scroll spine (followLatest + ResizeObserver + resize-vs-user-scroll
 * disambiguation) and the pinned selectors (`sequence-chat` root class,
 * role=log name=Conversation, 'Review action' with the originating request,
 * 'Latest messages ↓' pill, textarea labelled 'Message') are kept verbatim —
 * e2e/sequence-chat-scroll.spec.ts pins them.
 *
 * A clarification turn (ChatMessage.clarification) renders as the prompt plus
 * its numbered options as buttons; picking one answers through the host's
 * onClarificationPick (the next chat turn), never a blocking card. The answer
 * text reuses lane 2's exported clarificationAnswerPrompt — import-only.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { AiClarification, AiClarificationAnswer, AiClarificationRequest, ChatMessage } from '../types/ai'
import { clarificationAnswerPrompt } from '../event-editor/right-pane/ai/AiTabPanel'
import { ClarificationPicker, requestHasPicker } from '../event-editor/right-pane/ai/ClarificationPicker'
import './ChatLog.css'

export interface ChatLogProps {
  messages: ChatMessage[]
  isStreaming: boolean
  prompt: string
  onPromptChange: (value: string) => void
  onSend: () => void
  onCancel: () => void
  /** Host review handler; absent -> the Review-action button is omitted. */
  onReview?: (proposal: Record<string, unknown>, userRequest?: string) => void
  /** Answer a clarification option as the next chat turn; absent -> options are not offered. */
  onClarificationPick?: (answerText: string) => void
}

/** Shape the exported lane-2 answer helper expects, built from the message's clarification. */
function clarificationRequest(clarification: AiClarification): AiClarificationRequest {
  return {
    id: clarification.id ?? 'clarification',
    // AiClarification.entityType is always present and is what the helper
    // reads first; 'general' is the neutral member of the request union.
    kind: 'general',
    prompt: clarification.prompt,
    entityType: clarification.entityType,
    menuProvider: clarification.menuProvider ?? 'choice',
    options: clarification.options,
    ...(clarification.query !== undefined ? { query: clarification.query } : {}),
    ...(clarification.allowCreateLocal !== undefined ? { allowCreateLocal: clarification.allowCreateLocal } : {}),
  }
}

export function ChatLog({ messages, isStreaming, prompt, onPromptChange, onSend, onCancel, onReview, onClarificationPick }: ChatLogProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const viewportRef = useRef({ width: 0, height: 0 })
  const [following, setFollowing] = useState(true)
  const latestUserId = [...messages].reverse().find(message => message.role === 'user')?.id
  const previousUserId = useRef(latestUserId)

  const followLatest = useCallback(() => {
    followingRef.current = true
    setFollowing(true)
    const scroller = scrollerRef.current
    if (scroller) {
      viewportRef.current = { width: scroller.clientWidth, height: scroller.clientHeight }
      scroller.scrollTop = scroller.scrollHeight
    }
  }, [])

  // Includes hydration, new messages, and text updates to an existing streaming reply.
  useLayoutEffect(() => {
    const sentPrompt = latestUserId !== previousUserId.current
    previousUserId.current = latestUserId
    if (followingRef.current || sentPrompt) followLatest()
  }, [messages, latestUserId, followLatest])

  // Pane resizing and line wrapping can move the bottom without changing messages.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (followingRef.current) followLatest()
      else viewportRef.current = { width: scroller.clientWidth, height: scroller.clientHeight }
    })
    observer.observe(scroller)
    observer.observe(content)
    return () => observer.disconnect()
  }, [followLatest])

  function onScroll() {
    const scroller = scrollerRef.current
    if (!scroller) return
    // Resizing can emit a scroll event before ResizeObserver runs. That event
    // must not be mistaken for the reader deliberately leaving the bottom.
    const resized = viewportRef.current.width !== scroller.clientWidth || viewportRef.current.height !== scroller.clientHeight
    if (followingRef.current && resized) {
      followLatest()
      return
    }
    viewportRef.current = { width: scroller.clientWidth, height: scroller.clientHeight }
    const atBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 32
    followingRef.current = atBottom
    setFollowing(atBottom)
  }

  /**
   * A clarification turn is a PROMPT plus something to choose. The box must
   * never render empty: a typed clarifier (no `clarification.options`) used to
   * produce a bordered box containing only an empty <ol> — on a phone that
   * reads as a mangled grey rectangle under the question.
   */
  function renderClarificationBlock(message: ChatMessage) {
    const clarification = message.clarification!
    const options = clarification.options ?? []
    const request = clarificationRequest(clarification)
    const promptDiffers = message.content !== clarification.prompt
    if (options.length === 0) {
      // No literal options — but a MENU-BACKED clarifier ("the draft names
      // 'unobtainium' … choose what it is") is answerable through the picker.
      // The server persists exactly this shape (options: [], menuProvider '/m',
      // query, allowCreateLocal), so rendering nothing left the question
      // unanswerable, and rendering the empty <ol> left a mangled grey box.
      if (!onClarificationPick || !requestHasPicker(request)) return null
      return <div className="chat-log-clarification" key={`clar-${message.id}`}>
        {promptDiffers && <p>{clarification.prompt}</p>}
        <ClarificationPicker
          request={request}
          onPick={(answer) => onClarificationPick(clarificationAnswerPrompt(answer, request))}
        />
      </div>
    }
    return <div className="chat-log-clarification" key={`clar-${message.id}`}>
      {promptDiffers && <p>{clarification.prompt}</p>}
      {onClarificationPick && <ol className="chat-log-clarification-options">
        {options.map((option, optionIndex) => <li key={option.id}>
          <button onClick={() => onClarificationPick(clarificationAnswerPrompt(
            {
              requestId: clarification.id ?? message.id,
              optionId: option.id,
              label: option.label,
              ...(option.ref !== undefined ? { ref: option.ref } : {}),
            } satisfies AiClarificationAnswer,
            clarificationRequest(clarification),
          ))}>{optionIndex + 1}. {option.label}</button>
        </li>)}
      </ol>}
    </div>
  }

  /**
   * Typed (menu-backed) clarifications: the question carries its own options or
   * a picker. Ignoring them left the pane showing a question with no way to
   * answer it — the old pane rendered them through QuestionsPanel.
   */
  function renderTypedClarification(messageId: string, request: AiClarificationRequest) {
    const options = request.options ?? []
    const hasPicker = requestHasPicker(request)
    if (options.length === 0 && !hasPicker) return null
    return <div className="chat-log-clarification" key={`req-${messageId}-${request.id}`} data-testid={`chat-log-request-${request.id}`}>
      <p>{request.prompt}</p>
      {options.length > 0 && onClarificationPick ? (
        <ol className="chat-log-clarification-options">
          {options.map((option, optionIndex) => <li key={option.id}>
            <button onClick={() => onClarificationPick(clarificationAnswerPrompt(
              {
                requestId: request.id,
                optionId: option.id,
                label: option.label,
                ...(option.ref !== undefined ? { ref: option.ref } : {}),
              } satisfies AiClarificationAnswer,
              request,
            ))}>{optionIndex + 1}. {option.label}</button>
          </li>)}
        </ol>
      ) : null}
      {hasPicker && onClarificationPick ? (
        <ClarificationPicker
          key={request.id}
          request={request}
          onPick={(answer) => onClarificationPick(clarificationAnswerPrompt(answer, request))}
        />
      ) : null}
    </div>
  }

  return <aside className="sequences-page sequence-chat">
    <h2>AI Chat</h2>
    <p className="sequence-hint">Ask for an edit, a draft or a navigation. Review proposed actions before applying them.</p>
    <div className="sequence-chat-messages" ref={scrollerRef} onScroll={onScroll} role="log" aria-label="Conversation" aria-live="polite" tabIndex={0}>
      <div className="sequence-chat-content" ref={contentRef}>
        {messages.map((message, index) => <div key={message.id}>
          <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
          <p>{message.content}</p>
          {message.sequenceProposal && onReview && <button onClick={() => onReview(message.sequenceProposal!, message.sequenceProposalRequest ?? messages.slice(0, index).reverse().find(m => m.role === 'user')?.content)}>Review action</button>}
          {message.clarification && renderClarificationBlock(message)}
          {message.clarificationRequests?.map((request) => renderTypedClarification(message.id, request))}
        </div>)}
      </div>
    </div>
    {!following && <button className="sequence-chat-latest" onClick={followLatest}>Latest messages <span aria-hidden="true">↓</span></button>}
    <label>Message<textarea rows={4} value={prompt} onChange={event => onPromptChange(event.target.value)}/></label>
    <button disabled={isStreaming || !prompt.trim()} onClick={onSend}>Send</button>
    {isStreaming && <button onClick={onCancel}>Cancel</button>}
  </aside>
}
