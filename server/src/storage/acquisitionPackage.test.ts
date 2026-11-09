/**
 * GC-4: acquisition-package registration service — RED-first per the spec's
 * RED plan (fixtures = synthetic .D trees under os.tmpdir, NEVER the real NAS).
 *
 * Harness = acquisition.test.ts wire-up: test-written config.yaml declares a
 * device pointing at a tmpdir mount (the device id is test config DATA; the
 * mount path is the tmpdir — no real mount path appears anywhere in this repo).
 *
 * Hardcode boundary (reviewer bait #4): the real config device id belongs only
 * in the test-written config YAML string below; no real mount path ever
 * appears in code or tests.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
  readFile,
  readdir,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import {
  registerAcquisitionPackage,
  verifyAcquisitionPackage,
  packageAnalysisInputs,
  AcquisitionPackageError,
  DEFAULT_ROLE_MAP,
  ACQUIRING_MARKER,
} from './acquisitionPackage.js';
// D6: the read+classify entry point moved to the status module (this file
// keeps the classification call + payload stamp only).
import { classifyAcquisitionPackageStatus, loadLogPatterns } from './acquisitionPackageStatus.js';

const DEVICE_ID = 'nas0'; // test device id — config DATA, not a real config id

interface Ctx {
  app: Awaited<ReturnType<typeof initializeApp>>;
  mountRoot: string;
  wsDir: string;
  /** The marker string every fixture byte stream carries (no-bytes invariant). */
  marker: string;
}

async function makeCtx(tag: string): Promise<Ctx> {
  const mountRoot = await mkdtemp(join(tmpdir(), `cl-acqp-mount-${tag}-`));
  const wsDir = resolve(tmpdir(), `cl-acqp-ws-${tag}-${process.pid}`);
  await mkdir(wsDir, { recursive: true });
  await setupTestWorkspace(wsDir);
  await writeFile(
    join(wsDir, 'config.yaml'),
    [
      'server:',
      '  port: 3001',
      "  logLevel: 'info'",
      `  dataDir: '${join(wsDir, 'data')}'`,
      `  workspaceDir: '${join(wsDir, 'workspaces')}'`,
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
      `    mountPath: '${mountRoot}'`,
    ].join('\n'),
  );
  const app = await initializeApp(wsDir, {
    schemaDir: resolve(process.cwd(), '..', 'schema'),
    recordsDir: 'records',
    logLevel: 'silent',
  });
  return { app, mountRoot, wsDir, marker: `SYNTH-MARKER-${tag}` };
}

/** A canonical synthetic .D tree (GC-1 inventory names; dummy bytes). */
async function writeFullDotD(mountRoot: string, dirName: string, marker: string): Promise<string> {
  const dir = join(mountRoot, 'machine1', dirName);
  const files: Array<[string, string]> = [
    ['FID1A.CH', `${marker}\nsignal bytes for ${dirName}\n`],
    ['SAMPLE.XML', `${marker}\n<sample>synthetic</sample>\n`],
    ['RUN.LOG', `${marker}\nrun log line\n`],
    ['SAMPLE.MAC.bak', `${marker}\nmac backup\n`],
    ['ACQ.M/ACQ.TXT', `${marker}\nacq member\n`],
    ['ACQ.M/INFO.MTH', `${marker}\ninfo member\n`],
    ['DA.M/INFO.MTH', `${marker}\nda member\n`],
    ['ACQRES.REG', `${marker}\nregister file\n`],
    ['SINGLE.B', `${marker}\nsingle byte file\n`],
  ];
  for (const [rel, content] of files) {
    await mkdir(join(dir, rel, '..'), { recursive: true });
    await writeFile(join(dir, rel), content);
  }
  return dir;
}

function expectedHashOf(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Walk every file under a dir; return absolute paths. */
async function walkFiles(dir: string): Promise<string[]> {
  let out: string[] = [];
  try {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walkFiles(full)));
      else out.push(full);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return out;
}

/** Recompute the canonical manifest string per D5 from file DREF payloads. */
function manifestHashOf(fileDrefs: Array<{ relativePath: string; contentHash: string; sizeBytes: number }>): string {
  const sorted = [...fileDrefs].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const manifest = sorted
    .map((f) => `${f.relativePath}\n${f.contentHash}\n${f.sizeBytes}\n`)
    .join('');
  return expectedHashOf(manifest);
}

interface PayloadLike {
  kind: string;
  id: string;
  contentHash: string;
  sizeBytes: number;
  dataKind: string;
  path: string;
  storageDeviceId: string;
  title: string;
  files?: Array<{
    relativePath: string;
    dataReferenceRef: { kind: string; type: string; id: string };
    role: string;
  }>;
  directoryKey?: string;
  signalCollectionRef?: { kind: string; type: string; id: string };
  lifecycleId?: string;
  state?: string;
}

const SYNTH_DIR = 'machine1/SYNTH-001.D';

describe('registerAcquisitionPackage (synthetic .D trees, tmp mount)', () => {
  const ctx: Ctx = { app: null as never, mountRoot: '', wsDir: '', marker: '' };
  let packageRecordId: string;
  let fileDrefs: Array<{ relativePath: string; role: string; recordId: string }>;
  let manifestDrefId: string;

  beforeAll(async () => {
    const built = await makeCtx('main');
    ctx.app = built.app;
    ctx.mountRoot = built.mountRoot;
    ctx.wsDir = built.wsDir;
    ctx.marker = built.marker;
    await writeFullDotD(ctx.mountRoot, 'SYNTH-001.D', ctx.marker);
    // Control trees.
    await mkdir(join(ctx.mountRoot, 'machine1', 'SYNTH-BAD-ACQ.D'), { recursive: true });
    await writeFile(join(ctx.mountRoot, 'machine1', 'SYNTH-BAD-ACQ.D', 'ACQUIRING.TXT'), 'in progress');
    // Symlink fixture: FID1A.CH is a symlink pointing OUTSIDE the mount root.
    await mkdir(join(ctx.mountRoot, 'machine1', 'SYNTH-LINK.D'), { recursive: true });
    const outsideTarget = join(ctx.mountRoot, 'outside-target.CH');
    await writeFile(outsideTarget, `${ctx.marker}\nout of the mount\n`);
    await symlink(outsideTarget, join(ctx.mountRoot, 'machine1', 'SYNTH-LINK.D', 'FID1A.CH'));
    await writeFile(join(ctx.mountRoot, 'machine1', 'SYNTH-LINK.D', 'SAMPLE.XML'), `${ctx.marker}\nlink-case sample\n`);
  }, 30000);

  afterAll(async () => {
    for (const p of [ctx.mountRoot, ctx.wsDir]) {
      if (p) await rm(p, { recursive: true, force: true });
    }
  });

  it('registers SYNTH-001: per-file DREFs match independently computed sha256 + sizes', async () => {
    const res = await registerAcquisitionPackage(ctx.app, {
      deviceId: DEVICE_ID,
      directoryKey: SYNTH_DIR,
    });
    packageRecordId = res.packageRecordId;
    fileDrefs = res.fileDrefs;
    manifestDrefId = res.manifestDrefId;

    expect(res.packageRecordId).toMatch(/^ACQP-/);
    expect(res.fileDrefs.length).toBe(9); // every walked file pinned, nothing skipped
    expect(manifestDrefId).toMatch(/^DREF-/);

    // Each per-file DREF: independently computed hash + size (acceptance 1).
    const files = await walkFiles(join(ctx.mountRoot, SYNTH_DIR));
    expect(files.length).toBe(9);
    for (const abs of files) {
      const content = await readFile(abs, 'utf8');
      const rel = abs.slice(join(ctx.mountRoot, SYNTH_DIR).length + 1);
      const entry = fileDrefs.find((f) => f.relativePath === rel);
      expect(entry, `pinned entry for ${rel}`).toBeDefined();
      const env = await ctx.app.store.get(entry!.recordId);
      expect(env).not.toBeNull();
      const payload = env!.payload as PayloadLike;
      expect(payload.contentHash).toBe(expectedHashOf(content));
      expect(payload.sizeBytes).toBe(content.length);
      expect(payload.storageDeviceId).toBe(DEVICE_ID);
      expect(payload.path).toBe(`${SYNTH_DIR}/${rel}`);
    }

    // Roles per the default map (D10).
    const roleByPath = new Map(fileDrefs.map((f) => [f.relativePath, f.role]));
    expect(roleByPath.get('FID1A.CH')).toBe('signal_channel');
    expect(roleByPath.get('SAMPLE.XML')).toBe('sample_metadata');
    expect(roleByPath.get('SAMPLE.MAC.bak')).toBe('sample_metadata');
    expect(roleByPath.get('RUN.LOG')).toBe('run_log');
    expect(roleByPath.get('ACQ.M/ACQ.TXT')).toBe('method_asset');
    expect(roleByPath.get('ACQ.M/INFO.MTH')).toBe('method_asset');
    expect(roleByPath.get('DA.M/INFO.MTH')).toBe('method_asset');
    expect(roleByPath.get('ACQRES.REG')).toBe('uninterpreted');
    expect(roleByPath.get('SINGLE.B')).toBe('uninterpreted');

    // Package record shape + store validation through ctx's own validator.
    const env = await ctx.app.store.get(res.packageRecordId);
    expect(env).not.toBeNull();
    const payload = env!.payload as PayloadLike;
    expect(payload.kind).toBe('acquisition-package');
    expect(payload.id).toBe(res.packageRecordId);
    expect(payload.directoryKey).toBe(SYNTH_DIR);
    expect(payload.files).toHaveLength(9);
    expect(payload.signalCollectionRef?.id).toBe(manifestDrefId);
    expect(payload.signalCollectionRef?.type).toBe('data-reference');
    const ACQP_SCHEMA = 'https://computable-lab.com/schema/computable-lab/acquisition-package.schema.yaml';
    const ok = ctx.app.validator.validate(payload, ACQP_SCHEMA);
    expect(ok.valid).toBe(true);
    expect(ok.errors ?? []).toEqual([]);
  });

  it('the manifest DREF pins the whole .D: dataKind signal-collection, D5 canonical hash, sum size', async () => {
    const env = await ctx.app.store.get(manifestDrefId);
    expect(env).not.toBeNull();
    const payload = env!.payload as PayloadLike;
    expect(payload.dataKind).toBe('signal-collection');
    expect(payload.path).toBe(SYNTH_DIR);
    expect(payload.storageDeviceId).toBe(DEVICE_ID);
    expect(payload.format).toBe('agilent-chemstation-d');
    expect(payload.readerVersion).toBe('gc-4-registration/1');
    expect(payload.title).toBe('SYNTH-001.D acquisition package (signal collection)');

    const memberPayloads = await Promise.all(
      fileDrefs.map(async (f) => {
        const e = (await ctx.app.store.get(f.recordId))!.payload as PayloadLike;
        return { relativePath: f.relativePath, contentHash: e.contentHash, sizeBytes: e.sizeBytes };
      }),
    );
    expect(payload.contentHash).toBe(manifestHashOf(memberPayloads));
    expect(payload.sizeBytes).toBe(memberPayloads.reduce((sum, m) => sum + m.sizeBytes, 0));
  });

  it('refuses a tree carrying the ACQUIRING marker (PACKAGE_ACQUIRING, named cause)', async () => {
    await expect(
      registerAcquisitionPackage(ctx.app, {
        deviceId: DEVICE_ID,
        directoryKey: 'machine1/SYNTH-BAD-ACQ.D',
      }),
    ).rejects.toMatchObject({ code: 'PACKAGE_ACQUIRING' });
    await expect(
      registerAcquisitionPackage(ctx.app, {
        deviceId: DEVICE_ID,
        directoryKey: 'machine1/SYNTH-BAD-ACQ.D',
      }),
    ).rejects.toThrow(ACQUIRING_MARKER);
  });

  it('refuses a symlink escaping the mount root (PACKAGE_SYMLINK_ESCAPE, names the offender)', async () => {
    await expect(
      registerAcquisitionPackage(ctx.app, {
        deviceId: DEVICE_ID,
        directoryKey: 'machine1/SYNTH-LINK.D',
      }),
    ).rejects.toMatchObject({ code: 'PACKAGE_SYMLINK_ESCAPE' });
    await expect(
      registerAcquisitionPackage(ctx.app, {
        deviceId: DEVICE_ID,
        directoryKey: 'machine1/SYNTH-LINK.D',
      }),
    ).rejects.toThrow(/machine1\/SYNTH-LINK\.D\/FID1A\.CH/);
  });

  it('refuses an unsafe directoryKey (PACKAGE_PATH_ESCAPE or TRAVERSAL_BLOCKED)', async () => {
    await expect(
      registerAcquisitionPackage(ctx.app, {
        deviceId: DEVICE_ID,
        directoryKey: 'machine1/../machine1/SYNTH-001.D',
      }),
    ).rejects.toMatchObject({ code: 'PACKAGE_PATH_ESCAPE' });
    await expect(
      registerAcquisitionPackage(ctx.app, { deviceId: DEVICE_ID, directoryKey: '../../etc' }),
    ).rejects.toMatchObject({ code: expect.anything() });
    const err = await registerAcquisitionPackage(ctx.app, {
      deviceId: DEVICE_ID,
      directoryKey: '../../etc',
    }).catch((e) => e);
    const code = (err as { code?: string }).code;
    expect(['PACKAGE_PATH_ESCAPE', 'TRAVERSAL_BLOCKED']).toContain(code);
  });

  it('refuses an unconfigured device (StorageError NOT_FOUND propagates)', async () => {
    await expect(
      registerAcquisitionPackage(ctx.app, { deviceId: 'no-such-device', directoryKey: SYNTH_DIR }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('S8: a non-existent directoryKey is PACKAGE_DEVICE_MISSING (named cause)', async () => {
    // Package-level directory miss: the .D key does not exist on the device at
    // all. Spec S8: 'package-level directory miss = PACKAGE_DEVICE_MISSING' —
    // NOT the empty-directory token (that is the root-present-but-empty case).
    await expect(
      registerAcquisitionPackage(ctx.app, {
        deviceId: DEVICE_ID,
        directoryKey: 'machine1/NO-SUCH.D',
      }),
    ).rejects.toMatchObject({ code: 'PACKAGE_DEVICE_MISSING' });
    await expect(
      registerAcquisitionPackage(ctx.app, {
        deviceId: DEVICE_ID,
        directoryKey: 'machine1/NO-SUCH.D',
      }),
    ).rejects.toThrow(/machine1\/NO-SUCH\.D/);
  });

  it('S9: a directoryKey pointing at a regular file is PACKAGE_NOT_A_FILE (named cause)', async () => {
    // The vice-versa case (S9: 'entry is a directory where file expected / vice
    // versa'): the key resolves to an existing entry that is a regular FILE,
    // not a directory — a file path where a .D directory key is expected.
    await expect(
      registerAcquisitionPackage(ctx.app, {
        deviceId: DEVICE_ID,
        directoryKey: `${SYNTH_DIR}/FID1A.CH`,
      }),
    ).rejects.toMatchObject({ code: 'PACKAGE_NOT_A_FILE' });
    await expect(
      registerAcquisitionPackage(ctx.app, {
        deviceId: DEVICE_ID,
        directoryKey: `${SYNTH_DIR}/FID1A.CH`,
      }),
    ).rejects.toThrow(/FID1A\.CH/);
  });
});

describe('registerAcquisitionPackage (membership + partial tolerance)', () => {
  const ctx: Ctx = { app: null as never, mountRoot: '', wsDir: '', marker: '' };

  beforeAll(async () => {
    const built = await makeCtx('partial');
    ctx.app = built.app;
    ctx.mountRoot = built.mountRoot;
    ctx.wsDir = built.wsDir;
    ctx.marker = built.marker;
    // Missing-FID1A tree: everything except the .CH signal file.
    const noCh = join(ctx.mountRoot, 'machine1', 'SYNTH-NONE.D');
    await mkdir(noCh, { recursive: true });
    await writeFile(join(noCh, 'SAMPLE.XML'), `${ctx.marker}\nsample only\n`);
    await writeFile(join(noCh, 'RUN.LOG'), `${ctx.marker}\nlog only\n`);
  }, 30000);

  afterAll(async () => {
    for (const p of [ctx.mountRoot, ctx.wsDir]) {
      if (p) await rm(p, { recursive: true, force: true });
    }
  });

  it('PACKAGE_FILE_MISSING when the required .CH is absent; no package record is created', async () => {
    await expect(
      registerAcquisitionPackage(ctx.app, { deviceId: DEVICE_ID, directoryKey: 'machine1/SYNTH-NONE.D' }),
    ).rejects.toMatchObject({ code: 'PACKAGE_FILE_MISSING' });
    await expect(
      registerAcquisitionPackage(ctx.app, { deviceId: DEVICE_ID, directoryKey: 'machine1/SYNTH-NONE.D' }),
    ).rejects.toThrow(/FID1A\.CH/);
    // Orphaned DREFs are acceptable (append-only audit) but the package itself
    // must NOT exist on failure (spec D6 registration order).
    const envelopes = await ctx.app.store.list({ kind: 'acquisition-package', limit: 100 });
    expect(envelopes.filter((e) => e.recordId.startsWith('ACQP-')).length).toBe(0);
  });

  it('a partial .D (no method dirs) REGISTERS OK; method assets absent, no error', async () => {
    const dirName = 'SYNTH-PARTIAL.D';
    const dir = join(ctx.mountRoot, 'machine1', dirName);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'FID1A.CH'), `${ctx.marker}\npartial signal\n`);
    await writeFile(join(dir, 'SAMPLE.XML'), `${ctx.marker}\npartial sample\n`);
    const res = await registerAcquisitionPackage(ctx.app, {
      deviceId: DEVICE_ID,
      directoryKey: `machine1/${dirName}`,
    });
    expect(res.fileDrefs.map((f) => f.relativePath).sort()).toEqual(['FID1A.CH', 'SAMPLE.XML']);
    expect(res.fileDrefs.every((f) => f.role !== 'method_asset')).toBe(true);
    const env = await ctx.app.store.get(res.packageRecordId);
    expect(env).not.toBeNull();
  });
});

describe('verifyAcquisitionPackage + packageAnalysisInputs (D7 mutation window)', () => {
  const ctx: Ctx = { app: null as never, mountRoot: '', wsDir: '', marker: '' };
  let packageRecordId = '';

  beforeAll(async () => {
    const built = await makeCtx('mutate');
    ctx.app = built.app;
    ctx.mountRoot = built.mountRoot;
    ctx.wsDir = built.wsDir;
    ctx.marker = built.marker;
    await writeFullDotD(ctx.mountRoot, 'SYNTH-MUT.D', ctx.marker);
    const res = await registerAcquisitionPackage(ctx.app, {
      deviceId: DEVICE_ID,
      directoryKey: 'machine1/SYNTH-MUT.D',
    });
    packageRecordId = res.packageRecordId;
  }, 30000);

  afterAll(async () => {
    for (const p of [ctx.mountRoot, ctx.wsDir]) {
      if (p) await rm(p, { recursive: true, force: true });
    }
  });

  it('verify passes on the unmutated tree', async () => {
    await expect(verifyAcquisitionPackage(ctx.app, packageRecordId)).resolves.toBeUndefined();
  });

  it('mutation → PACKAGE_HASH_DRIFT at verify AND at inputs (acceptance 3 / D7)', async () => {
    await writeFile(join(ctx.mountRoot, 'machine1', 'SYNTH-MUT.D', 'FID1A.CH'), `${ctx.marker}\nTAMPERED signal\n`);
    await expect(verifyAcquisitionPackage(ctx.app, packageRecordId)).rejects.toMatchObject({
      code: 'PACKAGE_HASH_DRIFT',
    });
    await expect(verifyAcquisitionPackage(ctx.app, packageRecordId)).rejects.toThrow(/FID1A\.CH/);
    await expect(packageAnalysisInputs(ctx.app, packageRecordId)).rejects.toMatchObject({
      code: 'PACKAGE_HASH_DRIFT',
    });
  });

  it('frozen run inputs stay byte-stable across mutation (the D7 composition)', async () => {
    // The submit-side guarantee: inputs were resolved from the UNmutated
    // package and frozen into the run record; a later NAS mutation cannot
    // rewrite what the run already froze (runner-side execute-time re-hash is
    // GC-5's provisionInputs territory — not re-tested here). The FROZEN leg
    // uses the pre-mutation mapping captured BEFORE the tamper above.
    const ANALYSIS_RUN_SCHEMA = 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml';
    const preMutation = (await ctx.app.store.get(packageRecordId))!.payload as PayloadLike;
    const signalFileRef = preMutation.files!.find((f) => f.role === 'signal_channel')!;
    const runPayload = {
      kind: 'analysis-run',
      id: 'ANR-ACQP-FROZEN',
      title: 'Run with frozen package inputs',
      revisionRef: { kind: 'record', type: 'analysis-revision', id: 'ANR-REV-1' },
      status: 'queued',
      inputs: { signal: { ...signalFileRef.dataReferenceRef } },
    };
    const ok = ctx.app.validator.validate(runPayload, ANALYSIS_RUN_SCHEMA);
    expect(ok.valid).toBe(true);
    const created = await ctx.app.store.create({
      envelope: { recordId: 'ANR-ACQP-FROZEN', schemaId: ANALYSIS_RUN_SCHEMA, payload: runPayload },
      message: 'GC-4 frozen-inputs composition pin',
    });
    expect(created.success).toBe(true);
    // A second mutation: the frozen run payload is byte-stable (append-only).
    await writeFile(join(ctx.mountRoot, 'machine1', 'SYNTH-MUT.D', 'FID1A.CH'), `${ctx.marker}\nTAMPERED again\n`);
    const after = (await ctx.app.store.get('ANR-ACQP-FROZEN'))!;
    expect(after.payload).toEqual(runPayload);
  });
});

describe('FAME-1: registration stamps the acquisition status from the run_log member', () => {
  const ctx: Ctx = { app: null as never, mountRoot: '', wsDir: '', marker: '' };

  /** A strict-UTF-16LE + BOM byte stream (the utf16leBom test idiom). */
  const utf16leBom = (text: string): Buffer =>
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);

  const patterns = { id: '', version: '' as string | number };

  beforeAll(async () => {
    const built = await makeCtx('status');
    ctx.app = built.app;
    ctx.mountRoot = built.mountRoot;
    ctx.wsDir = built.wsDir;
    ctx.marker = built.marker;
    const p = await loadLogPatterns();
    patterns.id = p.id;
    patterns.version = p.version;
    // Tree 1: a real instrument-shape RUN.LOG (strict UTF-16LE + BOM) that
    // carries a method-completed line — the completed arm.
    const d1 = join(ctx.mountRoot, 'machine1', 'SYNTH-COMPLETE.D');
    await mkdir(d1, { recursive: true });
    await writeFile(join(d1, 'FID1A.CH'), `${ctx.marker}\nsignal\n`);
    await writeFile(join(d1, 'SAMPLE.XML'), `${ctx.marker}\n<sample/>\n`);
    await writeFile(
      join(d1, 'RUN.LOG'),
      utf16leBom(
        'Method       Method started                                 14:57:04 10/23/26\r\n' +
          'Method       Method completed                               15:24:43 10/23/26\r\n',
      ),
    );
    // Tree 2: the gate-fixture shape — a PLAIN ASCII RUN.LOG. The naive
    // utf-16 decode yields mojibake (never a crash); zero rule hits -> the
    // DECLARED floor (unknown), never completed.
    const d2 = join(ctx.mountRoot, 'machine1', 'SYNTH-ASCIILOG.D');
    await mkdir(d2, { recursive: true });
    await writeFile(join(d2, 'FID1A.CH'), `${ctx.marker}\nsignal\n`);
    await writeFile(join(d2, 'SAMPLE.XML'), `${ctx.marker}\n<sample/>\n`);
    await writeFile(join(d2, 'RUN.LOG'), 'L1-SIGNALDREF gate fixture\r\nsynthetic run log\r\n');
    // Tree 3: a .D with NO run_log member at all (RUN.LOG is not a
    // REQUIRED_MEMBERS member — registration MUST succeed, status = floor).
    const d3 = join(ctx.mountRoot, 'machine1', 'SYNTH-NORUNLOG.D');
    await mkdir(d3, { recursive: true });
    await writeFile(join(d3, 'FID1A.CH'), `${ctx.marker}\nsignal\n`);
    await writeFile(join(d3, 'SAMPLE.XML'), `${ctx.marker}\n<sample/>\n`);
  }, 30000);

  afterAll(async () => {
    for (const p of [ctx.mountRoot, ctx.wsDir]) {
      if (p) await rm(p, { recursive: true, force: true });
    }
  });

  it('a strict-UTF-16 RUN.LOG with a method-completed line -> completed + verbatim evidence', async () => {
    const res = await registerAcquisitionPackage(ctx.app, {
      deviceId: DEVICE_ID,
      directoryKey: 'machine1/SYNTH-COMPLETE.D',
    });
    const payload = res.packagePayload;
    expect(payload.acquisitionStatus).toBe('completed');
    const ev = payload.acquisitionStatusEvidence as Record<string, any>;
    expect(ev.ruleset).toEqual({
      id: patterns.id,
      version: patterns.version,
      sourceFile: 'config/gc-acquisition-status/log-patterns.yaml',
    });
    expect(ev.sourceMember).toEqual({ relativePath: 'RUN.LOG' });
    expect(ev.decode).toEqual({ encoding: 'utf-16le', bomPresent: true });
    expect(Array.isArray(ev.matched)).toBe(true);
    expect(ev.matched.length).toBeGreaterThanOrEqual(1);
    const hit = ev.matched.find((m: { ruleId: string }) => m.ruleId === 'completed-method-completed');
    expect(hit).toBeDefined();
    // VERBATIM: the exact decoded line, no trimming/rewriting (bait #7).
    expect(hit.line).toBe('Method       Method completed                               15:24:43 10/23/26');
    expect(typeof hit.lineIndex).toBe('number');
    expect(ev.noEvidenceReason).toBeUndefined();
    // The record in the store carries the same stamp (payload round-trips).
    const env = await ctx.app.store.get(res.packageRecordId);
    expect(env).not.toBeNull();
    expect((env!.payload as Record<string, unknown>).acquisitionStatus).toBe('completed');
  });

  it('a plain-ASCII RUN.LOG (gate-fixture shape) -> the DECLARED floor unknown, reason named', async () => {
    const res = await registerAcquisitionPackage(ctx.app, {
      deviceId: DEVICE_ID,
      directoryKey: 'machine1/SYNTH-ASCIILOG.D',
    });
    expect(res.packagePayload.acquisitionStatus).toBe('unknown'); // NEVER completed (bait #5)
    const ev = res.packagePayload.acquisitionStatusEvidence as Record<string, any>;
    expect(ev.sourceMember).toEqual({ relativePath: 'RUN.LOG' });
    // The ASCII log is even-length bytes: the strict decode SUCCEEDS into
    // mojibake (not a decode failure) and zero rules hit.
    expect(ev.decode.bomPresent).toBe(false);
    expect(ev.matched).toEqual([]);
    expect(ev.noEvidenceReason).toBeTruthy();
  });

  it('a .D with NO run_log member still REGISTERS (bait #5) -> unknown, reason run-log-member-absent', async () => {
    const res = await registerAcquisitionPackage(ctx.app, {
      deviceId: DEVICE_ID,
      directoryKey: 'machine1/SYNTH-NORUNLOG.D',
    });
    expect(res.packageRecordId).toMatch(/^ACQP-/); // registration succeeded
    expect(res.packagePayload.acquisitionStatus).toBe('unknown');
    const ev = res.packagePayload.acquisitionStatusEvidence as Record<string, any>;
    expect(ev.sourceMember).toEqual({ relativePath: '' });
    expect(ev.noEvidenceReason).toBe('run-log-member-absent');
    expect(ev.matched).toEqual([]);
  });

  it('the helper floors an unreadable member without throwing (floor-guaranteed)', async () => {
    const provider = {
      read: async (_path: string) => {
        throw new Error('ENOENT: synthetic unreadable member');
      },
    };
    const res = await classifyAcquisitionPackageStatus(provider, 'machine1/X.D', {
      relativePath: 'RUN.LOG',
    });
    expect(res.acquisitionStatus).toBe('unknown');
    expect(res.acquisitionStatusEvidence.noEvidenceReason).toMatch(/member-unreadable/);
    expect(res.acquisitionStatusEvidence.decode.encoding).toBe('unreadable');
  });
});

describe('packageAnalysisInputs (unmutated mapping, D5 input contract)', () => {
  const ctx: Ctx = { app: null as never, mountRoot: '', wsDir: '', marker: '' };

  beforeAll(async () => {
    const built = await makeCtx('inputs');
    ctx.app = built.app;
    ctx.mountRoot = built.mountRoot;
    ctx.wsDir = built.wsDir;
    ctx.marker = built.marker;
    await writeFullDotD(ctx.mountRoot, 'SYNTH-INPUT.D', ctx.marker);
  }, 30000);

  afterAll(async () => {
    for (const p of [ctx.mountRoot, ctx.wsDir]) {
      if (p) await rm(p, { recursive: true, force: true });
    }
  });

  it('maps signal → the .CH file DREF and package → the manifest DREF', async () => {
    const res = await registerAcquisitionPackage(ctx.app, {
      deviceId: DEVICE_ID,
      directoryKey: 'machine1/SYNTH-INPUT.D',
    });
    const inputs = await packageAnalysisInputs(ctx.app, res.packageRecordId);
    expect(Object.keys(inputs).sort()).toEqual(['package', 'signal']);
    expect(inputs.signal).toMatchObject({ kind: 'record', type: 'data-reference' });
    expect(inputs.package.id).toBe(res.manifestDrefId);
    // The signal input is the FID1A.CH FILE dref (the per-file path the runner
    // already provisions), not the manifest.
    const signalEnv = (await ctx.app.store.get(inputs.signal.id))!.payload as PayloadLike;
    expect(signalEnv.path).toBe('machine1/SYNTH-INPUT.D/FID1A.CH');
  });

  it('exposes the D10 default role map as data (exported const)', () => {
    expect(DEFAULT_ROLE_MAP['FID1A.CH']).toBe('signal_channel');
    expect(DEFAULT_ROLE_MAP['SAMPLE.XML']).toBe('sample_metadata');
    expect(DEFAULT_ROLE_MAP['SAMPLE.MAC.bak']).toBe('sample_metadata');
    expect(DEFAULT_ROLE_MAP['RUN.LOG']).toBe('run_log');
    expect(DEFAULT_ROLE_MAP['ACQRES.REG']).toBe('uninterpreted');
    expect(DEFAULT_ROLE_MAP['SINGLE.B']).toBe('uninterpreted');
    expect(ACQUIRING_MARKER).toBe('ACQUIRING.TXT');
  });
});

describe('no-bytes invariant: nothing under any tmp path persists fixture bytes', () => {
  const ctx: Ctx = { app: null as never, mountRoot: '', wsDir: '', marker: '' };

  beforeAll(async () => {
    const built = await makeCtx('nob');
    ctx.app = built.app;
    ctx.mountRoot = built.mountRoot;
    ctx.wsDir = built.wsDir;
    ctx.marker = built.marker;
    await writeFullDotD(ctx.mountRoot, 'SYNTH-NOB.D', ctx.marker);
    await registerAcquisitionPackage(ctx.app, {
      deviceId: DEVICE_ID,
      directoryKey: 'machine1/SYNTH-NOB.D',
    });
  }, 30000);

  afterAll(async () => {
    for (const p of [ctx.mountRoot, ctx.wsDir]) {
      if (p) await rm(p, { recursive: true, force: true });
    }
  });

  it('the records workspace contains no fixture byte and no file > 1KB', async () => {
    const { stat } = await import('node:fs/promises');
    const files = await walkFiles(join(ctx.wsDir, 'records'));
    for (const f of files) {
      const content = await readFile(f, 'utf8');
      expect(content.includes(ctx.marker), `fixture bytes leaked into ${f}`).toBe(false);
      const { size } = await stat(f);
      expect(size, `unexpected >1KB file in records: ${f}`).toBeLessThanOrEqual(1024);
    }
  });
});
