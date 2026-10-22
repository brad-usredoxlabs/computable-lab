/**
 * QMS8-C adv-cycle1 BLOCKER 1 (fix run 1) — dropping a governed record's
 * lifecycle `state` is a DENIED lifecycle change, never a silent erasure.
 *
 * Orchestrator ruling on the spec ambiguity (binding, reviewer option (i)
 * NARROWED): the middleware's no-state early-return fires ONLY when BOTH
 * previousState and nextState are absent. A governed update whose previous
 * payload CARRIED a state and whose next payload OMITS it is a state erasure
 * and must be DENIED with an explicit error: state changes only via a declared
 * transition — never silently. Server-side payload rewriting (option (ii)) is
 * OUT of scope; RecordHandlers' full-payload-replace semantics stay as-is.
 *
 * Why this is the hazard the item exists to close (spec A1-4): the handler
 * REPLACES the payload on PUT (RecordHandlers.ts:1223 builds the stored payload
 * from request.body.payload), so a PUT that omits `state` does not "propose no
 * change" — it DELETES the stored state. The only adjacent guard,
 * LIFECYCLE_IMMUTABLE (RecordHandlers.ts:1054), fires on discarding
 * `lifecycleId`, never on discarding `state`. A governed record left without a
 * state then skips BOTH the archive guard (RecordHandlers.ts:289-291, reads
 * state ONLY) and the admissibility terminal check
 * (OperationalAdmissibilityService.ts:186-193, `state !== undefined` gate):
 * an archived asset becomes admissible again and can never be transitioned.
 *
 * RED posture: the erasure legs fail against HEAD d044fafd, whose
 * `if (nextState === undefined) return { allowed: true }` (lifecycleMiddleware.ts:48)
 * allows them. The allow-legs pin the ruling's NARROW scope so the fix cannot
 * over-correct into refusing content edits.
 *
 * Harness: the C1/C3 suites' pattern — REAL LifecycleEngine from
 * schema/core/lifecycles, fake Map store validating through the REAL Ajv
 * pipeline against the REAL schema files, REAL createRecordHandlers.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RecordEnvelope, RecordFilter, RecordStore, StoreResult } from '../store/types.js'
import { LifecycleEngine } from './LifecycleEngine.js'
import { loadLifecyclesFromDir } from './LifecycleLoader.js'
import { checkLifecycleTransition } from './lifecycleMiddleware.js'
import { RoleResolver } from '../security/RoleResolver.js'
import { LocalIdentityService } from '../security/LocalIdentityService.js'
import { AuditEventService } from '../governance/AuditEventService.js'
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js'
import { loadAllSchemas } from '../schema/SchemaLoader.js'
import { createSchemaRegistry } from '../schema/SchemaRegistry.js'
import { createValidator } from '../validation/AjvValidator.js'
import { loadKindLifecycleRegistry, type KindLifecycleRegistry } from '../registry/KindLifecycleRegistry.js'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = join(here, '../../schema')
const LIFECYCLES_DIR = join(SCHEMA_DIR, 'core/lifecycles')
const COVERAGE_FILE = join(SCHEMA_DIR, 'registry/registry-kinds.registry.yaml')
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
  const count = loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
  expect(count).toBeGreaterThanOrEqual(2)
  expect(engine.isLoaded('registry-ops')).toBe(true)
  return engine
}

function loadCoverage(engine: LifecycleEngine): KindLifecycleRegistry {
  return loadKindLifecycleRegistry(COVERAGE_FILE, { lifecycle: engine, knownKinds })
}

// ---------------------------------------------------------------------------
// Fake store validating through the REAL Ajv pipeline (domainStatusFlip /
// domainStatusRetirement pattern) so the end-to-end leg hits the real schema.
// ---------------------------------------------------------------------------

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
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-QMS8CF' },
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
  fake.seed(envelope('USR-QMS8CF', 'user.schema.yaml', {
    kind: 'user', recordId: 'USR-QMS8CF', username: 'qms8cf', status: 'active',
  }))
  fake.seed(envelope('GRANT-QMS8CF', 'role-grant.schema.yaml', {
    kind: 'role-grant', recordId: 'GRANT-QMS8CF', userId: 'USR-QMS8CF',
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

async function callUpdate(world: World, id: string, payload: Record<string, unknown>) {
  const request = {
    params: { id },
    body: { payload },
    headers: { 'x-user-id': 'USR-QMS8CF' },
  } as unknown as FastifyRequest<{ Params: { id: string }; Body: { payload: Record<string, unknown> } }>
  const reply = makeReply()
  const result = await world.handlers.updateRecord(request, reply)
  return { result: result as unknown as Record<string, unknown>, status: reply.statusValue }
}

function storedPayload(world: World, id: string): Record<string, unknown> {
  return world.fake.records.get(id)!.payload as Record<string, unknown>
}

/** Governed ACTIVE equipment (post-C3 the equipment schema no longer declares
 *  `status`, so this is the exact shape a real governed record has). */
function activeGovernedEquipment(id = 'EQP-QMS8CF-ERASE'): RecordEnvelope {
  return envelope(id, 'equipment.schema.yaml', {
    kind: 'equipment', id, name: 'QMS8-C fix probe pump',
    lifecycleId: 'registry-ops', state: 'active',
  })
}

// ===========================================================================
// 1 — middleware matrix: erasure denies, both-absent allows
// ===========================================================================

describe('QMS8-C fix: the middleware gates a state ERASURE as the lifecycle change it is', () => {
  const governed = (extra: Record<string, unknown> = {}) => ({
    kind: 'equipment', id: 'EQP-QMS8CF-MW', lifecycleId: 'registry-ops', ...extra,
  })

  it('DENIES a governed update whose next payload drops a state the previous payload carried', () => {
    // The reviewer's probe row "omit state (governed, prev state active)":
    // BASE 4bc57ebe refused it (via the fallback-derived transition error),
    // HEAD d044fafd allows it. The ruling restores the refusal, with an error
    // that names the erasure instead of an invented 'undefined' target state.
    const engine = loadEngine()
    const result = checkLifecycleTransition(engine, {
      previousPayload: governed({ state: 'active' }),
      nextPayload: governed(),
      actorId: 'USR-QMS8CF',
      actorRoles: ['author'],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.transition).toBeUndefined()
    expect(String(result.error)).toMatch(/state/i)
    expect(String(result.error)).toContain('registry-ops')
    // No invented target state: the denial is the ERASURE, not a jump to
    // 'undefined' or to some other declared state.
    expect(String(result.error)).not.toMatch(/to 'undefined'/)
  })

  it('DENIES a state erasure even when the next payload also carries a domain status (status-only move on a state-bearing previous)', () => {
    // The reviewer's probe rows "omit state AND status" and "status-only move
    // (no state in next)": both BASE-refused, both HEAD-allowed. A domain
    // status is never a lifecycle state (A1-1), and dropping the state is the
    // erasure — the status word cannot stand in for it in either direction.
    const engine = loadEngine()
    const result = checkLifecycleTransition(engine, {
      previousPayload: governed({ state: 'active' }),
      nextPayload: governed({ status: 'suspended' }),
      actorId: 'USR-QMS8CF',
      actorRoles: ['author'],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.transition).toBeUndefined()
    // The domain status did NOT become a target state either.
    expect(String(result.error)).not.toMatch(/to 'suspended'/)
    expect(String(result.error)).toMatch(/state/i)
  })

  it('DENIES the EQP-NEW-7LS1 leak class: a state-bearing draft losing its state while carrying status:active', () => {
    // Same leak class as the re-pointed domainStatusRetirement.test.ts pin:
    // previous carries state:'draft' + status:'active', next omits state and
    // keeps only the domain status. Under the ruling this is an erasure and
    // DENIES. The leak-class claim stays intact either way: the DOMAIN status
    // never drives a transition — no draft->active transition is proposed.
    const engine = loadEngine()
    const result = checkLifecycleTransition(engine, {
      previousPayload: governed({ state: 'draft', status: 'active' }),
      nextPayload: governed({ status: 'active' }),
      actorId: 'USR-QMS8CF',
      actorRoles: ['author'],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.transition).toBeUndefined()
    expect(String(result.error)).not.toMatch(/to 'active'/)
    expect(String(result.error)).toMatch(/state/i)
  })

  it('ALLOWS a content edit on a governed record that carries no state on EITHER side (the ruling\'s narrow early-return)', () => {
    // Both absent: there is no state to erase and none proposed, so there is
    // nothing for the gate to read and nothing to gate. This leg pins the
    // fix's NARROW scope: the early-return survives only for this shape.
    const engine = loadEngine()
    const result = checkLifecycleTransition(engine, {
      previousPayload: governed(),
      nextPayload: governed({ name: 'Renamed, still state-less' }),
      actorId: 'USR-QMS8CF',
      actorRoles: ['author'],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.transition).toBeUndefined()
  })

  it('ALLOWS an unchanged state (content edit on a state-bearing governed record)', () => {
    const engine = loadEngine()
    const result = checkLifecycleTransition(engine, {
      previousPayload: governed({ state: 'active' }),
      nextPayload: governed({ state: 'active', name: 'Renamed pump' }),
      actorId: 'USR-QMS8CF',
      actorRoles: ['author'],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.transition).toBeUndefined()
  })

  it('ALLOWS a declared transition (the erasure denial did not disarm the gate)', () => {
    const engine = loadEngine()
    const result = checkLifecycleTransition(engine, {
      previousPayload: governed({ state: 'draft' }),
      nextPayload: governed({ state: 'active' }),
      actorId: 'USR-QMS8CF',
      actorRoles: ['author'],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.transition).toEqual({ from: 'draft', to: 'active', event: 'ACTIVATE' })
  })

  it('leaves an UNGOVERNED payload alone (no lifecycleId => no gate, state or not)', () => {
    const engine = loadEngine()
    const result = checkLifecycleTransition(engine, {
      previousPayload: { kind: 'equipment', id: 'EQP-QMS8CF-UNGOV', state: 'active' },
      nextPayload: { kind: 'equipment', id: 'EQP-QMS8CF-UNGOV', name: 'Ungoverned rename' },
      actorId: 'USR-QMS8CF',
      actorRoles: ['author'],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(true)
  })
})

// ===========================================================================
// 2 — end-to-end through the REAL createRecordHandlers
// ===========================================================================

describe('QMS8-C fix: a PUT cannot leave a governed record state-less (end-to-end)', () => {
  it('PUT that retains lifecycleId and omits state -> 422 LIFECYCLE_TRANSITION_DENIED, stored state intact', async () => {
    // The reviewer's probe (b): HEAD d044fafd returned 200 and the stored
    // payload LOST `state` — a governed record with no state, which then skips
    // the archive guard and the admissibility terminal check. Under the ruling
    // the middleware denial forces the 4xx the base produced.
    const world = makeWorld([activeGovernedEquipment()])
    const next = {
      kind: 'equipment', id: 'EQP-QMS8CF-ERASE', name: 'Renamed by a state-dropping PUT',
      lifecycleId: 'registry-ops',
    }
    const { result, status } = await callUpdate(world, 'EQP-QMS8CF-ERASE', next)

    expect(status).toBe(422)
    expect(result.error).toBe('LIFECYCLE_TRANSITION_DENIED')
    expect(String(result.message)).toMatch(/state/i)
    // The store was never reached with a state-less payload.
    expect((world.fake.store.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    const stored = storedPayload(world, 'EQP-QMS8CF-ERASE')
    expect(stored.state, 'a governed record must not be left without a lifecycle state').toBe('active')
    expect(stored.name).toBe('QMS8-C fix probe pump')
  })

  it('the same record renamed WITH its state round-tripped still saves 200 (the deny path never fires for real edits)', async () => {
    // The app's editor serializer round-trips `state`, so a normal save carries
    // it; only a payload that DROPS the key hits the erasure denial.
    const world = makeWorld([activeGovernedEquipment()])
    const next = {
      kind: 'equipment', id: 'EQP-QMS8CF-ERASE', name: 'Renamed the honest way',
      lifecycleId: 'registry-ops', state: 'active',
    }
    const { status } = await callUpdate(world, 'EQP-QMS8CF-ERASE', next)
    expect(status).toBe(200)
    expect(storedPayload(world, 'EQP-QMS8CF-ERASE').state).toBe('active')
    expect(storedPayload(world, 'EQP-QMS8CF-ERASE').name).toBe('Renamed the honest way')
  })

  it('a declared active->archived transition still goes through end-to-end (gate not disarmed)', async () => {
    const world = makeWorld([activeGovernedEquipment('EQP-QMS8CF-ARCH')])
    const next = {
      kind: 'equipment', id: 'EQP-QMS8CF-ARCH', name: 'Archived honestly',
      lifecycleId: 'registry-ops', state: 'archived',
    }
    const { status } = await callUpdate(world, 'EQP-QMS8CF-ARCH', next)
    expect(status).toBe(200)
    expect(storedPayload(world, 'EQP-QMS8CF-ARCH').state).toBe('archived')
  })
})
