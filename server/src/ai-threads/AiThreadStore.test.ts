import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AiThreadStore } from './AiThreadStore.js';

async function withTempStore<T>(
  fn: (store: AiThreadStore, root: string) => Promise<T>,
  overrides: Partial<ConstructorParameters<typeof AiThreadStore>[0]> = {},
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'ai-threads-'));
  try {
    const store = new AiThreadStore({ rootDir: root, ...overrides });
    return await fn(store, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('AiThreadStore', () => {
  it('returns an empty thread when no file exists yet', async () => {
    await withTempStore(async (store) => {
      const thread = await store.getThread('alice', 'browser', undefined, 'tid-1');
      expect(thread.endpoint).toBe('browser');
      expect(thread.userId).toBe('alice');
      expect(thread.messages).toEqual([]);
      expect(thread.mentions).toEqual([]);
    });
  });

  it('round-trips appended messages and dedupes mentions', async () => {
    await withTempStore(async (store) => {
      await store.append('alice', 'event-editor', {
        message: { role: 'user', content: 'hello' },
        mentions: [{ kind: 'material', ref: { recordId: 'mat-1' }, label: 'Tris' }],
      }, undefined, 'tid-1');
      await store.append('alice', 'event-editor', {
        message: { role: 'assistant', content: 'hi back' },
        mentions: [
          { kind: 'material', ref: { recordId: 'mat-1' }, label: 'Tris' }, // dupe
          { kind: 'labware', ref: { recordId: 'lab-1' } },
        ],
      }, undefined, 'tid-1');

      const thread = await store.getThread('alice', 'event-editor', undefined, 'tid-1');
      expect(thread.messages).toHaveLength(2);
      expect(thread.messages[0]).toMatchObject({ role: 'user', content: 'hello' });
      expect(thread.messages[1]).toMatchObject({ role: 'assistant', content: 'hi back' });
      expect(thread.messages[0]?.createdAt).toBeTruthy();
      expect(thread.mentions).toHaveLength(2);
    });
  });

  it('isolates threads per (user, endpoint)', async () => {
    await withTempStore(async (store) => {
      await store.append('alice', 'browser', {
        message: { role: 'user', content: 'A1' },
      }, undefined, 'tid-1');
      await store.append('bob', 'browser', {
        message: { role: 'user', content: 'B1' },
      }, undefined, 'tid-1');
      await store.append('alice', 'protocols', {
        message: { role: 'user', content: 'A2' },
      }, undefined, 'tid-1');

      const aliceBrowser = await store.getThread('alice', 'browser', undefined, 'tid-1');
      const bobBrowser = await store.getThread('bob', 'browser', undefined, 'tid-1');
      const aliceProtocols = await store.getThread('alice', 'protocols', undefined, 'tid-1');

      expect(aliceBrowser.messages[0]?.content).toBe('A1');
      expect(bobBrowser.messages[0]?.content).toBe('B1');
      expect(aliceProtocols.messages[0]?.content).toBe('A2');
    });
  });

  it('clear empties the live thread', async () => {
    await withTempStore(async (store) => {
      await store.append('alice', 'literature', {
        message: { role: 'user', content: 'foo' },
      }, undefined, 'tid-1');
      await store.clear('alice', 'literature', undefined, 'tid-1');
      const thread = await store.getThread('alice', 'literature', undefined, 'tid-1');
      expect(thread.messages).toEqual([]);
    });
  });

  it('rotates a snapshot once the live thread exceeds the threshold', async () => {
    await withTempStore(
      async (store, root) => {
        for (let i = 0; i < 5; i++) {
          await store.append('alice', 'browser', {
            message: { role: 'user', content: `m${i}` },
          }, undefined, 'live-thread');
        }
        const live = await store.getThread('alice', 'browser', undefined, 'live-thread');
        // Threshold 3: rotation fires after the 4th append (4 > 3) and keeps
        // the last 2; the 5th append re-grows to 3. So live ≤ threshold + 1.
        expect(live.messages.length).toBeLessThanOrEqual(4);
        // But it must be smaller than the total appended count — we rotated.
        expect(live.messages.length).toBeLessThan(5);
        // Snapshots live in the thread's OWN scope directory
        // ({user}/{endpoint}/{scope}/), never as a thread in the listing.
        const files = await readdir(join(root, 'alice', 'browser', '_'));
        expect(files.some((f) => f.includes('.snapshot.json'))).toBe(true);
        expect(await store.listThreads('alice', 'browser', undefined)).toHaveLength(1);
      },
      { snapshotThresholdMessages: 3, snapshotKeepTail: 2 },
    );
  });

  it('refuses path-traversal user ids', async () => {
    await withTempStore(async (store) => {
      await expect(store.getThread('../etc', 'browser', undefined, 'tid-1')).rejects.toThrow();
      await expect(
        store.append('a/b', 'browser', { message: { role: 'user', content: 'x' } }, undefined, 'tid-1'),
      ).rejects.toThrow();
    });
  });
});
