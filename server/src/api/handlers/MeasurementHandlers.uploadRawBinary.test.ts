// @vitest-environment node
/**
 * MeasurementHandlers.uploadRawBinary — L2-GC-RAW-BINARY-1 (binbytes).
 *
 * A NON-UTF8 upload (e.g. an Agilent GC-FID .ch / ANDI .cdf chromatogram) must be
 * written UNCHANGED through the existing device-backed blob store and answered with
 * the data-reference id + sha256; a UTF-8 (CSV) upload keeps today's git-inbox path
 * byte-for-byte. No second writer, no silent truncation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createMeasurementHandlers } from './MeasurementHandlers.js';
import { StorageService } from '../../storage/StorageService.js';
import type { AppContext } from '../../server.js';

const SCRATCH = '/home/brad/.gc-raw-scratch';

/** Bytes that are NOT valid UTF-8 (0xFF/0xFE/0x80 cannot round-trip). */
const BINARY_BYTES = Buffer.from([0x2e, 0x00, 0xff, 0xfe, 0x41, 0x80]);
const BINARY_SHA = createHash('sha256').update(BINARY_BYTES).digest('hex');
const CSV_TEXT = 'well,metric,value\nA1,ct,12.5\nH12,ct,13.1\n';

interface CreatedEnvelope {
  envelope: { recordId: string; schemaId: string; payload: Record<string, unknown> };
  message: string;
}

function makeStore() {
  const created: CreatedEnvelope[] = [];
  return {
    created,
    // First call returns [] (fresh DREF namespace); later calls see prior DREFs
    // so the recorder increments (AC4: second upload = second data-reference).
    async list(filter?: { kind?: string }) {
      if (filter?.kind === 'data-reference') {
        return created.map((c) => ({ recordId: c.envelope.recordId }));
      }
      return [];
    },
    async create(options: CreatedEnvelope) {
      created.push(options);
      return { success: true, envelope: options.envelope };
    },
  };
}

function makeRepoAdapter() {
  const files = new Map<string, { content: string; message: string }>();
  return {
    files,
    async fileExists(path: string) {
      return files.has(path);
    },
    async createFile(options: { path: string; content: string; message: string }) {
      files.set(options.path, { content: options.content, message: options.message });
      return { success: true };
    },
  };
}

function makeCtx(store: ReturnType<typeof makeStore>, repoAdapter: ReturnType<typeof makeRepoAdapter>, deviceRoot: string): AppContext {
  const storageService = new StorageService([
    { id: 'scratch', label: 'scratch device', kind: 'local-mount', default: true, mountPath: deviceRoot },
  ]);
  return { storageService, store, repoAdapter } as unknown as AppContext;
}

function makeReply() {
  return {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
}

interface BinaryResponse {
  success: true;
  path: string;
  fileName: string;
  size: number;
  sha256?: string;
  dataReferenceId?: string;
  mode?: string;
}

describe('MeasurementHandlers uploadRawMeasurementFile binary path', () => {
  beforeAll(async () => {
    await rm(SCRATCH, { recursive: true, force: true });
    await mkdir(SCRATCH, { recursive: true });
  });

  afterAll(async () => {
    await rm(SCRATCH, { recursive: true, force: true });
  });

  it('stores a non-UTF8 upload byte-for-byte on the device and answers with DREF id + sha256', async () => {
    const deviceRoot = join(SCRATCH, 'device-a');
    const store = makeStore();
    const repoAdapter = makeRepoAdapter();
    const handlers = createMeasurementHandlers(makeCtx(store, repoAdapter, deviceRoot));
    const reply = makeReply();

    const result = await handlers.uploadRawMeasurementFile(
      { body: { fileName: 'sample.ch', contentBase64: BINARY_BYTES.toString('base64') } } as never,
      reply as never,
    );

    expect(reply.statusCode).toBe(201);
    const res = result as BinaryResponse;
    expect(res.success).toBe(true);
    expect(res.fileName).toBe('sample.ch');
    expect(res.size).toBe(BINARY_BYTES.length);
    expect(res.mode).toBe('binary');
    expect(typeof res.dataReferenceId).toBe('string');
    expect(res.dataReferenceId).toMatch(/^DREF-\d+$/);
    expect(res.sha256).toBe(BINARY_SHA);
    expect(res.path.startsWith('measurements/')).toBe(true);

    // The data-reference envelope handed to the RecordStore anchors the ORIGINAL bytes.
    expect(store.created.length).toBe(1);
    const envelope = store.created[0]!.envelope;
    expect(envelope.recordId).toBe(res.dataReferenceId);
    expect(envelope.payload['kind']).toBe('data-reference');
    expect(envelope.payload['contentHash']).toBe(BINARY_SHA);
    expect(envelope.payload['sizeBytes']).toBe(BINARY_BYTES.length);
    expect(envelope.payload['path']).toBe(res.path);

    // Bytes on disk under the device root equal the original buffer byte-for-byte.
    const onDisk = await readFile(join(deviceRoot, res.path));
    expect(Buffer.compare(onDisk, BINARY_BYTES)).toBe(0);
    expect(envelope.payload['contentHash']).toBe(createHash('sha256').update(onDisk).digest('hex'));
  });

  it('keeps a UTF-8 CSV upload on the git-inbox path with today\u2019s response shape plus mode: text', async () => {
    const deviceRoot = join(SCRATCH, 'device-b');
    const store = makeStore();
    const repoAdapter = makeRepoAdapter();
    const handlers = createMeasurementHandlers(makeCtx(store, repoAdapter, deviceRoot));
    const reply = makeReply();

    const buffer = Buffer.from(CSV_TEXT, 'utf8');
    const result = await handlers.uploadRawMeasurementFile(
      { body: { fileName: 'plate.csv', contentBase64: buffer.toString('base64'), runId: 'RUN-1' } } as never,
      reply as never,
    );

    expect(reply.statusCode).toBe(201);
    const res = result as BinaryResponse;
    expect(res.success).toBe(true);
    expect(res.path).toMatch(/^records\/inbox\/measurements\/RUN-1\/.+-plate\.csv$/);
    expect(res.fileName).toBe('plate.csv');
    expect(res.size).toBe(buffer.length);
    expect(res.mode).toBe('text');
    // No binary-path fields leak onto the text response (exactOptionalPropertyTypes: absent, not undefined).
    expect('sha256' in res).toBe(false);
    expect('dataReferenceId' in res).toBe(false);

    // The inbox file content is the exact decoded text (no U+FFFD mangling possible for valid UTF-8).
    const written = repoAdapter.files.get(res.path);
    expect(written?.content).toBe(CSV_TEXT);
    expect(store.created.length).toBe(0);
  });

  it('refuses an empty upload with 400 EMPTY_FILE before anything is stored', async () => {
    const deviceRoot = join(SCRATCH, 'device-c');
    const store = makeStore();
    const repoAdapter = makeRepoAdapter();
    const handlers = createMeasurementHandlers(makeCtx(store, repoAdapter, deviceRoot));
    const reply = makeReply();

    // '====' is non-empty base64 that decodes to ZERO bytes (the gap EMPTY_FILE closes).
    const result = await handlers.uploadRawMeasurementFile(
      { body: { fileName: 'empty.bin', contentBase64: '====' } } as never,
      reply as never,
    );

    expect(reply.statusCode).toBe(400);
    expect(result).toEqual(expect.objectContaining({ error: 'EMPTY_FILE' }));
    expect(store.created.length).toBe(0);
    expect(repoAdapter.files.size).toBe(0);
    await expect(readFile(join(deviceRoot, 'measurements'))).rejects.toThrow();
  });

  it('refuses an oversize upload with 400 FILE_TOO_LARGE before anything is stored', async () => {
    const deviceRoot = join(SCRATCH, 'device-d');
    const store = makeStore();
    const repoAdapter = makeRepoAdapter();
    const handlers = createMeasurementHandlers(makeCtx(store, repoAdapter, deviceRoot));
    const reply = makeReply();

    const oversize = Buffer.alloc(18 * 1024 * 1024 + 1, 0x61);
    const result = await handlers.uploadRawMeasurementFile(
      { body: { fileName: 'big.cdf', contentBase64: oversize.toString('base64') } } as never,
      reply as never,
    );

    expect(reply.statusCode).toBe(400);
    expect(result).toEqual(expect.objectContaining({ error: 'FILE_TOO_LARGE' }));
    expect(store.created.length).toBe(0);
    expect(repoAdapter.files.size).toBe(0);
    await expect(readFile(join(deviceRoot, 'measurements'))).rejects.toThrow();
  });

  it('surfaces a typed StorageError as a named refusal carrying its code, never the generic message', async () => {
    // No device configured -> defaultDeviceId() throws StorageError('MISSING_CONFIG').
    const store = makeStore();
    const repoAdapter = makeRepoAdapter();
    const ctx = { storageService: new StorageService([]), store, repoAdapter } as unknown as AppContext;
    const handlers = createMeasurementHandlers(ctx);
    const reply = makeReply();

    const result = await handlers.uploadRawMeasurementFile(
      { body: { fileName: 'sample.ch', contentBase64: BINARY_BYTES.toString('base64') } } as never,
      reply as never,
    );

    expect(reply.statusCode).toBe(400);
    const err = result as { error: string; message: string };
    expect(err.error).toBe('STORAGE_MISSING_CONFIG');
    expect(err.message).toContain('storage device');
    expect(err.message).not.toBe('Failed to process uploaded file');
    expect(store.created.length).toBe(0);
    expect(repoAdapter.files.size).toBe(0);
  });

  it('a second upload of the same bytes creates a SECOND data-reference (same contentHash, new id)', async () => {
    const deviceRoot = join(SCRATCH, 'device-e');
    const store = makeStore();
    const repoAdapter = makeRepoAdapter();
    const handlers = createMeasurementHandlers(makeCtx(store, repoAdapter, deviceRoot));

    const first = (await handlers.uploadRawMeasurementFile(
      { body: { fileName: 'rep.ch', contentBase64: BINARY_BYTES.toString('base64') } } as never,
      makeReply() as never,
    )) as BinaryResponse;
    const second = (await handlers.uploadRawMeasurementFile(
      { body: { fileName: 'rep.ch', contentBase64: BINARY_BYTES.toString('base64') } } as never,
      makeReply() as never,
    )) as BinaryResponse;

    expect(first.dataReferenceId).toMatch(/^DREF-\d+$/);
    expect(second.dataReferenceId).toMatch(/^DREF-\d+$/);
    expect(first.dataReferenceId).not.toBe(second.dataReferenceId);
    expect(store.created.length).toBe(2);
    expect(store.created[0]!.envelope.payload['contentHash']).toBe(BINARY_SHA);
    expect(store.created[1]!.envelope.payload['contentHash']).toBe(BINARY_SHA);
  });
});
