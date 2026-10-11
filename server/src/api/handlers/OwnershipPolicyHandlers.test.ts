/**
 * OWN-9 — GET/PUT /settings/ownership-policy (admin-gated by the document's OWN ACL).
 *
 * RED-first contract tests for §T9 (plan 2026-10-10_192635, wave 3).
 *
 * Fixture discipline (reviewer bait 4 / non-vacuity):
 *  - The document ACL row (ACL-OWN-LAB-DEFAULT -> resourceRef.id OWN-LAB-DEFAULT,
 *    owner USR-OWNER) is LOAD-BEARING: with no policy, AccessControlService.canAccess
 *    returns true for everyone (AccessControlService.ts:63-64 `if (!policy) return true`),
 *    so the non-admin-403 case would be vacuous without it. Admin comes ONLY from this
 *    document ACL (D7 — never a hardcoded role in TypeScript).
 *  - The scripted validate wrapper below is load-bearing for the 422 case: the stock
 *    MemoryRecordStore.validate ALWAYS returns {valid:true}
 *    (test-support/MemoryRecordStore.ts:62-64), so a 422 assertion against the stock
 *    stub would be vacuous. Removing the wrapper must flip case 6 RED.
 *  - Case 4 (no credential) is RED against plain §T9: the shipped LocalIdentityService
 *    resolves a headerless request to the FIRST ACTIVE user (LocalIdentityService.ts:125-138)
 *    — here USR-OWNER, the document's own ACL owner — so plain §T9 would let the
 *    headerless write through. This test is what forces the DEV-2 credential gate
 *    (QMS-8 FIX-RUN-1 defect 1 precedent: an implicit fallback is not a credential
 *    for a privileged write).
 *  - resolveDocument()'s by-id fallback stays load-bearing in the handler even though
 *    MemoryRecordStore.list-by-kind sees the in-map doc (the boot-blindness is a
 *    RecordStoreImpl seedDir quirk the unit test cannot reproduce): AS-ORCH-L1-042,
 *    orch runtime-proved 20261011T1025 — GET /api/records/OWN-LAB-DEFAULT -> 200 while
 *    activeLabPolicy() is blind to the seed-dir copy at boot. Without the fallback
 *    GET/PUT 404 on a boot-fresh lane.
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import type { ValidationResult } from '../../types/common.js';
import { MemoryRecordStore } from '../../test-support/MemoryRecordStore.js';
import { ACCESS_POLICY_SCHEMA_ID, AuthorizationService } from '../../security/AuthorizationService.js';
import { LocalIdentityService, USER_SCHEMA_ID } from '../../security/LocalIdentityService.js';
import { OWNERSHIP_POLICY_SCHEMA_ID, OwnershipPolicyService } from '../../security/OwnershipPolicyService.js';
import { createOwnershipPolicyHandlers, type OwnershipPolicyHandlers } from './OwnershipPolicyHandlers.js';
import { registerRoutes } from '../routes.js';

// ---------------------------------------------------------------------------
// Local stubs (file-local pattern copied from security/LocalAuthorization.test.ts:104-135)
// ---------------------------------------------------------------------------

function user(id: string, status: 'active' | 'inactive' = 'active'): RecordEnvelope {
  return {
    recordId: id,
    schemaId: USER_SCHEMA_ID,
    payload: { kind: 'user', recordId: id, username: id.toLowerCase(), displayName: id, status },
  };
}

/** ACL whose resourceRef.id is the DOCUMENT's recordId — findPolicyForRecord matches
 *  on resourceRef.id (AuthorizationService.ts:178, :192-195), not on the ACL recordId. */
function policy(recordId: string, resourceId: string, resourceKind: string, ownerUserId: string): RecordEnvelope {
  return {
    recordId,
    schemaId: ACCESS_POLICY_SCHEMA_ID,
    payload: {
      kind: 'access-policy',
      recordId,
      resourceRef: { kind: 'record', id: resourceId, type: resourceKind },
      visibility: 'private',
      ownerUserId,
      grants: [],
    },
  };
}

function reply() {
  return {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  } as FastifyReply & { statusCode: number };
}

function request<T>(overrides: Partial<T> & { headers?: Record<string, string> }): FastifyRequest<T> {
  return {
    headers: overrides.headers ?? {},
    ...overrides,
  } as unknown as FastifyRequest<T>;
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ORIGINAL_POLICY_PAYLOAD = {
  kind: 'ownership-policy',
  recordId: 'OWN-LAB-DEFAULT',
  title: 'Lab policy',
  scope: { type: 'lab', id: 'lab' },
  labOwnerUserId: 'USR-OWNER',
  fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['user'] },
  kindRules: [
    { kind: 'protocol', owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['lab'] },
  ],
};

function policyDocument(): RecordEnvelope {
  return {
    recordId: 'OWN-LAB-DEFAULT',
    schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
    payload: structuredClone(ORIGINAL_POLICY_PAYLOAD),
  };
}

function baseRecords(): RecordEnvelope[] {
  return [
    user('USR-OWNER'),
    user('USR-STRANGER'),
    policyDocument(),
    // The document's OWN access-policy: admin comes ONLY from this row (D7).
    policy('ACL-OWN-LAB-DEFAULT', 'OWN-LAB-DEFAULT', 'ownership-policy', 'USR-OWNER'),
  ];
}

// ---------------------------------------------------------------------------
// Scripted-validate store wrapper (non-vacuity for the 422 case)
// ---------------------------------------------------------------------------

/** Wraps MemoryRecordStore with a scripted validate that REJECTS payloads that are
 *  not ownership-policy documents — the same shape rule the real AjvValidator enforces
 *  against ownership-policy.schema.yaml. The stock stub always returns valid:true;
 *  swapping it back must flip case 6 RED. */
function scriptedValidateStore(base: MemoryRecordStore): RecordStore {
  return {
    get: (recordId) => base.get(recordId),
    getByPath: (path) => base.getByPath(path),
    getWithValidation: (options) => base.getWithValidation(options),
    list: (filter) => base.list(filter),
    create: (options) => base.create(options),
    update: (options) => base.update(options),
    delete: (options) => base.delete(options),
    exists: (recordId) => base.exists(recordId),
    lint: (envelope) => base.lint(envelope),
    validate: async (envelope: RecordEnvelope): Promise<ValidationResult> => {
      const payload = envelope.payload as Record<string, unknown>;
      if (payload.kind !== 'ownership-policy') {
        return {
          valid: false,
          errors: [{ path: '/kind', message: 'payload.kind must be "ownership-policy"', keyword: 'const' }],
        };
      }
      return { valid: true, errors: [] };
    },
  };
}

function harness(records: RecordEnvelope[]) {
  const base = new MemoryRecordStore(records);
  const store = scriptedValidateStore(base);
  const service = new OwnershipPolicyService(store);
  // Single-arg on purpose: AuthorizationService's second ctor param is optional
  // (OWN-7 discipline) — the test must not depend on OWN-7 behavior.
  const authorizationService = new AuthorizationService(store);
  const identityService = new LocalIdentityService(store);
  const handlers = createOwnershipPolicyHandlers({ store, service, identityService, authorizationService });
  return { base, store, handlers };
}

// ---------------------------------------------------------------------------

describe('ownership-policy API (§T9)', () => {
  it('GET returns the seeded document: {record, resolved} both name OWN-LAB-DEFAULT', async () => {
    const { handlers } = harness(baseRecords());
    const r = reply();
    const body = await handlers.getOwnershipPolicy(request({ headers: {} }), r) as {
      record: { recordId: string };
      resolved: { recordId: string };
    };
    expect(r.statusCode).toBe(200);
    expect(body.record.recordId).toBe('OWN-LAB-DEFAULT');
    // MemoryRecordStore.list-by-kind DOES see the in-map doc (the boot-blindness is a
    // RecordStoreImpl seedDir quirk this unit harness cannot reproduce — that is exactly
    // why resolveDocument()'s by-id fallback stays in the handler: AS-ORCH-L1-042).
    expect(body.resolved.recordId).toBe('OWN-LAB-DEFAULT');
  });

  it('GET with an empty store answers {record:null, resolved:null, defaults:null}', async () => {
    const { handlers } = harness([]);
    const r = reply();
    const body = await handlers.getOwnershipPolicy(request({ headers: {} }), r);
    expect(r.statusCode).toBe(200);
    expect(body).toEqual({ record: null, resolved: null, defaults: null });
  });

  it('PUT as a non-admin (USR-STRANGER, real credential) -> 403 ACCESS_DENIED; store payload unchanged', async () => {
    const { base, handlers } = harness(baseRecords());
    const r = reply();
    const body = await handlers.putOwnershipPolicy(
      request<{ Body: Record<string, unknown> }>({
        body: structuredClone(ORIGINAL_POLICY_PAYLOAD),
        headers: { 'x-user-id': 'USR-STRANGER' },
      }),
      r,
    ) as { error?: string };
    expect(r.statusCode).toBe(403);
    expect(body.error).toBe('ACCESS_DENIED');
    expect((await base.get('OWN-LAB-DEFAULT'))?.payload).toEqual(ORIGINAL_POLICY_PAYLOAD);
  });

  it('PUT with NO credential headers -> 403 (DEV-2 credential gate; RED against plain §T9: the headerless fallback resolves to the FIRST ACTIVE user USR-OWNER — the document ACL owner — so plain §T9 would let this write through)', async () => {
    const { base, handlers } = harness(baseRecords());
    const r = reply();
    const body = await handlers.putOwnershipPolicy(
      request<{ Body: Record<string, unknown> }>({
        body: structuredClone(ORIGINAL_POLICY_PAYLOAD),
        headers: {},
      }),
      r,
    ) as { error?: string };
    expect(r.statusCode).toBe(403);
    expect(body.error).toBe('ACCESS_DENIED');
    expect((await base.get('OWN-LAB-DEFAULT'))?.payload).toEqual(ORIGINAL_POLICY_PAYLOAD);
  });

  it('PUT as the document-ACL owner (USR-OWNER) -> 200 and the store holds the new payload (aggregate acceptance 6)', async () => {
    const { base, handlers } = harness(baseRecords());
    const newPayload = {
      ...structuredClone(ORIGINAL_POLICY_PAYLOAD),
      title: 'Updated lab policy',
      fallback: { ...structuredClone(ORIGINAL_POLICY_PAYLOAD.fallback), visibility: 'shared' },
    };
    const r = reply();
    const body = await handlers.putOwnershipPolicy(
      request<{ Body: Record<string, unknown> }>({
        body: newPayload,
        headers: { 'x-user-id': 'USR-OWNER' },
      }),
      r,
    ) as { success?: boolean };
    expect(r.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect((await base.get('OWN-LAB-DEFAULT'))?.payload).toEqual(newPayload);
  });

  it('malformed body -> 422 INVALID_POLICY (scripted validate wrapper; vacuous against the stock always-valid stub)', async () => {
    const { base, handlers } = harness(baseRecords());
    const r = reply();
    const body = await handlers.putOwnershipPolicy(
      request<{ Body: Record<string, unknown> }>({
        body: { kind: 'not-a-policy', recordId: 'OWN-LAB-DEFAULT', title: 'garbage' },
        headers: { 'x-user-id': 'USR-OWNER' },
      }),
      r,
    ) as { error?: string };
    expect(r.statusCode).toBe(422);
    expect(body.error).toBe('INVALID_POLICY');
    expect((await base.get('OWN-LAB-DEFAULT'))?.payload).toEqual(ORIGINAL_POLICY_PAYLOAD);
  });

  it('route smoke: real registerRoutes + fastify.inject GET /api/settings/ownership-policy -> 200 {record,resolved} (QMS-7 lesson: prove the ROUTE exists, not just the service)', async () => {
    const { handlers } = harness(baseRecords());
    const noop = async () => ({});
    const app: FastifyInstance = Fastify();
    await app.register(async (instance) => {
      registerRoutes(instance, {
        recordHandlers: {
          listRecords: noop, listRevisions: noop, draftCopy: noop, acceptGraph: noop,
          getRecord: noop, createRecord: noop, updateRecord: noop, deleteRecord: noop,
          listClaims: noop, checkClaimDuplicates: noop,
        } as never,
        schemaHandlers: { listSchemas: noop, getSchema: noop, getSchemaByPath: noop } as never,
        validationHandlers: { validate: noop, lint: noop, validateFull: noop } as never,
        schemaCount: () => 0,
        ruleCount: () => 0,
        ownershipPolicyHandlers: handlers as OwnershipPolicyHandlers,
      });
    }, { prefix: '/api' });
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/settings/ownership-policy' });
      expect(res.statusCode).toBe(200);
      const json = res.json() as { record: { recordId: string }; resolved: { recordId: string } };
      expect(json.record.recordId).toBe('OWN-LAB-DEFAULT');
      expect(json.resolved.recordId).toBe('OWN-LAB-DEFAULT');
    } finally {
      await app.close();
    }
  });
});
