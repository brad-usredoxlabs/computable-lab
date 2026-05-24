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
      const thread = await store.getThread('alice', 'browser');
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
      });
      await store.append('alice', 'event-editor', {
        message: { role: 'assistant', content: 'hi back' },
        mentions: [
          { kind: 'material', ref: { recordId: 'mat-1' }, label: 'Tris' }, // dupe
          { kind: 'labware', ref: { recordId: 'lab-1' } },
        ],
      });

      const thread = await store.getThread('alice', 'event-editor');
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
      });
      await store.append('bob', 'browser', {
        message: { role: 'user', content: 'B1' },
      });
      await store.append('alice', 'protocols', {
        message: { role: 'user', content: 'A2' },
      });

      const aliceBrowser = await store.getThread('alice', 'browser');
      const bobBrowser = await store.getThread('bob', 'browser');
      const aliceProtocols = await store.getThread('alice', 'protocols');

      expect(aliceBrowser.messages[0]?.content).toBe('A1');
      expect(bobBrowser.messages[0]?.content).toBe('B1');
      expect(aliceProtocols.messages[0]?.content).toBe('A2');
    });
  });

  it('clear empties the live thread', async () => {
    await withTempStore(async (store) => {
      await store.append('alice', 'literature', {
        message: { role: 'user', content: 'foo' },
      });
      await store.clear('alice', 'literature');
      const thread = await store.getThread('alice', 'literature');
      expect(thread.messages).toEqual([]);
    });
  });

  it('rotates a snapshot once the live thread exceeds the threshold', async () => {
    await withTempStore(
      async (store, root) => {
        for (let i = 0; i < 5; i++) {
          await store.append('alice', 'browser', {
            message: { role: 'user', content: `m${i}` },
          });
        }
        const live = await store.getThread('alice', 'browser');
        // Threshold 3: rotation fires after the 4th append (4 > 3) and keeps
        // the last 2; the 5th append re-grows to 3. So live ≤ threshold + 1.
        expect(live.messages.length).toBeLessThanOrEqual(4);
        // But it must be smaller than the total appended count — we rotated.
        expect(live.messages.length).toBeLessThan(5);
        const files = await readdir(join(root, 'alice'));
        expect(files.some((f) => f.includes('.snapshot.json'))).toBe(true);
      },
      { snapshotThresholdMessages: 3, snapshotKeepTail: 2 },
    );
  });

  it('refuses path-traversal user ids', async () => {
    await withTempStore(async (store) => {
      await expect(store.getThread('../etc', 'browser')).rejects.toThrow();
      await expect(
        store.append('a/b', 'browser', { message: { role: 'user', content: 'x' } }),
      ).rejects.toThrow();
    });
  });
});
