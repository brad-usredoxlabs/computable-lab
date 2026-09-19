import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceSessionStore } from './WorkspaceSessionStore.js';

describe('WorkspaceSessionStore', () => {
  it('returns an empty session when nothing is stored', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sessions-'));
    const s = await new WorkspaceSessionStore(root).get('default');
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });

  it('round-trips a session per user', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sessions-'));
    const store = new WorkspaceSessionStore(root);
    await store.put('USR-BRAD', [{ kind: 'run', runId: 'RUN-1', title: 'T' }], 'run:RUN-1');
    const back = await store.get('USR-BRAD');
    expect(back.tabs).toHaveLength(1);
    expect(back.activeTabId).toBe('run:RUN-1');
    // another user sees their own (empty) session
    expect((await store.get('USR-OTHER')).tabs).toEqual([]);
  });

  it('refuses traversal in the user id', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sessions-'));
    await expect(new WorkspaceSessionStore(root).get('../etc')).rejects.toThrow(/invalid/);
  });

  it('stamps updatedAt so an attaching device can compare clocks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sessions-'));
    const store = new WorkspaceSessionStore(root);
    const first = await store.put('default', [], null);
    const second = await store.put('default', [{ kind: 'claim', claimId: 'CLM-1', title: 'c' }], null);
    expect(Date.parse(second.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt));
  });
});
