/**
 * L2-THREAD-SCOPED-1 — thread-scoped store contract (RED-first).
 *
 * A thread is identified by (userId, endpoint, scope, threadId). `scope` is an
 * optional sanitized path segment: surfaces with an instance identity send it
 * (deck surface: the loaded event-graph recordId); surfaces without one are
 * placed under the reserved segment "_" (the store constant, not a per-surface
 * literal). File layout: var/ai-threads/{user}/{endpoint}/{scope}/{threadId}.json.
 *
 * NO-FALLBACK RULE (binding): an absent, malformed, or unknown threadId yields a
 * FRESH EMPTY thread — the store NEVER reads another thread of the same
 * (user, endpoint): not the legacy flat {user}/{endpoint}.json, not a sibling
 * threadId, not "most recently updated". Absent/malformed scope => "_".
 */
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AiThreadStore } from './AiThreadStore.js';

async function withTempStore<T>(
  fn: (store: AiThreadStore, root: string) => Promise<T>,
  overrides: Partial<ConstructorParameters<typeof AiThreadStore>[0]> = {},
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'ai-threads-threaded-'));
  try {
    const store = new AiThreadStore({ rootDir: root, ...overrides });
    return await fn(store, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('AiThreadStore — thread-scoped key (L2-THREAD-SCOPED-1)', () => {
  it('two threadIds for the same (user, endpoint) yield isolated transcripts', async () => {
    await withTempStore(async (store) => {
      // The §7 RED-first pin: a message posted to one threadId never appears in
      // the other's read — even for the same user on the same surface.
      await store.append('alice', 'browser', { message: { role: 'user', content: 'tab-A msg' } }, 'EVG-a', 'thread-1');
      await store.append('alice', 'browser', { message: { role: 'user', content: 'tab-B msg' } }, 'EVG-a', 'thread-2');

      const t1 = await store.getThread('alice', 'browser', 'EVG-a', 'thread-1');
      const t2 = await store.getThread('alice', 'browser', 'EVG-a', 'thread-2');
      expect(t1.messages.map((m) => m.content)).toEqual(['tab-A msg']);
      expect(t2.messages.map((m) => m.content)).toEqual(['tab-B msg']);
    });
  });

  it('absent threadId creates a FRESH empty thread and never falls back to another thread', async () => {
    await withTempStore(async (store) => {
      // Populate TWO threads of the same (user, endpoint, scope).
      await store.append('alice', 'event-editor', { message: { role: 'user', content: 'sibling-1' } }, 'EVG-x', 'sibling-1');
      await store.append('alice', 'event-editor', { message: { role: 'user', content: 'sibling-2' } }, 'EVG-x', 'sibling-2');

      // NO-FALLBACK: an unknown threadId must NOT return either sibling's
      // messages (not the legacy flat file, not a sibling, not "most recently
      // updated") — it is a fresh EMPTY thread.
      const fresh = await store.getThread('alice', 'event-editor', 'EVG-x', 'never-seen-thread');
      expect(fresh.messages).toEqual([]);
      expect(fresh.mentions).toEqual([]);

      // And appending to that fresh id stays isolated from the siblings.
      await store.append('alice', 'event-editor', { message: { role: 'user', content: 'fresh-post' } }, 'EVG-x', 'never-seen-thread');
      const freshAfter = await store.getThread('alice', 'event-editor', 'EVG-x', 'never-seen-thread');
      expect(freshAfter.messages.map((m) => m.content)).toEqual(['fresh-post']);
      const s1 = await store.getThread('alice', 'event-editor', 'EVG-x', 'sibling-1');
      expect(s1.messages.map((m) => m.content)).toEqual(['sibling-1']);
    });
  });

  it('the legacy flat {user}/{endpoint}.json is NOT read by the thread-scoped path', async () => {
    await withTempStore(async (store, root) => {
      // Legacy flat file with messages (the pre-thread-scoped layout) —
      // written directly to disk: the new store NEVER produces or reads it.
      const legacyPath = join(root, 'alice', 'browser.json');
      await mkdir(dirname(legacyPath), { recursive: true });
      await writeFile(
        legacyPath,
        JSON.stringify({
          endpoint: 'browser',
          userId: 'alice',
          messages: [{ role: 'user', content: 'legacy-flat-msg', createdAt: '2026-01-01T00:00:00.000Z' }],
          mentions: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        'utf8',
      );

      // A thread-scoped read of the SAME (user, endpoint) must NOT see it.
      const fresh = await store.getThread('alice', 'browser', 'EVG-z', 'tid-9');
      expect(fresh.messages).toEqual([]);
      // The legacy flat file exists on disk but is NOT a thread in the new
      // namespace: nothing has been posted under (EVG-z, tid-9), and the scoped
      // listing must be empty — the flat file never surfaces as a thread.
      const listed = await store.listThreads('alice', 'browser', 'EVG-z');
      expect(listed).toEqual([]);
      expect(await stat(legacyPath).then((s) => s.isFile())).toBe(true);
    });
  });

  it('scope isolates transcripts: same (user, endpoint, threadId-key), different scope', async () => {
    await withTempStore(async (store) => {
      // (amendment A-1 acceptance (4)): a message posted with scope=EVG-a never
      // appears in the GET with scope=EVG-b nor with no scope.
      await store.append('alice', 'event-editor', { message: { role: 'user', content: 'deck-a turn' } }, 'EVG-a', 'thread-1');
      await store.append('alice', 'event-editor', { message: { role: 'user', content: 'deck-b turn' } }, 'EVG-b', 'thread-1');

      const a = await store.getThread('alice', 'event-editor', 'EVG-a', 'thread-1');
      const b = await store.getThread('alice', 'event-editor', 'EVG-b', 'thread-1');
      const noscope = await store.getThread('alice', 'event-editor', undefined, 'thread-1');
      expect(a.messages.map((m) => m.content)).toEqual(['deck-a turn']);
      expect(b.messages.map((m) => m.content)).toEqual(['deck-b turn']);
      expect(noscope.messages.map((m) => m.content)).toEqual([]);
    });
  });

  it('absent scope maps to the reserved "_" segment; never reads another scope\'s file', async () => {
    await withTempStore(async (store, root) => {
      await store.append('alice', 'event-editor', { message: { role: 'user', content: 'scoped-turn' } }, 'EVG-a', 't-1');

      // No scope => "_" scope: fresh, isolated.
      const underscore = await store.getThread('alice', 'event-editor', undefined, 't-1');
      expect(underscore.messages).toEqual([]);

      // Thread-scoped writes without a scope land under {user}/{endpoint}/_/.
      await store.append('alice', 'event-editor', { message: { role: 'user', content: 'underscore-turn' } }, undefined, 't-1');
      const underscoreAfter = await store.getThread('alice', 'event-editor', undefined, 't-1');
      expect(underscoreAfter.messages.map((m) => m.content)).toEqual(['underscore-turn']);
      // The file layout pins the directory: {user}/{endpoint}/{scope}/{threadId}.json.
      expect(await readdir(join(root, 'alice', 'event-editor', '_'))).toContain('t-1.json');
      expect(await readdir(join(root, 'alice', 'event-editor', 'EVG-a'))).toContain('t-1.json');
      // The EVG-a thread is untouched by the "_" traffic.
      const a = await store.getThread('alice', 'event-editor', 'EVG-a', 't-1');
      expect(a.messages.map((m) => m.content)).toEqual(['scoped-turn']);
    });
  });

  it('clear() empties ONLY the given (scope, threadId) thread — never the whole surface', async () => {
    await withTempStore(async (store) => {
      await store.append('alice', 'literature', { message: { role: 'user', content: 'to-promote' } }, undefined, 'promote-1');
      await store.append('alice', 'literature', { message: { role: 'user', content: 'keep-me' } }, undefined, 'other-1');

      await store.clear('alice', 'literature', undefined, 'promote-1');

      const cleared = await store.getThread('alice', 'literature', undefined, 'promote-1');
      const kept = await store.getThread('alice', 'literature', undefined, 'other-1');
      expect(cleared.messages).toEqual([]);
      expect(kept.messages.map((m) => m.content)).toEqual(['keep-me']);
    });
  });

  it('listThreads() returns the user\'s threads for (endpoint, scope) only — no snapshots, no other scopes, no other users', async () => {
    await withTempStore(async (store, root) => {
      await store.append('alice', 'browser', { message: { role: 'user', content: 'first in A' } }, 'EVG-a', 'tid-A');
      await store.append('alice', 'browser', { message: { role: 'assistant', content: 'a reply' } }, 'EVG-a', 'tid-A');
      await store.append('alice', 'browser', { message: { role: 'user', content: 'B thread' } }, 'EVG-a', 'tid-B');
      await store.append('alice', 'browser', { message: { role: 'user', content: 'scope-b msg' } }, 'EVG-b', 'tid-A');
      await store.append('bob', 'browser', { message: { role: 'user', content: 'bob msg' } }, 'EVG-a', 'tid-A');

      const listed = await store.listThreads('alice', 'browser', 'EVG-a');
      const byId = Object.fromEntries(listed.map((t) => [t.threadId, t]));
      // Exactly the two alice/EVG-a threads — no EVG-b, no bob, no legacy flat file.
      expect(Object.keys(byId).sort()).toEqual(['tid-A', 'tid-B']);
      // Title = first USER message content, trimmed (the list is pure store data).
      expect(byId['tid-A']?.title).toBe('first in A');
      expect(byId['tid-B']?.title).toBe('B thread');
      expect(byId['tid-A']?.messageCount).toBe(2);
      // The list is scoped: a request for EVG-b sees only its own thread.
      const listedB = await store.listThreads('alice', 'browser', 'EVG-b');
      expect(listedB.map((t) => t.threadId)).toEqual(['tid-A']);
      expect(listedB[0]?.title).toBe('scope-b msg');

      // Snapshots must NEVER appear as threads: rotate a snapshot into the
      // thread's OWN scope directory and confirm the listing is unchanged.
      for (let i = 0; i < 4; i++) {
        await store.append('alice', 'browser', { message: { role: 'user', content: `grow-${i}` } }, 'EVG-a', 'tid-C');
      }
      const scopeFiles = await readdir(join(root, 'alice', 'browser', 'EVG-a'));
      expect(scopeFiles.some((f) => f.includes('.snapshot.json'))).toBe(true);
      const afterSnapshot = await store.listThreads('alice', 'browser', 'EVG-a');
      expect(afterSnapshot.map((t) => t.threadId).sort()).toEqual(['tid-A', 'tid-B', 'tid-C']);

      // Title truncation (reviewer bait #4): one named constant, applied
      // generically — a 90-char first user message truncates to 60 + ellipsis.
      const longContent = 'x'.repeat(90);
      await store.append('alice', 'browser', { message: { role: 'user', content: longContent } }, 'EVG-a', 'tid-long');
      const listedLong = await store.listThreads('alice', 'browser', 'EVG-a');
      const longRow = listedLong.find((t) => t.threadId === 'tid-long');
      expect(longRow?.title).toBe('x'.repeat(60) + '…');
      expect(longRow?.title?.length).toBe(61);
    },
      { snapshotThresholdMessages: 3, snapshotKeepTail: 2 },
    );
  }, { timeout: 30_000 });

  it('threadIds are sanitized (traversal refused); malformed ids never resolve to another thread', async () => {
    await withTempStore(async (store) => {
      await expect(
        store.append('alice', 'browser', { message: { role: 'user', content: 'x' } }, 'EVG-a', '../etc'),
      ).rejects.toThrow();
      await expect(store.getThread('alice', 'browser', 'EVG-a', '../../escape')).rejects.toThrow();
      await expect(store.getThread('alice', 'browser', 'EVG-a', '')).rejects.toThrow();
      // The reserved "_" segment is a VALID scope (sanitize-safe), so a real
      // client minting under "_" never trips the alphabet guard.
      const underscore = await store.getThread('alice', 'browser', '_', 'tid-1');
      expect(underscore.messages).toEqual([]);
    });
  });

  it('D2: dots-ONLY segments ("." / "..") are refused — scope can never escape to the legacy flat file', async () => {
    await withTempStore(async (store, root) => {
      // Plant a LEGACY flat file the escape would otherwise contaminate/read.
      await mkdir(join(root, 'alice'), { recursive: true });
      await writeFile(
        join(root, 'alice', 'browser.json'),
        JSON.stringify({
          endpoint: 'browser',
          userId: 'alice',
          messages: [{ role: 'user', content: 'LEGACY CONTAMINATION', createdAt: '2026-10-28T00:00:00.000Z' }],
          mentions: [],
          updatedAt: '2026-10-28T00:00:00.000Z',
        }),
        'utf8',
      );

      // The old traversal test only covered "../etc" (rejected on "/"). The
      // alphabet admits dots, so "." / ".." need their OWN refusal — the ONE
      // alphabet guard rejects dots-only segments.
      for (const dotsOnly of ['.', '..', '...']) {
        await expect(store.getThread('alice', 'browser', dotsOnly, 'tid-1')).rejects.toThrow();
        await expect(
          store.append('alice', 'browser', { message: { role: 'user', content: 'x' } }, dotsOnly, 'tid-1'),
        ).rejects.toThrow();
        await expect(store.listThreads('alice', 'browser', dotsOnly)).rejects.toThrow();
        await expect(store.getThread('alice', 'browser', 'EVG-a', dotsOnly)).rejects.toThrow();
      }

      // The legacy flat file was never read and never written: it is still
      // byte-intact, and no ".."-scope path ever resolved through it.
      const legacyRaw = await readFile(join(root, 'alice', 'browser.json'), 'utf8');
      expect((JSON.parse(legacyRaw) as { messages: Array<{ content: string }> }).messages[0]?.content)
        .toBe('LEGACY CONTAMINATION');
    });
  });

  it('D7: a live thread named "foo.snapshot" LISTS — the snapshot filter matches only the store-generated stamp naming', async () => {
    await withTempStore(
      async (store) => {
        await store.append('alice', 'browser', { message: { role: 'user', content: 'snapshot-named thread' } }, 'EVG-a', 'foo.snapshot');
        await store.append('alice', 'browser', { message: { role: 'user', content: 'normal thread' } }, 'EVG-a', 'tid-normal');

        const listed = await store.listThreads('alice', 'browser', 'EVG-a');
        expect(listed.map((t) => t.threadId).sort()).toEqual(['foo.snapshot', 'tid-normal']);

        // A real rotated snapshot (store-generated `{tid}.{stamp}.snapshot.json`)
        // stays invisible even though foo.snapshot shares the `.snapshot`
        // prefix — the filter is stamp-pattern-based, not suffix-based.
        for (let i = 0; i < 4; i++) {
          await store.append('alice', 'browser', { message: { role: 'user', content: `grow-${i}` } }, 'EVG-a', 'tid-normal');
        }
        const afterRotate = await store.listThreads('alice', 'browser', 'EVG-a');
        expect(afterRotate.map((t) => t.threadId).sort()).toEqual(['foo.snapshot', 'tid-normal']);
      },
      { snapshotThresholdMessages: 3, snapshotKeepTail: 2 },
    );
  });
});
