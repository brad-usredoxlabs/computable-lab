/**
 * useAiChat — Core hook for AI chat panel state management.
 *
 * Accepts an AiContext interface so it can be used from any page surface.
 * When used from the labware editor, the caller builds the AiContext from editor state.
 * When used from other pages, the caller provides page-specific context.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { streamAssist, getAiHealth } from '../api/aiClient'
import { apiClient } from '../api/client'
import { parsePromptMentions } from '../lib/aiPromptMentions'
import type { PlateEvent } from '../../types/events'
import type { RecordRef } from '../../types/ref'
import type { AiContext, FileAttachment } from '../../types/aiContext'
import { labwareDefinitionRecordToPayload, type LabwareRecordPayload } from '../../types/labware'
import { getLabwareDefinitionById } from '../../types/labwareDefinition'
import type {
  ChatMessage,
  AiStreamEvent,
  AiHealthStatus,
  OntologyRefProposal,
  AiConversationMessage,
  AiLabwareAddition,
  PromptMention,
} from '../../types/ai'

const FALLBACK_APPLY_TO_GRAPH_TEXT = 'Apply the protocol to the labware graph.'
let _warnedFallbackOnce = false

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
}

function labwareRecordFallbackPayload(recordId: string): LabwareRecordPayload {
  const label = recordId
    .replace(/^lbw-/, '')
    .replace(/^def:/, '')
    .replace(/[/:@_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const haystack = `${recordId} ${label}`.toLowerCase()
  const format = haystack.includes('384')
    ? { rows: 16, cols: 24, wellCount: 384 }
    : haystack.includes('reservoir') && haystack.includes('12')
      ? { rows: 1, cols: 12, wellCount: 12 }
      : haystack.includes('reservoir') && haystack.includes('8')
        ? { rows: 1, cols: 8, wellCount: 8 }
        : haystack.includes('tube')
          ? { rows: 1, cols: 1, wellCount: 1 }
          : { rows: 8, cols: 12, wellCount: 96 }
  const labwareType = haystack.includes('reservoir')
    ? 'reservoir'
    : haystack.includes('deep')
      ? 'deepwell'
      : haystack.includes('tube')
        ? 'tube'
        : 'plate'

  return {
    kind: 'labware',
    recordId,
    name: label || recordId,
    labwareType,
    format,
  }
}

async function resolveLabwareAdditionPayload(addition: AiLabwareAddition): Promise<LabwareRecordPayload> {
  const definitionPayload = labwareDefinitionRecordToPayload(addition.recordId)
  if (definitionPayload) return definitionPayload
  try {
    const record = await apiClient.getRecord(addition.recordId)
    if (record?.payload) return record.payload as unknown as LabwareRecordPayload
  } catch {
    // Seed/local labware ids are valid editor labware refs even when they are
    // not backed by /api/records.
  }
  return labwareRecordFallbackPayload(addition.recordId)
}

const MAX_HISTORY_MESSAGES = 20
const MAX_HISTORY_CONTENT_CHARS = 8_000
type LinearWellTemplate = { count: number; axis: 'x' | 'y' }

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
  thinkingMode: boolean
  setThinkingMode: (value: boolean) => void
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
export type AddLabwareFromRecordHandler = (record: Record<string, unknown>, addition?: AiLabwareAddition) => void

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

  // Thinking-mode toggle — persisted in localStorage, default off.
  const [thinkingMode, _setThinkingMode] = useState<boolean>(() => {
    try {
      return JSON.parse(localStorage.getItem('ai-assistant-thinking-mode') ?? 'false') === true
    } catch {
      return false
    }
  })
  const setThinkingMode = useCallback((v: boolean) => {
    _setThinkingMode(v)
    try {
      localStorage.setItem('ai-assistant-thinking-mode', JSON.stringify(v))
    } catch {
      /* ignore quota errors */
    }
  }, [])

  // Fetched apply-to-graph template from prompt-templates registry.
  const [applyToGraphTemplate, setApplyToGraphTemplate] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const isAcceptingRef = useRef(false)

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
    if (typeof apiClient.getPromptTemplate !== 'function') return
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
      const initialStatus = 'Prompt received. Starting compiler pipeline...'
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: initialStatus,
        timestamp: Date.now(),
        streamEvents: [{ type: 'status', message: initialStatus }],
        isStreaming: true,
      }

      flushSync(() => {
        setMessages((prev) => [...prev, userMsg, assistantMsg])
        setIsStreaming(true)
      })

      const controller = new AbortController()
      abortRef.current = controller

      await waitForNextPaint()

      const ctx = aiContextRef.current
      const contextPayload: Record<string, unknown> = { ...ctx.surfaceContext }
      let promptMentions: PromptMention[] = []
      // Inject mentions for event-editor surface
      if (ctx.surface === 'event-editor') {
        promptMentions = parsePromptMentions(prompt)
        contextPayload.mentions = promptMentions
      }
      if (ctx.editorMode) {
        contextPayload.editorMode = ctx.editorMode
      }

      const history = buildConversationHistory(messages)
      const accumulated: AiStreamEvent[] = [{ type: 'status', message: initialStatus }]

      const files = attachments?.map((a) => a.file)

      try {
        for await (const event of streamAssist(
          prompt,
          ctx.surface,
          contextPayload,
          history,
          controller.signal,
          files,
          thinkingMode ? true : undefined,
        )) {
          accumulated.push(event)

          const content = buildAssistantContent(accumulated)

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content, streamEvents: [...accumulated], isStreaming: true }
                : m
            )
          )

          if (event.type === 'pipeline_diagnostics') {
            const lines = event.diagnostics
              .map((d) => `- ${d.pass_id}.${d.code} (${d.severity}): ${d.message}`)
              .join('\n')
            setMessages((prev) => [
              ...prev,
              {
                id: generateMessageId(),
                role: 'system',
                content: `Pipeline did not produce events (outcome=${event.outcome}).\n${lines}`,
                timestamp: Date.now(),
              },
            ])
            continue
          }

          if (event.type === 'done') {
            const result = event.result
            const normalizedPreviewEvents = normalizePreviewEvents(
              result.events ?? [],
              promptMentions,
              result.labwareAdditions ?? [],
            )
            setPreviewEvents(normalizedPreviewEvents)
            setPreviewLabwareAdditions(result.labwareAdditions ?? [])
            // Initialize preview event states to 'pending' for all new events
            const nextStates = new Map<string, PreviewEventState>()
            normalizedPreviewEvents.forEach((e: PlateEvent) => {
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
                      events: normalizedPreviewEvents,
                      clarification: result.clarification,
                      labwareAdditions: result.labwareAdditions,
                      executionScalePlan: result.executionScalePlan,
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
    if (isAcceptingRef.current) return
    isAcceptingRef.current = true
    setIsAccepting(true)
    const eventsToAccept = previewEvents
    const labwareAdditionsToApply = previewLabwareAdditions
    flushSync(() => {
      setPreviewEvents([])
      setPreviewLabwareAdditions([])
      setPreviewEventStatesMap(new Map())
      setUnresolvedRefs([])
    })
    try {
      // Track labware-addition outcomes for the summary message.
      const totalLabwareAttempts = labwareAdditionsToApply.length
      let labwareFailures = 0

      // Apply AI-proposed labware additions FIRST so events can reference them.
      for (const addition of labwareAdditionsToApply) {
        try {
          const payload = await resolveLabwareAdditionPayload(addition)
          addLabwareFromRecordRef.current?.(payload as unknown as Record<string, unknown>, addition)
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
        for (const event of eventsToAccept) {
          handler(cache.size > 0 ? rewriteEventRefs(event, cache) : event)
        }
      }

      // Compute the final summary message based on outcomes.
      const eventCount = eventsToAccept.length
      let summary: string
      if (totalLabwareAttempts > 0 && labwareFailures === totalLabwareAttempts && eventCount === 0) {
        summary = `Accept failed — all ${totalLabwareAttempts} labware addition${totalLabwareAttempts !== 1 ? 's' : ''} could not be added.`
      } else if (labwareFailures > 0) {
        summary = `Accepted ${eventCount} event${eventCount !== 1 ? 's' : ''} (${labwareFailures} labware addition${labwareFailures !== 1 ? 's' : ''} failed — see above).`
      } else {
        summary = `Accepted ${eventCount} event${eventCount !== 1 ? 's' : ''}.`
      }

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
      isAcceptingRef.current = false
      setIsAccepting(false)
    }
  }, [previewEvents, previewLabwareAdditions])

  // ------------------------------------------------------------------
  // Accept preview events with resolved material refs
  // ------------------------------------------------------------------
  const acceptPreviewWithResolutions = useCallback(
    (resolutions: Map<string, RecordRef>) => {
      if (isAcceptingRef.current) return
      isAcceptingRef.current = true
      setIsAccepting(true)
      try {
        const eventsToAccept = previewEvents
        flushSync(() => {
          setPreviewEvents([])
          setPreviewLabwareAdditions([])
          setPreviewEventStatesMap(new Map())
          setUnresolvedRefs([])
        })
        for (const [key, value] of resolutions) {
          resolvedCache.current.set(key, value)
        }
        const combined = resolvedCache.current
        const handler = onAcceptEventRef.current
        if (handler) {
          for (const event of eventsToAccept) {
            handler(rewriteEventRefs(event, combined))
          }
        }
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            role: 'system',
            content: `Accepted ${eventsToAccept.length} event${eventsToAccept.length !== 1 ? 's' : ''} (resolved ${resolutions.size} material${resolutions.size !== 1 ? 's' : ''}).`,
            timestamp: Date.now(),
          },
        ])
      } finally {
        isAcceptingRef.current = false
        setIsAccepting(false)
      }
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
    if (isAcceptingRef.current) return
    isAcceptingRef.current = true
    setIsAccepting(true)
    const toApply = previewEvents.filter(
      (e) => previewEventStates.get(e.eventId) === 'accepted',
    )
    const labwareAdditionsToApply = previewLabwareAdditions
    flushSync(() => {
      setPreviewEvents([])
      setPreviewLabwareAdditions([])
      setPreviewEventStatesMap(new Map())
      setUnresolvedRefs([])
    })

    try {
      // Apply labware additions first (same as acceptPreview)
      if (labwareAdditionsToApply.length > 0) {
        for (const addition of labwareAdditionsToApply) {
          try {
            const payload = await resolveLabwareAdditionPayload(addition)
            addLabwareFromRecordRef.current?.(payload as unknown as Record<string, unknown>, addition)
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
    } finally {
      isAcceptingRef.current = false
      setIsAccepting(false)
    }
  }, [previewEvents, previewEventStates, previewLabwareAdditions])

  // ------------------------------------------------------------------
  // Clear chat history
  // ------------------------------------------------------------------
  const clearHistory = useCallback(() => {
    setMessages([])
    setPreviewEvents([])
    setPreviewLabwareAdditions([])
    setPreviewEventStatesMap(new Map())
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
    thinkingMode,
    setThinkingMode,
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

function normalizePreviewEvents(
  events: PlateEvent[],
  mentions: PromptMention[] = [],
  labwareAdditions: AiLabwareAddition[] = [],
): PlateEvent[] {
  const materialMentionsById = new Map(
    mentions
      .filter((mention): mention is PromptMention & { type: 'material'; id: string; label?: string; entityKind?: string } => (
        mention.type === 'material' && typeof mention.id === 'string'
      ))
      .map((mention) => [mention.id, mention])
  )
  const linearLabwareTemplates = buildLinearLabwareTemplateMap(labwareAdditions, events)

  return events.map((event) => {
    const details = { ...(event.details as Record<string, unknown>) }
    const topLevelLabwareId = stringField((event as { labwareId?: unknown }).labwareId)
    if (topLevelLabwareId && typeof details.labwareId !== 'string') {
      details.labwareId = topLevelLabwareId
    }

    if (event.event_type === 'transfer' || event.event_type === 'multi_dispense') {
      const sourceLabware = stringField(details.source_labware) ?? stringField(details.source_labwareId)
      const destLabware = stringField(details.destination_labware)
        ?? stringField(details.dest_labware)
        ?? stringField(details.dest_labwareId)
      const sourceWells = normalizeWellsForLabware(
        arrayField(details.source_wells) ?? singleWellArray(details.source_well),
        sourceLabware,
        linearLabwareTemplates,
      )
      const destWells = normalizeWellsForLabware(
        arrayField(details.dest_wells)
          ?? arrayField(details.wells)
          ?? singleWellArray(details.destination_well)
          ?? singleWellArray(details.dest_well),
        destLabware,
        linearLabwareTemplates,
      )

      if (sourceLabware) details.source_labwareId = sourceLabware
      if (destLabware) details.dest_labwareId = destLabware
      if (sourceWells) details.source_wells = sourceWells
      if (destWells) details.dest_wells = destWells
      if (sourceLabware || sourceWells) {
        details.source = {
          ...(details.source && typeof details.source === 'object' ? details.source : {}),
          ...(sourceLabware ? { labwareInstanceId: sourceLabware } : {}),
          ...(sourceWells ? { wells: sourceWells } : {}),
        }
      }
      if (destLabware || destWells) {
        details.target = {
          ...(details.target && typeof details.target === 'object' ? details.target : {}),
          ...(destLabware ? { labwareInstanceId: destLabware } : {}),
          ...(destWells ? { wells: destWells } : {}),
        }
      }
    }

    if (event.event_type === 'add_material') {
      const labwareId = stringField(details.labwareId)
      const well = normalizeWellsForLabware(
        singleWellArray(details.well) ?? arrayField(details.wells),
        labwareId,
        linearLabwareTemplates,
      )
      if (well && !Array.isArray(details.wells)) {
        details.wells = well
      } else if (well) {
        details.wells = well
      }
      const volumeUl = typeof details.volume_uL === 'number' ? details.volume_uL : undefined
      if (volumeUl != null && !details.volume) {
        details.volume = { value: volumeUl, unit: 'uL' }
      }
      const recordId = stringField(details.recordId)
        ?? stringField((details.material as { recordId?: unknown } | undefined)?.recordId)
      if (recordId && !details.material_ref && !details.material_spec_ref && !details.aliquot_ref && !details.material_instance_ref) {
        const kind = stringField(details.kind)
          ?? stringField((details.material as { kind?: unknown } | undefined)?.kind)
          ?? materialMentionsById.get(recordId)?.entityKind
          ?? 'material'
        const label = stringField(details.label)
          ?? stringField(details.name)
          ?? stringField((details.material as { label?: unknown; name?: unknown } | undefined)?.label)
          ?? stringField((details.material as { label?: unknown; name?: unknown } | undefined)?.name)
          ?? materialMentionsById.get(recordId)?.label
          ?? recordId
        const ref = {
          kind: 'record',
          id: recordId,
          type: kind === 'aliquot'
            ? 'aliquot'
            : kind === 'material-spec'
              ? 'material-spec'
              : kind === 'material-instance'
                ? 'material-instance'
                : 'material',
          label,
        }
        if (ref.type === 'aliquot') details.aliquot_ref = ref
        else if (ref.type === 'material-spec') details.material_spec_ref = ref
        else if (ref.type === 'material-instance') details.material_instance_ref = ref
        else details.material_ref = ref
      }
    }

    return {
      ...event,
      details,
    }
  })
}

function buildLinearLabwareTemplateMap(additions: AiLabwareAddition[], events: PlateEvent[]): Map<string, LinearWellTemplate> {
  const templates = new Map<string, LinearWellTemplate>()
  for (const addition of additions) {
    const template = getLinearWellTemplate(addition.recordId)
    if (template) templates.set(addition.recordId, template)
  }
  for (const event of events) {
    const details = event.details as Record<string, unknown>
    const candidates = [
      stringField(details.labwareId),
      stringField((event as { labwareId?: unknown }).labwareId),
      stringField(details.source_labware),
      stringField(details.source_labwareId),
      stringField(details.destination_labware),
      stringField(details.dest_labware),
      stringField(details.dest_labwareId),
      stringField((details.source as { labwareInstanceId?: unknown } | undefined)?.labwareInstanceId),
      stringField((details.target as { labwareInstanceId?: unknown } | undefined)?.labwareInstanceId),
    ]
    for (const id of candidates) {
      if (id && !templates.has(id)) {
        const template = getLinearWellTemplate(id)
        if (template) templates.set(id, template)
      }
    }
  }
  return templates
}

function getLinearWellTemplate(recordId: string): LinearWellTemplate | null {
  const definition = getLabwareDefinitionById(recordId.startsWith('def:') ? recordId.slice(4) : recordId)
  if (definition?.topology.addressing === 'linear') {
    return {
      count: Math.max(1, definition.topology.linear_count || 1),
      axis: definition.topology.linear_axis || 'x',
    }
  }
  const payload = labwareDefinitionRecordToPayload(recordId)
  const labwareType = (payload?.labwareType ?? '').toLowerCase()
  if (labwareType === 'reservoir_12') return { count: 12, axis: 'x' }
  if (labwareType === 'reservoir_8') return { count: 8, axis: 'y' }
  const haystack = `${recordId} ${payload?.name ?? ''}`.toLowerCase()
  if (!haystack.includes('reservoir')) return null
  if (haystack.includes('12')) return { count: 12, axis: 'x' }
  if (haystack.includes('8')) return { count: 8, axis: 'y' }
  return null
}

function normalizeWellsForLabware(
  wells: string[] | undefined,
  labwareId: string | undefined,
  linearLabwareTemplates: Map<string, LinearWellTemplate>,
): string[] | undefined {
  const template = labwareId ? linearLabwareTemplates.get(labwareId) : undefined
  if (!wells || !template) return wells
  return wells.map((well) => normalizeLinearWellAlias(well, template))
}

function normalizeLinearWellAlias(well: string, template: LinearWellTemplate): string {
  const numeric = /^([1-9]\d*)$/.exec(well)
  if (numeric) {
    const index = Number(numeric[1])
    return index >= 1 && index <= template.count ? String(index) : well
  }
  const grid = /^([A-Z])([1-9]\d*)$/i.exec(well)
  if (!grid) return well
  const row = grid[1].toUpperCase().charCodeAt(0) - 64
  const column = Number(grid[2])
  const index = template.axis === 'x'
    ? row === 1 ? column : null
    : column === 1 ? row : null
  return index != null && index >= 1 && index <= template.count ? String(index) : well
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function arrayField(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  return out.length > 0 ? out : undefined
}

function singleWellArray(value: unknown): string[] | undefined {
  const well = stringField(value)
  return well ? [well] : undefined
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        setTimeout(resolve, 0)
      })
      return
    }
    setTimeout(resolve, 0)
  })
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
