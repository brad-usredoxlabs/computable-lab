import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
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
    const { recordId: revId, payload: rev } = await service.createRevision({
      title: 'GC peak area',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      inputs: [{ name: 'trace', dataKind: 'signal', required: true }],
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
    const service = new AnalysisService(ctx);
    const { recordId } = await service.createRun({
      title: 'run 2',
      revisionRef: { kind: 'record', id: 'ANREV-000099', type: 'analysis-revision' },
      inputs: {},
    });
    await service.setRunStatus(recordId, 'failed');
    const env = await service.getRun(recordId);
    expect((env!.payload as { status: string }).status).toBe('failed');
  });

  it('rejects a run created against a missing revision only if it fails store create (ref not enforced here)', async () => {
    // The schema does not ref-check revisionRef existence; a run can be created
    // referencing any id as long as it's a well-formed ref. This is intentional
    // (lint rules may add refExists later) — just assert it creates.
    const service = new AnalysisService(ctx);
    const { recordId } = await service.createRun({
      title: 'run-loose',
      revisionRef: { kind: 'record', id: 'ANREV-999999', type: 'analysis-revision' },
      inputs: {},
    });
    expect(recordId).toMatch(/^ANR-/);
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
  });
});