/**
 * QMS8-C — retire the domain `status` field for lifecycle-governed kinds.
 *
 * RED-FIRST suite (spec 2026-10-21_QMS8-C-retire-domain-status-spec.md, C1 leg,
 * BRAD-A1 full clean break). Harness pattern from archivedAssignment.test.ts /
 * registryOpsLifecycle.test.ts: fake Map store that validates through the REAL
 * Ajv pipeline + REAL LifecycleEngine from schema/core/lifecycles + REAL
 * coverage accessor backed by the REAL registry-kinds.registry.yaml + REAL
 * createRecordHandlers, so the schema landmines bite exactly as they do in the
 * real store.
 *
 * What this suite pins (acceptance verified-by 1 + A1-5):
 *  1. the lifecycle gate never resolves a lifecycle state from a DOMAIN status
 *     (lifecycleMiddleware.ts:38-39 and LifecycleHandlers.ts:53 — A1-1 global
 *     deletion, no coverage-scoped residual);
 *  2. a covered update that moves ONLY domain status is NOT treated as a
 *     lifecycle transition (pre-fix it reaches the engine and 422s with
 *     "Transition from 'active' to ... is not allowed");
 *  3. REGRESSION PIN (reviewer bait #4 / A1-5): the global deletion did NOT
 *     disarm the lab-vocabulary-control gate — an unauthorized vocab transition
 *     on a STAMPED record (state present) is still DENIED with the YAML's own
 *     denialMessage;
 *  4. the vocab-control SIBLING leg (A1-2/A1-3, same commit as the deletion):
 *     material/material-spec/term declare an optional `state` whose enum is the
 *     lifecycle YAML's declared states, and the runner stamps state := status
 *     for governed vocab records that carry status and lack state — through the
 *     real validator, idempotently;
 *  5. no server-side instruction mints a domain status (D1 AI prompt line,
 *     D7 Exa hardcode).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { RecordEnvelope, RecordFilter, RecordStore, StoreResult } from '../store/types.js'
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js'
import { checkLifecycleTransition } from '../lifecycle/lifecycleMiddleware.js'
import type { LifecycleContext, LifecycleSpec } from '../lifecycle/types.js'
import { RoleResolver } from '../security/RoleResolver.js'
import { LocalIdentityService } from '../security/LocalIdentityService.js'
import { AuditEventService } from '../governance/AuditEventService.js'
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js'
import { loadAllSchemas } from '../schema/SchemaLoader.js'
import { createSchemaRegistry } from '../schema/SchemaRegistry.js'
import { createValidator } from '../validation/AjvValidator.js'
import { loadKindLifecycleRegistry, type KindLifecycleRegistry } from '../registry/KindLifecycleRegistry.js'
import { migrateRecordLifecycles } from '../scripts/migrateRecordLifecycles.js'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = join(here, '../../../schema')
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
  expect(engine.isLoaded('lab-vocabulary-control')).toBe(true)
  return engine
}

function loadCoverage(engine: LifecycleEngine): KindLifecycleRegistry {
  return loadKindLifecycleRegistry(COVERAGE_FILE, { lifecycle: engine, knownKinds })
}

/** The lifecycle YAML's own declared state ids — never a duplicated TS list. */
function declaredStateIds(engine: LifecycleEngine, lifecycleId: string): string[] {
  return (engine.specFor(lifecycleId)?.states ?? []).map(s => s.id)
}

function declaredInitialId(engine: LifecycleEngine, lifecycleId: string): string {
  const initial = (engine.specFor(lifecycleId)?.states ?? []).find(s => s.initial === true)
  expect(initial, `${lifecycleId} must declare an initial state`).toBeDefined()
  return initial!.id
}

// ---------------------------------------------------------------------------
// Fake store: Map-backed but validating through the REAL Ajv pipeline, exactly
// like RecordStoreImpl.createUnlocked/updateUnlocked (unevaluatedProperties
// landmines bite for real).
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
  // Mirror the real store's canonical parse: lab schemas declare `id` under
  // unevaluatedProperties:false, so a payload carrying `id` must not smuggle a
  // recordId too (archivedAssignment.test.ts precedent).
  const normalized = 'id' in payload
    ? (() => { const { recordId: _r, ...rest } = payload; return rest })()
    : payload
  return {
    recordId,
    schemaId: SID(schemaName),
    payload: { ...('id' in payload ? {} : { recordId }), ...normalized },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-QMS8C' },
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
  fake.seed(envelope('USR-QMS8C', 'user.schema.yaml', {
    kind: 'user', recordId: 'USR-QMS8C', username: 'qms8c', status: 'active',
  }))
  fake.seed(envelope('GRANT-QMS8C', 'role-grant.schema.yaml', {
    kind: 'role-grant', recordId: 'GRANT-QMS8C', userId: 'USR-QMS8C',
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

/** A governed DRAFT equipment whose DOMAIN status says 'active' — the exact
 *  defect class EQP-NEW-7LS1 shows on the lane (status:active + state:draft). */
function governedDraftEquipment(id = 'EQP-QMS8C-DRAFT'): RecordEnvelope {
  return envelope(id, 'equipment.schema.yaml', {
    kind: 'equipment', id, name: 'QMS8-C draft pump',
    status: 'active',
    lifecycleId: 'registry-ops', state: 'draft',
  })
}

// ===========================================================================
// 1 — the gate never reads domain status (A1-1)
// ===========================================================================

describe('QMS8-C: the lifecycle gate never resolves state from domain status', () => {
  it('a covered update that moves ONLY domain status is NOT treated as a lifecycle transition', async () => {
    // Stored: governed ACTIVE equipment. The PUT carries a domain status the
    // lifecycle has never heard of and NO state. Pre-fix the middleware reads
    // `state ?? status`, invents the target state 'out_of_service', sends it to
    // the engine and 422s with "Transition from 'active' to 'out_of_service' is
    // not allowed by the registry-ops lifecycle." Post-fix no state is proposed,
    // so no transition is attempted: the edit is a content edit, not a
    // lifecycle move, and the record's lifecycle state is untouched.
    const world = makeWorld()
    world.fake.seed(envelope('EQP-QMS8C-ACTIVE', 'equipment.schema.yaml', {
      kind: 'equipment', id: 'EQP-QMS8C-ACTIVE', name: 'QMS8-C active pump',
      status: 'active',
      lifecycleId: 'registry-ops', state: 'active',
    }))

    const next = {
      kind: 'equipment', id: 'EQP-QMS8C-ACTIVE', name: 'QMS8-C active pump renamed',
      status: 'out_of_service',
      lifecycleId: 'registry-ops',
    }
    const updated = await callUpdate(world, 'EQP-QMS8C-ACTIVE', next, 'USR-QMS8C')

    expect(updated.status).toBe(200)
    expect(String((updated.result as Record<string, unknown>)?.error ?? '')).not.toMatch(/Transition from/)
  })

  it('a domain status can no longer drive a real draft->active transition (the EQP-NEW-7LS1 leak class)', () => {
    // The exact lane defect: a governed DRAFT record whose payload carries
    // status:'active' while its lifecycle state is 'draft'. Pre-fix the
    // middleware read `state ?? status`, so a PUT that carried only the domain
    // status resolved previous='draft' -> next='active' and the engine RAN the
    // draft->active transition: the domain word activated the record. Post-fix
    // the domain status is not a lifecycle state, so no transition is proposed.
    const engine = loadEngine()
    const result = checkLifecycleTransition(engine, {
      previousPayload: { kind: 'equipment', id: 'EQP-QMS8C-DRAFT', lifecycleId: 'registry-ops', state: 'draft', status: 'active' },
      nextPayload: { kind: 'equipment', id: 'EQP-QMS8C-DRAFT', lifecycleId: 'registry-ops', status: 'active' },
      actorId: 'USR-QMS8C',
      actorRoles: ['author'],
      enforceTransitionRoles: false,
    })
    // Allowed, but as a content edit: NO transition happened, and nothing was
    // activated. Pre-fix this returned transition {from:'draft', to:'active'}.
    expect(result.allowed).toBe(true)
    expect(result.transition).toBeUndefined()
  })

  it('GET /lifecycle/:id/transitions never derives the record state from domain status (LifecycleHandlers leak site)', async () => {
    const { createLifecycleHandlers } = await import('../api/handlers/LifecycleHandlers.js')
    const engine = loadEngine()
    // A governed DRAFT record whose only state-ish value is the domain status
    // 'active' — the EQP-NEW-7LS1 shape. Pre-fix the preview computed
    // transitions from 'active' (the DOMAIN status), which is how
    // DocumentControlBar decided which buttons to offer.
    const record = governedDraftEquipment('EQP-QMS8C-PREVIEW')
    delete (record.payload as Record<string, unknown>).state

    const store = { get: vi.fn(async () => record) } as unknown as RecordStore
    const handlers = createLifecycleHandlers({
      engine,
      store,
      roleResolver: { rolesFor: vi.fn(async () => [] as string[]) } as never,
      resolveRequestUser: vi.fn(async () => ({ userId: 'USR-QMS8C', isSystem: false })) as never,
    })
    let sentBody: unknown
    const reply = {
      status: vi.fn(),
      send: (body: unknown) => { sentBody = body; return reply },
    } as never
    await handlers.getTransitions(
      { params: { lifecycleId: 'registry-ops' }, query: { recordId: 'EQP-QMS8C-PREVIEW' } } as never,
      reply as never,
    )

    const reported = (sentBody as { state: string }).state
    // Never the domain status. 'draft' is the handler's pre-existing fallback
    // for a state-less payload (unchanged by this item), and it happens to be
    // registry-ops' YAML-declared initial state — asserted from the YAML.
    expect(reported).not.toBe('active')
    expect(reported).toBe(declaredInitialId(engine, 'registry-ops'))
    // Discriminator: pre-fix the preview ran from the DOMAIN status 'active',
    // which offers only the archived transition. Run from the record's real
    // lifecycle state (draft) the YAML also offers 'activate'.
    const transitions = (sentBody as { transitions: Array<{ targetState: string }> }).transitions
    expect(transitions.map(t => t.targetState)).toContain('active')
  })
})

// ===========================================================================
// 2 — REGRESSION PIN (A1-5 / reviewer bait #4): the vocab gate still fires
// ===========================================================================

describe('QMS8-C: the lab-vocabulary-control gate is NOT disarmed (A1-5 pin)', () => {
  function vocabContext(overrides: Partial<LifecycleContext> = {}): LifecycleContext {
    return {
      recordId: 'MAT-QMS8C-VOCAB',
      currentActorId: 'USR-AUTHOR',
      roleAssignments: { author: 'USR-AUTHOR' },
      actorRoles: [],
      enforceTransitionRoles: false,
      fields: {},
      presentedSignatures: [],
      ...overrides,
    }
  }

  function yamlDenial(engine: LifecycleEngine, from: string, to: string): string {
    const spec = parseYaml(readFileSync(join(LIFECYCLES_DIR, 'lab-vocabulary-control.lifecycle.yaml'), 'utf-8')) as LifecycleSpec
    const transition = spec.transitions.find(t => t.to === to && (Array.isArray(t.from) ? t.from.includes(from) : t.from === from))
    const guard = (transition?.guards ?? []).find(g => g.type === 'requires_different_person')
    const message = (guard as { denialMessage?: string } | undefined)?.denialMessage
    expect(message, 'the vocab lifecycle must declare its guard denialMessage in YAML').toBeTruthy()
    return message!
  }

  it('an author proposing proposed->active on a STAMPED vocab record is DENIED with the YAML message', () => {
    const engine = loadEngine()
    const denial = yamlDenial(engine, 'proposed', 'active')
    const result = checkLifecycleTransition(engine, {
      previousPayload: { kind: 'material', id: 'MAT-QMS8C-VOCAB', lifecycleId: 'lab-vocabulary-control', state: 'proposed', status: 'proposed' },
      nextPayload: { kind: 'material', id: 'MAT-QMS8C-VOCAB', lifecycleId: 'lab-vocabulary-control', state: 'active', status: 'active' },
      actorId: 'USR-AUTHOR',
      actorRoles: [],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(denial)
  })

  it('the denial survives the global status-fallback deletion (state is the only truth)', () => {
    // Same transition with the domain status REMOVED from both payloads: the
    // gate must behave identically, proving it never needed the status read.
    const engine = loadEngine()
    const denial = yamlDenial(engine, 'proposed', 'active')
    const result = checkLifecycleTransition(engine, {
      previousPayload: { kind: 'material', id: 'MAT-QMS8C-VOCAB', lifecycleId: 'lab-vocabulary-control', state: 'proposed' },
      nextPayload: { kind: 'material', id: 'MAT-QMS8C-VOCAB', lifecycleId: 'lab-vocabulary-control', state: 'active' },
      actorId: 'USR-AUTHOR',
      actorRoles: [],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(denial)
  })
})

// ===========================================================================
// 3 — the vocab-control SIBLING leg (A1-2 schema declaration + A1-3 stamp)
// ===========================================================================

describe('QMS8-C: vocab-control schemas declare the lifecycle state (A1-2)', () => {
  const VOCAB_SCHEMAS = ['lab/material.schema.yaml', 'lab/material-spec.schema.yaml', 'core/term.schema.yaml']

  it.each(VOCAB_SCHEMAS)('%s declares an optional `state` whose enum is the lifecycle YAML\'s declared states', async (rel) => {
    const engine = loadEngine()
    const declared = declaredStateIds(engine, 'lab-vocabulary-control')
    const schema = parseYaml(readFileSync(join(SCHEMA_DIR, rel), 'utf-8')) as {
      properties?: Record<string, { type?: string; enum?: string[] }>
      required?: string[]
    }
    const state = schema.properties?.state
    expect(state, `${rel} must declare a state property (the stamp leg cannot write one the schema rejects)`).toBeTruthy()
    expect(state!.enum, `${rel} state enum must be the declared lifecycle states`).toEqual(declared)
    expect(schema.required ?? []).not.toContain('state')
  })
})

describe('QMS8-C: the runner stamps vocab state from status (A1-3)', () => {
  function vocabSeed(): RecordEnvelope[] {
    return [
      // Governed, carries status, NO state — the stamp target (mirrors the two
      // real lane records MAT-MESH-D056945 / MSP-MTRJ71N2-V0516Y).
      envelope('MAT-QMS8C-STAMP', 'material.schema.yaml', {
        kind: 'material', id: 'MAT-QMS8C-STAMP', name: 'QMS8-C vocab material', domain: 'reagent',
        lifecycleId: 'lab-vocabulary-control', status: 'proposed',
      }),
      envelope('MSP-QMS8C-STAMP', 'material-spec.schema.yaml', {
        kind: 'material-spec', id: 'MSP-QMS8C-STAMP', name: 'QMS8-C vocab spec',
        material_ref: { kind: 'record', type: 'material', id: 'MAT-QMS8C-STAMP' },
        lifecycleId: 'lab-vocabulary-control', status: 'proposed',
      }),
      // Already stamped — must skip (idempotency key is payload content).
      envelope('MAT-QMS8C-STAMPED', 'material.schema.yaml', {
        kind: 'material', id: 'MAT-QMS8C-STAMPED', name: 'Already stamped', domain: 'reagent',
        lifecycleId: 'lab-vocabulary-control', status: 'active', state: 'active',
      }),
      // Governed but status-less — never guessed.
      envelope('MAT-QMS8C-STATUSLESS', 'material.schema.yaml', {
        kind: 'material', id: 'MAT-QMS8C-STATUSLESS', name: 'No status', domain: 'reagent',
        lifecycleId: 'lab-vocabulary-control',
      }),
      // Not governed by the declared lifecycle — untouched.
      envelope('MAT-QMS8C-UNGOVERNED', 'material.schema.yaml', {
        kind: 'material', id: 'MAT-QMS8C-UNGOVERNED', name: 'Ungoverned', domain: 'reagent',
        status: 'proposed',
      }),
    ]
  }

  it('plans exactly the governed status-carrying state-less vocab records and is idempotent', async () => {
    const engine = loadEngine()
    const coverage = loadCoverage(engine)
    const fake = makeFakeStore(vocabSeed())
    const lines: string[] = []

    const report = await migrateRecordLifecycles({
      store: fake.store, coverage, engine,
      resolvedDir: '/fake/qms8c-vocab-stamp', apply: false, log: (l) => lines.push(l),
    })

    const planned = report.planned.map(p => p.recordId).sort()
    expect(planned).toEqual(['MAT-QMS8C-STAMP', 'MSP-QMS8C-STAMP'])
    expect(report.planned.every(p => p.toState === 'proposed')).toBe(true)
    expect(lines.some(l => l.startsWith('VOCAB-STATE MAT-QMS8C-STAMP: state stamped from status proposed'))).toBe(true)
    expect(lines.some(l => l.startsWith('VOCAB-STATE MSP-QMS8C-STAMP: state stamped from status proposed'))).toBe(true)
    expect(fake.store.update).not.toHaveBeenCalled()

    // A dry run writes nothing, so it changes nothing: re-running the dry run
    // plans the SAME two records (the plan is a pure function of payload
    // content). Idempotency is proven after the apply, below.
    const second = await migrateRecordLifecycles({
      store: fake.store, coverage, engine, resolvedDir: '/fake/qms8c-vocab-stamp', apply: false, log: () => {},
    })
    expect(second.planned.map(p => p.recordId).sort()).toEqual(['MAT-QMS8C-STAMP', 'MSP-QMS8C-STAMP'])
    expect(second.applied).toEqual([])
  })

  it('applies through the real validator (the A1-2 declaration is load-bearing) and the gate then denies the author-activate', async () => {
    const engine = loadEngine()
    const coverage = loadCoverage(engine)
    const fake = makeFakeStore(vocabSeed())
    const lines: string[] = []

    const report = await migrateRecordLifecycles({
      store: fake.store, coverage, engine,
      resolvedDir: '/fake/qms8c-vocab-stamp', apply: true, log: (l) => lines.push(l), actor: 'USR-QMS8C',
    })

    expect(report.blocked).toEqual([])
    expect(report.applied.map(a => a.recordId).sort()).toEqual(['MAT-QMS8C-STAMP', 'MSP-QMS8C-STAMP'])

    const stamped = fake.records.get('MAT-QMS8C-STAMP')!.payload as Record<string, unknown>
    expect(stamped.state).toBe('proposed')
    expect(stamped.lifecycleId).toBe('lab-vocabulary-control')

    // The write went through the normal walls: expectedSha-free fake still
    // carries viaLifecycleApi + actor and never a skip flag.
    const write = (fake.store.update as unknown as { mock: { calls: Array<Record<string, unknown>> } }).mock.calls
      .map(c => c[0] as Record<string, unknown>)
      .find(c => (c.envelope as RecordEnvelope).recordId === 'MAT-QMS8C-STAMP')!
    expect(write.viaLifecycleApi).toBe(true)
    expect(write.actor).toBe('USR-QMS8C')
    expect(write.skipValidation).toBeUndefined()
    expect(write.skipLint).toBeUndefined()

    // Second apply writes nothing (re-derivable).
    const rerun = await migrateRecordLifecycles({
      store: fake.store, coverage, engine, resolvedDir: '/fake/qms8c-vocab-stamp', apply: true, log: () => {},
    })
    expect(rerun.planned).toEqual([])
    expect(rerun.applied).toEqual([])

    // And with state now present, the gate fires on the unauthorized activation.
    const result = checkLifecycleTransition(engine, {
      previousPayload: stamped,
      nextPayload: { ...stamped, state: 'active' },
      actorId: 'USR-AUTHOR',
      actorRoles: [],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(false)
    expect(String(result.error)).toMatch(/different person/)
  })
})

// ===========================================================================
// 4 — no server-side instruction mints a domain status (D1 / D7)
// ===========================================================================

describe('QMS8-C: the server stops instructing payloads to carry domain status', () => {
  it('the AI precompile system prompt carries no "set status to active" instruction (D1)', () => {
    const source = readFileSync(join(here, '../api/handlers/RecordSearchHandlers.ts'), 'utf-8')
    expect(source).not.toMatch(/Set status to 'active'/)
  })
})
