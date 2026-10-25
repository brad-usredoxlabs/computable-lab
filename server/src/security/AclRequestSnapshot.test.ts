/**
 * IB-L1-PERF-1 — request-scoped ACL snapshot for the record list.
 *
 * RED-first pins (spec T1-T4):
 * T1  call-count: one listRecords visibility pass must load the access-policy
 *     collection ONCE per request (snapshot build), not once per record.
 * T3  freshness: a minted/edited policy or a group-membership change is
 *     visible to the VERY NEXT list request (request-scoped lifetime).
 * T4  parity: snapshot-path decisions === unsnapshotted decisions for direct
 *     ACL, inherited ACL, group grant, project grant, and no-policy records,
 *     across read/write/admin × owner/non-owner.
 *
 * T2 (behavior equivalence) is the untouched existing suites:
 * LocalAuthorization.test.ts, AccessControlService.test.ts,
 * OwnershipPolicyService.test.ts, RecordHandlers.* visibility suites.
 */
import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type {
  CreateRecordOptions,
  DeleteRecordOptions,
  GetRecordOptions,
  RecordFilter,
  RecordStore,
  StoreResult,
  UpdateRecordOptions,
} from '../store/types.js';
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js';
import { AuthorizationService, ACCESS_POLICY_SCHEMA_ID } from './AuthorizationService.js';
import { LocalIdentityService, USER_SCHEMA_ID } from './LocalIdentityService.js';

class MemoryRecordStore implements RecordStore {
  records = new Map<string, RecordEnvelope>();

  constructor(records: RecordEnvelope[] = []) {
    for (const record of records) this.records.set(record.recordId, record);
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.records.get(recordId) ?? null;
  }

  async getByPath(_path: string): Promise<RecordEnvelope | null> {
    return null;
  }

  async getWithValidation(options: GetRecordOptions): Promise<StoreResult> {
    const envelope = await this.get(options.recordId);
    return envelope ? { success: true, envelope } : { success: false, error: 'not found' };
  }

  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    let records = [...this.records.values()];
    if (filter?.kind) {
      records = records.filter((record) => (record.payload as Record<string, unknown>).kind === filter.kind);
    }
    if (filter?.schemaId) records = records.filter((record) => record.schemaId === filter.schemaId);
    if (filter?.idPrefix) records = records.filter((record) => record.recordId.startsWith(filter.idPrefix));
    if (filter?.offset) records = records.slice(filter.offset);
    if (filter?.limit) records = records.slice(0, filter.limit);
    return records;
  }

  async create(options: CreateRecordOptions): Promise<StoreResult> {
    if (this.records.has(options.envelope.recordId)) return { success: false, error: 'already exists' };
    this.records.set(options.envelope.recordId, options.envelope);
    return { success: true, envelope: options.envelope };
  }

  async update(options: UpdateRecordOptions): Promise<StoreResult> {
    if (!this.records.has(options.envelope.recordId)) return { success: false, error: 'not found' };
    this.records.set(options.envelope.recordId, options.envelope);
    return { success: true, envelope: options.envelope };
  }

  async delete(options: DeleteRecordOptions): Promise<StoreResult> {
    if (!this.records.delete(options.recordId)) return { success: false, error: 'not found' };
    return { success: true };
  }

  async validate() {
    return { valid: true, errors: [] };
  }

  async lint() {
    return { valid: true, errors: [], warnings: [] };
  }

  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId);
  }
}

/** Call-counting wrapper: counts store.list invocations per filter kind. */
class CountingRecordStore implements RecordStore {
  listCalls: Array<RecordFilter | undefined> = [];

  constructor(private readonly inner: RecordStore) {}

  countListCalls(kind: string): number {
    return this.listCalls.filter((filter) => filter?.kind === kind).length;
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.inner.get(recordId);
  }

  async getByPath(path: string): Promise<RecordEnvelope | null> {
    return this.inner.getByPath(path);
  }

  async getWithValidation(options: GetRecordOptions): Promise<StoreResult> {
    return this.inner.getWithValidation(options);
  }

  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    this.listCalls.push(filter);
    return this.inner.list(filter);
  }

  async create(options: CreateRecordOptions): Promise<StoreResult> {
    return this.inner.create(options);
  }

  async update(options: UpdateRecordOptions): Promise<StoreResult> {
    return this.inner.update(options);
  }

  async delete(options: DeleteRecordOptions): Promise<StoreResult> {
    return this.inner.delete(options);
  }

  async validate(envelope: RecordEnvelope) {
    return this.inner.validate(envelope);
  }

  async lint(envelope: RecordEnvelope) {
    return this.inner.lint(envelope);
  }

  async exists(recordId: string): Promise<boolean> {
    return this.inner.exists(recordId);
  }
}

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

function experiment(id: string, studyId: string): RecordEnvelope {
  return {
    recordId: id,
    schemaId: 'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml',
    payload: { kind: 'experiment', recordId: id, title: id, studyId },
  };
}

function protocol(id: string): RecordEnvelope {
  return {
    recordId: id,
    schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
    payload: { kind: 'protocol', recordId: id, title: id, steps: [] },
  };
}

function group(id: string, memberUserIds: string[]): RecordEnvelope {
  return {
    recordId: id,
    schemaId: 'https://computable-lab.com/schema/computable-lab/group.schema.yaml',
    payload: { kind: 'group', recordId: id, memberUserIds },
  };
}

function policy(
  recordId: string,
  resourceId: string,
  resourceKind: string,
  ownerUserId: string,
  grants: unknown[] = [],
  visibility: 'private' | 'shared' | 'public' = 'private',
): RecordEnvelope {
  return {
    recordId,
    schemaId: ACCESS_POLICY_SCHEMA_ID,
    payload: {
      kind: 'access-policy',
      recordId,
      resourceRef: { kind: 'record', id: resourceId, type: resourceKind },
      visibility,
      ownerUserId,
      grants,
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

function listRecordIds(store: RecordStore, userId: string): string[] {
  const handlers = createRecordHandlers(
    store,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      identityService: new LocalIdentityService(store),
      authorizationService: new AuthorizationService(store),
    },
  );
  const result = handlers.listRecords(
    request<{ Querystring: Record<string, never> }>({ query: {}, headers: { 'x-user-id': userId } }),
    reply(),
  );
  return Promise.resolve(result).then((r) => ('records' in r ? r.records.map((record) => record.recordId) : []));
}

describe('IB-L1-PERF-1 request-scoped ACL snapshot', () => {
  it('T1: one listRecords visibility pass loads the access-policy collection exactly once (N=3)', async () => {
    const inner = new MemoryRecordStore([
      user('USR-OWNER'),
      study('STU-T1'),
      experiment('EXP-T1', 'STU-T1'),
      protocol('PRT-T1'),
      policy('ACL-STU-T1', 'STU-T1', 'study', 'USR-OWNER'),
      policy('ACL-PRT-T1', 'PRT-T1', 'protocol', 'USR-OWNER'),
    ]);
    const counting = new CountingRecordStore(inner);
    const handlers = createRecordHandlers(
      counting,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        identityService: new LocalIdentityService(counting),
        authorizationService: new AuthorizationService(counting),
      },
    );

    const result = await handlers.listRecords(
      request<{ Querystring: Record<string, never> }>({ query: {}, headers: { 'x-user-id': 'USR-OWNER' } }),
      reply(),
    );
    const visible = 'records' in result ? result.records.map((record) => record.recordId) : [];
    expect(visible).toEqual(expect.arrayContaining(['STU-T1', 'EXP-T1', 'PRT-T1']));

    // The list's own store.list({}) is one call; the ACL collection must be
    // loaded EXACTLY once for the whole request (the snapshot build), never
    // per record.
    expect(counting.countListCalls('access-policy')).toBe(1);
    expect(counting.countListCalls('group')).toBe(1);
  });

  it('T1: a second list request rebuilds the snapshot (one more policy load, never a cross-request cache)', async () => {
    const inner = new MemoryRecordStore([
      user('USR-OWNER'),
      study('STU-T1'),
      experiment('EXP-T1', 'STU-T1'),
      protocol('PRT-T1'),
      policy('ACL-STU-T1', 'STU-T1', 'study', 'USR-OWNER'),
      policy('ACL-PRT-T1', 'PRT-T1', 'protocol', 'USR-OWNER'),
    ]);
    const counting = new CountingRecordStore(inner);
    const handlers = createRecordHandlers(
      counting,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        identityService: new LocalIdentityService(counting),
        authorizationService: new AuthorizationService(counting),
      },
    );

    await handlers.listRecords(
      request<{ Querystring: Record<string, never> }>({ query: {}, headers: { 'x-user-id': 'USR-OWNER' } }),
      reply(),
    );
    await handlers.listRecords(
      request<{ Querystring: Record<string, never> }>({ query: {}, headers: { 'x-user-id': 'USR-OWNER' } }),
      reply(),
    );

    // Two requests => exactly two snapshot builds. A snapshot never leaks
    // across a request boundary.
    expect(counting.countListCalls('access-policy')).toBe(2);
    expect(counting.countListCalls('group')).toBe(2);
  });

  it('T3: a minted policy is invisible to the in-flight request and visible to the very next list request', async () => {
    const store = new MemoryRecordStore([
      user('USR-OWNER'),
      user('USR-OTHER'),
      study('STU-FRESH'),
    ]);
    const authorization = new AuthorizationService(store);

    // No policy yet: creator-private fallback is open — both users see it.
    expect(await listRecordIds(store, 'USR-OTHER')).toContain('STU-FRESH');

    // Mint a private owner policy between requests.
    await authorization.ensureOwnerPolicy((await store.get('STU-FRESH'))!, 'USR-OWNER');

    // The NEXT request sees the revocation immediately (fresh snapshot).
    expect(await listRecordIds(store, 'USR-OTHER')).not.toContain('STU-FRESH');
    expect(await listRecordIds(store, 'USR-OWNER')).toContain('STU-FRESH');
  });

  it('T3: a group-membership change is visible to the very next list request', async () => {
    const store = new MemoryRecordStore([
      user('USR-OWNER'),
      user('USR-OUTSIDE'),
      group('GRP-FRESH', []),
      study('STU-GFRESH'),
      policy('ACL-STU-GFRESH', 'STU-GFRESH', 'study', 'USR-OWNER', [
        { principalType: 'group', principalId: 'GRP-FRESH', role: 'viewer' },
      ]),
    ]);

    expect(await listRecordIds(store, 'USR-OUTSIDE')).not.toContain('STU-GFRESH');

    await store.update({
      envelope: group('GRP-FRESH', ['USR-OUTSIDE']),
      message: 'grant membership',
    });

    expect(await listRecordIds(store, 'USR-OUTSIDE')).toContain('STU-GFRESH');
  });

  it('T4: snapshot-path decisions equal unsnapshotted decisions (direct / inherited / group / project / no-policy)', async () => {
    const store = new MemoryRecordStore([
      user('USR-OWNER'),
      user('USR-STRANGER'),
      user('USR-GROUP'),
      user('USR-PROJ'),
      group('GRP-T4', ['USR-GROUP']),
      study('STU-DIRECT'),
      study('STU-PARENT'),
      study('STU-PROJECT'),
      experiment('EXP-INHERIT', 'STU-PARENT'),
      experiment('EXP-PROJ', 'STU-PARENT'),
      protocol('PRT-NOPOLICY'),
      policy('ACL-STU-DIRECT', 'STU-DIRECT', 'study', 'USR-OWNER', [
        { principalType: 'user', principalId: 'USR-STRANGER', role: 'viewer' },
      ]),
      policy('ACL-STU-PARENT', 'STU-PARENT', 'study', 'USR-OWNER', [
        { principalType: 'group', principalId: 'GRP-T4', role: 'editor' },
        { principalType: 'project', principalId: 'STU-PROJECT', role: 'viewer' },
      ]),
      policy('ACL-STU-PROJECT', 'STU-PROJECT', 'study', 'USR-OWNER', [
        { principalType: 'user', principalId: 'USR-PROJ', role: 'viewer' },
      ]),
    ]);
    const authorization = new AuthorizationService(store);
    const snapshot = await authorization.buildAclSnapshot();

    const records = await Promise.all([
      store.get('STU-DIRECT'),
      store.get('EXP-INHERIT'),
      store.get('EXP-PROJ'),
      store.get('PRT-NOPOLICY'),
    ]);
    const userIds = ['USR-OWNER', 'USR-STRANGER', 'USR-GROUP', 'USR-PROJ'];
    const actions = ['read', 'write', 'admin'] as const;

    for (const record of records) {
      expect(record).toBeTruthy();
      for (const userId of userIds) {
        for (const action of actions) {
          const withoutSnapshot = await authorization.canAccess(userId, action, record!);
          const withSnapshot = await authorization.canAccess(userId, action, record!, snapshot);
          expect(withSnapshot, `parity ${record!.recordId} ${userId} ${action}`).toBe(withoutSnapshot);
        }
      }
    }

    // Anchor the fixtures so a vacuous all-true/all-false parity cannot pass:
    // direct ACL: owner in, stranger read-only.
    expect(await authorization.canAccess('USR-OWNER', 'admin', (await store.get('STU-DIRECT'))!, snapshot)).toBe(true);
    expect(await authorization.canAccess('USR-STRANGER', 'read', (await store.get('STU-DIRECT'))!, snapshot)).toBe(true);
    expect(await authorization.canAccess('USR-STRANGER', 'write', (await store.get('STU-DIRECT'))!, snapshot)).toBe(false);
    // inherited: group member writes via the parent policy, stranger denied.
    expect(await authorization.canAccess('USR-GROUP', 'write', (await store.get('EXP-INHERIT'))!, snapshot)).toBe(true);
    expect(await authorization.canAccess('USR-STRANGER', 'read', (await store.get('EXP-INHERIT'))!, snapshot)).toBe(false);
    // project grant resolves through the snapshot's project-policy index.
    expect(await authorization.canAccess('USR-PROJ', 'read', (await store.get('EXP-PROJ'))!, snapshot)).toBe(true);
    expect(await authorization.canAccess('USR-PROJ', 'admin', (await store.get('EXP-PROJ'))!, snapshot)).toBe(false);
    // no policy: open (creator-private fallback absent).
    expect(await authorization.canAccess('USR-STRANGER', 'admin', (await store.get('PRT-NOPOLICY'))!, snapshot)).toBe(true);
  });

  it('T4: admin-on-ACL delegation is identical with and without the snapshot', async () => {
    const store = new MemoryRecordStore([
      user('USR-OWNER'),
      user('USR-STRANGER'),
      study('STU-ACLX'),
      policy('ACL-STU-ACLX', 'STU-ACLX', 'study', 'USR-OWNER'),
    ]);
    const authorization = new AuthorizationService(store);
    const snapshot = await authorization.buildAclSnapshot();
    const acl = (await store.get('ACL-STU-ACLX'))!;

    expect(await authorization.canAccess('USR-OWNER', 'admin', acl)).toBe(true);
    expect(await authorization.canAccess('USR-OWNER', 'admin', acl, snapshot)).toBe(true);
    expect(await authorization.canAccess('USR-STRANGER', 'admin', acl)).toBe(false);
    expect(await authorization.canAccess('USR-STRANGER', 'admin', acl, snapshot)).toBe(false);
  });
});
