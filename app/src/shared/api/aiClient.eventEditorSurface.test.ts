/**
 * L2-INTENTID-REDRAFT-1 (leg B) — the event-editor streamAssist JSON body
 * must carry its `surface`.
 *
 * The live event-editor chat posts to the legacy
 * POST /ai/draft-events/stream endpoint (streamAssist's backward-compat arm).
 * Pre-fix the JSON branch DELIBERATELY omitted the `surface` field for
 * event-editor (the multipart branch already appended it), and the server
 * handler never read one — so the orchestrator's shorthand answer arm was
 * silently dead on the LIVE path. This test pins the request shape the
 * server needs:
 *   1. event-editor + answers  → legacy draft-events/stream endpoint, body
 *      carries `surface: 'event-editor'` AND the clarificationAnswers.
 *   2. event-editor, no answers → surface still present, the answers key
 *      ABSENT (conditional spread — byte-stable legacy shape).
 *   3. a non-event-editor surface (run-workspace) → the body is
 *      BYTE-IDENTICAL to the pre-fix shape (the byte-stability discipline
 *      for the OTHER surfaces is preserved exactly).
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { streamAssist } from './aiClient'

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

interface CapturedCall {
  url: string
  body: unknown
}

function captureFetch() {
  const calls: CapturedCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init && 'body' in init ? JSON.parse(String(init.body)) : undefined,
    })
    return new Response(
      sseStream(['data: {"type":"status","message":"ok"}', 'data: {"type":"done","result":{}}']),
      { status: 200 },
    )
  })
  return { fetchMock, calls }
}

async function drain(gen: AsyncGenerator<unknown>): Promise<void> {
  for await (const _ev of gen) void _ev
}

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('streamAssist — the event-editor JSON body carries its surface (leg B)', () => {
  it('event-editor posts the legacy draft-events/stream endpoint WITH surface + clarificationAnswers', async () => {
    const { fetchMock, calls } = captureFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const answers = [{ requestId: 'unresolved-c-1', label: 'Which reagent?', value: 'Trypsin' }]
    const context = { eventGraphId: 'EVG-legB-app', editorMode: 'deck' }
    await drain(
      streamAssist(
        'add trypsin to dmem',
        'event-editor',
        context,
        [{ role: 'user', content: 'hi' }],
        undefined,
        undefined,
        undefined,
        answers,
      ),
    )

    expect(calls).toHaveLength(1)
    // The legacy endpoint (event-editor backward-compat arm).
    expect(calls[0]!.url).toContain('/ai/draft-events/stream')
    const body = calls[0]!.body as Record<string, unknown>
    // THE DEFECT: pre-fix this key was ABSENT for event-editor (the
    // conditional-spread arm dropped it); RED on base, GREEN post-fix.
    expect(body.surface).toBe('event-editor')
    // The ANSWER-CHANNEL answers ride the same body (conditional spread:
    // present because a non-empty array was supplied).
    expect(body.clarificationAnswers).toEqual(answers)
    // The rest of the shape is unchanged.
    expect(body.prompt).toBe('add trypsin to dmem')
    expect(body.context).toEqual(context)
    expect(body.history).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('event-editor WITHOUT answers keeps the answers key absent (byte-stable) but still carries surface', async () => {
    const { fetchMock, calls } = captureFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const context = { eventGraphId: 'EVG-legB-app2' }
    await drain(streamAssist('add dmem', 'event-editor', context, []))

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('/ai/draft-events/stream')
    const body = calls[0]!.body as Record<string, unknown>
    expect(body.surface).toBe('event-editor')
    // Conditional spread discipline: absent, never undefined.
    expect('clarificationAnswers' in body).toBe(false)
    expect(JSON.stringify(body)).not.toContain('clarificationAnswers')
    // The serialized body is the byte-exact legacy shape plus surface.
    expect(JSON.stringify(body)).toBe(
      JSON.stringify({ prompt: 'add dmem', surface: 'event-editor', context, history: [] }),
    )
  })

  it('a non-event-editor surface keeps its pre-fix byte-identical body (assist/stream)', async () => {
    const { fetchMock, calls } = captureFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const context = { workspaceId: 'WS-1' }
    await drain(streamAssist('add dmem', 'run-workspace', context, []))

    expect(calls).toHaveLength(1)
    // The other surfaces use the generalized assist endpoint (unchanged).
    expect(calls[0]!.url).toContain('/ai/assist/stream')
    const body = calls[0]!.body as Record<string, unknown>
    // BYTE-IDENTICAL to the pre-fix body for this surface: same keys, same
    // order, same values (the byte-stability discipline is preserved).
    expect(JSON.stringify(body)).toBe(
      JSON.stringify({ prompt: 'add dmem', surface: 'run-workspace', context, history: [] }),
    )
  })
})
