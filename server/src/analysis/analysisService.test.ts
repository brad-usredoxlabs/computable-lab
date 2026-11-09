import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import { RecordRevisionService } from '../revisions/RecordRevisionService.js';
import { AnalysisService } from './analysisService.js';

describe('AnalysisService CRUD (integration)', () => {
  const wsDir = resolve(tmpdir(), 'cl-analysis-ws');

  let ctx: Awaited<ReturnType<typeof initializeApp>>;

  beforeAll(async () => {
    await rm(wsDir, { recursive: true, force: true });
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
      ].join('\n'),
    );
    ctx = await initializeApp(wsDir, {
      schemaDir: resolve(process.cwd(), '..', 'schema'),
      recordsDir: 'records',
      logLevel: 'silent',
    });
  }, 30000);

  afterAll(async () => {
    await rm(wsDir, { recursive: true, force: true });
  });

  it('creates a revision and a run referencing it', async () => {
    const service = new AnalysisService(ctx);
    // Pure CRUD round trip: the revision declares an OPTIONAL input so the
    // run-creatable body (inputs: {}) is valid. The declared-INPUT rejection
    // semantics (required-missing / undeclared / D8) are covered by the
    // dedicated FAME-7 block below — this test is about the revision→run
    // reference, not input validation.
    const { recordId: revId, payload: rev } = await service.createRevision({
      title: 'GC peak area',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      inputs: [{ name: 'trace', dataKind: 'signal' }],
    });
    expect(revId).toMatch(/^ANREV-/);
    expect(rev.kind).toBe('analysis-revision');

    const { recordId: runId, payload: run } = await service.createRun({
      title: 'run 1',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
      parameters: { window: [0.1, 0.5] },
    });
    expect(runId).toMatch(/^ANR-/);
    expect(run.status).toBe('queued');
    expect((run.revisionRef as { id: string }).id).toBe(revId);
  });

  it('lists revisions and runs', async () => {
    const service = new AnalysisService(ctx);
    const revs = await service.list('analysis-revision');
    const runs = await service.list('analysis-run');
    expect(revs.length).toBeGreaterThanOrEqual(1);
    expect(runs.length).toBeGreaterThanOrEqual(1);
  });

  it('transitions a run status', async () => {
    // D8: a revisionRef must RESOLVE (a missing id is a named rejection
    // before any mint) — so this status-transition test mints a real
    // no-inputs revision to bind (the pre-fix 'ANREV-000099' hand-made id
    // only "worked" because the missing-revision path silently skipped
    // validation and still minted the run).
    const statusRev = await ctx.store.create({
      envelope: {
        recordId: 'ANREV-F7-STATUS',
        schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml',
        payload: {
          kind: 'analysis-revision',
          id: 'ANREV-F7-STATUS',
          title: 'FAME-7 fix1: status-transition revision (no inputs)',
          sdkVersion: '0.1.0',
          entryScript: 'def run(ctx):\n    return ctx',
        },
      },
      message: 'FAME-7 fix1: status-transition revision',
    });
    if (!statusRev.success) throw new Error(`status revision create failed: ${statusRev.error}`);
    const service = new AnalysisService(ctx);
    const { recordId } = await service.createRun({
      title: 'run 2',
      revisionRef: { kind: 'record', id: 'ANREV-F7-STATUS', type: 'analysis-revision' },
      inputs: {},
    });
    await service.setRunStatus(recordId, 'failed');
    const env = await service.getRun(recordId);
    expect((env!.payload as { status: string }).status).toBe('failed');
  });

  it('D8: a run against a MISSING revision is a NAMED rejection before any mint (pre-fix this path silently skipped validation and still minted — the defect the test name admitted: "ref not enforced here")', async () => {
    const service = new AnalysisService(ctx);
    const runsBefore = (await service.list('analysis-run')).length;
    await expect(service.createRun({
      title: 'run-loose',
      revisionRef: { kind: 'record', id: 'ANREV-999999', type: 'analysis-revision' },
      inputs: {},
    })).rejects.toMatchObject({ code: 'REVISION_REF_UNRESOLVED', statusCode: 400 });
    expect((await service.list('analysis-run')).length).toBe(runsBefore);
  });

  describe('GC-5 engine gate at createRevision', () => {
  const ENGINE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/analysis-engine.schema.yaml';
  let seq = 0;

  async function createEngineRecord(over: Record<string, unknown> = {}): Promise<string> {
    seq += 1;
    const id = `ENG-GC5SVC${String(seq).padStart(3, '0')}`;
    const payload: Record<string, unknown> = {
      kind: 'analysis-engine',
      id,
      title: `gc5 svc engine ${id}`,
      implementation: { adapter: 'stub-echo', entry: 'stub' },
      version_constraints: { python: '>=3.14,<3.15', packages: [] },
      capabilities: { declared: [{ capability: 'peak_detection', support: 'supported' }] },
      availability: { available: true },
      runtime_requirements: { interpreter: 'system' },
      ...over,
    };
    const result = await ctx.store.create({
      envelope: { recordId: id, schemaId: ENGINE_SCHEMA_ID, payload },
      message: `GC-5 test: create engine ${id}`,
    });
    if (!result.success) throw new Error(`engine create failed: ${result.error}`);
    return id;
  }

  it('forwards engineRef + requiredCapabilities into the revision payload when the engine resolves', async () => {
    const service = new AnalysisService(ctx);
    const engId = await createEngineRecord();
    const { recordId, payload: rev } = await service.createRevision({
      title: 'pinned engine',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
      requiredCapabilities: ['peak_detection'],
    });
    expect(recordId).toMatch(/^ANREV-/);
    expect(rev.engineRef).toEqual({ kind: 'record', type: 'analysis-engine', id: engId });
    expect(rev.requiredCapabilities).toEqual(['peak_detection']);
  });

  it('declares ENGINE_REF_UNRESOLVED (400) when the engine id does not resolve — the revision is NOT created', async () => {
    const service = new AnalysisService(ctx);
    await expect(service.createRevision({
      title: 'missing engine',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: 'ENG-MISSING' },
    })).rejects.toMatchObject({ code: 'ENGINE_REF_UNRESOLVED', statusCode: 400 });
  });

  it('declares ENGINE_REF_UNRESOLVED (409, state leg) when the pinned engine record is archived', async () => {
    const service = new AnalysisService(ctx);
    const engId = await createEngineRecord({ state: 'archived' });
    await expect(service.createRevision({
      title: 'archived engine',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
    })).rejects.toMatchObject({ code: 'ENGINE_REF_UNRESOLVED', statusCode: 409 });
  });

  async function pinEngineSnapshot(engineId: string): Promise<string> {
    const env = (await ctx.store.get(engineId))!;
    const rev = await new RecordRevisionService(ctx.store).capture(env, 'GC5FIX1-TEST', 'research-use');
    return rev.recordId;
  }

  it('pins a snapshot of the SAME engine via revisionRef and creates the revision (snapshot path stays green)', async () => {
    const service = new AnalysisService(ctx);
    const engId = await createEngineRecord();
    const revId = await pinEngineSnapshot(engId);
    const { recordId, payload: rev } = await service.createRevision({
      title: 'pinned engine snapshot',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId, revisionRef: { kind: 'record', type: 'record-revision', id: revId } },
    });
    expect(recordId).toMatch(/^ANREV-/);
    expect(rev.engineRef).toMatchObject({ id: engId, revisionRef: { id: revId } });
  });

  it('declares ENGINE_REF_UNRESOLVED (400) for a CROSS-ENGINE revisionRef — a snapshot of another engine is NOT accepted as the pinned engine (the revision is NOT created)', async () => {
    const service = new AnalysisService(ctx);
    const engA = await createEngineRecord();
    const engB = await createEngineRecord();
    const snapOfB = await pinEngineSnapshot(engB);
    // The caller-supplied ref pins ENG-A but points at a snapshot of ENG-B
    // (the HTTP body passes straight through per F11). The snapshot's payload
    // is a live, non-archived analysis-engine — only the record-id mismatch
    // distinguishes it. The rejection is the behavior: no silent substitution.
    await expect(service.createRevision({
      title: 'cross-engine snapshot',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      engineRef: { kind: 'record', type: 'analysis-engine', id: engA, revisionRef: { kind: 'record', type: 'record-revision', id: snapOfB } },
    })).rejects.toMatchObject({ code: 'ENGINE_REF_UNRESOLVED', statusCode: 400 });
    // The rejection IS the behavior: no revision was created carrying the
    // cross-engine ref.
    const revs = await service.list('analysis-revision', 500);
    expect(revs.some((r) => (r.payload as { engineRef?: { revisionRef?: { id?: string } } }).engineRef?.revisionRef?.id === snapOfB)).toBe(false);
  });
  });

  describe('FAME-7 declared-input gate at createRun (W4)', () => {
    let declaringRevId: string;
    let undeclaredRevId: string;

    beforeAll(async () => {
      // A revision that DECLARES a contract (the new OQ-3 keys ride the
      // schema — the bundled schemaDir in this harness carries them).
      const svc = new AnalysisService(ctx);
      const created = await svc.createRevision({
        title: 'FAME-7 declared-input test method',
        entryScript: 'def run(ctx):\n    return ctx',
        sdkVersion: '0.4.0',
        inputs: [
          {
            name: 'left_table',
            dataKind: 'table',
            required: true,
            acceptsKinds: ['data-reference'],
            acceptedArtifactNames: ['right_summary'],
          },
        ],
      });
      declaringRevId = created.recordId;
      // A LEGACY revision with NO inputs declaration (the OQ-3 named skip).
      const legacy = await ctx.store.create({
        envelope: {
          recordId: 'ANREV-F7-LEGACY',
          schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml',
          payload: {
            kind: 'analysis-revision',
            id: 'ANREV-F7-LEGACY',
            title: 'FAME-7 legacy no-inputs revision',
            sdkVersion: '0.1.0',
            entryScript: 'def run(ctx):\n    return ctx',
          },
        },
        message: 'FAME-7 test: legacy revision (no inputs declaration)',
      });
      if (!legacy.success) throw new Error(`legacy revision create failed: ${legacy.error}`);
      undeclaredRevId = 'ANREV-F7-LEGACY';
    });

    it('the schema admits the ratified declaration keys on revision create (acceptsKinds + acceptedArtifactNames round-trip)', async () => {
      const env = await ctx.store.get(declaringRevId);
      const inputs = (env!.payload as { inputs: Array<Record<string, unknown>> }).inputs;
      expect(inputs[0]).toMatchObject({
        name: 'left_table',
        acceptsKinds: ['data-reference'],
        acceptedArtifactNames: ['right_summary'],
      });
    });

    it('declares INPUT_REQUIRED_MISSING (400) and mints NO run when the declared required slot is absent', async () => {
      const service = new AnalysisService(ctx);
      const runsBefore = (await service.list('analysis-run')).length;
      await expect(service.createRun({
        title: 'f7 missing-required',
        revisionRef: { kind: 'record', id: declaringRevId, type: 'analysis-revision' },
        inputs: {},
      })).rejects.toMatchObject({ code: 'INPUT_REQUIRED_MISSING', statusCode: 400 });
      expect((await service.list('analysis-run')).length).toBe(runsBefore);
    });

    it('declares INPUT_UNDECLARED (400) and mints NO run when the body names an undeclared input', async () => {
      const service = new AnalysisService(ctx);
      const runsBefore = (await service.list('analysis-run')).length;
      await expect(service.createRun({
        title: 'f7 undeclared',
        revisionRef: { kind: 'record', id: declaringRevId, type: 'analysis-revision' },
        inputs: { not_declared: { kind: 'record', id: 'DREF-F7-1', type: 'data-reference' } },
      })).rejects.toMatchObject({ code: 'INPUT_UNDECLARED', statusCode: 400 });
      expect((await service.list('analysis-run')).length).toBe(runsBefore);
    });

    it('keeps the legacy no-inputs flow byte-identical (the OQ-3 named skip — a run IS created with inputs: {})', async () => {
      const service = new AnalysisService(ctx);
      const { recordId, payload } = await service.createRun({
        title: 'f7 legacy skip',
        revisionRef: { kind: 'record', id: undeclaredRevId, type: 'analysis-revision' },
        inputs: {},
      });
      expect(recordId).toMatch(/^ANR-/);
      expect(payload.inputs).toEqual({});
    });

    it('D8: a revisionRef that does NOT resolve is a NAMED rejection (REVISION_REF_UNRESOLVED) BEFORE any mint — no run is created', async () => {
      const service = new AnalysisService(ctx);
      const runsBefore = (await service.list('analysis-run')).length;
      await expect(service.createRun({
        title: 'f8 bogus-revision',
        revisionRef: { kind: 'record', id: 'ANREV-F7-BOGUS', type: 'analysis-revision' },
        inputs: {},
      })).rejects.toMatchObject({ code: 'REVISION_REF_UNRESOLVED', statusCode: 400 });
      expect((await service.list('analysis-run')).length).toBe(runsBefore);
    });

    it('D4: a LEGACY revision with a NON-EMPTY inputs array (no FAME-7 keys) is validated FULLY at createRun — an undeclared body key is INPUT_UNDECLARED and mints NO run (the OQ-3 binding semantics: key presence, not new-key presence, is the contract marker)', async () => {
      const legacySlots = await ctx.store.create({
        envelope: {
          recordId: 'ANREV-F7-LEGACY-SLOTS',
          schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml',
          payload: {
            kind: 'analysis-revision',
            id: 'ANREV-F7-LEGACY-SLOTS',
            title: 'FAME-7 legacy slots revision (no FAME-7 keys)',
            sdkVersion: '0.1.0',
            entryScript: 'def run(ctx):\n    return ctx',
            inputs: [{ name: 'left_table', dataKind: 'table', required: true, description: 'legacy declared slot' }],
          },
        },
        message: 'FAME-7 fix1: legacy non-empty inputs revision',
      });
      if (!legacySlots.success) throw new Error(`legacy-slots revision create failed: ${legacySlots.error}`);
      const service = new AnalysisService(ctx);
      const runsBefore = (await service.list('analysis-run')).length;
      await expect(service.createRun({
        title: 'f4 legacy-undeclared',
        revisionRef: { kind: 'record', id: 'ANREV-F7-LEGACY-SLOTS', type: 'analysis-revision' },
        inputs: { not_declared: { kind: 'record', id: 'DREF-F7-1', type: 'data-reference' } },
      })).rejects.toMatchObject({ code: 'INPUT_UNDECLARED', statusCode: 400 });
      expect((await service.list('analysis-run')).length).toBe(runsBefore);
    });

    it('D14 (fix run 2): createRevision PRESERVES `inputs: []` — the OQ-3 absent-vs-empty-array distinction survives the create path (the pre-fix `length > 0` guard collapsed an empty array to ABSENT, making the validator\'s empty-array branch unreachable via createRevision)', async () => {
      const service = new AnalysisService(ctx);
      // (a) the SERVICE path writes `inputs: []` (the contract marker is the
      //     KEY, not the array\'s length) — the pre-fix code dropped the key.
      const created = await service.createRevision({
        title: 'f7 d14 empty-inputs method',
        entryScript: 'def run(ctx):\n    return ctx',
        sdkVersion: '0.4.0',
        inputs: [],
      });
      const env = await ctx.store.get(created.recordId);
      expect(env!.payload).toHaveProperty('inputs', []);
      // (b) the SERVICE path integration leg (R3: validator-direct tests do
      //     not count for this leg): a run body that names an input is
      //     INPUT_UNDECLARED against the preserved empty array — the contract
      //     IS "no inputs" — and the ABSENT-key revision still skips (the
      //     existing "keeps the legacy no-inputs flow" leg pins the skip side).
      const runsBefore = (await service.list('analysis-run')).length;
      await expect(service.createRun({
        title: 'f7 d14 empty-array undeclared',
        revisionRef: { kind: 'record', id: created.recordId, type: 'analysis-revision' },
        inputs: { anything: { kind: 'record', id: 'DREF-F7-1', type: 'data-reference' } },
      })).rejects.toMatchObject({ code: 'INPUT_UNDECLARED', statusCode: 400 });
      expect((await service.list('analysis-run')).length).toBe(runsBefore);
      // (c) the empty body PASSES against the empty array (the contract IS no
      //     inputs) — a run IS minted.
      const minted = await service.createRun({
        title: 'f7 d14 empty-array empty-body',
        revisionRef: { kind: 'record', id: created.recordId, type: 'analysis-revision' },
        inputs: {},
      });
      expect(minted.recordId).toMatch(/^ANR-/);
      expect((minted.payload as { inputs: unknown }).inputs).toEqual({});
      // (d) boundary: an ABSENT `inputs` (no key at all) is STILL absent in
      //     the payload — the legacy skip is unchanged by the D14 fix.
      const legacy = await service.createRevision({
        title: 'f7 d14 absent-inputs method',
        entryScript: 'def run(ctx):\n    return ctx',
        sdkVersion: '0.4.0',
      });
      const legacyEnv = await ctx.store.get(legacy.recordId);
      expect(legacyEnv!.payload).not.toHaveProperty('inputs');
    });
  });
});