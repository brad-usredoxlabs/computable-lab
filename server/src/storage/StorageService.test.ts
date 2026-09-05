import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { StorageError } from './types.js';
import { createStorageProvider } from './createStorageProvider.js';
import { StorageService } from './StorageService.js';

describe('createStorageProvider', () => {
  let mountDir: string;

  beforeEach(async () => {
    mountDir = await mkdtemp(join(tmpdir(), 'cl-storage-mount-'));
  });

  afterEach(async () => {
    await rm(mountDir, { recursive: true, force: true });
  });

  it('returns a LocalMount provider from a local-mount config', () => {
    const provider = createStorageProvider({
      id: 'usb0',
      label: 'USB main',
      kind: 'local-mount',
      mountPath: mountDir,
    });
    expect(provider.kind).toBe('local-mount');
  });

  it('writes then reads a file through the provider', async () => {
    const provider = createStorageProvider({
      id: 'usb0',
      label: 'USB',
      kind: 'local-mount',
      mountPath: mountDir,
    });
    const payload = Buffer.from('well,value\nA1,42\nA2,7\n');
    const { sizeBytes } = await provider.write(
      'plate-1.csv',
      Readable.from(payload),
    );
    expect(sizeBytes).toBe(payload.byteLength);

    const onDisk = await readFile(join(mountDir, 'plate-1.csv'));
    expect(onDisk.toString('utf8')).toContain('A1,42');

    const listed = await provider.list('');
    expect(listed.some((e) => e.name === 'plate-1.csv')).toBe(true);
  });

  it('lists subdirectories', async () => {
    await mkdir(join(mountDir, 'reads'), { recursive: true });
    await writeFile(join(mountDir, 'reads', 'f1.fcs'), 'x');
    const provider = createStorageProvider({
      id: 'usb0',
      label: 'USB',
      kind: 'local-mount',
      mountPath: mountDir,
    });
    const entries = await provider.list('reads');
    expect(entries.map((e) => e.name)).toEqual(['f1.fcs']);
    expect(entries[0].isDirectory).toBe(false);
  });

  it('blocks path traversal outside the mount root', async () => {
    const provider = createStorageProvider({
      id: 'usb0',
      label: 'USB',
      kind: 'local-mount',
      mountPath: mountDir,
    });
    await expect(provider.read('../secret')).rejects.toBeInstanceOf(StorageError);
  });

  it('throws UNSUPPORTED_KIND for an unknown kind', () => {
    expect(() =>
      createStorageProvider({
        id: 'x',
        label: 'X',
        kind: 'unknown' as never,
      }),
    ).toThrow(StorageError);
  });
});

describe('StorageService', () => {
  let mountDir: string;

  beforeEach(async () => {
    mountDir = await mkdtemp(join(tmpdir(), 'cl-storage-service-'));
  });

  afterEach(async () => {
    await rm(mountDir, { recursive: true, force: true });
  });

  it('registers a provider per device and exposes devices', () => {
    const service = new StorageService([
      { id: 'usb0', label: 'USB A', kind: 'local-mount', mountPath: mountDir },
      { id: 'nas0', label: 'NAS', kind: 'local-mount', mountPath: mountDir },
    ]);
    expect(service.listDevices().map((d) => d.id)).toEqual(['usb0', 'nas0']);
    expect(service.has('usb0')).toBe(true);
    expect(service.has('missing')).toBe(false);
  });

  it('browses a device path', async () => {
    await writeFile(join(mountDir, 'a.csv'), 'a');
    const service = new StorageService([
      { id: 'usb0', label: 'USB A', kind: 'local-mount', mountPath: mountDir },
    ]);
    const entries = await service.browse('usb0', '');
    expect(entries.map((e) => e.name)).toEqual(['a.csv']);
  });

  it('throws NOT_FOUND for an unknown device', async () => {
    const service = new StorageService([]);
    await expect(service.browse('ghost', '')).rejects.toBeInstanceOf(StorageError);
  });
});