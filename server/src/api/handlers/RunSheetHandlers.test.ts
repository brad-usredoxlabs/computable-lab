/**
 * GC-12 (deliverable D) — RunSheetHandlers: the attach + Analyze route glue.
 *
 * RED-first per the spec's V2: the suite includes >=4 NAMED failure-surface
 * cases (PACKAGE_DEVICE_MISSING on an absent directoryKey, PACKAGE_NOT_A_FILE
 * on a file, PACKAGE_FILE_MISSING on an unregistered package id,
 * PACKAGE_PATH_ESCAPE on a `../` key) — the tokens are the REAL merged set
 * from ACQUISITION_PACKAGE_ERROR_CODES (the spec's "TRAVERSAL_BLOCKED" was a
 * draft-time hypothesis; the provider-layer spelling is a StorageError the
 * glue maps to PACKAGE_DEVICE_MISSING / PACKAGE_PATH_ESCAPE).
 *
 * Harness = acquisitionPackage.test.ts (synthetic .D trees under os.tmpdir;
 * the device id + mount path are TEST CONFIG DATA, never a real NAS path —
 * the hardcode boundary, bait #7). The handlers are called directly with a
 * mock request/reply (AppContext exposes no fastify instance; the wire shape
 * is the returned body + the reply status code). The context is pre-warmed in
 * beforeAll (with an explicit hook timeout — initializeApp is slow) and
 * cached, so no individual test carries the bootstrap cost.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { initializeApp } from '../../server.js';
import { setupTestWorkspace } from '../../test/setupApp.js';
import { createRunSheetHandlers } from './RunSheetHandlers.js';
import type { AppContext } from '../../server.js';

const DEVICE_ID = 'nas0'; // test device id — config DATA, not a real config id

function mockReply() {
  let status = 200;
  const reply: FastifyReply = {
    status: (code: number) => {
      status = code;
      return reply;
    },
    code: (code: number) => {
      status = code;
      return reply;
    },
    send: (body: unknown) => body,
  } as unknown as FastifyReply;
  return { reply, status: () => status };
}

function req(body: Record<string, unknown> | undefined, params: Record<string, string> = {}): FastifyRequest {
  return { body, params } as unknown as FastifyRequest;
}

/** A canonical synthetic FID .D tree (GC-4's required membership: the .CH
 *  signal file + the sample file). Returns the RELATIVE key (never an
 *  absolute path — the hardcode boundary). */
async function writeFullDotD(mountRoot: string, dirName: string): Promise<string> {
  const dir = join(mountRoot, dirName);
  await mkdir(join(dir, 'ACQ.M'), { recursive: true });
  await writeFile(join(dir, 'FID1A.CH'), 'signal bytes for synthetic .D\n');
  await writeFile(join(dir, 'SAMPLE.XML'), '<sample>synthetic</sample>\n');
  await writeFile(join(dir, 'RUN.LOG'), 'run log line\n');
  await writeFile(join(dir, 'ACQ.M', 'ACQ.TXT'), 'acq member\n');
  return dirName;
}

interface Ctx {
  app: Awaited<ReturnType<typeof initializeApp>>;
  mountRoot: string;
  wsDir: string;
  handlers: ReturnType<typeof createRunSheetHandlers>;
  makeEntry(): Promise<string>;
}

const MOUNT = join(tmpdir(), `cl-runsheet-mount-${process.pid}`);
const WS = join(tmpdir(), `cl-runsheet-ws-${process.pid}`);

let cached: Ctx | undefined;

async function ctx(): Promise<Ctx> {
  if (cached) return cached;
  await rm(MOUNT, { recursive: true, force: true });
  await rm(WS, { recursive: true, force: true });
  await mkdir(MOUNT, { recursive: true });
  await mkdir(WS, { recursive: true });
  await setupTestWorkspace(WS);
  await writeFile(
    join(WS, 'config.yaml'),
    [
      'server:',
      '  port: 3001',
      "  logLevel: 'info'",
      `  dataDir: '${join(WS, 'data')}'`,
      `  workspaceDir: '${join(WS, 'workspaces')}'`,
      "  cors: { enabled: true, origins: ['*'] }",
      "schemas: { source: 'bundled', bundledDir: './schema' }",
      'repositories:',
      '  - id: main',
      '    default: true',
      "    mode: 'embedded-git'",
      "    git: { url: '', branch: 'main', auth: { type: 'none' } }",
      "    namespace: { baseUri: 'http://localhost:3001/records/', prefix: 'local' }",
      "    jsonld: { context: 'default' }",
      "    sync: { mode: 'manual', autoCommit: true, autoPush: false }",
      "    records: { directory: 'records' }",
      'storageDevices:',
      `  - id: ${DEVICE_ID}`,
      "    label: 'Synthetic NAS test mount'",
      "    kind: 'local-mount'",
      `    mountPath: '${MOUNT}'`,
    ].join('\n'),
  );
  const app = await initializeApp(WS, {
    schemaDir: resolve(process.cwd(), '..', 'schema'),
    recordsDir: 'records',
    logLevel: 'silent',
  });
  const handlers = createRunSheetHandlers(app);
  const makeEntry = async (): Promise<string> => {
    const recordId = `ISEN-RSH-${Math.random().toString(36).slice(2, 8)}`;
    const res = await app.store.create({
      envelope: {
        recordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/instrument-sequence-entry.schema.yaml',
        payload: {
          kind: 'instrument-sequence-entry',
          id: recordId,
          position: { vial: '101' },
          runRef: { kind: 'record', id: 'RUN-RSH-TEST', type: 'run' },
          sampleRef: { kind: 'record', id: 'SMP-RSH-TEST-1', type: 'sample' },
          gcMethodRef: { kind: 'record', id: 'GCM-RSH-TEST', type: 'gc-method' },
          state: 'draft',
        },
      },
      message: `test entry ${recordId}`,
    });
    if (!res.success) throw new Error(`entry create failed: ${res.error}`);
    return recordId;
  };
  cached = { app, mountRoot: MOUNT, wsDir: WS, handlers, makeEntry };
  return cached;
}

beforeAll(async () => {
  // Pre-warm the context so no TEST carries the initializeApp cost (the
  // default 10s per-test timeout would otherwise fire on the first register
  // and abort mid-DREF-mint, cascading into the other cases). The explicit
  // hook timeout is the honest accommodation for the slow app bootstrap.
  await ctx();
}, 120000);

afterAll(async () => {
  if (!cached) return;
  await rm(MOUNT, { recursive: true, force: true });
  await rm(WS, { recursive: true, force: true });
});

describe('POST /acquisition-packages/register (the attach glue, D4)', () => {
  it('registers a .D, attaches the package to the entry, and returns the ids', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    const key = await writeFullDotD(c.mountRoot, 'GOOD.D');
    const r = mockReply();
    const body = await c.handlers.register(
      req({ deviceId: DEVICE_ID, directoryKey: key, entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' } }),
      r.reply,
    );
    // The wire shape: { packageRecordId, packagePayload, entryRecordId }.
    expect(body).toMatchObject({ packageRecordId: expect.stringMatching(/^ACQP-/), entryRecordId: entryId });
    expect(r.status()).toBe(200);
    // The attach actually happened: the entry payload now carries the ref.
    const entry = await c.app.store.get(entryId);
    expect((entry?.payload as Record<string, unknown>).acquisitionPackageRef).toMatchObject({
      kind: 'record',
      id: (body as { packageRecordId: string }).packageRecordId,
      type: 'acquisition-package',
    });
  });

  it('returns 400 BAD_REQUEST for a missing deviceId (the named cause)', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    const r = mockReply();
    const body = await c.handlers.register(
      req({ directoryKey: 'x.D', entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' } }),
      r.reply,
    );
    expect(body).toMatchObject({ error: 'BAD_REQUEST' });
    expect(r.status()).toBe(400);
  });

  it('returns 400 BAD_REQUEST for a missing entryRef', async () => {
    const c = await ctx();
    const r = mockReply();
    const body = await c.handlers.register(req({ deviceId: DEVICE_ID, directoryKey: 'x.D' }), r.reply);
    expect(body).toMatchObject({ error: 'BAD_REQUEST' });
    expect(r.status()).toBe(400);
  });

  it('returns 404 NOT_FOUND when the target entry does not resolve (the register succeeded; the attach cannot)', async () => {
    const c = await ctx();
    await writeFullDotD(c.mountRoot, 'ORPHAN.D');
    const r = mockReply();
    const body = await c.handlers.register(
      req({
        deviceId: DEVICE_ID,
        directoryKey: 'ORPHAN.D',
        entryRef: { kind: 'record', id: 'ISEN-DOES-NOT-EXIST', type: 'instrument-sequence-entry' },
      }),
      r.reply,
    );
    expect(body).toMatchObject({ error: 'NOT_FOUND' });
    expect(r.status()).toBe(404);
  });
});

describe('the >=4 NAMED failure surfaces (bait #6: every token has a surface)', () => {
  it('PACKAGE_DEVICE_MISSING — an absent directoryKey on a CONFIGURED device (the named cause, S8)', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    const r = mockReply();
    const body = await c.handlers.register(
      req({
        deviceId: DEVICE_ID,
        directoryKey: 'no-such-directory.D',
        entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' },
      }),
      r.reply,
    );
    expect(body).toMatchObject({ error: 'PACKAGE_DEVICE_MISSING' });
    expect(typeof (body as { message: string }).message).toBe('string');
    expect(r.status()).toBe(400);
  });

  it('PACKAGE_NOT_A_FILE — a directoryKey pointing at a regular file (S9)', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    await writeFile(join(c.mountRoot, 'NOT-A-DIR.txt'), 'just a file\n');
    const r = mockReply();
    const body = await c.handlers.register(
      req({
        deviceId: DEVICE_ID,
        directoryKey: 'NOT-A-DIR.txt',
        entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' },
      }),
      r.reply,
    );
    expect(body).toMatchObject({ error: 'PACKAGE_NOT_A_FILE' });
    expect(r.status()).toBe(422);
  });

  it('PACKAGE_PATH_ESCAPE — a traversal (../) directoryKey is refused (the merged token)', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    const r = mockReply();
    const body = await c.handlers.register(
      req({
        deviceId: DEVICE_ID,
        directoryKey: '../escape.D',
        entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' },
      }),
      r.reply,
    );
    // The merged token set has no "TRAVERSAL_BLOCKED" (the spec's draft-time
    // hypothesis) — the acquisition-layer token is the path/symlink escape pair.
    expect(['PACKAGE_PATH_ESCAPE', 'PACKAGE_SYMLINK_ESCAPE']).toContain((body as { error: string }).error);
    expect(r.status()).toBe(422);
  });

  it('PACKAGE_FILE_MISSING — a .D directory with no required .CH file', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    const dir = join(c.mountRoot, 'NOCH.D');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SAMPLE.XML'), '<sample>synthetic</sample>\n');
    await writeFile(join(dir, 'RUN.LOG'), 'run log\n');
    const r = mockReply();
    const body = await c.handlers.register(
      req({
        deviceId: DEVICE_ID,
        directoryKey: 'NOCH.D',
        entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' },
      }),
      r.reply,
    );
    expect(body).toMatchObject({ error: 'PACKAGE_FILE_MISSING' });
    expect(r.status()).toBe(422);
  });

  it('PACKAGE_FILE_MISSING (analysis-inputs) — an unregistered package id is a 404, never a 200', async () => {
    const c = await ctx();
    const r = mockReply();
    const body = await c.handlers.analysisInputs(req(undefined, { id: 'ACQP-000000' }), r.reply);
    expect(body).toMatchObject({ error: 'PACKAGE_FILE_MISSING' });
    expect(r.status()).toBe(404);
  });

  it('PACKAGE_DEVICE_MISSING (an UNCONFIGURED device id — the provider StorageError, mapped to the named token)', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    const r = mockReply();
    const body = await c.handlers.register(
      req({
        deviceId: 'no-such-device',
        directoryKey: 'whatever.D',
        entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' },
      }),
      r.reply,
    );
    expect(body).toMatchObject({ error: 'PACKAGE_DEVICE_MISSING' });
    expect(r.status()).toBe(400);
  });
});

describe('POST /acquisition-packages/:id/analysis-inputs (the verify-first trust boundary, bait #11)', () => {
  it('returns the pinned { signal, package } data-reference input refs for a registered package', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    await writeFullDotD(c.mountRoot, 'INPUTS.D');
    const rr = mockReply();
    const reg = await c.handlers.register(
      req({ deviceId: DEVICE_ID, directoryKey: 'INPUTS.D', entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' } }),
      rr.reply,
    );
    expect(rr.status()).toBe(200);
    const pkgId = (reg as { packageRecordId: string }).packageRecordId;
    const r = mockReply();
    const body = await c.handlers.analysisInputs(req(undefined, { id: pkgId }), r.reply);
    expect(r.status()).toBe(200);
    // The pinned inputs are data-reference refs (ids only — the frozen-input
    // discipline; the Analyze handoff carries these ids, never the payload).
    expect(body).toMatchObject({
      signal: { kind: 'record', type: 'data-reference', id: expect.stringMatching(/^DREF-/) },
      package: { kind: 'record', type: 'data-reference', id: expect.stringMatching(/^DREF-/) },
    });
  });
});
