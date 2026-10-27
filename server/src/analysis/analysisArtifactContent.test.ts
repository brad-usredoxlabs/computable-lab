/**
 * GC-10 OQ-1(a) — the ratified read-only content route, tested.
 *
 * `GET /api/analysis-artifacts/:id/content` resolves AOUT-* -> payload.
 * dataReferenceRef -> the immutable DREF record ->
 * `storageService.getProvider(deviceId).read(path)` (the provisionInputs
 * channel, analysisRunner.ts:221-222) and returns the stored JSON bytes.
 * The path comes ONLY from the pinned DREF (never a user input), and the
 * route is GET-only: a POST must not resolve.
 *
 * Legs (spec §Verification 4): happy path (dref-backed AOUT -> JSON bytes),
 * 404 legs (missing artifact / inline artifact with no dref / missing dref
 * record), and the GET-only leg (POST -> 404, never a handler run).
 *
 * The route logic is exercised through the exported `getAnalysisArtifactContent`
 * (the real code path the handler delegates to) plus a minimal fastify app that
 * registers ONLY the content route exactly as routes.ts does (GET-only).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import fastify, { type FastifyInstance } from 'fastify';
import { createAnalysisHandlers } from '../api/handlers/AnalysisHandlers.js';
import { StorageService } from '../storage/StorageService.js';
import { LocalMountStorageProvider } from '../storage/LocalMountStorageProvider.js';
import type { AppContext } from '../server.js';

interface StoredRecord { recordId: string; schemaId: string; payload: Record<string, unknown> }

/** In-memory RecordStore fake: just get/list/create/update. */
class FakeStore {
  records = new Map<string, StoredRecord>();
  get(id: string) { return Promise.resolve(this.records.get(id) ?? null); }
  list(_q?: unknown) { return Promise.resolve([...this.records.values()]); }
  create(input: { envelope: StoredRecord; message: string }) {
    this.records.set(input.envelope.recordId, input.envelope);
    return Promise.resolve({ success: true, recordId: input.envelope.recordId });
  }
  update(input: { envelope: StoredRecord; message: string }) {
    this.records.set(input.envelope.recordId, input.envelope);
    return Promise.resolve({ success: true, recordId: input.envelope.recordId });
  }
}

describe('GC-10 OQ-1(a) — GET /api/analysis-artifacts/:id/content (ratified read-only route)', () => {
  let app: FastifyInstance;
  let store: FakeStore;
  let storageRoot: string;
  let dir: string;
  let artifactId: string;
  let inlineArtifactId: string;

  const CONTENT_PATH = 'analysis-artifacts/RUN-TEST-1/trace.json';
  const CONTENT = {
    axis: [0, 1, 2, 3],
    values: [0.1, 4.2, 9.9, 0.3],
    axis_units: 'min',
    value_units: 'pA',
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gc10-content-route-'));
    storageRoot = join(dir, 'storage');
    await mkdir(storageRoot, { recursive: true });
    // Seed the DREF-pinned bytes on the storage device (the shipped local
    // mount provider — the same class a lane's USB/NAS device uses).
    const provider = new LocalMountStorageProvider(storageRoot);
    await provider.write(CONTENT_PATH, Readable.from(Buffer.from(JSON.stringify(CONTENT))));

    store = new FakeStore();
    artifactId = 'AOUT-000001';
    inlineArtifactId = 'AOUT-000002';
    const DREF = 'DREF-000001';
    store.records.set(artifactId, {
      recordId: artifactId,
      schemaId: 'analysis-output-artifact',
      payload: {
        kind: 'analysis-output-artifact',
        id: artifactId,
        name: 'trace',
        dataKind: 'signal',
        dataReferenceRef: { kind: 'record', id: DREF, type: 'data-reference' },
      },
    });
    store.records.set(DREF, {
      recordId: DREF,
      schemaId: 'data-reference',
      payload: {
        kind: 'data-reference',
        id: DREF,
        storageDeviceId: 'usb0',
        path: CONTENT_PATH,
        contentHash: 'test-sha',
      },
    });
    // Inline-only artifact (no dataReferenceRef) — the named-error leg.
    store.records.set(inlineArtifactId, {
      recordId: inlineArtifactId,
      schemaId: 'analysis-output-artifact',
      payload: {
        kind: 'analysis-output-artifact',
        id: inlineArtifactId,
        name: 'small',
        dataKind: 'table',
        inlineValue: { rows: [] },
      },
    });

    const fakeCtx = {
      store,
      storageService: new StorageService(
        [{ id: 'usb0', kind: 'local-mount', root: storageRoot, default: true } as never],
        () => provider,
      ),
    } as unknown as AppContext;

    // Register ONLY the content route, exactly as routes.ts does (GET-only).
    const handlers = createAnalysisHandlers(fakeCtx);
    const instance = fastify({ logger: false });
    instance.register(async (i) => {
      i.get('/analysis-artifacts/:id/content', handlers.getArtifactContent.bind(handlers));
    }, { prefix: '/api' });
    await instance.ready();
    app = instance;
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('happy path: dref-backed AOUT -> the stored JSON bytes (axis/values round-trip)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/analysis-artifacts/${artifactId}/content` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.artifactId).toBe(artifactId);
    expect(body.dataReferenceId).toBe('DREF-000001');
    expect(body.content).toEqual(CONTENT);
  });

  it('404: unknown artifact id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analysis-artifacts/AOUT-999999/content' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NOT_FOUND');
  });

  it('named error: inline-only artifact (no dref to read)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/analysis-artifacts/${inlineArtifactId}/content` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NO_DATA_REFERENCE');
  });

  it('404: artifact points at a missing dref record', async () => {
    const orphan = 'AOUT-000003';
    store.records.set(orphan, {
      recordId: orphan,
      schemaId: 'analysis-output-artifact',
      payload: {
        kind: 'analysis-output-artifact',
        id: orphan,
        name: 'orphan',
        dataKind: 'signal',
        dataReferenceRef: { kind: 'record', id: 'DREF-999999', type: 'data-reference' },
      },
    });
    const res = await app.inject({ method: 'GET', url: `/api/analysis-artifacts/${orphan}/content` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NOT_FOUND');
  });

  it('GET-only: a POST to the content path must not resolve (no write side)', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/analysis-artifacts/${artifactId}/content` });
    // No POST route registered for this path -> fastify 404.
    expect(res.statusCode).toBe(404);
  });

  it('direct contract: the logic throws the NAMED error (404 NOT_FOUND), not a bare 500', async () => {
    // The handler relies on the logic throwing AnalysisServiceError with the
    // right code/status so expected misses read as 404, never a 500 the UI
    // would misread as a server fault.
    const { getAnalysisArtifactContent } = await import('../analysis/analysisArtifactContent.js');
    await expect(getAnalysisArtifactContent({ store } as never, 'AOUT-000004')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});
