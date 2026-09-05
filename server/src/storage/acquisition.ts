/**
 * acquisition — register a file that lives on an external storage device as a
 * `data-reference` record (the data-plane/control-plane boundary).
 *
 * "Acquire" reads a file's METADATA from a storage device (size + sha256 over
 * a stream) and records a pointer — never the bytes. The raw file stays on the
 * device; git holds the reference. Nothing here buffers the whole file in
 * memory; the hash is computed over a streaming read.
 */
import { createHash } from 'node:crypto';
import type { AppContext } from '../server.js';
import { StorageError } from './types.js';
import type { StorageProvider } from './types.js';

const DATA_REFERENCE_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml';

export type DataKind =
  | 'table'
  | 'signal'
  | 'signal-collection'
  | 'spatial-array'
  | 'image'
  | 'binary'
  | 'metric';

export interface AcquireInput {
  deviceId: string;
  path: string;
  /** Human-readable title for the resulting data-reference. */
  title?: string;
  dataKind: DataKind;
  format?: string;
  readerVersion?: string;
  acquisitionContext?: Record<string, unknown>;
  sourceRunRef?: { kind: 'record'; id: string; type: string; label?: string };
}

export interface DataReferencePayload {
  kind: 'data-reference';
  id: string;
  title: string;
  storageDeviceId: string;
  path: string;
  contentHash: string;
  sizeBytes: number;
  dataKind: DataKind;
  format?: string;
  readerVersion?: string;
  /** Allowed extra keys beyond the schema's acquisitionContext. */
  acquisitionContext?: Record<string, unknown>;
  sourceRunRef?: { kind: 'record'; id: string; type: string; label?: string };
  acquiredAt: string;
}

/**
 * Stream a file's bytes from a provider to compute its sha256 + size.
 * Never materializes the whole file in memory.
 */
export async function hashStream(stream: NodeJS.ReadableStream): Promise<{
  contentHash: string;
  sizeBytes: number;
}> {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    hash.update(chunk);
    size += chunk.byteLength;
  }
  return { contentHash: hash.digest('hex'), sizeBytes: size };
}

/** Map a file extension to a conservative default format label. */
export function formatForPath(path: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(path);
  return m ? (m[1] ?? 'bin').toLowerCase() : 'bin';
}

/**
 * Acquire a file from a storage device into a `data-reference` record.
 * Returns the created record payload (and recordId). The raw bytes are NOT
 * written into the git workspace.
 */
export async function acquireDataReference(
  ctx: AppContext,
  input: AcquireInput,
): Promise<{ recordId: string; payload: DataReferencePayload }> {
  const provider: StorageProvider = ctx.storageService.getProvider(input.deviceId);
  // stat for verification; then stream-read for the hash/size
  let stat;
  try {
    stat = await provider.stat(input.path);
  } catch (err) {
    if (err instanceof StorageError && err.code === 'NOT_FOUND') {
      throw new StorageError('NOT_FOUND', `file not found on ${input.deviceId}: ${input.path}`);
    }
    throw err;
  }

  const stream = await provider.read(input.path);
  const { contentHash, sizeBytes } = await hashStream(stream);

  // Prefer the reported size from the stream; fall back to stat.sizeBytes
  const effectiveSize = sizeBytes > 0 ? sizeBytes : (stat.sizeBytes ?? 0);

  const recordId = await nextDataReferenceId(ctx);
  const title = input.title ?? input.path;
  const payload: DataReferencePayload = {
    kind: 'data-reference',
    id: recordId,
    title,
    storageDeviceId: input.deviceId,
    path: input.path,
    contentHash,
    sizeBytes: effectiveSize,
    dataKind: input.dataKind,
    ...(input.format ? { format: input.format } : {}),
    ...(input.readerVersion ? { readerVersion: input.readerVersion } : {}),
    ...(input.acquisitionContext ? { acquisitionContext: input.acquisitionContext } : {}),
    ...(input.sourceRunRef ? { sourceRunRef: input.sourceRunRef } : {}),
    acquiredAt: new Date().toISOString(),
  };

  const result = await ctx.store.create({
    envelope: { recordId, schemaId: DATA_REFERENCE_SCHEMA_ID, payload },
    message: `Acquire data-reference ${recordId}`,
  });
  if (!result.success) {
    throw new Error(`Failed to create data-reference ${recordId}: ${result.error ?? 'unknown error'}`);
  }
  return { recordId, payload };
}

/** Mint the next DREF-##### id by scanning existing data-reference records. */
async function nextDataReferenceId(ctx: AppContext): Promise<string> {
  const prefix = 'DREF-';
  let max = 0;
  try {
    const envelopes = await ctx.store.list({ kind: 'data-reference', limit: 5000 });
    for (const env of envelopes) {
      const m = /^DREF-(\d+)$/.exec(env.recordId);
      if (m) {
        const n = Number.parseInt(m[1] ?? '0', 10);
        if (n > max) max = n;
      }
    }
  } catch {
    // list may throw if no records yet — treat as max 0
  }
  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}