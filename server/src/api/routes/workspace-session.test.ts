/**
 * GET/PUT /api/session — the persistent, cross-device workspace session.
 *
 * The validator is built the same way server.ts builds it (all of schema/ added
 * by $id), so this test proves the shipped lab-session schema is what the route
 * enforces.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { AjvValidator } from '../../validation/AjvValidator.js';
import { registerWorkspaceSessionRoutes } from './workspace-session.js';
import type { AppContext } from '../../server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, '../../../../schema/workflow/lab-session.schema.yaml');

async function makeApp() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'session-api-'));
  const validator = new AjvValidator();
  validator.addSchema(parse(await readFile(SCHEMA_PATH, 'utf8')) as object);
  const app = Fastify();
  registerWorkspaceSessionRoutes(app, { workspaceRoot, validator } as unknown as AppContext);
  return app;
}

describe('GET/PUT /api/session', () => {
  it('is empty for a fresh user and round-trips a PUT', async () => {
    const app = await makeApp();
    const empty = await app.inject({ method: 'GET', url: '/session', headers: { 'x-user-id': 'USR-BRAD' } });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().session.tabs).toEqual([]);

    const put = await app.inject({
      method: 'PUT',
      url: '/session',
      headers: { 'x-user-id': 'USR-BRAD' },
      payload: { tabs: [{ kind: 'run', runId: 'RUN-1', title: 'T' }], activeTabId: 'run:RUN-1' },
    });
    expect(put.statusCode).toBe(200);

    const back = await app.inject({ method: 'GET', url: '/session', headers: { 'x-user-id': 'USR-BRAD' } });
    expect(back.json().session.activeTabId).toBe('run:RUN-1');
  });

  it('rejects a tab kind that is not in the schema enum', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/session',
      headers: { 'x-user-id': 'USR-BRAD' },
      payload: { tabs: [{ kind: 'not-a-kind' }], activeTabId: null },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('INVALID_SESSION');
  });

  it('rejects a body without a tabs array', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/session',
      headers: { 'x-user-id': 'USR-BRAD' },
      payload: { activeTabId: null },
    });
    expect(res.statusCode).toBe(400);
  });

  it('lets a second device read another user session read-only', async () => {
    const app = await makeApp();
    await app.inject({
      method: 'PUT',
      url: '/session',
      headers: { 'x-user-id': 'USR-BRAD' },
      payload: { tabs: [{ kind: 'claim', claimId: 'CLM-1', title: 'c' }], activeTabId: null },
    });
    const res = await app.inject({ method: 'GET', url: '/session/USR-BRAD' });
    expect(res.json().session.tabs).toHaveLength(1);
  });
});
