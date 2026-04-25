import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { createInMemoryLabStateCache } from '../../state/LabStateCache.js';
import { emptyLabState } from '../../state/LabState.js';
import type { LabStateSnapshot } from '../../state/LabState.js';

const FIXTURE_PATH = resolve(__dirname, 'prompt-03-quadrant-qpcr.yaml');

describe('Prompt 03 - quadrant stamp qPCR', () => {
  it('emits 384 quadrant events + QuantStudio run file + cross-turn feasibility error', async () => {
    const cache = createInMemoryLabStateCache();

    // Seed prior labState with a 1000uL pipette mount (simulating prior turn)
    const seed: LabStateSnapshot = {
      ...emptyLabState(),
      mountedPipettes: [
        { mountSide: 'left', pipetteType: '8ch-1000uL', maxVolumeUl: 1000 },
      ],
    };
    cache.put('qpcr-run', seed);

    // Parse and run Prompt 3 fixture with the seeded cache
    const p3 = parseFixture(readFileSync(FIXTURE_PATH, 'utf8'));
    p3.input.conversationId = 'qpcr-run';
    const r3 = await runFixture(p3, { deps: { labStateCache: cache } });

    // Assert 1: outcome is 'error' (pipette too coarse for qPCR volumes)
    expect(r3.outcome).toBe('error');

    // Assert 2: 384 transfer events from quadrant stamp expansion
    const quadEvents = r3.terminalArtifacts.events.filter(
      e =>
        e.event_type === 'transfer' &&
        typeof e.eventId === 'string' &&
        e.eventId.startsWith('pe_quad'),
    );
    expect(quadEvents.length).toBe(384);

    // Assert 3: QuantStudio run file with wells
    const runFiles = r3.terminalArtifacts.instrumentRunFiles ?? [];
    const qsFile = runFiles.find(r => r.instrument === 'QuantStudio-5');
    expect(qsFile).toBeDefined();
    expect(qsFile!.wells.length).toBeGreaterThan(0);

    // Assert 4: validationReport contains cross-turn pipette feasibility error
    const findings = r3.terminalArtifacts.validationReport?.findings ?? [];
    const crossTurnError = findings.find(
      f => f.category === 'cross-turn' && f.severity === 'error',
    );
    expect(crossTurnError).toBeDefined();
    expect(crossTurnError!.message).toContain('1000uL');
    expect(crossTurnError!.suggestion).toContain('Swap to a smaller-volume pipette');
  });
});
