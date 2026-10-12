/**
 * W2-5 T3 — regulated lifecycle leg (spec §6 T3).
 *
 * Harness COPY of server/src/revisions/RevisionRoutes.test.ts (direct handlers)
 * + server/src/governance/governanceStrictness.test.ts (real LifecycleEngine
 * loaded from schema/core/lifecycles, real AuditEventService, POL-REGULATED
 * enforceTransitionRoles='deny', role-grant seeding) + the signature flow of
 * server/src/api/handlers/SignatureHandlers.test.ts (handler-direct
 * mintSignature = the POST /signatures contract, credential module mocked).
 *
 * Legs:
 *  A. protocol leg (protocol.schema.yaml pins lifecycleId const
 *     'document-control' at :234-237 — OQ3 territory): a promoted-shaped
 *     protocol born draft CANNOT jump to effective — fail-closed
 *     LIFECYCLE_TRANSITION_DENIED, nothing persisted.
 *  B. roleAssignments gap probe: a promoted-shaped payload carrying no
 *     createdBy/authorRef fails the requires_different_person guard —
 *     REPORTED (OQ3), guards NOT widened.
 *  C. signing leg (document-controlled-signing, the §0.4 machinery):
 *     in_review->approved WITHOUT a signature -> refused fail-closed
 *     (LifecycleEngine.ts requires_signature); mint a REAL signature via the
 *     POST /signatures handler contract for action 'approved' on the CURRENT
 *     saved revision with role assignments -> transition succeeds; audit-event
 *     action lifecycle_transition exists WITH signatureRefs.
 */

import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { FastifyRequest } from 'fastify';
import { createRecordHandlers } from './RecordHandlers.js';
import { createSignatureHandlers } from './SignatureHandlers.js';
import { LifecycleEngine } from '../../lifecycle/LifecycleEngine.js';
import { loadLifecyclesFromDir } from '../../lifecycle/LifecycleLoader.js';
import { token } from '../../revisions/RecordRevisionService.js';
import { AuditEventService } from '../../governance/AuditEventService.js';
import { RoleResolver } from '../../security/RoleResolver.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { RecordStore } from '../../store/types.js';
import type { MintSignatureBody } from './SignatureHandlers.js';

vi.mock('../../security/CredentialStore.js', () => ({
  verifyPassword: vi.fn((password: string, _stored: string) => password === 'correct-horse'),
  hashPassword: vi.fn((p: string) => `hash:${p}`),
  CredentialStore: class {
    async getVerifier() { return 'hash:salt'; }
  },
}));

const LIFECYCLES_DIR = fileURLToPath(new URL('../../../schema/core/lifecycles', import.meta.url));
const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

function replyOf() {
  let statusValue = 200;
  const reply: any = {
    status: (code: number) => { statusValue = code; return reply; },
    code: (code: number) => { statusValue = code; return reply; },
    send: (body: unknown) => body,
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  return reply;
}

function world() {
  const records = new Map<string, RecordEnvelope>();
  const put = (e: RecordEnvelope) => {
    const next = structuredClone(e);
    records.set(e.recordId, next);
    return next;
  };
  const store = {
    get: async (id: string) => structuredClone(records.get(id) ?? null),
    exists: async (id: string) => records.has(id),
    list: async (filter?: { kind?: string }) => [...records.values()]
      .filter(r => !filter?.kind || (r.payload as Record<string, unknown>).kind === filter.kind)
      .map(r => structuredClone(r)),
    create: async ({ envelope }: { envelope: RecordEnvelope }) =>
      records.has(envelope.recordId)
        ? { success: false, error: 'Already exists' }
        : { success: true, envelope: put(envelope) },
    update: async ({ envelope, expectedSha }: { envelope: RecordEnvelope; expectedSha?: string }) => {
      const current = records.get(envelope.recordId);
      if (!current) return { success: false, error: 'Not found' };
      if (expectedSha && token(current) !== expectedSha) return { success: false, error: 'SHA mismatch' };
      return { success: true, envelope: put(envelope), commit: { sha: 'abc1234', message: 'test', timestamp: new Date().toISOString() } };
    },
    delete: async ({ recordId }: { recordId: string }) => { records.delete(recordId); return { success: true }; },
    validate: async () => ({ valid: true }),
    lint: async () => ({ valid: true }),
  } as unknown as RecordStore;

  const engine = new LifecycleEngine();
  const count = loadLifecyclesFromDir(LIFECYCLES_DIR, engine);
  expect(count).toBeGreaterThanOrEqual(2);
  expect(engine.isLoaded('document-control')).toBe(true);
  expect(engine.isLoaded('document-controlled-signing')).toBe(true);

  const auditService = new AuditEventService(store);
  const roleResolver = new RoleResolver(store);
  const handlers = createRecordHandlers(store, undefined, undefined, undefined, engine, undefined, {
    identityService: { resolveRequestUser: async (request: FastifyRequest) => ({ userId: (request.headers as Record<string, string>)['x-user-id'] ?? null, isSystem: false }) } as never,
    authorizationService: { canAccess: async () => true, ensureOwnerPolicy: async () => {} } as never,
    roleResolver,
    auditService,
    // POL-REGULATED shape (governanceStrictness): roles enforced.
    getPolicySettings: () => ({ enforceTransitionRoles: 'deny' }),
    getAppendOnlyKinds: () => DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });

  const update = async (id: string, payload: Record<string, unknown>, userId: string, signatureRefs?: string[]) => {
    const reply = replyOf();
    const result = await handlers.updateRecord({
      params: { id },
      body: { payload, ...(signatureRefs !== undefined ? { signatureRefs } : {}) },
      headers: { 'x-user-id': userId },
    } as unknown as FastifyRequest, reply);
    return { status: reply.statusValue, result: result as Record<string, unknown> };
  };

  return { store, records, put, handlers, update, engine, auditService };
}

type World = {
  store: RecordStore;
  records: Map<string, RecordEnvelope>;
  put: (e: RecordEnvelope) => RecordEnvelope;
  update: (id: string, payload: Record<string, unknown>, userId: string, signatureRefs?: string[]) => Promise<{ status: number; result: Record<string, unknown> }>;
};

function seedReviewerGrant(world: World, lifecycleId: string): void {
  world.put({ recordId: 'GRANT-REVIEW', schemaId: 'role-grant', payload: { kind: 'role-grant', recordId: 'GRANT-REVIEW', userId: 'USR-REVIEWER', lifecycleId, roles: ['reviewer'] }, meta: { createdAt: '', updatedAt: '' } } as RecordEnvelope);
}

// A promoted-shaped protocol (what CandidatePromoter §3.3a mints): kind
// protocol, state draft, lifecycleId SURVIVING (document-control — the only
// lifecycle protocol.schema.yaml:234-237 admits).
function promotedProtocolPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId: 'CAN-protocol-w25-t3',
    title: 'W2-5 promoted protocol',
    state: 'draft',
    lifecycleId: 'document-control',
    steps: [
      {
        stepId: 'inc-batch', label: 'Incubate', ordinal: 1, kind: 'incubate',
        intent: {
          semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'VERB-INCUBATE' }, canonical: 'incubate' },
          provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-w25-demo', pageStart: 1 }],
        },
      },
    ],
    ...overrides,
  };
}

describe('W2-5 T3: regulated lifecycle leg', () => {
  it('leg A — a promoted protocol born draft CANNOT be PUT to effective: fail-closed LIFECYCLE_TRANSITION_DENIED, nothing persisted', async () => {
    const { store, records, put, update } = world();
    put({ recordId: 'CAN-protocol-w25-t3', schemaId: PROTOCOL_SCHEMA_ID, payload: promotedProtocolPayload({ createdBy: 'USR-AUTHOR' }), meta: { createdAt: '', updatedAt: '', createdBy: 'USR-AUTHOR' } } as RecordEnvelope);

    const denied = await update('CAN-protocol-w25-t3', promotedProtocolPayload({ createdBy: 'USR-AUTHOR', state: 'effective' }), 'USR-AUTHOR');
    expect(denied.status).toBe(422);
    expect(denied.result.error).toBe('LIFECYCLE_TRANSITION_DENIED');
    expect(String(denied.result.message)).toContain('not allowed by the document-control lifecycle');
    // Nothing persisted.
    expect((records.get('CAN-protocol-w25-t3')!.payload as Record<string, unknown>).state).toBe('draft');
  });

  it('leg B1 (OQ3 GAP — REPORTED, guards NOT widened): a promoted-shaped payload carries NO payload createdBy, so roleAssignments.author is absent and the author-role transition fails closed', async () => {
    const { store, records, put, update } = world();
    // Exactly what the promote path mints (ExtractHandlers -> store.create):
    // the payload carries no createdBy (only RecordHandlers.createRecord
    // injects it), so extractRoleAssignments() yields no 'author'.
    put({ recordId: 'CAN-protocol-w25-t3', schemaId: PROTOCOL_SCHEMA_ID, payload: promotedProtocolPayload(), meta: { createdAt: '', updatedAt: '' } } as RecordEnvelope);

    const denied = await update('CAN-protocol-w25-t3', promotedProtocolPayload({ state: 'in_review' }), 'USR-AUTHOR');
    expect(denied.status).toBe(422);
    expect(denied.result.error).toBe('LIFECYCLE_TRANSITION_DENIED');
    expect((records.get('CAN-protocol-w25-t3')!.payload as Record<string, unknown>).state).toBe('draft');
  });

  it('leg B2 (the machinery works once an author is assigned): createdBy present -> draft->in_review by the author, then in_review->approved by a different reviewer', async () => {
    const { store, records, put, update } = world();
    seedReviewerGrant({ store, records, put, update }, 'document-control');
    put({ recordId: 'CAN-protocol-w25-t3', schemaId: PROTOCOL_SCHEMA_ID, payload: promotedProtocolPayload({ createdBy: 'USR-AUTHOR' }), meta: { createdAt: '', updatedAt: '', createdBy: 'USR-AUTHOR' } } as RecordEnvelope);

    const submitted = await update('CAN-protocol-w25-t3', promotedProtocolPayload({ createdBy: 'USR-AUTHOR', state: 'in_review' }), 'USR-AUTHOR');
    expect(submitted.status, JSON.stringify(submitted.result)).toBe(200);

    const approved = await update('CAN-protocol-w25-t3', promotedProtocolPayload({ createdBy: 'USR-AUTHOR', state: 'approved' }), 'USR-REVIEWER');
    expect(approved.status, JSON.stringify(approved.result)).toBe(200);
    expect((records.get('CAN-protocol-w25-t3')!.payload as Record<string, unknown>).state).toBe('approved');

    // requires_different_person held: the author cannot approve its own draft.
    const selfApproved = await update('CAN-protocol-w25-t3', promotedProtocolPayload({ createdBy: 'USR-AUTHOR', state: 'effective' }), 'USR-AUTHOR');
    expect(selfApproved.status).toBe(422);
    expect(selfApproved.result.error).toBe('LIFECYCLE_TRANSITION_DENIED');
  });

  it('leg C — signing lifecycle: ACTIVE transition refused WITHOUT signature, succeeds with a minted signature on the CURRENT saved revision + role assignments; audit lifecycle_transition carries signatureRefs', async () => {
    const { store, records, put, update } = world();
    seedReviewerGrant({ store, records, put, update }, 'document-controlled-signing');

    const docPayload = { kind: 'controlled-document', recordId: 'DOC-w25-t3', title: 'SOP', body: 'Mix gently', lifecycleId: 'document-controlled-signing', state: 'in_review', createdBy: 'USR-AUTHOR' };
    put({ recordId: 'DOC-w25-t3', schemaId: 'controlled-document', payload: docPayload, meta: { createdAt: '', updatedAt: '', createdBy: 'USR-AUTHOR' } } as RecordEnvelope);

    // Without a signature the requires_signature guard fails closed even
    // though the actor holds the reviewer role grant.
    const denied = await update('DOC-w25-t3', { ...docPayload, state: 'approved' }, 'USR-REVIEWER');
    expect(denied.status).toBe(422);
    expect(denied.result.error).toBe('LIFECYCLE_TRANSITION_DENIED');
    expect((records.get('DOC-w25-t3')!.payload as Record<string, unknown>).state).toBe('in_review');

    // MINT via the POST /signatures handler contract (SignatureHandlers.ts):
    // password re-auth + capture(purpose 'signature') of the CURRENT saved
    // revision (content-hash freshness, RecordHandlers.ts :851-855).
    const signatureHandlers = createSignatureHandlers({
      store,
      credentialStore: { getVerifier: async () => 'hash:salt' } as never,
      identityService: { resolveRequestUser: async () => ({ userId: 'USR-REVIEWER', isSystem: false }) } as never,
      auditService: new AuditEventService(store),
    });
    const mintReply = replyOf();
    const minted = await signatureHandlers.mintSignature({
      body: { subject: { recordId: 'DOC-w25-t3', lifecycleId: 'document-controlled-signing', targetState: 'approved' }, action: 'approved', password: 'correct-horse' },
      headers: { 'x-user-id': 'USR-REVIEWER' },
    } as unknown as FastifyRequest<{ Body: MintSignatureBody }>, mintReply as never);
    expect(mintReply.statusValue).toBe(200);
    const signatureId = String((minted as Record<string, unknown>).signatureId);
    expect(signatureId).toMatch(/^SIG-/);

    // With the presented signature the transition succeeds.
    const ok = await update('DOC-w25-t3', { ...docPayload, state: 'approved' }, 'USR-REVIEWER', [signatureId]);
    expect(ok.status, JSON.stringify(ok.result)).toBe(200);
    expect(ok.result.success).toBe(true);
    expect((records.get('DOC-w25-t3')!.payload as Record<string, unknown>).state).toBe('approved');

    // Audit trail: lifecycle_transition exists WITH signatureRefs.
    const audit = [...records.values()].find(r => {
      const p = r.payload as Record<string, unknown>;
      return p.kind === 'audit-event' && p.action === 'lifecycle_transition';
    });
    expect(audit, 'audit-event lifecycle_transition must exist').toBeDefined();
    const p = audit!.payload as Record<string, unknown>;
    expect(p.actor).toBe('USR-REVIEWER');
    expect(p.subjectId).toBe('DOC-w25-t3');
    const data = p.data as Record<string, unknown>;
    expect(data.from).toBe('in_review');
    expect(data.to).toBe('approved');
    expect(data.signatureRefs).toEqual([signatureId]);
    expect(data.lifecycleId).toBe('document-controlled-signing');

    // A stale signature cannot authorize the NEXT transition (freshness wall).
    const nextDenied = await update('DOC-w25-t3', { ...docPayload, state: 'effective' }, 'USR-REVIEWER', [signatureId]);
    expect(nextDenied.status).toBe(409);
    expect(nextDenied.result.error).toBe('STALE_SIGNATURE');
  });
});
