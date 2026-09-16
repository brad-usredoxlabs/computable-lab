import { describe, expect, it, vi, afterEach } from 'vitest'
import { streamChat } from './chatClient'

function sseStream(blocks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const block of blocks) {
        controller.enqueue(encoder.encode(`${block}\n\n`))
      }
      controller.close()
    },
  })
}

async function collect(): Promise<unknown[]> {
  const events: unknown[] = []
  for await (const ev of streamChat([{ role: 'user', content: 'hi' }])) {
    events.push(ev)
  }
  return events
}

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('streamChat', () => {
  it('parses content deltas into chunk events', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        sseStream([
          'data: {"message":{"role":"assistant","content":"Hel"},"done":false}',
          'data: {"message":{"role":"assistant","content":"lo"},"done":false}',
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const events = await collect()
    expect(events).toMatchObject([
      { type: 'chunk', content: 'Hel' },
      { type: 'chunk', content: 'lo' },
    ])
  })

  it('yields reasoning deltas as reasoning events (chain of thought)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        sseStream([
          'data: {"type":"reasoning","content":"We "}',
          'data: {"type":"reasoning","content":"answer"}',
          'data: {"message":{"role":"assistant","content":"102"},"done":false}',
          'data: {"done":true}',
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const events = await collect()
    expect(events).toMatchObject([
      { type: 'reasoning', content: 'We ' },
      { type: 'reasoning', content: 'answer' },
      { type: 'chunk', content: '102' },
      { type: 'done' },
    ])
  })

  it('yields a timing event with PP and decode tokens/s', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        sseStream([
          'data: {"message":{"role":"assistant","content":"hi"},"done":false}',
          'data: {"type":"timing","ppTokensPerSec":146.8,"decodeTokensPerSec":30.9}',
          'data: {"message":{"role":"assistant","content":""},"done":true}',
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const events = await collect()
    expect(events[1]).toEqual({ type: 'timing', ppTokensPerSec: 146.8, decodeTokensPerSec: 30.9 })
    expect(events[events.length - 1]).toEqual({ type: 'done' })
  })

  it('surfaces an error type when the server reports one', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        sseStream(['data: {"type":"error","message":"Upstream 502: bad"}']),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const events = await collect()
    expect(events[0]).toEqual({ type: 'error', message: 'Upstream 502: bad' })
  })

  it('yields an error when the HTTP response is not ok', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 400 })) as unknown as typeof fetch
    const events = await collect()
    expect(events[0]).toMatchObject({ type: 'error' })
  })
})