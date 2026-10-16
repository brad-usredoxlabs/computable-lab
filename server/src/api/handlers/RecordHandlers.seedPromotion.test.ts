/**
 * QMS7-2 — seed copy-on-write promotion at the handler level (RED-first).
 *
 * The live asymmetry: GET /api/records/<seed id> resolves the seed record,
 * PUT /api/records/<seed id> died with `Record not found: <id>` (HTTP 400 at
 * tip via the generic store-error mapping at RecordHandlers.ts — the handler's
 * own 404 never fires because store.get() sees the seed). After the fix, the
 * first authorized valid PUT promotes the seed content into the data dir.
 *
 * Unlike RecordHandlers.writeGates.test.ts (in-memory store), this harness
 * needs a REAL store (LocalRepoAdapter + tmpdir seedDir) because the assertion
 * is about the store's path resolution and the data-dir residue.
 *
 * OQ2 ruling: the promotion audit marker is appended handler-side on
 * result.promotion — action 'seed_record_promoted', real actor, best-effort,
 * AFTER durability (mirrors the lifecycle_transition pattern).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { createRecordStore, RecordStoreImpl } from '../../store/RecordStoreImpl.js';
import { createLocalRepoAdapter } from '../../repo/LocalRepoAdapter.js';
import { AjvValidator } from '../../validation/AjvValidator.js';
import { LintEngine } from '../../lint/LintEngine.js';
import { IndexManager } from '../../index/IndexManager.js';
import { createRecordHandlers } from './RecordHandlers.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const SEED_ID = 'lbw-cow-handler-96';
const SEED_TITLE = 'Seed Plate Handler 96';
const ACTOR = 'USR-COW-TESTER';

const testSchema = {
  $id: 'https://test.com/test.schema.yaml',
  type: 'object',
  properties: {
    recordId: { type: 'string' },
    $schema: { type: 'string' },
    kind: { type: 'string' },
    title: { type: 'string' },
  },
  required: ['recordId', '$schema', 'kind'],
};

const seedFileContent = `
recordId: ${SEED_ID}
$schema: https://test.com/test.schema.yaml
kind: labware
title: ${SEED_TITLE}
`;

const sha40 = (content: string): string =>
  createHash('sha256').update(content).digest('hex').slice(0, 40);

function makeReply() {
  let statusValue = 200;
  let responseBody: unknown = {};
  const reply: any = {
    status: (code: number) => { statusValue = code; return reply; },
    code: (code: number) => { statusValue = code; return reply; },
    send: (body: unknown) => { responseBody = body; return reply; },
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  Object.defineProperty(reply, 'responseBody', { get: () => responseBody });
  return reply;
}

function makeRequest(id: string, body: Record<string, unknown>) {
  return {
    params: { id },
    body,
    headers: { 'x-user-id': ACTOR },
  } as never;
}

async function makeWorld() {
  // Two separate roots: the DATA repo (LocalRepoAdapter basePath) and the
  // seed dir (code-repo stand-in). The seed dir must NOT live under the
  // data repo's base — the data-dir scan must see only working copies.
  const rootDir = join(tmpdir(), `seed-cow-handler-${randomUUID()}`);
  const repoDir = join(rootDir, 'lab');
  const testDir = join(rootDir, 'scratch');
  await mkdir(repoDir, { recursive: true });
  await mkdir(testDir, { recursive: true });

  const repo = createLocalRepoAdapter({ basePath: repoDir });
  const validator = new AjvValidator();
  validator.addSchema(testSchema);
  const lintEngine = new LintEngine();

  const seedDir = join(testDir, 'seed-records');
  await mkdir(join(seedDir, 'labware'), { recursive: true });
  const seedFilePath = join(seedDir, 'labware', 'lbw-cow-handler-96.yaml');
  await writeFile(seedFilePath, seedFileContent);

  const store: RecordStoreImpl = createRecordStore(repo, validator, lintEngine, { seedDir });
  const auditService = { append: vi.fn().mockResolvedValue(undefined) };
  const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
    identityService: {
      resolveRequestUser: async (request: FastifyRequest) => ({
        userId: (request.headers as Record<string, string>)['x-user-id'] ?? null,
        isSystem: false,
      }),
    } as never,
    auditService: auditService as never,
  });

  const put = async (id: string, payload: Record<string, unknown>) => {
    const reply = makeReply();
    const result = await handlers.updateRecord(makeRequest(id, { payload }), reply as unknown as FastifyReply);
    return { status: reply.statusValue, body: result as unknown as Record<string, unknown> };
  };

  const dataDirFiles = () => repo.listFiles({ directory: 'records', pattern: '*.yaml', recursive: true });

  return { testDir, repoDir, repo, store, seedDir, seedFilePath: seedFilePath, seedDirOverride: seedDir, handlers, put, auditService, dataDirFiles };
}

// ---------------------------------------------------------------------------
// R2 — the handler-level regression mirroring the live probe
// ---------------------------------------------------------------------------

describe('PUT /records/:id — seed copy-on-write promotion (QMS7-2)', () => {
  let world: Awaited<ReturnType<typeof makeWorld>>;

  beforeEach(async () => { world = await makeWorld(); });
  afterEach(async () => { await rm(join(world.testDir, '..'), { recursive: true, force: true }); });

  it('R2: authorized PUT on a seed-resolved record succeeds once and promotes the working copy', async () => {
    // Read path already resolves the seed (existing behavior, pinned).
    const seedRead = await world.store.get(SEED_ID);
    expect(seedRead).not.toBeNull();
    expect(seedRead?.meta?.commitSha).toBe('seed');

    const payload = { ...(seedRead!.payload as Record<string, unknown>), $schema: 'https://test.com/test.schema.yaml', title: `${SEED_TITLE} (edited)` };
    const { status, body } = await world.put(SEED_ID, payload);

    // At base this is 400 { success:false, error:'Record not found: <id>' }.
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    // The working copy exists in the data dir at the path convention.
    const files = await world.dataDirFiles();
    const promoted = files.filter((f) => f.includes(SEED_ID));
    expect(promoted.length).toBe(1);
    expect(promoted[0]!.startsWith('records/labware/')).toBe(true);
    expect(promoted[0]!.includes(`${SEED_ID}__`)).toBe(true);

    // Re-GET shows the edit and the working path (no 'seed' token).
    const after = await world.store.get(SEED_ID);
    expect((after?.payload as Record<string, unknown>).title).toBe(`${SEED_TITLE} (edited)`);
    expect(after?.meta?.path).toBe(promoted[0]);
    expect(after?.meta?.commitSha).not.toBe('seed');

    // Seed file untouched.
    expect(readFileSync(world.seedFilePath, 'utf-8')).toBe(seedFileContent);
  });

  // R6 (handler leg): a genuinely nonexistent id still 404s at the handler's
  // store.get() check before the store is ever consulted.
  it('R6: PUT for an id in neither dir still 404s at the handler', async () => {
    const before = await world.dataDirFiles();
    const { status, body } = await world.put('NOPE-COW-H-001', {
      recordId: 'NOPE-COW-H-001',
      $schema: 'https://test.com/test.schema.yaml',
      kind: 'labware',
    });
    expect(status).toBe(404);
    expect(body.error).toBe('NOT_FOUND');
    expect((body.message as string)).toContain('Record not found');
    expect(await world.dataDirFiles()).toEqual(before);
  });

  // R4 (handler leg): a refused promotion leaves zero residue.
  it('refused PUT (invalid payload) leaves zero data-dir residue', async () => {
    const before = await world.dataDirFiles();
    const { status, body } = await world.put(SEED_ID, {
      recordId: SEED_ID,
      $schema: 'https://test.com/test.schema.yaml',
      // Missing required 'kind' → Ajv validation failure.
    });
    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(await world.dataDirFiles()).toEqual(before);
    expect(readFileSync(world.seedFilePath, 'utf-8')).toBe(seedFileContent);
  });

  // ---------------------------------------------------------------------
  // R7 — OQ2 audit marker: promoted PUT appends 'seed_record_promoted'
  // with the seed path + fingerprint and the REAL acting user; a refused
  // PUT appends NOTHING.
  // ---------------------------------------------------------------------

  it('R7: promoted PUT appends a seed_record_promoted audit event with provenance and the real actor', async () => {
    const seedRead = await world.store.get(SEED_ID);
    const payload = { ...(seedRead!.payload as Record<string, unknown>), $schema: 'https://test.com/test.schema.yaml', title: `${SEED_TITLE} (audited)` };
    const { status } = await world.put(SEED_ID, payload);
    expect(status).toBe(200);

    expect(world.auditService.append).toHaveBeenCalledTimes(1);
    const event = world.auditService.append.mock.calls[0]![0] as {
      actor: string;
      action: string;
      subjectType: string;
      subjectId: string;
      data: Record<string, unknown>;
    };
    expect(event.actor).toBe(ACTOR);
    expect(event.action).toBe('seed_record_promoted');
    expect(event.subjectId).toBe(SEED_ID);
    expect(event.data.seed_path).toBe(world.seedFilePath);
    expect(event.data.seed_content_sha).toBe(sha40(seedFileContent));
    expect(typeof event.data.promoted_path).toBe('string');
    expect((event.data.promoted_path as string).includes(SEED_ID)).toBe(true);
  });

  it('R7: refused PUT appends NO audit event', async () => {
    const { status } = await world.put(SEED_ID, {
      recordId: SEED_ID,
      $schema: 'https://test.com/test.schema.yaml',
    });
    expect(status).toBe(422);
    expect(world.auditService.append).not.toHaveBeenCalled();
  });

  it('R3: after promotion, IndexManager.rebuild indexes the record exactly once (working copy wins)', async () => {
    const seedRead = await world.store.get(SEED_ID);
    const payload = { ...(seedRead!.payload as Record<string, unknown>), $schema: 'https://test.com/test.schema.yaml', title: `${SEED_TITLE} (indexed)` };
    const { status } = await world.put(SEED_ID, payload);
    expect(status).toBe(200);

    // IndexManager seed-merge suppression (IndexManager.ts:244-247): the
    // working copy is indexed and the seed copy is skipped by recordId.
    const manager = new IndexManager(world.repo as never, { baseDir: 'records' });
    const index = await manager.rebuild(world.seedDirOverride);
    const matches = index.entries.filter((e) => e.recordId === SEED_ID);
    expect(matches.length).toBe(1);
    expect(matches[0]!.path.startsWith('records/labware/')).toBe(true);
    expect(matches[0]!.title).toBe(`${SEED_TITLE} (indexed)`);
  });

  it('ordinary working-copy PUT after promotion appends NO promotion audit (marker is one-shot)', async () => {
    const seedRead = await world.store.get(SEED_ID);
    const first = await world.put(SEED_ID, { ...(seedRead!.payload as Record<string, unknown>), $schema: 'https://test.com/test.schema.yaml', title: `${SEED_TITLE} (first)` });
    expect(first.status).toBe(200);
    expect(world.auditService.append).toHaveBeenCalledTimes(1);

    const after = await world.store.get(SEED_ID);
    const second = await world.put(SEED_ID, { ...(after!.payload as Record<string, unknown>), $schema: 'https://test.com/test.schema.yaml', title: `${SEED_TITLE} (second)` });
    expect(second.status).toBe(200);
    // Still exactly one promotion event — the second edit is an ordinary update.
    expect(world.auditService.append).toHaveBeenCalledTimes(1);
  });
});
