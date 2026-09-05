/**
 * Storage device types for computable-lab.
 *
 * Large raw instrument data must NOT live in git. A storage device is a
 * pointer to where raw data lives (S3 bucket / NAS, or a local mount such as
 * a USB stick plugged into the CL appliance). We keep a reference + content
 * hash in records; the bytes stay on the device.
 *
 * Mirror the repositories[] config precedent: devices are declared in
 * config.yaml (gitignored), and secrets are referenced by ENV VAR NAME, never
 * literal values (so redaction never has to guess).
 */

/** What kind of storage a device points at. */
export type StorageDeviceKind = 's3' | 'local-mount';

/**
 * Declarative description of one storage device, from config.yaml
 * (`storageDevices[]`). Fields are optional per-kind; the factory validates.
 */
export interface StorageDeviceConfig {
  /** Unique id, e.g. `labnas` or `usb-main`. */
  id: string;
  /** Human label shown in Settings / pickers. */
  label: string;
  kind: StorageDeviceKind;
  /** Whether this is the default device for new acquisitions. */
  default?: boolean;

  // ---- s3 ----
  entrypoint?: string;
  region?: string;
  bucket?: string;
  pathPrefix?: string;
  /** Env var NAME holding the access key (never a literal). */
  accessKeyEnv?: string;
  /** Env var NAME holding the secret key (never a literal). */
  secretKeyEnv?: string;

  // ---- local-mount ----
  /** Absolute path to the mounted root (e.g. `/mnt/usb0`). */
  mountPath?: string;
}

/** One entry returned by a provider `list`. */
export interface StorageEntry {
  name: string;
  /** Key/path relative to the device root (joinable for read/stat). */
  path: string;
  isDirectory: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
}

/** Stat result for a single key. */
export interface StorageStat {
  sizeBytes?: number;
  contentType?: string;
  modifiedAt?: string;
}

/** Write result: number of bytes written. */
export interface StorageWriteResult {
  sizeBytes: number;
}

/**
 * Provider abstraction over a storage device. `path` is always a key
 * RELATIVE to the device root. `read`/`write` use Node streams so large
 * files never have to sit in memory.
 */
export interface StorageProvider {
  readonly kind: StorageDeviceKind;
  list(path: string): Promise<StorageEntry[]>;
  stat(path: string): Promise<StorageStat>;
  read(path: string): Promise<NodeJS.ReadableStream>;
  write(path: string, stream: NodeJS.ReadableStream): Promise<StorageWriteResult>;
  delete(path: string): Promise<void>;
}

/** Typed, stable error codes for storage operations. */
export type StorageErrorCode =
  | 'NOT_FOUND'
  | 'UNSUPPORTED_KIND'
  | 'MISSING_CONFIG'
  | 'ACCESS_DENIED'
  | 'TRAVERSAL_BLOCKED'
  | 'IO_ERROR';

export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Assert a relative key stays within the device root (blocks `..` escapes). */
export function assertSafeRelativePath(path: string): void {
  if (typeof path !== 'string') {
    throw new StorageError('TRAVERSAL_BLOCKED', 'path must be a string');
  }
  if (path.length === 0) return; // empty string = device root
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts.some((p) => p === '..' || p === '.')) {
    throw new StorageError('TRAVERSAL_BLOCKED', `invalid relative path: ${path}`);
  }
}