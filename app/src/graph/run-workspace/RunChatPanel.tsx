import { useState, useRef, useEffect, useCallback } from 'react'

export interface RunMessage {
  id: string
  text: string
  timestamp: string
  type: 'user' | 'system'
}

const SYSTEM_WELCOME: RunMessage = {
  id: 'sys-0',
  text: 'Run session started. Use this chat to log observations, ask questions, or receive execution updates.',
  timestamp: new Date().toISOString(),
  type: 'system',
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function RunChatPanel() {
  const [messages, setMessages] = useState<RunMessage[]>([SYSTEM_WELCOME])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    const userMsg: RunMessage = {
      id: generateId(),
      text: trimmed,
      timestamp: new Date().toISOString(),
      type: 'user',
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')

    // Echo a system acknowledgment
    const sysMsg: RunMessage = {
      id: generateId(),
      text: `Received: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}"`,
      timestamp: new Date().toISOString(),
      type: 'system',
    }
    setMessages((prev) => [...prev, sysMsg])
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="run-chat-panel">
      <div className="run-chat-panel__header">
        <span className="run-chat-panel__title">Run Chat</span>
        <span className="run-chat-panel__count">{messages.length} messages</span>
      </div>

      <div className="run-chat-panel__messages" ref={scrollRef}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`run-chat-panel__message run-chat-panel__message--${msg.type}`}
          >
            <div className="run-chat-panel__bubble">
              <div className="run-chat-panel__text">{msg.text}</div>
              <div className="run-chat-panel__time">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="run-chat-panel__input-area">
        <textarea
          className="run-chat-panel__textarea"
          placeholder="Type a message…"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="run-chat-panel__send"
          onClick={handleSend}
          disabled={!input.trim()}
          title="Send message"
        >
          Send
        </button>
      </div>

      <style>{`
        .run-chat-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 340px;
          font-family: inherit;
        }

        .run-chat-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 0.8rem;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 8px 8px 0 0;
        }

        .run-chat-panel__title {
          font-weight: 700;
          font-size: 0.85rem;
          color: #0f172a;
        }

        .run-chat-panel__count {
          font-size: 0.7rem;
          color: #94a3b8;
        }

        .run-chat-panel__messages {
          flex: 1;
          overflow-y: auto;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .run-chat-panel__message {
          display: flex;
        }

        .run-chat-panel__message--user {
          justify-content: flex-end;
        }

        .run-chat-panel__message--system {
          justify-content: flex-start;
        }

        .run-chat-panel__bubble {
          max-width: 85%;
          padding: 0.55rem 0.75rem;
          border-radius: 10px;
          line-height: 1.45;
          font-size: 0.82rem;
        }

        .run-chat-panel__message--user .run-chat-panel__bubble {
          background: #0969da;
          color: #fff;
          border-bottom-right-radius: 2px;
        }

        .run-chat-panel__message--system .run-chat-panel__bubble {
          background: #f1f5f9;
          color: #1e293b;
          border-bottom-left-radius: 2px;
        }

        .run-chat-panel__time {
          font-size: 0.65rem;
          margin-top: 0.25rem;
          opacity: 0.6;
        }

        .run-chat-panel__input-area {
          display: flex;
          gap: 0.4rem;
          padding: 0.6rem;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 0 0 8px 8px;
        }

        .run-chat-panel__textarea {
          flex: 1;
          resize: none;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 0.45rem 0.6rem;
          font-size: 0.82rem;
          font-family: inherit;
          line-height: 1.4;
          outline: none;
          transition: border-color 0.15s;
        }

        .run-chat-panel__textarea:focus {
          border-color: #0969da;
        }

        .run-chat-panel__send {
          align-self: flex-end;
          border: none;
          background: #0969da;
          color: #fff;
          border-radius: 6px;
          padding: 0.45rem 0.9rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .run-chat-panel__send:hover:not(:disabled) {
          background: #0550b6;
        }

        .run-chat-panel__send:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
