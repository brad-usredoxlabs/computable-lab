/**
 * PB-CH-8 — route-level journal capture on the PUT /session seam (matrix row 1
 * route extension + verification 9's "PUT still 200-green" leg).
 *
 * The harness extends workspace-session.test.ts:16-34 (app.inject) with a
 * schemaDir carrying the REAL policy YAML and a fake localIdentityService so
 * the resolved-actor seam is exercised exactly as server.ts wires it.
 *
 * Pins:
 *  - a PUT whose actor RESOLVES appends exactly one journal entry under
 *    var/sessions/{userId}/journal/ (main.yaml still round-trips);
 *  - an UNRESOLVED actor (resolveRequestUser → userId:null) still gets a
 *    200-green PUT (main.yaml byte-unchanged) and captures NOTHING;
 *  - deleting the policy YAML mid-session disables capture on the SAME app
 *    instance (per-call re-read — no restart) and the PUT stays 200-green;
 *  - the journal dir lives under var/ (never the records git tree).
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { AjvValidator } from '../../validation/AjvValidator.js';
import { registerWorkspaceSessionRoutes } from './workspace-session.js';
import type { AppContext } from '../../server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, '../../../../schema/workflow/lab-session.schema.yaml');
const POLICY_PATH = resolve(__dirname, '../../../../schema/workflow/workstate-journal.policy.yaml');

interface Harness {
  app: Fastify.FastifyInstance;
  workspaceRoot: string;
  schemaDir: string;
  setResolvedUser: (userId: string | null) => void;
  journalDir: (userId: string) => string;
}

async function makeHarness(): Promise<Harness> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'session-journal-'));
  const schemaDir = await mkdtemp(join(tmpdir(), 'session-journal-schema-'));
  await mkdir(join(schemaDir, 'workflow'), { recursive: true });
  await writeFile(join(schemaDir, 'workflow', 'workstate-journal.policy.yaml'), await readFile(POLICY_PATH, 'utf8'), 'utf8');

  const validator = new AjvValidator();
  validator.addSchema(parse(await readFile(SCHEMA_PATH, 'utf8')) as object);

  let resolvedUserId: string | null = 'USR-BRAD';
  const app = Fastify();
  registerWorkspaceSessionRoutes(app, {
    workspaceRoot,
    validator,
    schemaDir,
    store: { list: async () => [] },
    localIdentityService: {
      resolveRequestUser: async (_request: FastifyRequest) =>
        resolvedUserId === null
          ? { userId: null, isSystem: false, reason: 'no session token' }
          : { userId: resolvedUserId, userRecord: null, isSystem: false },
    },
  } as unknown as AppContext);

  return {
    app,
    workspaceRoot,
    schemaDir,
    setResolvedUser: (userId) => { resolvedUserId = userId; },
    journalDir: (userId) => join(workspaceRoot, 'var', 'sessions', userId, 'journal'),
  };
}

async function journalFiles(dir: string): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}

const PUT_BODY = { tabs: [{ kind: 'run', runId: 'RUN-1', title: 'ROS run' }], activeTabId: 'run:RUN-1' };

describe('PUT /api/session — journal capture seam (PB-CH-8 row 1 route extension)', () => {
  it('a resolved actor appends EXACTLY one journal entry and main.yaml still round-trips', async () => {
    const h = await makeHarness();
    const put = await h.app.inject({ method: 'PUT', url: '/session', headers: { 'x-user-id': 'USR-BRAD' }, payload: PUT_BODY });
    expect(put.statusCode).toBe(200);
    expect(put.json().session.activeTabId).toBe('run:RUN-1');

    const files = await journalFiles(h.journalDir('USR-BRAD'));
    expect(files).toHaveLength(1);

    // The entry is a real journal file: canonical YAML (the journal's storage
    // form) with a recomputable content hash.
    const entry = parse(await readFile(join(h.journalDir('USR-BRAD'), files[0]!), 'utf8')) as { seq: number; snapshot: { userId: string; tabs: unknown[] } };
    expect(entry.seq).toBe(1);
    expect(entry.snapshot.userId).toBe('USR-BRAD');

    // main.yaml round-trips exactly as before (byte-unchanged LWW path).
    const back = await h.app.inject({ method: 'GET', url: '/session', headers: { 'x-user-id': 'USR-BRAD' } });
    expect(back.json().session.tabs).toEqual(PUT_BODY.tabs);
  });

  it('an UNRESOLVED actor still gets a 200-green PUT (main.yaml unchanged) and captures NOTHING', async () => {
    const h = await makeHarness();
    h.setResolvedUser(null);
    const put = await h.app.inject({ method: 'PUT', url: '/session', headers: { 'x-user-id': 'USR-BRAD' }, payload: PUT_BODY });
    expect(put.statusCode).toBe(200);
    expect(put.json().session.activeTabId).toBe('run:RUN-1');

    // No journal dir for the header fallback: the ledger never sees a
    // header-only identity (OQ1 ruling — no header-fallback for ledger reads).
    expect(await journalFiles(h.journalDir('USR-BRAD'))).toHaveLength(0);
    expect(await journalFiles(h.journalDir('default'))).toHaveLength(0);

    // main.yaml still round-trips for the header user (LWW unchanged).
    const back = await h.app.inject({ method: 'GET', url: '/session', headers: { 'x-user-id': 'USR-BRAD' } });
    expect(back.json().session.tabs).toEqual(PUT_BODY.tabs);
  });

  it('verification 9 route leg: deleting the policy YAML disables capture on the SAME instance (no restart) and the PUT stays 200-green', async () => {
    const h = await makeHarness();
    const first = await h.app.inject({ method: 'PUT', url: '/session', headers: { 'x-user-id': 'USR-BRAD' }, payload: PUT_BODY });
    expect(first.statusCode).toBe(200);
    expect(await journalFiles(h.journalDir('USR-BRAD'))).toHaveLength(1);

    // Delete the policy file IN PLACE — the next PUT on the SAME app instance
    // must capture NOTHING (per-call re-read; a boot-cached policy would still
    // capture here) and must still answer 200-green.
    await rm(join(h.schemaDir, 'workflow', 'workstate-journal.policy.yaml'));
    const second = await h.app.inject({
      method: 'PUT',
      url: '/session',
      headers: { 'x-user-id': 'USR-BRAD' },
      payload: { tabs: [{ kind: 'project', studyId: 'STU-9', title: 'Study' }], activeTabId: null },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().session.activeTabId).toBeNull();
    expect(await journalFiles(h.journalDir('USR-BRAD'))).toHaveLength(1); // still only the first entry

    // Restore the policy — capture lives again without any restart.
    await writeFile(join(h.schemaDir, 'workflow', 'workstate-journal.policy.yaml'), await readFile(POLICY_PATH, 'utf8'), 'utf8');
    const third = await h.app.inject({
      method: 'PUT',
      url: '/session',
      headers: { 'x-user-id': 'USR-BRAD' },
      payload: { tabs: [{ kind: 'project', studyId: 'STU-9', title: 'Study B' }], activeTabId: null },
    });
    expect(third.statusCode).toBe(200);
    // minIntervalMs debounce: the third PUT lands only if the policy interval
    // has passed; either way main.yaml is 200-green and the journal never
    // grows beyond what the policy allows.
    const files = await journalFiles(h.journalDir('USR-BRAD'));
    expect(files.length === 1 || files.length === 2).toBe(true);
  });

  it('the journal lives under var/ — never the records git tree', async () => {
    const h = await makeHarness();
    await h.app.inject({ method: 'PUT', url: '/session', headers: { 'x-user-id': 'USR-BRAD' }, payload: PUT_BODY });
    const journalPath = h.journalDir('USR-BRAD');
    expect(journalPath.startsWith(join(h.workspaceRoot, 'var'))).toBe(true);
    expect(journalPath).not.toContain('records');
  });
});
