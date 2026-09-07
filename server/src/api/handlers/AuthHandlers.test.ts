import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { CredentialStore, hashPassword } from '../../security/CredentialStore.js';
import { SessionStore } from '../../security/SessionStore.js';
import { LocalIdentityService } from '../../security/LocalIdentityService.js';
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
})