/**
 * QMS7-7 — the app-side transport mirror of the record_draft_proposal frame
 * (PB-CH-5 shape, pinned the same way as assistStream.analysis.test.ts).
 *
 * Pins:
 *  1. a `record_draft_proposal` SSE frame parses into the typed union member
 *     and carries the model's INTENT verbatim — it is NOT a compiled draft and
 *     is NOT actionable alone (POST /api/drafts/compile is the trust boundary);
 *  2. a frame whose `recordDraft` is missing / not an object / an array is
 *     DROPPED (the same guard shape as analysis_proposal — never guessed into
 *     an event);
 *  3. the dispatchFrame switch gains the new case while the unknown-frame
 *     default stays intact (source-pin).
 *
 * RED at base: the union member and the case do not exist, so the frame is
 * silently dropped (the PB-CH-6 defect class).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
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

async function collect(chunks: string[]): Promise<AssistStreamEvent[]> {
  const events: AssistStreamEvent[] = []
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeStreamResponse(chunks))
  await runAssistStream(
    { prompt: 'go', surface: 'registry', context: {} },
    { onEvent: (e) => events.push(e) },
  )
  return events
}

afterEach(() => {
  vi.restoreAllMocks()
})

const RECORD_DRAFT = {
  operation: 'compose-record',
  kind: 'training-material',
  fields: { title: 'Pipetting safety basics', materialType: 'slide_deck' },
}

describe('assistStream — record_draft_proposal frame (QMS7-7 transport mirror)', () => {
  it('a record_draft_proposal SSE frame parses into the union member carrying the INTENT verbatim', async () => {
    const events = await collect([frame({ type: 'record_draft_proposal', recordDraft: RECORD_DRAFT })])
    const proposals = events.filter((e) => e.type === 'record_draft_proposal')
    expect(proposals).toHaveLength(1)
    const event = proposals[0] as Extract<AssistStreamEvent, { type: 'record_draft_proposal' }>
    // Verbatim relay: same shape, same order, nothing compiled or added.
    expect(event.recordDraft).toEqual(RECORD_DRAFT)
    // Thin event: NO compiled document, NO canAccept on the stream.
    expect(event.recordDraft).not.toHaveProperty('sessionDocument')
    expect(event.recordDraft).not.toHaveProperty('canAccept')
  })

  it('a frame with missing / non-object / array `recordDraft` is DROPPED, never guessed into an event', async () => {
    const events = await collect([
      frame({ type: 'record_draft_proposal' }),
      frame({ type: 'record_draft_proposal', recordDraft: 'not-an-object' }),
      frame({ type: 'record_draft_proposal', recordDraft: [1, 2] }),
    ])
    expect(events.filter((e) => e.type === 'record_draft_proposal')).toHaveLength(0)
  })

  it('dispatchFrame gains the record_draft case while the unknown-frame default stays intact (source-pin)', () => {
    const source = readFileSync('src/event-editor/right-pane/ai/assistStream.ts', 'utf8')
    expect(source).toContain("case 'record_draft_proposal'")
    expect(source).toContain('default:')
  })
})
