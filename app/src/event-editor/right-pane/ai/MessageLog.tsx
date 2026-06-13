/**
 * MessageLog — vertical scroll of chat turns.
 *
 * Renders committed messages plus, if streaming, the in-flight assistant
 * "pending" bubble whose text grows on every text_delta. Auto-scrolls to
 * the latest bubble on each render — the streaming UX is unusable
 * otherwise.
 */

import { useEffect, useRef } from 'react'
import type { AiClarificationAnswer, AiClarificationOption, AiClarificationRequest } from '../../../types/ai'
import type { ChatState } from './chatReducer'

export interface MessageLogProps {
  state: ChatState
  onClarificationAnswer?: (answer: AiClarificationAnswer, request: AiClarificationRequest) => void
}

function safeMentionPart(value: string): string {
  return value.replace(/[\]\n\r]/g, '').trim()
}

function optionRefId(option: AiClarificationOption): string {
  const ref = option.ref
  if (typeof ref?.curie === 'string' && ref.curie.trim()) return ref.curie
  if (typeof ref?.id === 'string' && ref.id.trim()) return ref.id
  return option.id
}

export function mentionTokenForOption(
  request: AiClarificationRequest,
  option: AiClarificationOption,
): string | undefined {
  const label = safeMentionPart(option.label)
  const id = safeMentionPart(optionRefId(option))
  if (!id) return undefined
  if (request.menuProvider === '/l' || request.kind === 'labware') {
    return `[[labware:${id}|${label}]]`
  }
  if (request.menuProvider === '/m') {
    const refKind = typeof option.ref?.kind === 'string' ? option.ref.kind : undefined
    const kind =
      refKind === 'material-spec' || refKind === 'aliquot' || refKind === 'material-instance'
        ? refKind
        : 'material'
    return `[[${kind}:${id}|${label}]]`
  }
  return undefined
}

function ClarificationCards({
  requests,
  onAnswer,
}: {
  requests: AiClarificationRequest[]
  onAnswer?: (answer: AiClarificationAnswer, request: AiClarificationRequest) => void
}) {
  if (requests.length === 0) return null
  return (
    <div className="message-log__clarifications" data-testid="ai-clarification-cards">
      {requests.map((request) => (
        <section key={request.id} className="message-log__clarification-card">
          <div className="message-log__clarification-head">
            <span className="message-log__clarification-menu">{request.menuProvider}</span>
            <span className="message-log__clarification-kind">{request.entityType ?? request.kind}</span>
          </div>
          <p className="message-log__clarification-prompt">{request.prompt}</p>
          {request.snippet ? <p className="message-log__clarification-snippet">{request.snippet}</p> : null}
          {request.options.length > 0 ? (
            <div className="message-log__clarification-options">
              {request.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="message-log__clarification-option"
                  onClick={() => onAnswer?.({
                    requestId: request.id,
                    optionId: option.id,
                    label: option.label,
                    mentionToken: mentionTokenForOption(request, option),
                    ...(option.ref ? { ref: option.ref } : {}),
                  }, request)}
                >
                  <span>{option.label}</span>
                  {option.source || option.snippet ? (
                    <small>{option.source ?? option.snippet}</small>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="message-log__clarification-option message-log__clarification-option--manual"
              onClick={() => onAnswer?.({ requestId: request.id, value: request.query ?? request.prompt }, request)}
            >
              Answer in chat
            </button>
          )}
        </section>
      ))}
    </div>
  )
}

export function MessageLog({ state, onClarificationAnswer }: MessageLogProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  // Auto-scroll on every message change. jsdom doesn't ship scrollTo, so
  // we guard it the same way the PDF viewer does.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    // Defer to next frame so the freshly-rendered bubble is laid out.
    requestAnimationFrame(() => {
      if (typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    })
  }, [state.messages.length, state.pending?.text])

  const empty = state.messages.length === 0 && !state.pending

  return (
    <div
      className="message-log"
      ref={scrollerRef}
      data-testid="message-log"
      role="log"
      aria-live="polite"
    >
      {empty ? (
        <p className="message-log__hint">
          Send a message to start. The agent sees the chips above as
          context; the system prompt depends on the active viewer.
        </p>
      ) : null}
      {state.messages.map((m) => (
        <article
          key={m.id}
          className={
            m.role === 'user'
              ? 'message-log__bubble message-log__bubble--user'
              : 'message-log__bubble message-log__bubble--assistant'
          }
          data-testid={`message-${m.id}`}
        >
          <header className="message-log__role">
            {m.role === 'user' ? 'You' : 'AI'}
          </header>
          <p className="message-log__text">{m.text}</p>
          {m.clarificationRequests?.length ? (
            <ClarificationCards
              requests={m.clarificationRequests}
              onAnswer={onClarificationAnswer}
            />
          ) : null}
        </article>
      ))}
      {state.pending ? (
        <article
          className="message-log__bubble message-log__bubble--assistant message-log__bubble--pending"
          data-testid={`message-${state.pending.id}`}
        >
          <header className="message-log__role">AI</header>
          <p className="message-log__text">
            {state.pending.text || <em>…thinking</em>}
          </p>
        </article>
      ) : null}
      {state.status ? (
        <div className="message-log__status" data-testid="message-log-status">
          {state.status}
        </div>
      ) : null}
      {state.error ? (
        <div className="message-log__error" data-testid="message-log-error">
          {state.error}
        </div>
      ) : null}
    </div>
  )
}
