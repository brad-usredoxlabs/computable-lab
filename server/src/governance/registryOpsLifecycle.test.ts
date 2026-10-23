/**
 * QMS7-3 — minimal operational lifecycle + data-declared kind coverage (D3 groundwork).
 *
 * RED-FIRST suite (spec 2026-10-16_QMS7-3-lifecycle-coverage-spec.md, §RED-first).
 * Harness mirrors denialMessageBoundary.test.ts / governanceStrictness.test.ts:
 * fake Map store + REAL LifecycleEngine loaded from schema/core/lifecycles +
 * REAL schema pipeline (loader/registry/Ajv) + REAL createRecordHandlers, with
 * the coverage accessor backed by the REAL schema/registry/registry-kinds.registry.yaml.
 *
 * The fake store validates on create/update through the real validator, so the
 * unevaluatedProperties landmine bites through the handler exactly as it does
 * in the real store: a stamped payload is only accepted once the per-schema
 * lifecycleId/state enum declarations exist (the pinned fix — never a relaxed
 * unevaluatedProperties).
 *
 * OQ1 ruling: the live-gate role grant is orchestrator-authored lane DATA
 * post-merge; this suite injects its registry-ops grants via the harness store.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { parse as parseYaml } from 'yaml'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { RecordEnvelope, RecordFilter, RecordStore, StoreResult } from '../store/types.js'
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js'
import { PolicyBundleService } from '../policy/PolicyBundleService.js'
import { RoleResolver } from '../security/RoleResolver.js'
import { LocalIdentityService } from '../security/LocalIdentityService.js'
import { AuditEventService } from '../governance/AuditEventService.js'
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js'
import { loadAllSchemas } from '../schema/SchemaLoader.js'
import { createSchemaRegistry } from '../schema/SchemaRegistry.js'
import { createValidator } from '../validation/AjvValidator.js'
import { loadKindLifecycleRegistry, type KindLifecycleRegistry } from '../registry/KindLifecycleRegistry.js'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = join(here, '../../../schema')
const LIFECYCLES_DIR = join(SCHEMA_DIR, 'core/lifecycles')
const BUNDLES_DIR = join(SCHEMA_DIR, 'core/policy-bundles')
const COVERAGE_FILE = join(SCHEMA_DIR, 'registry/registry-kinds.registry.yaml')
const TMP_DIR = join(here, '../../tmp/qms73-loader-fixtures')

const SID = (name: string) => `https://computable-lab.com/schema/computable-lab/${name}`

/**
 * The plain lab-registry kinds covered by the coverage file.
 * INSTR-COLLAPSE-2 C3: 7 → 6. The older orchestrator ruling "OQ3: KEEP AT 7"
 * is SUPERSEDED for this kind by the collapse ruling (Brad 2026-10-21T19:15):
 * the `instrument` kind is deleted, so its coverage entry retires with it.
 */
const COVERED_KINDS = [
  'calibration-record',
  'competency-authorization',
  'equipment',
  'equipment-class',
  'person',
  'training-record',
]

// ---------------------------------------------------------------------------
// Real schema pipeline (same pattern as ControlledDocumentSchemas.test.ts):
// the fake store validates through this, so schema landmines bite for real.
// ---------------------------------------------------------------------------

let validator: ReturnType<typeof createValidator>
let knownKinds: Set<string>

beforeAll(async () => {
  const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true })
  const registry = createSchemaRegistry()
  registry.addSchemas(loaded.entries)
  validator = createValidator()
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id)
    if (entry) validator.addSchema(entry.schema as never, id)
  }
  // Kind names come from the declared `const` in each schema's properties —
  // the same data-derived knownKinds set server.ts wiring builds.
  knownKinds = new Set<string>()
  for (const entry of registry.getAll()) {
    const kindConst = (entry.schema as { properties?: { kind?: { const?: unknown } } }).properties?.kind?.const
    if (typeof kindConst === 'string') knownKinds.add(kindConst)
  }
})

function loadEngine(): LifecycleEngine {
  const engine = new LifecycleEngine()
  const count = loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
  expect(count).toBeGreaterThanOrEqual(2)
  expect(engine.isLoaded('document-control')).toBe(true)
  return engine
}

function loadCoverage(engine: LifecycleEngine): KindLifecycleRegistry {
  return loadKindLifecycleRegistry(COVERAGE_FILE, { lifecycle: engine, knownKinds })
}

// ---------------------------------------------------------------------------
// Fake store: Map-backed, but create/update run the REAL validator against the
// envelope's schemaId — mirroring RecordStoreImpl.createUnlocked's validation.
// ---------------------------------------------------------------------------

interface FakeStore {
  store: RecordStore
  records: Map<string, RecordEnvelope>
  seed(envelope: RecordEnvelope): void
}

function makeFakeStore(): FakeStore {
  const records = new Map<string, RecordEnvelope>()

  const validateEnvelope = (envelope: RecordEnvelope) => {
    if (!validator.hasSchema(envelope.schemaId)) {
      return { valid: false, errors: [{ path: '/', message: `Schema not found: ${envelope.schemaId}`, keyword: 'schema' as const }] }
    }
    return validator.validate(envelope.payload, envelope.schemaId)
  }

  const create = vi.fn(async (options: { envelope: RecordEnvelope }): Promise<StoreResult> => {
    if (records.has(options.envelope.recordId)) {
      return { success: false, error: `Record already exists: ${options.envelope.recordId}` }
    }
    const validation = validateEnvelope(options.envelope)
    if (!validation.valid) {
      return { success: false, validation, error: 'Validation failed' }
    }
    records.set(options.envelope.recordId, options.envelope)
    return { success: true, envelope: options.envelope }
  })
  const update = vi.fn(async (options: { envelope: RecordEnvelope }): Promise<StoreResult> => {
    const validation = validateEnvelope(options.envelope)
    if (!validation.valid) {
      return { success: false, validation, error: 'Validation failed' }
    }
    records.set(options.envelope.recordId, options.envelope)
    return {
      success: true,
      envelope: options.envelope,
      commit: { sha: 'abc1234', message: 'test update', timestamp: new Date().toISOString() },
    }
  })
  const list = vi.fn(async (filter?: RecordFilter) => {
    const all = [...records.values()]
    if (filter?.kind) {
      return all.filter(r => (r.payload as Record<string, unknown>)?.kind === filter.kind)
    }
    return all
  })

  const store = {
    get: vi.fn(async (id: string) => records.get(id) ?? null),
    getByPath: vi.fn(async () => null),
    getWithValidation: vi.fn(async () => ({ success: true })),
    list,
    create,
    update,
    delete: vi.fn(async (): Promise<StoreResult> => ({ success: true })),
    validate: vi.fn(async (envelope: RecordEnvelope) => validateEnvelope(envelope)),
    lint: vi.fn(async () => ({ valid: true })),
    exists: vi.fn(async () => false),
  } as unknown as RecordStore

  return {
    store,
    records,
    seed(envelope: RecordEnvelope) {
      records.set(envelope.recordId, envelope)
    },
  }
}

function envelope(recordId: string, payload: Record<string, unknown>, schemaId: string): RecordEnvelope {
  return {
    recordId,
    schemaId,
    payload: { recordId, ...payload },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-REGOPS' },
  } as unknown as RecordEnvelope
}

function seedUser(fake: FakeStore, userId: string): void {
  fake.seed(envelope(userId, {
    kind: 'user',
    recordId: userId,
    username: userId.toLowerCase(),
    displayName: userId,
    email: `${userId.toLowerCase()}@example.com`,
    status: 'active',
  }, SID('user.schema.yaml')))
}

/** Harness-side registry-ops grant (OQ1: the lane-data grant is orchestrator-authored
 *  post-merge; here the harness store injects the equivalent grant). */
function seedRegistryOpsGrant(fake: FakeStore, userId: string, roles: string[], recordId: string): void {
  fake.seed(envelope(recordId, {
    kind: 'role-grant',
    recordId,
    userId,
    lifecycleId: 'registry-ops',
    roles,
  }, SID('role-grant.schema.yaml')))
}

// ---------------------------------------------------------------------------
// Handler world: wired like server.ts (POL-REGULATED deny from the real
// bundles dir) + the coverage accessor backed by the REAL coverage YAML.
// ---------------------------------------------------------------------------

interface World {
  fake: FakeStore
  engine: LifecycleEngine
  coverage: KindLifecycleRegistry
  handlers: ReturnType<typeof createRecordHandlers>
}

function makeWorld(): World {
  const fake = makeFakeStore()
  seedUser(fake, 'USR-REGOPS')
  seedUser(fake, 'USR-AUTHORONLY')
  seedRegistryOpsGrant(fake, 'USR-REGOPS', ['author', 'approver'], 'GRANT-QMS7-REGOPS-HARNESS')
  seedRegistryOpsGrant(fake, 'USR-AUTHORONLY', ['author'], 'GRANT-QMS7-AUTHOR-HARNESS')

  const engine = loadEngine()
  const coverage = loadCoverage(engine)

  const policy = new PolicyBundleService()
  expect(policy.loadFromDir(BUNDLES_DIR)).toBeGreaterThanOrEqual(2)
  expect(policy.resolveSettings('POL-REGULATED').enforceTransitionRoles).toBe('deny')

  const handlers = createRecordHandlers(
    fake.store,
    undefined,
    undefined,
    undefined,
    engine,
    undefined,
    {
      identityService: new LocalIdentityService(fake.store),
      roleResolver: new RoleResolver(fake.store),
      auditService: new AuditEventService(fake.store),
      getPolicySettings: () => ({ enforceTransitionRoles: policy.resolveSettings('POL-REGULATED').enforceTransitionRoles }),
      getAppendOnlyKinds: () => ['audit-event', 'signature'],
      getKindLifecycleCoverage: () => coverage,
    },
  )
  return { fake, engine, coverage, handlers }
}

function makeReply() {
  let statusValue = 200
  const reply = {
    status: (code: number) => { statusValue = code; return reply },
    send: (body: unknown) => { void body; return reply },
  }
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue })
  return reply as unknown as FastifyReply & { statusValue: number }
}

async function callCreate(world: World, schemaId: string, payload: Record<string, unknown>, userId: string) {
  const request = {
    body: { schemaId, payload },
    headers: { 'x-user-id': userId },
  } as unknown as FastifyRequest<{ Body: { schemaId: string; payload: Record<string, unknown> } }>
  const reply = makeReply()
  const result = await world.handlers.createRecord(request, reply)
  return { result: result as unknown as Record<string, unknown>, status: reply.statusValue }
}

async function callUpdate(world: World, id: string, payload: Record<string, unknown>, userId: string) {
  const request = {
    params: { id },
    body: { payload },
    headers: { 'x-user-id': userId },
  } as unknown as FastifyRequest<{ Params: { id: string }; Body: { payload: Record<string, unknown> } }>
  const reply = makeReply()
  const result = await world.handlers.updateRecord(request, reply)
  return { result: result as unknown as Record<string, unknown>, status: reply.statusValue }
}

function storedPayload(world: World, id: string): Record<string, unknown> {
  return world.fake.records.get(id)!.payload as Record<string, unknown>
}

const equipmentClassPayload = (id = 'EQC-QMS7TEST') => ({
  kind: 'equipment-class',
  id,
  name: 'QMS7-3 test class',
})

// ===========================================================================
// 1. Stamp-on-create (RED today)
// ===========================================================================

describe('QMS7-3 stamp-at-create: covered kinds arrive as governed drafts', () => {
  it('POST equipment-class without lifecycleId → 201 with lifecycleId registry-ops + state draft, and the stored payload validates against the REAL equipment-class schema', async () => {
    const world = makeWorld()
    const created = await callCreate(world, SID('equipment-class.schema.yaml'), equipmentClassPayload(), 'USR-REGOPS')
    expect(created.status).toBe(201)
    expect(created.result.success).toBe(true)

    const payload = storedPayload(world, 'EQC-QMS7TEST')
    expect(payload.lifecycleId).toBe('registry-ops')
    expect(payload.state).toBe('draft')

    // The unevaluatedProperties-landmine proof: the stamped payload (with the
    // handler's injected provenance) validates against the real schema.
    const check = validator.validate(payload, SID('equipment-class.schema.yaml'))
    expect(check.errors.map(e => `${e.path} ${e.message}`)).toEqual([])
    expect(check.valid).toBe(true)
  })

  it('payload-provided lifecycle mismatch: document-control on equipment-class → 422 LIFECYCLE_COVERAGE_MISMATCH', async () => {
    const world = makeWorld()
    const created = await callCreate(
      world,
      SID('equipment-class.schema.yaml'),
      { ...equipmentClassPayload('EQC-QMS7MISMATCH'), lifecycleId: 'document-control' },
      'USR-REGOPS',
    )
    expect(created.status).toBe(422)
    expect(created.result.error).toBe('LIFECYCLE_COVERAGE_MISMATCH')
    expect(world.fake.records.has('EQC-QMS7MISMATCH')).toBe(false)
  })

  it('payload-provided non-default state at create → 422 INITIAL_STATE_REQUIRED (same token+wording pattern as the controlled-document switch)', async () => {
    const world = makeWorld()
    const created = await callCreate(
      world,
      SID('equipment-class.schema.yaml'),
      { ...equipmentClassPayload('EQC-QMS7STATE'), state: 'active' },
      'USR-REGOPS',
    )
    expect(created.status).toBe(422)
    expect(created.result.error).toBe('INITIAL_STATE_REQUIRED')
    expect(String(created.result.message)).toMatch(/Create .* as draft, then use lifecycle transitions\./)
  })
})

// ===========================================================================
// 2. Governed kinds untouched
// ===========================================================================

describe('QMS7-3 governed kinds are untouched by the coverage stamp', () => {
  it('training-material create receives no stamp and its schema keeps the const document-control declaration', async () => {
    const world = makeWorld()
    const created = await callCreate(world, SID('training-material.schema.yaml'), {
      kind: 'training-material',
      id: 'TRM-QMS7TEST',
      title: 'QMS7-3 pipetting primer',
      materialType: 'sop',
    }, 'USR-REGOPS')
    expect(created.status).toBe(201)
    const payload = storedPayload(world, 'TRM-QMS7TEST')
    expect(payload.lifecycleId).toBeUndefined()
    expect(payload.state).toBeUndefined()

    const tmSchema = parseYaml(readFileSync(join(SCHEMA_DIR, 'lab/training-material.schema.yaml'), 'utf-8')) as
      { properties: { lifecycleId: { const?: string } } }
    expect(tmSchema.properties.lifecycleId.const).toBe('document-control')
  })

  it('controlled-document create as non-draft still 422 INITIAL_STATE_REQUIRED (legacy switch intact); as draft it keeps its own lifecycleId', async () => {
    const world = makeWorld()
    const bad = await callCreate(world, SID('controlled-document.schema.yaml'), {
      kind: 'controlled-document',
      id: 'DOC-QMS7BAD',
      title: 'QMS7-3 SOP',
      docType: 'sop',
      state: 'approved',
      lifecycleId: 'document-controlled-signing',
      body: '<p>Approved on arrival is not allowed.</p>',
      revision: 'Rev A',
      authorRef: { kind: 'record', type: 'user', id: 'USR-REGOPS', label: 'Reg Ops' },
    }, 'USR-REGOPS')
    expect(bad.status).toBe(422)
    expect(bad.result.error).toBe('INITIAL_STATE_REQUIRED')

    const ok = await callCreate(world, SID('controlled-document.schema.yaml'), {
      kind: 'controlled-document',
      id: 'DOC-QMS7OK',
      title: 'QMS7-3 SOP',
      docType: 'sop',
      state: 'draft',
      lifecycleId: 'document-controlled-signing',
      body: '<p>Draft as the governed lifecycle demands.</p>',
      revision: 'Rev A',
      authorRef: { kind: 'record', type: 'user', id: 'USR-REGOPS', label: 'Reg Ops' },
    }, 'USR-REGOPS')
    expect(ok.status).toBe(201)
    expect(storedPayload(world, 'DOC-QMS7OK').lifecycleId).toBe('document-controlled-signing')
  })

  it('coverage is DATA: the real coverage YAML declares exactly the 7 approved kinds', () => {
    const engine = loadEngine()
    const coverage = loadCoverage(engine)
    expect([...coverage.kinds()].sort()).toEqual(COVERED_KINDS)
    // Governed kinds are NOT listed.
    expect(coverage.entryFor('training-material')).toBeUndefined()
    expect(coverage.entryFor('controlled-document')).toBeUndefined()
    expect(coverage.entryFor('protocol')).toBeUndefined()
  })
})

// ===========================================================================
// 3. Unknown-mapping load failures (RED today — loader + file absent)
// ===========================================================================

describe('QMS7-3 coverage loader fails the load on malformed coverage', () => {
  function writeFixture(name: string, content: string): string {
    mkdirSync(TMP_DIR, { recursive: true })
    const path = join(TMP_DIR, name)
    writeFileSync(path, content, 'utf-8')
    return path
  }

  it('throws when the referenced lifecycleId is not loaded', () => {
    const engine = loadEngine()
    const path = writeFixture('unknown-lifecycle.yaml', [
      'registryVersion: 1',
      'lifecycleId: not-on-disk-lifecycle',
      'defaultState: draft',
      'kinds:',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, { lifecycle: engine, knownKinds })).toThrow(/not loaded|not on disk/i)
  })

  it('throws when defaultState is not a declared state of that lifecycle', () => {
    const engine = loadEngine()
    const path = writeFixture('bad-default-state.yaml', [
      'registryVersion: 1',
      'lifecycleId: registry-ops',
      'defaultState: published',
      'kinds:',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, { lifecycle: engine, knownKinds })).toThrow(/defaultState/i)
  })

  it('throws on an unknown kind (not a registered record kind)', () => {
    const engine = loadEngine()
    const path = writeFixture('unknown-kind.yaml', [
      'registryVersion: 1',
      'lifecycleId: registry-ops',
      'defaultState: draft',
      'kinds:',
      '  - kind: not-a-real-kind',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, { lifecycle: engine, knownKinds })).toThrow(/unknown kind/i)
  })

  it('throws on a duplicate kind entry', () => {
    const engine = loadEngine()
    const path = writeFixture('duplicate-kind.yaml', [
      'registryVersion: 1',
      'lifecycleId: registry-ops',
      'defaultState: draft',
      'kinds:',
      '  - kind: person',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, { lifecycle: engine, knownKinds })).toThrow(/[Dd]uplicate/)
  })
})

// ===========================================================================
// 4. Transitions on covered records (engine knows registry-ops from disk)
// ===========================================================================

describe('QMS7-3 transitions: declared arms bind, undeclared arms refuse, denial wording stays the engine generic', () => {
  async function createDraft(world: World, id: string) {
    const created = await callCreate(world, SID('equipment-class.schema.yaml'), equipmentClassPayload(id), 'USR-REGOPS')
    expect(created.status).toBe(201)
  }

  it('authorized author PUT draft→active succeeds under POL-REGULATED deny', async () => {
    const world = makeWorld()
    await createDraft(world, 'EQC-QMS7ACT')
    const updated = await callUpdate(world, 'EQC-QMS7ACT', {
      ...equipmentClassPayload('EQC-QMS7ACT'),
      lifecycleId: 'registry-ops',
      state: 'active',
    }, 'USR-REGOPS')
    expect(updated.status).toBe(200)
    expect(storedPayload(world, 'EQC-QMS7ACT').state).toBe('active')
  })

  it('draft→archived WITHOUT the approver role → 422 LIFECYCLE_TRANSITION_DENIED with the generic role-denial wording (boundary intact, nothing invented in TS)', async () => {
    const world = makeWorld()
    await createDraft(world, 'EQC-QMS7ARCH')
    const denied = await callUpdate(world, 'EQC-QMS7ARCH', {
      ...equipmentClassPayload('EQC-QMS7ARCH'),
      lifecycleId: 'registry-ops',
      state: 'archived',
    }, 'USR-AUTHORONLY')
    expect(denied.status).toBe(422)
    expect(denied.result.error).toBe('LIFECYCLE_TRANSITION_DENIED')
    expect(denied.result.message).toBe('You do not have the required role for this transition.')
    expect(storedPayload(world, 'EQC-QMS7ARCH').state).toBe('draft')
  })

  it('draft→archived WITH the approver role succeeds (declared [draft, active]→archived arm)', async () => {
    const world = makeWorld()
    await createDraft(world, 'EQC-QMS7ARCHOK')
    const ok = await callUpdate(world, 'EQC-QMS7ARCHOK', {
      ...equipmentClassPayload('EQC-QMS7ARCHOK'),
      lifecycleId: 'registry-ops',
      state: 'archived',
    }, 'USR-REGOPS')
    expect(ok.status).toBe(200)
    expect(storedPayload(world, 'EQC-QMS7ARCHOK').state).toBe('archived')
  })

  it('undeclared active→draft back-edge → 422 with the engine wording "not allowed by the registry-ops lifecycle"', async () => {
    const world = makeWorld()
    await createDraft(world, 'EQC-QMS7BACK')
    const act = await callUpdate(world, 'EQC-QMS7BACK', {
      ...equipmentClassPayload('EQC-QMS7BACK'),
      lifecycleId: 'registry-ops',
      state: 'active',
    }, 'USR-REGOPS')
    expect(act.status).toBe(200)
    const back = await callUpdate(world, 'EQC-QMS7BACK', {
      ...equipmentClassPayload('EQC-QMS7BACK'),
      lifecycleId: 'registry-ops',
      state: 'draft',
    }, 'USR-REGOPS')
    expect(back.status).toBe(422)
    expect(back.result.error).toBe('LIFECYCLE_TRANSITION_DENIED')
    expect(String(back.result.message)).toContain('not allowed by the registry-ops lifecycle')
    expect(storedPayload(world, 'EQC-QMS7BACK').state).toBe('active')
  })
})

// ===========================================================================
// 5. Lifecycle state ⟂ domain status
// ===========================================================================

describe('QMS7-3 lifecycle state is distinct from domain status', () => {
  it('training-record keeps status passed across draft→active→archived while state advances', async () => {
    const world = makeWorld()
    const created = await callCreate(world, SID('training-record.schema.yaml'), {
      kind: 'training-record',
      id: 'TRR-QMS7TEST',
      personRef: { kind: 'record', type: 'person', id: 'PER-QMS7PEOPLE' },
      trainingMaterialRef: { kind: 'record', type: 'training-material', id: 'TRM-QMS7TEST' },
      status: 'passed',
      completedAt: '2026-01-01T00:00:00.000Z',
    }, 'USR-REGOPS')
    expect(created.status).toBe(201)
    let payload = storedPayload(world, 'TRR-QMS7TEST')
    expect(payload.state).toBe('draft')
    expect(payload.lifecycleId).toBe('registry-ops')
    expect(payload.status).toBe('passed')

    const act = await callUpdate(world, 'TRR-QMS7TEST', {
      kind: 'training-record', id: 'TRR-QMS7TEST',
      personRef: { kind: 'record', type: 'person', id: 'PER-QMS7PEOPLE' },
      trainingMaterialRef: { kind: 'record', type: 'training-material', id: 'TRM-QMS7TEST' },
      status: 'passed', completedAt: '2026-01-01T00:00:00.000Z',
      lifecycleId: 'registry-ops', state: 'active',
    }, 'USR-REGOPS')
    expect(act.status).toBe(200)
    payload = storedPayload(world, 'TRR-QMS7TEST')
    expect(payload.state).toBe('active')
    expect(payload.status).toBe('passed')

    const arch = await callUpdate(world, 'TRR-QMS7TEST', {
      kind: 'training-record', id: 'TRR-QMS7TEST',
      personRef: { kind: 'record', type: 'person', id: 'PER-QMS7PEOPLE' },
      trainingMaterialRef: { kind: 'record', type: 'training-material', id: 'TRM-QMS7TEST' },
      status: 'passed', completedAt: '2026-01-01T00:00:00.000Z',
      lifecycleId: 'registry-ops', state: 'archived',
    }, 'USR-REGOPS')
    expect(arch.status).toBe(200)
    payload = storedPayload(world, 'TRR-QMS7TEST')
    expect(payload.state).toBe('archived')
    expect(payload.status).toBe('passed')
  })

  it('a lifecycle-gated denial never rewrites the domain status (calibration-record status pass survives)', async () => {
    const world = makeWorld()
    const created = await callCreate(world, SID('calibration-record.schema.yaml'), {
      kind: 'calibration-record',
      id: 'CAL-QMS7TEST',
      equipmentRef: { kind: 'record', type: 'equipment', id: 'EQP-QMS7EQUIP' },
      performedAt: '2026-01-01T00:00:00.000Z',
      status: 'pass',
    }, 'USR-REGOPS')
    expect(created.status).toBe(201)
    expect(storedPayload(world, 'CAL-QMS7TEST').state).toBe('draft')
    expect(storedPayload(world, 'CAL-QMS7TEST').status).toBe('pass')

    const denied = await callUpdate(world, 'CAL-QMS7TEST', {
      kind: 'calibration-record', id: 'CAL-QMS7TEST',
      equipmentRef: { kind: 'record', type: 'equipment', id: 'EQP-QMS7EQUIP' },
      performedAt: '2026-01-01T00:00:00.000Z',
      status: 'pass',
      lifecycleId: 'registry-ops', state: 'archived',
    }, 'USR-AUTHORONLY')
    expect(denied.status).toBe(422)
    expect(denied.result.error).toBe('LIFECYCLE_TRANSITION_DENIED')
    const payload = storedPayload(world, 'CAL-QMS7TEST')
    expect(payload.state).toBe('draft')
    expect(payload.status).toBe('pass')
  })
})

// ===========================================================================
// 6. Schema-shape guards (anti-"fix" fence + cross-file drift pin)
// ===========================================================================

describe('QMS7-3 schema-shape guards', () => {
  it('equipment-class keeps top-level unevaluatedProperties:false (the forbidden "fix" stays forbidden)', () => {
    const eqc = parseYaml(readFileSync(join(SCHEMA_DIR, 'lab/equipment-class.schema.yaml'), 'utf-8')) as
      { unevaluatedProperties?: boolean; additionalProperties?: boolean }
    expect(eqc.unevaluatedProperties).toBe(false)
    expect(eqc.additionalProperties).toBeUndefined()
  })

  it('the 7 pinned lifecycleId/state enums match the registry-ops lifecycle YAML states (three-copies-of-one-fact pin)', () => {
    const lifecycle = parseYaml(readFileSync(join(LIFECYCLES_DIR, 'registry-ops.lifecycle.yaml'), 'utf-8')) as
      { id: string; states: Array<{ id: string; initial?: boolean }> }
    const stateIds = lifecycle.states.map(s => s.id)
    expect(lifecycle.id).toBe('registry-ops')

    const coverage = parseYaml(readFileSync(COVERAGE_FILE, 'utf-8')) as
      { lifecycleId: string; defaultState: string }
    expect(coverage.lifecycleId).toBe('registry-ops')
    expect(stateIds).toContain(coverage.defaultState)
    expect(lifecycle.states.find(s => s.initial)?.id).toBe(coverage.defaultState)

    for (const kind of COVERED_KINDS) {
      const schema = parseYaml(readFileSync(join(SCHEMA_DIR, `lab/${kind}.schema.yaml`), 'utf-8')) as
        { properties: { lifecycleId?: { enum?: string[] }; state?: { enum?: string[] } } }
      expect(schema.properties.lifecycleId?.enum, `${kind} lifecycleId enum`).toEqual(['registry-ops'])
      expect(schema.properties.state?.enum, `${kind} state enum`).toEqual(stateIds)
    }
  })

  it('registry-ops.lifecycle.yaml validates against lifecycle.meta.schema.yaml via the real Ajv validator', () => {
    const meta = parseYaml(readFileSync(join(SCHEMA_DIR, 'core/lifecycle.meta.schema.yaml'), 'utf-8'))
    const lifecycle = parseYaml(readFileSync(join(LIFECYCLES_DIR, 'registry-ops.lifecycle.yaml'), 'utf-8'))
    // Fresh AjvValidator instance: the meta-schema is already registered in the
    // shared pipeline validator under its $id (validateWithSchema would collide).
    const metaValidator = createValidator()
    const result = metaValidator.validateWithSchema(lifecycle, meta)
    expect(result.errors.map(e => `${e.path} ${e.message}`)).toEqual([])
    expect(result.valid).toBe(true)
  })
})

// ===========================================================================
// 7. instrument special case — RETIRED with the kind (INSTR-COLLAPSE-2 C3).
//    This block certified a PRE-EXISTING provenance-injection defect on
//    instrument CREATE. The kind is deleted (Brad 2026-10-21T19:15 ruling;
//    schema/lab/instrument.* deleted, registry-kinds entry removed), so the
//    defect it certifies can no longer occur: there is no instrument create.
//    Retirement note per the task block — the pins are retired WITH the kind,
//    not weakened. The defect class itself (create-handler provenance
//    injection into a schema that declares no provenance properties) remains
//    a live concern for any other kind; it is NOT fixed here and NOT fixed by
//    this retirement.
// ===========================================================================
