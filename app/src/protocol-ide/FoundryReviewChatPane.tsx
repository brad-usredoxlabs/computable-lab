import { useEffect, useMemo, useRef, useState } from 'react'
import { useFoundryReviewChat } from './useFoundryReviewChat'
import type { FoundryChatMessage } from '../shared/api/client'

export interface FoundryReviewChatPaneProps {
  protocolId: string
  variant: string
  initialTranscript?: FoundryChatMessage[]
}

const DEFAULT_REVIEW_ENDPOINT = 'http://thunderbeast:8000/v1'

export function FoundryReviewChatPane({
  protocolId,
  variant,
  initialTranscript,
}: FoundryReviewChatPaneProps): JSX.Element {
  const transcript = useMemo(() => initialTranscript ?? [], [initialTranscript])
  const { messages, isStreaming, error, submit } = useFoundryReviewChat({
    protocolId,
    variant,
    initialTranscript: transcript,
  })
  const [draft, setDraft] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scrollerRef.current) return
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
  }, [messages])

  const send = async () => {
    const value = draft
    if (!value.trim() || isStreaming) return
    setDraft('')
    await submit(value)
  }

  return (
    <section
      className="foundry-review-chat"
      data-testid="foundry-review-chat"
      aria-label="Foundry review AI chat"
    >
      <header className="foundry-review-chat__header">
        <strong>Review AI</strong>
        <span title={`POST /api/protocol-ide/foundry/${protocolId}/${variant}/chat → ${DEFAULT_REVIEW_ENDPOINT}`}>
          {DEFAULT_REVIEW_ENDPOINT}
        </span>
      </header>
      <div className="foundry-review-chat__scroller" ref={scrollerRef}>
        {messages.length === 0 && (
          <p className="foundry-review-chat__empty">
            Ask the local review model about this protocol/variant. The bounded context packet is
            sent on every turn — only this protocol/variant.
          </p>
        )}
        {messages.map((msg, idx) => (
          <div
            key={`${msg.role}-${idx}-${msg.at ?? ''}`}
            className={`foundry-review-chat__msg foundry-review-chat__msg--${msg.role}`}
            data-testid={`foundry-chat-msg-${idx}`}
          >
            <span className="foundry-review-chat__role">{msg.role}</span>
            <pre className="foundry-review-chat__content">
              {msg.content || (msg.pending ? '…' : '')}
            </pre>
          </div>
        ))}
        {error && <p className="foundry-review-chat__error">{error}</p>}
      </div>
      <form
        className="foundry-review-chat__composer"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <textarea
          aria-label="Chat prompt"
          data-testid="foundry-chat-input"
          rows={2}
          placeholder="Ask the review AI about this protocol/variant..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isStreaming}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button
          type="submit"
          data-testid="foundry-chat-send"
          disabled={isStreaming || draft.trim().length === 0}
        >
          {isStreaming ? 'Streaming…' : 'Send'}
        </button>
      </form>
      <style>{`
        .foundry-review-chat {
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: #fff;
          border: 1px solid #dde5ef;
          border-radius: 8px;
          overflow: hidden;
        }
        .foundry-review-chat__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.45rem 0.75rem;
          border-bottom: 1px solid #eef2f7;
          font-size: 0.78rem;
          color: #334155;
        }
        .foundry-review-chat__header span {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.72rem;
          color: #64748b;
          background: #f1f5f9;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
        }
        .foundry-review-chat__scroller {
          flex: 1;
          min-height: 6rem;
          max-height: 14rem;
          overflow-y: auto;
          padding: 0.5rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          background: #f8fafc;
        }
        .foundry-review-chat__empty {
          margin: 0;
          font-size: 0.78rem;
          color: #64748b;
        }
        .foundry-review-chat__msg {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          padding: 0.45rem 0.6rem;
          border-radius: 6px;
          background: #fff;
          border: 1px solid #e2e8f0;
        }
        .foundry-review-chat__msg--user {
          background: #eef6ff;
          border-color: #c8def8;
          align-self: flex-end;
          max-width: 90%;
        }
        .foundry-review-chat__msg--assistant {
          align-self: flex-start;
          max-width: 90%;
        }
        .foundry-review-chat__role {
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #64748b;
        }
        .foundry-review-chat__content {
          margin: 0;
          font-family: inherit;
          font-size: 0.82rem;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          color: #1e293b;
        }
        .foundry-review-chat__error {
          color: #b42318;
          font-size: 0.75rem;
        }
        .foundry-review-chat__composer {
          display: flex;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border-top: 1px solid #eef2f7;
          align-items: flex-end;
        }
        .foundry-review-chat__composer textarea {
          flex: 1;
          resize: vertical;
          padding: 0.4rem 0.5rem;
          font: inherit;
          font-size: 0.82rem;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
        }
        .foundry-review-chat__composer button {
          padding: 0.4rem 0.85rem;
          border-radius: 6px;
          border: 1px solid #1d4ed8;
          background: #1d4ed8;
          color: #fff;
          font-weight: 600;
          font-size: 0.82rem;
          cursor: pointer;
        }
        .foundry-review-chat__composer button[disabled] {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </section>
  )
}
