/**
 * MATRES-CHAIN — the app-side transport mirror of the chain_proposal frame
 * (gate g1c D1: the frame EXISTS on the wire — sse-raw-server.txt — but the
 * parseAssistFrame switch had NO `case 'chain_proposal'`, so the frame fell
 * through to `default:` and was silently dropped one layer BELOW the
 * hook-down wiring fix-2 shipped. This is the missing LAYER test: the chain
 * tests previously sat at the hook layer (useAiChat / AiTabPanel mocks),
 * never through the real parser/relay path).
 *
 * Pins:
 *  1. a `chain_proposal` SSE frame parses into the typed union member and
 *     carries the model's INTENT verbatim — it is NOT a compiled draft and is
 *     NOT actionable alone (POST /api/drafts/compile, adapter 'chain', is the
 *     trust boundary);
 *  2. a frame whose `chain` is missing / not an object / an array is
 *     DROPPED (the same guard shape as analysis_proposal / record_draft_proposal
 *     — never guessed into an event);
 *  3. the parseAssistFrame switch keeps its unknown-frame default arm while
 *     gaining the new case (source-pin — the assistStream.analysis.test.ts
 *     precedent).
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
    { prompt: 'go', surface: 'workspace.deck', context: {} },
    { onEvent: (e) => events.push(e) },
  )
  return events
}

afterEach(() => {
  vi.restoreAllMocks()
})

// The REAL frame shape captured from the live server in the g1c receipts
// (sse-raw-server.txt): the thin attestation envelope — prepared + 10 aliquots.
const CHAIN = {
  operation: 'compose-execute-chain',
  artifactKind: 'attestation-chain',
  prepared: { name: 'cell suspension', volume: { value: 1, unit: 'mL' } },
  aliquots: [
    { volume: { value: 100, unit: 'uL' }, disposition: 'consumed', approximation: 'today' },
    { volume: { value: 100, unit: 'uL' }, disposition: 'stored', approximation: 'today' },
  ],
  aliquotCount: 2,
}

describe('assistStream — chain_proposal frame (MATRES-CHAIN transport mirror)', () => {
  it('a chain_proposal SSE frame parses into the union member carrying the INTENT verbatim', async () => {
    const events = await collect([frame({ type: 'chain_proposal', chain: CHAIN })])
    const proposals = events.filter((e) => e.type === 'chain_proposal')
    expect(proposals).toHaveLength(1)
    const event = proposals[0] as Extract<AssistStreamEvent, { type: 'chain_proposal' }>
    // Verbatim relay: same shape, same order, nothing compiled or added.
    expect(event.chain).toEqual(CHAIN)
    // Thin event: NO compiled document, NO canAccept on the stream.
    expect(event.chain).not.toHaveProperty('sessionDocument')
    expect(event.chain).not.toHaveProperty('canAccept')
  })

  it('the frame followed by done still surfaces the chain event (the g1c wire sequence)', async () => {
    // Mirrors sse-raw-server.txt: chain_proposal then done in one stream.
    const events = await collect([
      frame({ type: 'chain_proposal', chain: CHAIN }),
      frame({ type: 'done' }),
    ])
    expect(events.filter((e) => e.type === 'chain_proposal')).toHaveLength(1)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  it('a frame with missing / non-object / array `chain` is DROPPED, never guessed into an event', async () => {
    const events = await collect([
      frame({ type: 'chain_proposal' }),
      frame({ type: 'chain_proposal', chain: 'not-an-object' }),
      frame({ type: 'chain_proposal', chain: [1, 2] }),
    ])
    expect(events.filter((e) => e.type === 'chain_proposal')).toHaveLength(0)
  })

  it('parseAssistFrame gains the chain case while the unknown-frame default stays intact (source-pin)', () => {
    const source = readFileSync('src/event-editor/right-pane/ai/assistStream.ts', 'utf8')
    expect(source).toContain("case 'chain_proposal'")
    // assistStream's default arm ignores genuinely unknown frames (it never
    // had a never arm — useChatThread's exhaustive switch does, pinned there).
    expect(source).toContain('default:')
  })
})
