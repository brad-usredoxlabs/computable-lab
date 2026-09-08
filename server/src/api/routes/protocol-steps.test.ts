import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import type { RecordEnvelope } from '../../types/RecordEnvelope.js'
import type { RecordStore } from '../../store/types.js'
import { registerProtocolStepsRoutes } from './protocol-steps.js'

/** Minimal in-memory store satisfying the parts the route touches (get/create/update). */
function makeStore(initial: Record<string, RecordEnvelope>) {
  const byId = new Map(Object.entries(initial))
  const created: RecordEnvelope[] = []
  const store = {
    async get(recordId: string): Promise<RecordEnvelope | null> {
      return byId.get(recordId) ?? null
    },
    async create(opts: { envelope: RecordEnvelope }): Promise<{ success: boolean; recordId?: string; error?: string; envelope?: RecordEnvelope }> {
      created.push(opts.envelope)
      byId.set(opts.envelope.recordId, opts.envelope)
      return { success: true, recordId: opts.envelope.recordId, envelope: opts.envelope }
    },
    async update(opts: { envelope: RecordEnvelope }): Promise<{ success: boolean; error?: string; envelope?: RecordEnvelope }> {
      byId.set(opts.envelope.recordId, opts.envelope)
      return { success: true, envelope: opts.envelope }
    },
    created,
  }
  // Deterministic gate authority: a permissive Ajv-style validate + lint.
  const validator = {
    validate: async () => ({ valid: true, errors: [] as { path: string; message: string }[] }),
  }
  const lintEngine = {
    lint: async () => ({ valid: true, violations: [] as { path?: string; message: string }[] }),
  }
  return { store: store as unknown as RecordStore, created, validator, lintEngine }
}

function protocolEnvelope(recordId: string, steps: unknown[]): RecordEnvelope {
  return {
    recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
    payload: { kind: 'protocol', recordId, title: 'Test', steps },
    meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  } as RecordEnvelope
}

describe('POST /protocols/:id/steps/:stepId/subgraph (commit a step realization)', () => {
  let app: ReturnType<typeof Fastify>
  let created: RecordEnvelope[]
  let protocolId: string

  beforeAll(async () => {
    const stepId = 'step-1'
    protocolId = 'PRT-test'
    const proto = protocolEnvelope(protocolId, [
      { stepId: 'step-1', label: 'Wash the cells', ordinal: 1, kind: 'other', description: 'wash' },
    ])
    const { store, created: c, validator, lintEngine } = makeStore({ [protocolId]: proto })
    created = c
    app = Fastify()
    // The route registers under /api via the real server prefix; mount directly with the api prefix.
    await app.register(async (instance) => {
      registerProtocolStepsRoutes(instance, { store, validator, lintEngine } as never)
    }, { prefix: '/api' })
    await app.ready()
    void stepId
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns 404 for a missing step', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/protocols/${protocolId}/steps/nope/subgraph`,
      payload: { events: [] },
    })
    expect(res.statusCode).toBe(404)
  })

  it('mints an event-graph realization and PATCHes the step subGraphRef', async () => {
    const events = [{ eventId: 'E1', event_type: 'transfer', details: { source_labwareId: 'a', target_labwareId: 'b', wells: ['A1'] } }]
    const labwares = [
      { labwareId: 'a', labwareType: 'plate_96', name: 'Source' },
      { labwareId: 'b', labwareType: 'plate_96', name: 'Target' },
    ]
    const res = await app.inject({
      method: 'POST',
      url: `/api/protocols/${protocolId}/steps/step-1/subgraph`,
      payload: { events, labwares },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.realizationId).toBeDefined()
    expect(body.subGraphRef).toMatchObject({ kind: 'record', type: 'event-graph' })
    expect(body.subGraphRef.id).toBe(body.realizationId)

    // A realization event-graph record was created with the events+labwares.
    const realization = created.find((e) => e.recordId === body.realizationId)
    expect(realization).toBeDefined()
    const p = realization?.payload as Record<string, unknown>
    expect(p.kind).toBe('event-graph')
    expect((p.events as unknown[]).length).toBe(1)
    expect((p.labwares as unknown[]).length).toBe(2)
  })

  it('persists the subGraphRef onto the step so the committed realization is discoverable', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/protocols/${protocolId}/steps/step-1` })
    expect(res.statusCode).toBe(200)
    const step = JSON.parse(res.payload).step
    expect(step.subGraphRef).toMatchObject({ kind: 'record', type: 'event-graph' })
  })

  it('GET graph prefers the committed realization over the compiled template', async () => {
    // Commit a realization first.
    const commit = await app.inject({
      method: 'POST',
      url: `/api/protocols/${protocolId}/steps/step-1/subgraph`,
      payload: {
        events: [{ eventId: 'E-committed', event_type: 'wash', details: { target_labwareId: 'p1', wells: ['A1'] } }],
        labwares: [{ labwareId: 'p1', labwareType: 'plate_96', name: 'Plate' }],
      },
    })
    expect(commit.statusCode).toBe(200)
    const { realizationId } = JSON.parse(commit.payload)

    // GET graph should return the committed events (not a compiled template).
    const res = await app.inject({ method: 'GET', url: `/api/protocols/${protocolId}/steps/step-1/graph` })
    expect(res.statusCode).toBe(200)
    const { graph } = JSON.parse(res.payload)
    expect(graph.id).toBe(realizationId)
    expect(graph.events[0]).toMatchObject({ eventId: 'E-committed' })
  })

  it('rejects a non-protocol record with 404', async () => {
    const { store, validator, lintEngine } = makeStore({})
    const tapp = Fastify()
    await tapp.register(async (instance) => {
      registerProtocolStepsRoutes(instance, { store, validator, lintEngine } as never)
    }, { prefix: '/api' })
    await tapp.ready()
    // register a mock store whose get returns a non-protocol
    const res = await tapp.inject({
      method: 'POST',
      url: '/api/protocols/NOTPROT/steps/s/subgraph',
      payload: { events: [] },
    })
    expect(res.statusCode).toBe(404) // store has no record
    await tapp.close()
    // silence unused
    void store
  })

  it('keeps the draft (422) when the realization fails the deterministic gate', async () => {
    // A validator that rejects any event (e.g. dangling ref / schema failure).
    const strictValidator = {
      validate: async () => ({
        valid: false,
        errors: [{ path: '/events/0', message: 'Missing required property: eventId' }],
      }),
    }
    const { store: s2, validator: v2, lintEngine: l2, created: created2 } = makeStore({ [protocolId]: protocolEnvelope(protocolId, [
      { stepId: 'step-1', label: 'Wash', ordinal: 1, kind: 'other' },
    ]) })
    const tapp = Fastify()
    await tapp.register(async (instance) => {
      registerProtocolStepsRoutes(instance, { store: s2, validator: strictValidator, lintEngine: l2 } as never)
    }, { prefix: '/api' })
    await tapp.ready()

    const res = await tapp.inject({
      method: 'POST',
      url: `/api/protocols/${protocolId}/steps/step-1/subgraph`,
      payload: { events: [{ event_type: 'transfer' }], labwares: [] },
    })
    expect(res.statusCode).toBe(422)
    const body = JSON.parse(res.payload)
    expect(body.error).toBe('REALIZATION_NOT_ACCEPTED')
    expect(body.findings[0]).toMatchObject({ severity: 'error', code: 'schema' })

    // The draft is preserved: no realization was minted and the step ref was NOT committed.
    expect(created2.some((e) => e.recordId.startsWith('EVG-STEP-'))).toBe(false)
    const stepRes = await tapp.inject({ method: 'GET', url: `/api/protocols/${protocolId}/steps/step-1` })
    const step = JSON.parse(stepRes.payload).step
    expect(step.subGraphRef).toBeUndefined()
    await tapp.close()
    void v2
  })
})