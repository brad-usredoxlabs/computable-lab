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

  it('persists an emitted model file to storage as a data-reference (not git)', async () => {
    // Script writes a small "model" file and emits it via publish_file.
    const entryScript = [
      'import pickle, os',
      "def run(ctx):",
      "    with open('model.pkl','wb') as f:",
      "        f.write(pickle.dumps({'coef': 2.0, 'intercept': 1.0}))",
      "    ctx.publish_file('model', 'model.pkl', kind='model', format='pkl')",
    ].join('\n');
    const { recordId: revId } = await service.createRevision({
      title: 'train model',
      entryScript,
      sdkVersion: '0.1.0',
    });
    const { recordId: runId } = await service.createRun({
      title: 'run-train',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {},
    });
    const res = await runner.executeRun(runId);
    expect(res.status).toBe('succeeded');
    expect(res.manifest.artifacts[0].dataKind).toBe('model');

    // artifact record has a dataReferenceRef
    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const modelArt = artifacts.find((a) => (a.payload as { name?: string }).name === 'model');
    expect(modelArt).toBeDefined();
    const modelPayload = modelArt!.payload as { dataReferenceRef?: { id?: string }; dataKind?: string };
    expect(modelPayload.dataKind).toBe('model');
    expect(modelPayload.dataReferenceRef?.id).toMatch(/^DREF-/);

    // a data-reference record exists pointing at the storage device
    const drefs = await ctx.store.list({ kind: 'data-reference' });
    const dref = drefs.find((d) => d.recordId === modelPayload.dataReferenceRef?.id);
    expect(dref).toBeDefined();

    // model bytes are NOT in the git records tree (only a pointer is)
    const { readdir, readFile } = await import('node:fs/promises');
    const walk = async (dir: string): Promise<string[]> => {
      let out: string[] = [];
      try {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          if (e.isDirectory()) out.push(...(await walk(full)));
          else out.push(full);
        }
      } catch { return []; }
      return out;
    };
    const files = await walk(join(wsDir, 'records'));
    for (const f of files) {
      const content = await readFile(f, 'utf8').catch(() => '');
      expect(content.includes('coef')).toBe(false); // pickle bytes must not be in git
    }
  }, 30000);

  it('chains: a downstream run consumes a prior run\'s model artifact as input', async () => {
    // Run A: emit a model file
    const trainScript = [
      'import pickle',
      "def run(ctx):",
      "    with open('model.pkl','wb') as f:",
      "        f.write(pickle.dumps({'coef': 2.0, 'intercept': 1.0}))",
      "    ctx.publish_file('model', 'model.pkl', kind='model', format='pkl')",
    ].join('\n');
    const { recordId: trainRev } = await service.createRevision({ title: 'train', entryScript: trainScript, sdkVersion: '0.1.0' });
    const { recordId: trainRun } = await service.createRun({
      title: 'run-train',
      revisionRef: { kind: 'record', id: trainRev, type: 'analysis-revision' },
      inputs: {},
    });
    await runner.executeRun(trainRun);

    // find the model artifact id from run A
    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const aofA = artifacts.find((a) => (a.payload as { name?: string; runRef?: { id?: string } }).name === 'model'
      && (a.payload as { runRef?: { id?: string } }).runRef?.id === trainRun);
    expect(aofA).toBeDefined();

    // Run B: load the model artifact and predict
    const predictScript = [
      'import pickle',
      "def run(ctx):",
      "    import json",
      "    model = pickle.loads(ctx.input('model').file_bytes())",
      "    preds = [{'x': i, 'y': model['coef']*i + model['intercept']} for i in [0,1,2]]",
      "    ctx.publish('predictions', preds, kind='table')",
    ].join('\n');
    const { recordId: predictRev } = await service.createRevision({ title: 'predict', entryScript: predictScript, sdkVersion: '0.1.0' });
    const { recordId: predictRun } = await service.createRun({
      title: 'run-predict',
      revisionRef: { kind: 'record', id: predictRev, type: 'analysis-revision' },
      inputs: { model: { kind: 'record', id: aofA!.recordId, type: 'analysis-output-artifact' } },
    });
    const res = await runner.executeRun(predictRun);
    expect(res.status).toBe('succeeded');
    expect(res.manifest.artifacts[0].value).toEqual([
      { x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 },
    ]);
  }, 30000);
});