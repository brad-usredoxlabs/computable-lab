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

/**
 * L2-CHAT-UI-1 LEG A (A4) — clarify-then-compact, as a PURE render-time
 * derivation over the messages array (no reducer state, no surface
 * branching). A clarification turn (carrying `clarification` and/or
 * `clarificationRequests`) is ANSWERED iff a following user message exists:
 * answering sends the answer as the next chat turn (HarnessChatPane ->
 * useAiChat appends the user message), so the answer is the
 * immediately-following user turn by construction. Generic adjacency rule —
 * one predicate gates BOTH arms (the uifix1 F1 single-arm gate: both the
 * legacy block and the typed requests come off the same answered state).
 */
function isClarificationAnswered(messages: ChatMessage[], index: number): boolean {
  return messages.slice(index + 1).some((m) => m.role === 'user')
}

/** The question's prompt for the compact row (typed arm first — canonical). */
function clarificationQuestion(message: ChatMessage): string | undefined {
  return message.clarificationRequests?.[0]?.prompt ?? message.clarification?.prompt
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
    // L2-SUITE-A-uifix3 [D3-CHROME] (regate-5 defect 3, chrome slice): a
    // THREAD-RESTORED message (the useAiChat getThread hydrate marks it
    // `restored: true`) renders NEITHER the picker NOR the option buttons —
    // its answer inputs belong to live staged cards only. A restored
    // menu-backed clarifier (options: [], menuProvider '/l'/'/m') otherwise
    // falls through to the picker arm below and mounts the real
    // ClarificationPicker, whose search input ALWAYS renders (only the
    // popover is open-gated) — the gate's 8 bare <input placeholder="Search
    // labware…"> boxes floating above "You …" with no question. The question
    // text itself is the message content, already rendered in the main loop
    // (`<p>{message.content}</p>`), so "render neither" preserves the record
    // of what was asked while dropping the dead chrome. Live turns carry no
    // `restored` flag and render byte-unchanged (the controls pin this).
    if (message.restored) return null
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
        {messages.map((message, index) => {
          // L2-CHAT-UI-1 LEG A (A1): directional bubbles — the row wrap is a
          // CLASS addition (the pinned DOM structure: .sequence-chat root,
          // role=log, the composer, the 'Review action' button, the message
          // prose — is untouched); the accessible author name stays the
          // <strong>You/Assistant</strong> label inside the row.
          const bubbleClass = message.role === 'user'
            ? 'chat-log-msg chat-log-msg--user'
            : message.role === 'system'
              ? 'chat-log-msg chat-log-msg--system'
              : 'chat-log-msg chat-log-msg--assistant'
          // L2-CHAT-UI-1 LEG A (A4): the ONE answered predicate (pure
          // render-time derivation over the messages array — see
          // isClarificationAnswered). Answered -> both bulky arms come off
          // the DOM and ONE compact row stands in for them. Unanswered ->
          // the arms below render byte-unchanged.
          const hasClarification = Boolean(message.clarification) || Boolean(message.clarificationRequests?.length)
          const answered = hasClarification && isClarificationAnswered(messages, index)
          const answerMessage = answered ? messages.slice(index + 1).find((m) => m.role === 'user') : undefined
          return <div key={message.id} className={bubbleClass}>
          <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
          {message.shorthand !== undefined && (
            // L2-CHAT-UI-1 LEG A (A2): the scientist-intent shorthand —
            // VERBATIM in a <pre>, marked off above the content, read-only
            // (OQ-3 ruled: no edit/recompile round-trip in the universal card).
            <div className="chat-log-intent-card" data-testid="chat-log-intent-card">
              <div className="chat-log-intent-card__label">Scientist-intent shorthand (exactly what the compiler ran)</div>
              <pre className="chat-log-intent-card__body" data-testid="chat-log-intent-card-body">{message.shorthand}</pre>
            </div>
          )}
          <p>{message.content}</p>
          {message.sequenceProposal && onReview && <button onClick={() => onReview(message.sequenceProposal!, message.sequenceProposalRequest ?? messages.slice(0, index).reverse().find(m => m.role === 'user')?.content)}>Review action</button>}
          {/* L2-SUITE-A-uifix1 F1: exactly ONE clarification arm per message.
              When the typed requests ride the message (the universal done
              arm feeds BOTH fields from one payload — useAiChat done arm),
              the typed arm is canonical: it renders EVERY request as a
              card. The legacy block arm then renders the same first
              request a SECOND time (the gate's blocks=2 pickers=2). It
              stays for messages carrying only the legacy field (hydrated
              history / legacy surfaces that never populate
              clarificationRequests).
              L2-CHAT-UI-1 LEG A (A4) additionally gates BOTH arms on the
              same answered predicate: an answered clarifier renders the
              compact row instead (the bulky picker/option list must be
              ABSENT from the DOM, not hidden). */}
          {answered ? (
            <div className="chat-log-clarification-answered" data-testid="chat-log-clarification-answered">
              Answered: {answerMessage?.content} — {clarificationQuestion(message)}
            </div>
          ) : (
            <>
              {message.clarification && !(message.clarificationRequests?.length) && renderClarificationBlock(message)}
              {message.clarificationRequests?.map((request) => renderTypedClarification(message.id, request))}
            </>
          )}
        </div>
        })}
      </div>
    </div>
    {!following && <button className="sequence-chat-latest" onClick={followLatest}>Latest messages <span aria-hidden="true">↓</span></button>}
    <label>Message<textarea rows={4} value={prompt} onChange={event => onPromptChange(event.target.value)}/></label>
    <button disabled={isStreaming || !prompt.trim()} onClick={onSend}>Send</button>
    {isStreaming && <button data-testid="interpreting-stop" onClick={onCancel}>Cancel</button>}
  </aside>
}
