/**
 * assistStream — minimal SSE client for the workspace AI panel.
 *
 * The backend's `/api/ai/assist/stream` endpoint accepts JSON and emits
 * Server-Sent Events, one JSON object per `data:` line. The supported
 * event types come from `server/src/ai/types.ts#AgentEvent`:
 *   - `status`: pipeline progress strings
 *   - `text_delta`: streamed assistant text chunks
 *   - `done`: final result payload
 *   - `error`: failure
 *   - `thinking`, `tool_call`, `tool_result`, `draft`,
 *     `pipeline_diagnostics`: observability events; ignored here
 *
 * The standard browser EventSource doesn't support POST, so this client
 * uses fetch + a streaming reader. Caller passes an AbortSignal for the
 * Stop button.
 */

import { API_BASE } from '../../../shared/api/base'

export interface AssistStreamRequest {
  prompt: string
  /** Surface id sent to the orchestrator. Workspace uses `workspace.<viewer>`
   *  so server-side telemetry / system-prompt selection can fork later. */
  surface: string
  /** Anything the agent should know about the active viewer / study. */
  context: Record<string, unknown>
  /** Prior conversation history — server expects `{role, content}`. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * The slice of the backend's AgentResult the chat panel can render. In
 * forced-draft-tool mode the model emits no prose at all — the entire answer
 * lives in this payload, so dropping it renders as "(no response)".
 */
export interface AssistDraftResult {
  success?: boolean
  events?: unknown[]
  notes?: string[]
  labwareRequirements?: Array<{ classCurie?: string; deckSlot?: string; reason?: string }>
  labwareAdditions?: Array<{ recordId?: string; deckSlot?: string; reason?: string }>
  clarificationNeeded?: string
  clarification?: { prompt?: string }
  error?: string
}

export type AssistStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'done'; result?: AssistDraftResult }
  | { type: 'error'; message: string }

/** Render a draft-tool result as chat text for panels with no preview canvas. */
export function summarizeDraftResult(result: AssistDraftResult | undefined): string | undefined {
  if (!result) return undefined
  if (result.error) return `Draft failed: ${result.error}`
  const clarification = result.clarification?.prompt ?? result.clarificationNeeded
  if (clarification) return clarification
  const lines: string[] = []
  const events = Array.isArray(result.events) ? result.events.length : 0
  if (events > 0) lines.push(`Drafted ${events} event${events === 1 ? '' : 's'}.`)
  for (const req of result.labwareRequirements ?? []) {
    const what = req.classCurie ?? 'labware'
    lines.push(`Proposed labware: ${what}${req.deckSlot ? ` in slot ${req.deckSlot}` : ''}.`)
  }
  for (const add of result.labwareAdditions ?? []) {
    lines.push(`Proposed labware addition: ${add.recordId ?? 'unknown record'}${add.deckSlot ? ` in slot ${add.deckSlot}` : ''}.`)
  }
  for (const note of result.notes ?? []) lines.push(note)
  return lines.length > 0 ? lines.join('\n') : undefined
}

export interface AssistStreamHandlers {
  onEvent: (event: AssistStreamEvent) => void
  signal?: AbortSignal
}

/**
 * Run one assist stream to completion. Resolves when the stream closes,
 * rejects on transport errors (NOT on `error` events — those surface
 * through `onEvent`). The caller is responsible for tracking AbortSignal
 * triggers and translating them into UI state.
 */
export async function runAssistStream(
  request: AssistStreamRequest,
  handlers: AssistStreamHandlers,
): Promise<void> {
  const response = await fetch(`${API_BASE}/ai/assist/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    ...(handlers.signal ? { signal: handlers.signal } : {}),
  })

  if (!response.ok) {
    handlers.onEvent({
      type: 'error',
      message: `HTTP ${response.status} ${response.statusText}`,
    })
    return
  }
  if (!response.body) {
    handlers.onEvent({
      type: 'error',
      message: 'No response body',
    })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  // SSE frames are separated by `\n\n`. We buffer partial frames between
  // chunks so a frame split across reads still parses.
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      let sep = buffer.indexOf('\n\n')
      while (sep !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        dispatchFrame(frame, handlers.onEvent)
        sep = buffer.indexOf('\n\n')
      }
    }
    // Flush a trailing frame if the server didn't terminate with \n\n.
    if (buffer.trim().length > 0) {
      dispatchFrame(buffer, handlers.onEvent)
    }
  } catch (err) {
    // AbortError is expected when the user clicks Stop; surface as
    // cancellation rather than an error.
    if ((err as Error).name === 'AbortError') return
    handlers.onEvent({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    reader.releaseLock()
  }
}

function dispatchFrame(
  frame: string,
  onEvent: (event: AssistStreamEvent) => void,
): void {
  // Each frame is one or more lines; SSE spec allows multiple `data:`
  // continuation lines for one event. The backend writes single-line
  // JSON per frame, so we just strip the prefix.
  const lines = frame.split('\n')
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) return
  const payload = dataLines.join('\n')
  let parsed: { type?: string; message?: string; delta?: string; result?: AssistDraftResult }
  try {
    parsed = JSON.parse(payload)
  } catch {
    // Server sent a malformed frame — surface as an inline error rather
    // than crashing the panel.
    onEvent({ type: 'error', message: `Malformed SSE frame: ${payload.slice(0, 80)}` })
    return
  }
  switch (parsed.type) {
    case 'status':
      onEvent({ type: 'status', message: parsed.message ?? '' })
      return
    case 'text_delta':
      onEvent({ type: 'text_delta', delta: parsed.delta ?? '' })
      return
    case 'done':
      onEvent({ type: 'done', ...(parsed.result ? { result: parsed.result } : {}) })
      return
    case 'error':
      onEvent({ type: 'error', message: parsed.message ?? 'Unknown error' })
      return
    default:
      // thinking / tool_call / tool_result / draft / pipeline_diagnostics
      // are valid backend events but not relevant for the workspace chat;
      // silently ignore.
      return
  }
}
