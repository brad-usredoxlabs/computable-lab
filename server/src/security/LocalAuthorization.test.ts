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
import { LOCAL_ADMIN_USER_ID, LocalIdentityService, USER_SCHEMA_ID } from './LocalIdentityService.js';

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

function policy(recordId: string, resourceId: string, resourceKind: string, ownerUserId: string, grants: unknown[] = []): RecordEnvelope {
  return {
    recordId,
    schemaId: ACCESS_POLICY_SCHEMA_ID,
    payload: {
      kind: 'access-policy',
      recordId,
      resourceRef: { kind: 'record', id: resourceId, type: resourceKind },
      visibility: 'private',
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

describe('local identity and authorization substrate', () => {
  it('bootstraps a local admin user when no active user exists', async () => {
    const store = new MemoryRecordStore([user('USR-INACTIVE', 'inactive')]);
    const identity = new LocalIdentityService(store);

    const admin = await identity.ensureLocalAdminUser();

    expect(admin?.recordId).toBe(LOCAL_ADMIN_USER_ID);
    expect(await store.get(LOCAL_ADMIN_USER_ID)).toBeTruthy();
  });

  it('inherits a parent study policy for child experiment access', async () => {
    const store = new MemoryRecordStore([
      user('USR-OWNER'),
      user('USR-OTHER'),
      study('STU-PRIVATE'),
      experiment('EXP-PRIVATE', 'STU-PRIVATE'),
      policy('ACL-STU-PRIVATE', 'STU-PRIVATE', 'study', 'USR-OWNER'),
    ]);
    const authorization = new AuthorizationService(store);
    const exp = await store.get('EXP-PRIVATE');

    expect(exp).toBeTruthy();
    expect(await authorization.canAccess('USR-OWNER', 'read', exp!)).toBe(true);
    expect(await authorization.canAccess('USR-OTHER', 'read', exp!)).toBe(false);
  });

  it('creates an owner policy for new policy-root records', async () => {
    const store = new MemoryRecordStore([user('USR-OWNER'), study('STU-001')]);
    const authorization = new AuthorizationService(store);
    const created = await authorization.ensureOwnerPolicy((await store.get('STU-001'))!, 'USR-OWNER');

    expect(created?.recordId).toBe('ACL-STU-001');
    expect((created?.payload as Record<string, unknown>).ownerUserId).toBe('USR-OWNER');
    expect(await authorization.canAccess('USR-OWNER', 'admin', (await store.get('STU-001'))!)).toBe(true);
  });

  it('filters unreadable records and blocks viewer writes in RecordHandlers', async () => {
    const store = new MemoryRecordStore([
      user('USR-OWNER'),
      user('USR-VIEWER'),
      user('USR-OTHER'),
      study('STU-SHARED'),
      policy('ACL-STU-SHARED', 'STU-SHARED', 'study', 'USR-OWNER', [
        { principalType: 'user', principalId: 'USR-VIEWER', role: 'viewer' },
      ]),
    ]);
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

    const visibleReply = reply();
    const visible = await handlers.listRecords(
      request<{ Querystring: { kind: string } }>({ query: { kind: 'study' }, headers: { 'x-user-id': 'USR-VIEWER' } }),
      visibleReply,
    );
    expect('records' in visible ? visible.records.map((record) => record.recordId) : []).toEqual(['STU-SHARED']);

    const hiddenReply = reply();
    const hidden = await handlers.getRecord(
      request<{ Params: { id: string }; Querystring: Record<string, string> }>({ params: { id: 'STU-SHARED' }, query: {}, headers: { 'x-user-id': 'USR-OTHER' } }),
      hiddenReply,
    );
    expect(hiddenReply.statusCode).toBe(404);
    expect('error' in hidden ? hidden.error : '').toBe('NOT_FOUND');

    const updateReply = reply();
    const update = await handlers.updateRecord(
      request<{ Params: { id: string }; Body: { payload: unknown } }>({
        params: { id: 'STU-SHARED' },
        body: { payload: { kind: 'study', recordId: 'STU-SHARED', title: 'Updated', shortSlug: 'shared' } },
        headers: { 'x-user-id': 'USR-VIEWER' },
      }),
      updateReply,
    );
    expect(updateReply.statusCode).toBe(403);
    expect('error' in update ? update.error : '').toBe('FORBIDDEN');
  });

  it('creates an owner policy after RecordHandlers creates a study', async () => {
    const store = new MemoryRecordStore([user('USR-OWNER')]);
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

    const createReply = reply();
    const created = await handlers.createRecord(
      request<{ Body: { schemaId: string; payload: unknown } }>({
        body: {
          schemaId: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml',
          payload: { kind: 'study', recordId: 'STU-NEW', title: 'New Study', shortSlug: 'new-study' },
        },
        headers: { 'x-user-id': 'USR-OWNER' },
      }),
      createReply,
    );

    expect(createReply.statusCode).toBe(201);
    expect('success' in created ? created.success : false).toBe(true);
    expect(await store.get('ACL-STU-NEW')).toBeTruthy();
  });
});
