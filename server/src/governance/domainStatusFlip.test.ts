/**
 * QMS8-C — C3 RED: the flip. Domain `status` is retired for the kinds the
 * coverage DATA declares retired (equipment / instrument): the schema no longer
 * declares the property at all, so a create or update that carries it is
 * REFUSED (4xx) rather than tolerated.
 *
 * Spec: 2026-10-21_QMS8-C-retire-domain-status-spec.md C3 (D3 schema+ui DATA,
 * D6 admissibility reroute, D8-(i) honest-create label), verified-by 1.
 * Harness: the C1 suite's fake store validating through the REAL Ajv pipeline
 * against the REAL schema files, plus the REAL OperationalAdmissibilityService.
 *
 * RED posture: every assertion here fails until the C3 DATA flip ships.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RecordEnvelope, RecordFilter, RecordStore, StoreResult } from '../store/types.js'
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js'
import { RoleResolver } from '../security/RoleResolver.js'
import { LocalIdentityService } from '../security/LocalIdentityService.js'
import { AuditEventService } from '../governance/AuditEventService.js'
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js'
import { loadAllSchemas } from '../schema/SchemaLoader.js'
import { createSchemaRegistry } from '../schema/SchemaRegistry.js'
import { createValidator } from '../validation/AjvValidator.js'
import { loadKindLifecycleRegistry, type KindLifecycleRegistry } from '../registry/KindLifecycleRegistry.js'
import { OperationalAdmissibilityService } from '../authorization/OperationalAdmissibilityService.js'
import type { PolicyProfile, ActivePolicyScope } from '../policy/types.js'

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

function loadEngine(): LifecycleEngine {
  const engine = new LifecycleEngine()
  loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
  return engine
}

function loadCoverage(engine: LifecycleEngine): KindLifecycleRegistry {
  return loadKindLifecycleRegistry(COVERAGE_FILE, { lifecycle: engine, knownKinds })
}

function makeFakeStore(seed: RecordEnvelope[] = []) {
  const records = new Map<string, RecordEnvelope>(seed.map(e => [e.recordId, e]))
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
      if (!records.has(options.envelope.recordId)) return { success: false, error: 'not found' }
      const validation = validateEnvelope(options.envelope)
      if (!validation.valid) {
        return {
          success: false,
          validation,
          error: `Validation failed: ${(validation.errors ?? []).map(e => e.message).join('; ')}`,
        }
      }
      records.set(options.envelope.recordId, options.envelope)
      return { success: true, envelope: options.envelope }
    }),
    delete: vi.fn(async (): Promise<StoreResult> => ({ success: true })),
    validate: vi.fn(async (envelope: RecordEnvelope) => validateEnvelope(envelope)),
    lint: vi.fn(async () => ({ valid: true })),
    exists: vi.fn(async () => false),
  } as unknown as RecordStore
  return { store, records, seed: (e: RecordEnvelope) => records.set(e.recordId, e) }
}

function envelope(recordId: string, schemaName: string, payload: Record<string, unknown>): RecordEnvelope {
  const normalized = 'id' in payload
    ? (() => { const { recordId: _r, ...rest } = payload; return rest })()
    : payload
  return {
    recordId,
    schemaId: SID(schemaName),
    payload: { ...('id' in payload ? {} : { recordId }), ...normalized },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-QMS8C3' },
  } as unknown as RecordEnvelope
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

interface World {
  fake: ReturnType<typeof makeFakeStore>
  engine: LifecycleEngine
  coverage: KindLifecycleRegistry
  handlers: ReturnType<typeof createRecordHandlers>
}

function makeWorld(seed: RecordEnvelope[] = []): World {
  const fake = makeFakeStore(seed)
  fake.seed(envelope('USR-QMS8C3', 'user.schema.yaml', {
    kind: 'user', recordId: 'USR-QMS8C3', username: 'qms8c3', status: 'active',
  }))
  fake.seed(envelope('GRANT-QMS8C3', 'role-grant.schema.yaml', {
    kind: 'role-grant', recordId: 'GRANT-QMS8C3', userId: 'USR-QMS8C3',
    lifecycleId: 'registry-ops', roles: ['author', 'approver'],
  }))
  const engine = loadEngine()
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

async function callCreate(world: World, schemaName: string, payload: Record<string, unknown>, userId = 'USR-QMS8C3') {
  const request = {
    body: { schemaId: SID(schemaName), payload },
    headers: { 'x-user-id': userId },
  } as unknown as FastifyRequest<{ Body: { schemaId: string; payload: Record<string, unknown> } }>
  const reply = makeReply()
  const result = await world.handlers.createRecord(request, reply)
  return { result: result as unknown as Record<string, unknown>, status: reply.statusValue }
}

async function callUpdate(world: World, id: string, payload: Record<string, unknown>, userId = 'USR-QMS8C3') {
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

// ---------------------------------------------------------------------------
// 1. verified-by 1 — a covered-kind write carrying the retired status is 4xx.
// ---------------------------------------------------------------------------

describe('QMS8-C C3: a covered-kind write carrying the retired domain status is refused (verified-by 1)', () => {
  it('create equipment carrying status -> 4xx (status is no longer a declared property)', async () => {
    const world = makeWorld()
    const { result, status } = await callCreate(world, 'equipment.schema.yaml', {
      kind: 'equipment', id: 'EQP-C3-RED-1', name: 'Flip test pump', status: 'active',
    })

    expect(status).toBe(422)
    expect(result.error).toBe('Validation failed')
    expect((result.validation as { valid?: boolean }).valid).toBe(false)
    // BRAD-A1: rejected outright. unevaluatedProperties:false refuses the key —
    // no tolerated-legacy lint rule anywhere.
    const validationErrors = (result.validation ?? {}) as { errors?: Array<{ message?: string }> }
    const messages = (validationErrors.errors ?? []).map(e => String(e.message ?? ''))
    expect(messages.some(m => /status/i.test(m))).toBe(true)
    expect(world.fake.records.has('EQP-C3-RED-1')).toBe(false)
  })

  it('create equipment WITHOUT status lands governed and status-free', async () => {
    const world = makeWorld()
    const { status } = await callCreate(world, 'equipment.schema.yaml', {
      kind: 'equipment', id: 'EQP-C3-OK-1', name: 'Clean pump',
    })

    expect(status).toBeLessThan(400)
    const created = world.fake.records.get('EQP-C3-OK-1')
    expect(created, 'the status-free create must land').toBeDefined()
    const payload = created!.payload as Record<string, unknown>
    expect('status' in payload).toBe(false)
    // D2: the BOTH-stamp at create stays — coverage still governs the create.
    expect(payload.lifecycleId).toBe('registry-ops')
    expect(payload.state).toBe('draft')
  })

  it('update that re-introduces status on a governed equipment is refused 4xx', async () => {
    const world = makeWorld([
      envelope('EQP-C3-EXIST', 'equipment.schema.yaml', {
        kind: 'equipment', id: 'EQP-C3-EXIST', name: 'Existing pump',
        lifecycleId: 'registry-ops', state: 'active',
      }),
    ])
    // The full payload is sent (lifecycleId/state preserved) so the ONLY thing
    // wrong with it is the retired status key — a dropped lifecycleId would
    // 409 with LIFECYCLE_IMMUTABLE and mask what is being pinned here.
    const { result, status } = await callUpdate(world, 'EQP-C3-EXIST', {
      kind: 'equipment', id: 'EQP-C3-EXIST', name: 'Renamed pump',
      lifecycleId: 'registry-ops', state: 'active', status: 'active',
    })

    expect(status).toBe(422)
    expect(result.error).toBe('Validation failed')
    expect((result.validation as { valid?: boolean }).valid).toBe(false)
    expect(storedPayload(world, 'EQP-C3-EXIST').name).toBe('Existing pump')
  })

  it('the retired property is GONE from the equipment and instrument schema DATA', () => {
    for (const name of ['equipment', 'instrument']) {
      const raw = readFileSync(join(SCHEMA_DIR, 'lab', `${name}.schema.yaml`), 'utf8')
      expect(validator.hasSchema(SID(`${name}.schema.yaml`)), `${name}.schema.yaml must load`).toBe(true)
      // Not merely optional — the declaration itself is deleted (D3).
      expect(raw).not.toMatch(/^\s+status:$/m)
      expect(raw).not.toMatch(/^- status$/m)
      expect(raw).not.toMatch(/out_of_service/)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. D6 — admissibility reads the LIFECYCLE STATE, not the retired status.
// ---------------------------------------------------------------------------

const profiles: PolicyProfile[] = [{
  id: 'org-qms8c', scope: 'organization', scopeId: 'org-qms8c',
  settings: {
    allowSupervisedUse: 'deny', allowExpiredTraining: 'deny', allowExpiredAuthorization: 'deny',
    allowOutOfCalibrationEquipment: 'deny', allowUnqualifiedEquipment: 'deny',
  },
}]
const scope: ActivePolicyScope = { organizationId: 'org-qms8c' }

function admissibilityRecords(equipmentPayload: Record<string, unknown>): RecordEnvelope[] {
  return [
    envelope('VERB-MIX', 'verb-definition.schema.yaml', { kind: 'verb-definition', id: 'VERB-MIX', canonical: 'mix', label: 'Mix' }),
    envelope('EQC-SHAKER', 'equipment-class.schema.yaml', { kind: 'equipment-class', id: 'EQC-SHAKER', name: 'Orbital Shaker' }),
    envelope('ECP-SHAKER-MIX', 'equipment-capability.schema.yaml', {
      kind: 'equipment-capability', id: 'ECP-SHAKER-MIX', status: 'active',
      equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-SHAKER' },
      capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-MIX' }, methodIds: ['METHOD-MIX-01'], backendImplementations: ['orbital_shaker'] }],
    }),
    envelope(String(equipmentPayload.id), 'equipment.schema.yaml', equipmentPayload),
  ]
}

function admissibilityService(records: RecordEnvelope[]): OperationalAdmissibilityService {
  const store = {
    list: async (filter?: RecordFilter) => (filter?.kind
      ? records.filter(r => (r.payload as Record<string, unknown>).kind === filter.kind)
      : [...records]),
  }
  // D6: terminal-ness is read from the lifecycle YAML through the engine — the
  // test loads the REAL lifecycles, it never hands the service a TS state list.
  return new OperationalAdmissibilityService(store as never, loadEngine())
}

describe('QMS8-C C3 (D6): equipment admissibility consults the lifecycle state', () => {
  it('a TERMINAL-state (archived) equipment is inadmissible with a lifecycle-worded finding', async () => {
    const service = admissibilityService(admissibilityRecords({
      kind: 'equipment', id: 'EQP-C3-ARCH', name: 'Archived shaker',
      equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-SHAKER' },
      lifecycleId: 'registry-ops', state: 'archived',
    }))
    const result = await service.evaluate({
      policyProfiles: profiles, scope, verbId: 'VERB-MIX', methodId: 'METHOD-MIX-01',
      equipmentId: 'EQP-C3-ARCH', at: '2026-04-05T00:00:00Z',
    })

    const equipmentBlocked = result.findings.filter(f => f.disposition === 'blocked' && f.subject === 'equipment')
    expect(equipmentBlocked.length, 'a terminal-state equipment must block admissibility').toBeGreaterThan(0)
    // The message names the lifecycle STATE and the LIFECYCLE — never a status word.
    expect(equipmentBlocked[0]!.message).toMatch(/archived/)
    expect(equipmentBlocked[0]!.message).toMatch(/registry-ops/)
  })

  it('an ACTIVE-state equipment stays admissible (behavior-preserving on the lane corpus)', async () => {
    const service = admissibilityService(admissibilityRecords({
      kind: 'equipment', id: 'EQP-C3-ACTIVE', name: 'Active shaker',
      equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-SHAKER' },
      lifecycleId: 'registry-ops', state: 'active',
    }))
    const result = await service.evaluate({
      policyProfiles: profiles, scope, verbId: 'VERB-MIX', methodId: 'METHOD-MIX-01',
      equipmentId: 'EQP-C3-ACTIVE', at: '2026-04-05T00:00:00Z',
    })

    const equipmentBlocked = result.findings.filter(f => f.disposition === 'blocked' && f.subject === 'equipment')
    expect(equipmentBlocked.some(f => /archived/i.test(f.message))).toBe(false)
    expect(result.admissible).toBe(true)
  })

  it('the admissibility service holds no equipment-status read for the equipment leg (D6)', () => {
    const source = readFileSync(join(here, '../authorization/OperationalAdmissibilityService.ts'), 'utf8')
    expect(source).not.toMatch(/equipment\.status/)
    expect(source).not.toMatch(/EQUIPMENT_NOT_ACTIVE/)
  })
})

// ---------------------------------------------------------------------------
// 3. D8-(i) — honest-create label (A1-9 binding).
// ---------------------------------------------------------------------------

describe('QMS8-C C3 (D8-(i)): the equipment collection label tells the truth', () => {
  it("LabCollectionView's equipment category is labelled 'Equipment'", () => {
    const source = readFileSync(join(here, '../../../app/src/collections/LabCollectionView.tsx'), 'utf8')
    expect(source).not.toMatch(/Instruments & Equipment/)
    expect(source).toMatch(/label:\s*'Equipment'/)
  })

  it('the equipment card no longer renders a domain status token', () => {
    const source = readFileSync(join(here, '../../../app/src/collections/LabCollectionView.tsx'), 'utf8')
    const start = source.indexOf("case 'equipment'")
    expect(start).toBeGreaterThan(-1)
    const equipmentCase = source.slice(start, source.indexOf("case 'protocol'", start))
    expect(equipmentCase).not.toMatch(/p\.status/)
  })
})

// ---------------------------------------------------------------------------
// 4. UI DATA — no status field/column in the covered kinds' UI declarations.
// ---------------------------------------------------------------------------

describe('QMS8-C C3 (D3): the covered kinds declare no status in their UI', () => {
  it('equipment.ui.yaml and instrument.ui.yaml declare no $.status field or column', () => {
    for (const name of ['equipment', 'instrument']) {
      const raw = readFileSync(join(SCHEMA_DIR, 'lab', `${name}.ui.yaml`), 'utf8')
      expect(raw, `${name}.ui.yaml must not declare a status field`).not.toMatch(/\$\.status/)
      expect(raw).not.toMatch(/label:\s*"Status"/)
    }
  })
})
