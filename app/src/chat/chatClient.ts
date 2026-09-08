/**
 * chatClient — SSE streaming client for the standalone Chat page.
 *
 * POSTs to /api/ai/chat/stream (proxied by the Fastify backend to a local
 * Ollama native /api/chat). Each upstream Ollama NDJSON chunk is forwarded as
 * an SSE `data:` event by the server; we parse those into delta events and
 * surface the final timing event (PP tokens/s + decode tokens/s).
 */

import { API_BASE } from '../shared/api/base'

export interface ChatMessageInput {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type ChatStreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'timing'; ppTokensPerSec: number | null; decodeTokensPerSec: number | null }
  | { type: 'done' }
  | { type: 'error'; message: string }

interface OllamaChunk {
  message?: { content?: string }
  done?: boolean
}

/**
 * Stream a chat reply. Omit profileName to use the server's configured
 * ai.activeProfile (this is what the UI does — switching profiles via
 * ModelSwitcher activates it server-side, so the next message follows it).
 */
export async function* streamChat(
  messages: ChatMessageInput[],
  profileName?: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch(`${API_BASE}/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      ...(profileName ? { profileName } : {}),
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    yield { type: 'error', message: `${response.status}: ${body || response.statusText}` }
    return
  }

  if (!response.body) {
    yield { type: 'error', message: 'Streaming is not supported by this browser.' }
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

function parseSSEBlock(block: string): ChatStreamEvent | null {
  const lines = block.split('\n')
  let data = ''
  for (const line of lines) {
    if (line.startsWith('data: ')) data += line.slice(6)
    else if (line.startsWith('data:')) data += line.slice(5)
  }
  if (!data) return null

  let obj: unknown
  try {
    obj = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  const record = obj as Record<string, unknown>

  // Server-emitted timing event.
  if (record.type === 'timing') {
    return {
      type: 'timing',
      ppTokensPerSec: typeof record.ppTokensPerSec === 'number' ? record.ppTokensPerSec : null,
      decodeTokensPerSec: typeof record.decodeTokensPerSec === 'number' ? record.decodeTokensPerSec : null,
    }
  }
  if (record.type === 'error') {
    return { type: 'error', message: typeof record.message === 'string' ? record.message : 'Unknown error' }
  }

  // Raw Ollama native chunk forwarded verbatim by the proxy.
  const chunk = record as OllamaChunk
  if (typeof chunk.message?.content === 'string' && chunk.message.content.length > 0) {
    return { type: 'chunk', content: chunk.message.content }
  }
  if (chunk.done === true) {
    return { type: 'done' }
  }
  return null
}
