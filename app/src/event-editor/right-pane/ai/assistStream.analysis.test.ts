/**
 * PB-CH-5 — the app-side transport mirror of the analysis_proposal frame.
 *
 * Pins:
 *  1. an `analysis_proposal` SSE frame parses into the typed union member and
 *     carries the model's INTENT verbatim — it is NOT a compiled draft and is
 *     NOT actionable alone (POST /api/drafts/compile is the trust boundary);
 *  2. a frame whose `analysis` is missing / not an object / an array is
 *     DROPPED (the same guard shape as workstate_proposal — never guessed
 *     into an event);
 *  3. the exhaustive dispatchFrame switch keeps its never-default forcing arm
 *     while gaining the new case (source-pin — the compile break was the
 *     feature, PB-CH-4 precedent).
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

const ANALYSIS = {
  operation: 'compose-analysis',
  target: {
    revision: { term: 'ROS mitochondrial flux analysis' },
    newRun: { title: 'Fresh ROS run', inputs: { trace: { term: 'Seahorse trace file' } } },
  },
  focus: 'run',
}

describe('assistStream — analysis_proposal frame (PB-CH-5 transport mirror)', () => {
  it('an analysis_proposal SSE frame parses into the union member carrying the INTENT verbatim', async () => {
    const events = await collect([frame({ type: 'analysis_proposal', analysis: ANALYSIS })])
    const proposals = events.filter((e) => e.type === 'analysis_proposal')
    expect(proposals).toHaveLength(1)
    const event = proposals[0] as Extract<AssistStreamEvent, { type: 'analysis_proposal' }>
    // Verbatim relay: same shape, same order, nothing compiled or added.
    expect(event.analysis).toEqual(ANALYSIS)
    // Thin event: NO compiled document, NO canAccept on the stream.
    expect(event.analysis).not.toHaveProperty('sessionDocument')
    expect(event.analysis).not.toHaveProperty('canAccept')
  })

  it('a frame with missing / non-object / array `analysis` is DROPPED, never guessed into an event', async () => {
    const events = await collect([
      frame({ type: 'analysis_proposal' }),
      frame({ type: 'analysis_proposal', analysis: 'not-an-object' }),
      frame({ type: 'analysis_proposal', analysis: [1, 2] }),
    ])
    expect(events.filter((e) => e.type === 'analysis_proposal')).toHaveLength(0)
  })

  it('dispatchFrame gains the analysis case while the unknown-frame default stays intact (source-pin)', () => {
    const source = readFileSync('src/event-editor/right-pane/ai/assistStream.ts', 'utf8')
    expect(source).toContain("case 'analysis_proposal'")
    // assistStream's default arm ignores genuinely unknown frames (it never
    // had a never arm — useChatThread's exhaustive switch does, pinned there).
    expect(source).toContain('default:')
  })
})
