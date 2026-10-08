/**
 * Tests for SignatureHandlers (e-signature minting with password re-auth).
 *
 * Handlers are invoked directly with vi.fn() mocks — no route registration
 * (the parent wires routes.ts separately).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import { contentHash } from '../../revisions/RecordRevisionService.js';
import { createSignatureHandlers } from './SignatureHandlers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStore(overrides: Record<string, unknown> = {}): RecordStore {
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
    getVerifiedCommit: vi.fn().mockResolvedValue('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'),
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
    send: (body: unknown) => reply,
  };

  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });

  return reply;
}

const docRecord = {
  recordId: 'DOC-1',
  schemaId: 'https://computable-lab.com/schema/computable-lab/document.schema.yaml',
  payload: { kind: 'document', recordId: 'DOC-1', lifecycleId: 'document-controlled-signing', state: 'in_review' },
  meta: { commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' },
} as unknown as RecordEnvelope;

function build(deps: {
  store?: RecordStore;
  verifier?: string | null;
  passwordOk?: boolean;
  userId?: string | null;
  auditService?: { append: ReturnType<typeof vi.fn> };
} = {}) {
  const store = deps.store ?? makeMockStore({ get: vi.fn(async (id: string) => (id === 'DOC-1' ? docRecord : null)) });
  const credentialStore = {
    getVerifier: vi.fn(async () => deps.verifier !== undefined ? deps.verifier : 'hash:salt'),
  };
  const identityService = {
    resolveRequestUser: vi.fn(async () => ({ userId: deps.userId !== undefined ? deps.userId : 'USR-REV', isSystem: false })),
  };
  // verifyPassword is a module-level function; mock the module so the handler
  // under test resolves the mock too.
  return { store, credentialStore, identityService, auditService: deps.auditService };
}

vi.mock('../../security/CredentialStore.js', () => ({
  verifyPassword: vi.fn((password: string, _stored: string) => password === 'correct-horse'),
  hashPassword: vi.fn((p: string) => `hash:${p}`),
  CredentialStore: class {},
}));

function makeRequest(body: Record<string, unknown>) {
  return {
    body: {
      subject: { recordId: 'DOC-1' },
      action: 'approved',
      password: 'correct-horse',
      ...body,
    },
    headers: {},
  } as unknown as FastifyRequest<{ Body: Record<string, unknown> }>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SignatureHandlers.mintSignature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with 401 when no session user can be resolved', async () => {
    const { store, credentialStore, identityService } = build({ userId: null });
    const handlers = createSignatureHandlers({ store, credentialStore: credentialStore as any, identityService: identityService as any });
    const reply = makeMockReply();

    const result = await handlers.mintSignature(makeRequest({}), reply as FastifyReply);

    expect(reply.statusValue).toBe(401);
    expect((result as any).error).toBeTruthy();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects with 404 SUBJECT_NOT_FOUND when the subject record does not exist', async () => {
    const store = makeMockStore(); // get -> null
    const { credentialStore, identityService } = build();
    const handlers = createSignatureHandlers({ store, credentialStore: credentialStore as any, identityService: identityService as any });
    const reply = makeMockReply();

    const result = await handlers.mintSignature(makeRequest({}), reply as FastifyReply);

    expect(reply.statusValue).toBe(404);
    expect((result as any).error).toBe('SUBJECT_NOT_FOUND');
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects with 403 REAUTH_FAILED on a wrong password and does NOT create anything', async () => {
    const { store, credentialStore, identityService } = build();
    const handlers = createSignatureHandlers({ store, credentialStore: credentialStore as any, identityService: identityService as any });
    const reply = makeMockReply();

    const result = await handlers.mintSignature(makeRequest({ password: 'wrong' }), reply as FastifyReply);

    expect(reply.statusValue).toBe(403);
    expect((result as any).error).toBe('REAUTH_FAILED');
    expect((result as any).message).toBe('Re-authentication failed');
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects with 403 REAUTH_FAILED when no verifier exists (uniform message, no leak)', async () => {
    const { store, credentialStore, identityService } = build({ verifier: null });
    const handlers = createSignatureHandlers({ store, credentialStore: credentialStore as any, identityService: identityService as any });
    const reply = makeMockReply();

    const result = await handlers.mintSignature(makeRequest({}), reply as FastifyReply);

    expect(reply.statusValue).toBe(403);
    expect((result as any).error).toBe('REAUTH_FAILED');
    expect((result as any).message).toBe('Re-authentication failed');
    expect(store.create).not.toHaveBeenCalled();
  });

  it('creates a signature with signedBy from the SESSION user even when the body carries signedBy (body field ignored)', async () => {
    const { store, credentialStore, identityService } = build();
    const handlers = createSignatureHandlers({ store, credentialStore: credentialStore as any, identityService: identityService as any });
    const reply = makeMockReply();

    const result = await handlers.mintSignature(
      makeRequest({ signedBy: 'USR-EVIL', actor: 'USR-EVIL' }),
      reply as FastifyReply,
    );

    expect((result as any).success).toBe(true);
    expect(store.create).toHaveBeenCalledTimes(2);
    const envelope = (store.create as ReturnType<typeof vi.fn>).mock.calls.find(call => call[0].envelope.payload.kind === 'signature')![0].envelope as RecordEnvelope;
    const payload = envelope.payload as Record<string, unknown>;
    expect(payload.signedBy).toBe('USR-REV');
    expect(payload.signedBy).not.toBe('USR-EVIL');
    expect(payload.kind).toBe('signature');
    expect(payload.recordId).toMatch(/^SIG-[A-Z0-9]{16}$/);
    expect(payload.action).toBe('approved');
    expect(payload.meaning).toEqual({ code: 'approved' });
    expect(payload.authentication).toEqual({ method: 'password_reauthentication' });
    expect((payload.subject as Record<string, unknown>).recordId).toBe('DOC-1');
    expect((result as any).signatureId).toBe(payload.recordId);
    expect((result as any).subject).toEqual({
      recordId: 'DOC-1',
      revisionRef: { kind: 'record', type: 'record-revision', id: expect.stringMatching(/^REV-/) },
      contentHash: contentHash(docRecord.payload),
      gitCommit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    });
    // The minted signature payload must itself validate against the recordId
    // pattern the schema pins.
    expect(String(payload.recordId)).toMatch(/^SIG-[A-Z0-9][A-Z0-9_-]*$/);
  });

  it('records gitCommit from the subject record meta when reachable', async () => {
    const { store, credentialStore, identityService } = build();
    const auditService = { append: vi.fn().mockResolvedValue(undefined) };
    const handlers = createSignatureHandlers({
      store,
      credentialStore: credentialStore as any,
      identityService: identityService as any,
      auditService,
    });
    const reply = makeMockReply();

    await handlers.mintSignature(makeRequest({}), reply as FastifyReply);

    const envelope = (store.create as ReturnType<typeof vi.fn>).mock.calls.find(call => call[0].envelope.payload.kind === 'signature')![0].envelope as RecordEnvelope;
    const payload = envelope.payload as Record<string, unknown>;
    expect((payload.subject as Record<string, unknown>).gitCommit).toBe(
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    );
    expect(auditService.append).toHaveBeenCalledTimes(1);
    const event = auditService.append.mock.calls[0][0];
    expect(event.actor).toBe('USR-REV');
    expect(event.action).toBe('signature_applied');
    expect(event.subjectType).toBe('signature');
    expect(event.subjectId).toBe(payload.recordId);
    expect(event.data.subjectRecordId).toBe('DOC-1');
  });

  it('carries lifecycleId/targetState/statement through to the signature record', async () => {
    const { store, credentialStore, identityService } = build();
    const handlers = createSignatureHandlers({ store, credentialStore: credentialStore as any, identityService: identityService as any });
    const reply = makeMockReply();

    await handlers.mintSignature(
      makeRequest({
        subject: { recordId: 'DOC-1', lifecycleId: 'document-controlled-signing', targetState: 'approved' },
        statement: 'I approve this SOP',
      }),
      reply as FastifyReply,
    );

    const payload = (store.create as ReturnType<typeof vi.fn>).mock.calls.find(call => call[0].envelope.payload.kind === 'signature')![0].envelope.payload as Record<string, unknown>;
    expect(payload.meaning).toEqual({ code: 'approved', statement: 'I approve this SOP' });
    expect(payload.subject).toEqual({
      recordId: 'DOC-1',
      revisionRef: { kind: 'record', type: 'record-revision', id: expect.stringMatching(/^REV-/) },
      contentHash: contentHash(docRecord.payload),
      gitCommit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      lifecycleId: 'document-controlled-signing',
      targetState: 'approved',
    });
  });

  it('surfaces 422 when the store rejects the create', async () => {
    const store = makeMockStore({
      get: vi.fn(async () => docRecord),
      create: vi.fn(async () => ({ success: false, error: 'Validation failed' })),
    });
    const { credentialStore, identityService } = build({ store });
    const handlers = createSignatureHandlers({ store, credentialStore: credentialStore as any, identityService: identityService as any });
    const reply = makeMockReply();

    const result = await handlers.mintSignature(makeRequest({}), reply as FastifyReply);

    expect(reply.statusValue).toBe(422);
    expect((result as any).success).toBe(false);
  });
});
