import { API_BASE } from '../../shared/api/base'
import type { FixItChatMessage, FixItSeed } from '../EventEditorContext'

export type FixItStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface SynthesizeSpecResponse {
  specYaml: string
  fixtureYaml: string
  specId: string
  fixturePath: string
}

export interface SynthesizeSpecError {
  error: string
  message: string
}

/**
 * Non-streaming call to the spec-synthesis endpoint. Returns either the
 * generated spec + fixture YAML pair, or an error envelope from the server.
 */
export async function synthesizeFixSpec(args: {
  seed: FixItSeed
  history: FixItChatMessage[]
  signal?: AbortSignal
}): Promise<SynthesizeSpecResponse | SynthesizeSpecError> {
  const response = await fetch(`${API_BASE}/event-editor/fix/synthesize-spec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed: args.seed, history: args.history }),
    ...(args.signal ? { signal: args.signal } : {}),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return parsed as SynthesizeSpecError
    }
    return {
      error: 'SYNTHESIZE_FAILED',
      message: `Server returned ${response.status}: ${text || response.statusText}`,
    }
  }
  return (await response.json()) as SynthesizeSpecResponse
}

export interface FixItHealthEndpoint {
  reachable: boolean
  baseUrl: string
  model: string
  models?: string[]
  error?: string
}

export interface FixItHealthResponse {
  worker: FixItHealthEndpoint
  architect: FixItHealthEndpoint
}

/**
 * Probe whether the worker (`:8001`) and architect (`:8000`) inference
 * endpoints are reachable. Surfaced as a banner inside the Fix-it panel.
 */
export async function probeFixItHealth(args: {
  signal?: AbortSignal
} = {}): Promise<FixItHealthResponse | null> {
  try {
    const response = await fetch(`${API_BASE}/event-editor/fix/health`, {
      method: 'GET',
      ...(args.signal ? { signal: args.signal } : {}),
    })
    if (!response.ok) return null
    return (await response.json()) as FixItHealthResponse
  } catch {
    return null
  }
}

export type ApplyFixStageName =
  | 'writing_fixture'
  | 'writing_spec'
  | 'coder_running'
  | 'critic_running'
  | 'senior_retry'

export interface ApplyFixCriticSummary {
  verdict: 'pass' | 'block' | 'revision'
  message: string
  criteriaMet: string[]
  criteriaFailed: string[]
  revisionFeedback?: string
  seniorRetryRan: boolean
}

export type ApplyFixStreamEvent =
  | { type: 'stage'; stage: ApplyFixStageName }
  | {
      type: 'progress'
      source: 'server' | 'coder' | 'critic'
      phase: string
      message: string
      details?: Record<string, unknown>
    }
  | {
      type: 'done'
      result: {
        status: string
        message: string
        touchedFiles: string[]
        commit?: string
        critic?: ApplyFixCriticSummary
      }
    }
  | { type: 'error'; message: string }

/**
 * Stream the apply-fix endpoint. Yields stage events while the coder is
 * working and a final done/error event when it completes.
 */
export async function* streamApplyFix(args: {
  specYaml: string
  fixtureYaml: string
  specId: string
  fixturePath: string
  signal?: AbortSignal
}): AsyncGenerator<ApplyFixStreamEvent> {
  const response = await fetch(`${API_BASE}/event-editor/fix/apply/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      specYaml: args.specYaml,
      fixtureYaml: args.fixtureYaml,
      specId: args.specId,
      fixturePath: args.fixturePath,
    }),
    ...(args.signal ? { signal: args.signal } : {}),
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
        const ev = parseApplyBlock(part)
        if (ev) yield ev
      }
    }
    if (buffer.trim()) {
      const ev = parseApplyBlock(buffer)
      if (ev) yield ev
    }
  } finally {
    reader.releaseLock()
  }
}

function parseApplyBlock(block: string): ApplyFixStreamEvent | null {
  const lines = block.split('\n')
  let data = ''
  for (const line of lines) {
    if (line.startsWith('data: ')) data += line.slice(6)
    else if (line.startsWith('data:')) data += line.slice(5)
  }
  if (!data) return null
  try {
    return JSON.parse(data) as ApplyFixStreamEvent
  } catch {
    return null
  }
}

/**
 * Stream a user message through the fix-it chat endpoint. Yields parsed
 * SSE events (text_delta / done / error). The caller wires the stream
 * deltas into the EventEditorContext via `updateLastFixItAssistant`.
 */
export async function* streamFixChat(args: {
  seed: FixItSeed
  history: FixItChatMessage[]
  userMessage: string
  signal?: AbortSignal
}): AsyncGenerator<FixItStreamEvent> {
  const response = await fetch(`${API_BASE}/event-editor/fix/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seed: args.seed,
      history: args.history,
      userMessage: args.userMessage,
    }),
    ...(args.signal ? { signal: args.signal } : {}),
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
        const ev = parseBlock(part)
        if (ev) yield ev
      }
    }
    if (buffer.trim()) {
      const ev = parseBlock(buffer)
      if (ev) yield ev
    }
  } finally {
    reader.releaseLock()
  }
}

function parseBlock(block: string): FixItStreamEvent | null {
  const lines = block.split('\n')
  let data = ''
  for (const line of lines) {
    if (line.startsWith('data: ')) data += line.slice(6)
    else if (line.startsWith('data:')) data += line.slice(5)
  }
  if (!data) return null
  try {
    return JSON.parse(data) as FixItStreamEvent
  } catch {
    return null
  }
}
