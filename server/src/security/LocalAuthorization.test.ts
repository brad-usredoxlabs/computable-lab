import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { createIdentityHandlers } from '../api/handlers/IdentityHandlers.js';
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
import { OwnershipPolicyService } from './OwnershipPolicyService.js';

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

  it('resolves the active local user when no explicit user header is sent', async () => {
    const store = new MemoryRecordStore([user('USR-BRAD')]);
    const identity = new LocalIdentityService(store);

    const resolved = await identity.resolveRequestUser(request({ headers: {} }));

    expect(resolved.userId).toBe('USR-BRAD');
    expect(resolved.userRecord?.recordId).toBe('USR-BRAD');
    expect(resolved.isSystem).toBe(false);
  });

  it('resolves an explicit non-admin header without any session token (header-trusted path, Phase 0 pin)', async () => {
    // Pins TODAY's behavior: no token + x-user-id: USR-BRAD => USR-BRAD.
    // To be tightened in Phase 2 (login becomes the only identity path).
    const store = new MemoryRecordStore([user('USR-BRAD')]);
    const identity = new LocalIdentityService(store);

    const resolved = await identity.resolveRequestUser(request({ headers: { 'x-user-id': 'USR-BRAD' } }));

    expect(resolved.userId).toBe('USR-BRAD');
    expect(resolved.isSystem).toBe(false);
  });

  it('pin (a): admin header resolves the ADMIN record (isSystem) while the bootstrap window is open', async () => {
    // hasCredential wired AND admin has NO credential => the header resolves
    // to the admin specifically, even though another active user exists.
    const store = new MemoryRecordStore([user(LOCAL_ADMIN_USER_ID), user('USR-BRAD')]);
    const identity = new LocalIdentityService(store, undefined, async () => false);

    const resolved = await identity.resolveRequestUser(request({ headers: { 'x-user-id': LOCAL_ADMIN_USER_ID } }));

    expect(resolved.userId).toBe(LOCAL_ADMIN_USER_ID);
    expect(resolved.userRecord?.recordId).toBe(LOCAL_ADMIN_USER_ID);
    expect(resolved.isSystem).toBe(true);
  });

  it('pin (a2): open bootstrap window creates the admin record when missing, without routing through the first-active-user preference', async () => {
    const store = new MemoryRecordStore([user('USR-BRAD')]);
    const identity = new LocalIdentityService(store, undefined, async () => false);

    const resolved = await identity.resolveRequestUser(request({ headers: { 'x-user-id': LOCAL_ADMIN_USER_ID } }));

    expect(resolved.userId).toBe(LOCAL_ADMIN_USER_ID);
    expect(resolved.isSystem).toBe(true);
    expect(await store.get(LOCAL_ADMIN_USER_ID)).toBeTruthy();
  });

  it('pin (b): admin header is DEAD once the admin has a credential — falls back to the first active user', async () => {
    // The self-closing window: credential exists => header no longer resolves
    // to admin; behavior matches the pre-Phase-1 fallback exactly.
    const store = new MemoryRecordStore([user(LOCAL_ADMIN_USER_ID), user('USR-BRAD')]);
    const identity = new LocalIdentityService(store, undefined, async (userId) => userId === LOCAL_ADMIN_USER_ID);

    const resolved = await identity.resolveRequestUser(request({ headers: { 'x-user-id': LOCAL_ADMIN_USER_ID } }));

    expect(resolved.userId).toBe('USR-BRAD');
    expect(resolved.userRecord?.recordId).toBe('USR-BRAD');
    expect(resolved.isSystem).toBe(false);
  });

  it('pin (b2): admin header fails closed when no hasCredential predicate is wired (optional-wiring posture)', async () => {
    // Predicate ripped out => no bootstrap window, ever. The header may NOT
    // reach the admin even with zero credentials on record.
    const store = new MemoryRecordStore([user(LOCAL_ADMIN_USER_ID), user('USR-BRAD')]);
    const identity = new LocalIdentityService(store);

    const resolved = await identity.resolveRequestUser(request({ headers: { 'x-user-id': LOCAL_ADMIN_USER_ID } }));

    expect(resolved.userId).toBe('USR-BRAD');
    expect(resolved.isSystem).toBe(false);
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

  it('stamps new project, experiment, run, and protocol records with the active local user', async () => {
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

    const cases: Array<{ schemaId: string; payload: Record<string, unknown> }> = [
      {
        schemaId: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml',
        payload: { kind: 'study', recordId: 'STU-NEW', title: 'New Study', shortSlug: 'new-study' },
      },
      {
        schemaId: 'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml',
        payload: { kind: 'experiment', recordId: 'EXP-NEW', title: 'New Experiment', shortSlug: 'new-experiment', studyId: 'STU-NEW' },
      },
      {
        schemaId: 'https://computable-lab.com/schema/computable-lab/run.schema.yaml',
        payload: { kind: 'run', recordId: 'RUN-NEW', title: 'New Run', shortSlug: 'new-run', studyId: 'STU-NEW', experimentId: 'EXP-NEW' },
      },
      {
        schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
        payload: { kind: 'protocol', recordId: 'PRT-NEW', title: 'New Protocol', steps: [] },
      },
    ];

    for (const { schemaId, payload } of cases) {
      const createReply = reply();
      const created = await handlers.createRecord(
        request<{ Body: { schemaId: string; payload: unknown } }>({
          body: { schemaId, payload },
          headers: {},
        }),
        createReply,
      );

      expect(createReply.statusCode).toBe(201);
      expect('success' in created ? created.success : false).toBe(true);
      const createdRecord = await store.get(payload.recordId as string);
      expect((createdRecord?.payload as Record<string, unknown>).createdBy).toBe('USR-OWNER');
      expect(createdRecord?.meta?.createdBy).toBe('USR-OWNER');
    }

    expect((await store.get('ACL-STU-NEW'))?.meta?.createdBy).toBe('USR-OWNER');
  });

  it('stamps an owner policy for non-policy-root kinds like protocol and material-spec', async () => {
    const store = new MemoryRecordStore([user('USR-OWNER')]);
    const authorization = new AuthorizationService(store);

    const proto = {
      recordId: 'PRT-001',
      schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
      payload: { kind: 'protocol', recordId: 'PRT-001', title: 'P', steps: [] },
      meta: { createdBy: 'USR-OWNER' },
    } as RecordEnvelope;

    const created = await authorization.ensureOwnerPolicy(proto, 'USR-OWNER');
    expect(created?.recordId).toBe('ACL-PRT-001');
    expect((created?.payload as Record<string, unknown>).ownerUserId).toBe('USR-OWNER');
    // The owner can now read it, but a non-owner cannot.
    expect(await authorization.canAccess('USR-OWNER', 'read', proto)).toBe(true);
    expect(await authorization.canAccess('USR-OTHER', 'read', proto)).toBe(false);
  });

  it('backfills owner policies onto existing lab-item records owned by a user', async () => {
    const store = new MemoryRecordStore([
      user('USR-OWNER'),
      {
        recordId: 'PRT-EXIST',
        schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
        payload: { kind: 'protocol', recordId: 'PRT-EXIST', title: 'Old', steps: [] },
        meta: { createdBy: 'USR-OWNER' },
      } as RecordEnvelope,
      {
        recordId: 'DAT-EXIST',
        schemaId: 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml',
        payload: { kind: 'data-reference', recordId: 'DAT-EXIST', id: 'DAT-EXIST', title: 'D', storageDeviceId: 'x', path: 'foo', contentHash: 'a'.repeat(64), sizeBytes: 1, dataKind: 'signal' },
        meta: { createdBy: 'USR-OWNER' },
      } as RecordEnvelope,
    ]);
    const authorization = new AuthorizationService(store);

    const created = await authorization.backfillOwnerPolicies('USR-LOCAL-ADMIN');
    expect(created).toBe(2);
    // Both lab items now carry owner policies owned by their creator.
    const protoPolicy = await authorization.findPolicyForRecord('PRT-EXIST');
    const datPolicy = await authorization.findPolicyForRecord('DAT-EXIST');
    expect((protoPolicy?.payload as Record<string, unknown>).ownerUserId).toBe('USR-OWNER');
    expect((datPolicy?.payload as Record<string, unknown>).ownerUserId).toBe('USR-OWNER');
  });

  it('resolves a project grant end-to-end through coercion (OWN-6 §T6 seam)', async () => {
    // Study ACL carries a nested-group member + a direct user; the target record
    // ACL carries a {project: STU-*} grant. If coercePolicy dropped 'project'
    // grants, every member assertion below would be false.
    const store = new MemoryRecordStore([
      user('USR-OWNER'),
      user('USR-MEMBER-1'),
      user('USR-MEMBER-2'),
      user('USR-STRANGER'),
      {
        recordId: 'GRP-MITO',
        schemaId: 'https://computable-lab.com/schema/computable-lab/group.schema.yaml',
        payload: { kind: 'group', recordId: 'GRP-MITO', memberUserIds: [], memberGroupIds: ['GRP-NESTED'] },
      },
      {
        recordId: 'GRP-NESTED',
        schemaId: 'https://computable-lab.com/schema/computable-lab/group.schema.yaml',
        payload: { kind: 'group', recordId: 'GRP-NESTED', memberUserIds: ['USR-MEMBER-1'] },
      },
      study('STU-PROJECT'),
      experiment('EXP-TARGET', 'STU-PROJECT'),
      policy('ACL-STU-PROJECT', 'STU-PROJECT', 'study', 'USR-OWNER', [
        { principalType: 'group', principalId: 'GRP-MITO', role: 'editor' },
        { principalType: 'user', principalId: 'USR-MEMBER-2', role: 'editor' },
      ]),
      policy('ACL-EXP-TARGET', 'EXP-TARGET', 'experiment', 'USR-OWNER', [
        { principalType: 'project', principalId: 'STU-PROJECT', role: 'editor' },
      ]),
    ]);
    const authorization = new AuthorizationService(store);
    const exp = await store.get('EXP-TARGET');
    expect(exp).toBeTruthy();

    // Member via nested group, member via direct user grant, and the study owner all open.
    expect(await authorization.canAccess('USR-MEMBER-1', 'write', exp!)).toBe(true);
    expect(await authorization.canAccess('USR-MEMBER-2', 'write', exp!)).toBe(true);
    // Role-scoped: the project grant is 'editor', so admin is not carried.
    expect(await authorization.canAccess('USR-MEMBER-1', 'admin', exp!)).toBe(false);
    // A stranger never opens, and the index is keyed by resourceRef id (STU-PROJECT),
    // not by the ACL recordId (ACL-STU-PROJECT).
    expect(await authorization.canAccess('USR-STRANGER', 'write', exp!)).toBe(false);
  });

  it('never guesses an owner for system-created records during backfill', async () => {
    const store = new MemoryRecordStore([
      user('USR-OWNER'),
      {
        recordId: 'PRT-SYSTEM',
        schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
        payload: { kind: 'protocol', recordId: 'PRT-SYSTEM', title: 'Sys', steps: [] },
        meta: { createdBy: 'system' },
      } as RecordEnvelope,
    ]);
    const authorization = new AuthorizationService(store);
    const created = await authorization.backfillOwnerPolicies('USR-LOCAL-ADMIN');
    // No USR-* creator → no policy stamped → stays open.
    expect(created).toBe(0);
    expect(await authorization.findPolicyForRecord('PRT-SYSTEM')).toBeNull();
    // Open = anyone can read.
    expect(await authorization.canAccess('USR-OWNER', 'read', (await store.get('PRT-SYSTEM'))!)).toBe(true);
  });

  it('stamps the declared visibility and owner for lab-shared kinds', async () => {
    const store = new MemoryRecordStore([
      user('USR-BRAD'),
      user('USR-LOCAL-ADMIN'),
      user('USR-ADMIN-2'),
      user('USR-STRANGER'),
      {
        recordId: 'GRP-LAB-ADMINS',
        schemaId: 'https://computable-lab.com/schema/computable-lab/group.schema.yaml',
        payload: { kind: 'group', recordId: 'GRP-LAB-ADMINS', memberUserIds: ['USR-ADMIN-2'] },
      } as RecordEnvelope,
      {
        recordId: 'OWN-LAB-DEFAULT',
        schemaId: 'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml',
        payload: {
          kind: 'ownership-policy',
          recordId: 'OWN-LAB-DEFAULT',
          title: 'Lab policy',
          scope: { type: 'lab', id: 'lab' },
          labOwnerUserId: 'USR-LOCAL-ADMIN',
          fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['user'] },
          kindRules: [
            { kind: 'instrument', owner: 'lab', visibility: 'public', filedTo: 'none', editRoles: ['owner', 'admin'], shareTargets: ['user', 'group', 'lab'], defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }] },
          ],
        },
      } as RecordEnvelope,
    ]);
    const authorization = new AuthorizationService(store, new OwnershipPolicyService(store));
    const instrument = {
      recordId: 'INS-MITO-SPECIAL',
      schemaId: 'https://computable-lab.com/schema/computable-lab/instrument.schema.yaml',
      payload: { kind: 'instrument', id: 'INS-MITO-SPECIAL', name: 'Grant-funded imager' },
    } as RecordEnvelope;

    const stamped = await authorization.ensureOwnerPolicy(instrument, 'USR-BRAD');

    expect((stamped?.payload as Record<string, unknown>).visibility).toBe('public');
    // OWN-15 RULING (flips the AS-ORCH defect-certifying assertion): the CREATING
    // user is the owner of every minted ACL. `owner: lab` survives only as
    // visibility/grants semantics — never as an owner substitution.
    expect((stamped?.payload as Record<string, unknown>).ownerUserId).toBe('USR-BRAD');
    // Declared lab-visible => a stranger can read it.
    expect(await authorization.canAccess('USR-STRANGER', 'read', instrument)).toBe(true);
    // MULTI-USER: the declared admin GROUP administers it — and the grant is now
    // RESOLVABLE (the group record exists in the store; the seed ships one too).
    expect((stamped?.payload as Record<string, unknown>).grants).toEqual([
      { principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' },
    ]);
    expect(await authorization.canAccess('USR-ADMIN-2', 'admin', instrument)).toBe(true);   // member of GRP-LAB-ADMINS
    expect(await authorization.canAccess('USR-STRANGER', 'admin', instrument)).toBe(false); // not a member
  });

  // ===================== OWN-15: creator-owns + honest mint =====================
  // Binding ruling (L1-wave3-followup-rulings R2): the ACL stamped at record
  // creation names the CREATING user as owner. These tests are the RED-first
  // harness: against the pre-fix product they fail with the minted ACL showing
  // ownerUserId = the doc's labOwnerUserId (USR-LOCAL-ADMIN) ≠ creator, and the
  // creator's GET/PUT of their new lab-kind record + its access-policy 403/404s.

  function labPolicyDocEnv(): RecordEnvelope {
    return {
      recordId: 'OWN-LAB-DEFAULT',
      schemaId: 'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml',
      payload: {
        kind: 'ownership-policy',
        recordId: 'OWN-LAB-DEFAULT',
        title: 'Lab policy',
        scope: { type: 'lab', id: 'lab' },
        labOwnerUserId: 'USR-LOCAL-ADMIN',
        fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['user'] },
        kindRules: [
          { kind: 'material', owner: 'lab', visibility: 'public', filedTo: 'none', editRoles: ['owner', 'admin'], shareTargets: ['user', 'group', 'lab'], defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }] },
          { kind: 'instrument', owner: 'lab', visibility: 'public', filedTo: 'none', editRoles: ['owner', 'admin'], shareTargets: ['user', 'group', 'lab'], defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }] },
        ],
      },
    } as RecordEnvelope;
  }

  function labAdminsGroup(memberUserIds: string[]): RecordEnvelope {
    return {
      recordId: 'GRP-LAB-ADMINS',
      schemaId: 'https://computable-lab.com/schema/computable-lab/group.schema.yaml',
      payload: { kind: 'group', recordId: 'GRP-LAB-ADMINS', name: 'lab-administrators', displayName: 'Lab Administrators', status: 'active', memberUserIds },
    } as RecordEnvelope;
  }

  function material(id: string): RecordEnvelope {
    return {
      recordId: id,
      schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
      payload: { kind: 'material', id, name: id, domain: 'reagent' },
    } as RecordEnvelope;
  }

  function own15Handlers(store: MemoryRecordStore) {
    return createRecordHandlers(
      store,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        identityService: new LocalIdentityService(store),
        authorizationService: new AuthorizationService(store, new OwnershipPolicyService(store)),
        ownershipPolicyService: new OwnershipPolicyService(store),
      },
    );
  }

  it('OWN-15 RED/GREEN: a non-admin session user who creates a lab-kind record OWNS it and reads/writes it without any data repair', async () => {
    const store = new MemoryRecordStore([
      user('USR-BRAD'),
      user('USR-LOCAL-ADMIN'),
      labAdminsGroup(['USR-LOCAL-ADMIN']),
      labPolicyDocEnv(),
    ]);
    const handlers = own15Handlers(store);

    // Create a lab-owned kind (the 403-debt kind) as the non-admin creator.
    const createReply = reply();
    const created = await handlers.createRecord(
      request<{ Body: { schemaId: string; payload: unknown } }>({
        body: {
          schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
          payload: { kind: 'material', id: 'MAT-OWN15-1', name: 'Own15 reagent', domain: 'reagent' },
        },
        headers: { 'x-user-id': 'USR-BRAD' },
      }),
      createReply,
    );
    expect(createReply.statusCode).toBe(201);
    expect('success' in created ? created.success : false).toBe(true);

    // Self read as the creator (pre-fix RED: public visibility still reads, but…).
    const getReply = reply();
    const got = await handlers.getRecord(
      request<{ Params: { id: string }; Querystring: Record<string, string> }>({ params: { id: 'MAT-OWN15-1' }, query: {}, headers: { 'x-user-id': 'USR-BRAD' } }),
      getReply,
    );
    expect(getReply.statusCode).toBe(200);
    expect('record' in got ? got.record.recordId : null).toBe('MAT-OWN15-1');

    // Self write as the creator (pre-fix RED: 403 — creator ≠ stamped owner and
    // the inert GRP-LAB-ADMINS grant never opens). This is the reported debt.
    const putReply = reply();
    const updated = await handlers.updateRecord(
      request<{ Params: { id: string }; Body: { payload: unknown } }>({
        params: { id: 'MAT-OWN15-1' },
        body: { payload: { kind: 'material', id: 'MAT-OWN15-1', name: 'Own15 reagent (renamed)', domain: 'reagent' } },
        headers: { 'x-user-id': 'USR-BRAD' },
      }),
      putReply,
    );
    expect(putReply.statusCode).toBe(200);
    expect('success' in updated ? updated.success : false).toBe(true);

    // The minted ACL names the CREATING user as owner — not the doc's labOwnerUserId.
    const acl = await store.get('ACL-MAT-OWN15-1');
    expect(acl).toBeTruthy();
    expect((acl?.payload as Record<string, unknown>).ownerUserId).toBe('USR-BRAD');
    // Visibility semantics survive: owner ≠ visibility.
    expect((acl?.payload as Record<string, unknown>).visibility).toBe('public');
    // The declared group grant is stamped AND resolvable (the group record exists).
    expect((acl?.payload as Record<string, unknown>).grants).toEqual([
      { principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' },
    ]);
  });

  it('OWN-15: the creator administers their own record\'s ACL row — PUT /records/:id/access-policy 200, a non-owner still 403s', async () => {
    const store = new MemoryRecordStore([
      user('USR-BRAD'),
      user('USR-LOCAL-ADMIN'),
      user('USR-STRANGER'),
      labAdminsGroup(['USR-LOCAL-ADMIN']),
      labPolicyDocEnv(),
    ]);
    const identity = new LocalIdentityService(store);
    const authorization = new AuthorizationService(store, new OwnershipPolicyService(store));
    const identityHandlers = createIdentityHandlers({ store, identityService: identity, authorizationService: authorization });

    // The resource record exists (create-path persists it before the mint).
    await store.create({ envelope: material('MAT-OWN15-2'), message: 'seed material' });
    // Mint the ACL for a lab-kind record created by USR-BRAD.
    const stamped = await authorization.ensureOwnerPolicy(material('MAT-OWN15-2'), 'USR-BRAD');
    expect((stamped?.payload as Record<string, unknown>).ownerUserId).toBe('USR-BRAD');

    // The self-lock (RecordHandlers.ts:940 requires 'admin' on an access-policy
    // payload; resolveEffectivePolicy resolves the ACL row to ITSELF) no longer
    // dead-ends the creator: the owner of the REFERENCED record satisfies admin
    // on the ACL row (the single declared delegation rule in canAccess).
    expect(await authorization.canAccess('USR-BRAD', 'admin', (await store.get('ACL-MAT-OWN15-2'))!)).toBe(true);
    // The delegation does NOT turn ACLs open: a non-owner/non-grantee still fails.
    expect(await authorization.canAccess('USR-STRANGER', 'admin', (await store.get('ACL-MAT-OWN15-2'))!)).toBe(false);
    // USR-LOCAL-ADMIN administers via the DECLARED group grant (not the delegation).
    expect(await authorization.canAccess('USR-LOCAL-ADMIN', 'admin', (await store.get('ACL-MAT-OWN15-2'))!)).toBe(true);

    // PUT /api/records/MAT-OWN15-2/access-policy as the creator → 200 with the
    // new grants, zero data-dir repair.
    const putReply = reply();
    await identityHandlers.putAccessPolicy(
      request<{ Params: { id: string }; Body: { visibility?: string; grants?: unknown } }>({
        params: { id: 'MAT-OWN15-2' },
        body: { visibility: 'shared', grants: [{ principalType: 'user', principalId: 'USR-STRANGER', role: 'viewer' }] },
        headers: { 'x-user-id': 'USR-BRAD' },
      }),
      putReply,
    );
    expect(putReply.statusCode).toBe(200);
    const aclNow = await store.get('ACL-MAT-OWN15-2');
    expect((aclNow?.payload as Record<string, unknown>).visibility).toBe('shared');
    expect((aclNow?.payload as Record<string, unknown>).ownerUserId).toBe('USR-BRAD');

    // A non-owner's PUT still 403s (the delegation must not open ACLs).
    const denyReply = reply();
    await identityHandlers.putAccessPolicy(
      request<{ Params: { id: string }; Body: { visibility?: string; grants?: unknown } }>({
        params: { id: 'MAT-OWN15-2' },
        body: { visibility: 'public', grants: [] },
        headers: { 'x-user-id': 'USR-STRANGER' },
      }),
      denyReply,
    );
    expect(denyReply.statusCode).toBe(403);

    // admin-on-ACL is NOT same-as-owning-the-record: the delegation must not
    // leak into resolveEffectivePolicy returning someone else's policy.
    const effective = await authorization.resolveEffectivePolicy(material('MAT-OWN15-2'));
    expect(effective?.ownerUserId).toBe('USR-BRAD');
  });

  it('OWN-15: an unresolvable declared group grant is STRIPPED at mint with a loud typed refusal — never a silent inert grant', async () => {
    // No GRP-LAB-ADMINS record in this store: the declared grant cannot resolve.
    const store = new MemoryRecordStore([
      user('USR-BRAD'),
      user('USR-LOCAL-ADMIN'),
      labPolicyDocEnv(),
    ]);
    const authorization = new AuthorizationService(store, new OwnershipPolicyService(store));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const stamped = await authorization.ensureOwnerPolicy(material('MAT-OWN15-3'), 'USR-BRAD');

      // The record is never left ownerless or open: creator-owner ACL is minted.
      expect(stamped).toBeTruthy();
      expect((stamped?.payload as Record<string, unknown>).ownerUserId).toBe('USR-BRAD');
      // The unresolvable grant is REFUSED at the grant level — stripped, and the
      // refusal is observable (typed warning surfaced in the result + logged).
      expect((stamped?.payload as Record<string, unknown>).grants).toEqual([]);
      expect(warnSpy.mock.calls.some((args) => args.some((a) => String(a).includes('GRP-LAB-ADMINS')))).toBe(true);
      expect(warnSpy.mock.calls.some((args) => String(args[0]).includes('acl-mint-refusal'))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('OWN-15: an unresolvable declared labOwnerUserId is refused honestly — the creator is stamped, never the phantom', async () => {
    // labOwnerUserId points at a user record that does not exist.
    const store = new MemoryRecordStore([
      user('USR-BRAD'),
      labAdminsGroup(['USR-BRAD']),
      labPolicyDocEnv(),
    ]);
    const authorization = new AuthorizationService(store, new OwnershipPolicyService(store));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const stamped = await authorization.ensureOwnerPolicy(material('MAT-OWN15-4'), 'USR-BRAD');
      expect(stamped).toBeTruthy();
      // Post-fix the owner is the creator regardless; the phantom lab owner is
      // never stamped and the declared grant resolves (the group exists).
      expect((stamped?.payload as Record<string, unknown>).ownerUserId).toBe('USR-BRAD');
      expect((stamped?.payload as Record<string, unknown>).grants).toEqual([
        { principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' },
      ]);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
