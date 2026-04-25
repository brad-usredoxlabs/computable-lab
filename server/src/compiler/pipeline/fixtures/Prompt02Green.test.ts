import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { diffFixture } from './FixtureDiff.js';
import { createInMemoryLabStateCache } from '../../state/LabStateCache.js';

const PROMPT01_PATH = resolve(__dirname, 'prompt-01-mint-samples.yaml');
const PROMPT02_PATH = resolve(__dirname, 'prompt-02-zymo-magbead.yaml');

describe('Prompt 02 - Zymo MagBead protocol expansion', () => {
  it('runs Prompt 1 then Prompt 2 with shared cache, outcome complete', async () => {
    // Create a shared LabStateCache
    const cache = createInMemoryLabStateCache();

    // Run Prompt 1 first to warm the cache with conversationId 'zymo-run-1'
    const fixture01 = parseFixture(readFileSync(PROMPT01_PATH, 'utf8'));
    const result01 = await runFixture(fixture01, {
      conversationId: 'zymo-run-1',
      deps: { labStateCache: cache },
    });
    expect(result01.outcome).toBe('complete');

    // Run Prompt 2 with the same conversationId and cache
    const fixture02 = parseFixture(readFileSync(PROMPT02_PATH, 'utf8'));
    const result02 = await runFixture(fixture02, {
      conversationId: 'zymo-run-1',
      deps: { labStateCache: cache },
    });

    // Assert outcome is complete (cross-turn lookup resolves the deepwell plate)
    expect(result02.outcome).toBe('complete');

    // Assert events.length > 0 (protocol expansion produced steps)
    const events = result02.terminalArtifacts.events;
    expect(events.length).toBeGreaterThan(0);

    // Assert resolvedLabwareRefs.length === 1 (the deepwell plate resolved)
    expect(result02.terminalArtifacts.resolvedLabwareRefs?.length).toBe(1);

    // Assert resourceManifest.tipRacks.length >= 1
    expect(result02.terminalArtifacts.resourceManifest?.tipRacks.length).toBeGreaterThanOrEqual(1);

    // Assert deckLayoutPlan.pinned contains both C1 and D1
    const pinned = result02.terminalArtifacts.deckLayoutPlan?.pinned ?? [];
    const pinnedSlots = pinned.map(p => p.slot);
    expect(pinnedSlots).toContain('C1');
    expect(pinnedSlots).toContain('D1');

    // Assert diff.missing.length === 0 against the pinned expected.terminalArtifacts
    const diff = diffFixture(result02, fixture02.expected);
    expect(diff.missing).toEqual([]);
  });

  it('protocol-expanded events include transfer events for wash and elute steps', async () => {
    const cache = createInMemoryLabStateCache();

    // Warm cache with Prompt 1
    const fixture01 = parseFixture(readFileSync(PROMPT01_PATH, 'utf8'));
    await runFixture(fixture01, {
      conversationId: 'zymo-run-1',
      deps: { labStateCache: cache },
    });

    // Run Prompt 2 with the same cache
    const fixture02 = parseFixture(readFileSync(PROMPT02_PATH, 'utf8'));
    const result02 = await runFixture(fixture02, {
      conversationId: 'zymo-run-1',
      deps: { labStateCache: cache },
    });

    const events = result02.terminalArtifacts.events;

    // Protocol expansion should produce events from the zymo-magbead-minimal protocol
    // Steps: add_material (binding), mix, wash (wash-1), wash (wash-2), elute
    // These map to event_types: add_material, mix, transfer, transfer, transfer
    const transferEvents = events.filter(e => e.event_type === 'transfer');
    expect(transferEvents.length).toBeGreaterThan(0);

    // Check that protocol-expanded events carry protocol metadata
    const protocolEvents = events.filter(
      e => (e.details as Record<string, unknown>)?.protocolId === 'zymo-magbead-minimal',
    );
    expect(protocolEvents.length).toBeGreaterThan(0);
  });
});
