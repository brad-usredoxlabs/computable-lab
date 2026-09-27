/**
 * AuditEventService: append-only audit events + governance plumbing in
 * RecordHandlers (signatureRefs validation, append-only kind blocking,
 * best-effort audit append on lifecycle transitions).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UpdateRecordRequest } from '../api/types.js';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import { AuditEventService } from './AuditEventService.js';
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js';
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js';
import type { LifecycleSpec } from '../lifecycle/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStoreMock(overrides: Partial<RecordStore> = {}): RecordStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ success: true }),
    update: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as RecordStore;
}

function makeMockReply() {
  let statusValue = 200;

  const reply: any = {
    status: (code: number) => {
      statusValue = code;
      return reply;
    },
    send: (body: unknown) => {
      return reply;
    },
  };

  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });

  return reply;
}

// ---------------------------------------------------------------------------
// AuditEventService unit
// ---------------------------------------------------------------------------

describe('AuditEventService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends an audit-event record with actor, action and subject', async () => {
    const store = makeStoreMock();
    const service = new AuditEventService(store);

    await service.append({
      actor: 'USR-CAROL',
      action: 'lifecycle_transition',
      subjectType: 'document',
      subjectId: 'DOC-1',
      data: { from: 'draft', to: 'in_review' },
    });

    expect(store.create).toHaveBeenCalledTimes(1);
    const call = (store.create as ReturnType<typeof vi.fn>).mock.calls[0];
    const envelope = call[0].envelope as RecordEnvelope;
    const payload = envelope.payload as Record<string, unknown>;
    expect(payload.kind).toBe('audit-event');
    expect(payload.actor).toBe('USR-CAROL');
    expect(payload.action).toBe('lifecycle_transition');
    expect(payload.subjectType).toBe('document');
    expect(payload.subjectId).toBe('DOC-1');
    expect(payload.recordId).toMatch(/^EVT-[A-Z0-9]{16}$/);
    expect(payload.occurredAt).toBeTruthy();
    expect(payload.data).toEqual({ from: 'draft', to: 'in_review' });
    expect(envelope.schemaId).toBe(
      'https://computable-lab.com/schema/computable-lab/audit-event.schema.yaml',
    );
  });

  it('omits data when not provided', async () => {
    const store = makeStoreMock();
    const service = new AuditEventService(store);

    await service.append({ actor: 'USR-1', action: 'note', subjectType: 'x', subjectId: 'Y-1' });

    const payload = (store.create as ReturnType<typeof vi.fn>).mock.calls[0][0].envelope.payload;
    expect('data' in payload).toBe(false);
  });

  it('never throws when the store fails (best-effort)', async () => {
    const store = makeStoreMock({
      create: vi.fn().mockRejectedValue(new Error('disk on fire')),
    });
    const service = new AuditEventService(store);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      service.append({ actor: 'USR-1', action: 'x', subjectType: 't', subjectId: 'S-1' }),
    ).resolves.toBeUndefined();

    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// document-controlled-signing lifecycle YAML
// ---------------------------------------------------------------------------

describe('document-controlled-signing lifecycle yaml', () => {
  it('parses into an engine-loadable spec with requires_signature guards', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { parse } = await import('yaml');

    const schemaDir = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema');
    const raw = readFileSync(
      join(schemaDir, 'core', 'lifecycles', 'document-controlled-signing.lifecycle.yaml'),
      'utf-8',
    );
    const spec = parse(raw) as LifecycleSpec;
    expect(spec.id).toBe('document-controlled-signing');

    const approve = spec.transitions.find(t => t.to === 'approved' && String(t.from) === 'in_review');
    const effective = spec.transitions.find(t => t.to === 'effective');
    expect(approve?.guards?.some(g => g.type === 'requires_signature' && (g as any).signatureAction === 'approved')).toBe(true);
    expect(effective?.guards?.some(g => g.type === 'requires_signature' && (g as any).signatureAction === 'approved')).toBe(true);

    // Must be engine-loadable
    const engine = new LifecycleEngine();
    engine.loadLifecycle(spec);
    expect(engine.isLoaded('document-controlled-signing')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RecordHandlers governance plumbing
// ---------------------------------------------------------------------------

const signingSpec: LifecycleSpec = {
  lifecycleVersion: 1,
  id: 'doc-sign',
  states: [{ id: 'in_review', initial: true }, { id: 'approved' }],
  transitions: [
    {
      from: 'in_review',
      to: 'approved',
      role: 'reviewer',
      label: 'Approve',
      guards: [{ type: 'requires_signature', signatureAction: 'approved' }],
    },
  ],
};

function makeSigningEngine(): LifecycleEngine {
  const engine = new LifecycleEngine();
  engine.loadLifecycle(signingSpec);
  return engine;
}

function docEnvelope(state: string): RecordEnvelope {
  return {
    recordId: 'DOC-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/document.schema.yaml',
    payload: {
      kind: 'document',
      recordId: 'DOC-1',
      lifecycleId: 'doc-sign',
      state,
      createdBy: 'USR-AUTHOR',
    },
    meta: {},
  } as unknown as RecordEnvelope;
}

function signatureEnvelope(over: Record<string, unknown> = {}): RecordEnvelope {
  return {
    recordId: 'SIG-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/signature.schema.yaml',
    payload: {
      kind: 'signature',
      recordId: 'SIG-1',
      signedBy: 'USR-REV',
      action: 'approved',
      meaning: { code: 'approved' },
      subject: { recordId: 'DOC-1' },
      signedAt: '2026-09-26T00:00:00.000Z',
      authentication: { method: 'password_reauthentication' },
      ...over,
    },
    meta: {},
  } as unknown as RecordEnvelope;
}

function makeGovernanceStore(records: Record<string, RecordEnvelope>) {
  return makeStoreMock({
    get: vi.fn(async (id: string) => records[id] ?? null),
    update: vi.fn(async () => ({
      success: true,
      envelope: docEnvelope('approved'),
      commit: { sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', message: 'approve', timestamp: '2026-09-26T00:00:00.000Z' },
    })),
  });
}

function makeUpdateRequest(body: Record<string, unknown>) {
  return {
    params: { id: 'DOC-1' },
    body: {
      payload: {
        kind: 'document',
        recordId: 'DOC-1',
        lifecycleId: 'doc-sign',
        state: 'approved',
        createdBy: 'USR-AUTHOR',
      },
      ...body,
    },
    headers: {},
  } as unknown as FastifyRequest<{ Params: { id: string }; Body: UpdateRecordRequest }>;
}

describe('RecordHandlers signature-ref validation (requires_signature guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function build(deps: { records: Record<string, RecordEnvelope>; auditService?: any; appendOnly?: string[] }) {
    const store = makeGovernanceStore(deps.records);
    const identityService = {
      resolveRequestUser: async () => ({ userId: 'USR-REV', isSystem: false }),
    };
    const handlers = createRecordHandlers(
      store,
      undefined,
      undefined,
      undefined,
      makeSigningEngine(),
      undefined,
      {
        identityService,
        ...(deps.auditService !== undefined ? { auditService: deps.auditService } : {}),
        ...(deps.appendOnly !== undefined ? { getAppendOnlyKinds: () => deps.appendOnly! } : {}),
      } as any,
    );
    return { store, handlers };
  }

  it('blocks the transition with no signature presented (422 LIFECYCLE_TRANSITION_DENIED)', async () => {
    const { store, handlers } = build({ records: { 'DOC-1': docEnvelope('in_review') } });
    const reply = makeMockReply();

    const result = await handlers.updateRecord(makeUpdateRequest({}), reply as FastifyReply);

    expect(reply.statusValue).toBe(422);
    expect((result as any).error).toBe('LIFECYCLE_TRANSITION_DENIED');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects a signatureRef pointing at a non-signature record (422 INVALID_SIGNATURE_REF)', async () => {
    const { store, handlers } = build({
      records: { 'DOC-1': docEnvelope('in_review'), 'SIG-BAD': docEnvelope('in_review') },
    });
    const reply = makeMockReply();

    const result = await handlers.updateRecord(makeUpdateRequest({ signatureRefs: ['SIG-BAD'] }), reply as FastifyReply);

    expect(reply.statusValue).toBe(422);
    expect((result as any).error).toBe('INVALID_SIGNATURE_REF');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects a signature bound to a different subject (422 SIGNATURE_SUBJECT_MISMATCH)', async () => {
    const badSig: RecordEnvelope = {
      recordId: 'SIG-1',
      schemaId: 'x',
      payload: {
        kind: 'signature',
        recordId: 'SIG-1',
        signedBy: 'USR-REV',
        action: 'approved',
        meaning: { code: 'approved' },
        subject: { recordId: 'DOC-OTHER' },
        signedAt: '2026-09-26T00:00:00.000Z',
        authentication: { method: 'password_reauthentication' },
      },
      meta: {},
    } as unknown as RecordEnvelope;
    const { store, handlers } = build({ records: { 'DOC-1': docEnvelope('in_review'), 'SIG-1': badSig } });
    const reply = makeMockReply();

    const result = await handlers.updateRecord(makeUpdateRequest({ signatureRefs: ['SIG-1'] }), reply as FastifyReply);

    expect(reply.statusValue).toBe(422);
    expect((result as any).error).toBe('SIGNATURE_SUBJECT_MISMATCH');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('rejects a signature signed by a different person (422 SIGNATURE_SIGNER_MISMATCH)', async () => {
    const { store, handlers } = build({
      records: {
        'DOC-1': docEnvelope('in_review'),
        'SIG-1': signatureEnvelope({ signedBy: 'USR-OTHER' }),
      },
    });
    const reply = makeMockReply();

    const result = await handlers.updateRecord(makeUpdateRequest({ signatureRefs: ['SIG-1'] }), reply as FastifyReply);

    expect(reply.statusValue).toBe(422);
    expect((result as any).error).toBe('SIGNATURE_SIGNER_MISMATCH');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('allows the transition with a matching signature and appends a lifecycle_transition audit event', async () => {
    const auditService = { append: vi.fn().mockResolvedValue(undefined) };
    const { store, handlers } = build({
      records: { 'DOC-1': docEnvelope('in_review'), 'SIG-1': signatureEnvelope() },
      auditService,
    });
    const reply = makeMockReply();

    const result = await handlers.updateRecord(makeUpdateRequest({ signatureRefs: ['SIG-1'] }), reply as FastifyReply);

    expect((result as any).success).toBe(true);
    expect(store.update).toHaveBeenCalledTimes(1);
    expect(auditService.append).toHaveBeenCalledTimes(1);
    const event = auditService.append.mock.calls[0][0];
    expect(event.actor).toBe('USR-REV');
    expect(event.action).toBe('lifecycle_transition');
    expect(event.subjectType).toBe('document');
    expect(event.subjectId).toBe('DOC-1');
    expect(event.data.from).toBe('in_review');
    expect(event.data.to).toBe('approved');
    expect(event.data.lifecycleId).toBe('doc-sign');
    expect(event.data.commitSha).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
  });

  it('does not append an audit event when there is no lifecycle transition', async () => {
    const auditService = { append: vi.fn().mockResolvedValue(undefined) };
    const store = makeGovernanceStore({ 'DOC-1': docEnvelope('in_review') });
    const identityService = { resolveRequestUser: async () => ({ userId: 'USR-REV', isSystem: false }) };
    const handlers = createRecordHandlers(
      store,
      undefined,
      undefined,
      undefined,
      makeSigningEngine(),
      undefined,
      { identityService, auditService } as any,
    );
    const reply = makeMockReply();

    // Same state → no transition
    await handlers.updateRecord(
      {
        params: { id: 'DOC-1' },
        body: {
          payload: {
            kind: 'document',
            recordId: 'DOC-1',
            lifecycleId: 'doc-sign',
            state: 'in_review',
            createdBy: 'USR-AUTHOR',
          },
        },
        headers: {},
      } as unknown as FastifyRequest<{ Params: { id: string }; Body: UpdateRecordRequest }>,
      reply as FastifyReply,
    );

    expect(store.update).toHaveBeenCalledTimes(1);
    expect(auditService.append).not.toHaveBeenCalled();
  });
});

describe('RecordHandlers append-only kinds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks updates of append-only kinds with 405 APPEND_ONLY', async () => {
    const store = makeGovernanceStore({ 'SIG-1': signatureEnvelope() });
    const identityService = { resolveRequestUser: async () => ({ userId: 'USR-REV', isSystem: false }) };
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      identityService,
      getAppendOnlyKinds: () => ['audit-event', 'signature'],
    } as any);
    const reply = makeMockReply();

    const result = await handlers.updateRecord(
      {
        params: { id: 'SIG-1' },
        body: { payload: { kind: 'signature', recordId: 'SIG-1', signedBy: 'USR-REV' } },
        headers: {},
      } as unknown as FastifyRequest<{ Params: { id: string }; Body: UpdateRecordRequest }>,
      reply as FastifyReply,
    );

    expect(reply.statusValue).toBe(405);
    expect((result as any).error).toBe('APPEND_ONLY');
    expect((result as any).message).toContain('append-only signature record');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('blocks deletes of append-only kinds with 405 APPEND_ONLY', async () => {
    const store = makeGovernanceStore({ 'EVT-1': { recordId: 'EVT-1', schemaId: 'x', payload: { kind: 'audit-event', recordId: 'EVT-1' }, meta: {} } as unknown as RecordEnvelope });
    const identityService = { resolveRequestUser: async () => ({ userId: 'USR-REV', isSystem: false }) };
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      identityService,
      getAppendOnlyKinds: () => ['audit-event', 'signature'],
    } as any);
    const reply = makeMockReply();

    const result = await handlers.deleteRecord(
      { params: { id: 'EVT-1' }, query: {}, headers: {} } as any,
      reply as FastifyReply,
    );

    expect(reply.statusValue).toBe(405);
    expect((result as any).error).toBe('APPEND_ONLY');
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('allows mutations when no accessor is configured (system works with config ripped out)', async () => {
    const store = makeGovernanceStore({ 'SIG-1': signatureEnvelope() });
    const identityService = { resolveRequestUser: async () => ({ userId: 'USR-REV', isSystem: false }) };
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      identityService,
    } as any);
    const reply = makeMockReply();

    const result = await handlers.deleteRecord(
      { params: { id: 'SIG-1' }, query: {}, headers: {} } as any,
      reply as FastifyReply,
    );

    expect((result as any).success).toBe(true);
    expect(store.delete).toHaveBeenCalledTimes(1);
  });
});
