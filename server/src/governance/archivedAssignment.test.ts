/**
 * QMS7-4 V4/V5/V6/V7 — ruling-B archive semantics at the two write gates.
 *
 * RED-first suite (spec 2026-10-16_QMS7-4-migration-archive-spec.md §3),
 * harness pattern from denialMessageBoundary.test.ts / registryOpsLifecycle.test.ts:
 * fake Map store + REAL LifecycleEngine from schema/core/lifecycles + REAL
 * coverage accessor backed by the REAL registry-kinds.registry.yaml + REAL
 * createRecordHandlers.
 *
 * Ruling B (Brad): archived = usability-off, NOT erasure.
 * - a NEW operational assignment to a terminal-state covered record is 422
 *   ARCHIVED_TARGET_ASSIGNMENT at create AND on update (newly-changed refs only);
 * - every historical reference keeps resolving: GET/list/existing-ref edits pass;
 * - exemptKinds (audit-event, signature, record-revision) create freely;
 * - the guard is scoped to COVERED kinds' terminal states: a document-control
 *   archived target is NOT guard-rejected (V7 coverage scope);
 * - the pre-existing content-lock walls stay intact (pinned, not re-plumbed):
 *   archived content edit -> 409 CONTROLLED_RECORD_LOCKED at the handler AND
 *   at the direct store leg; a content edit smuggled inside a transition PUT
 *   on a locked record -> 409 too.
 *
 * Terminal-ness comes from the lifecycle YAML via the ONE new engine getter;
 * exemptKinds come from the coverage file's archiveGuard block. No state/kind
 * string literals in the new business logic (bait #3), no guarded reads
 * (bait #6), update leg fires only on NEWLY changed refs (bait #7).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { RecordEnvelope, RecordFilter, RecordStore, StoreResult } from '../store/types.js'
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js'
import type { LifecycleSpec } from '../lifecycle/types.js'
import { RoleResolver } from '../security/RoleResolver.js'
import { LocalIdentityService } from '../security/LocalIdentityService.js'
import { AuditEventService } from '../governance/AuditEventService.js'
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js'
import { loadAllSchemas } from '../schema/SchemaLoader.js'
import { createSchemaRegistry } from '../schema/SchemaRegistry.js'
import { createValidator } from '../validation/AjvValidator.js'
import { loadKindLifecycleRegistry, type KindLifecycleRegistry } from '../registry/KindLifecycleRegistry.js'
import { createRecordStore } from '../store/RecordStoreImpl.js'
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js'
import { LintEngine } from '../lint/LintEngine.js'
import { controlledContent } from '../revisions/RecordRevisionService.js'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = join(here, '../../../schema')
const LIFECYCLES_DIR = join(SCHEMA_DIR, 'core/lifecycles')
const COVERAGE_FILE = join(SCHEMA_DIR, 'registry', 'registry-kinds.registry.yaml')

const SID = (name: string) => `https://computable-lab.com/schema/computable-lab/${name}`

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
  knownKinds = new Set<string>()
  for (const entry of registry.getAll()) {
    const kindConst = (entry.schema as { properties?: { kind?: { const?: unknown } } }).properties?.kind?.const
    if (typeof kindConst === 'string') knownKinds.add(kindConst)
  }
})

function loadCoverage(engine: LifecycleEngine): KindLifecycleRegistry {
  return loadKindLifecycleRegistry(COVERAGE_FILE, { lifecycle: engine, knownKinds })
}

function makeFakeStore() {
  const records = new Map<string, RecordEnvelope>()
  const validateEnvelope = (envelope: RecordEnvelope) => {
    if (!validator.hasSchema(envelope.schemaId)) {
      return { valid: false, errors: [{ path: '/', message: `Schema not found: ${envelope.schemaId}`, keyword: 'schema' as const }] }
    }
    return validator.validate(envelope.payload, envelope.schemaId)
  }
  const store = {
    get: vi.fn(async (id: string) => records.get(id) ?? null),
    getByPath: vi.fn(async () => null),
    getWithValidation: vi.fn(async () => ({ success: true })),
    list: vi.fn(async (filter?: RecordFilter) => {
      const all = [...records.values()]
      if (filter?.kind) return all.filter(r => (r.payload as Record<string, unknown>)?.kind === filter.kind)
      return all
    }),
    create: vi.fn(async (options: { envelope: RecordEnvelope }): Promise<StoreResult> => {
      if (records.has(options.envelope.recordId)) return { success: false, error: 'already exists' }
      const validation = validateEnvelope(options.envelope)
      if (!validation.valid) return { success: false, validation, error: 'Validation failed' }
      records.set(options.envelope.recordId, options.envelope)
      return { success: true, envelope: options.envelope }
    }),
    update: vi.fn(async (options: { envelope: RecordEnvelope }): Promise<StoreResult> => {
      const validation = validateEnvelope(options.envelope)
      if (!validation.valid) return { success: false, validation, error: 'Validation failed' }
      records.set(options.envelope.recordId, options.envelope)
      return { success: true, envelope: options.envelope, commit: { sha: 'abc1234', message: 'test update', timestamp: new Date().toISOString() } }
    }),
    delete: vi.fn(async (): Promise<StoreResult> => ({ success: true })),
    validate: vi.fn(async (envelope: RecordEnvelope) => validateEnvelope(envelope)),
    lint: vi.fn(async () => ({ valid: true })),
    exists: vi.fn(async () => false),
  } as unknown as RecordStore
  return { store, records, seed: (e: RecordEnvelope) => records.set(e.recordId, e) }
}

type FakeStore = ReturnType<typeof makeFakeStore>

function envelope(recordId: string, schemaName: string, payload: Record<string, unknown>): RecordEnvelope {
  // Mirror the REAL store's canonical parse (RecordParser.ts): lab schemas use
  // unevaluatedProperties:false and declare `id` (not `recordId`), so a payload
  // that carries `id` must NOT also carry a smuggled recordId — the real parse
  // strips it. Kinds whose schema declares recordId (audit-event, role-grant)
  // name it in their payload explicitly.
  const normalized = 'id' in payload
    ? (() => { const { recordId: _r, ...rest } = payload; return rest })()
    : payload
  return {
    recordId,
    schemaId: SID(schemaName),
    payload: { ...('id' in payload ? {} : { recordId }), ...normalized },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-REGOPS' },
  } as unknown as RecordEnvelope
}

interface World {
  fake: FakeStore
  engine: LifecycleEngine
  coverage: KindLifecycleRegistry
  handlers: ReturnType<typeof createRecordHandlers>
}

function makeWorld(): World {
  const fake = makeFakeStore()
  fake.seed(envelope('USR-REGOPS', 'user.schema.yaml', {
    kind: 'user', recordId: 'USR-REGOPS', username: 'regops', status: 'active',
  }))
  fake.seed(envelope('GRANT-QMS74-HARNESS', 'role-grant.schema.yaml', {
    kind: 'role-grant', recordId: 'GRANT-QMS74-HARNESS', userId: 'USR-REGOPS',
    lifecycleId: 'registry-ops', roles: ['author', 'approver'],
  }))

  const engine = new LifecycleEngine()
  loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
  const coverage = loadCoverage(engine)

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
      getPolicySettings: () => ({ enforceTransitionRoles: 'allow' }),
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

/** Seed an ACTIVE governed equipment-class + an ECP already pointing at it. */
function seedActivePair(world: World): void {
  world.fake.seed(envelope('EQC-QMS74', 'equipment-class.schema.yaml', {
    kind: 'equipment-class', id: 'EQC-QMS74', name: 'QMS7-4 class',
    lifecycleId: 'registry-ops', state: 'active',
  }))
  world.fake.seed(envelope('ECP-QMS74', 'equipment-capability.schema.yaml', {
    kind: 'equipment-capability', id: 'ECP-QMS74', status: 'active',
    equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-QMS74' },
    capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-READ' } }],
  }))
}

/** Move the class to its terminal state directly in the store (the transition
 *  itself is QMS7-3 territory; here we pin the guard BEHAVIOR at the gates). */
function archiveClass(world: World): void {
  const eqc = world.fake.records.get('EQC-QMS74')!
  world.fake.records.set('EQC-QMS74', {
    ...eqc,
    payload: { ...(eqc.payload as Record<string, unknown>), state: 'archived' },
  })
}

const newEcpPayload = (id: string) => ({
  kind: 'equipment-capability',
  id,
  status: 'active',
  equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-QMS74' },
  capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-READ' } }],
})

// ===========================================================================
// V4 — create gate
// ===========================================================================

describe('archive guard: create gate (V4)', () => {
  it('NEW ECP pointing at an archived covered class → 422 ARCHIVED_TARGET_ASSIGNMENT, no residue', async () => {
    const world = makeWorld()
    seedActivePair(world)
    archiveClass(world)

    const created = await callCreate(world, SID('equipment-capability.schema.yaml'), newEcpPayload('ECP-NEW1'), 'USR-REGOPS')
    expect(created.status).toBe(422)
    expect(created.result.error).toBe('ARCHIVED_TARGET_ASSIGNMENT')
    expect(String(created.result.message)).toContain('EQC-QMS74')
    expect(String(created.result.message)).toContain('registry-ops')
    // Rejected before anything durable: no residue in the store.
    expect(world.fake.records.has('ECP-NEW1')).toBe(false)
  })

  it('same target while ACTIVE → create passes (guard fires on terminal-ness only)', async () => {
    const world = makeWorld()
    seedActivePair(world)
    const created = await callCreate(world, SID('equipment-capability.schema.yaml'), newEcpPayload('ECP-NEW2'), 'USR-REGOPS')
    expect(created.status).toBe(201)
  })

  it('exemptKinds from the archiveGuard data block create freely against an archived target', async () => {
    const world = makeWorld()
    seedActivePair(world)
    archiveClass(world)
    // audit-event is exempt per the YAML block: an evidence event about the
    // archived record is not an operational assignment. The payload carries a
    // REAL ref object at the archived target so the exemption is genuinely
    // exercised (without it the guard would pass for the wrong reason).
    const created = await callCreate(world, SID('audit-event.schema.yaml'), {
      kind: 'audit-event',
      recordId: 'EVT-QMS74',
      actor: 'USR-REGOPS',
      action: 'record_archived',
      subjectType: 'equipment-class',
      subjectId: 'EQC-QMS74',
      occurredAt: '2026-01-01T00:00:00.000Z',
      data: { targetRef: { kind: 'record', type: 'equipment-class', id: 'EQC-QMS74' } },
    }, 'USR-REGOPS')
    expect(created.status).toBe(201)
  })

  it('guard is scoped to COVERED kinds: a document-control archived target is NOT guard-rejected (V7)', async () => {
    const world = makeWorld()
    // training-material is governed by document-control and is NOT in the
    // coverage data; a covered kind (training-record) may still point at it
    // even while archived — the guard surface is the coverage data only.
    world.fake.seed(envelope('TRM-QMS74', 'training-material.schema.yaml', {
      kind: 'training-material', id: 'TRM-QMS74', title: 'Archived SOP',
      materialType: 'sop', lifecycleId: 'document-control', state: 'archived',
    }))
    world.fake.seed(envelope('PER-QMS74', 'person.schema.yaml', {
      kind: 'person', id: 'PER-QMS74', displayName: 'Trainee', status: 'active',
      lifecycleId: 'registry-ops', state: 'active',
    }))
    const created = await callCreate(world, SID('training-record.schema.yaml'), {
      kind: 'training-record',
      id: 'TRR-QMS74',
      personRef: { kind: 'record', type: 'person', id: 'PER-QMS74' },
      trainingMaterialRef: { kind: 'record', type: 'training-material', id: 'TRM-QMS74' },
      status: 'completed',
      completedAt: '2026-01-01T00:00:00.000Z',
    }, 'USR-REGOPS')
    expect(created.status).toBe(201)
  })

  it('absent guard wiring → no archive guard (existing paths byte-identical)', async () => {
    // A world whose coverage accessor returns undefined behaves exactly like
    // the pre-QMS7-4 handler: the archived target is accepted.
    const fake = makeFakeStore()
    fake.seed(envelope('USR-REGOPS', 'user.schema.yaml', { kind: 'user', recordId: 'USR-REGOPS', username: 'regops', status: 'active' }))
    fake.seed(envelope('EQC-QMS74', 'equipment-class.schema.yaml', {
      kind: 'equipment-class', id: 'EQC-QMS74', name: 'QMS7-4 class', lifecycleId: 'registry-ops', state: 'archived',
    }))
    const engine = new LifecycleEngine()
    loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
    const handlers = createRecordHandlers(fake.store, undefined, undefined, undefined, engine, undefined, {
      identityService: new LocalIdentityService(fake.store),
      roleResolver: new RoleResolver(fake.store),
      auditService: new AuditEventService(fake.store),
      getPolicySettings: () => ({ enforceTransitionRoles: 'allow' }),
      getAppendOnlyKinds: () => ['audit-event', 'signature'],
      getKindLifecycleCoverage: () => undefined,
    })
    const request = {
      body: { schemaId: SID('equipment-capability.schema.yaml'), payload: newEcpPayload('ECP-NOGUARD') },
      headers: { 'x-user-id': 'USR-REGOPS' },
    } as unknown as FastifyRequest<{ Body: { schemaId: string; payload: Record<string, unknown> } }>
    const reply = makeReply()
    const result = await handlers.createRecord(request, reply)
    expect(reply.statusValue).toBe(201)
    void result
  })
})

// ===========================================================================
// V4 — read paths untouched (bait #6) + update gate diff discipline (bait #7)
// ===========================================================================

describe('archive guard: reads stay open, update fires only on NEWLY changed refs (V4)', () => {
  it('GET + list + existing-ref edit all still succeed against an archived covered record (ruling B)', async () => {
    const world = makeWorld()
    seedActivePair(world)
    archiveClass(world)

    // Read paths untouched: the archived record is directly readable.
    const got = await world.fake.store.get('EQC-QMS74')
    expect(got).not.toBeNull()
    const listed = await world.fake.store.list({ kind: 'equipment-class' })
    expect(listed.map(r => r.recordId)).toContain('EQC-QMS74')

    // Editing the ECP while its existing equipmentClassRef already points at
    // the archived class stays legal — historical referenceability.
    const ecp = storedPayload(world, 'ECP-QMS74')
    const updated = await callUpdate(world, 'ECP-QMS74', { ...ecp, notes: 'edited after the class archived' }, 'USR-REGOPS')
    expect(updated.status).toBe(200)
    expect(storedPayload(world, 'ECP-QMS74').notes).toBe('edited after the class archived')
  })

  it('update that NEWLY points a ref at an archived covered record → 422 ARCHIVED_TARGET_ASSIGNMENT', async () => {
    const world = makeWorld()
    seedActivePair(world)
    world.fake.seed(envelope('EQC-QMS74B', 'equipment-class.schema.yaml', {
      kind: 'equipment-class', id: 'EQC-QMS74B', name: 'Archived twin', lifecycleId: 'registry-ops', state: 'archived',
    }))
    archiveClass(world)

    // ECP currently points at EQC-QMS74 (archived, existing — legal). Re-point
    // it at ANOTHER archived class: that ref NEWLY changes to a terminal
    // covered target → rejected.
    const ecp = storedPayload(world, 'ECP-QMS74')
    const updated = await callUpdate(world, 'ECP-QMS74', {
      ...ecp,
      equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-QMS74B' },
    }, 'USR-REGOPS')
    expect(updated.status).toBe(422)
    expect(updated.result.error).toBe('ARCHIVED_TARGET_ASSIGNMENT')
    // Untouched: the stored ECP still points at the original class.
    const ref = storedPayload(world, 'ECP-QMS74').equipmentClassRef as Record<string, unknown>
    expect(ref.id).toBe('EQC-QMS74')
  })

  it('update re-pointing at an ACTIVE covered class passes (diff fires on terminal targets only)', async () => {
    const world = makeWorld()
    seedActivePair(world)
    world.fake.seed(envelope('EQC-QMS74C', 'equipment-class.schema.yaml', {
      kind: 'equipment-class', id: 'EQC-QMS74C', name: 'Active twin', lifecycleId: 'registry-ops', state: 'active',
    }))
    const ecp = storedPayload(world, 'ECP-QMS74')
    const updated = await callUpdate(world, 'ECP-QMS74', {
      ...ecp,
      equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-QMS74C' },
    }, 'USR-REGOPS')
    expect(updated.status).toBe(200)
  })
})

// ===========================================================================
// V5/V6 — the pre-existing content-lock walls stay intact (pinned, not touched)
// ===========================================================================

describe('content-lock walls stay intact (V5/V6)', () => {
  it('handler PUT on an archived covered record with changed content → 409 CONTROLLED_RECORD_LOCKED (V5)', async () => {
    const world = makeWorld()
    seedActivePair(world)
    archiveClass(world)

    const eqc = storedPayload(world, 'EQC-QMS74')
    const updated = await callUpdate(world, 'EQC-QMS74', { ...eqc, name: 'Renamed after archive' }, 'USR-REGOPS')
    expect(updated.status).toBe(409)
    expect(String(updated.result.error)).toContain('CONTROLLED_RECORD_LOCKED')
    expect(storedPayload(world, 'EQC-QMS74').name).toBe('QMS7-4 class')
  })

  it('direct store.update on the archived record → CONTROLLED_RECORD_LOCKED via the REAL RecordStoreImpl wall (V5)', async () => {
    const testDir = join(tmpdir(), `qms74-store-${randomUUID()}`)
    await mkdir(testDir, { recursive: true })
    try {
      const repo = createLocalRepoAdapter({ basePath: testDir })
      const store = createRecordStore(repo, validator as never, new LintEngine())
      const eqc = envelope('EQC-QMS74', 'equipment-class.schema.yaml', {
        kind: 'equipment-class', id: 'EQC-QMS74', name: 'QMS7-4 class',
        lifecycleId: 'registry-ops', state: 'archived',
      })
      const created = await store.create({ envelope: eqc, skipValidation: true })
      expect(created.success).toBe(true)

      const result = await store.update({
        envelope: { ...eqc, payload: { ...(eqc.payload as Record<string, unknown>), name: 'Renamed' } },
      })
      expect(result.success).toBe(false)
      expect(String(result.error)).toContain('CONTROLLED_RECORD_LOCKED')
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  it('content edit smuggled inside a state-transition PUT on a locked record → 409 (V6)', async () => {
    const world = makeWorld()
    // A locked document-control record (approved is a locked state).
    world.fake.seed(envelope('DOC-QMS74V6', 'document.schema.yaml', {
      kind: 'document', recordId: 'DOC-QMS74V6', title: 'Locked doc',
      lifecycleId: 'document-control', state: 'approved', createdBy: 'USR-REGOPS',
    }))
    const doc = storedPayload(world, 'DOC-QMS74V6')
    // Transition approved->effective AND smuggle a content change.
    const updated = await callUpdate(world, 'DOC-QMS74V6', { ...doc, state: 'effective', title: 'Smuggled rename' }, 'USR-REGOPS')
    expect(updated.status).toBe(409)
    expect(String(updated.result.error)).toContain('CONTROLLED_RECORD_LOCKED')

    // Mirrored on the archived covered record: archived->anything is an
    // UNDECLARED transition — the engine gate refuses the smuggled PUT first
    // (422, nothing durable), and the content-only smuggle on the archived
    // record answers 409 from the content lock. Both walls hold.
    seedActivePair(world)
    archiveClass(world)
    const eqc = storedPayload(world, 'EQC-QMS74')
    const smuggledTransition = await callUpdate(world, 'EQC-QMS74', { ...eqc, state: 'active', name: 'Smuggled rename' }, 'USR-REGOPS')
    expect(smuggledTransition.status).toBe(422)
    expect(String(smuggledTransition.result.error)).toContain('LIFECYCLE_TRANSITION_DENIED')
    expect(storedPayload(world, 'EQC-QMS74').name).toBe('QMS7-4 class')

    const smuggledContent = await callUpdate(world, 'EQC-QMS74', { ...eqc, name: 'Smuggled rename' }, 'USR-REGOPS')
    expect(smuggledContent.status).toBe(409)
    expect(String(smuggledContent.result.error)).toContain('CONTROLLED_RECORD_LOCKED')
    expect(storedPayload(world, 'EQC-QMS74').name).toBe('QMS7-4 class')
  })

  it('controlledContent excludes only state/createdAt/createdBy/updatedAt (wall semantics pinned)', () => {
    const base = { kind: 'x', name: 'n', state: 'archived', createdAt: 'a', createdBy: 'b', updatedAt: 'c' }
    const withStateOnly = { ...base, state: 'active' }
    expect(controlledContent(base)).toBe(controlledContent(withStateOnly))
    expect(controlledContent(base)).not.toBe(controlledContent({ ...base, name: 'changed' }))
  })
})

// ===========================================================================
// Data pins: the guard is DATA (bait #3), terminal-ness from the YAML
// ===========================================================================

describe('archive guard data + engine accessor', () => {
  it('the coverage file declares the archiveGuard block with exemptKinds (data, not TS)', () => {
    const data = parseYaml(readFileSync(COVERAGE_FILE, 'utf-8')) as {
      archiveGuard?: { exemptKinds?: string[] }
      migration?: { stateByDomainStatus?: Record<string, string>; default?: string }
    }
    expect(Array.isArray(data.archiveGuard?.exemptKinds)).toBe(true)
    expect(data.archiveGuard!.exemptKinds).toContain('audit-event')
    expect(data.archiveGuard!.exemptKinds).toContain('signature')
    expect(data.archiveGuard!.exemptKinds).toContain('record-revision')
    // QMS8-C (D5): the OQ2 status-map block is RETIRED — the whole `migration:`
    // block is gone (partial deletion throws at the loader, bait #3). The
    // archiveGuard and the QMS8-C lifecycleMigrations block survive; they read
    // nothing from the retired map.
    expect(data.migration).toBeUndefined()
  })

  it('KindLifecycleRegistry exposes the guard data via an optional accessor', () => {
    const engine = new LifecycleEngine()
    loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
    const coverage = loadCoverage(engine)
    const guard = coverage.archiveGuard
    expect(guard).toBeDefined()
    expect(guard!.exemptKinds).toContain('audit-event')
  })

  it('LifecycleEngine reports terminal states from the YAML (ONE read-only getter)', () => {
    const engine = new LifecycleEngine()
    loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
    const registryOps = engine.terminalStates('registry-ops')
    expect(registryOps).toBeDefined()
    expect([...registryOps!]).toEqual(['archived'])
    const docControl = engine.terminalStates('document-control')
    expect(docControl).toBeDefined()
    expect([...docControl!].sort()).toEqual(['archived', 'superseded'])
    expect(engine.terminalStates('not-on-disk')).toBeUndefined()
  })
})
