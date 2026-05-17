import { useCallback, useEffect, useRef, useState } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { streamDraftEvents, getAiHealth } from '../../shared/api/aiClient'
import type { AiConversationMessage } from '../../types/ai'
import { buildAiRequestContext } from './buildAiContext'
import type { PlateEvent } from '../../types/events'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status'
  content: string
  draftedEvents?: PlateEvent[]
}

type DockMode = 'precompile' | 'ai'

export function EventEditorAiDock() {
  const { state, actions } = useEventEditor()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [mode, setMode] = useState<DockMode>('precompile')
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    getAiHealth()
      .then((h) => { if (!cancelled) setAiAvailable(h.available) })
      .catch(() => { if (!cancelled) setAiAvailable(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setStreaming(true)
    const userId = `m-${Date.now()}-u`
    const assistantId = `m-${Date.now()}-a`
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '' },
    ])

    const history: AiConversationMessage[] = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const context = buildAiRequestContext(state)
      let assistantText = ''
      const drafted: PlateEvent[] = []
      const deterministicOnly = mode === 'precompile'
      for await (const event of streamDraftEvents(text, context, history, controller.signal, { deterministicOnly })) {
        if (event.type === 'text_delta') {
          assistantText += event.delta
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: assistantText } : m)),
          )
        } else if (event.type === 'draft') {
          drafted.push(...event.events)
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, draftedEvents: [...drafted] } : m)),
          )
        } else if (event.type === 'status') {
          setMessages((prev) => [
            ...prev,
            { id: `m-${Date.now()}-s`, role: 'status', content: event.message },
          ])
        } else if (event.type === 'error') {
          setMessages((prev) => [
            ...prev,
            { id: `m-${Date.now()}-e`, role: 'status', content: `Error: ${event.message}` },
          ])
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMessages((prev) => [
        ...prev,
        { id: `m-${Date.now()}-e`, role: 'status', content: `Stream failed: ${message}` },
      ])
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, messages, mode, state, streaming])

  function handleAccept(events: PlateEvent[]) {
    for (const event of events) actions.appendEvent(event)
  }

  return (
    <aside className="ai-dock" aria-label="AI assistant">
      <div className="ai-dock__log" ref={logRef}>
        {messages.length === 0 ? (
          <div className="ai-dock__empty">
            Ask the AI to draft events — e.g. "fill column 1 with 100 µL DMEM" or "transfer 10 µL
            from A1 of source to row A of dest".
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className="ai-dock__msg" data-role={m.role}>
            <span className="ai-dock__role">{m.role === 'user' ? 'you' : m.role === 'assistant' ? 'ai' : '·'}</span>
            <div className="ai-dock__bubble">
              <div className="ai-dock__text">{m.content || (m.role === 'assistant' && streaming ? '…' : '')}</div>
              {m.draftedEvents && m.draftedEvents.length > 0 ? (
                <div className="ai-dock__events">
                  <span className="ai-dock__events-summary">
                    {m.draftedEvents.length} event{m.draftedEvents.length === 1 ? '' : 's'} drafted
                  </span>
                  <button
                    type="button"
                    className="ai-dock__accept"
                    onClick={() => handleAccept(m.draftedEvents ?? [])}
                  >Accept</button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <form
        className="ai-dock__input-row"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <div
          className="ai-dock__mode"
          role="radiogroup"
          aria-label="Drafting mode"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'precompile'}
            className="ai-dock__mode-opt"
            data-active={mode === 'precompile'}
            onClick={() => setMode('precompile')}
            disabled={streaming}
            title="Use the deterministic precompiler only — no LLM call."
          >Precompile</button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'ai'}
            className="ai-dock__mode-opt"
            data-active={mode === 'ai'}
            onClick={() => setMode('ai')}
            disabled={streaming || aiAvailable === false}
            title={
              aiAvailable === false
                ? 'AI is not configured. Open Settings to add provider, model, and API key.'
                : 'Allow the LLM to assist when the deterministic precompiler is incomplete.'
            }
          >AI</button>
        </div>
        <input
          type="text"
          className="ai-dock__input"
          placeholder={streaming ? 'Streaming…' : 'Describe what to do…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
        />
        {streaming ? (
          <button
            type="button"
            className="ai-dock__send ai-dock__send--cancel"
            onClick={() => abortRef.current?.abort()}
          >Stop</button>
        ) : (
          <button type="submit" className="ai-dock__send" disabled={!input.trim()}>Send</button>
        )}
      </form>
    </aside>
  )
}
