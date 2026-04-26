/**
 * useAiChat — Core hook for AI chat panel state management.
 *
 * Accepts an AiContext interface so it can be used from any page surface.
 * When used from the labware editor, the caller builds the AiContext from editor state.
 * When used from other pages, the caller provides page-specific context.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { streamAssist, getAiHealth } from '../api/aiClient'
import { apiClient } from '../api/client'
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
  AiLabwareAddition,
} from '../../types/ai'

const FALLBACK_APPLY_TO_GRAPH_TEXT = 'Apply the protocol to the labware graph.'
let _warnedFallbackOnce = false

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

export type PreviewEventState = 'pending' | 'accepted' | 'rejected'

export interface UseAiChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  isAccepting: boolean
  previewEvents: PlateEvent[]
  previewLabwareAdditions: AiLabwareAddition[]
  previewEventStates: Map<string, PreviewEventState>
  hasPreview: boolean
  unresolvedRefs: OntologyRefProposal[]
  inputText: string
  sendPrompt: (prompt: string, attachments?: FileAttachment[]) => void
  cancelStream: () => void
  acceptPreview: () => void
  acceptPreviewWithResolutions: (resolutions: Map<string, RecordRef>) => void
  rejectPreview: () => void
  setPreviewEventState: (eventId: string, state: PreviewEventState) => void
  setPreviewEvents: (events: PlateEvent[]) => void
  commitAcceptedPreviewEvents: () => Promise<void>
  clearHistory: () => void
  applyToGraph: (message: ChatMessage) => void
  aiAvailable: boolean | null
  recheckHealth: () => void
}

/**
 * Callback that the host page provides so accepted events can be applied.
 * For the labware editor this calls addEvent; other pages can provide a no-op
 * or their own handler.
 */
export type AcceptEventHandler = (event: PlateEvent) => void

/**
 * Callback for adding labware from a record.
 */
export type AddLabwareFromRecordHandler = (record: Record<string, unknown>) => void

interface UseAiChatOptions {
  /** Page-level AI context — determines surface and context payload. */
  aiContext: AiContext
  /** Handler called for each accepted preview event. */
  onAcceptEvent?: AcceptEventHandler
  /** Handler called to add labware from a record (for AI-proposed additions). */
  onAddLabwareFromRecord?: AddLabwareFromRecordHandler
}

export function useAiChat({ aiContext, onAcceptEvent, onAddLabwareFromRecord }: UseAiChatOptions): UseAiChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  const [previewEvents, setPreviewEvents] = useState<PlateEvent[]>([])
  const [previewLabwareAdditions, setPreviewLabwareAdditions] = useState<AiLabwareAddition[]>([])
  const [previewEventStates, setPreviewEventStatesMap] = useState<Map<string, PreviewEventState>>(new Map())
  const [unresolvedRefs, setUnresolvedRefs] = useState<OntologyRefProposal[]>([])
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  const [inputText, setInputText] = useState('')

  // Fetched apply-to-graph template from prompt-templates registry.
  const [applyToGraphTemplate, setApplyToGraphTemplate] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // Session-level cache: ontology CURIE → RecordRef from previous material creation.
  const resolvedCache = useRef<Map<string, RecordRef>>(new Map())

  // Keep a stable ref to the latest aiContext so callbacks don't go stale.
  const aiContextRef = useRef(aiContext)
  aiContextRef.current = aiContext

  const onAcceptEventRef = useRef(onAcceptEvent)
  onAcceptEventRef.current = onAcceptEvent

  // Ref to the labware addition handler.
  const addLabwareFromRecordRef = useRef(onAddLabwareFromRecord)
  addLabwareFromRecordRef.current = onAddLabwareFromRecord

  // ------------------------------------------------------------------
  // Per-event preview state
  // ------------------------------------------------------------------
  function setPreviewEventState(eventId: string, state: PreviewEventState) {
    setPreviewEventStatesMap((prev) => {
      const next = new Map(prev)
      next.set(eventId, state)
      return next
    })
  }

  // Test-only hook to set preview events directly (for e2e testing)
  function setPreviewEventsTestOnly(events: PlateEvent[]) {
    setPreviewEvents(events)
    const nextStates = new Map<string, PreviewEventState>()
    events.forEach((e) => nextStates.set(e.eventId, 'pending'))
    setPreviewEventStatesMap(nextStates)
  }

  // Check health on mount
  const checkHealth = useCallback(() => {
    getAiHealth().then((h: AiHealthStatus) => {
      setAiAvailable(h.available)
    })
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  // Fetch apply-to-graph template from the prompt-templates registry.
  useEffect(() => {
    apiClient
      .getPromptTemplate('assistant.apply-to-graph.user')
      .then((res) => {
        if ('error' in res) return
        setApplyToGraphTemplate(res.content)
      })
      .catch(() => {
        /* swallow */
      })
  }, [])

  // ------------------------------------------------------------------
  // Send a prompt
  // ------------------------------------------------------------------
  const sendPrompt = useCallback(
    async (prompt: string, attachments?: FileAttachment[]) => {
      if (isStreaming) return

      // Auto-reject existing preview before starting new stream
      if (previewEvents.length > 0 || previewLabwareAdditions.length > 0) {
        setPreviewEvents([])
        setPreviewLabwareAdditions([])
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
        content: 'Connecting to assistant…',
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
            setPreviewLabwareAdditions(result.labwareAdditions ?? [])
            // Initialize preview event states to 'pending' for all new events
            const nextStates = new Map<string, PreviewEventState>()
            ;(result.events ?? []).forEach((e: PlateEvent) => {
              nextStates.set(e.eventId, 'pending')
            })
            setPreviewEventStatesMap(nextStates)
            const pending = (result.unresolvedRefs ?? []).filter(
              (p) => p?.ref?.id && !resolvedCache.current.has(p.ref.id)
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
                      labwareAdditions: result.labwareAdditions,
                      usage: result.usage,
                      isStreaming: false,
                      docDiscussion:
                        (result.events?.length ?? 0) === 0 &&
                        typeof result.clarificationNeeded === 'string' &&
                        result.clarificationNeeded.trim().length > 0,
                    }
                  : m
              )
            )
            // Check for empty-success case: AI completed but proposed nothing
            const hasEvents = (result.events?.length ?? 0) > 0
            const hasLabware = (result.labwareAdditions?.length ?? 0) > 0
            if (result.success && !hasEvents && !hasLabware) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `sys-${Date.now()}`,
                  role: 'system',
                  content: 'AI completed the task but did not propose any changes.',
                  timestamp: Date.now(),
                  isStreaming: false,
                },
              ])
            }
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

          if (event.type === 'pipeline_diagnostics') {
            const lines = [`Pipeline did not produce events (outcome=${event.outcome}).`]
            if (event.diagnostics.length === 0) {
              lines.push('No structured diagnostics available.')
            } else {
              for (const d of event.diagnostics) {
                lines.push(`- ${d.pass_id}.${d.code}: ${d.message}`)
              }
            }
            const sysMsg: ChatMessage = {
              id: generateMessageId(),
              role: 'system',
              content: lines.join('\n'),
              timestamp: Date.now(),
            }
            setMessages((prev) => [...prev, sysMsg])
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
  const acceptPreview = useCallback(async () => {
    if (isAccepting) return
    setIsAccepting(true)
    try {
      // Track labware-addition outcomes for the summary message.
      const totalLabwareAttempts = previewLabwareAdditions.length
      let labwareFailures = 0

      // Apply AI-proposed labware additions FIRST so events can reference them.
      for (const addition of previewLabwareAdditions) {
        try {
          // Fetch the full record by ID using the apiClient.
          const record = await apiClient.getRecord(addition.recordId)
          if (record && record.payload) {
            addLabwareFromRecordRef.current?.(record.payload as Record<string, unknown>)
          } else {
            labwareFailures++
            setMessages((prev) => [
              ...prev,
              {
                id: generateMessageId(),
                role: 'system',
                content: `Error: Skipped labware addition — ${addition.recordId} not found locally.`,
                timestamp: Date.now(),
              },
            ])
          }
        } catch (err) {
          labwareFailures++
          setMessages((prev) => [
            ...prev,
            {
              id: generateMessageId(),
              role: 'system',
              content: `Error: Skipped labware addition ${addition.recordId}: ${(err as Error).message}.`,
              timestamp: Date.now(),
            },
          ])
        }
      }

      const cache = resolvedCache.current
      const handler = onAcceptEventRef.current
      if (handler) {
        for (const event of previewEvents) {
          handler(cache.size > 0 ? rewriteEventRefs(event, cache) : event)
        }
      }

      // Compute the final summary message based on outcomes.
      const eventCount = previewEvents.length
      let summary: string
      if (totalLabwareAttempts > 0 && labwareFailures === totalLabwareAttempts && eventCount === 0) {
        summary = `Accept failed — all ${totalLabwareAttempts} labware addition${totalLabwareAttempts !== 1 ? 's' : ''} could not be added.`
      } else if (labwareFailures > 0) {
        summary = `Accepted ${eventCount} event${eventCount !== 1 ? 's' : ''} (${labwareFailures} labware addition${labwareFailures !== 1 ? 's' : ''} failed — see above).`
      } else {
        summary = `Accepted ${eventCount} event${eventCount !== 1 ? 's' : ''}.`
      }

      setPreviewEvents([])
      setPreviewLabwareAdditions([])
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'system',
          content: summary,
          timestamp: Date.now(),
        },
      ])
    } finally {
      setIsAccepting(false)
    }
  }, [previewEvents, previewLabwareAdditions, isAccepting])

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
    setPreviewLabwareAdditions([])
    setPreviewEventStatesMap(new Map())
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
  // Commit accepted preview events
  // ------------------------------------------------------------------
  const commitAcceptedPreviewEvents = useCallback(async () => {
    const toApply = previewEvents.filter(
      (e) => previewEventStates.get(e.eventId) === 'accepted',
    )

    // Apply labware additions first (same as acceptPreview)
    if (previewLabwareAdditions.length > 0) {
      for (const addition of previewLabwareAdditions) {
        try {
          const record = await apiClient.getRecord(addition.recordId)
          if (record && record.payload) {
            addLabwareFromRecordRef.current?.(record.payload as Record<string, unknown>)
          }
        } catch {
          // Silently skip labware additions that fail during commit
        }
      }
    }

    // Apply accepted events
    const handler = onAcceptEventRef.current
    if (handler) {
      for (const event of toApply) {
        handler(event)
      }
    }

    // Clear all preview state
    setPreviewEvents([])
    setPreviewLabwareAdditions([])
    setPreviewEventStatesMap(new Map())

    // Add system message
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: `Committed ${toApply.length} event${toApply.length === 1 ? '' : 's'}.`,
        timestamp: Date.now(),
        isStreaming: false,
      },
    ])
  }, [previewEvents, previewEventStates, previewLabwareAdditions])

  // ------------------------------------------------------------------
  // Clear chat history
  // ------------------------------------------------------------------
  const clearHistory = useCallback(() => {
    setMessages([])
    setPreviewEvents([])
    setPreviewLabwareAdditions([])
    setUnresolvedRefs([])
  }, [])

  // ------------------------------------------------------------------
  // Apply a doc-discussion message to the graph (pre-fills chat input)
  // ------------------------------------------------------------------
  const applyToGraph = useCallback(
    (_message: ChatMessage) => {
      const text = applyToGraphTemplate ?? FALLBACK_APPLY_TO_GRAPH_TEXT
      if (applyToGraphTemplate === null && !_warnedFallbackOnce) {
        _warnedFallbackOnce = true
        console.warn('apply-to-graph template not loaded yet; using fallback text')
      }
      setInputText(text)
    },
    [applyToGraphTemplate, setInputText],
  )

  return {
    messages,
    isStreaming,
    isAccepting,
    previewEvents,
    previewLabwareAdditions,
    previewEventStates,
    hasPreview: previewEvents.length > 0,
    unresolvedRefs,
    inputText,
    sendPrompt,
    cancelStream,
    acceptPreview,
    acceptPreviewWithResolutions,
    rejectPreview,
    setPreviewEventState,
    setPreviewEvents: setPreviewEventsTestOnly,
    commitAcceptedPreviewEvents,
    clearHistory,
    applyToGraph,
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
  let modelText = ''
  const parts: string[] = []

  for (const ev of events) {
    switch (ev.type) {
      case 'text_delta':
        modelText += ev.delta
        break
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
        if (ev.result.error) {
          parts.push(`Error: ${ev.result.error}`)
        }
        if ((ev.result.notes ?? []).length) {
          parts.push((ev.result.notes ?? []).join('\n'))
        }
        if ((ev.result.clarificationNeeded ?? '').trim().length > 0 && modelText.length === 0) {
          // Plain-text answer that didn't come through as streaming chunks
          // (e.g. doc-discussion turn). Surface it as the message body.
          modelText = ev.result.clarificationNeeded ?? ''
        }
        if (!ev.result.error && (ev.result.events ?? []).length === 0 && modelText.length === 0) {
          parts.push('No events generated.')
        }
        break
      case 'error':
        parts.push(`Error: ${ev.message}`)
        break
      case 'pipeline_diagnostics':
        // Diagnostics are rendered as a separate system message, not appended here.
        break
    }
  }

  // Model text (streamed) comes first; summary lines after.
  const sections: string[] = []
  if (modelText.length > 0) sections.push(modelText)
  if (parts.length > 0) sections.push(parts.join('\n'))

  return sections.join('\n\n') || 'Thinking...'
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
