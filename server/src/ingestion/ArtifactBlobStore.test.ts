// @vitest-environment node
import { beforeEach, describe, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ArtifactBlobStore, LegacyArtifactBlobStore, createArtifactBlobStoreRecorder } from './ArtifactBlobStore.js';
import type { StorageProvider } from '../storage/types.js';
import { StorageError } from '../storage/types.js';
import { StorageService } from '../storage/StorageService.js';
import type { RecordStore, RecordEnvelope, StoreResult } from '../store/types.js';

const DATA_REF_SCHEMA = 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml';

// ---- Fakes ----

function makeFakeProvider(): { provider: StorageProvider; writeCalls: Array<{ path: string; stream: NodeJS.ReadableStream }> } {
  const writeCalls: Array<{ path: string; stream: NodeJS.ReadableStream }> = [];
  const readData: Map<string, Buffer> = new Map();
  const provider: StorageProvider = {
    kind: 'local-mount',
    async list() { return []; },
    async stat() { return {}; },
    async read(path) {
      const buf = readData.get(path);
      if (!buf) throw new StorageError('NOT_FOUND', `not found: ${path}`);
      return Readable.from(buf);
    },
    async write(path, stream) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        chunks.push(Buffer.from(chunk));
      }
      readData.set(path, Buffer.concat(chunks));
      writeCalls.push({ path, stream: Readable.from(Buffer.concat(chunks)) });
      return { sizeBytes: Buffer.concat(chunks).byteLength };
    },
    async delete() {},
  };
  return { provider, writeCalls };
}

/** Production shape: the store holds the StorageService and resolves lazily. */
function makeStorage(provider: StorageProvider, id = 'vast'): StorageService {
  return new StorageService([{ id, label: id, kind: 'local-mount', default: true }], () => provider);
}

function makeFakeStore(): { store: RecordStore; createdEnvelopes: Array<{ recordId: string; payload: Record<string, unknown> }> } {
  const createdEnvelopes: Array<{ recordId: string; payload: Record<string, unknown> }> = [];
  const store: RecordStore = {
    async get() { return null; },
    async getByPath() { return null; },
    async getWithValidation() { return { success: false }; },
    async list(filter) {
      // Return accumulated envelopes so the recorder sees previously minted IDs
      return createdEnvelopes
        .filter((e) => !filter || !filter.kind || e.payload.kind === filter.kind)
        .map((e) => ({ recordId: e.recordId, schemaId: DATA_REF_SCHEMA, payload: e.payload }));
    },
    async create(options) {
      const env = options.envelope;
      createdEnvelopes.push({ recordId: env.recordId, payload: env.payload as Record<string, unknown> });
      return { success: true, envelope: env };
    },
    async update() { return { success: true }; },
    async delete() { return { success: true }; },
    async validate() { return { valid: true, errors: [] }; },
    async lint() { return { valid: true, violations: [] }; },
    async exists() { return false; },
  };
  return { store, createdEnvelopes };
}

// ---- Tests ----

describe('ArtifactBlobStore — storage-backed', () => {
  let provider: StorageProvider;
  let writeCalls: Array<{ path: string; stream: NodeJS.ReadableStream }>;
  let store: RecordStore;
  let createdEnvelopes: Array<{ recordId: string; payload: Record<string, unknown> }>;
  let workspaceDir: string;

  beforeEach(() => {
    const fake = makeFakeProvider();
    provider = fake.provider;
    writeCalls = fake.writeCalls;
    const fakeStore = makeFakeStore();
    store = fakeStore.store;
    createdEnvelopes = fakeStore.createdEnvelopes;
    workspaceDir = mkdtempSync(`${tmpdir()}/abtest-`);
  });

  describe('save()', () => {
    it('writes to the provider and NOT to the filesystem', async () => {
      const recorder = createArtifactBlobStoreRecorder(store);
      const blobStore = new ArtifactBlobStore(makeStorage(provider), 'ingestion-artifacts', recorder);

      const content = Buffer.from('hello world');
      const result = await blobStore.save({
        artifactId: 'ING-001',
        fileName: 'document.pdf',
        contentBase64: content.toString('base64'),
      });

      // Provider received the write
      expect(writeCalls.length).toBe(1);
      expect(writeCalls[0].path).toBe('ingestion-artifacts/ING-001/document.pdf');

      // Verify the written bytes
      const providerStream = await provider.read('ingestion-artifacts/ING-001/document.pdf');
      const chunks: Buffer[] = [];
      for await (const chunk of providerStream as AsyncIterable<Buffer>) {
        chunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks)).toEqual(content);

      // No file in the workspace dir
      const workspaceEntries = readdirSync(workspaceDir);
      expect(workspaceEntries).toEqual([]);
    });

    it('returns device-relative storedPath', async () => {
      const recorder = createArtifactBlobStoreRecorder(store);
      const blobStore = new ArtifactBlobStore(makeStorage(provider), 'ingestion-artifacts', recorder);

      const result = await blobStore.save({
        artifactId: 'ING-001',
        fileName: 'test.pdf',
        contentBase64: Buffer.from('abc').toString('base64'),
      });

      // storedPath is device-relative: no leading /, no .., not absolute
      expect(result.storedPath.startsWith('/')).toBe(false);
      expect(result.storedPath.includes('..')).toBe(false);
      expect(result.storedPath).toBe('ingestion-artifacts/ING-001/test.pdf');
    });

    it('creates a data-reference record with correct fields', async () => {
      const recorder = createArtifactBlobStoreRecorder(store);
      const blobStore = new ArtifactBlobStore(makeStorage(provider), 'ingestion-artifacts', recorder);

      const content = Buffer.from('test data');
      const result = await blobStore.save({
        artifactId: 'ING-001',
        fileName: 'data.csv',
        contentBase64: content.toString('base64'),
      });

      const expectedHash = createHash('sha256').update(content).digest('hex');

      // SHA256 and size match
      expect(result.sha256).toBe(expectedHash);
      expect(result.sizeBytes).toBe(content.byteLength);

      // Data-reference record was created
      expect(createdEnvelopes.length).toBe(1);
      const dref = createdEnvelopes[0].payload;
      expect(dref.kind).toBe('data-reference');
      expect(dref.id).toMatch(/^DREF-\d{6}$/);
      expect(dref.storageDeviceId).toBe('vast');
      expect(dref.path).toBe('ingestion-artifacts/ING-001/data.csv');
      expect(dref.contentHash).toBe(expectedHash);
      expect(dref.sizeBytes).toBe(content.byteLength);
      expect(dref.dataKind).toBe('binary');
      expect(dref.format).toBe('csv');

      // drefId is returned
      expect(result.drefId).toBe(createdEnvelopes[0].recordId);
    });

    it('throws typed MISSING_CONFIG when no device is configured', async () => {
      // Production shape: an EMPTY StorageService (DEFAULT_APP_CONFIG.storageDevices: []).
      const storage = new StorageService([]);
      const recorder = createArtifactBlobStoreRecorder(store);

      // Construction is lazy — it must not resolve the default device.
      const blobStore = new ArtifactBlobStore(storage, 'ingestion-artifacts', recorder);

      const failure = await blobStore.save({
        artifactId: 'ING-001',
        fileName: 'test.pdf',
        contentBase64: Buffer.from('abc').toString('base64'),
      }).then(() => null, (err: unknown) => err);

      expect(failure).toBeInstanceOf(StorageError);
      expect((failure as StorageError).code).toBe('MISSING_CONFIG');

      // Hard-fail: no bytes written, no data-reference minted.
      expect(writeCalls.length).toBe(0);
      expect(createdEnvelopes.length).toBe(0);
    });

    it('throws on provider failure — no silent filesystem fallback', async () => {
      const failingProvider: StorageProvider = {
        kind: 'local-mount',
        async list() { return []; },
        async stat() { return {}; },
        async read() { throw new Error('disk full'); },
        async write() { throw new Error('disk full'); },
        async delete() {},
      };

      const recorder = createArtifactBlobStoreRecorder(store);
      const blobStore = new ArtifactBlobStore(makeStorage(failingProvider), 'ingestion-artifacts', recorder);

      await expect(blobStore.save({
        artifactId: 'ING-001',
        fileName: 'test.pdf',
        contentBase64: Buffer.from('abc').toString('base64'),
      })).rejects.toThrow('disk full');

      // Verify no bytes were written anywhere
      expect(writeCalls.length).toBe(0);
      expect(createdEnvelopes.length).toBe(0);
    });
  });

  describe('loadBase64()', () => {
    it('reads bytes from the provider and returns base64', async () => {
      const content = Buffer.from('readable content');
      const recorder = createArtifactBlobStoreRecorder(store);
      const blobStore = new ArtifactBlobStore(makeStorage(provider), 'ingestion-artifacts', recorder);

      // First save to populate
      await blobStore.save({ artifactId: 'ING-001', fileName: 'file.bin', contentBase64: content.toString('base64') });

      // Then load
      const loaded = await blobStore.loadBase64('ingestion-artifacts/ING-001/file.bin');
      expect(loaded).toBe(content.toString('base64'));
    });

    it('falls through to the legacy on-disk reader when the device has no such blob', async () => {
      const legacy = new LegacyArtifactBlobStore(workspaceDir, '.ingestion-artifacts');
      const content = Buffer.from('pre-existing legacy bytes');
      await legacy.save({ artifactId: 'LEG-001', fileName: 'old.bin', contentBase64: content.toString('base64') });

      const recorder = createArtifactBlobStoreRecorder(store);
      const blobStore = new ArtifactBlobStore(makeStorage(provider), 'ingestion-artifacts', recorder, legacy);

      // Provider throws StorageError NOT_FOUND for this path -> legacy read.
      const loaded = await blobStore.loadBase64('.ingestion-artifacts/LEG-001/old.bin');
      expect(loaded).toBe(content.toString('base64'));

      // READ ONLY: no write, no data-reference, no on-disk write side effect.
      expect(writeCalls.length).toBe(0);
      expect(createdEnvelopes.length).toBe(0);
    });

    it('finds legacy blobs recorded relative to the records root', async () => {
      // Pre-migration records carry 'records/.ingestion-artifacts/<id>/<file>'
      // while some tooling recorded '.ingestion-artifacts/<id>/<file>'.
      const legacy = new LegacyArtifactBlobStore(workspaceDir, 'records/.ingestion-artifacts');
      const content = Buffer.from('records-rooted legacy bytes');
      await legacy.save({ artifactId: 'LEG-002', fileName: 'old2.bin', contentBase64: content.toString('base64') });

      const recorder = createArtifactBlobStoreRecorder(store);
      const blobStore = new ArtifactBlobStore(makeStorage(provider), 'ingestion-artifacts', recorder, legacy);

      const loaded = await blobStore.loadBase64('.ingestion-artifacts/LEG-002/old2.bin');
      expect(loaded).toBe(content.toString('base64'));
    });

    it('does not fall back to disk when the failing read is not NOT_FOUND', async () => {
      const legacy = new LegacyArtifactBlobStore(workspaceDir, '.ingestion-artifacts');
      await legacy.save({ artifactId: 'LEG-003', fileName: 'x.bin', contentBase64: Buffer.from('x').toString('base64') });

      const denied: StorageProvider = {
        kind: 'local-mount',
        async list() { return []; },
        async stat() { return {}; },
        async read() { throw new StorageError('ACCESS_DENIED', 'denied'); },
        async write() { throw new StorageError('ACCESS_DENIED', 'denied'); },
        async delete() {},
      };
      const blobStore = new ArtifactBlobStore(
        makeStorage(denied), 'ingestion-artifacts', createArtifactBlobStoreRecorder(store), legacy,
      );

      await expect(blobStore.loadBase64('.ingestion-artifacts/LEG-003/x.bin'))
        .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    });
  });

  describe('safeName()', () => {
    it('sanitizes artifact filenames', async () => {
      const recorder = createArtifactBlobStoreRecorder(store);
      const blobStore = new ArtifactBlobStore(makeStorage(provider), 'ingestion-artifacts', recorder);

      const result = await blobStore.save({
        artifactId: 'ING-001',
        fileName: 'my document (1).pdf',
        contentBase64: Buffer.from('abc').toString('base64'),
      });

      // Spaces and parens are replaced
      expect(result.storedPath).not.toContain(' ');
      expect(result.storedPath).not.toContain('(');
      expect(result.storedPath).not.toContain(')');
    });

    it('defaults to artifactId.bin when no fileName', async () => {
      const recorder = createArtifactBlobStoreRecorder(store);
      const blobStore = new ArtifactBlobStore(makeStorage(provider), 'ingestion-artifacts', recorder);

      const result = await blobStore.save({
        artifactId: 'ING-001',
        contentBase64: Buffer.from('abc').toString('base64'),
      });

      expect(result.storedPath).toBe('ingestion-artifacts/ING-001/ING-001.bin');
    });
  });

  describe('LegacyArtifactBlobStore', () => {
    it('can still read pre-existing on-disk blobs', async () => {
      const legacy = new LegacyArtifactBlobStore(workspaceDir, '.ingestion-artifacts');

      const content = Buffer.from('legacy data');
      await legacy.save({ artifactId: 'LEG-001', fileName: 'old.bin', contentBase64: content.toString('base64') });

      // File exists on disk
      const loaded = await legacy.loadBase64('.ingestion-artifacts/LEG-001/old.bin');
      expect(loaded).toBe(content.toString('base64'));

      // Verify it actually wrote to the filesystem
      expect(existsSync(`${workspaceDir}/.ingestion-artifacts/LEG-001/old.bin`)).toBe(true);
    });
  });

  describe('createArtifactBlobStoreRecorder()', () => {
    it('omits undefined optional fields (exactOptionalPropertyTypes safety)', async () => {
      const fakeStore = makeFakeStore();
      const recorder = createArtifactBlobStoreRecorder(fakeStore.store);

      await recorder({
        artifactId: 'ING-001',
        deviceId: 'vast',
        path: 'ingestion-artifacts/ING-001/test.bin',
        contentHash: 'abc123',
        sizeBytes: 10,
        fileName: 'test.bin',
      });

      const dref = fakeStore.createdEnvelopes[0].payload;
      // Optional fields should either be present with a value or absent entirely
      // acquiredAt is always set, format is set from fileName
      expect(dref.acquiredAt).toBeDefined();
      expect(dref.format).toBe('bin');
    });

    it('mints sequential DREF IDs', async () => {
      const fakeStore = makeFakeStore();
      const recorder = createArtifactBlobStoreRecorder(fakeStore.store);

      await recorder({ artifactId: 'A', deviceId: 'vast', path: 'a', contentHash: 'h1', sizeBytes: 1, fileName: 'a.txt' });
      await recorder({ artifactId: 'B', deviceId: 'vast', path: 'b', contentHash: 'h2', sizeBytes: 2, fileName: 'b.txt' });

      expect(fakeStore.createdEnvelopes[0].recordId).toMatch(/^DREF-000001$/);
      expect(fakeStore.createdEnvelopes[1].recordId).toMatch(/^DREF-000002$/);
    });
  });
});
