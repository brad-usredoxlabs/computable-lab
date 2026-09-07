import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createIdentityHandlers } from './IdentityHandlers.js';
import { CredentialStore } from '../../security/CredentialStore.js';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';

const tmp = resolve(tmpdir(), 'cl-identity-handlers-test');

function makeStore(): { store: RecordStore; created: RecordEnvelope[]; exists: Set<string> } {
  const created: RecordEnvelope[] = [];
  const exists = new Set<string>();
  const store = {
    async list({ kind }: { kind?: string }) { return kind === 'user' ? created : []; },
    async get(id: string) { return created.find((u) => u.recordId === id) ?? null; },
    async exists(id: string) { return exists.has(id); },
    async create({ envelope }: { envelope: RecordEnvelope }) {
      created.push(envelope);
      exists.add(envelope.recordId);
      return { success: true, envelope };
    },
  } as unknown as RecordStore;
  return { store, created, exists };
}

function req(body: unknown): FastifyRequest<{ Body: Record<string, unknown> }> {
  return { body } as unknown as FastifyRequest<{ Body: Record<string, unknown> }>;
}

function makeReply() {
  let status = 200;
  const reply: FastifyReply = {
    status(code: number) { status = code; return reply; },
    send(payload: unknown) { body = payload; return reply; },
  } as unknown as FastifyReply;
  let body: unknown;
  return { reply, status() { return status; }, body() { return body; }, setBody(p: unknown) { body = p } };
}

function handlersFor(store: RecordStore, credDir: string) {
  return createIdentityHandlers({
    store,
    identityService: {} as never,
    authorizationService: {} as never,
    credentialStore: new CredentialStore(credDir),
  });
}

beforeEach(() => rmSync(tmp, { recursive: true, force: true }));
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('IdentityHandlers createUser', () => {
  it('requires an email (400 without one)', async () => {
    const { store } = makeStore();
    const h = handlersFor(store, tmp);
    const r = makeReply();
    r.setBody(await h.createUser(req({ displayName: 'April' }), r.reply));
    expect(r.status()).toBe(400);
  });

  it('requires a valid password of min 8 chars (400 otherwise)', async () => {
    const { store } = makeStore();
    const h = handlersFor(store, tmp);
    const r = makeReply();
    r.setBody(await h.createUser(req({ displayName: 'April', email: 'april@usrl.org', password: 'short' }), r.reply));
    expect(r.status()).toBe(400);
  });

  it('creates a user with email + writes a credential', async () => {
    const { store, created } = makeStore();
    const h = handlersFor(store, tmp);
    const r = makeReply();
    r.setBody(await h.createUser(req({ displayName: 'April', email: 'april@usrl.org', password: 'supersecret1' }), r.reply));
    expect(r.status()).toBe(200);
    expect(created).toHaveLength(1);
    const payload = created[0].payload as Record<string, unknown>;
    expect(payload.email).toBe('april@usrl.org');
    expect(payload.username).toBe('April'.toLowerCase());
    // Credential stored out-of-record.
    const creds = new CredentialStore(tmp);
    expect(await creds.hasCredential(created[0].recordId)).toBe(true);
    expect(created[0].payload as Record<string, unknown>).not.toHaveProperty('passwordHash');
  });
})