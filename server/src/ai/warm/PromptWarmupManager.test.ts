import { describe, expect, it, vi } from 'vitest';
import { createPromptWarmupManager, type WarmupSettings } from './PromptWarmupManager.js';
import type { InferenceClient } from '../types.js';
import type { InferenceActivityTracker } from './InferenceActivityTracker.js';

const SETTINGS: WarmupSettings = {
  enabled: true,
  debounceMs: 5,
  slotPersistence: false,
  warmSlotId: 0,
  maxLibraryEntries: 4,
  manifestPath: '/tmp/warm-test-manifest.json',
};

function makeManager(opts: { completeImpl?: () => Promise<unknown>; enabled?: boolean } = {}) {
  const complete = vi.fn(
    opts.completeImpl ??
      (async () => ({ timings: { prompt_n: 1234, cache_n: 0 } })),
  );
  const manager = createPromptWarmupManager({
    inferenceClient: { complete } as unknown as InferenceClient,
    tracker: { inFlight: () => 0 } as InferenceActivityTracker,
    model: 'test-model',
    settings: { ...SETTINGS, enabled: opts.enabled ?? true },
    log: () => undefined,
  });
  return { manager, complete };
}

const target = (key: string, marker = 'x') => ({
  key,
  buildPrefix: () => ({ messages: [{ role: 'system' as const, content: `prefix-${marker}` }] }),
});

async function until(cond: () => boolean, ms = 500): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('PromptWarmupManager status', () => {
  it('reports disabled when warming is off', () => {
    const { manager } = makeManager({ enabled: false });
    expect(manager.status('run:R1').state).toBe('disabled');
  });

  it('reports idle for unknown keys', () => {
    const { manager } = makeManager();
    expect(manager.status('run:R1').state).toBe('idle');
  });

  it('walks pending → warmed with token counts on a successful warm', async () => {
    const { manager } = makeManager();
    manager.requestWarm(target('run:R1'));
    expect(manager.status('run:R1').state).toBe('pending');
    await until(() => manager.status('run:R1').state === 'warmed');
    const status = manager.status('run:R1');
    expect(status.promptTokens).toBe(1234);
    expect(status.warmedAt).toBeTruthy();
  });

  it('reports failed when the warm request errors', async () => {
    const { manager } = makeManager({
      completeImpl: async () => {
        throw new Error('boom');
      },
    });
    manager.requestWarm(target('run:R1'));
    await until(() => manager.status('run:R1').state === 'failed');
  });

  it('stays warmed (keeping numbers) when an unchanged prefix is skipped', async () => {
    const { manager, complete } = makeManager();
    await manager.warmNow(target('run:R1'));
    expect(manager.status('run:R1').state).toBe('warmed');
    await manager.warmNow(target('run:R1')); // identical prefix → skip
    expect(complete).toHaveBeenCalledTimes(1);
    const status = manager.status('run:R1');
    expect(status.state).toBe('warmed');
    expect(status.promptTokens).toBe(1234);
  });

  it('re-warms when the prefix changes', async () => {
    const { manager, complete } = makeManager();
    await manager.warmNow(target('run:R1', 'a'));
    await manager.warmNow(target('run:R1', 'b'));
    expect(complete).toHaveBeenCalledTimes(2);
    expect(manager.status('run:R1').state).toBe('warmed');
  });
});
