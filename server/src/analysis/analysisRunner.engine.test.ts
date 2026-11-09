/**
 * GC-5 — AnalysisRunner engine-gate contract tests (the spec's acceptance legs
 * i-iv + the §e failure matrix).
 *
 * These are RED-first (EDITOR-1 precedent): they assert the engine gate, the
 * registry-data-driven dispatch, the ACTUAL-version provenance write, and the
 * execute-time re-hash that analysisRunner.ts does not yet implement. The
 * interpreter + probes are REAL (the suite's injected /usr/bin/python3, which
 * is 3.14.7 with numpy/scipy ABSENT — the GC-1 F18 facts), so the provenance
 * assertions are against ACTUAL probed values, not literals.
 *
 * Acceptance legs:
 *  (i)  run with a pinned engine → engineProvenance carries ACTUAL
 *       interpreter/package versions from the probe (assert against the probe,
 *       not /usr/bin literals);
 *  (ii) unavailable / version-mismatch / unsupported-capability cases each
 *       fail with their EXACT token; the run record shows NO engineProvenance
 *       on the legacy path;
 *  (iii) engine switch = new revision: the old run's stored payload is
 *       byte-identical before/after the new revision's run;
 *  (iv) the stub-echo engine dispatches purely from registry data (zero TS
 *       change beyond the adapter-table entry) and its manifest carries the
 *       stub warning + the "STUB" fixture title.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import type { AppConfig } from '../config/types.js';
import { RecordRevisionService } from '../revisions/RecordRevisionService.js';
import { AnalysisService, AnalysisServiceError } from './analysisService.js';
import { AnalysisRunner } from './analysisRunner.js';
import { STUB_ECHO_LITERAL } from './engineAdapters.js';

const ENGINE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/analysis-engine.schema.yaml';

describe('AnalysisRunner engine gate (GC-5 integration)', () => {
  const mountDir = join(tmpdir(), 'cl-runner-eng-mount');
  const wsDir = resolve(tmpdir(), 'cl-runner-eng-ws');

  let ctx: Awaited<ReturnType<typeof initializeApp>>;
  let runner: AnalysisRunner;
  let service: AnalysisService;

  /** The ACTUAL interpreter the suite probes (real, not a literal assertion). */
  let actualPython: string;
  let actualPythonVersion: string;

  beforeAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
    await mkdir(mountDir, { recursive: true });
    await writeFile(join(mountDir, 'trace.csv'), 'time,intensity\n0.1,5\n0.3,5\n1.0,0\n');
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
        '  - id: usb0',
        "    label: 'USB'",
        "    kind: 'local-mount'",
        `    mountPath: '${mountDir}'`,
      ].join('\n'),
    );
    ctx = await initializeApp(wsDir, {
      schemaDir: resolve(process.cwd(), '..', 'schema'),
      recordsDir: 'records',
      logLevel: 'silent',
    });
    service = new AnalysisService(ctx);
    runner = new AnalysisRunner(ctx, '/usr/bin/python3', resolve(process.cwd(), 'python-executor-service', 'src'));

    // Probe the ACTUAL interpreter (not a literal): the provenance must carry
    // the probed version, so the test asserts against THIS probed value.
    actualPython = '/usr/bin/python3';
    const out = spawnSync(actualPython, ['-c', 'import platform; print(platform.python_version())'], { encoding: 'utf8' });
    actualPythonVersion = out.stdout.trim();
    expect(actualPythonVersion.length).toBeGreaterThan(0);
  }, 60000);

  afterAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
  });

  let seq = 0;
  /** Create a schema-valid analysis-engine record via the store (TEST data). */
  async function createEngine(over: Record<string, unknown> = {}): Promise<string> {
    seq += 1;
    const id = `ENG-GC5RUN${String(seq).padStart(3, '0')}`;
    const payload: Record<string, unknown> = {
      kind: 'analysis-engine',
      id,
      title: `gc5 run engine ${id}`,
      implementation: { adapter: 'python-entry-script', entry: 'run(ctx)', module: 'computable_lab_analysis' },
      version_constraints: { python: '>=3.13', packages: [] },
      capabilities: { declared: [{ capability: 'peak_detection', support: 'supported' }] },
      availability: { available: true },
      runtime_requirements: { interpreter: 'system' },
      ...over,
    };
    const result = await ctx.store.create({
      envelope: { recordId: id, schemaId: ENGINE_SCHEMA_ID, payload },
      message: `GC-5 test: create engine ${id}`,
    });
    if (!result.success) throw new Error(`engine create failed: ${result.error ?? 'unknown'}`);
    return id;
  }

  /** Create a stub-echo engine (the DECLARED pluggability probe, bait #8). */
  async function createStubEngine(): Promise<string> {
    return createEngine({
      title: 'STUB echo engine (pluggability probe — no science)',
      implementation: { adapter: 'stub-echo', entry: 'stub' },
      version_constraints: { python: '>=3.13', packages: [] },
      capabilities: { declared: [] },
    });
  }

  it('(i) a run with a pinned engine records ACTUAL engineProvenance (probed, not literals)', async () => {
    const engId = await createEngine(); // python >=3.13, no packages → the real 3.14.7 satisfies
    const { recordId: revId } = await service.createRevision({
      title: 'pinned engine (i)',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-i',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
    });
    const res = await runner.executeRun(runId);
    expect(res.status).toBe('succeeded');

    // The ACTUAL probed provenance is written into the run record.
    const runEnv = await service.getRun(runId);
    const prov = (runEnv!.payload as { engineProvenance?: Record<string, unknown> }).engineProvenance;
    expect(prov).toBeDefined();
    expect(prov!.engineRecordId).toBe(engId);
    expect(prov!.adapter).toBe('python-entry-script');
    // ACTUAL probed interpreter (assert against the probe, NOT /usr/bin literals):
    expect(prov!.interpreterVersion).toBe(actualPythonVersion);
    // The manifest echoes a compact provenance copy as `engine`.
    expect(res.manifest.engine).toBeDefined();
    expect((res.manifest.engine as { engineRecordId: string }).engineRecordId).toBe(engId);
  }, 60000);

  it('(ii-a) an unavailable engine (available:false) fails with ENGINE_UNAVAILABLE, no provenance', async () => {
    const engId = await createEngine({ availability: { available: false, note: 'offline' } });
    const { recordId: revId } = await service.createRevision({
      title: 'unavailable (ii-a)',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-ii-a',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
    });
    await expect(runner.executeRun(runId)).rejects.toMatchObject({ code: 'ENGINE_UNAVAILABLE', statusCode: 409 });
    const runEnv = await service.getRun(runId);
    const p = runEnv!.payload as { status: string; engineProvenance?: unknown };
    expect(p.status).toBe('failed');
    expect(p.engineProvenance).toBeUndefined();
  }, 60000);

  it('(ii-b) a version-mismatched engine (declared python the interpreter cannot satisfy) fails with ENGINE_VERSION_MISMATCH', async () => {
    const engId = await createEngine({ version_constraints: { python: '>=9.9', packages: [] } });
    const { recordId: revId } = await service.createRevision({
      title: 'mismatch (ii-b)',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-ii-b',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
    });
    await expect(runner.executeRun(runId)).rejects.toMatchObject({ code: 'ENGINE_VERSION_MISMATCH', statusCode: 409 });
    const runEnv = await service.getRun(runId);
    expect((runEnv!.payload as { engineProvenance?: unknown }).engineProvenance).toBeUndefined();
  }, 60000);

  it('(ii-c) an unsupported capability fails with ENGINE_CAPABILITY_UNSUPPORTED (naming the capability)', async () => {
    const engId = await createEngine({
      capabilities: { declared: [{ capability: 'deconvolution', support: 'unsupported' }] },
    });
    const { recordId: revId } = await service.createRevision({
      title: 'unsupported cap (ii-c)',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
      requiredCapabilities: ['deconvolution'],
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-ii-c',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
    });
    await expect(runner.executeRun(runId)).rejects.toMatchObject({ code: 'ENGINE_CAPABILITY_UNSUPPORTED', statusCode: 409 });
  }, 60000);

  it('(ii) the LEGACY path (no engineRef) writes NO engineProvenance (unchanged behavior)', async () => {
    const { recordId: revId } = await service.createRevision({
      title: 'legacy no engine (ii)',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-ii-legacy',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
    });
    const res = await runner.executeRun(runId);
    expect(res.status).toBe('succeeded');
    const runEnv = await service.getRun(runId);
    expect((runEnv!.payload as { engineProvenance?: unknown }).engineProvenance).toBeUndefined();
  }, 60000);

  it('(iii) switching engines = a NEW revision; the old run stays byte-identical (idempotent re-read)', async () => {
    const engA = await createEngine();
    const { recordId: revA } = await service.createRevision({
      title: 'engine A (iii)',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engA },
    });
    const { recordId: runA } = await service.createRun({
      title: 'run-A',
      revisionRef: { kind: 'record', id: revA, type: 'analysis-revision' },
      inputs: {},
    });
    await runner.executeRun(runA);
    const before = JSON.stringify((await service.getRun(runA))!.payload);

    // A NEW revision pins a DIFFERENT engine (the switch); the old run is untouched.
    const engB = await createEngine({ title: 'STUB other engine (iii)' });
    const { recordId: revB } = await service.createRevision({
      title: 'engine B (iii)',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engB },
    });
    const { recordId: runB } = await service.createRun({
      title: 'run-B',
      revisionRef: { kind: 'record', id: revB, type: 'analysis-revision' },
      inputs: {},
    });
    await runner.executeRun(runB);

    // The OLD run's stored payload is byte-identical after the new run (F6/F8).
    const after = JSON.stringify((await service.getRun(runA))!.payload);
    expect(after).toBe(before);
    // And the idempotent re-read of the old run returns the stored manifest, no re-probe.
    const reread = await runner.executeRun(runA);
    expect(JSON.stringify((await service.getRun(runA))!.payload)).toBe(after);
    expect(reread.status).toBe('succeeded');
  }, 90000);

  it('(iv) the stub-echo engine dispatches purely from registry data; the manifest carries the stub warning + STUB title', async () => {
    const engId = await createStubEngine();
    const { recordId: revId } = await service.createRevision({
      title: 'stub engine (iv)',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-iv',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
      parameters: { a: 1, b: 2 },
    });
    const res = await runner.executeRun(runId);
    expect(res.status).toBe('succeeded');
    // Exactly one metric artifact, the stub literal, a warning log — NO science.
    expect(res.manifest.artifacts.length).toBe(1);
    const art = res.manifest.artifacts[0];
    expect(art.name).toBe('stub_echo');
    expect(art.dataKind).toBe('metric');
    expect(JSON.stringify(art.value)).toContain(STUB_ECHO_LITERAL);
    expect(res.manifest.views.length).toBe(0);
    // The manifest identifies the stub (the STUB_ADAPTER warning log code is
    // the stub's identity in the manifest).
    expect(res.manifest.logs.some((l) => l.level === 'warning' && l.code === 'STUB_ADAPTER')).toBe(true);
    // The pinned ENGINE RECORD's title carries STUB (the schema data that keeps
    // no test or UI from mistaking the stub for science — asserted against the
    // actual record, not the test's own fixture literal).
    // HONEST BOUNDARY (recorded, not enforced): nothing in the schema or the
    // lint DSL enforces cross-field title-stubness for stub-echo engines (the
    // v1 shape-only DSL cannot express it) — this test asserts the FIXTURE
    // record, and the gap is recorded in analysis-engine.lint.yaml INTENT +
    // the schema title description. See DEFECT 4 of the l1t2245 adversarial
    // review.
    const engRecord = await ctx.store.get(engId);
    expect(String((engRecord?.payload as { title?: string }).title ?? '')).toContain('STUB');
    // The provenance records the stub adapter (dispatched off the record's data).
    const prov = (await service.getRun(runId))!.payload as { engineProvenance?: { adapter: string } };
    expect(prov.engineProvenance?.adapter).toBe('stub-echo');
  }, 60000);

  it('the venv-fallback trap: a provisioned-venv engine with declared packages on the last-resort interpreter → ENGINE_UNAVAILABLE (no silent /usr/bin run)', async () => {
    const engId = await createEngine({
      runtime_requirements: { interpreter: 'provisioned-venv' },
      version_constraints: { python: '>=3.13', packages: [{ name: 'numpy', constraint: '==2.5.4' }] },
    });
    const { recordId: revId } = await service.createRevision({
      title: 'venv trap',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-venv-trap',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
    });
    // The resolved interpreter is the last-resort (no config analysis.python in
    // this suite) and numpy is ABSENT there (GC-1 F18) → the provisioned-venv
    // trap fires BEFORE any probe: a NAMED declared failure, not a silent run.
    const err = await runner.executeRun(runId).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisServiceError);
    expect((err as AnalysisServiceError).code).toBe('ENGINE_UNAVAILABLE');
    expect(((await service.getRun(runId))!.payload as { status: string }).status).toBe('failed');
  }, 60000);

  it('an unresolvable adapter id (schema-refused, but if present) fails with ENGINE_ADAPTER_UNREGISTERED', async () => {
    // The schema's closed enum REFUSES this at create, so seed it via the store
    // with skipValidation to reach the dispatch table directly.
    const id = 'ENG-GC5BADADP01';
    const payload: Record<string, unknown> = {
      kind: 'analysis-engine',
      id,
      title: 'bad adapter',
      implementation: { adapter: 'not-shipped', entry: 'x' },
      version_constraints: { python: '>=3.13', packages: [] },
      capabilities: { declared: [] },
      availability: { available: true },
      runtime_requirements: { interpreter: 'system' },
    };
    await ctx.store.create({ envelope: { recordId: id, schemaId: ENGINE_SCHEMA_ID, payload }, message: 'GC-5 test', skipValidation: true, skipLint: true } as never);
    const { recordId: revId } = await service.createRevision({
      title: 'bad adapter revision',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id },
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-bad-adapter',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
    });
    await expect(runner.executeRun(runId)).rejects.toMatchObject({ code: 'ENGINE_ADAPTER_UNREGISTERED', statusCode: 409 });
  }, 60000);

  it('execute-time re-hash: input bytes that drifted after acquisition fail with DATA_HASH_MISMATCH (the GC-4 OQ1 fold, F3)', async () => {
    const { acquireDataReference } = await import('../storage/acquisition.js');
    // Acquire the trace (contentHash = sha256 of the CURRENT bytes).
    const dref = await acquireDataReference(ctx, {
      deviceId: 'usb0',
      path: 'trace.csv',
      dataKind: 'signal',
      format: 'csv',
    });
    const { recordId: revId } = await service.createRevision({
      title: 'drift input (hash)',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      inputs: [{ name: 'trace', dataKind: 'signal', required: true }],
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-drift',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: { trace: { kind: 'record', id: dref.recordId, type: 'data-reference' } },
    });
    // DRIFT the source bytes between submit and execute (the NAS window).
    await writeFile(join(mountDir, 'trace.csv'), 'time,intensity\n9.9,99\n');
    await expect(runner.executeRun(runId)).rejects.toMatchObject({ code: 'DATA_HASH_MISMATCH', statusCode: 409 });
    const runEnv = await service.getRun(runId);
    expect((runEnv!.payload as { status: string }).status).toBe('failed');
    expect((runEnv!.payload as { engineProvenance?: unknown }).engineProvenance).toBeUndefined();
  }, 60000);

  /**
   * l1t2245 adversarial-review defects (fix run). RED-first: each leg below
   * FAILED at 600bec4e (raw: /home/brad/.hermes/cl/lanes/1/gc5-fix1-RED-
   * l1t2245.txt) and passes after the fixes.
   */
  describe('l1t2245 review-defect contract legs', () => {
    async function pinEngineSnapshot(engineId: string): Promise<string> {
      const env = (await ctx.store.get(engineId))!;
      const rev = await new RecordRevisionService(ctx.store).capture(env, 'GC5FIX1-TEST', 'research-use');
      return rev.recordId;
    }

    it('DEFECT 1 (execute leg): a CROSS-ENGINE revisionRef (snapshot of another engine) is declared-dead at BOTH gate sites — no silent engine substitution', async () => {
      const engA = await createEngine();
      const engB = await createEngine();
      const snapOfB = await pinEngineSnapshot(engB);
      // The CREATE gate (shared resolver) rejects first: a revision pinning
      // ENG-A via a snapshot of ENG-B is not created.
      let createErr: unknown;
      try {
        await service.createRevision({
          title: 'cross-engine snapshot (create gate)',
          entryScript: 'def run(ctx):\n    return ctx',
          sdkVersion: '0.1.0',
          engineRef: { kind: 'record', type: 'analysis-engine', id: engA, revisionRef: { kind: 'record', type: 'record-revision', id: snapOfB } },
        });
      } catch (e) { createErr = e; }
      expect(createErr).toBeInstanceOf(AnalysisServiceError);
      expect((createErr as AnalysisServiceError).code).toBe('ENGINE_REF_UNRESOLVED');
      expect((createErr as AnalysisServiceError).statusCode).toBe(400);
      const created = await service.list('analysis-revision', 500);
      expect(created.some((r) => (r.payload as { engineRef?: { revisionRef?: { id?: string } } }).engineRef?.revisionRef?.id === snapOfB)).toBe(false);

      // The EXECUTE gate (shared resolver — one resolver, not two) rejects
      // identically for a revision that was written carrying the cross-engine
      // ref (the schema permits the shape; only the resolver's id validation
      // makes it declared-dead). No run may exist/succeed against it.
      const crossRevId = 'ANREV-GC5FIX1X';
      const crossRes = await ctx.store.create({
        envelope: {
          recordId: crossRevId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml',
          payload: {
            kind: 'analysis-revision',
            id: crossRevId,
            title: 'cross-engine snapshot (execute gate)',
            entryScript: 'def run(ctx):\n    return ctx',
            sdkVersion: '0.1.0',
            engineRef: { kind: 'record', type: 'analysis-engine', id: engA, revisionRef: { kind: 'record', type: 'record-revision', id: snapOfB } },
          },
        },
        message: 'GC-5 fix1: cross-engine combination revision',
      });
      if (!crossRes.success) throw new Error(`cross revision create failed: ${crossRes.error}`);
      const { recordId: runId } = await service.createRun({
        title: 'run-cross-engine',
        revisionRef: { kind: 'record', id: crossRevId, type: 'analysis-revision' },
        inputs: {},
      });
      // The execute-time gate resolves through the SAME shared resolver: the
      // snapshot's record id (ENG-B) must be validated against the pinned
      // engineRef.id (ENG-A) — mismatch is a NAMED declared failure, and the
      // run visibly fails with NO provenance for the engine that never ran.
      await expect(runner.executeRun(runId)).rejects.toMatchObject({ code: 'ENGINE_REF_UNRESOLVED', statusCode: 400 });
      const p = (await service.getRun(runId))!.payload as { status: string; engineProvenance?: unknown };
      expect(p.status).toBe('failed');
      expect(p.engineProvenance).toBeUndefined();
    }, 60000);

    it('DEFECT 1 (same-engine snapshot leg): a snapshot of the SAME engine resolves and runs with provenance pinned to the snapshot', async () => {
      const engId = await createEngine();
      const snap = await pinEngineSnapshot(engId);
      const { recordId: revId } = await service.createRevision({
        title: 'same-engine snapshot',
        entryScript: 'def run(ctx):\n    return ctx',
        sdkVersion: '0.1.0',
        engineRef: { kind: 'record', type: 'analysis-engine', id: engId, revisionRef: { kind: 'record', type: 'record-revision', id: snap } },
      });
      const { recordId: runId } = await service.createRun({
        title: 'run-same-snapshot',
        revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
        inputs: {},
      });
      const res = await runner.executeRun(runId);
      expect(res.status).toBe('succeeded');
      const prov = (await service.getRun(runId))!.payload as { engineProvenance?: { engineRecordId: string; engineRef: { id: string; revisionRef?: { id: string } } } };
      expect(prov.engineProvenance?.engineRecordId).toBe(engId);
      expect(prov.engineProvenance?.engineRef.id).toBe(engId);
      expect(prov.engineProvenance?.engineRef.revisionRef?.id).toBe(snap);
    }, 60000);

    it('DEFECT 2: a revision carrying BOTH sequenceMethod and engineRef runs the SEQUENCE path byte-identical — no engine gate, no probe, NO engineProvenance, no manifest engine echo', async () => {
      // Real sequence fixtures: a builtin virtual-pcr endpoint + DNA sequences
      // (schema-valid records via the store), so the sequence path is the ACTUAL
      // dispatch — not a stub.
      const endpointPayload: Record<string, unknown> = {
        kind: 'sequence-endpoint',
        id: 'SEQEP-GC5FIX1',
        label: 'GC-5 fix1 virtual PCR endpoint',
        engine: 'virtual-pcr',
        runtime: 'builtin',
        version: '1.0.0',
        threads: 1,
        timeoutSeconds: 60,
      };
      const epRes = await ctx.store.create({
        envelope: { recordId: endpointPayload.id as string, schemaId: 'https://computable-lab.com/schema/bio/sequence-endpoint.schema.yaml', payload: endpointPayload },
        message: 'GC-5 fix1: test endpoint',
        skipValidation: true,
        skipLint: true,
      } as never);
      if (!epRes.success) throw new Error(`endpoint create failed: ${epRes.error}`);
      const epRev = await new RecordRevisionService(ctx.store).capture((await ctx.store.get('SEQEP-GC5FIX1'))!, 'GC5FIX1-TEST', 'research-use');

      const sequences: Array<[string, string]> = [
        ['SEQG1', 'AACG' + 'T'.repeat(132) + 'TGCA'],
        ['SEQG2', 'AACG'],
        ['SEQG3', 'TGCA'],
        ['SEQG4', 'TTTTTT'],
      ];
      const seqRefs: Record<string, { id: string }> = {};
      for (const [id, residues] of sequences) {
        const seqPayload: Record<string, unknown> = {
          kind: 'sequence',
          id,
          label: id,
          alphabet: 'dna',
          residues,
          topology: 'linear',
        };
        const sRes = await ctx.store.create({
          envelope: { recordId: id, schemaId: 'https://computable-lab.com/schema/bio/sequence.schema.yaml', payload: seqPayload },
          message: `GC-5 fix1: test sequence ${id}`,
          skipValidation: true,
          skipLint: true,
        } as never);
        if (!sRes.success) throw new Error(`sequence create failed: ${sRes.error}`);
        const sRev = await new RecordRevisionService(ctx.store).capture((await ctx.store.get(id))!, 'GC5FIX1-TEST', 'research-use');
        seqRefs[id] = { id: sRev.recordId };
      }

      // The engine that MUST NOT run: provisioned-venv + a declared package →
      // if the engine gate were (incorrectly) executed for this revision, the
      // provisioned-venv last-resort trap would fail the run with
      // ENGINE_UNAVAILABLE. A succeeded run therefore proves the gate was
      // skipped (no resolve, no probe, no provenance).
      const engId = await createEngine({
        runtime_requirements: { interpreter: 'provisioned-venv' },
        version_constraints: { python: '>=3.13', packages: [{ name: 'numpy', constraint: '==2.5.4' }] },
      });

      // The combination revision is the defect's subject: the analysis-revision
      // schema permits BOTH optional fields (no mutual exclusion), and the DNA
      // lane writes such revisions through its own save path (SequenceService)
      // — AnalysisService.createRevision intentionally forwards only its own
      // fields. Write the record directly (real schema validation, no skip) so
      // the RUNNER sees the exact payload the defect describes.
      const revId = 'ANREV-GC5FIX1SEQ';
      const revPayload: Record<string, unknown> = {
        kind: 'analysis-revision',
        id: revId,
        title: 'sequence + engine combination',
        entryScript: '# Registered sequence adapter; no model-authored script.',
        sdkVersion: '0.1.0',
        sequenceMethod: { operation: 'virtual-pcr', endpointRevisionRef: { kind: 'record', type: 'record-revision', id: epRev.recordId } },
        engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
      };
      const revRes = await ctx.store.create({
        envelope: { recordId: revId, schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml', payload: revPayload },
        message: 'GC-5 fix1: combination revision (sequenceMethod + engineRef)',
      });
      if (!revRes.success) throw new Error(`combination revision create failed: ${revRes.error}`);
      const { recordId: runId } = await service.createRun({
        title: 'run-seq-engine',
        revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
        inputs: {
          references: { kind: 'record', id: seqRefs.SEQG1!.id, type: 'record-revision' },
          forward: { kind: 'record', id: seqRefs.SEQG2!.id, type: 'record-revision' },
          reverse: { kind: 'record', id: seqRefs.SEQG3!.id, type: 'record-revision' },
          probe: { kind: 'record', id: seqRefs.SEQG4!.id, type: 'record-revision' },
        },
        parameters: { minLength: 140, maxLength: 140, maxMismatches: 0, exactThreePrime: 3, maxProducts: 100 },
      });
      // The SEQUENCE path takes dispatch precedence and runs untouched (spec
      // §d); the pinned engine never executed → NO engineProvenance may be
      // written for it (false provenance is a knowledge-layer defect).
      const res = await runner.executeRun(runId);
      expect(res.status).toBe('succeeded');
      // The sequence path's own manifest (amplicons artifact) — and no engine
      // echo was merged into it.
      expect(res.manifest.artifacts.some((a) => a.name === 'amplicons')).toBe(true);
      expect((res.manifest as { engine?: unknown }).engine).toBeUndefined();
      const p = (await service.getRun(runId))!.payload as { status: string; engineProvenance?: unknown; outputManifest?: { engine?: unknown } };
      expect(p.status).toBe('succeeded');
      expect(p.engineProvenance).toBeUndefined();
      expect((p.outputManifest as { engine?: unknown } | undefined)?.engine).toBeUndefined();
    }, 90000);

    it('DEFECT 3: a WHITESPACE-ONLY analysis.python config value is treated as absent — the provisioned-venv last-resort trap still fires (ENGINE_UNAVAILABLE, not a silent last-resort run)', async () => {
      // The shared ctx appConfig is mutated for this leg only and restored
      // after: `analysis.python: '   '` (whitespace-only) is DECLARED (raw
      // truthiness) but ABSENT after the resolveInterpreter trim — so it must
      // count as NO declared interpreter. Pre-fix the trap's raw-truthiness
      // check saw the whitespace string as "declared", skipped the trap, and
      // the run fell through to the probe → ENGINE_VERSION_MISMATCH (numpy
      // absent on the last-resort interpreter) instead of ENGINE_UNAVAILABLE.
      const engId = await createEngine({
        runtime_requirements: { interpreter: 'provisioned-venv' },
        version_constraints: { python: '>=3.13', packages: [{ name: 'numpy', constraint: '==2.5.4' }] },
      });
      const { recordId: revId } = await service.createRevision({
        title: 'whitespace config venv trap',
        entryScript: 'def run(ctx):\n    return ctx',
        sdkVersion: '0.1.0',
        engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
      });
      const { recordId: runId } = await service.createRun({
        title: 'run-whitespace-venv',
        revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
        inputs: {},
      });
      const priorAppConfig = ctx.appConfig;
      try {
        ctx.appConfig = { ...(priorAppConfig ?? {}), analysis: { python: '   ' } } as AppConfig;
        const err = await runner.executeRun(runId).catch((e) => e);
        expect(err).toBeInstanceOf(AnalysisServiceError);
        expect((err as AnalysisServiceError).code).toBe('ENGINE_UNAVAILABLE');
      } finally {
        ctx.appConfig = priorAppConfig;
      }
      expect(((await service.getRun(runId))!.payload as { status: string }).status).toBe('failed');
    }, 60000);
  });
});
