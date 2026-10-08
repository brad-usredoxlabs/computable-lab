/**
 * Long-record-id routes.
 *
 * Root cause (2026-10-02): the DNeasy handbook section-split mints decision
 * trees whose recordId embeds `<pdf-slug>__<protocol-slug>` — 109+ chars.
 * find-my-way's DEFAULT maxParamLength is 100: a :param match longer than
 * that is treated as NO MATCH, so the request never reaches the handler and
 * Fastify answers with a router-level 404 `Route POST:/api/.../realize not
 * found`. The route exists; the router just refuses to look at long ids.
 *
 * These tests pin the fix: createServer sets an explicit maxParamLength so
 * long ids reach the handlers (handler-level errors, not router 404s).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, initializeApp } from '../../src/server.js';
import type { AppContext } from '../../src/server.js';
import { setupTestWorkspace } from '../../src/test/setupApp.js';

/** 109 chars — the exact shape of the failing DNeasy blood-96 tree id. */
const LONG_TREE_ID =
  'PDT-vendor-protocol-dneasy-blood-pdf__purification-of-total-dna-from-animal-blood-or-cells-dneasy-96-protocol';

describe('routes with long record ids (> find-my-way default 100)', () => {
  const testDir = resolve(process.cwd(), 'tmp/long-param-routes-test');
  let ctx: AppContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTestWorkspace(testDir);
    ctx = await initializeApp(testDir, { schemaDir: 'schema', recordsDir: 'records', logLevel: 'silent' });
    app = await createServer(ctx, { logLevel: 'silent' });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('POST intake realize with a 109-char treeId reaches the handler, not the router 404', async () => {
    expect(LONG_TREE_ID.length).toBeGreaterThan(100);
    const res = await app.inject({
      method: 'POST',
      url: `/api/protocol-ide/intake/trees/${LONG_TREE_ID}/realize`,
      payload: { choices: {} },
    });
    // The router's no-match envelope is `{ message: 'Route POST:... not
    // found', error: 'Not Found' }`. The handler answers first — an empty
    // choices map is its 400 BAD_REQUEST (a real tree in the store is
    // irrelevant to the routing assertion; assert the envelope, not the tree).
    const body = res.json() as { error?: string; message?: string };
    expect(body.message ?? '').not.toMatch(/^Route POST:/);
    expect(res.statusCode).toBe(400);
    expect(body.error).toBe('BAD_REQUEST');
  });

  it('GET intake tree with a 109-char treeId reaches the handler', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/protocol-ide/intake/trees/${LONG_TREE_ID}` });
    const body = res.json() as { message?: string; tree?: unknown };
    expect(body.message ?? '').not.toMatch(/^Route GET:/);
    // Handler reached: either its TREE_NOT_FOUND 404 or a real tree read.
    expect(res.statusCode === 404 || body.tree !== undefined).toBe(true);
  });

  it('GET a record by a 101-char id reaches the record handler', async () => {
    const longId = `EVG-${'x'.repeat(97)}`; // 101 chars
    expect(longId.length).toBe(101);
    const res = await app.inject({ method: 'GET', url: `/api/records/${longId}` });
    // Whatever the handler's exact 404 shape, it is NOT the router's
    // "Route GET:/api/records/... not found" envelope.
    const body = res.json() as { message?: string };
    expect(body.message ?? '').not.toMatch(/^Route GET:/);
  });
});
