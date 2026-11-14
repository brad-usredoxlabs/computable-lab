// @vitest-environment node
/**
 * MeasurementHandlers.uploadRawBinary — L2-GC-RAW-BINARY-1 (binbytes).
 * A NON-UTF8 upload (e.g. Agilent GC-FID .ch / ANDI .cdf) must be written UNCHANGED through the
 * existing device-backed blob store and answered with the data-reference id + sha256; a UTF-8 (CSV)
 * upload keeps today's git-inbox path byte-for-byte. Named refusals: EMPTY_FILE, FILE_TOO_LARGE,
 * STORAGE_<code>; a second upload of the same bytes yields a SECOND data-reference.
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
const CSV_BYTES = Buffer.from('well,metric,value\nA1,ct,12.5\nH12,ct,13.1\n', 'utf8');

interface Envelope { recordId: string; schemaId: string; payload: Record<string, unknown>; }
interface Created { envelope: Envelope; message: string; }

/** Tiny stub ctx: real StorageService over a scratch device root, fake store (records envelopes),
 *  fake repoAdapter (text-path files). */
function harness() {
  const deviceRoot = join(SCRATCH, `dev-${Math.random().toString(36).slice(2, 10)}`);
  const created: Created[] = [];
  const store = {
    created,
    // First list() returns [] (fresh DREF namespace); later lists see prior DREF ids so the
    // recorder increments (AC4: second upload of the same bytes = second data-reference).
    list: async (filter?: { kind?: string }) =>
      filter?.kind === 'data-reference' ? created.map((c) => ({ recordId: c.envelope.recordId })) : [],
    create: async (options: Created) => { created.push(options); return { success: true, envelope: options.envelope }; },
  };
  const files = new Map<string, string>();
  const repoAdapter = {
    fileExists: async (path: string) => files.has(path),
    createFile: async (options: { path: string; content: string; message: string }) => {
      files.set(options.path, options.content);
      return { success: true };
    },
  };
  const ctx = {
    storageService: new StorageService([{ id: 'scratch', label: 'scratch device', kind: 'local-mount', default: true, mountPath: deviceRoot }]),
    store,
    repoAdapter,
  } as unknown as AppContext;
  const reply = { statusCode: 200, status(code: number) { this.statusCode = code; return this; } };
  return { handlers: createMeasurementHandlers(ctx), store, files, deviceRoot, reply };
}

type H = ReturnType<typeof harness>;
function upload(h: H, body: Record<string, unknown>) {
  return h.handlers.uploadRawMeasurementFile({ body } as never, h.reply as never)
    .then((out) => ({ status: h.reply.statusCode, out }));
}
interface Resp { success?: boolean; path?: string; fileName?: string; size?: number; sha256?: string; dataReferenceId?: string; mode?: string; error?: string; message?: string; }

describe('uploadRawMeasurementFile binary path', () => {
  beforeAll(async () => {
    await rm(SCRATCH, { recursive: true, force: true });
    await mkdir(SCRATCH, { recursive: true });
  });
  afterAll(async () => {
    await rm(SCRATCH, { recursive: true, force: true });
  });

  it('stores a non-UTF8 upload byte-for-byte on the device and answers with DREF id + sha256', async () => {
    const h = harness();
    const { status, out } = await upload(h, { fileName: 'sample.ch', contentBase64: BINARY_BYTES.toString('base64') });
    expect(status).toBe(201);
    const res = out as Resp;
    expect(res).toMatchObject({ success: true, fileName: 'sample.ch', size: BINARY_BYTES.length, mode: 'binary', sha256: BINARY_SHA });
    expect(res.dataReferenceId).toMatch(/^DREF-\d+$/);
    expect(res.path?.startsWith('measurements/')).toBe(true);

    // The data-reference envelope handed to the RecordStore anchors the ORIGINAL bytes.
    expect(h.store.created.length).toBe(1);
    const env = h.store.created[0]!.envelope;
    expect(env.recordId).toBe(res.dataReferenceId);
    expect(env.payload['kind']).toBe('data-reference');
    expect(env.payload['contentHash']).toBe(BINARY_SHA);
    expect(env.payload['sizeBytes']).toBe(BINARY_BYTES.length);
    expect(env.payload['path']).toBe(res.path);

    // Bytes on disk under the scratch device root equal the original buffer byte-for-byte.
    expect(Buffer.compare(await readFile(join(h.deviceRoot, res.path!)), BINARY_BYTES)).toBe(0);
  });

  it('forces the device path for a VALID-UTF8 payload when binary: true is set', async () => {
    // Valid UTF-8 (round-trips) — only the explicit binary: true force clause keeps it on the
    // device/binary arm; deleting `|| request.body.binary === true` from the handler makes this RED.
    const h = harness();
    const forced = Buffer.from('ACQUISITION START\nwell,metric,value\nA1,ct,12.5\n', 'utf8');
    const { status, out } = await upload(h, { fileName: 'forced.ch', contentBase64: forced.toString('base64'), binary: true });
    expect(status).toBe(201);
    const res = out as Resp;
    expect(res.mode).toBe('binary');
    expect(res.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.sha256).toBe(createHash('sha256').update(forced).digest('hex'));
    expect(res.path?.startsWith('measurements/')).toBe(true);
    expect(h.store.created.length).toBe(1);
    expect(h.files.size).toBe(0); // no records/inbox/... file on the text arm
  });

  it('keeps a UTF-8 CSV upload on the git-inbox path with today\u2019s shape plus mode: text', async () => {
    const h = harness();
    const { status, out } = await upload(h, { fileName: 'plate.csv', contentBase64: CSV_BYTES.toString('base64'), runId: 'RUN-1' });
    expect(status).toBe(201);
    const res = out as Resp;
    expect(res.path).toMatch(/^records\/inbox\/measurements\/RUN-1\/.+-plate\.csv$/);
    expect(res).toMatchObject({ success: true, fileName: 'plate.csv', size: CSV_BYTES.length, mode: 'text' });
    // No binary-path fields leak onto the text response (absent, not undefined).
    expect('sha256' in (out as object)).toBe(false);
    expect('dataReferenceId' in (out as object)).toBe(false);
    // The inbox file content is the exact decoded text.
    expect(h.files.get(res.path!)).toBe(CSV_BYTES.toString('utf8'));
    expect(h.store.created.length).toBe(0);
  });

  it('refuses an empty upload with 400 EMPTY_FILE before anything is stored', async () => {
    const h = harness();
    // '====' is non-empty base64 that decodes to ZERO bytes (the gap EMPTY_FILE closes).
    const { status, out } = await upload(h, { fileName: 'empty.bin', contentBase64: '====' });
    expect(status).toBe(400);
    expect(out).toMatchObject({ error: 'EMPTY_FILE' });
    expect(h.store.created.length).toBe(0);
    expect(h.files.size).toBe(0);
    await expect(readFile(join(h.deviceRoot, 'measurements'))).rejects.toThrow();
  });

  it('refuses an oversize upload with 400 FILE_TOO_LARGE before anything is stored', async () => {
    const h = harness();
    const oversize = Buffer.alloc(18 * 1024 * 1024 + 1, 0x61);
    const { status, out } = await upload(h, { fileName: 'big.cdf', contentBase64: oversize.toString('base64') });
    expect(status).toBe(400);
    expect(out).toMatchObject({ error: 'FILE_TOO_LARGE' });
    expect(h.store.created.length).toBe(0);
    expect(h.files.size).toBe(0);
    await expect(readFile(join(h.deviceRoot, 'measurements'))).rejects.toThrow();
  });

  it('surfaces a typed StorageError as a named refusal carrying its code, never the generic message', async () => {
    // No device configured -> defaultDeviceId() throws StorageError('MISSING_CONFIG').
    const store = { created: [] as unknown[], list: async () => [], create: async (o: unknown) => ({ success: true, envelope: o }) };
    const repoAdapter = { fileExists: async () => false, createFile: async () => ({ success: true }) };
    const ctx = { storageService: new StorageService([]), store, repoAdapter } as unknown as AppContext;
    const handlers = createMeasurementHandlers(ctx);
    const reply = { statusCode: 200, status(code: number) { this.statusCode = code; return this; } };
    const out = await handlers.uploadRawMeasurementFile(
      { body: { fileName: 'sample.ch', contentBase64: BINARY_BYTES.toString('base64') } } as never,
      reply as never,
    );
    expect(reply.statusCode).toBe(400);
    const res = out as Resp;
    expect(res.error).toBe('STORAGE_MISSING_CONFIG');
    expect(res.message).toContain('storage device');
    expect(res.message).not.toBe('Failed to process uploaded file');
    expect((store as { created: unknown[] }).created.length).toBe(0);
  });

  it('a second upload of the same bytes creates a SECOND data-reference (same contentHash, new id)', async () => {
    const h = harness();
    const first = (await upload(h, { fileName: 'rep.ch', contentBase64: BINARY_BYTES.toString('base64') })) as { status: number; out: Resp };
    const second = (await upload(h, { fileName: 'rep.ch', contentBase64: BINARY_BYTES.toString('base64') })) as { status: number; out: Resp };
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.out.dataReferenceId).toMatch(/^DREF-\d+$/);
    expect(second.out.dataReferenceId).toMatch(/^DREF-\d+$/);
    expect(first.out.dataReferenceId).not.toBe(second.out.dataReferenceId);
    expect(h.store.created.length).toBe(2);
    expect(h.store.created[0]!.envelope.payload['contentHash']).toBe(BINARY_SHA);
    expect(h.store.created[1]!.envelope.payload['contentHash']).toBe(BINARY_SHA);
  });
});
