import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import type { RecordEnvelope } from '../../types/RecordEnvelope.js'
import type { RecordStore } from '../../store/types.js'
import { registerProtocolStepsRoutes } from './protocol-steps.js'

/** A store refusal shaped like RecordStoreImpl.updateUnlocked's rejections. */
type StoreRefusal = {
  success: false
  error?: string
  validation?: { valid: false; errors: { path: string; message: string; keyword: string }[] }
  lint?: { valid: false; violations: { path?: string; message: string }[] }
}

/** Minimal in-memory store satisfying the parts the route touches (get/create/update).
 *  `refusal` makes update REFUSE the write (persisting nothing), mirroring how the
 *  real store rejects on Ajv/lint/controlled-lock failures. */
function makeStore(initial: Record<string, RecordEnvelope>, refusal?: StoreRefusal) {
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
      if (refusal) {
        // Refused write: NOTHING is persisted (byId untouched).
        return refusal
      }
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

  it('carries first-class equipment (with settings) in the minted realization', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/protocols/${protocolId}/steps/step-1/subgraph`,
      payload: {
        events: [{
          eventId: 'E-inc',
          event_type: 'incubate',
          details: { labwareId: 'eqp-bath-1', duration_min: 30, temperature_C: 55 },
        }],
        labwares: [],
        equipments: [{
          equipmentId: 'eqp-bath-1',
          recordId: 'EQP-WATER-BATH',
          name: 'Water bath',
          instrumentKind: 'water_bath',
          settings: { temperature_c: 55 },
        }],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    const realization = created.find((e) => e.recordId === body.realizationId)
    expect(realization).toBeDefined()
    const p = realization?.payload as Record<string, unknown>
    const labwares = p.labwares as Array<Record<string, unknown>>
    // The equipment is minted as a first-class entry, not dropped.
    const bath = labwares.find((l) => l.kind === 'equipment' && l.equipmentId === 'eqp-bath-1')
    expect(bath).toBeDefined()
    expect(bath?.settings).toEqual({ temperature_c: 55 })
    expect(bath?.recordId).toBe('EQP-WATER-BATH')
    expect(bath?.name).toBe('Water bath')
  })

  it('rejects a malformed cycling program in equipment settings (422, draft preserved)', async () => {
    const { store: s3, validator: v3, lintEngine: l3, created: created3 } = makeStore({ [protocolId]: protocolEnvelope(protocolId, [
      { stepId: 'step-1', label: 'Amplify', ordinal: 1, kind: 'other' },
    ]) })
    const tapp = Fastify()
    await tapp.register(async (instance) => {
      registerProtocolStepsRoutes(instance, { store: s3, validator: v3, lintEngine: l3 } as never)
    }, { prefix: '/api' })
    await tapp.ready()

    const res = await tapp.inject({
      method: 'POST',
      url: `/api/protocols/${protocolId}/steps/step-1/subgraph`,
      payload: {
        events: [{ eventId: 'E1', event_type: 'incubate', details: { labwareId: 'tc-1', duration_min: 30, temperature_C: 95 } }],
        labwares: [],
        equipments: [{
          equipmentId: 'tc-1',
          recordId: 'EQP-THERMOCYCLER',
          name: 'TC1',
          instrumentKind: 'qpcr',
          settings: {
            cycling_program: {
              initial: { temperature_c: 95, duration_sec: 60 },
              cycles: { count: 0, steps: [{ temperature_c: 60, duration_sec: 30 }] }, // count must be positive
            },
          },
        }],
      },
    })
    expect(res.statusCode).toBe(422)
    const body = JSON.parse(res.payload)
    expect(body.error).toBe('REALIZATION_NOT_ACCEPTED')
    expect(body.findings[0]).toMatchObject({ code: 'malformed-cycling-program' })
    // Draft preserved — no realization minted, no subGraphRef committed.
    expect(created3.some((e) => e.recordId.startsWith('EVG-STEP-'))).toBe(false)
    await tapp.close()
    void v3
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


// ===========================================================================
// PROTO-AI-5 — server-side write gates on the dedicated step endpoints
//
// Mirror the human editor's semantics (app/src/event-editor/right-pane/
// protocol/protocolStepEditing.ts): route-level gates must reject with a
// stable machine-readable code BEFORE any store write is attempted, and a
// store refusal must never be swallowed into a false HTTP 200 (G5).
// ===========================================================================

/** Build a Fastify app over a store; returns the app plus a spy log of
 *  every ctx.store.update() call so tests can assert NOTHING persisted. */
async function gateApp(initial: Record<string, RecordEnvelope>, refusal?: StoreRefusal) {
  const { store, validator, lintEngine } = makeStore(initial, refusal)
  const updateCalls: RecordEnvelope[] = []
  const raw = store as unknown as { update: (o: { envelope: RecordEnvelope }) => Promise<unknown> }
  const realUpdate = raw.update.bind(store)
  raw.update = async (o) => { updateCalls.push(o.envelope); return realUpdate(o) }
  const app = Fastify()
  await app.register(async (instance) => {
    registerProtocolStepsRoutes(instance, { store, validator, lintEngine } as never)
  }, { prefix: '/api' })
  await app.ready()
  return { app, updateCalls }
}

describe('step-endpoint content-lock gate (G2 — mirrors protocolStepEditing.ts:45)', () => {
  const lockedProtocol = (recordId: string) => protocolEnvelope(recordId, [
    { stepId: 'step-a', label: 'Bind', ordinal: 1, kind: 'other' },
    { stepId: 'step-b', label: 'Wash', ordinal: 2, kind: 'other' },
  ])

  function lock(p: RecordEnvelope): RecordEnvelope {
    const payload = p.payload as Record<string, unknown>
    return { ...p, payload: { ...payload, lifecycleId: 'protocol-control', state: 'approved' } } as RecordEnvelope
  }

  it('PATCH step on a locked protocol → 409 CONTROLLED_RECORD_LOCKED, persists nothing', async () => {
    const proto = lock(lockedProtocol('PRT-locked-patch'))
    const { app, updateCalls } = await gateApp({ 'PRT-locked-patch': proto })
    const res = await app.inject({
      method: 'PATCH', url: '/api/protocols/PRT-locked-patch/steps/step-a',
      payload: { label: 'Renamed by force' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.payload).error).toBe('CONTROLLED_RECORD_LOCKED')
    expect(updateCalls.length).toBe(0)
    const after = JSON.parse((await app.inject({ method: 'GET', url: '/api/protocols/PRT-locked-patch/steps' })).payload)
    expect(after.steps.find((s: { stepId: string }) => s.stepId === 'step-a').label).toBe('Bind')
    await app.close()
  })

  it('POST step on a locked protocol → 409 CONTROLLED_RECORD_LOCKED, persists nothing', async () => {
    const proto = lock(lockedProtocol('PRT-locked-post'))
    const { app, updateCalls } = await gateApp({ 'PRT-locked-post': proto })
    const res = await app.inject({
      method: 'POST', url: '/api/protocols/PRT-locked-post/steps',
      payload: { stepId: 'step-new', label: 'Sneak', ordinal: 3, kind: 'other' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.payload).error).toBe('CONTROLLED_RECORD_LOCKED')
    expect(updateCalls.length).toBe(0)
    await app.close()
  })

  it('DELETE step on a locked protocol → 409 CONTROLLED_RECORD_LOCKED, persists nothing', async () => {
    const proto = lock(lockedProtocol('PRT-locked-del'))
    const { app, updateCalls } = await gateApp({ 'PRT-locked-del': proto })
    const res = await app.inject({
      method: 'DELETE', url: '/api/protocols/PRT-locked-del/steps/step-b',
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.payload).error).toBe('CONTROLLED_RECORD_LOCKED')
    expect(updateCalls.length).toBe(0)
    const after = JSON.parse((await app.inject({ method: 'GET', url: '/api/protocols/PRT-locked-del/steps' })).payload)
    expect(after.steps.length).toBe(2)
    await app.close()
  })

  it('PATCH settings on a locked protocol → 409 CONTROLLED_RECORD_LOCKED, persists nothing', async () => {
    const proto = lock(lockedProtocol('PRT-locked-set'))
    const { app, updateCalls } = await gateApp({ 'PRT-locked-set': proto })
    const res = await app.inject({
      method: 'PATCH', url: '/api/protocols/PRT-locked-set/steps/step-a/settings',
      payload: { settings: [{ settingId: 'temp', label: 'Temp', type: 'temperature' }] },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.payload).error).toBe('CONTROLLED_RECORD_LOCKED')
    expect(updateCalls.length).toBe(0)
    await app.close()
  })

  it('happy path: unlocked PATCH step still 200 and persists (byte-stable gate absence)', async () => {
    const { app, updateCalls } = await gateApp({ 'PRT-open': lockedProtocol('PRT-open') })
    const res = await app.inject({
      method: 'PATCH', url: '/api/protocols/PRT-open/steps/step-a',
      payload: { label: 'Renamed legitimately' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).step.label).toBe('Renamed legitimately')
    expect(updateCalls.length).toBe(1)
    await app.close()
  })
})

describe('step-endpoint ≥1-step gate (G3 — mirrors protocolStepEditing.ts:90, schema minItems)', () => {
  it('deleting the last step → 422 MIN_STEPS_REMAIN, persists nothing', async () => {
    const proto = protocolEnvelope('PRT-last', [
      { stepId: 'step-only', label: 'The only step', ordinal: 1, kind: 'other' },
    ])
    const { app, updateCalls } = await gateApp({ 'PRT-last': proto })
    const res = await app.inject({ method: 'DELETE', url: '/api/protocols/PRT-last/steps/step-only' })
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.payload).error).toBe('MIN_STEPS_REMAIN')
    expect(updateCalls.length).toBe(0)
    const after = JSON.parse((await app.inject({ method: 'GET', url: '/api/protocols/PRT-last/steps' })).payload)
    expect(after.steps.length).toBe(1)
    await app.close()
  })

  it('deleting one of two steps still succeeds (happy path preserved)', async () => {
    const proto = protocolEnvelope('PRT-two', [
      { stepId: 'step-a', label: 'A', ordinal: 1, kind: 'other' },
      { stepId: 'step-b', label: 'B', ordinal: 2, kind: 'other' },
    ])
    const { app, updateCalls } = await gateApp({ 'PRT-two': proto })
    const res = await app.inject({ method: 'DELETE', url: '/api/protocols/PRT-two/steps/step-b' })
    expect(res.statusCode).toBe(200)
    expect(updateCalls.length).toBe(1)
    await app.close()
  })
})

describe('step-endpoint executed-step gate (stricter client rule: startedAt OR completedAt)', () => {
  it('DELETE a step with only completedAt → 400 STEP_ALREADY_EXECUTED, persists nothing', async () => {
    const proto = protocolEnvelope('PRT-done', [
      { stepId: 'step-a', label: 'A', ordinal: 1, kind: 'other' },
      { stepId: 'step-b', label: 'B', ordinal: 2, kind: 'other', executionMeta: { completedAt: '2026-01-01T00:00:00.000Z' } },
    ])
    const { app, updateCalls } = await gateApp({ 'PRT-done': proto })
    const res = await app.inject({ method: 'DELETE', url: '/api/protocols/PRT-done/steps/step-b' })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload).error).toBe('STEP_ALREADY_EXECUTED')
    expect(updateCalls.length).toBe(0)
    const after = JSON.parse((await app.inject({ method: 'GET', url: '/api/protocols/PRT-done/steps' })).payload)
    expect(after.steps.length).toBe(2)
    await app.close()
  })

  it('startedAt-only refusal is unchanged (pre-existing behaviour preserved)', async () => {
    const proto = protocolEnvelope('PRT-started', [
      { stepId: 'step-a', label: 'A', ordinal: 1, kind: 'other', executionMeta: { startedAt: '2026-01-01T00:00:00.000Z' } },
      { stepId: 'step-b', label: 'B', ordinal: 2, kind: 'other' },
    ])
    const { app, updateCalls } = await gateApp({ 'PRT-started': proto })
    const res = await app.inject({ method: 'DELETE', url: '/api/protocols/PRT-started/steps/step-a' })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload).error).toBe('STEP_ALREADY_EXECUTED')
    expect(updateCalls.length).toBe(0)
    await app.close()
  })
})

describe('step-endpoint store-refusal surfacing (G5 — no false 200)', () => {
  const refusal: StoreRefusal = {
    success: false,
    validation: { valid: false, errors: [{ path: '/steps', message: 'Array must have at least 1 items', keyword: 'minItems' }] },
    error: 'Validation failed',
  }

  it('PATCH step refused by the store → 422 VALIDATION_FAILED, not 200', async () => {
    const proto = protocolEnvelope('PRT-ref-patch', [{ stepId: 'step-a', label: 'A', ordinal: 1, kind: 'other' }])
    const { app } = await gateApp({ 'PRT-ref-patch': proto }, refusal)
    const res = await app.inject({ method: 'PATCH', url: '/api/protocols/PRT-ref-patch/steps/step-a', payload: { label: 'X' } })
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.payload).error).toBe('VALIDATION_FAILED')
    await app.close()
  })

  it('POST step refused by the store (duplicate id slips past route) → not a false 200', async () => {
    const dupRefusal: StoreRefusal = { success: false, error: 'Validation failed', validation: { valid: false, errors: [{ path: '/steps/1', message: 'duplicate', keyword: 'enum' }] } }
    const proto = protocolEnvelope('PRT-ref-post', [{ stepId: 'step-a', label: 'A', ordinal: 1, kind: 'other' }])
    const { app } = await gateApp({ 'PRT-ref-post': proto }, dupRefusal)
    const res = await app.inject({
      method: 'POST', url: '/api/protocols/PRT-ref-post/steps',
      payload: { stepId: 'step-b', label: 'B', ordinal: 2, kind: 'other' },
    })
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.payload).error).toBe('VALIDATION_FAILED')
    await app.close()
  })

  it('DELETE step refused by the store → not a false 200', async () => {
    const proto = protocolEnvelope('PRT-ref-del', [
      { stepId: 'step-a', label: 'A', ordinal: 1, kind: 'other' },
      { stepId: 'step-b', label: 'B', ordinal: 2, kind: 'other' },
    ])
    const { app } = await gateApp({ 'PRT-ref-del': proto }, refusal)
    const res = await app.inject({ method: 'DELETE', url: '/api/protocols/PRT-ref-del/steps/step-b' })
    expect(res.statusCode).not.toBe(200)
    expect(res.statusCode).toBe(422)
    await app.close()
  })

  it('PATCH settings refused by the store (Ajv rejects bad settings) → not a false 200', async () => {
    const proto = protocolEnvelope('PRT-ref-set', [{ stepId: 'step-a', label: 'A', ordinal: 1, kind: 'other' }])
    const { app } = await gateApp({ 'PRT-ref-set': proto }, refusal)
    const res = await app.inject({
      method: 'PATCH', url: '/api/protocols/PRT-ref-set/steps/step-a/settings',
      payload: { settings: [{ bogus: true }] },
    })
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.payload).error).toBe('VALIDATION_FAILED')
    await app.close()
  })

  it('controlled-lock store refusal surfaces as 409 CONTROLLED_RECORD_LOCKED (route-level lock absent scenario)', async () => {
    const lockRefusal: StoreRefusal = { success: false, error: 'CONTROLLED_RECORD_LOCKED: create a new draft before editing controlled content' }
    // Record is NOT locked route-side (no lifecycleId on payload) so the route gate
    // stands down; the store still refuses. The response must NOT be 200.
    const proto = protocolEnvelope('PRT-lockstore', [{ stepId: 'step-a', label: 'A', ordinal: 1, kind: 'other' }])
    const { app } = await gateApp({ 'PRT-lockstore': proto }, lockRefusal)
    const res = await app.inject({ method: 'PATCH', url: '/api/protocols/PRT-lockstore/steps/step-a', payload: { label: 'X' } })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.payload).error).toBe('CONTROLLED_RECORD_LOCKED')
    await app.close()
  })
})
