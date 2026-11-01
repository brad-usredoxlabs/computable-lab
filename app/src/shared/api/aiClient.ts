/**
 * AI API client — streaming SSE parser and sync fallback.
 *
 * Uses fetch + ReadableStream (not EventSource) because the endpoint
 * requires POST with a JSON body.
 */

import type {
  AiStreamEvent,
  AiAgentResult,
  AiHealthStatus,
  AiRequestContext,
  AiConversationMessage,
  AiClarificationAnswer,
} from '../../types/ai'
import type { AiSurface } from '../../types/aiContext'
import { API_BASE } from './base'

// =============================================================================
// SSE Streaming
// =============================================================================

/**
 * Stream draft events from the AI endpoint via SSE.
 *
 * Yields parsed AiStreamEvent objects as they arrive.
 * Caller should pass an AbortSignal for cancellation.
 */
export async function* streamDraftEvents(
  prompt: string,
  context: AiRequestContext,
  history: AiConversationMessage[] = [],
  signal?: AbortSignal,
  options?: { deterministicOnly?: boolean; enableThinking?: boolean; clarificationAnswers?: AiClarificationAnswer[] },
): AsyncGenerator<AiStreamEvent> {
  const response = await fetch(`${API_BASE}/ai/draft-events/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      context,
      history,
      ...(options?.deterministicOnly !== undefined ? { deterministicOnly: options.deterministicOnly } : {}),
      ...(options?.enableThinking !== undefined ? { enableThinking: options.enableThinking } : {}),
      ...(options?.clarificationAnswers?.length ? { clarificationAnswers: options.clarificationAnswers } : {}),
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    yield {
      type: 'error',
      message: `Server returned ${response.status}: ${body || response.statusText}`,
    }
    return
  }

  if (!response.body) {
    yield { type: 'error', message: 'No response body (streaming not supported)' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE protocol: events separated by double newlines
      const parts = buffer.split('\n\n')
      // Keep the last (possibly incomplete) chunk in the buffer
      buffer = parts.pop() || ''

      for (const part of parts) {
        const event = parseSSEBlock(part)
        if (event) yield event
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      const event = parseSSEBlock(buffer)
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Parse a single SSE block (may contain event: and data: lines).
 */
function parseSSEBlock(block: string): AiStreamEvent | null {
  const lines = block.split('\n')
  let data = ''

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      data += line.slice(6)
    } else if (line.startsWith('data:')) {
      data += line.slice(5)
    }
    // We ignore event: lines — the type is inside the JSON data
  }

  if (!data) return null

  try {
    return JSON.parse(data) as AiStreamEvent
  } catch {
    // Non-JSON data line — treat as status message
    return { type: 'status', message: data }
  }
}

// =============================================================================
// Synchronous Fallback
// =============================================================================

/**
 * Non-streaming draft events endpoint.
 */
export async function draftEvents(
  prompt: string,
  context: AiRequestContext,
  history: AiConversationMessage[] = [],
  clarificationAnswers: AiClarificationAnswer[] = [],
): Promise<AiAgentResult> {
  const response = await fetch(`${API_BASE}/ai/draft-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      context,
      history,
      ...(clarificationAnswers.length ? { clarificationAnswers } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return {
      success: false,
      events: [],
      notes: [],
      error: `Server returned ${response.status}: ${body || response.statusText}`,
    }
  }

  return (await response.json()) as AiAgentResult
}

// =============================================================================
// Generalized AI Assist Streaming
// =============================================================================

/**
 * Stream AI assistance via the surface-agnostic /ai/assist/stream endpoint.
 *
 * Falls back to /ai/draft-events/stream for the event-editor surface to
 * maintain backward compatibility.
 *
 * When files are provided, sends as multipart/form-data instead of JSON.
 */
export async function* streamAssist(
  prompt: string,
  surface: AiSurface,
  context: Record<string, unknown>,
  history: AiConversationMessage[] = [],
  signal?: AbortSignal,
  files?: File[],
  enableThinking?: boolean,
  clarificationAnswers?: AiClarificationAnswer[],
): AsyncGenerator<AiStreamEvent> {
  // ANSWER-CHANNEL: the structured clarification answers ride the request as
  // DATA alongside the sentence the scientist sees. The server's answer fold
  // (AgentOrchestrator's shorthand arm) needs the answer's `ref` to bind the
  // chosen record; the rendered "Use [[material:ID|Label]] for material."
  // sentence alone is re-compiled by the model, which re-derives the
  // ambiguity and re-asks forever. Absent => the wire shape is byte-identical
  // to before this parameter existed.
  const foundryReview = context.foundryReview as { protocolId?: unknown; variant?: unknown } | undefined
  const foundryProtocolId = typeof foundryReview?.protocolId === 'string' ? foundryReview.protocolId : null
  const foundryVariant = typeof foundryReview?.variant === 'string' ? foundryReview.variant : null
  if (surface === 'protocol-ide' && foundryProtocolId && foundryVariant && (!files || files.length === 0)) {
    const response = await fetch(
      `${API_BASE}/protocol-ide/foundry/${encodeURIComponent(foundryProtocolId)}/${encodeURIComponent(foundryVariant)}/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history }),
        signal,
      },
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      yield {
        type: 'error',
        message: `Server returned ${response.status}: ${text || response.statusText}`,
      }
      return
    }

    if (!response.body) {
      yield { type: 'error', message: 'No response body (streaming not supported)' }
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const event = parseSSEBlock(part)
          if (event) yield event
        }
      }
      if (buffer.trim()) {
        const event = parseSSEBlock(buffer)
        if (event) yield event
      }
    } finally {
      reader.releaseLock()
    }
    return
  }

  // For event-editor surface, use the existing endpoint for backward compatibility
  const endpoint = surface === 'event-editor'
    ? `${API_BASE}/ai/draft-events/stream`
    : `${API_BASE}/ai/assist/stream`

  let response: Response

  if (files && files.length > 0) {
    // Multipart form-data for file uploads — works for every surface
    // including event-editor. Previously event-editor silently dropped
    // files here; the server-side handler has matching multipart parsing.
    const formData = new FormData()
    formData.append('prompt', prompt)
    formData.append('surface', surface)
    formData.append('context', JSON.stringify(context))
    formData.append('history', JSON.stringify(history))
    if (enableThinking !== undefined) {
      formData.append('enableThinking', String(enableThinking))
    }
    // ANSWER-CHANNEL: multipart carries the answers as a JSON field (the
    // server's multipart branch parses exactly this field name).
    if (clarificationAnswers && clarificationAnswers.length > 0) {
      formData.append('clarificationAnswers', JSON.stringify(clarificationAnswers))
    }
    for (const file of files) {
      formData.append('files[]', file)
    }
    response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal,
    })
  } else {
    // ANSWER-CHANNEL: conditional spread so a turn WITHOUT answers sends the
    // byte-identical body it always sent.
    const answerField = clarificationAnswers && clarificationAnswers.length > 0
      ? { clarificationAnswers }
      : {}
    // L2-INTENTID-REDRAFT-1 (leg B): the event-editor JSON body now carries
    // its `surface` — the multipart branch above already appended it, and the
    // legacy /ai/draft-events/stream handler reads + passes it so the
    // orchestrator's shorthand answer arm (fold / identity carry) engages on
    // the LIVE event-editor path. With surface in BOTH arms the conditional
    // collapsed: one body, same key order as the multipart (prompt, surface,
    // context, history). For the non-event-editor surfaces the body is
    // byte-identical to before.
    const body = { prompt, surface, context, history, ...(enableThinking !== undefined ? { enableThinking } : {}), ...answerField }

    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    yield {
      type: 'error',
      message: `Server returned ${response.status}: ${text || response.statusText}`,
    }
    return
  }

  if (!response.body) {
    yield { type: 'error', message: 'No response body (streaming not supported)' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        const event = parseSSEBlock(part)
        if (event) yield event
      }
    }

    if (buffer.trim()) {
      const event = parseSSEBlock(buffer)
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

// =============================================================================
// Run-Centered Draft Streaming
// =============================================================================

/**
 * Stream a run-scoped draft request via SSE.
 * Works for event-graph/draft, meaning/draft, and evidence/draft endpoints.
 */
export async function* streamRunDraft(
  runId: string,
  domain: 'event-graph' | 'meaning' | 'evidence',
  body: Record<string, unknown>,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamEvent> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/${domain}/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    yield {
      type: 'error',
      message: `Server returned ${response.status}: ${text || response.statusText}`,
    }
    return
  }

  if (!response.body) {
    yield { type: 'error', message: 'No response body (streaming not supported)' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        const event = parseSSEBlock(part)
        if (event) yield event
      }
    }

    if (buffer.trim()) {
      const event = parseSSEBlock(buffer)
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

// =============================================================================
// Result-to-Evidence Pipeline Streaming
// =============================================================================

/**
 * Stream from a result-to-evidence pipeline endpoint via SSE.
 *
 * Supports the interpret, assemble, draft-assertions, and check-contradictions endpoints.
 */
export async function* streamPipelineSSE(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamEvent> {
  const response = await fetch(url, { ...init, signal })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    yield {
      type: 'error',
      message: `Server returned ${response.status}: ${text || response.statusText}`,
    }
    return
  }

  if (!response.body) {
    yield { type: 'error', message: 'No response body (streaming not supported)' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        const event = parseSSEBlock(part)
        if (event) yield event
      }
    }

    if (buffer.trim()) {
      const event = parseSSEBlock(buffer)
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

// =============================================================================
// Knowledge Extraction Streaming
// =============================================================================

export interface KnowledgeExtractionRequest {
  source: string
  sourceId: string
  sourceData: Record<string, unknown>
  userHint?: string
}

/**
 * Stream knowledge extraction from the AI endpoint via SSE.
 */
export async function* streamKnowledgeExtraction(
  req: KnowledgeExtractionRequest,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamEvent> {
  const response = await fetch(`${API_BASE}/ai/extract-knowledge/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    yield {
      type: 'error',
      message: `Server returned ${response.status}: ${body || response.statusText}`,
    }
    return
  }

  if (!response.body) {
    yield { type: 'error', message: 'No response body (streaming not supported)' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        const event = parseSSEBlock(part)
        if (event) yield event
      }
    }

    if (buffer.trim()) {
      const event = parseSSEBlock(buffer)
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

// =============================================================================
// Health
// =============================================================================

/**
 * Check AI availability from the /api/health endpoint.
 */
export async function getAiHealth(): Promise<AiHealthStatus> {
  try {
    const response = await fetch(`${API_BASE}/health`)
    if (!response.ok) {
      return { available: false }
    }

    const data = (await response.json()) as Record<string, unknown>
    const components = data.components as Record<string, unknown> | undefined
    const ai = components?.ai as Record<string, unknown> | undefined

    if (!ai) {
      return { available: false }
    }

    return {
      available: ai.status === 'ok' || ai.available === true,
      inferenceUrl: ai.inferenceUrl as string | undefined,
      model: ai.model as string | undefined,
      provider: ai.provider as string | undefined,
      error: ai.error as string | undefined,
    }
  } catch {
    return { available: false }
  }
}
