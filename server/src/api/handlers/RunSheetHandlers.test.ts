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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { initializeApp } from '../../server.js';
import { setupTestWorkspace } from '../../test/setupApp.js';
import { createRunSheetHandlers } from './RunSheetHandlers.js';
import * as acquisitionPackageModule from '../../storage/acquisitionPackage.js';
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

function req(body: Record<string, unknown> | undefined, params: Record<string, string> = {}, headers: Record<string, string> = {}): FastifyRequest {
  return { body, params, headers } as unknown as FastifyRequest;
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
  /** The seeded ACTIVE test user — the identity fallback (resolveRequestUser
   *  with no headers) resolves headerless calls to the first active non-admin
   *  user, so this is the known authorized principal the happy-path tests run
   *  as. The 401/403 deny tests distinguish an authenticated-but-denied
   *  caller (x-user-id = a DIFFERENT active user) from an unauthenticated one. */
  testerUser: string;
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
  // Seed a valid ACTIVE user so the identity fallback (resolveRequestUser with
  // no headers — the way the existing happy-path tests call the handlers)
  // resolves to a KNOWN authorized principal instead of the admin bootstrap
  // (which is created without the schema-required `email` and is the wrong
  // principal to test authorization through). The gate is now exercised by
  // every register/analysis-inputs call, so the harness must carry a resolvable
  // user. A headerless call resolves to this first active non-admin user.
  const testerUser = 'USR-RSH-TESTER';
  {
    const u = await app.store.create({
      envelope: {
        recordId: testerUser,
        schemaId: 'https://computable-lab.com/schema/computable-lab/user.schema.yaml',
        payload: {
          kind: 'user',
          recordId: testerUser,
          username: 'rsh-tester',
          displayName: 'Run Sheet Tester',
          email: 'rsh-tester@example.com',
          status: 'active',
        },
      },
      message: `test user ${testerUser}`,
    });
    if (!u.success) throw new Error(`tester user create failed: ${u.error}`);
  }
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
  cached = { app, mountRoot: MOUNT, wsDir: WS, handlers, testerUser, makeEntry };
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

/**
 * GC-12 fix-cycle-1 (D1) — the AUTHORIZATION DENY PATHS. The register and
 * analysis-inputs routes are write/read channels on caller-supplied record
 * ids; the fix requires the SAME gate the RecordHandlers use (resolve the
 * request user + canAccess on the target) and 401/403 with the existing error
 * shape ({ error, message }, no code field). These pins prove the gate DENIES:
 *   register   → 403 (no write grant on the entry; no mint, no mutation) and
 *                401 (unknown/inactive x-user-id).
 *   analysis-in → 403 (no read grant on the package) and 401 (unknown/inactive).
 * A headerless request resolves (via the identity fallback) to the seeded
 * authorized tester, so the deny tests select a DIFFERENT principal with an
 * explicit x-user-id. Fixtures are created idempotently against the shared
 * cached ctx.
 */
const OTHER = 'USR-RSH-OTHER'; // an active user with NO grant on the deny fixtures
const UNKNOWN_USER = 'USR-DOES-NOT-EXIST-9'; // unresolved → 401

async function ensureActiveUser(recordId: string, username: string): Promise<void> {
  const c = await ctx();
  const existing = await c.app.store.get(recordId);
  if (existing) return;
  const res = await c.app.store.create({
    envelope: {
      recordId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/user.schema.yaml',
      payload: {
        kind: 'user',
        recordId,
        username,
        displayName: username,
        email: `${username}@example.com`,
        status: 'active',
      },
    },
    message: `test user ${recordId}`,
  });
  if (!res.success) throw new Error(`user create failed: ${res.error}`);
}

/** A private access-policy on `resourceId` owned by the tester with NO grants
 *  — every other user is denied read/write on that resource. The ACL recordId
 *  is derived from the (unique per test) resource id so fixtures never collide.
 *  `resourceKind` is the ref's `type` (required for record refs, ref.schema.yaml). */
async function createDenyAcl(resourceId: string, resourceKind: string): Promise<void> {
  const c = await ctx();
  const aclId = `ACL-DENY-${resourceId.toUpperCase().replace(/[^A-Z0-9]/g, '-')}`;
  if (await c.app.store.get(aclId)) return;
  const res = await c.app.store.create({
    envelope: {
      recordId: aclId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/access-policy.schema.yaml',
      payload: {
        kind: 'access-policy',
        recordId: aclId,
        resourceRef: { kind: 'record', id: resourceId, type: resourceKind },
        visibility: 'private',
        ownerUserId: 'USR-RSH-TESTER',
        grants: [],
      },
    },
    message: `deny acl ${aclId} for ${resourceId}`,
  });
  if (!res.success) throw new Error(`acl create failed: ${res.error}`);
}

describe('fix-cycle-1 D1: the register authorization deny paths', () => {
  it('403 FORBIDDEN: an authenticated user with no write grant on the entry cannot attach (no mint, no mutation)', async () => {
    const c = await ctx();
    await ensureActiveUser(OTHER, 'rsh-other');
    const entryId = await c.makeEntry();
    await createDenyAcl(entryId, 'instrument-sequence-entry');
    await writeFullDotD(c.mountRoot, 'DENY.D');

    const before = (await c.app.store.list({ kind: 'acquisition-package', limit: 100000 })).length;
    const r = mockReply();
    const body = await c.handlers.register(
      req({ deviceId: DEVICE_ID, directoryKey: 'DENY.D', entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' } }, {}, { 'x-user-id': OTHER }),
      r.reply,
    );
    expect(r.status()).toBe(403);
    expect(body).toMatchObject({ error: 'FORBIDDEN' });
    // The gate denied BEFORE the package was minted (zero new ACQP records)…
    const after = (await c.app.store.list({ kind: 'acquisition-package', limit: 100000 })).length;
    expect(after).toBe(before);
    // …and BEFORE the entry was mutated.
    const entry = await c.app.store.get(entryId);
    expect((entry?.payload as Record<string, unknown>).acquisitionPackageRef).toBeUndefined();
  });

  it('401 UNAUTHENTICATED: an unknown/inactive x-user-id cannot attach', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    const r = mockReply();
    const body = await c.handlers.register(
      req({ deviceId: DEVICE_ID, directoryKey: 'x.D', entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' } }, {}, { 'x-user-id': UNKNOWN_USER }),
      r.reply,
    );
    expect(r.status()).toBe(401);
    expect(body).toMatchObject({ error: 'UNAUTHENTICATED' });
  });
});

describe('fix-cycle-1 D1: the analysis-inputs authorization deny paths', () => {
  it('403 FORBIDDEN: an authenticated user with no read grant on the package cannot resolve its inputs', async () => {
    const c = await ctx();
    await ensureActiveUser(OTHER, 'rsh-other');
    const entryId = await c.makeEntry();
    // Register a package AS the authorized tester (headerless fallback) so a
    // real, resolvable ACQP id exists to deny reads on.
    const key = await writeFullDotD(c.mountRoot, 'INDENY.D');
    const rr = mockReply();
    const reg = await c.handlers.register(
      req({ deviceId: DEVICE_ID, directoryKey: key, entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' } }),
      rr.reply,
    );
    expect(rr.status()).toBe(200);
    const pkgId = (reg as { packageRecordId: string }).packageRecordId;
    await createDenyAcl(pkgId, 'acquisition-package');

    const r = mockReply();
    const body = await c.handlers.analysisInputs(req(undefined, { id: pkgId }, { 'x-user-id': OTHER }), r.reply);
    expect(r.status()).toBe(403);
    expect(body).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('401 UNAUTHENTICATED: an unknown/inactive x-user-id cannot resolve inputs', async () => {
    const c = await ctx();
    const r = mockReply();
    const body = await c.handlers.analysisInputs(req(undefined, { id: 'ACQP-401' }, { 'x-user-id': UNKNOWN_USER }), r.reply);
    expect(r.status()).toBe(401);
    expect(body).toMatchObject({ error: 'UNAUTHENTICATED' });
  });
});

/**
 * GC-12 fix-cycle-2 (D4, adv gate §4 DEFECT 1) — the register body is
 * `RegisterAcquisitionPackageInput` VERBATIM (spec D4, unsuperseded part):
 * the handler must ACCEPT and FORWARD `roles` (typed as the service's
 * PackageFileRole map) and `sourceRunRef`, not declare-and-drop them.
 * The pins inspect the service input via a module-namespace spy
 * (vi.spyOn on the acquisitionPackage namespace — the established house
 * pattern, cf. AgentOrchestrator.*.test.ts runChatbotCompile spies) so the
 * body contract and the service contract cannot drift apart again:
 *   - a register call carrying roles + sourceRunRef reaches
 *     registerAcquisitionPackage with both fields;
 *   - a call without them must NOT put the keys on the input object at all
 *     (conditional-spread omission, exactOptionalPropertyTypes-safe — never
 *     `{ roles: undefined }`).
 */
describe('fix-cycle-2 D4: the register body is RegisterAcquisitionPackageInput verbatim', () => {
  it('forwards roles and sourceRunRef to registerAcquisitionPackage (the body contract = the service contract)', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    const key = await writeFullDotD(c.mountRoot, 'VERBATIM.D');
    const roles = { 'FID1A.CH': 'signal_channel', 'RUN.LOG': 'method_asset' };
    const sourceRunRef = { kind: 'record' as const, id: 'RUN-RSH-TEST', type: 'run' as const };

    const spy = vi.spyOn(acquisitionPackageModule, 'registerAcquisitionPackage');
    try {
      const r = mockReply();
      const body = await c.handlers.register(
        req({
          deviceId: DEVICE_ID,
          directoryKey: key,
          entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' },
          roles,
          sourceRunRef,
        }),
        r.reply,
      );
      expect(r.status()).toBe(200);
      expect(body).toMatchObject({ entryRecordId: entryId });
      // The service saw the WHOLE documented input — roles and sourceRunRef
      // included, verbatim.
      expect(spy).toHaveBeenCalledTimes(1);
      const serviceInput = spy.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
      expect(serviceInput).toBeDefined();
      expect(serviceInput.roles).toEqual(roles);
      expect(serviceInput.sourceRunRef).toEqual(sourceRunRef);
    } finally {
      spy.mockRestore();
    }
  });

  it('omits roles/sourceRunRef from the service input when the body does not send them (the keys are ABSENT, not undefined)', async () => {
    const c = await ctx();
    const entryId = await c.makeEntry();
    const key = await writeFullDotD(c.mountRoot, 'VERBATIM-ABSENT.D');

    const spy = vi.spyOn(acquisitionPackageModule, 'registerAcquisitionPackage');
    try {
      const r = mockReply();
      const body = await c.handlers.register(
        req({
          deviceId: DEVICE_ID,
          directoryKey: key,
          entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' },
        }),
        r.reply,
      );
      expect(r.status()).toBe(200);
      expect(body).toMatchObject({ entryRecordId: entryId });
      expect(spy).toHaveBeenCalledTimes(1);
      const serviceInput = spy.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
      expect(serviceInput).toBeDefined();
      // Omitted, not undefined: the conditional-spread idiom means the keys
      // do not exist on the object at all (the exactOptionalPropertyTypes
      // contract — `{ roles: undefined }` would be a type error AND a
      // semantic change).
      expect('roles' in serviceInput).toBe(false);
      expect('sourceRunRef' in serviceInput).toBe(false);
      // The required fields still flow verbatim.
      expect(serviceInput.deviceId).toBe(DEVICE_ID);
      expect(serviceInput.directoryKey).toBe(key);
    } finally {
      spy.mockRestore();
    }
  });
});
