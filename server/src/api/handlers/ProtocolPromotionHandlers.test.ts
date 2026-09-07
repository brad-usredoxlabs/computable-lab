import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createProtocolPromotionHandlers } from './ProtocolPromotionHandlers.js'

// Stub ExecutionRunService (and the two services built alongside it in the
// handler constructor) so we control getMaterializedEventGraph without
// constructing the full execution stack.
const getMaterializedEventGraph = vi.fn()
vi.mock('../../execution/ExecutionRunService.js', () => ({
  ExecutionRunService: class {
    getMaterializedEventGraph = getMaterializedEventGraph
  },
}))
vi.mock('../../execution/ExecutionEvidenceService.js', () => ({
  ExecutionEvidenceService: class {},
}))
vi.mock('../../execution/ExecutionTimelineService.js', () => ({
  ExecutionTimelineService: class {},
}))

/** Minimal in-memory store facade the handler uses. */
function makeStore(records: Record<string, unknown>[]) {
  const byId = new Map(records.map((r) => [r.recordId ?? r.id, r]))
  return {
    get: vi.fn(async (id: string) => byId.get(id) ?? null),
    create: vi.fn(async ({ envelope }: { envelope: { recordId: string; payload: unknown } }) => ({
      envelope: { recordId: envelope.recordId, payload: envelope.payload },
    })),
  }
}

function ctxWithRun(runId: string) {
  return { store: makeStore([{ recordId: runId, payload: { kind: 'execution-run' } }]) }
}

function makeReply() {
  const self = {
    status: () => self,
    send: (_b: unknown) => _b,
  }
  return self
}

beforeEach(() => {
  getMaterializedEventGraph.mockReset()
})

describe('createProtocolFromDraft — keeps the run event graph as the step realization', () => {
  it('sets subGraphRef on each created step pointing at the run event-graph', async () => {
    getMaterializedEventGraph.mockResolvedValue({
      eventGraphId: 'EVG-run-1',
      record: { id: 'EVG-run-1', kind: 'event-graph', events: [], labwares: [] },
    })

    const handlers = createProtocolPromotionHandlers(ctxWithRun('RUN-9') as never)
    const result = await handlers.createProtocolFromDraft({
      body: {
        derivedFromRunId: 'RUN-9',
        draft: {
          protocolName: 'HepaRG PPARα assay',
          version: '1.0.0',
          steps: [
            { eventId: 'e1', originalAction: 'Add clofibrate' },
            { eventId: 'e2', originalAction: 'Load GC' },
          ],
        },
      },
    } as never, makeReply() as never)

    expect(result.success).toBe(true)
    const protocol = (result.protocolRecord as { steps: Array<Record<string, unknown>> }).steps
    expect(protocol).toHaveLength(2)
    for (const step of protocol) {
      expect(step.subGraphRef).toEqual({ kind: 'record', type: 'event-graph', id: 'EVG-run-1' })
    }
  })

  it('records the event-graph source in evolvedFrom alongside the run', async () => {
    getMaterializedEventGraph.mockResolvedValue({
      eventGraphId: 'EVG-run-1',
      record: { id: 'EVG-run-1', kind: 'event-graph', events: [], labwares: [] },
    })

    const handlers = createProtocolPromotionHandlers(ctxWithRun('RUN-9') as never)
    const result = await handlers.createProtocolFromDraft({
      body: { derivedFromRunId: 'RUN-9', draft: { protocolName: 'X', version: '1.0.0', steps: [] } },
    } as never, makeReply() as never)

    const evolvedFrom = (result.protocolRecord as { evolvedFrom: Array<{ sourceType: string }> }).evolvedFrom
    expect(evolvedFrom.map((e) => e.sourceType)).toEqual(expect.arrayContaining(['run', 'event-graph']))
  })

  it('omits subGraphRef when the run has no materialized event graph', async () => {
    getMaterializedEventGraph.mockResolvedValue(null)
    const handlers = createProtocolPromotionHandlers(ctxWithRun('RUN-9') as never)
    const result = await handlers.createProtocolFromDraft({
      body: { derivedFromRunId: 'RUN-9', draft: { protocolName: 'X', version: '1.0.0', steps: [{ eventId: 'e1', originalAction: 'do' }] } },
    } as never, makeReply() as never)

    const steps = (result.protocolRecord as { steps: Array<Record<string, unknown>> }).steps
    expect(steps[0].subGraphRef).toBeUndefined()
  })
})