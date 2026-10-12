/**
 * PB-CH-4 — the app-side transport mirror of PB-CH-1's emission + the tier-2
 * intent event (spec §2b, "First targeted check").
 *
 * Pins:
 *  1. an `agent_action` SSE frame (the server's compiled, Ajv-revalidated
 *     PB-CH-1 payload) parses into the typed AgentActionEnvelope;
 *  2. optional fields (surface/contextNote) are OMITTED when absent — never
 *     present-as-undefined (exactOptionalPropertyTypes discipline, mirroring
 *     server/src/ai/types.ts#AgentActionPayload);
 *  3. a `workstate_proposal` frame carries the model's INTENT verbatim — it is
 *     NOT a compiled draft and is NOT actionable alone;
 *  4. an unknown frame type still parses to nothing (dispatchFrame's default
 *     branch intact — the seam that silently dropped agent_action before this
 *     item is now an explicit case, and genuinely unknown types stay dropped).
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
    { prompt: 'go', surface: 'workspace.deck', context: {} },
    { onEvent: (e) => events.push(e) },
  )
  // The stream itself emits no status/done here — filter to the new members.
  return events
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('assistStream — agent_action frame (PB-CH-1 transport mirror)', () => {
  it('an agent_action SSE frame parses into the typed envelope (surface/contextNote OMITTED when absent, never undefined)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        frame({
          type: 'agent_action',
          action: {
            action: 'focus',
            target: { kind: 'protocol-step', protocolId: 'PRT-000123', stepId: 'step-read', label: 'Read plate' },
          },
        }),
      ]),
    )

    const events = await collect()
    const actionEvents = events.filter((e) => e.type === 'agent_action')
    expect(actionEvents).toHaveLength(1)
    const event = actionEvents[0] as Extract<AssistStreamEvent, { type: 'agent_action' }>
    expect(event.action.action).toBe('focus')
    expect(event.action.target).toEqual({
      kind: 'protocol-step',
      protocolId: 'PRT-000123',
      stepId: 'step-read',
      label: 'Read plate',
    })
    // exactOptionalPropertyTypes: absent optionals are ABSENT keys, not undefined.
    expect('surface' in event.action).toBe(false)
    expect('contextNote' in event.action).toBe(false)
    expect('supportedBy' in event.action).toBe(false)
  })

  it('an open-surface agent_action keeps its surface + contextNote when the server compiled them', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        frame({
          type: 'agent_action',
          action: {
            action: 'open-surface',
            surface: 'analysis',
            target: { kind: 'planned-run', id: 'RUN-7', type: 'planned-run', label: 'ROS run' },
            contextNote: 'the analysis you asked for',
          },
        }),
      ]),
    )

    const events = await collect()
    const event = events.find((e) => e.type === 'agent_action') as Extract<AssistStreamEvent, { type: 'agent_action' }>
    expect(event.action.action).toBe('open-surface')
    expect(event.action.surface).toBe('analysis')
    expect(event.action.contextNote).toBe('the analysis you asked for')
  })

  it('a workstate_proposal frame carries the model intent VERBATIM (not a compiled draft, not actionable alone)', async () => {
    const intent = {
      operation: 'compose-workstate',
      tabs: [
        { surface: 'run-design', target: { term: 'ROS run' } },
        { surface: 'analysis', target: { recordId: 'AN-0007' } },
      ],
      activeTab: { index: 0 },
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([frame({ type: 'workstate_proposal', workstate: intent })]),
    )

    const events = await collect()
    const proposals = events.filter((e) => e.type === 'workstate_proposal')
    expect(proposals).toHaveLength(1)
    const event = proposals[0] as Extract<AssistStreamEvent, { type: 'workstate_proposal' }>
    // Verbatim relay: the client does not compile, filter, or "help".
    expect(event.workstate).toEqual(intent)
    // The frame carries NO compiled-draft fields — the compile endpoint is the
    // trust boundary (OQ1 ruling), not this stream.
    expect(event.workstate).not.toHaveProperty('sessionDocument')
    expect(event.workstate).not.toHaveProperty('canAccept')
  })

  it('an unknown frame type still parses to nothing (default branch intact)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse([
        frame({ type: 'thinking', content: 'internal chatter' }),
        frame({ type: 'totally_unknown_v3', payload: 1 }),
      ]),
    )

    const events = await collect()
    expect(events).toHaveLength(0)
  })
})
