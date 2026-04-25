import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { createInMemoryLabStateCache } from '../../state/LabStateCache.js';

describe('Cross-turn mini', () => {
  it('resolves Prompt 1 plate in prompt-01b via labState cache', async () => {
    const cache = createInMemoryLabStateCache();
    const p1 = parseFixture(readFileSync(resolve(__dirname, 'prompt-01-mint-samples.yaml'), 'utf8'));
    // Force the fixture to use a specific conversationId for caching
    p1.input.conversationId = 'cross-turn-demo';
    const r1 = await runFixture(p1, { deps: { labStateCache: cache } });
    expect(r1.outcome).toBe('complete');

    const p1b = parseFixture(readFileSync(resolve(__dirname, 'prompt-01b-use-prior-plate.yaml'), 'utf8'));
    const r1b = await runFixture(p1b, { deps: { labStateCache: cache } });
    expect(r1b.outcome).toBe('complete');

    const resolved = r1b.terminalArtifacts.resolvedLabwareRefs ?? [];
    expect(resolved.length).toBe(1);

    const matchedInstanceId = resolved[0].matched.instanceId;
    const addEvents = r1b.terminalArtifacts.events.filter(e => e.event_type === 'add_material');
    expect(addEvents.length).toBeGreaterThanOrEqual(1);
    expect(addEvents[0].labwareId).toBe(matchedInstanceId);
  });
});
