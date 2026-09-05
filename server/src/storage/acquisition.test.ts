import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import { acquireDataReference } from './acquisition.js';

describe('acquireDataReference', () => {
  const mountDir = join(tmpdir(), 'cl-acquire-mount');
  const wsDir = resolve(tmpdir(), 'cl-acquire-ws');
  const payload = Buffer.from('time,intensity\n0.1,12.5\n0.2,14.0\n');

  let ctx: Awaited<ReturnType<typeof initializeApp>>;

  beforeAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
    await mkdir(join(mountDir, 'reads'), { recursive: true });
    await writeFile(join(mountDir, 'reads', 'trace.csv'), payload);
    await mkdir(wsDir, { recursive: true });
    await setupTestWorkspace(wsDir);
    await writeFile(
      join(wsDir, 'config.yaml'),
      [
        'server:',
        '  port: 3001',
        "  logLevel: 'info'",
        `  dataDir: '${join(wsDir, 'data')}'`,
        `  workspaceDir: '${join(wsDir, 'workspaces')}'`,
        "  cors: { enabled: true, origins: ['*'] }",
        "schemas: { source: 'bundled', bundledDir: './schema' }",
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
        `    mountPath: '${mountDir}'`,
      ].join('\n'),
    );
    ctx = await initializeApp(wsDir, {
      schemaDir: resolve(process.cwd(), '..', 'schema'),
      recordsDir: 'records',
      logLevel: 'silent',
    });
  }, 30000);

  afterAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
  });

  it('acquires a file into a data-reference record with the correct sha256', async () => {
    const { recordId, payload: ref } = await acquireDataReference(ctx, {
      deviceId: 'usb0',
      path: 'reads/trace.csv',
      dataKind: 'signal',
      format: 'csv',
      title: 'trace run',
    });
    expect(recordId).toMatch(/^DREF-/);
    expect(ref.contentHash).toBe(createHash('sha256').update(payload).digest('hex'));
    expect(ref.sizeBytes).toBe(payload.byteLength);
    expect(ref.dataKind).toBe('signal');
    expect(ref.storageDeviceId).toBe('usb0');
    expect(ref.path).toBe('reads/trace.csv');
  });

  it('does NOT write the raw bytes into the records directory', async () => {
    const recordsDir = join(wsDir, 'records');
    // Ensure the records dir exists before walking (it may not yet).
    const walk = async (dir: string): Promise<string[]> => {
      let out: string[] = [];
      try {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          if (e.isDirectory()) out.push(...(await walk(full)));
          else out.push(full);
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw err;
      }
      return out;
    };
    const files = await walk(recordsDir);
    // No file anywhere in records/ should contain the raw payload bytes.
    for (const f of files) {
      const content = await readFile(f, 'utf8').catch(() => '');
      expect(content.includes('time,intensity')).toBe(false);
    }
  });

  it('returns the data-reference by fetching it back from the store', async () => {
    const { recordId } = await acquireDataReference(ctx, {
      deviceId: 'usb0',
      path: 'reads/trace.csv',
      dataKind: 'table',
    });
    const env = await ctx.store.get(recordId);
    expect(env).not.toBeNull();
    expect((env!.payload as { kind: string }).kind).toBe('data-reference');
  });
});