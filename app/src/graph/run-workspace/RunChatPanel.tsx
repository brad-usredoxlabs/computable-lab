import { useState, useRef, useEffect, useCallback } from 'react'

export interface RunMessage {
  id: string
  text: string
  timestamp: string
  type: 'user' | 'system' | 'timeline'
}

export interface ExecutionEvent {
  id: string
  eventRef: string
  state?: 'pending' | 'current' | 'running' | 'completed' | 'skipped' | 'deviated'
  observations: Array<{ text: string; timestamp: string; eventRef?: string }>
  deviations: Array<{ eventRef: string; parameter: string; plannedValue: string; actualValue: string; note?: string; timestamp: string }>
  timestamp: string
}

export interface RunChatPanelProps {
  runId?: string
  onStateChange?: (eventRef: string, state: string) => void
  selectedEventRef?: string | null
  executionStates?: Map<string, { state: string; startedAt?: string; completedAt?: string; deviationNote?: string }>
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

/**
 * Build a summary of the AI's interpretation for display in chat.
 */
function formatInterpretation(
  interpretation: string,
  data: Record<string, unknown>,
): string {
  const parts: string[] = [interpretation]

  if (data.suggestedStateChange) {
    const sc = data.suggestedStateChange as { eventRef?: string; toState?: string }
    parts.push(`State change: ${sc.eventRef ?? '?'} → ${sc.toState ?? '?'}`)
  }
  if (data.observation) {
    const obs = data.observation as { text?: string }
    if (obs.text) parts.push(`Observation: ${obs.text}`)
  }
  if (data.deviation) {
    const dev = data.deviation as { parameter?: string; plannedValue?: string; actualValue?: string }
    parts.push(`Deviation: ${dev.parameter ?? '?'} was ${dev.plannedValue ?? '?'}, now ${dev.actualValue ?? '?'}`)
  }

  return parts.join('\n')
}

export function RunChatPanel({ runId, onStateChange, selectedEventRef, executionStates }: RunChatPanelProps) {
  const [messages, setMessages] = useState<RunMessage[]>([SYSTEM_WELCOME])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fetch execution events when selectedEventRef changes
  useEffect(() => {
    if (!runId || !selectedEventRef) {
      // Reset to normal chat mode
      setExecutionEvents([])
      return
    }

    const fetchExecutionEvents = async () => {
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/execution-events`)
        if (!res.ok) {
          throw new Error(`Failed to fetch execution events: ${res.status}`)
        }
        const data = await res.json() as { events: ExecutionEvent[] }
        // Filter for the selected event
        const filtered = data.events.filter((evt) => evt.eventRef === selectedEventRef)
        setExecutionEvents(filtered)
      } catch (err) {
        console.error('Failed to fetch execution events:', err)
      }
    }

    fetchExecutionEvents()
  }, [runId, selectedEventRef])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || sending) return

    const userMsg: RunMessage = {
      id: generateId(),
      text: trimmed,
      timestamp: new Date().toISOString(),
      type: 'user',
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)

    if (!runId) {
      // No runId — echo locally (Phase 1 behavior)
      const sysMsg: RunMessage = {
        id: generateId(),
        text: `(No run selected) Received: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}"`,
        timestamp: new Date().toISOString(),
        type: 'system',
      }
      setMessages((prev) => [...prev, sysMsg])
      setSending(false)
      return
    }

    // Call the check-in API
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `API returned ${res.status}`)
      }

      const data = await res.json() as Record<string, unknown>

      // Build the AI interpretation display
      const interpretation = typeof data.interpretation === 'string'
        ? data.interpretation
        : 'Check-in received'

      const displayText = formatInterpretation(interpretation, data)

      // Show AI interpretation as system message
      const sysMsg: RunMessage = {
        id: generateId(),
        text: displayText,
        timestamp: new Date().toISOString(),
        type: 'system',
      }
      setMessages((prev) => [...prev, sysMsg])

      // On suggested state change, dispatch event to update graph chips
      if (data.suggestedStateChange && onStateChange) {
        const sc = data.suggestedStateChange as { eventRef?: string; toState?: string }
        if (sc.eventRef && sc.toState) {
          onStateChange(sc.eventRef, sc.toState)
        }
      }
    } catch (err) {
      const sysMsg: RunMessage = {
        id: generateId(),
        text: `Error: ${err instanceof Error ? err.message : 'Failed to send check-in'}`,
        timestamp: new Date().toISOString(),
        type: 'system',
      }
      setMessages((prev) => [...prev, sysMsg])
    } finally {
      setSending(false)
    }
  }, [input, sending, runId, onStateChange])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="run-chat-panel">
      <div className="run-chat-panel__header">
        <span className="run-chat-panel__title">
          {selectedEventRef ? `Execution History: ${selectedEventRef}` : 'Run Chat'}
        </span>
        <span className="run-chat-panel__count">{messages.length} messages</span>
      </div>

      <div className="run-chat-panel__messages" ref={scrollRef}>
        {/* Show execution timeline if event is selected */}
        {selectedEventRef && executionEvents.length > 0 && (
          <>
            <div className="run-chat-panel__timeline-header">
              <strong>Execution Timeline for "{selectedEventRef}"</strong>
              <button
                className="run-chat-panel__clear-filter"
                onClick={() => { /* Parent will handle clearing via prop change */ }}
                type="button"
                title="Clear event filter"
              >
                ✕ Clear filter
              </button>
            </div>
            {executionEvents.flatMap((evt) => {
              const timelineEntries: RunMessage[] = []
              
              // State change entry
              if (evt.state) {
                timelineEntries.push({
                  id: `timeline-${evt.id}-state`,
                  text: `${formatTime(evt.timestamp)} — ${evt.state === 'running' ? 'Started' : evt.state === 'completed' ? 'Completed' : evt.state === 'deviated' ? 'Deviated' : evt.state === 'skipped' ? 'Skipped' : 'Pending'}${executionStates?.get(evt.eventRef)?.deviationNote ? ` (${executionStates.get(evt.eventRef)?.deviationNote})` : ''}`,
                  timestamp: evt.timestamp,
                  type: 'timeline',
                })
              }
              
              // Observations
              for (const obs of evt.observations) {
                timelineEntries.push({
                  id: `timeline-${evt.id}-obs-${obs.timestamp}`,
                  text: `${formatTime(obs.timestamp)} — Observation: ${obs.text}`,
                  timestamp: obs.timestamp,
                  type: 'timeline',
                })
              }
              
              // Deviations
              for (const dev of evt.deviations) {
                timelineEntries.push({
                  id: `timeline-${evt.id}-dev-${dev.timestamp}`,
                  text: `${formatTime(dev.timestamp)} — Deviation: ${dev.parameter} was ${dev.plannedValue}, now ${dev.actualValue}${dev.note ? ` (${dev.note})` : ''}`,
                  timestamp: dev.timestamp,
                  type: 'timeline',
                })
              }
              
              return timelineEntries
            })}
          </>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`run-chat-panel__message run-chat-panel__message--${msg.type}`}
          >
            <div className="run-chat-panel__bubble">
              <div className="run-chat-panel__text" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
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
          disabled={!input.trim() || sending}
          title="Send message"
        >
          {sending ? '…' : 'Send'}
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

        .run-chat-panel__timeline-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          margin-bottom: 0.5rem;
          background: #fffbeb;
          border: 1px solid #fcd34d;
          border-radius: 8px;
          font-size: 0.78rem;
        }

        .run-chat-panel__timeline-header strong {
          color: #92400e;
        }

        .run-chat-panel__clear-filter {
          border: none;
          background: #f59e0b;
          color: #fff;
          border-radius: 4px;
          padding: 0.25rem 0.5rem;
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .run-chat-panel__clear-filter:hover {
          background: #d97706;
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

        .run-chat-panel__message--timeline .run-chat-panel__bubble {
          background: #fef3c7;
          color: #92400e;
          border-left: 3px solid #f59e0b;
          border-bottom-left-radius: 2px;
          font-family: 'Courier New', monospace;
          font-size: 0.78rem;
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
