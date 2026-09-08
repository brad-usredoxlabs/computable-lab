/**
 * ChatPage — standalone ChatGPT-style chat against the local AI model
 * (Ornith, or whichever ai profile is active in config.yaml).
 *
 * Streams the assistant reply via /api/ai/chat/stream (server proxies to
 * Ollama's native /api/chat) and shows live prompt-processing (PP) and
 * decode tokens/s readouts from the stream's final timing event.
 *
 * Model switching reuses the app's ModelSwitcher (lists /api/config/ai/profiles
 * and hot-swaps the active profile server-side). Because the server resolves
 * the active profile for every request, a switch here takes effect on the
 * next message with no reload.
 */

import { useEffect, useRef, useState } from 'react'
import { ModelSwitcher } from '../event-editor/right-pane/ai/ModelSwitcher'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { streamChat, type ChatMessageInput } from './chatClient'
import './ChatPage.css'

interface ChatMessageView {
  role: 'user' | 'assistant'
  content: string
}

interface TimingView {
  ppTokensPerSec: number | null
  decodeTokensPerSec: number | null
}

const INITIAL_WELCOME: ChatMessageView = {
  role: 'assistant',
  content: 'Connected to the local model. Ask away — streaming replies with live token-rate readouts below.',
}

function formatRate(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return v >= 100 ? v.toFixed(0) : v.toFixed(1)
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessageView[]>([INITIAL_WELCOME])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timing, setTiming] = useState<TimingView | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Keep the log scrolled to the newest message as tokens stream in.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMessage: ChatMessageView = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setError(null)
    setTiming(null)
    setStreaming(true)

    // Append an empty assistant bubble we fill with streaming deltas.
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    const history: ChatMessageInput[] = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => m.content.length > 0)
      .map((m) => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content: text })

    const abort = new AbortController()
    abortRef.current = abort

    try {
      for await (const event of streamChat(history, undefined, abort.signal)) {
        if (event.type === 'chunk') {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { role: 'assistant', content: last.content + event.content }
            }
            return next
          })
        } else if (event.type === 'timing') {
          setTiming({ ppTokensPerSec: event.ppTokensPerSec, decodeTokensPerSec: event.decodeTokensPerSec })
        } else if (event.type === 'error') {
          setError(event.message)
        }
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const stop = () => abortRef.current?.abort()

  const chatPane = (
    <div className="chat-page" data-testid="chat-page">
      <header className="chat-page__header">
        <div className="chat-page__title-row">
          <h1 className="chat-page__title">Local AI Chat</h1>
          <ModelSwitcher />
        </div>
        <div className="chat-page__timing" data-testid="chat-timing">
          <div className="chat-page__stat" data-testid="chat-stat-pp">
            <span className="chat-page__stat-label">PP</span>
            <span className="chat-page__stat-value">{formatRate(timing?.ppTokensPerSec ?? null)}</span>
            <span className="chat-page__stat-unit">tok/s</span>
          </div>
          <div className="chat-page__stat" data-testid="chat-stat-decode">
            <span className="chat-page__stat-label">Decode</span>
            <span className="chat-page__stat-value">{formatRate(timing?.decodeTokensPerSec ?? null)}</span>
            <span className="chat-page__stat-unit">tok/s</span>
          </div>
          {streaming ? <span className="chat-page__streaming" data-testid="chat-streaming">streaming…</span> : null}
        </div>
      </header>

      {error ? (
        <div className="chat-page__error" role="alert" data-testid="chat-error">
          {error}
        </div>
      ) : null}

      <div className="chat-page__log" ref={logRef} data-testid="chat-log">
        {messages.map((m, i) => (
          <div key={i} className={`chat-page__msg chat-page__msg--${m.role}`} data-testid={`chat-msg-${m.role}`}>
            <div className="chat-page__msg-bubble">{m.content || (streaming && i === messages.length - 1 ? '…' : '')}</div>
          </div>
        ))}
      </div>

      <div className="chat-page__composer">
        <textarea
          className="chat-page__input"
          rows={3}
          value={input}
          placeholder="Ask the local model…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          disabled={streaming}
          data-testid="chat-input"
        />
        <div className="chat-page__composer-actions">
          {streaming ? (
            <button type="button" className="chat-page__send" onClick={stop} data-testid="chat-stop">
              Stop
            </button>
          ) : (
            <button type="button" className="chat-page__send" onClick={() => void send()} disabled={!input.trim()} data-testid="chat-send">
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <AppShell brand="Chat" topbarTabs={<WorkspaceTabStrip />} layout="workspace" leftPane={chatPane} />
  )
}
