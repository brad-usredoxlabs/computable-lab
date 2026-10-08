import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { CredentialStore, hashPassword } from '../../security/CredentialStore.js';
import { SessionStore } from '../../security/SessionStore.js';
import { LocalIdentityService } from '../../security/LocalIdentityService.js';
import { LOCAL_ADMIN_USER_ID } from '../../security/LocalIdentityService.js';
import { createAuthHandlers } from './AuthHandlers.js';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';

const tmp = resolve(tmpdir(), 'cl-auth-handlers-test');

function makeUserEnv(recordId: string, username: string, displayName: string, status = 'active'): RecordEnvelope {
  const now = new Date().toISOString();
  return {
    recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/user.schema.yaml',
    payload: { kind: 'user', recordId, username, displayName, status, createdAt: now, updatedAt: now },
    meta: { createdAt: now, updatedAt: now, createdBy: 'system' },
  };
}

function makeStore(users: RecordEnvelope[]): RecordStore {
  return {
    async list({ kind }: { kind?: string }) { return kind === 'user' ? users : []; },
    async get(id: string) { return users.find((u) => u.recordId === id) ?? null; },
  } as unknown as RecordStore;
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): FastifyRequest<{ Body: { username?: string; password?: string } }> {
  return { body, headers } as unknown as FastifyRequest<{ Body: { username?: string; password?: string } }>;
}

function makeReply() {
  let statusCode = 200;
  let body: unknown;
  const reply: FastifyReply = {
    status(code: number) { statusCode = code; return reply; },
    send(payload: unknown) { body = payload; return reply; },
  } as unknown as FastifyReply;
  return {
    reply,
    /** Record a handler RETURN value as the body (Fastify sends the return). */
    setBody(payload: unknown) { body = payload; },
    get status() { return statusCode; },
    get body() { return body; },
  };
}

beforeEach(() => rmSync(tmp, { recursive: true, force: true }));
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('AuthHandlers', () => {
  it('login issues a session token for valid credentials', async () => {
    const credDir = join(tmp, 'auth');
    mkdirSync(credDir, { recursive: true });
    const creds = new CredentialStore(credDir);
    await creds.setVerifier('USR-BRAD', hashPassword('supersecret1'));
    const sessions = new SessionStore(credDir);
    const handlers = createAuthHandlers({ store: makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]), credentialStore: creds, sessionStore: sessions });

    const r = makeReply();
    r.setBody(await handlers.login(makeRequest({ username: 'brad', password: 'supersecret1' }), r.reply));
    expect(r.status).toBe(200);
    const body = r.body as { success: boolean; token: string; userId: string };
    expect(body.success).toBe(true);
    expect(body.token).toMatch(/^cl-sess-/);
    expect(body.userId).toBe('USR-BRAD');
  });

  it('login rejects a wrong password with 401', async () => {
    const credDir = join(tmp, 'auth');
    const creds = new CredentialStore(credDir);
    await creds.setVerifier('USR-BRAD', hashPassword('rightpass'));

    const handlers = createAuthHandlers({ store: makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]), credentialStore: creds, sessionStore: new SessionStore(credDir) });
    const r = makeReply();
    r.setBody(await handlers.login(makeRequest({ username: 'brad', password: 'wrongpass' }), r.reply));
    expect(r.status).toBe(401);
    expect((r.body as { error: string }).error).toBe('INVALID_CREDENTIALS');
  });

  it('login rejects an unknown username with 401', async () => {
    const credDir = join(tmp, 'auth');
    const handlers = createAuthHandlers({ store: makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]), credentialStore: new CredentialStore(credDir), sessionStore: new SessionStore(credDir) });
    const r = makeReply();
    r.setBody(await handlers.login(makeRequest({ username: 'nobody', password: 'x' }), r.reply));
    expect(r.status).toBe(401);
  });

  it('login rejects a user with no credential (not yet set up) with 401', async () => {
    const credDir = join(tmp, 'auth');
    const handlers = createAuthHandlers({ store: makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]), credentialStore: new CredentialStore(credDir), sessionStore: new SessionStore(credDir) });
    const r = makeReply();
    r.setBody(await handlers.login(makeRequest({ username: 'brad', password: 'anything' }), r.reply));
    expect(r.status).toBe(401);
  });

  it('logout revokes the presented token so it no longer resolves', async () => {
    const credDir = join(tmp, 'auth');
    mkdirSync(credDir, { recursive: true });
    const creds = new CredentialStore(credDir);
    await creds.setVerifier('USR-BRAD', hashPassword('supersecret1'));
    const sessions = new SessionStore(credDir);
    const handlers = createAuthHandlers({ store: makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]), credentialStore: creds, sessionStore: sessions });

    const loginR = makeReply();
    loginR.setBody(await handlers.login(makeRequest({ username: 'brad', password: 'supersecret1' }), loginR.reply));
    const token = (loginR.body as { token: string }).token;
    expect(await sessions.resolve(token)).toBe('USR-BRAD');

    const logoutR = makeReply();
    await handlers.logout(makeRequest({}, { 'x-cl-session': token }), logoutR.reply);
    expect(await sessions.resolve(token)).toBeNull();
  });

  it('setPassword establishes a credential for the current user', async () => {
    const credDir = join(tmp, 'auth');
    mkdirSync(credDir, { recursive: true });
    const store = makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]);
    const identity = new LocalIdentityService(store);
    const creds = new CredentialStore(credDir);
    const handlers = createAuthHandlers({ store, credentialStore: creds, sessionStore: new SessionStore(credDir), identityService: identity });

    const r = makeReply();
    r.setBody(await handlers.setPassword(makeRequest({ password: 'bradpass123' }, { 'x-user-id': 'USR-BRAD' }), r.reply));
    expect(r.status).toBe(200);
    expect((r.body as { success: boolean }).success).toBe(true);

    // The user can now log in with that password.
    const loginR = makeReply();
    loginR.setBody(await handlers.login(makeRequest({ username: 'brad', password: 'bradpass123' }), loginR.reply));
    expect(loginR.status).toBe(200);
  });

  it('setPassword rejects a short password with 400', async () => {
    const credDir = join(tmp, 'auth');
    const store = makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]);
    const identity = new LocalIdentityService(store);
    const handlers = createAuthHandlers({ store, credentialStore: new CredentialStore(credDir), sessionStore: new SessionStore(credDir), identityService: identity });
    const r = makeReply();
    r.setBody(await handlers.setPassword(makeRequest({ password: 'short' }, { 'x-user-id': 'USR-BRAD' }), r.reply));
    expect(r.status).toBe(400);
  });

  it('setPassword succeeds for the admin inside the first-run bootstrap window, and the admin can then log in', async () => {
    const credDir = join(tmp, 'auth');
    mkdirSync(credDir, { recursive: true });
    const store = makeStore([
      makeUserEnv(LOCAL_ADMIN_USER_ID, 'local-admin', 'Local Admin'),
      makeUserEnv('USR-BRAD', 'brad', 'Brad'),
    ]);
    const creds = new CredentialStore(credDir);
    // Predicate wired, admin has NO credential => bootstrap window open,
    // the admin header resolves to admin (isSystem true).
    const identity = new LocalIdentityService(store, undefined, (userId) => creds.hasCredential(userId));
    const handlers = createAuthHandlers({ store, credentialStore: creds, sessionStore: new SessionStore(credDir), identityService: identity });

    const r = makeReply();
    r.setBody(await handlers.setPassword(makeRequest({ password: 'adminpass123' }, { 'x-user-id': LOCAL_ADMIN_USER_ID }), r.reply));
    expect(r.status).toBe(200);
    expect((r.body as { success: boolean; userId: string }).userId).toBe(LOCAL_ADMIN_USER_ID);

    // The admin is now reachable over HTTP through a real login.
    const loginR = makeReply();
    loginR.setBody(await handlers.login(makeRequest({ username: 'local-admin', password: 'adminpass123' }), loginR.reply));
    expect(loginR.status).toBe(200);
  });

  it('setPassword is 403 for the admin once the bootstrap window closes (admin already has a credential)', async () => {
    const credDir = join(tmp, 'auth');
    mkdirSync(credDir, { recursive: true });
    const store = makeStore([
      makeUserEnv(LOCAL_ADMIN_USER_ID, 'local-admin', 'Local Admin'),
      makeUserEnv('USR-BRAD', 'brad', 'Brad'),
    ]);
    const creds = new CredentialStore(credDir);
    await creds.setVerifier(LOCAL_ADMIN_USER_ID, hashPassword('existingpass1'));
    // Window closed => the admin header is dead; it falls back to USR-BRAD,
    // and USR-BRAD re-setting their own password via an admin header would
    // be wrong — the header now resolves to BRAD, so try the admin header:
    const identity = new LocalIdentityService(store, undefined, (userId) => creds.hasCredential(userId));
    const handlers = createAuthHandlers({ store, credentialStore: creds, sessionStore: new SessionStore(credDir), identityService: identity });

    const r = makeReply();
    r.setBody(await handlers.setPassword(makeRequest({ password: 'newadminpass1' }, { 'x-user-id': LOCAL_ADMIN_USER_ID }), r.reply));
    // Header fell back to USR-BRAD (not system) => sets BRAD's password, NOT admin's.
    expect(r.status).toBe(200);
    expect((r.body as { userId: string }).userId).toBe('USR-BRAD');
    expect(await creds.hasCredential(LOCAL_ADMIN_USER_ID)).toBe(true);
    // Admin verifier is untouched — the window cannot be reopened via HTTP.
    expect((await creds.getVerifier(LOCAL_ADMIN_USER_ID))).not.toBeNull();

    // A caller that somehow resolves as system (isSystem) with a credential
    // on record still gets 403: spoof by resolving admin through the fallback
    // with no other active user, so ensureLocalAdminUser yields admin (isSystem).
    const soloStore = makeStore([makeUserEnv(LOCAL_ADMIN_USER_ID, 'local-admin', 'Local Admin')]);
    const soloCreds = new CredentialStore(join(tmp, 'auth-solo'));
    await soloCreds.setVerifier(LOCAL_ADMIN_USER_ID, hashPassword('existingpass1'));
    const soloIdentity = new LocalIdentityService(soloStore, undefined, (userId) => soloCreds.hasCredential(userId));
    const soloHandlers = createAuthHandlers({ store: soloStore, credentialStore: soloCreds, sessionStore: new SessionStore(join(tmp, 'auth-solo')), identityService: soloIdentity });
    const soloR = makeReply();
    soloR.setBody(await soloHandlers.setPassword(makeRequest({ password: 'attempt12345' }, { 'x-user-id': LOCAL_ADMIN_USER_ID }), soloR.reply));
    expect(soloR.status).toBe(403);
    expect((soloR.body as { error: string }).error).toBe('NO_CURRENT_USER');
  });

  it('setPassword keeps rejecting the admin once it has a credential even when no hasCredential predicate is wired to the identity service (fail-closed posture)', async () => {
    const credDir = join(tmp, 'auth');
    mkdirSync(credDir, { recursive: true });
    const creds = new CredentialStore(credDir);
    await creds.setVerifier(LOCAL_ADMIN_USER_ID, hashPassword('existingpass1'));
    // Only the admin is active => the no-header fallback resolves to admin
    // (isSystem true). The handler's own credentialStore shows a credential,
    // so the bootstrap window is closed and the isSystem caller is rejected —
    // independent of whether the identity service has the predicate wired.
    const store = makeStore([
      makeUserEnv(LOCAL_ADMIN_USER_ID, 'local-admin', 'Local Admin'),
      makeUserEnv('USR-BRAD', 'brad', 'Brad', 'inactive'),
    ]);
    const identity = new LocalIdentityService(store);
    const handlers = createAuthHandlers({ store, credentialStore: creds, sessionStore: new SessionStore(credDir), identityService: identity });

    const r = makeReply();
    r.setBody(await handlers.setPassword(makeRequest({ password: 'adminpass123' }, { 'x-user-id': LOCAL_ADMIN_USER_ID }), r.reply));
    expect(r.status).toBe(403);
    expect((r.body as { error: string }).error).toBe('NO_CURRENT_USER');
  });

  // ---------------------------------------------------------------
  // §10 login audit hooks (login_success / login_failed)
  // ---------------------------------------------------------------

  function makeAuditStub() {
    const events: Array<{ actor: string; action: string; subjectType: string; subjectId: string; data?: Record<string, unknown> }> = [];
    const auditService = {
      append: async (input: { actor: string; action: string; subjectType: string; subjectId: string; data?: Record<string, unknown> }) => {
        events.push(input);
      },
    } as unknown as import('../../governance/AuditEventService.js').AuditEventService;
    return { auditService, events };
  }

  it('successful login appends a login_success audit event with the session user as actor', async () => {
    const credDir = join(tmp, 'auth');
    mkdirSync(credDir, { recursive: true });
    const creds = new CredentialStore(credDir);
    await creds.setVerifier('USR-BRAD', hashPassword('supersecret1'));
    const { auditService, events } = makeAuditStub();
    const handlers = createAuthHandlers({ store: makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]), credentialStore: creds, sessionStore: new SessionStore(credDir), auditService });

    const r = makeReply();
    r.setBody(await handlers.login(makeRequest({ username: 'brad', password: 'supersecret1' }), r.reply));
    expect(r.status).toBe(200);

    // append is fire-and-forget; let the microtask queue drain.
    await new Promise((res) => setImmediate(res));
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('login_success');
    expect(events[0].actor).toBe('USR-BRAD');
    expect(events[0].subjectType).toBe('session');
    expect(events[0].data?.username).toBe('brad');
  });

  it('failed login appends a login_failed audit event (bad password -> known user, unknown username -> unknown actor)', async () => {
    const credDir = join(tmp, 'auth');
    mkdirSync(credDir, { recursive: true });
    const creds = new CredentialStore(credDir);
    await creds.setVerifier('USR-BRAD', hashPassword('rightpass'));
    const { auditService, events } = makeAuditStub();
    const handlers = createAuthHandlers({ store: makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]), credentialStore: creds, sessionStore: new SessionStore(credDir), auditService });

    const badPw = makeReply();
    badPw.setBody(await handlers.login(makeRequest({ username: 'brad', password: 'wrongpass' }), badPw.reply));
    expect(badPw.status).toBe(401);

    const unknownUser = makeReply();
    unknownUser.setBody(await handlers.login(makeRequest({ username: 'nobody', password: 'whatever' }), unknownUser.reply));
    expect(unknownUser.status).toBe(401);

    await new Promise((res) => setImmediate(res));
    expect(events).toHaveLength(2);
    expect(events[0].action).toBe('login_failed');
    expect(events[0].actor).toBe('USR-BRAD');
    expect(events[0].data?.reason).toBe('bad_password');
    expect(events[1].action).toBe('login_failed');
    expect(events[1].actor).toBe('unknown');
    expect(events[1].data?.reason).toBe('unknown_user');
  });

  it('login still succeeds when the audit append itself throws (best-effort posture)', async () => {
    const credDir = join(tmp, 'auth');
    mkdirSync(credDir, { recursive: true });
    const creds = new CredentialStore(credDir);
    await creds.setVerifier('USR-BRAD', hashPassword('supersecret1'));
    const auditService = {
      append: async () => {
        throw new Error('audit store down');
      },
    } as unknown as import('../../governance/AuditEventService.js').AuditEventService;
    const handlers = createAuthHandlers({ store: makeStore([makeUserEnv('USR-BRAD', 'brad', 'Brad')]), credentialStore: creds, sessionStore: new SessionStore(credDir), auditService });

    const r = makeReply();
    r.setBody(await handlers.login(makeRequest({ username: 'brad', password: 'supersecret1' }), r.reply));
    await new Promise((res) => setImmediate(res));
    expect(r.status).toBe(200);
    expect((r.body as { success: boolean }).success).toBe(true);
  });
})