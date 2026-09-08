/**
 * AiThreadStore — stable conversation identity (Phase 1, agent harness).
 *
 * Today a thread is keyed by (userId, endpoint) with no stable ID — one live
 * thread per endpoint, clobbered when a tab/route/surface change would target a
 * different one, and un-linkable across mounts. The agent-harness plan requires
 * a conversation to keep a STABLE identity independent of endpoint/route/mount:
 * the same permanent chat must survive tab switches, surface changes, and
 * reloads under one id, and late results must attach to the originating turn.
 *
 * This increment adds an optional stable `conversationId` to the thread record:
 * a caller that supplies one is addressed by it; appends under a conversationId
 * are routed to that thread regardless of which endpoint surface is active. This
 * reuses the existing store + tmp-then-rename atomicity; no second store.
 */
import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AiThreadStore } from './AiThreadStore.js';
import type { ApplianceEndpoint } from './types.js';

async function withTempStore(): Promise<{ dir: string; store: AiThreadStore }> {
  const dir = await mkdtemp(`${tmpdir()}/cl-threads-`);
  return { dir, store: new AiThreadStore({ rootDir: dir }) };
}

describe('AiThreadStore stable conversation identity', () => {
  it('appends under a stable conversationId regardless of endpoint surface', async () => {
    const { dir, store } = await withTempStore();
    const userId = 'USR-LOCAL-ADMIN';
    const convId = 'CONV-heparg-drug-screen';
    const epA: ApplianceEndpoint = 'event-editor';
    const epB: ApplianceEndpoint = 'protocols';

    await store.append(userId, epA, {
      message: { role: 'user', content: 'seed two T25 flasks' },
      conversationId: convId,
    });
    // A different surface (route change) targets the SAME conversation.
    await store.append(userId, epB, {
      message: { role: 'assistant', content: 'resolved--T25' },
      conversationId: convId,
    });

    const thread = await store.getConversation(convId);
    expect(thread.messages.map((m) => m.content)).toEqual([
      'seed two T25 flasks',
      'resolved--T25',
    ]);
    await rm(dir, { recursive: true, force: true });
  });

  it('returns null for an unknown conversationId', async () => {
    const { dir, store } = await withTempStore();
    const thread = await store.getConversation('CONV-does-not-exist');
    expect(thread).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });
});