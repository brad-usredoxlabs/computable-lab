/**
 * MessageLog — vertical scroll of chat turns.
 *
 * Renders committed messages plus, if streaming, the in-flight assistant
 * "pending" bubble whose text grows on every text_delta. Auto-scrolls to
 * the latest bubble on each render — the streaming UX is unusable
 * otherwise.
 */

import { useEffect, useRef } from 'react'
import type { ChatState } from './chatReducer'

export interface MessageLogProps {
  state: ChatState
}

export function MessageLog({ state }: MessageLogProps) {
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
