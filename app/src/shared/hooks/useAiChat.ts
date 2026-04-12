/**
 * useAiChat — Core hook for AI chat panel state management.
 *
 * Accepts an AiContext interface so it can be used from any page surface.
 * When used from the labware editor, the caller builds the AiContext from editor state.
 * When used from other pages, the caller provides page-specific context.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { streamAssist, getAiHealth } from '../api/aiClient'
import { parsePromptMentions } from '../lib/aiPromptMentions'
import type { PlateEvent } from '../../types/events'
import type { RecordRef } from '../../types/ref'
import type { AiContext, FileAttachment } from '../../types/aiContext'
import type {
  ChatMessage,
  AiStreamEvent,
  AiHealthStatus,
  OntologyRefProposal,
  AiConversationMessage,
} from '../../types/ai'

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
}

const MAX_HISTORY_MESSAGES = 20
const MAX_HISTORY_CONTENT_CHARS = 8_000

function buildConversationHistory(messages: ChatMessage[]): AiConversationMessage[] {
  return messages
    .filter((message): message is ChatMessage & { role: 'user' | 'assistant' } => (
      (message.role === 'user' || message.role === 'assistant')
      && !message.isStreaming
      && message.content.trim().length > 0
    ))
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_HISTORY_CONTENT_CHARS),
    }))
}

export interface UseAiChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  previewEvents: PlateEvent[]
  hasPreview: boolean
  unresolvedRefs: OntologyRefProposal[]
  sendPrompt: (prompt: string, attachments?: FileAttachment[]) => void
  cancelStream: () => void
  acceptPreview: () => void
  acceptPreviewWithResolutions: (resolutions: Map<string, RecordRef>) => void
  rejectPreview: () => void
  clearHistory: () => void
  aiAvailable: boolean | null
  recheckHealth: () => void
}

/**
 * Callback that the host page provides so accepted events can be applied.
 * For the labware editor this calls addEvent; other pages can provide a no-op
 * or their own handler.
 */
export type AcceptEventHandler = (event: PlateEvent) => void

interface UseAiChatOptions {
  /** Page-level AI context — determines surface and context payload. */
  aiContext: AiContext
  /** Handler called for each accepted preview event. */
  onAcceptEvent?: AcceptEventHandler
}

export function useAiChat({ aiContext, onAcceptEvent }: UseAiChatOptions): UseAiChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [previewEvents, setPreviewEvents] = useState<PlateEvent[]>([])
  const [unresolvedRefs, setUnresolvedRefs] = useState<OntologyRefProposal[]>([])
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // Session-level cache: ontology CURIE → RecordRef from previous material creation.
  const resolvedCache = useRef<Map<string, RecordRef>>(new Map())

  // Keep a stable ref to the latest aiContext so callbacks don't go stale.
  const aiContextRef = useRef(aiContext)
  aiContextRef.current = aiContext

  const onAcceptEventRef = useRef(onAcceptEvent)
  onAcceptEventRef.current = onAcceptEvent

  // Check health on mount
  const checkHealth = useCallback(() => {
    getAiHealth().then((h: AiHealthStatus) => {
      setAiAvailable(h.available)
    })
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  // ------------------------------------------------------------------
  // Send a prompt
  // ------------------------------------------------------------------
  const sendPrompt = useCallback(
    async (prompt: string, attachments?: FileAttachment[]) => {
      if (isStreaming) return

      // Auto-reject existing preview before starting new stream
      if (previewEvents.length > 0) {
        setPreviewEvents([])
        setUnresolvedRefs([])
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            role: 'system',
            content: 'Previous preview was auto-rejected.',
            timestamp: Date.now(),
          },
        ])
      }

      const userMsg: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
        ...(attachments && attachments.length > 0
          ? {
              attachments: attachments.map((a) => ({
                name: a.name,
                size: a.size,
                type: a.type,
                previewUrl: a.previewUrl,
              })),
            }
          : {}),
      }

      const assistantId = generateMessageId()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streamEvents: [],
        isStreaming: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      const ctx = aiContextRef.current
      const contextPayload: Record<string, unknown> = { ...ctx.surfaceContext }
      // Inject mentions for event-editor surface
      if (ctx.surface === 'event-editor') {
        contextPayload.mentions = parsePromptMentions(prompt)
      }
      if (ctx.editorMode) {
        contextPayload.editorMode = ctx.editorMode
      }

      const history = buildConversationHistory(messages)
      const accumulated: AiStreamEvent[] = []

      const files = attachments?.map((a) => a.file)

      try {
        for await (const event of streamAssist(prompt, ctx.surface, contextPayload, history, controller.signal, files)) {
          accumulated.push(event)

          const content = buildAssistantContent(accumulated)

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content, streamEvents: [...accumulated], isStreaming: true }
                : m
            )
          )

          if (event.type === 'done') {
            const result = event.result
            setPreviewEvents(result.events ?? [])
            const pending = (result.unresolvedRefs ?? []).filter(
              (p) => !resolvedCache.current.has(p.ref.id)
            )
            setUnresolvedRefs(pending)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: result.clarification?.prompt ?? result.clarificationNeeded ?? content,
                      streamEvents: [...accumulated],
                      events: result.events ?? [],
                      clarification: result.clarification,
                      usage: result.usage,
                      isStreaming: false,
                    }
                  : m
              )
            )
            break
          }

          if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `Error: ${event.message}`, isStreaming: false }
                  : m
              )
            )
            break
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + '\n\n(Cancelled)', isStreaming: false }
                : m
            )
          )
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `Error: ${(err as Error).message || 'Unknown error'}`,
                    isStreaming: false,
                  }
                : m
            )
          )
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [isStreaming, previewEvents, messages]
  )

  // ------------------------------------------------------------------
  // Cancel the current stream
  // ------------------------------------------------------------------
  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // ------------------------------------------------------------------
  // Accept preview events → add to editor (applies cached resolutions)
  // ------------------------------------------------------------------
  const acceptPreview = useCallback(() => {
    const cache = resolvedCache.current
    const handler = onAcceptEventRef.current
    if (handler) {
      for (const event of previewEvents) {
        handler(cache.size > 0 ? rewriteEventRefs(event, cache) : event)
      }
    }
    setPreviewEvents([])
    setMessages((prev) => [
      ...prev,
      {
        id: generateMessageId(),
        role: 'system',
        content: `Accepted ${previewEvents.length} event${previewEvents.length !== 1 ? 's' : ''}.`,
        timestamp: Date.now(),
      },
    ])
  }, [previewEvents])

  // ------------------------------------------------------------------
  // Accept preview events with resolved material refs
  // ------------------------------------------------------------------
  const acceptPreviewWithResolutions = useCallback(
    (resolutions: Map<string, RecordRef>) => {
      for (const [key, value] of resolutions) {
        resolvedCache.current.set(key, value)
      }
      const combined = resolvedCache.current
      const handler = onAcceptEventRef.current
      if (handler) {
        for (const event of previewEvents) {
          handler(rewriteEventRefs(event, combined))
        }
      }
      setPreviewEvents([])
      setUnresolvedRefs([])
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'system',
          content: `Accepted ${previewEvents.length} event${previewEvents.length !== 1 ? 's' : ''} (resolved ${resolutions.size} material${resolutions.size !== 1 ? 's' : ''}).`,
          timestamp: Date.now(),
        },
      ])
    },
    [previewEvents]
  )

  // ------------------------------------------------------------------
  // Reject preview events
  // ------------------------------------------------------------------
  const rejectPreview = useCallback(() => {
    const count = previewEvents.length
    setPreviewEvents([])
    setUnresolvedRefs([])
    setMessages((prev) => [
      ...prev,
      {
        id: generateMessageId(),
        role: 'system',
        content: `Rejected ${count} event${count !== 1 ? 's' : ''}.`,
        timestamp: Date.now(),
      },
    ])
  }, [previewEvents])

  // ------------------------------------------------------------------
  // Clear chat history
  // ------------------------------------------------------------------
  const clearHistory = useCallback(() => {
    setMessages([])
    setPreviewEvents([])
    setUnresolvedRefs([])
  }, [])

  return {
    messages,
    isStreaming,
    previewEvents,
    hasPreview: previewEvents.length > 0,
    unresolvedRefs,
    sendPrompt,
    cancelStream,
    acceptPreview,
    acceptPreviewWithResolutions,
    rejectPreview,
    clearHistory,
    aiAvailable,
    recheckHealth: checkHealth,
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build human-readable assistant content from accumulated SSE events.
 */
function buildAssistantContent(events: AiStreamEvent[]): string {
  const parts: string[] = []

  for (const ev of events) {
    switch (ev.type) {
      case 'status':
        parts.push(ev.message)
        break
      case 'thinking':
        break
      case 'tool_call':
        break
      case 'tool_result':
        break
      case 'draft':
        parts.push(
          `Drafted ${ev.events.length} event${ev.events.length !== 1 ? 's' : ''}${
            ev.notes?.length ? ': ' + ev.notes.join('; ') : ''
          }`
        )
        break
      case 'done':
        if ((ev.result.notes ?? []).length) {
          parts.push((ev.result.notes ?? []).join('\n'))
        }
        if ((ev.result.events ?? []).length === 0) {
          parts.push('No events generated.')
        }
        break
      case 'error':
        parts.push(`Error: ${ev.message}`)
        break
    }
  }

  return parts.join('\n') || 'Thinking...'
}

/**
 * Deep-clone a PlateEvent and replace any ontology refs in `details`
 * with resolved record refs from the resolutions map.
 */
function rewriteEventRefs(event: PlateEvent, resolutions: Map<string, RecordRef>): PlateEvent {
  if (!event.details || resolutions.size === 0) return event

  const detailsCopy = { ...event.details } as Record<string, unknown>
  let changed = false

  for (const [key, value] of Object.entries(detailsCopy)) {
    if (
      value &&
      typeof value === 'object' &&
      'kind' in value &&
      (value as { kind: string }).kind === 'ontology'
    ) {
      const ontId = (value as unknown as { id: string }).id
      const resolved = resolutions.get(ontId)
      if (resolved) {
        detailsCopy[key] = resolved
        changed = true
      }
    }
  }

  return changed ? { ...event, details: detailsCopy as PlateEvent['details'] } : event
}
