import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient, type FoundryChatMessage } from '../shared/api/client'

export interface FoundryChatTurn {
  role: 'user' | 'assistant'
  content: string
  at?: string
  pending?: boolean
}

export interface UseFoundryReviewChatResult {
  messages: FoundryChatTurn[]
  isStreaming: boolean
  error: string | null
  submit: (prompt: string) => Promise<void>
  reset: (transcript: FoundryChatMessage[]) => void
}

export function useFoundryReviewChat(args: {
  protocolId: string
  variant: string
  initialTranscript?: FoundryChatMessage[]
}): UseFoundryReviewChatResult {
  const { protocolId, variant } = args
  const [messages, setMessages] = useState<FoundryChatTurn[]>(() =>
    (args.initialTranscript ?? []).map((m) => ({ ...m })),
  )
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Hydrate when the selected protocol/variant changes — fresh transcript belongs
  // to that pair, not the previous one.
  const initialKey = `${protocolId}/${variant}`
  const lastKeyRef = useRef(initialKey)
  useEffect(() => {
    if (lastKeyRef.current === initialKey) return
    lastKeyRef.current = initialKey
    setMessages((args.initialTranscript ?? []).map((m) => ({ ...m })))
    setError(null)
  }, [initialKey, args.initialTranscript])

  const reset = useCallback((transcript: FoundryChatMessage[]) => {
    setMessages(transcript.map((m) => ({ ...m })))
    setError(null)
  }, [])

  const submit = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed || isStreaming) return
    setError(null)
    setIsStreaming(true)
    const userTurn: FoundryChatTurn = { role: 'user', content: trimmed, at: new Date().toISOString() }
    const placeholder: FoundryChatTurn = { role: 'assistant', content: '', pending: true }
    const baseHistory: FoundryChatMessage[] = messages
      .filter((m) => !m.pending)
      .map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, userTurn, placeholder])

    const controller = new AbortController()
    abortRef.current = controller
    try {
      let assembled = ''
      const stream = apiClient.streamFoundryReviewChat(
        protocolId,
        variant,
        trimmed,
        baseHistory,
        controller.signal,
      )
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          assembled += event.delta
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.pending) {
              next[next.length - 1] = { ...last, content: assembled }
            }
            return next
          })
        } else if (event.type === 'error') {
          setError(event.message)
        }
      }
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.pending) {
          next[next.length - 1] = {
            role: 'assistant',
            content: assembled || last.content,
            at: new Date().toISOString(),
          }
        }
        return next
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setMessages((prev) => prev.filter((m) => !m.pending))
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [protocolId, variant, messages, isStreaming])

  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])

  return { messages, isStreaming, error, submit, reset }
}
