/**
 * OWN-8 — creation-time filing contract (plan §T8, errata E1/E2/E3 orch-sanctioned).
 *
 * When a create request carries body.studyId and the ownership-policy rule for
 * the payload's kind declares filedTo: active-project, the handler must stamp
 * links.studyId onto the payload BEFORE createEnvelope consumes it (E2: the
 * envelope is built upstream of store.create — a write after it is dead).
 *
 * Fixture honesty (E1/E3): the schemaId is the REAL $id from
 * schema/workflow/local-protocol.schema.yaml:3 (no "workflow/" segment in the
 * id) and the payload carries the schema-required fields (status, the
 * inherits_from record-ref's kind+id+type) even though MemoryRecordStore does
 * not validate — the real store WILL validate this create live.
 */
import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import { MemoryRecordStore } from '../../test-support/MemoryRecordStore.js';
import { createRecordHandlers } from './RecordHandlers.js';
import { AuthorizationService } from '../../security/AuthorizationService.js';
import { LocalIdentityService, USER_SCHEMA_ID } from '../../security/LocalIdentityService.js';
import { OWNERSHIP_POLICY_SCHEMA_ID, OwnershipPolicyService } from '../../security/OwnershipPolicyService.js';

// E1: the REAL $id (schema/workflow/local-protocol.schema.yaml:3) — the id has
// NO "workflow/" segment even though the file lives in schema/workflow/.
const LOCAL_PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';
// Negative fixture: claim.schema.yaml's real $id.
const CLAIM_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml';

// Local helpers (copied from the LocalAuthorization.test.ts harness pattern;
// test files never import across each other).
function user(id: string, status: 'active' | 'inactive' = 'active'): RecordEnvelope {
  return {
    recordId: id,
    schemaId: USER_SCHEMA_ID,
    payload: { kind: 'user', recordId: id, username: id.toLowerCase(), displayName: id, status },
  };
}

function study(id: string): RecordEnvelope {
  return {
    recordId: id,
    schemaId: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml',
    payload: { kind: 'study', recordId: id, title: id, shortSlug: id.toLowerCase() },
  };
}

// Ownership-policy document fixture mirroring OwnershipPolicyService.test.ts
// docEnv(): local-protocol declares filedTo: active-project; the fallback
// declares filedTo: 'none', which is what the negative test exercises through
// ruleFor()'s fallback rule (unlisted kind 'claim' → fallback, not null).
function docEnv(): RecordEnvelope {
  return {
    recordId: 'OWN-LAB-DEFAULT',
    schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
    payload: {
      kind: 'ownership-policy',
      recordId: 'OWN-LAB-DEFAULT',
      title: 'Lab policy',
      scope: { type: 'lab', id: 'lab' },
      labOwnerUserId: 'USR-LOCAL-ADMIN',
      fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['user'] },
      kindRules: [
        { kind: 'local-protocol', owner: 'creator', visibility: 'private', filedTo: 'active-project', editRoles: ['owner', 'editor'], shareTargets: ['project', 'lab'] },
      ],
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

function setup() {
  const store = new MemoryRecordStore([user('USR-BRAD'), study('STU-MITO'), docEnv()]);
  const ownershipPolicyService = new OwnershipPolicyService(store);
  const handlers = createRecordHandlers(
    store,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      identityService: new LocalIdentityService(store),
      // No 2nd ctor param: this test must not depend on OWN-7's widened ctor.
      authorizationService: new AuthorizationService(store),
      ownershipPolicyService,
    },
  );
  return { store, handlers };
}

describe('RecordHandlers creation-time filing (OWN-8)', () => {
  it('files a new local-protocol into the active project when the policy says so', async () => {
    const { store, handlers } = setup();

    const reply1 = reply();
    const res = await handlers.createRecord(
      request<{ Body: { schemaId: string; payload: unknown; studyId?: string } }>({
        body: {
          schemaId: LOCAL_PROTOCOL_SCHEMA_ID,
          // E3: `status` is required (schema/workflow/local-protocol.schema.yaml
          // required list); inherits_from is a record ref needing kind+id+type.
          payload: {
            kind: 'local-protocol',
            recordId: 'LPR-1',
            title: 'My draft',
            status: 'draft',
            inherits_from: { kind: 'record', id: 'PRT-1', type: 'protocol' },
          },
          studyId: 'STU-MITO',
        },
        headers: {},
      }),
      reply1,
    );

    expect(reply1.statusCode).toBe(201);

    // recordId is payload-derived (RecordHandlers.ts extractRecordId) — direct get works.
    const created = await store.get('LPR-1');
    expect(created).toBeTruthy();
    const createdLinks = ((created?.payload as Record<string, unknown>).links ?? {}) as Record<string, unknown>;
    expect(createdLinks.studyId).toBe('STU-MITO');

    // The RESPONSE envelope must carry the same links — guards against stamping
    // a copy the store never saw (the E2 dead-write trap).
    expect('record' in res ? res.record : undefined).toBeTruthy();
    const responseLinks = (((res as { record?: RecordEnvelope }).record?.payload as Record<string, unknown>)?.links ?? {}) as Record<string, unknown>;
    expect(responseLinks.studyId).toBe('STU-MITO');
  });

  it('does not overwrite a links.studyId the payload already carries', async () => {
    const { store, handlers } = setup();

    const reply1 = reply();
    await handlers.createRecord(
      request<{ Body: { schemaId: string; payload: unknown; studyId?: string } }>({
        body: {
          schemaId: LOCAL_PROTOCOL_SCHEMA_ID,
          payload: {
            kind: 'local-protocol',
            recordId: 'LPR-2',
            title: 'Already filed',
            status: 'draft',
            inherits_from: { kind: 'record', id: 'PRT-1', type: 'protocol' },
            links: { studyId: 'STU-EXISTING' },
          },
          studyId: 'STU-MITO',
        },
        headers: {},
      }),
      reply1,
    );

    expect(reply1.statusCode).toBe(201);
    const created = await store.get('LPR-2');
    const createdLinks = ((created?.payload as Record<string, unknown>).links ?? {}) as Record<string, unknown>;
    expect(createdLinks.studyId).toBe('STU-EXISTING');
  });

  it('files nothing when the rule for the kind says filedTo: none', async () => {
    const { store, handlers } = setup();

    // Negative via the FALLBACK rule: 'claim' is not in kindRules, so ruleFor()
    // returns the fallback rule (filedTo: 'none'), not null. The study id sits
    // ONLY in body.studyId — a top-level payload studyId string would itself
    // count as "already filed" and muddy this guard.
    const reply1 = reply();
    await handlers.createRecord(
      request<{ Body: { schemaId: string; payload: unknown; studyId?: string } }>({
        body: {
          schemaId: CLAIM_SCHEMA_ID,
          payload: {
            kind: 'claim',
            id: 'CLM-FILE-1',
            statement: 'Filing must not touch kinds whose rule says none.',
            subject: { kind: 'record', id: 'PRT-1', type: 'protocol' },
            predicate: { kind: 'ontology', id: 'ro:has_part' },
            object: { kind: 'record', id: 'PRT-2', type: 'protocol' },
          },
          studyId: 'STU-MITO',
        },
        headers: {},
      }),
      reply1,
    );

    expect(reply1.statusCode).toBe(201);
    const created = await store.get('CLM-FILE-1');
    expect(created).toBeTruthy();
    const createdPayload = created?.payload as Record<string, unknown>;
    const createdLinks = (createdPayload.links ?? {}) as Record<string, unknown>;
    expect(createdLinks.studyId).toBeUndefined();
  });
});
