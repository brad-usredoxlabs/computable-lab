/**
 * SSE client tests — mock fetch with a streaming Response so the client
 * can be exercised without a real backend.
 *
 *  - parses one frame per `data:` line, separated by `\n\n`
 *  - frames split across chunks reassemble correctly
 *  - status / text_delta / done / error events route to onEvent
 *  - unknown event types are silently ignored
 *  - HTTP error from fetch surfaces as an error event
 *  - malformed JSON in a frame surfaces as an error event
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAssistStream, summarizeDraftResult, type AssistStreamEvent } from './assistStream'

// Mock the API_BASE module so we don't depend on env vars.
vi.mock('../../../shared/api/base', () => ({
  API_BASE: 'http://test/api',
}))

function makeStreamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[i]))
      i += 1
    },
  })
  return new Response(stream, {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'text/event-stream' },
  })
}

function frame(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runAssistStream', () => {
  it('emits status / text_delta / done events from streamed frames', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        makeStreamResponse([
          frame({ type: 'status', message: 'starting' }),
          frame({ type: 'text_delta', delta: 'hel' }),
          frame({ type: 'text_delta', delta: 'lo' }),
          frame({ type: 'done' }),
        ]),
      )

    const events: AssistStreamEvent[] = []
    await runAssistStream(
      { prompt: 'hi', surface: 'workspace.deck', context: {} },
      { onEvent: (e) => events.push(e) },
    )
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(events).toEqual([
      { type: 'status', message: 'starting' },
      { type: 'text_delta', delta: 'hel' },
      { type: 'text_delta', delta: 'lo' },
      { type: 'done' },
    ])
  })

  it('reassembles frames split across chunks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        // First chunk has a half frame.
        'data: {"type":"text_delta","del',
        // Second chunk completes that frame and starts another.
        'ta":"abc"}\n\ndata: {"type":"text_delta","delta":"def"}\n\n',
      ]),
    )
    const events: AssistStreamEvent[] = []
    await runAssistStream(
      { prompt: 'hi', surface: 'workspace.deck', context: {} },
      { onEvent: (e) => events.push(e) },
    )
    expect(events).toEqual([
      { type: 'text_delta', delta: 'abc' },
      { type: 'text_delta', delta: 'def' },
    ])
  })

  it('routes error frames', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        frame({ type: 'error', message: 'agent crashed' }),
      ]),
    )
    const events: AssistStreamEvent[] = []
    await runAssistStream(
      { prompt: 'hi', surface: 'workspace.deck', context: {} },
      { onEvent: (e) => events.push(e) },
    )
    expect(events).toEqual([{ type: 'error', message: 'agent crashed' }])
  })

  it('ignores unknown event types (thinking, tool_call, draft, etc.)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        frame({ type: 'thinking', content: 'hidden' }),
        frame({ type: 'tool_call', toolName: 'foo', args: {} }),
        frame({ type: 'text_delta', delta: 'visible' }),
        frame({ type: 'done' }),
      ]),
    )
    const events: AssistStreamEvent[] = []
    await runAssistStream(
      { prompt: 'hi', surface: 'workspace.deck', context: {} },
      { onEvent: (e) => events.push(e) },
    )
    expect(events).toEqual([
      { type: 'text_delta', delta: 'visible' },
      { type: 'done' },
    ])
  })

  it('surfaces non-200 HTTP responses as an error event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([], 500),
    )
    const events: AssistStreamEvent[] = []
    await runAssistStream(
      { prompt: 'hi', surface: 'workspace.deck', context: {} },
      { onEvent: (e) => events.push(e) },
    )
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
  })

  it('surfaces malformed JSON in a frame as an inline error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse(['data: {garbage}\n\n']),
    )
    const events: AssistStreamEvent[] = []
    await runAssistStream(
      { prompt: 'hi', surface: 'workspace.deck', context: {} },
      { onEvent: (e) => events.push(e) },
    )
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
  })
})

describe('summarizeDraftResult', () => {
  it('summarizes structured clarification requests before legacy text', () => {
    expect(summarizeDraftResult({
      clarificationNeeded: 'legacy fallback',
      clarificationRequests: [
        {
          id: 'cells',
          kind: 'material',
          prompt: 'Which HepG2 cells should be used?',
          menuProvider: '/m',
          options: [],
        },
      ],
    })).toBe('Which HepG2 cells should be used?')
  })
})
