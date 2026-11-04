/**
 * CARD1-FIX4 D12 (advc c10) — the "byte-identical wire" proof must assert the
 * ACTUAL outgoing fetch BODY at the aiClient boundary, not the in-process
 * `streamAssist` argument.
 *
 * The card1fix5 persist/re-send pins (useAiChat.card1fix5.persistResend.test.ts
 * :178, :216) assert the in-process argument `sa.mock.calls[0][7]` (streamAssist
 * arg index 8). That proves the HOOK passes the set, but not that the WIRE
 * carries it — a pin that reads only the argument would pass even if the
 * serialized HTTP body changed. This pin drives the REAL `streamAssist`
 * (app/src/shared/api/aiClient.ts) and asserts the OUTGOING fetch body:
 *   - a NON-EMPTY answer set  -> the body carries `clarificationAnswers`
 *     (the answers ride the wire, keyed by requestId — the persist re-send).
 *   - an EMPTY answer set     -> the field is ABSENT (conditional spread, never
 *     `undefined`) and the serialized body is BYTE-IDENTICAL to the fresh-ask
 *     shape (no spurious key, no trailing comma drift).
 *
 * The existing aiClient.eventEditorSurface.test.ts already pins the `surface`
 * field's byte-stability at this same boundary (the leg-B defect). This pin is
 * the card1fix5 `clarificationAnswers` byte-identity at the SAME wire boundary,
 * so the persist/re-send wire proof is self-contained in the card1fix5 family.
 * No product code change — the guard at aiClient.ts:276-278
 * (`clarificationAnswers.length > 0 ? { clarificationAnswers } : {}`) is the
 * behavior this pin locks.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { streamAssist } from './aiClient'
import type { AiClarificationAnswer } from '../../types/ai'

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
  rawBody: string
  body: unknown
}

function captureFetch() {
  const calls: CapturedCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(init?.body ?? '')
    calls.push({
      url: String(input),
      rawBody: raw,
      body: raw ? JSON.parse(raw) : undefined,
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

// The live event-editor path (the surface card1fix5 exercises) posts the legacy
// /ai/draft-events/stream JSON arm — the same conditional-spread body the
// persist/re-send union feeds (aiClient.ts:287).
const CONTEXT = { eventGraphId: 'EVG-card1fix5-wire', editorMode: 'deck' }
const HISTORY = [{ role: 'user' as const, content: 'Use the answered reagent.' }]

describe('CARD1-FIX4 D12 — the clarificationAnswers wire is pinned at the aiClient boundary (the actual outgoing body)', () => {
  it('a NON-EMPTY answer set rides the outgoing body (the persist re-send carries the answered requestIds on the wire)', async () => {
    const { fetchMock, calls } = captureFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const answers: AiClarificationAnswer[] = [
      { requestId: 'unresolved-c-541c08ee67', label: '1 mM Clofibrate in DMSO', value: '1 mM Clofibrate in DMSO' },
    ]
    await drain(
      streamAssist('Now draft the formulation.', 'event-editor', CONTEXT, HISTORY, undefined, undefined, undefined, answers),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('/ai/draft-events/stream')
    const body = calls[0]!.body as Record<string, unknown>
    // THE wire assertion: the non-empty set is PRESENT on the outgoing body,
    // keyed by requestId (the server drop AgentOrchestrator.ts:3085-3098 reads
    // exactly this field), byte-for-byte the set the hook passed.
    expect('clarificationAnswers' in body).toBe(true)
    expect(body.clarificationAnswers).toEqual(answers)
    expect(JSON.stringify(body.clarificationAnswers)).toBe(JSON.stringify(answers))
    // The rest of the shape is unchanged (the field is APPENDED, not reordered).
    expect(body.prompt).toBe('Now draft the formulation.')
    expect(body.surface).toBe('event-editor')
    expect(body.context).toEqual(CONTEXT)
    expect(body.history).toEqual(HISTORY)
  })

  it('an EMPTY answer set is ABSENT from the outgoing body and BYTE-IDENTICAL to the fresh-ask shape (no spurious key)', async () => {
    const { fetchMock, calls } = captureFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    // A follow-up with NO fresh answer on a thread with NO persisted answer:
    // the union yields [] (the re-send is a no-op) and streamAssist receives
    // the empty set. The conditional spread (aiClient.ts:276-278) must drop the
    // field entirely — the body is byte-identical to the pre-answer-channel
    // fresh-ask shape.
    await drain(streamAssist('Now draft the formulation.', 'event-editor', CONTEXT, HISTORY, undefined, undefined, undefined, []))

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('/ai/draft-events/stream')
    const body = calls[0]!.body as Record<string, unknown>
    // ABSENT, never `undefined` (conditional-spread discipline).
    expect('clarificationAnswers' in body).toBe(false)
    expect(body.clarificationAnswers).toBeUndefined()
    // THE byte-identity: the serialized body is byte-exact to the fresh-ask
    // shape with NO clarificationAnswers key. This is what "byte-identical
    // fresh-ask wire" means at the WIRE, not just the in-process argument.
    expect(calls[0]!.rawBody).toBe(JSON.stringify({ prompt: 'Now draft the formulation.', surface: 'event-editor', context: CONTEXT, history: HISTORY }))
    expect(JSON.stringify(body)).not.toContain('clarificationAnswers')
  })

  it('an UNSET answer argument (undefined) is likewise absent — the fresh-ask default shape', async () => {
    const { fetchMock, calls } = captureFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    // streamAssist's 8th arg is optional; a call that simply omits it must also
    // produce the field-absent fresh-ask body (the same byte-identical shape as
    // the empty-set case above — the guard treats [] and undefined alike).
    await drain(streamAssist('Now draft the formulation.', 'event-editor', CONTEXT, HISTORY))

    expect(calls).toHaveLength(1)
    const body = calls[0]!.body as Record<string, unknown>
    expect('clarificationAnswers' in body).toBe(false)
    expect(calls[0]!.rawBody).toBe(JSON.stringify({ prompt: 'Now draft the formulation.', surface: 'event-editor', context: CONTEXT, history: HISTORY }))
  })
})
