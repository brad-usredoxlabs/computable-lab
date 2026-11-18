// @vitest-environment node
/**
 * L2-GC-AIA-READBACK-1 — a binary measurement file uploaded through the DEVICE
 * blob store must be readable BACK through the parser route.
 *
 * The upload arm (MeasurementHandlers binary branch) returns
 * `result.storedPath` = `measurements/<artifact>/<file>` and the bytes live on
 * the storage device, NOT in the git worktree. Both parser consumers
 * (validate-parser and ingest) used `repoAdapter.getFile(path)` only, so that
 * path dead-ended with NOT_FOUND (gate GC-BUNDLE r2 F4).
 *
 * This test stores the real AIA/CDF fixture bytes through ArtifactBlobStore
 * (prefix 'measurements') into an in-memory device, then drives BOTH consumers
 * with the returned storedPath. `repoAdapter.getFile` genuinely misses (the
 * path does not exist in the test worktree), exactly like production.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ArtifactBlobStore, type ArtifactBlobStoreRecorder } from '../ingestion/ArtifactBlobStore.js';
import { StorageService } from '../storage/StorageService.js';
import { StorageError, type StorageProvider } from '../storage/types.js';
import { MeasurementParserValidationService } from './MeasurementParserValidationService.js';
import { isMeasurementDevicePath, resolveRawFile } from './rawFileResolver.js';
import { MeasurementService } from './MeasurementService.js';
import { setupTestWorkspace } from '../test/setupApp.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureBytes = await readFile(resolve(here, 'parsers/fixtures/aia_andi_sample.cdf'));

/** In-memory device provider: bytes keyed by device-relative path. */
function makeDevice(): { provider: StorageProvider; blobs: Map<string, Buffer> } {
  const blobs = new Map<string, Buffer>();
  const provider: StorageProvider = {
    kind: 'local-mount',
    async list() {
      return [];
    },
    async stat() {
      return {};
    },
    async read(path: string) {
      const buf = blobs.get(path);
      if (!buf) throw new StorageError('NOT_FOUND', `not found: ${path}`);
      return Readable.from(buf);
    },
    async write(path: string, stream: NodeJS.ReadableStream) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
      const buf = Buffer.concat(chunks);
      blobs.set(path, buf);
      return { sizeBytes: buf.byteLength };
    },
    async delete() {},
  };
  return { provider, blobs };
}

const measurementSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/measurement.schema.yaml"
type: object
required: [kind, recordId, title, assayType, data]
properties:
  kind: { const: "measurement" }
  recordId: { type: string }
  title: { type: string }
  assayType: { type: string }
  data:
    type: array
    items:
      type: object
      required: [well, metric, value]
      properties:
        well: { type: string }
        metric: { type: string }
        value: { type: number }
        channelId: { type: string }
  artifacts:
    type: array
    items: { type: object }
  parserInfo: { type: object }
`;

describe('device-stored raw binary readback (L2-GC-AIA-READBACK-1)', () => {
  const testDir = resolve(process.cwd(), 'tmp/device-readback-test');
  let ctx: AppContext;
  let storedPath: string;
  let blobs: Map<string, Buffer>;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records/inbox'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/measurement.schema.yaml'), measurementSchema);
    await writeFile(
      resolve(testDir, 'records/inbox/gemini.csv'),
      ['well,channelId,metric,value,unit', 'A1,FITC,RFU,1234.5,RFU', 'A2,FITC,RFU,1100.1,RFU', ''].join('\n'),
    );
    await setupTestWorkspace(testDir);
    // Isolate the records repository under testDir: the default dataDir is the
    // shared ~/.computable-lab embedded-git store, which contends across lanes
    // and blows the 10s hook budget (the same reason analysisService.test.ts
    // pins dataDir).
    await writeFile(
      resolve(testDir, 'config.yaml'),
      [
        'server:',
        '  port: 3001',
        // NB: 'silent' is not an accepted config logLevel — it would make
        // loadConfig throw, silently falling back to the SHARED default store.
        "  logLevel: 'error'",
        `  dataDir: '${resolve(testDir, 'data')}'`,
        `  workspaceDir: '${resolve(testDir, 'workspaces')}'`,
        'repositories:',
        '  - id: main',
        '    default: true',
        "    mode: 'embedded-git'",
        "    git: { url: '', branch: 'main', auth: { type: 'none' } }",
        "    sync: { mode: 'manual', autoCommit: true, autoPush: false }",
        "    records: { directory: 'records' }",
      ].join('\n'),
    );
    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });

    const device = makeDevice();
    blobs = device.blobs;
    ctx.storageService = new StorageService(
      [{ id: 'vast', label: 'vast', kind: 'local-mount', default: true }],
      () => device.provider,
    );

    // The upload arm's recorder persists a data-reference record; the read path
    // never records, so a no-op recorder is the right production shape here.
    const recorder: ArtifactBlobStoreRecorder = async () => ({ drefId: 'DREF-000001' });
    const blobStore = new ArtifactBlobStore(ctx.storageService, 'measurements', recorder);
    const saved = await blobStore.save({
      artifactId: '20261116-SIGNAL01.cdf',
      fileName: 'SIGNAL01.cdf',
      contentBase64: fixtureBytes.toString('base64'),
    });
    storedPath = saved.storedPath;

    // The git arm must stay byte-identical: write the CSV where the repo
    // adapter actually reads from (its worktree), then validate it below.
    await mkdir(resolve(ctx.workspaceRoot, 'records/inbox'), { recursive: true });
    await writeFile(
      resolve(ctx.workspaceRoot, 'records/inbox/gemini.csv'),
      ['well,channelId,metric,value,unit', 'A1,FITC,RFU,1234.5,RFU', 'A2,FITC,RFU,1100.1,RFU', ''].join('\n'),
    );
  }, 30000);

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('uploads to the device under the measurements prefix, not the worktree', async () => {
    expect(storedPath.startsWith('measurements/')).toBe(true);
    expect(blobs.has(storedPath)).toBe(true);
    // The git adapter genuinely cannot see it — this is the production bug shape.
    expect(await ctx.repoAdapter.getFile(storedPath)).toBeNull();
  });

  it('validate-parser parses the device-stored path instead of NOT_FOUND', async () => {
    const service = new MeasurementParserValidationService(ctx);
    const result = await service.validate({ parserId: 'aia_andi_cdf', path: storedPath });

    expect(result['parserId']).toBe('aia_andi_cdf');
    expect(result['assayType']).toBe('gc_fid');
    expect(result['path']).toBe(storedPath);
    expect(result['rows'] as number).toBeGreaterThan(0);
  });

  it('ingest reads the same device-stored path and writes the measurement', async () => {
    const service = new MeasurementService(ctx);
    const result = await service.ingest({
      parserId: 'aia_andi_cdf',
      rawData: { path: storedPath },
    });

    const envelope = await ctx.store.get(result.recordId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as { assayType: string; data: unknown[] };
    expect(payload.assayType).toBe('gc_fid');
    expect(payload.data.length).toBeGreaterThan(0);
  });

  it('still resolves git worktree paths unchanged (CSV-in-git arm)', async () => {
    const service = new MeasurementParserValidationService(ctx);
    const result = await service.validate({ parserId: 'gemini_csv', path: 'records/inbox/gemini.csv' });
    expect(result['rows']).toBe(2);
  });

  it('refuses a path outside the measurements prefix (device arm is guarded)', async () => {
    const service = new MeasurementParserValidationService(ctx);
    await expect(service.validate({ parserId: 'aia_andi_cdf', path: 'secrets/SIGNAL01.cdf' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('prefers the git worktree when both stores hold the same path', async () => {
    const bothPath = 'measurements/both/gitwins.csv';
    blobs.set(bothPath, Buffer.from('device bytes'));
    const withGit = {
      ...ctx,
      repoAdapter: { getFile: async () => ({ path: bothPath, content: 'well,channelId,metric,value\nA1,FITC,RFU,1', sha: 'x', size: 1 }) },
    } as unknown as AppContext;
    const resolved = await resolveRawFile(withGit, bothPath);
    expect(resolved).toEqual({ content: 'well,channelId,metric,value\nA1,FITC,RFU,1', source: 'git' });
  });

  it('guards the device arm to upload-shaped paths', () => {
    expect(isMeasurementDevicePath(storedPath)).toBe(true);
    expect(isMeasurementDevicePath('measurements/a/b.cdf')).toBe(true);
    for (const bad of ['secrets/a.cdf', '/measurements/a/b.cdf', 'measurements/../a.cdf', 'measurements//a.cdf', 'records/inbox/gemini.csv', '']) {
      expect(isMeasurementDevicePath(bad)).toBe(false);
    }
  });

  it('preserves NOT_FOUND when the context has no storage service', async () => {
    const noDevice = { ...ctx, storageService: undefined } as unknown as AppContext;
    const service = new MeasurementParserValidationService(noDevice);
    await expect(service.validate({ parserId: 'aia_andi_cdf', path: storedPath })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
