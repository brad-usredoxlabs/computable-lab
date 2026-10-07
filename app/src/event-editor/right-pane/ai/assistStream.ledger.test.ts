/**
 * PB-CH-8 — the app-side transport mirror of the server's `ledger_answer`
 * frame (spec §5). The frame is SERVER-BUILT fetched evidence (OQ2 ruling):
 * the client relays it verbatim and never re-composes answer prose.
 *
 * Pins:
 *  1. a `ledger_answer` SSE frame (found) parses into the typed envelope;
 *     optional fields (capturedAt/disclosure/links) are OMITTED when absent —
 *     never present-as-undefined (exactOptionalPropertyTypes discipline, the
 *     same mirror discipline as `agent_action`);
 *  2. a no-history frame keeps its `reason` + `labEvents` (the honest §4.6
 *     shape) and the server-built `answerText`;
 *  3. a malformed frame (no status / unknown status) parses to NOTHING — the
 *     client never guesses an answer into existence;
 *  4. the frame is assistStream-only: `types/ai.ts`'s generic `AiStreamEvent`
 *     gains NO member this task (the pin-test rationale — the generic
 *     useAiChat stack does not consume ledger answers).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAssistStream, type AssistStreamEvent } from './assistStream'

vi.mock('../../../shared/api/base', () => ({
  API_BASE: 'http://test/api',
}))

function makeStreamResponse(chunks: string[]): Response {
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
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function frame(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

async function collect(): Promise<AssistStreamEvent[]> {
  const events: AssistStreamEvent[] = []
  await runAssistStream(
    { prompt: 'what was the workstate history of the ROS run?', surface: 'workspace.deck', context: {} },
    { onEvent: (e) => events.push(e) },
  )
  return events
}

afterEach(() => {
  vi.restoreAllMocks()
})

type LedgerEvent = Extract<AssistStreamEvent, { type: 'ledger_answer' }>

describe('assistStream — ledger_answer frame (PB-CH-8 transport mirror)', () => {
  it('a found ledger_answer frame parses verbatim (links OMITTED when absent, never undefined)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        frame({
          type: 'ledger_answer',
          answer: {
            status: 'found',
            asOf: '2026-10-07T10:05:00.000Z',
            capturedAt: '2026-10-07T10:00:00.000Z',
            disclosure: 'as captured at 2026-10-07T10:00:00.000Z — nearest stored snapshot at or before 2026-10-07T10:05:00.000Z',
            answerText: 'Workstate as captured at 2026-10-07T10:00:00.000Z.',
          },
        }),
      ]),
    )

    const events = await collect()
    const ledgerEvents = events.filter((e) => e.type === 'ledger_answer')
    expect(ledgerEvents).toHaveLength(1)
    const event = ledgerEvents[0] as LedgerEvent
    expect(event.answer.status).toBe('found')
    expect(event.answer.asOf).toBe('2026-10-07T10:05:00.000Z')
    expect(event.answer.capturedAt).toBe('2026-10-07T10:00:00.000Z')
    expect(event.answer.answerText).toBe('Workstate as captured at 2026-10-07T10:00:00.000Z.')
    // exactOptionalPropertyTypes: absent optionals are ABSENT keys, not undefined.
    expect('links' in event.answer).toBe(false)
    expect('reason' in event.answer).toBe(false)
    expect('labEvents' in event.answer).toBe(false)
  })

  it('a found frame with links keeps them verbatim (provenance lines ride the frame)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        frame({
          type: 'ledger_answer',
          answer: {
            status: 'found',
            asOf: '2026-10-07T10:05:00.000Z',
            capturedAt: '2026-10-07T10:00:00.000Z',
            links: ['EVT-1', 'EVT-2'],
          },
        }),
      ]),
    )

    const events = await collect()
    const event = events.find((e) => e.type === 'ledger_answer') as LedgerEvent
    expect(event.answer.links).toEqual(['EVT-1', 'EVT-2'])
  })

  it('a no-history frame keeps reason + labEvents + the server-built answerText (§4.6 honest shape)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        frame({
          type: 'ledger_answer',
          answer: {
            status: 'no-history',
            asOf: '2026-09-01T09:00:00.000Z',
            reason: 'predates-first-capture',
            labEvents: [
              { recordId: 'EVT-1', action: 'run.status-changed', occurredAt: '2026-09-01T08:50:00.000Z', subjectId: 'RUN-1' },
            ],
            answerText: 'No stored workstate history exists at or before that time.',
          },
        }),
      ]),
    )

    const events = await collect()
    const event = events.find((e) => e.type === 'ledger_answer') as LedgerEvent
    expect(event.answer.status).toBe('no-history')
    expect(event.answer.reason).toBe('predates-first-capture')
    expect(event.answer.labEvents).toEqual([
      { recordId: 'EVT-1', action: 'run.status-changed', occurredAt: '2026-09-01T08:50:00.000Z', subjectId: 'RUN-1' },
    ])
    expect(event.answer.answerText).toBe('No stored workstate history exists at or before that time.')
    expect('capturedAt' in event.answer).toBe(false)
    expect('disclosure' in event.answer).toBe(false)
  })

  it('a malformed ledger_answer frame (no status / unknown status) parses to NOTHING — the client never guesses an answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        frame({ type: 'ledger_answer', answer: { asOf: '2026-10-07T10:05:00.000Z' } }),
        frame({ type: 'ledger_answer', answer: { status: 'guessed', asOf: '2026-10-07T10:05:00.000Z' } }),
        frame({ type: 'ledger_answer' }),
      ]),
    )

    const events = await collect()
    expect(events.filter((e) => e.type === 'ledger_answer')).toHaveLength(0)
  })
})
