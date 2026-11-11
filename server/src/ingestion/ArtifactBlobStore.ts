/**
 * ArtifactBlobStore — writes ingestion artifact bytes through the configured
 * storage device provider. Every write creates a data-reference record so the
 * bytes are findable from git without scanning the device.
 *
 * The legacy filesystem path is preserved in LegacyArtifactBlobStore for reading
 * pre-existing on-disk blobs (do NOT migrate or delete them). Production code
 * constructs ArtifactBlobStore with a provider + recorder.
 */
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StorageProvider } from '../storage/types.js';
import type { RecordStore } from '../store/types.js';

const DATA_REF_SCHEMA = 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml';

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact.bin';
}

function formatForPath(path: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(path);
  return m ? m[1]!.toLowerCase() : 'bin';
}

/** Callback that persists a data-reference record after bytes are written. */
export interface ArtifactBlobStoreRecorder {
  (input: {
    artifactId: string;
    deviceId: string;
    path: string;
    contentHash: string;
    sizeBytes: number;
    fileName: string;
  }): Promise<{ drefId: string }>;
}

export interface ArtifactBlobStoreResult {
  /** Device-relative path (no leading /, no ..) */
  storedPath: string;
  /** sha256 hex digest */
  sha256: string;
  /** Byte length */
  sizeBytes: number;
  /** Data-reference record id (e.g. DREF-000001) */
  drefId: string;
}

export class ArtifactBlobStore {
  constructor(
    private readonly provider: StorageProvider,
    private readonly deviceId: string,
    private readonly prefix: string,
    private readonly recorder: ArtifactBlobStoreRecorder,
  ) {}

  async save(args: {
    artifactId: string;
    fileName?: string;
    contentBase64: string;
  }): Promise<ArtifactBlobStoreResult> {
    const fileName = safeName(args.fileName ?? `${args.artifactId}.bin`);
    const storedPath = join(this.prefix, args.artifactId, fileName);
    const buffer = Buffer.from(args.contentBase64, 'base64');
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    // Write bytes to the storage device — NOT into the worktree
    await this.provider.write(storedPath, Readable.from(buffer));

    // Create data-reference record so the bytes are findable from git
    const { drefId } = await this.recorder({
      artifactId: args.artifactId,
      deviceId: this.deviceId,
      path: storedPath,
      contentHash: sha256,
      sizeBytes: buffer.byteLength,
      fileName,
    });

    return { storedPath, sha256, sizeBytes: buffer.byteLength, drefId };
  }

  async loadBase64(storedPath: string): Promise<string> {
    const stream = await this.provider.read(storedPath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('base64');
  }
}

/**
 * Legacy filesystem-based blob store — kept for backward compatibility with
 * pre-existing on-disk blobs. NOT used in production.
 */
export class LegacyArtifactBlobStore {
  constructor(
    private readonly workspaceRoot: string,
    private readonly storageRootRelative: string,
  ) {}

  private absolutePath(relativePath: string): string {
    return join(this.workspaceRoot, relativePath);
  }

  async save(args: {
    artifactId: string;
    fileName?: string;
    contentBase64: string;
  }): Promise<{ storedPath: string; sha256: string; sizeBytes: number }> {
    const fileName = safeName(args.fileName ?? `${args.artifactId}.bin`);
    const storedPath = join(this.storageRootRelative, args.artifactId, fileName);
    const absolutePath = this.absolutePath(storedPath);
    const buffer = Buffer.from(args.contentBase64, 'base64');
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
    return { storedPath, sha256: createHash('sha256').update(buffer).digest('hex'), sizeBytes: buffer.byteLength };
  }

  async loadBase64(storedPath: string): Promise<string> {
    const buffer = await readFile(this.absolutePath(storedPath));
    return buffer.toString('base64');
  }
}

/**
 * Factory: creates an ArtifactBlobStoreRecorder backed by a RecordStore.
 * Picks the recorder approach over ctx.store because it keeps ArtifactBlobStore
 * decoupled from the store implementation, enables clean testing, and follows
 * the existing pattern in artifactPromotion.ts.
 */
export function createArtifactBlobStoreRecorder(store: RecordStore): ArtifactBlobStoreRecorder {
  return async (input) => {
    // Generate next DREF-##### ID by scanning existing data-references
    const existing = await store.list({ kind: 'data-reference', limit: 5000 });
    let max = 0;
    for (const env of existing) {
      const m = /^DREF-(\d+)$/.exec(env.recordId);
      if (m) {
        const n = Number.parseInt(m[1] ?? '0', 10);
        if (n > max) max = n;
      }
    }
    const drefId = `DREF-${String(max + 1).padStart(6, '0')}`;

    // Build payload — conditionals for optional fields (exactOptionalPropertyTypes)
    const format = formatForPath(input.fileName);
    const drefPayload: Record<string, unknown> = {
      kind: 'data-reference',
      id: drefId,
      title: input.fileName || input.artifactId,
      storageDeviceId: input.deviceId,
      path: input.path,
      contentHash: input.contentHash,
      sizeBytes: input.sizeBytes,
      dataKind: 'binary',
      ...(format ? { format } : {}),
      acquiredAt: new Date().toISOString(),
    };

    const result = await store.create({
      envelope: { recordId: drefId, schemaId: DATA_REF_SCHEMA, payload: drefPayload },
      message: `Store ingestion artifact ${input.artifactId} -> ${drefId}`,
    });
    if (!result.success) {
      throw new Error(`Failed to create data-reference ${drefId}: ${result.error ?? 'unknown'}`);
    }
    return { drefId };
  };
}
