/**
 * governanceStrictness.test.ts — executable proof of
 * specs/computable-lab-qms-governance-architecture.md §15:
 *
 *   same schemas, same transition, different policy package → different behavior.
 *
 * Four policy-bundle-dependent governance cases, driven end-to-end through
 * RecordHandlers.updateRecord (direct handler invocation, fake in-memory
 * store, real LifecycleEngine loaded from schema/core/lifecycles/*.yaml and
 * real PolicyBundleService loaded from schema/core/policy-bundles/*.yaml):
 *
 *   1. POL-SANDBOX: role-free transition is ALLOWED (enforceTransitionRoles
 *      resolves 'allow'), but illegal structure is still 422 — only role
 *      strictness is loosened, not lifecycle structure.
 *   2. POL-REGULATED: the same in_review→approved transition is DENIED (422
 *      LIFECYCLE_TRANSITION_DENIED) when the actor holds no reviewer grant.
 *   3. A role-grant record unblocks exactly that transition (422 → success).
 *   4. document-controlled-signing under POL-REGULATED: approval without a
 *      minted signature fails closed; presenting a validated signature
 *      record via body.signatureRefs succeeds.
 *
 * Woven in: audit-event emission on the successful role-gated transition,
 * and 405 APPEND_ONLY when attempting to mutate that audit event through
 * the record API.
 *
 * NOTE on signing auth: password re-auth lives on the SIGNATURE MINTING
 * endpoint (SignatureHandlers), which this test bypasses by seeding the
 * signature record directly — that is intentional; minting-path auth is
 * covered by SignatureHandlers.test.ts. We still sanity-check the real
 * scrypt verifier pair (hashPassword/verifyPassword) that the minting path
 * relies on.
 */
import { describe, it, expect, vi } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordEnvelope, RecordStore, RecordFilter, StoreResult } from '../store/types.js';
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js';
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js';
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import { RoleResolver } from '../security/RoleResolver.js';
import { LocalIdentityService } from '../security/LocalIdentityService.js';
import { AuditEventService } from '../governance/AuditEventService.js';
import { hashPassword, verifyPassword } from '../security/CredentialStore.js';
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js';

// ---------------------------------------------------------------------------
// Fixtures over REAL data files (resolved from this file's location so the
// test is independent of vitest's cwd).
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const LIFECYCLES_DIR = join(here, '../../../schema/core/lifecycles');
const BUNDLES_DIR = join(here, '../../../schema/core/policy-bundles');

const DOC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/document.schema.yaml';

function loadEngine(): LifecycleEngine {
  const engine = new LifecycleEngine();
  const count = loadLifecyclesFromDir(LIFECYCLES_DIR, engine);
  // Non-vacuity guard: the real YAMLs must actually be loaded.
  expect(count).toBeGreaterThanOrEqual(2);
  expect(engine.isLoaded('document-control')).toBe(true);
  expect(engine.isLoaded('document-controlled-signing')).toBe(true);
  return engine;
}

function loadPolicyService(): PolicyBundleService {
  const service = new PolicyBundleService();
  const count = service.loadFromDir(BUNDLES_DIR);
  expect(count).toBeGreaterThanOrEqual(2);
  expect(service.getBundle('POL-SANDBOX')).toBeDefined();
  expect(service.getBundle('POL-REGULATED')).toBeDefined();
  // The bundle settings themselves are part of what §15 claims.
  expect(service.resolveSettings('POL-SANDBOX').enforceTransitionRoles).toBe('allow');
  expect(service.resolveSettings('POL-REGULATED').enforceTransitionRoles).toBe('deny');
  return service;
}

// ---------------------------------------------------------------------------
// Fake store: a Map-backed RecordStore so role-grants, signatures, users and
// audit events all live in one inspectable in-memory dataset.
// ---------------------------------------------------------------------------

interface FakeStore {
  store: RecordStore;
  records: Map<string, RecordEnvelope>;
  seed(envelope: RecordEnvelope): void;
}

function makeFakeStore(): FakeStore {
  const records = new Map<string, RecordEnvelope>();

  const get = vi.fn(async (id: string) => records.get(id) ?? null);
  const list = vi.fn(async (filter?: RecordFilter) => {
    const all = [...records.values()];
    if (filter?.kind) {
      return all.filter(r => (r.payload as Record<string, unknown>)?.kind === filter.kind);
    }
    return all;
  });
  const create = vi.fn(async (options: { envelope: RecordEnvelope }): Promise<StoreResult> => {
    records.set(options.envelope.recordId, options.envelope);
    return { success: true, envelope: options.envelope };
  });
  const update = vi.fn(async (options: { envelope: RecordEnvelope }): Promise<StoreResult> => {
    records.set(options.envelope.recordId, options.envelope);
    return {
      success: true,
      envelope: options.envelope,
      commit: { sha: 'abc1234', message: 'test update', timestamp: new Date().toISOString() },
    };
  });

  const store = {
    get,
    getByPath: vi.fn(async () => null),
    getWithValidation: vi.fn(async () => ({ success: true })),
    list,
    create,
    update,
    delete: vi.fn(async (): Promise<StoreResult> => ({ success: true })),
    validate: vi.fn(async () => ({ valid: true })),
    lint: vi.fn(async () => ({ valid: true })),
    exists: vi.fn(async () => false),
  } as unknown as RecordStore;

  return {
    store,
    records,
    seed(envelope: RecordEnvelope) {
      records.set(envelope.recordId, envelope);
    },
  };
}

function envelope(recordId: string, payload: Record<string, unknown>, schemaId = DOC_SCHEMA_ID): RecordEnvelope {
  return {
    recordId,
    schemaId,
    payload: { recordId, ...payload },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-ANALYST' },
  } as unknown as RecordEnvelope;
}

function seedActiveUsers(fake: FakeStore): void {
  for (const id of ['USR-ANALYST', 'USR-REVIEWER']) {
    fake.seed(envelope(id, { kind: 'user', recordId: id, username: id.toLowerCase(), status: 'active' },
      'https://computable-lab.com/schema/computable-lab/user.schema.yaml'));
  }
}

function seedReviewerGrant(fake: FakeStore, lifecycleId: string, recordId = 'GRANT-REVIEW'): void {
  fake.seed(envelope(recordId, {
    kind: 'role-grant',
    recordId,
    userId: 'USR-REVIEWER',
    lifecycleId,
    roles: ['reviewer'],
  }, 'https://computable-lab.com/schema/computable-lab/role-grant.schema.yaml'));
}

// ---------------------------------------------------------------------------
// Handler world: one per case, wired exactly like server.ts wires security
// options into createRecordHandlers.
// ---------------------------------------------------------------------------

interface World {
  fake: FakeStore;
  handlers: ReturnType<typeof createRecordHandlers>;
}

function makeWorld(bundleId: 'POL-SANDBOX' | 'POL-REGULATED'): World {
  const fake = makeFakeStore();
  seedActiveUsers(fake);
  const identityService = new LocalIdentityService(fake.store);
  const roleResolver = new RoleResolver(fake.store);
  const auditService = new AuditEventService(fake.store);
  const policy = loadPolicyService();
  const handlers = createRecordHandlers(
    fake.store,
    undefined,
    undefined,
    undefined,
    loadEngine(),
    undefined,
    {
      identityService,
      roleResolver,
      auditService,
      getPolicySettings: () => ({ enforceTransitionRoles: policy.resolveSettings(bundleId).enforceTransitionRoles }),
      getAppendOnlyKinds: () => ['audit-event', 'signature'],
    },
  );
  return { fake, handlers };
}

function makeReply() {
  let statusValue = 200;
  const reply = {
    status: (code: number) => { statusValue = code; return reply; },
    send: (body: unknown) => { void body; return reply; },
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  return reply as unknown as FastifyReply & { statusValue: number };
}

interface UpdateCall {
  id: string;
  payload: Record<string, unknown>;
  userId: string;
  signatureRefs?: string[];
}

async function callUpdate(world: World, call: UpdateCall) {
  const request = {
    params: { id: call.id },
    body: {
      payload: call.payload,
      // exactOptionalPropertyTypes: only include when presented.
      ...(call.signatureRefs !== undefined ? { signatureRefs: call.signatureRefs } : {}),
    },
    headers: { 'x-user-id': call.userId },
  } as unknown as FastifyRequest<{ Params: { id: string }; Body: { payload: Record<string, unknown>; signatureRefs?: string[] } }>;
  const reply = makeReply();
  const result = await world.handlers.updateRecord(request, reply);
  return { result: result as Record<string, unknown>, status: reply.statusValue };
}

function docPayload(lifecycleId: string, state: string): Record<string, unknown> {
  return { kind: 'document', recordId: 'DOC-1', lifecycleId, state, createdBy: 'USR-ANALYST' };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe('governance strictness is policy-bundle dependent (§15)', () => {
  it('case 1 — POL-SANDBOX allows the role-free draft→in_review transition but still rejects an illegal structural jump', async () => {
    const world = makeWorld('POL-SANDBOX');
    // Actor has NO grants at all: sandbox loosens only role strictness.
    world.fake.seed(envelope('DOC-1', docPayload('document-control', 'draft')));

    // Legal transition, no roles held → allowed under sandbox.
    const ok = await callUpdate(world, {
      id: 'DOC-1',
      payload: docPayload('document-control', 'in_review'),
      userId: 'USR-ANALYST',
    });
    expect(ok.status).toBe(200);
    expect(ok.result.success).toBe(true);
    expect((world.fake.records.get('DOC-1')!.payload as Record<string, unknown>).state).toBe('in_review');

    // Structural enforcement survives the sandbox: draft→approved is not a
    // declared transition at all, so it must 422 even with strictness off.
    const world2 = makeWorld('POL-SANDBOX');
    world2.fake.seed(envelope('DOC-1', docPayload('document-control', 'draft')));
    const bad = await callUpdate(world2, {
      id: 'DOC-1',
      payload: docPayload('document-control', 'approved'),
      userId: 'USR-ANALYST',
    });
    expect(bad.status).toBe(422);
    expect(bad.result.error).toBe('LIFECYCLE_TRANSITION_DENIED');
    expect(String(bad.result.message)).toContain("not allowed by the document-control lifecycle");
  });

  it('case 2 — POL-REGULATED denies the same in_review→approved transition when no reviewer grant exists', async () => {
    const world = makeWorld('POL-REGULATED');
    world.fake.seed(envelope('DOC-1', docPayload('document-control', 'in_review')));

    const denied = await callUpdate(world, {
      id: 'DOC-1',
      payload: docPayload('document-control', 'approved'),
      userId: 'USR-ANALYST',
    });
    expect(denied.status).toBe(422);
    expect(denied.result.error).toBe('LIFECYCLE_TRANSITION_DENIED');
    // The actor fails the reviewer-role requirement (and, as author, the
    // requires_different_person guard on the same transition).
    expect(String(denied.result.message).length).toBeGreaterThan(0);
    // Record must not have moved.
    expect((world.fake.records.get('DOC-1')!.payload as Record<string, unknown>).state).toBe('in_review');
  });

  it('case 3 — a role-grant record unblocks the regulated transition, emits an audit event, and the audit event is append-only', async () => {
    const world = makeWorld('POL-REGULATED');
    world.fake.seed(envelope('DOC-1', docPayload('document-control', 'in_review')));
    seedReviewerGrant(world.fake, 'document-control'); // GRANT-REVIEW

    const ok = await callUpdate(world, {
      id: 'DOC-1',
      payload: docPayload('document-control', 'approved'),
      userId: 'USR-REVIEWER',
    });
    expect(ok.status).toBe(200);
    expect(ok.result.success).toBe(true);
    expect((world.fake.records.get('DOC-1')!.payload as Record<string, unknown>).state).toBe('approved');

    // Audit-event emission: the lifecycle_transition happened and was logged.
    const audit = [...world.fake.records.values()].find(r => {
      const p = r.payload as Record<string, unknown>;
      return p.kind === 'audit-event' && p.action === 'lifecycle_transition' && p.actor === 'USR-REVIEWER';
    });
    expect(audit, 'audit-event record for the transition must exist').toBeDefined();
    const auditPayload = audit!.payload as Record<string, unknown>;
    expect(auditPayload.subjectId).toBe('DOC-1');
    expect((auditPayload.data as Record<string, unknown>).from).toBe('in_review');
    expect((auditPayload.data as Record<string, unknown>).to).toBe('approved');

    // Append-only: the audit event itself can never be mutated via the API.
    const mutate = await callUpdate(world, {
      id: audit!.recordId,
      payload: { ...(audit!.payload as Record<string, unknown>), action: 'TAMPERED' },
      userId: 'USR-ANALYST',
    });
    expect(mutate.status).toBe(405);
    expect(mutate.result.error).toBe('APPEND_ONLY');
    // And it truly did not change.
    expect((world.fake.records.get(audit!.recordId)!.payload as Record<string, unknown>).action).toBe('lifecycle_transition');
  });

  it('case 4 — signing lifecycle under POL-REGULATED fails closed without a signature and succeeds with a presented signature', async () => {
    const world = makeWorld('POL-REGULATED');
    const doc2 = { kind: 'document', recordId: 'DOC-2', lifecycleId: 'document-controlled-signing', state: 'in_review', createdBy: 'USR-ANALYST' };
    world.fake.seed(envelope('DOC-2', doc2));
    // RoleResolver scopes a grant to its lifecycleId, so the document-control
    // grant from case 3 does NOT apply to document-controlled-signing — seed
    // the signing-scoped reviewer grant for the same user.
    seedReviewerGrant(world.fake, 'document-controlled-signing', 'GRANT-REVIEW-SIGNING');

    // Sanity-check the real scrypt verifier pair the signature MINTING path
    // uses (SignatureHandlers re-authenticates with these before signing).
    // Minting-path auth is covered by SignatureHandlers.test.ts; this test
    // bypasses minting by seeding the signature record directly.
    const verifier = hashPassword('correct-horse');
    expect(verifyPassword('correct-horse', verifier)).toBe(true);
    expect(verifyPassword('wrong-password', verifier)).toBe(false);

    // No signatureRefs → requires_signature guard fails closed even though
    // the actor holds the reviewer role.
    const denied = await callUpdate(world, {
      id: 'DOC-2',
      payload: { ...doc2, state: 'approved' },
      userId: 'USR-REVIEWER',
    });
    expect(denied.status).toBe(422);
    expect(denied.result.error).toBe('LIFECYCLE_TRANSITION_DENIED');
    expect((world.fake.records.get('DOC-2')!.payload as Record<string, unknown>).state).toBe('in_review');

    // Mint a signature record (bypassing the minting endpoint, see header
    // note) bound to DOC-2 and signed by the acting user.
    world.fake.seed(envelope('SIG-T1', {
      kind: 'signature',
      recordId: 'SIG-T1',
      signedBy: 'USR-REVIEWER',
      action: 'approved',
      subject: { recordId: 'DOC-2', gitCommit: 'abc1234' },
    }, 'https://computable-lab.com/schema/computable-lab/signature.schema.yaml'));

    const ok = await callUpdate(world, {
      id: 'DOC-2',
      payload: { ...doc2, state: 'approved' },
      userId: 'USR-REVIEWER',
      signatureRefs: ['SIG-T1'],
    });
    expect(ok.status).toBe(200);
    expect(ok.result.success).toBe(true);
    expect((world.fake.records.get('DOC-2')!.payload as Record<string, unknown>).state).toBe('approved');

    // Signature records are append-only too.
    const mutateSig = await callUpdate(world, {
      id: 'SIG-T1',
      payload: { kind: 'signature', recordId: 'SIG-T1', signedBy: 'USR-REVIEWER', action: 'TAMPERED', subject: { recordId: 'DOC-2' } },
      userId: 'USR-REVIEWER',
    });
    expect(mutateSig.status).toBe(405);
    expect(mutateSig.result.error).toBe('APPEND_ONLY');
  });
});
