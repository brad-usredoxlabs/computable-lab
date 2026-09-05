/**
 * LocalMountStorageProvider — a storage device that is a directory mounted on
 * the host filesystem (NAS mount, USB stick plugged into the appliance,
 * cloud-synced folder). Pure Node `fs`, no external SDK.
 *
 * `path` in every call is a key RELATIVE to the mount root. Traversal outside
 * the root is blocked (assertSafeRelativePath + resolved-path containment).
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  assertSafeRelativePath,
  StorageError,
  type StorageEntry,
  type StorageProvider,
  type StorageStat,
  type StorageWriteResult,
} from './types.js';

function simpleName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export class LocalMountStorageProvider implements StorageProvider {
  readonly kind = 'local-mount' as const;

  constructor(private readonly mountPath: string) {
    if (!mountPath || mountPath.trim().length === 0) {
      throw new StorageError(
        'MISSING_CONFIG',
        'local-mount storage device requires a mountPath',
      );
    }
    if (!isAbsolute(mountPath)) {
      throw new StorageError(
        'MISSING_CONFIG',
        `local-mount mountPath must be absolute: ${mountPath}`,
      );
    }
  }

  /** Resolve a relative key to an absolute path, enforcing root containment. */
  private resolvePath(path: string): string {
    assertSafeRelativePath(path);
    const root = resolve(this.mountPath);
    const abs = resolve(root, path);
    if (abs !== root && !abs.startsWith(root + sep)) {
      throw new StorageError('TRAVERSAL_BLOCKED', `path escapes mount root: ${path}`);
    }
    return abs;
  }

  async list(path: string): Promise<StorageEntry[]> {
    const abs = this.resolvePath(path);
    let names: string[];
    try {
      names = await readdir(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new StorageError('IO_ERROR', `failed to list ${path}: ${(err as Error).message}`);
    }
    names.sort();
    const entries: StorageEntry[] = [];
    for (const name of names) {
      const childAbs = join(abs, name);
      const childKey = path ? `${path}/${name}` : name;
      try {
        const s = await stat(childAbs);
        const entry: StorageEntry = {
          name,
          path: childKey,
          isDirectory: s.isDirectory(),
          ...(s.isFile() ? { sizeBytes: s.size } : {}),
          modifiedAt: s.mtime.toISOString(),
        };
        entries.push(entry);
      } catch {
        // unreadable entry — skip rather than fail the whole listing
      }
    }
    return entries;
  }

  async stat(path: string): Promise<StorageStat> {
    const abs = this.resolvePath(path);
    try {
      const s = await stat(abs);
      return {
        ...(s.isFile() ? { sizeBytes: s.size } : {}),
        modifiedAt: s.mtime.toISOString(),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageError('NOT_FOUND', `not found: ${path}`);
      }
      throw new StorageError('IO_ERROR', `stat failed for ${path}: ${(err as Error).message}`);
    }
  }

  async read(path: string): Promise<NodeJS.ReadableStream> {
    const abs = this.resolvePath(path);
    try {
      await stat(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageError('NOT_FOUND', `not found: ${path}`);
      }
      throw new StorageError('IO_ERROR', `read failed for ${path}: ${(err as Error).message}`);
    }
    return createReadStream(abs);
  }

  async write(path: string, stream: NodeJS.ReadableStream): Promise<StorageWriteResult> {
    const abs = this.resolvePath(path);
    await mkdir(dirname(abs), { recursive: true });
    await pipeline(stream as unknown as import('node:stream').Readable, createWriteStream(abs));
    const s = await stat(abs);
    return { sizeBytes: s.size };
  }

  async delete(path: string): Promise<void> {
    const abs = this.resolvePath(path);
    try {
      await rm(abs, { force: true, recursive: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new StorageError('IO_ERROR', `delete failed for ${path}: ${(err as Error).message}`);
    }
  }
}

/** Safe filename shorthand (used by tests / logs). */
export function basename(path: string): string {
  return simpleName(path);
}