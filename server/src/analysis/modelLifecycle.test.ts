import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import { AnalysisService } from './analysisService.js';
import { AnalysisRunner } from './analysisRunner.js';
import { acquireDataReference } from '../storage/acquisition.js';

const FIXTURES = resolve(process.cwd(), 'python-executor-service', 'fixtures', 'ml-chain');

/**
 * End-to-end model lifecycle: train → emit model → predict → filter downstream.
 * Exercises the REAL AnalysisRunner (storage persistence + chaining), not just
 * the SDK CLI — validating the full user scenario (A06 "use result downstream").
 */
describe('Model lifecycle chain (integration)', () => {
  const mountDir = join(tmpdir(), 'cl-ml-mount');
  const wsDir = resolve(tmpdir(), 'cl-ml-ws');

  let ctx: Awaited<ReturnType<typeof initializeApp>>;
  let runner: AnalysisRunner;
  let service: AnalysisService;

  const files = (p: string) => resolve(FIXTURES, p);

  beforeAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
    await mkdir(mountDir, { recursive: true });
    await mkdir(wsDir, { recursive: true });
    // copy fixture data onto the storage device (data already lives there)
    const { copyFile } = await import('node:fs/promises');
    await copyFile(files('train_data.csv'), join(mountDir, 'train_data.csv'));
    await copyFile(files('new_x.csv'), join(mountDir, 'new_x.csv'));
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
        '    default: true',
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

  it('train → emit model → predict → filter reproduces expected values', async () => {
    // Provision inputs: train_data.csv + new_x.csv as data-references on the device
    const trainDref = await acquireDataReference(ctx, {
      deviceId: 'usb0',
      path: 'train_data.csv',
      dataKind: 'table',
      format: 'csv',
    });
    const newXDref = await acquireDataReference(ctx, {
      deviceId: 'usb0',
      path: 'new_x.csv',
      dataKind: 'table',
      format: 'csv',
    });
    void trainDref; void newXDref;

    // ---- Step A: train (reads features, emits model file) ----
    const { readFile } = await import('node:fs/promises');
    const trainEntry = await readFile(files('train_entry.py'), 'utf8');
    const { recordId: trainRev } = await service.createRevision({ title: 'train', entryScript: trainEntry, sdkVersion: '0.1.0' });
    const { recordId: trainRun } = await service.createRun({
      title: 'train-run',
      revisionRef: { kind: 'record', id: trainRev, type: 'analysis-revision' },
      inputs: { features: { kind: 'record', id: trainDref.recordId, type: 'data-reference' } },
    });
    const trainRes = await runner.executeRun(trainRun);
    expect(trainRes.status).toBe('succeeded');
    // model artifact emitted (dataKind model)
    expect(trainRes.manifest.artifacts.some((a) => a.dataKind === 'model')).toBe(true);

    // locate the model artifact from the training run
    const arts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const modelArt = arts.find((a) =>
      (a.payload as { runRef?: { id?: string }; name?: string }).runRef?.id === trainRun
      && (a.payload as { name?: string }).name === 'model',
    );
    expect(modelArt).toBeDefined();
    expect((modelArt!.payload as { dataReferenceRef?: { id?: string } }).dataReferenceRef?.id).toMatch(/^DREF-/);

    // ---- Step B: predict (consumes model artifact input) ----
    const predictEntry = await readFile(files('predict_entry.py'), 'utf8');
    const { recordId: predictRev } = await service.createRevision({ title: 'predict', entryScript: predictEntry, sdkVersion: '0.1.0' });
    const { recordId: predictRun } = await service.createRun({
      title: 'predict-run',
      revisionRef: { kind: 'record', id: predictRev, type: 'analysis-revision' },
      inputs: {
        model: { kind: 'record', id: modelArt!.recordId, type: 'analysis-output-artifact' },
        new_x: { kind: 'record', id: newXDref.recordId, type: 'data-reference' },
      },
    });
    const predictRes = await runner.executeRun(predictRun);
    expect(predictRes.status).toBe('succeeded');
    const preds = predictRes.manifest.artifacts.find((a) => a.name === 'predictions');
    // trained y = 2x+1; new_x = [10,20,30] → preds [21,41,61]
    expect(preds!.value).toEqual([{ x: 10, pred: 21 }, { x: 20, pred: 41 }, { x: 30, pred: 61 }]);

    // ---- Step C: filter downstream (consumes predictions artifact input) ----
    const filterEntry = await readFile(files('filter_entry.py'), 'utf8');
    const predArt = (await ctx.store.list({ kind: 'analysis-output-artifact' })).find((a) =>
      (a.payload as { runRef?: { id?: string }; name?: string }).runRef?.id === predictRun
      && (a.payload as { name?: string }).name === 'predictions',
    );
    expect(predArt).toBeDefined();
    const { recordId: filterRev } = await service.createRevision({ title: 'filter', entryScript: filterEntry, sdkVersion: '0.1.0' });
    const { recordId: filterRun } = await service.createRun({
      title: 'filter-run',
      revisionRef: { kind: 'record', id: filterRev, type: 'analysis-revision' },
      inputs: { predictions: { kind: 'record', id: predArt!.recordId, type: 'analysis-output-artifact' } },
      parameters: { threshold: 40 },
    });
    const filterRes = await runner.executeRun(filterRun);
    expect(filterRes.status).toBe('succeeded');
    const filtered = filterRes.manifest.artifacts.find((a) => a.name === 'filtered')?.value;
    // keep pred>40 → [41,61], sorted ascending
    expect(filtered).toEqual([{ x: 20, pred: 41 }, { x: 30, pred: 61 }]);
  }, 60000);
});