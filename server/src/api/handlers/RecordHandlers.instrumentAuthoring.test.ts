/**
 * QMS8-B — draft-gated registry authoring for instrument/equipment.
 *
 * Harness mirrors RecordHandlers.roleGrant.test.ts (the only wired `authoring:`
 * precedent on this trunk): the REAL lint YAML is loaded from disk, a mock
 * store holds role-grant records, and the REAL RoleResolver answers the
 * handler. The REAL registry-kind coverage file backs the lifecycle-scope
 * accessor, exactly like server.ts wires it.
 *
 * The RED discriminator (spec §RED-first case 1): an actor holding ONLY
 * author@document-controlled-signing (the GRANT-DEMO-AUTHOR shape) must be
 * DENIED an instrument create under authoringGate:deny. On the unfixed handler
 * rolesFor() is called UNSCOPED, so that inert demo grant leaks through —
 * that failure is the per-lifecycle-scope proof.
 *
 * Bundle semantics (Option B, orchestrator ruling OQ-1): the new blocks declare
 * `gateOnPolicySetting: authoringGate`, so they fire only when the ACTIVE
 * bundle resolves that setting to 'deny'. role-grant's own block declares NO
 * gateOnPolicySetting and stays bundle-blind (privilege-escalation guard).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordEnvelope, RecordFilter, RecordStore } from '../../store/types.js';
import type { AuthoringPolicy } from '../../lint/types.js';
import { LintEngine } from '../../lint/LintEngine.js';
import { loadAllLintSpecs } from '../../lint/LintSpecLoader.js';
import { LifecycleEngine } from '../../lifecycle/LifecycleEngine.js';
import { loadLifecyclesFromDir } from '../../lifecycle/LifecycleLoader.js';
import { loadKindLifecycleRegistry, collectKnownKinds, type KindLifecycleRegistry } from '../../registry/KindLifecycleRegistry.js';
import { loadAllSchemas } from '../../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../../schema/SchemaRegistry.js';
import { RoleResolver } from '../../security/RoleResolver.js';
import { createRecordHandlers } from './RecordHandlers.js';
import { LOCAL_ADMIN_USER_ID } from '../../security/LocalIdentityService.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(here, '../../../../schema');

const SID = (name: string) => `https://computable-lab.com/schema/computable-lab/${name}`;
const INSTRUMENT_SCHEMA_ID = SID('instrument.schema.yaml');
const EQUIPMENT_SCHEMA_ID = SID('equipment.schema.yaml');
const ROLE_GRANT_SCHEMA_ID = SID('role-grant.schema.yaml');

// ---------------------------------------------------------------------------
// Real data files (the guard's VALUES must come from YAML, never this file)
// ---------------------------------------------------------------------------

function readAuthoringLint(relPath: string): { lint: Record<string, unknown>; authoring: AuthoringPolicy } {
  const doc = parseYaml(readFileSync(join(SCHEMA_DIR, relPath), 'utf-8')) as { authoring?: AuthoringPolicy };
  expect(doc.authoring).toBeDefined();
  return { lint: doc as Record<string, unknown>, authoring: doc.authoring as AuthoringPolicy };
}

const instrumentLint = readAuthoringLint('lab/instrument.lint.yaml');
const equipmentLint = readAuthoringLint('lab/equipment.lint.yaml');
const roleGrantLint = readAuthoringLint('identity/role-grant.lint.yaml');

// ---------------------------------------------------------------------------
// Real coverage registry (same wiring as server.ts:790) — the lifecycle scope
// for the authoring gate flows from this data, never from a TS literal.
// ---------------------------------------------------------------------------

let coverage: KindLifecycleRegistry;

beforeAll(async () => {
  const engine = new LifecycleEngine();
  const count = loadLifecyclesFromDir(join(SCHEMA_DIR, 'core/lifecycles'), engine);
  expect(count).toBeGreaterThanOrEqual(2);
  expect(engine.isLoaded('registry-ops')).toBe(true);

  const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
  const registry = createSchemaRegistry();
  registry.addSchemas(loaded.entries);
  // Kind names come from each schema's declared `const` — data-derived.
  coverage = loadKindLifecycleRegistry(join(SCHEMA_DIR, 'registry/registry-kinds.registry.yaml'), {
    lifecycle: engine,
    knownKinds: collectKnownKinds(registry.getAll()),
  });
});

// ---------------------------------------------------------------------------
// Mock store: Map-backed; role-grant records live here so the REAL
// RoleResolver answers the handler exactly as it does on a live lane.
// ---------------------------------------------------------------------------

interface World {
  records: Map<string, RecordEnvelope>;
  store: RecordStore;
  handlers: ReturnType<typeof createRecordHandlers>;
}

interface WorldOptions {
  userId: string | null;
  isSystem?: boolean;
  grants?: Array<{ recordId: string; userId: string; roles: string[]; lifecycleId?: string }>;
  authoringGate: 'allow' | 'deny';
  enforceTransitionRoles?: 'allow' | 'deny';
}

function envelope(recordId: string, schemaId: string, payload: Record<string, unknown>): RecordEnvelope {
  return {
    recordId,
    schemaId,
    payload: { recordId, ...payload },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-QMS8B' },
  } as unknown as RecordEnvelope;
}

function makeWorld(options: WorldOptions, existing?: RecordEnvelope): World {
  const records = new Map<string, RecordEnvelope>();
  for (const g of options.grants ?? []) {
    records.set(g.recordId, envelope(g.recordId, ROLE_GRANT_SCHEMA_ID, {
      kind: 'role-grant',
      recordId: g.recordId,
      userId: g.userId,
      roles: g.roles,
      ...(g.lifecycleId !== undefined ? { lifecycleId: g.lifecycleId } : {}),
    }));
  }
  if (existing) records.set(existing.recordId, existing);

  const list = vi.fn(async (filter?: RecordFilter) => {
    const all = [...records.values()];
    if (filter?.kind) {
      return all.filter(r => (r.payload as Record<string, unknown>)?.kind === filter.kind);
    }
    return all;
  });
  const create = vi.fn(async (o: { envelope: RecordEnvelope }) => {
    records.set(o.envelope.recordId, o.envelope);
    return { success: true, envelope: o.envelope };
  });
  const update = vi.fn(async (o: { envelope: RecordEnvelope }) => {
    records.set(o.envelope.recordId, o.envelope);
    return { success: true, envelope: o.envelope };
  });

  const store = {
    get: vi.fn(async (id: string) => records.get(id) ?? null),
    getByPath: vi.fn(async () => null),
    getWithValidation: vi.fn(async () => ({ success: true })),
    list,
    create,
    update,
    delete: vi.fn(async () => ({ success: true })),
    validate: vi.fn(async () => ({ valid: true })),
    lint: vi.fn(async () => ({ valid: true })),
    exists: vi.fn(async () => false),
  } as unknown as RecordStore;

  const handlers = createRecordHandlers(
    store,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      identityService: { resolveRequestUser: async () => ({ userId: options.userId, isSystem: options.isSystem ?? false }) },
      roleResolver: new RoleResolver(store),
      getAuthoringPolicy: (schemaId: string) =>
        schemaId === INSTRUMENT_SCHEMA_ID ? instrumentLint.authoring
        : schemaId === EQUIPMENT_SCHEMA_ID ? equipmentLint.authoring
        : schemaId === ROLE_GRANT_SCHEMA_ID ? roleGrantLint.authoring
        : undefined,
      getPolicySettings: () => ({
        enforceTransitionRoles: options.enforceTransitionRoles ?? 'deny',
        authoringGate: options.authoringGate,
      }),
      getKindLifecycleCoverage: () => coverage,
    } as any,
  );

  return { records, store, handlers };
}

function makeReply() {
  let statusValue = 200;
  let responseBody: unknown = {};
  const reply: any = {
    status: (code: number) => { statusValue = code; return reply; },
    send: (body: unknown) => { responseBody = body; return reply; },
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  Object.defineProperty(reply, 'responseBody', { get: () => responseBody });
  return reply as FastifyReply & { statusValue: number; responseBody: unknown };
}

function createRequest(schemaId: string, payload: Record<string, unknown>) {
  return {
    body: { schemaId, payload },
    headers: { 'x-user-id': 'unused-in-stub' },
  } as unknown as FastifyRequest<{ Body: { schemaId: string; payload: unknown } }>;
}

function updateRequest(id: string, payload: Record<string, unknown>) {
  return {
    params: { id },
    body: { payload },
    headers: { 'x-user-id': 'unused-in-stub' },
  } as unknown as FastifyRequest<{ Params: { id: string }; Body: { payload: unknown } }>;
}

// Payload builders — required fields come from the schemas' own `required` lists.
const equipmentPayload = (id: string, overrides: Record<string, unknown> = {}) => ({
  kind: 'equipment',
  id,
  name: 'QMS8-B probe equipment',
  status: 'active',
  ...overrides,
});

const instrumentPayload = (id: string, overrides: Record<string, unknown> = {}) => ({
  kind: 'instrument',
  id,
  name: 'QMS8-B probe instrument',
  ...overrides,
});

const DEMO_GRANT = [{ recordId: 'GRANT-QMS8B-DEMO', userId: 'USR-BRAD', roles: ['author'], lifecycleId: 'document-controlled-signing' }];
const REGOPS_GRANT = [{ recordId: 'GRANT-QMS8B-REGOPS', userId: 'USR-BRAD', roles: ['author'], lifecycleId: 'registry-ops' }];
const UNSCOPED_GRANT = [{ recordId: 'GRANT-QMS8B-UNSCOPED', userId: 'USR-BRAD', roles: ['author'] }];

async function create(world: World, schemaId: string, payload: Record<string, unknown>) {
  const reply = makeReply();
  const result = await world.handlers.createRecord(createRequest(schemaId, payload), reply);
  return { result: result as unknown as Record<string, unknown>, status: reply.statusValue };
}

async function update(world: World, id: string, payload: Record<string, unknown>) {
  const reply = makeReply();
  const result = await world.handlers.updateRecord(updateRequest(id, payload), reply);
  return { result: result as unknown as Record<string, unknown>, status: reply.statusValue };
}

function storedPayload(world: World, id: string): Record<string, unknown> {
  return world.records.get(id)!.payload as Record<string, unknown>;
}

// ===========================================================================
// 1. RED discriminator — the demo-grant leak (per-lifecycle scope proof)
// ===========================================================================

describe('QMS8-B authoring gate is lifecycle-scoped (RED discriminator)', () => {
  it('author@document-controlled-signing ALONE cannot author an equipment draft under authoringGate:deny', async () => {
    const world = makeWorld({ userId: 'USR-BRAD', grants: DEMO_GRANT, authoringGate: 'deny' });
    const created = await create(world, EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-LEAK'));
    expect(created.status).toBe(403);
    expect(created.result.error).toBe('EQUIPMENT_AUTHORING_FORBIDDEN');
    expect(typeof created.result.message).toBe('string');
    expect(created.result.code).toBeUndefined(); // denial bodies are {error, message} — no code field
    expect(world.records.has('EQP-QMS8B-LEAK')).toBe(false);
  });

  it('author@document-controlled-signing ALONE cannot author an instrument draft under authoringGate:deny', async () => {
    const world = makeWorld({ userId: 'USR-BRAD', grants: DEMO_GRANT, authoringGate: 'deny' });
    const created = await create(world, INSTRUMENT_SCHEMA_ID, instrumentPayload('INSTR-QMS8B-LEAK'));
    expect(created.status).toBe(403);
    expect(created.result.error).toBe('INSTRUMENT_AUTHORING_FORBIDDEN');
    expect(world.records.has('INSTR-QMS8B-LEAK')).toBe(false);
  });

  it('the same actor WITH author@registry-ops passes, and the coverage stamp still lands (state=draft)', async () => {
    const world = makeWorld({ userId: 'USR-BRAD', grants: REGOPS_GRANT, authoringGate: 'deny' });
    const created = await create(world, EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-OK'));
    expect(created.status).toBe(201);
    expect(created.result.success).toBe(true);
    const payload = storedPayload(world, 'EQP-QMS8B-OK');
    expect(payload.lifecycleId).toBe('registry-ops');
    expect(payload.state).toBe('draft');
  });

  it('an UNSCOPED grant (no lifecycleId) still passes — RoleResolver superset semantics are intentional', async () => {
    const world = makeWorld({ userId: 'USR-BRAD', grants: UNSCOPED_GRANT, authoringGate: 'deny' });
    const created = await create(world, EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-UNSCOPED'));
    expect(created.status).toBe(201);
    expect(world.records.has('EQP-QMS8B-UNSCOPED')).toBe(true);
  });

  it('a grant scoped to ANOTHER lifecycle still passes an UNSCOPED role requirement check (role-grant leg unchanged)', async () => {
    // role-grant's own block has no lifecycle scope to resolve against (role-grant
    // is not coverage-covered): the admin check stays unscoped, byte-identical.
    const world = makeWorld({ userId: 'USR-QMS-ADMIN', grants: [{ recordId: 'GRANT-QMS8B-ADMIN', userId: 'USR-QMS-ADMIN', roles: ['admin'], lifecycleId: 'document-controlled-signing' }], authoringGate: 'deny' });
    const created = await create(world, ROLE_GRANT_SCHEMA_ID, { kind: 'role-grant', recordId: 'GRANT-QMS8B-MINT', userId: 'USR-SOMEONE', roles: ['author'] });
    expect(created.status).toBe(201);
    expect(storedPayload(world, 'GRANT-QMS8B-MINT').grantedBy).toBe('USR-QMS-ADMIN');
  });

  it('role-grant stays UNSCOPED even when the mint payload declares a lifecycleId (byte-identical; mirrors the spec §5 mint probe)', async () => {
    // role-grant is NOT coverage-covered, so the gate resolves no scope and the
    // admin check stays today's unscoped superset call — this is exactly how the
    // spec's §5 GRANT-BRAD-REGOPS mint (payload declares registry-ops, actor's
    // admin grant is scoped elsewhere) must behave.
    const world = makeWorld({ userId: 'USR-QMS-ADMIN', grants: [{ recordId: 'GRANT-QMS8B-ADMIN', userId: 'USR-QMS-ADMIN', roles: ['admin'], lifecycleId: 'document-controlled-signing' }], authoringGate: 'deny' });
    const created = await create(world, ROLE_GRANT_SCHEMA_ID, { kind: 'role-grant', recordId: 'GRANT-QMS8B-MINT2', userId: 'USR-BRAD', roles: ['author'], lifecycleId: 'registry-ops' });
    expect(created.status).toBe(201);
    expect(storedPayload(world, 'GRANT-QMS8B-MINT2').grantedBy).toBe('USR-QMS-ADMIN');
    expect(storedPayload(world, 'GRANT-QMS8B-MINT2').lifecycleId).toBe('registry-ops');
  });

  it('a covered kind declaring its own lifecycleId is STILL scoped by coverage — the demo grant stays inert', async () => {
    // The payload declares registry-ops (the only value its schema enum allows);
    // scope comes from the coverage entry, so author@document-controlled-signing
    // cannot pass by declaring the lifecycle it is inert for.
    const world = makeWorld({ userId: 'USR-BRAD', grants: DEMO_GRANT, authoringGate: 'deny' });
    const created = await create(world, EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-DECL', { lifecycleId: 'registry-ops' }));
    expect(created.status).toBe(403);
    expect(created.result.error).toBe('EQUIPMENT_AUTHORING_FORBIDDEN');
    expect(world.records.has('EQP-QMS8B-DECL')).toBe(false);
  });
});

// ===========================================================================
// 2. Bundle semantics — gateOnPolicySetting: authoringGate (Option B)
// ===========================================================================

describe('QMS8-B authoring blocks are bundle-gated (gateOnPolicySetting)', () => {
  it('authoringGate:allow (sandbox-equivalent) + NO roles at all → no gate, create proceeds', async () => {
    const world = makeWorld({ userId: 'USR-BRAD', grants: [], authoringGate: 'allow' });
    const created = await create(world, EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-SANDBOX'));
    expect(created.status).toBe(201);
    expect(world.records.has('EQP-QMS8B-SANDBOX')).toBe(true);
  });

  it('authoringGate:allow + instrument with no roles → proceeds (zero friction under sandbox)', async () => {
    const world = makeWorld({ userId: 'USR-BRAD', grants: [], authoringGate: 'allow' });
    const created = await create(world, INSTRUMENT_SCHEMA_ID, instrumentPayload('INSTR-QMS8B-SANDBOX'));
    expect(created.status).toBe(201);
  });

  it('authoringGate:deny + no roles at all → 403 on both kinds', async () => {
    const eq = makeWorld({ userId: 'USR-BRAD', grants: [], authoringGate: 'deny' });
    const eqRes = await create(eq, EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-NOROLE'));
    expect(eqRes.status).toBe(403);
    expect(eqRes.result.error).toBe('EQUIPMENT_AUTHORING_FORBIDDEN');

    const inst = makeWorld({ userId: 'USR-BRAD', grants: [], authoringGate: 'deny' });
    const instRes = await create(inst, INSTRUMENT_SCHEMA_ID, instrumentPayload('INSTR-QMS8B-NOROLE'));
    expect(instRes.status).toBe(403);
    expect(instRes.result.error).toBe('INSTRUMENT_AUTHORING_FORBIDDEN');
  });

  it('localAdmin and systemActor pass under deny; an unrelated role fails', async () => {
    const admin = makeWorld({ userId: LOCAL_ADMIN_USER_ID, grants: [], authoringGate: 'deny' });
    expect((await create(admin, EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-ADMIN'))).status).toBe(201);

    const sys = makeWorld({ userId: 'USR-SYSTEM-SVC', isSystem: true, grants: [], authoringGate: 'deny' });
    expect((await create(sys, EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-SYSTEM'))).status).toBe(201);

    const wrong = makeWorld({ userId: 'USR-BRAD', grants: [{ recordId: 'GRANT-QMS8B-REVIEWER', userId: 'USR-BRAD', roles: ['reviewer'], lifecycleId: 'registry-ops' }], authoringGate: 'deny' });
    const res = await create(wrong, EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-WRONGROLE'));
    expect(res.status).toBe(403);
    expect(res.result.error).toBe('EQUIPMENT_AUTHORING_FORBIDDEN');
  });
});

// ===========================================================================
// 3. Update leg — guardWhenChanged (top-level keys only)
// ===========================================================================

describe('QMS8-B update leg fires only on declared guardWhenChanged keys', () => {
  const existingEquipment = () => envelope('EQP-QMS8B-EXIST', EQUIPMENT_SCHEMA_ID, equipmentPayload('EQP-QMS8B-EXIST', {
    location: 'Bench 3',
    notes: 'original notes',
    lifecycleId: 'registry-ops',
    state: 'draft',
  }));

  it('a no-op update never fires the gate (undeclared change ⇒ no actor check)', async () => {
    const world = makeWorld({ userId: 'USR-BRAD', grants: [], authoringGate: 'deny' }, existingEquipment());
    const payload = equipmentPayload('EQP-QMS8B-EXIST', { location: 'Bench 3', notes: 'original notes', lifecycleId: 'registry-ops', state: 'draft' });
    const res = await update(world, 'EQP-QMS8B-EXIST', payload);
    expect(res.status).not.toBe(403);
    expect((world.store.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('changing ONLY notes does NOT fire the gate (notes is deliberately excluded)', async () => {
    const world = makeWorld({ userId: 'USR-BRAD', grants: [], authoringGate: 'deny' }, existingEquipment());
    const payload = equipmentPayload('EQP-QMS8B-EXIST', { location: 'Bench 3', notes: 'annotated further', lifecycleId: 'registry-ops', state: 'draft' });
    const res = await update(world, 'EQP-QMS8B-EXIST', payload);
    expect(res.status).not.toBe(403);
    expect((world.store.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(storedPayload(world, 'EQP-QMS8B-EXIST').notes).toBe('annotated further');
  });

  it('changing name fires the gate → 403 EQUIPMENT_AUTHORING_FORBIDDEN, stored record untouched', async () => {
    const world = makeWorld({ userId: 'USR-BRAD', grants: [], authoringGate: 'deny' }, existingEquipment());
    const payload = equipmentPayload('EQP-QMS8B-EXIST', { name: 'Renamed by an unauthorised actor', location: 'Bench 3', notes: 'original notes', lifecycleId: 'registry-ops', state: 'draft' });
    const res = await update(world, 'EQP-QMS8B-EXIST', payload);
    expect(res.status).toBe(403);
    expect(res.result.error).toBe('EQUIPMENT_AUTHORING_FORBIDDEN');
    expect((world.store.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(storedPayload(world, 'EQP-QMS8B-EXIST').name).toBe('QMS8-B probe equipment');
  });

  it('changing location fires the gate; an author@registry-ops holder may make the same edit', async () => {
    const denied = makeWorld({ userId: 'USR-BRAD', grants: DEMO_GRANT, authoringGate: 'deny' }, existingEquipment());
    const deniedRes = await update(denied, 'EQP-QMS8B-EXIST', equipmentPayload('EQP-QMS8B-EXIST', { location: 'Bench 9', notes: 'original notes', lifecycleId: 'registry-ops', state: 'draft' }));
    expect(deniedRes.status).toBe(403);

    const allowed = makeWorld({ userId: 'USR-BRAD', grants: REGOPS_GRANT, authoringGate: 'deny' }, existingEquipment());
    const allowedRes = await update(allowed, 'EQP-QMS8B-EXIST', equipmentPayload('EQP-QMS8B-EXIST', { location: 'Bench 9', notes: 'original notes', lifecycleId: 'registry-ops', state: 'draft' }));
    expect(allowedRes.status).not.toBe(403);
    expect(storedPayload(allowed, 'EQP-QMS8B-EXIST').location).toBe('Bench 9');
  });

  it('instrument update: changing name fires INSTRUMENT_AUTHORING_FORBIDDEN for a demo-grant-only actor', async () => {
    const existing = envelope('INSTR-QMS8B-EXIST', INSTRUMENT_SCHEMA_ID, instrumentPayload('INSTR-QMS8B-EXIST', { lifecycleId: 'registry-ops', state: 'draft' }));
    const world = makeWorld({ userId: 'USR-BRAD', grants: DEMO_GRANT, authoringGate: 'deny' }, existing);
    const res = await update(world, 'INSTR-QMS8B-EXIST', instrumentPayload('INSTR-QMS8B-EXIST', { name: 'Renamed instrument', lifecycleId: 'registry-ops', state: 'draft' }));
    expect(res.status).toBe(403);
    expect(res.result.error).toBe('INSTRUMENT_AUTHORING_FORBIDDEN');
  });
});

// ===========================================================================
// 4. role-grant regression — its guard is bundle-INDEPENDENT
// ===========================================================================

describe('QMS8-B role-grant guard stays bundle-blind (no gateOnPolicySetting)', () => {
  it('role-grant lint declares NO gateOnPolicySetting (privilege guard never sleeps)', () => {
    expect(roleGrantLint.authoring.gateOnPolicySetting).toBeUndefined();
  });

  it('under authoringGate:allow, a non-admin create of a role-grant STILL 403s GRANT_FORBIDDEN', async () => {
    const world = makeWorld({ userId: 'USR-SCIENTIST', grants: [], authoringGate: 'allow' });
    const res = await create(world, ROLE_GRANT_SCHEMA_ID, { kind: 'role-grant', recordId: 'GRANT-QMS8B-ESCALATE', userId: 'USR-SCIENTIST', roles: ['admin'] });
    expect(res.status).toBe(403);
    expect(res.result.error).toBe('GRANT_FORBIDDEN');
    expect(world.records.has('GRANT-QMS8B-ESCALATE')).toBe(false);
  });

  it('under authoringGate:allow, a non-admin PATCH of grant roles STILL 403s', async () => {
    const existing = envelope('GRANT-QMS8B-TARGET', ROLE_GRANT_SCHEMA_ID, { kind: 'role-grant', recordId: 'GRANT-QMS8B-TARGET', userId: 'USR-SCIENTIST', roles: ['reviewer'] });
    const world = makeWorld({ userId: 'USR-SCIENTIST', grants: [], authoringGate: 'allow' }, existing);
    const res = await update(world, 'GRANT-QMS8B-TARGET', { kind: 'role-grant', recordId: 'GRANT-QMS8B-TARGET', userId: 'USR-SCIENTIST', roles: ['admin'] });
    expect(res.status).toBe(403);
    expect(res.result.error).toBe('GRANT_FORBIDDEN');
    expect((world.store.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. Lint-file contract tests (data is the policy)
// ===========================================================================

describe('QMS8-B lint-file contract', () => {
  const cases = [
    { name: 'instrument', lint: instrumentLint, schemaFile: 'lab/instrument.schema.yaml', schemaId: INSTRUMENT_SCHEMA_ID, denyCode: 'INSTRUMENT_AUTHORING_FORBIDDEN' },
    { name: 'equipment', lint: equipmentLint, schemaFile: 'lab/equipment.schema.yaml', schemaId: EQUIPMENT_SCHEMA_ID, denyCode: 'EQUIPMENT_AUTHORING_FORBIDDEN' },
  ] as const;

  for (const c of cases) {
    it(`${c.name}.lint.yaml: schemaId byte-matches the schema $id (mismatch = silent no-gate)`, () => {
      const schema = parseYaml(readFileSync(join(SCHEMA_DIR, c.schemaFile), 'utf-8')) as { $id: string; properties: Record<string, unknown> };
      expect(c.lint.lint.schemaId).toBe(schema.$id);
      expect(c.lint.lint.schemaId).toBe(c.schemaId);
    });

    it(`${c.name}.lint.yaml: require.anyOf declares exactly the three actor-side shapes`, () => {
      const anyOf = c.lint.authoring.require.anyOf as Array<Record<string, unknown>>;
      expect(Array.isArray(anyOf)).toBe(true);
      const legalKeys = new Set(['systemActor', 'localAdmin', 'role', 'userId']);
      const declared = new Set<string>();
      for (const req of anyOf) {
        const keys = Object.keys(req);
        expect(keys.length).toBe(1);
        expect(legalKeys.has(keys[0]!)).toBe(true);
        declared.add(keys[0]!);
      }
      expect([...declared].sort()).toEqual(['localAdmin', 'role', 'systemActor']);
      expect(anyOf.find(r => r.role !== undefined)?.role).toEqual(expect.any(String));
    });

    it(`${c.name}.lint.yaml: denyCode + gateOnPolicySetting are declared`, () => {
      expect(c.lint.authoring.denyCode).toBe(c.denyCode);
      expect(c.lint.authoring.gateOnPolicySetting).toBe('authoringGate');
      expect(c.lint.authoring.stampActorAs).toBeUndefined();
    });

    it(`${c.name}.lint.yaml: every guardWhenChanged entry is a TOP-LEVEL property of the schema`, () => {
      const schema = parseYaml(readFileSync(join(SCHEMA_DIR, c.schemaFile), 'utf-8')) as { properties: Record<string, unknown> };
      const props = Object.keys(schema.properties);
      const guarded = c.lint.authoring.guardWhenChanged ?? [];
      expect(guarded.length).toBeGreaterThan(0);
      for (const p of guarded) {
        expect(p).not.toContain('.'); // dotted paths silently never match
        expect(props).toContain(p);
      }
    });
  }

  it('the shipped lint files reach the LintEngine and resolve by schemaId (no silent no-gate)', async () => {
    const loaded = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
    // Pre-existing trunk debt: core/lab-state.lint.yaml reports a loader error at
    // base too. What must hold for THIS item: neither new block fails to load.
    const offenders = loaded.errors.filter(e => /instrument|equipment/.test(e.path));
    expect(offenders).toEqual([]);
    const engine = new LintEngine();
    for (const { name, spec } of loaded.specs) engine.addSpec(name, spec);
    expect(engine.authoringPolicyForSchema(INSTRUMENT_SCHEMA_ID)?.denyCode).toBe('INSTRUMENT_AUTHORING_FORBIDDEN');
    expect(engine.authoringPolicyForSchema(EQUIPMENT_SCHEMA_ID)?.denyCode).toBe('EQUIPMENT_AUTHORING_FORBIDDEN');
    expect(engine.authoringPolicyForSchema(ROLE_GRANT_SCHEMA_ID)?.denyCode).toBe('GRANT_FORBIDDEN');
  });
});
