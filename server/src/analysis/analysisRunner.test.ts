import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import { AnalysisService } from './analysisService.js';
import { AnalysisRunner } from './analysisRunner.js';
import { acquireDataReference } from '../storage/acquisition.js';

describe('AnalysisRunner (integration)', () => {
  const mountDir = join(tmpdir(), 'cl-runner-mount');
  const wsDir = resolve(tmpdir(), 'cl-runner-ws');

  let ctx: Awaited<ReturnType<typeof initializeApp>>;
  let runner: AnalysisRunner;
  let service: AnalysisService;

  beforeAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
    await mkdir(join(mountDir), { recursive: true });
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
  }, 30000);

  afterAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
  });

  it('runs a GC-like script end-to-end and commits a manifest + artifact records', async () => {
    // Acquire the input trace as a data-reference on the storage device
    const dref = await acquireDataReference(ctx, {
      deviceId: 'usb0',
      path: 'trace.csv',
      dataKind: 'signal',
      format: 'csv',
    });

    // Create a revision whose entry script integrates area under a window
    const entryScript = [
      'def run(ctx):',
      "    trace = ctx.input('trace').read_signal()",
      "    x = trace['axis']",
      "    y = trace['values']",
      "    low, high = ctx.parameters['window']",
      "    chosen = [(xx, yy) for xx, yy in zip(x, y) if low <= xx <= high]",
      '    area = sum(yy for _, yy in chosen)',
      "    ctx.publish('peak_results', [{'start': low, 'end': high, 'area': area}], kind='table')",
      "    ctx.view('results', 'table', artifact='peak_results')",
    ].join('\n');

    const { recordId: revId } = await service.createRevision({
      title: 'GC area',
      entryScript,
      sdkVersion: '0.1.0',
    });

    const { recordId: runId } = await service.createRun({
      title: 'run',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: { trace: { kind: 'record', id: dref.recordId, type: 'data-reference' } },
      parameters: { window: [0.0, 0.5] },
    });

    const res = await runner.executeRun(runId);
    expect(res.status).toBe('succeeded');
    expect(res.manifest.artifacts.length).toBe(1);
    expect(res.manifest.artifacts[0].name).toBe('peak_results');
    expect(res.manifest.artifacts[0].value).toEqual([{ start: 0.0, end: 0.5, area: 10.0 }]);

    // run status is succeeded
    const runEnv = await service.getRun(runId);
    expect((runEnv!.payload as { status: string }).status).toBe('succeeded');

    // artifact + view-spec records persist
    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    expect(artifacts.length).toBe(1);
    const views = await ctx.store.list({ kind: 'view-spec' });
    expect(views.length).toBe(1);
  }, 30000);

  it('marks a run failed when the script throws', async () => {
    const { recordId: revId } = await service.createRevision({
      title: 'broken',
      entryScript: "def run(ctx):\n    raise RuntimeError('boom')",
      sdkVersion: '0.1.0',
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-fail',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
    });
    await expect(runner.executeRun(runId)).rejects.toThrow(/boom/);
    const runEnv = await service.getRun(runId);
    expect((runEnv!.payload as { status: string }).status).toBe('failed');
  }, 30000);
});