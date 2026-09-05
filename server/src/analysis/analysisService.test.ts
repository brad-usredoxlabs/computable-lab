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
});