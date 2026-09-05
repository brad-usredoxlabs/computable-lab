import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../../server.js';
import { setupTestWorkspace } from '../../test/setupApp.js';

describe('StorageHandlers browse (integration, local-mount via config)', () => {
  const mountDir = join(tmpdir(), 'cl-storage-handlers-mount');
  const wsDir = resolve(tmpdir(), 'cl-storage-handlers-ws');

  beforeAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
    await mkdir(join(mountDir, 'reads'), { recursive: true });
    await writeFile(join(mountDir, 'reads', 'f1.csv'), 'a,b\n1,2\n');
    await writeFile(join(mountDir, 'top.csv'), 'x\n');
    await mkdir(wsDir, { recursive: true });
    // minimal schema structure initializeApp requires
    await setupTestWorkspace(wsDir);
    // config.yaml declaring a local-mount storage device
    await writeFile(
      join(wsDir, 'config.yaml'),
      [
        'server:',
        '  port: 3001',
        "  logLevel: 'info'",
        "  dataDir: '" + join(wsDir, 'data') + "'",
        "  workspaceDir: '" + join(wsDir, 'workspaces') + "'",
        "  cors: { enabled: true, origins: ['*'] }",
        'schemas:',
        "  source: 'bundled'",
        "  bundledDir: './schema'",
        'repositories:',
        '  - id: main',
        '    default: true',
        "    mode: 'embedded-git'",
        "    git: { url: '', branch: 'main', auth: { type: 'none' } }",
        "    namespace: { baseUri: 'http://localhost:3001/records/', prefix: 'local' }",
        "    jsonld: { context: 'default' }",
        "    sync: { mode: 'manual', autoCommit: true, autoPush: false }",
        "    records: { directory: 'records' }",
        'storageDevices:',
        '  - id: usb0',
        "    label: 'USB test'",
        "    kind: 'local-mount'",
        "    mountPath: '" + mountDir + "'",
      ].join('\n'),
    );
  });

  afterAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
  });

  it('loads the device from config and browses its files', async () => {
    const ctx = await initializeApp(wsDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
    expect(ctx.storageService.listDevices().map((d) => d.id)).toEqual(['usb0']);
    expect(ctx.storageService.has('usb0')).toBe(true);

    const entries = await ctx.storageService.browse('usb0', 'reads');
    expect(entries.map((e) => e.name)).toEqual(['f1.csv']);

    const root = await ctx.storageService.browse('usb0', '');
    const names = root.map((e) => e.name);
    expect(names).toContain('reads');
  });
});