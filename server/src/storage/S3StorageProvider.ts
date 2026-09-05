/**
 * S3StorageProvider — a storage device backed by an S3-compatible object
 * store (AWS S3, MinIO, Ceph RGW, lab NAS with S3 API).
 *
 * The client is injected OR lazily built from the device config on first use
 * (dynamic import of @aws-sdk/client-s3). Keeping the SDK behind a lazy
 * dynamic import means:
 *   - local-mount-only installs pay zero startup cost,
 *   - the test suite injects a mock client and never touches the SDK.
 *
 * Keys are `pathPrefix/relativePath`. Secrets are read from env vars named by
 * the device config (accessKeyEnv / secretKeyEnv), never literals.
 */
import { Readable } from 'node:stream';
import {
  StorageError,
  assertSafeRelativePath,
  type StorageDeviceConfig,
  type StorageEntry,
  type StorageProvider,
  type StorageStat,
  type StorageWriteResult,
} from './types.js';

/** Minimal structural client shape — satisfies the real S3Client too. */
export interface S3ClientLike {
  listObjectsV2(params: Record<string, unknown>): Promise<{
    Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
  }>;
  headObject(params: Record<string, unknown>): Promise<{
    ContentLength?: number;
    ContentType?: string;
    LastModified?: Date;
  }>;
  getObject(params: Record<string, unknown>): Promise<{ Body?: unknown }>;
  putObject(params: Record<string, unknown>): Promise<unknown>;
  deleteObject(params: Record<string, unknown>): Promise<unknown>;
}

/** Split a key into its final name (after the last `/`). */
function keyName(key: string): string {
  const trimmed = key.replace(/\/+$/, '');
  const parts = trimmed.split('/');
  return parts[parts.length - 1] ?? trimmed;
}

export class S3StorageProvider implements StorageProvider {
  readonly kind = 's3' as const;
  private readonly bucket: string;
  private readonly pathPrefix: string;
  private clientPromise: Promise<S3ClientLike> | null = null;

  constructor(
    private readonly device: StorageDeviceConfig,
    private readonly client?: S3ClientLike,
  ) {
    if (!device.bucket || device.bucket.trim().length === 0) {
      throw new StorageError('MISSING_CONFIG', `s3 storage device ${device.id} requires a bucket`);
    }
    this.bucket = device.bucket.trim();
    this.pathPrefix = (device.pathPrefix ?? '').replace(/^\/+|\/+$/g, '');
  }

  /** Compute the object key for a relative path under the device prefix. */
  private keyFor(path: string): string {
    assertSafeRelativePath(path);
    const rel = path.replace(/^\/+/, '');
    return this.pathPrefix ? `${this.pathPrefix}/${rel}` : rel;
  }

  /** Resolve the client — injected one wins; else lazily build from env. */
  private async getClient(): Promise<S3ClientLike> {
    if (this.client) return this.client;
    if (!this.clientPromise) {
      this.clientPromise = this.buildClient().catch((err) => {
        this.clientPromise = null; // allow retry on next call
        throw err;
      });
    }
    return this.clientPromise;
  }

  private async buildClient(): Promise<S3ClientLike> {
    try {
      // Route the SDK import through `unknown`: we only need a loose
      // structural subset; TS2352 would otherwise reject the tighter SDK types.
      const sdk = (await import('@aws-sdk/client-s3')) as unknown as {
        S3Client: new (config: Record<string, unknown>) => { send(command: object): Promise<unknown> };
        ListObjectsV2Command: new (input: Record<string, unknown>) => object;
        HeadObjectCommand: new (input: Record<string, unknown>) => object;
        GetObjectCommand: new (input: Record<string, unknown>) => object;
        PutObjectCommand: new (input: Record<string, unknown>) => object;
        DeleteObjectCommand: new (input: Record<string, unknown>) => object;
      };
      const credentials = this.awsCredentials();
      const config: Record<string, unknown> = {
        region: this.device.region ?? 'us-east-1',
        ...(this.device.entrypoint ? { endpoint: this.device.entrypoint, forcePathStyle: true } : {}),
        ...(credentials ? { credentials } : {}),
      };
      const client = new sdk.S3Client(config);
      return {
        async listObjectsV2(params) {
          return (await client.send(new sdk.ListObjectsV2Command(params))) as {
            Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
          };
        },
        async headObject(params) {
          return (await client.send(new sdk.HeadObjectCommand(params))) as {
            ContentLength?: number;
            ContentType?: string;
            LastModified?: Date;
          };
        },
        async getObject(params) {
          return (await client.send(new sdk.GetObjectCommand(params))) as { Body?: unknown };
        },
        async putObject(params) {
          return client.send(new sdk.PutObjectCommand(params));
        },
        async deleteObject(params) {
          return client.send(new sdk.DeleteObjectCommand(params));
        },
      };
    } catch (err) {
      throw new StorageError(
        'IO_ERROR',
        `failed to initialize s3 client for ${this.device.id}: ${(err as Error).message}`,
      );
    }
  }

  private awsCredentials(): { accessKeyId: string; secretAccessKey: string } | undefined {
    const accessKeyId = this.device.accessKeyEnv ? process.env[this.device.accessKeyEnv] : undefined;
    const secretAccessKey = this.device.secretKeyEnv ? process.env[this.device.secretKeyEnv] : undefined;
    if (accessKeyId && secretAccessKey) return { accessKeyId, secretAccessKey };
    return undefined; // fall back to default credential chain
  }

  async list(path: string): Promise<StorageEntry[]> {
    const client = await this.getClient();
    const prefix = this.keyFor(path ? `${path}/` : '').replace(/\/$/, '');
    // Use at least the exact prefix for the directory; object store has no dirs
    const scanPrefix = prefix ? `${prefix}/` : '';
    try {
      const result = await client.listObjectsV2({
        Bucket: this.bucket,
        Prefix: scanPrefix,
        Delimiter: '/',
      });
      const contents = result.Contents ?? [];
      const entries: StorageEntry[] = [];
      for (const c of contents) {
        const key = c.Key ?? '';
        if (!key) continue;
        const name = keyName(key);
        if (!name) continue;
        if (path && key === prefix) continue; // skip the "directory" object if present
        entries.push({
          name,
          path: key,
          isDirectory: false,
          ...(typeof c.Size === 'number' ? { sizeBytes: c.Size } : {}),
          ...(c.LastModified ? { modifiedAt: c.LastModified.toISOString() } : {}),
        });
      }
      // Note: a full dir-listing with CommonPrefixes would require pagination;
      // Slice A treats objects as files (isDirectory always false).
      return entries;
    } catch (err) {
      throw new StorageError('IO_ERROR', `s3 list failed for ${path}: ${(err as Error).message}`);
    }
  }

  async stat(path: string): Promise<StorageStat> {
    const client = await this.getClient();
    try {
      const result = await client.headObject({ Bucket: this.bucket, Key: this.keyFor(path) });
      return {
        ...(typeof result.ContentLength === 'number' ? { sizeBytes: result.ContentLength } : {}),
        ...(result.ContentType ? { contentType: result.ContentType } : {}),
        ...(result.LastModified ? { modifiedAt: result.LastModified.toISOString() } : {}),
      };
    } catch (err) {
      const code = (err as { name?: string }).name;
      if (code === 'NotFound' || code === 'NoSuchKey') {
        throw new StorageError('NOT_FOUND', `not found: ${path}`);
      }
      throw new StorageError('IO_ERROR', `s3 stat failed for ${path}: ${(err as Error).message}`);
    }
  }

  async read(path: string): Promise<NodeJS.ReadableStream> {
    const client = await this.getClient();
    try {
      const result = await client.getObject({ Bucket: this.bucket, Key: this.keyFor(path) });
      const body = result.Body;
      if (body instanceof Readable) return body as NodeJS.ReadableStream;
      if (body && typeof (body as { pipe?: unknown }).pipe === 'function') {
        return body as unknown as NodeJS.ReadableStream;
      }
      // Some runtimes give a ReadableStream; bridge it into a Node stream.
      const web = body as ReadableStream<Uint8Array>;
      return Readable.fromWeb(web as never);
    } catch (err) {
      const code = (err as { name?: string }).name;
      if (code === 'NotFound' || code === 'NoSuchKey') {
        throw new StorageError('NOT_FOUND', `not found: ${path}`);
      }
      throw new StorageError('IO_ERROR', `s3 read failed for ${path}: ${(err as Error).message}`);
    }
  }

  async write(path: string, stream: NodeJS.ReadableStream): Promise<StorageWriteResult> {
    const client = await this.getClient();
    try {
      const nodeStream = stream as unknown as Readable;
      await client.putObject({
        Bucket: this.bucket,
        Key: this.keyFor(path),
        Body: nodeStream,
      });
      const s = await this.stat(path);
      return { sizeBytes: s.sizeBytes ?? 0 };
    } catch (err) {
      throw new StorageError('IO_ERROR', `s3 write failed for ${path}: ${(err as Error).message}`);
    }
  }

  async delete(path: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.deleteObject({ Bucket: this.bucket, Key: this.keyFor(path) });
    } catch (err) {
      throw new StorageError('IO_ERROR', `s3 delete failed for ${path}: ${(err as Error).message}`);
    }
  }
}

/** Production factory (wired into createStorageProvider). */
export function createS3StorageProvider(device: StorageDeviceConfig): StorageProvider {
  return new S3StorageProvider(device);
}