/**
 * Tests for CrossTurnChecks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getValidationChecks,
  clearValidationChecks,
} from '../ValidationCheck.js';
import type { ValidationContext } from '../ValidationCheck.js';
import type { TerminalArtifacts } from '../../pipeline/CompileContracts.js';
import type { LabStateSnapshot } from '../../state/LabState.js';

// Side-effect import registers checks on module load
import './CrossTurnChecks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
  events: TerminalArtifacts['events'] = [],
  mountedPipettes: LabStateSnapshot['mountedPipettes'] = [],
): ValidationContext {
  return {
    artifacts: {
      events,
      directives: [],
      gaps: [],
    },
    priorLabState: {
      deck: [],
      mountedPipettes,
      labware: {},
      reservoirs: {},
      mintCounter: 0,
      turnIndex: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// pipette-feasibility-cross-turn
// ---------------------------------------------------------------------------

describe('pipette-feasibility-cross-turn', () => {
  function findCheck(): ReturnType<typeof getValidationChecks>[number] | undefined {
    return getValidationChecks().find(
      (c) => c.id === 'pipette-feasibility-cross-turn',
    );
  }

  it('registers the check', () => {
    expect(findCheck()).toBeDefined();
  });

  it('returns empty findings when no pipettes are mounted', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'transfer',
        details: { volumeUl: 1 },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('returns error when volume is below the pipette feasibility floor', () => {
    const check = findCheck()!;
    // p1000: floor = max(5, 1000 * 0.01) = 10 uL
    // volume 1 uL < 10 → error
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'transfer',
          details: { volumeUl: 1 },
        },
      ],
      [{ mountSide: 'left', pipetteType: 'p1000', maxVolumeUl: 1000 }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.category).toBe('cross-turn');
    expect(findings[0]!.message).toContain('p1000');
    expect(findings[0]!.message).toContain('1000');
    expect(findings[0]!.suggestion).toContain('Swap to a smaller-volume pipette');
  });

  it('returns empty findings when volume is above the floor', () => {
    const check = findCheck()!;
    // p1000: floor = 10 uL; volume 50 uL >= 10 → no error
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'transfer',
          details: { volumeUl: 50 },
        },
      ],
      [{ mountSide: 'left', pipetteType: 'p1000', maxVolumeUl: 1000 }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('uses floor = max(5, maxVolumeUl * 0.01) for small pipettes', () => {
    const check = findCheck()!;
    // p20: floor = max(5, 20 * 0.01) = max(5, 0.2) = 5 uL
    // volume 3 uL < 5 → error
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'transfer',
          details: { volumeUl: 3 },
        },
      ],
      [{ mountSide: 'left', pipetteType: 'p20', maxVolumeUl: 20 }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.details).toEqual({
      pipette: 'p20',
      affectedCount: 1,
      floor: 5,
    });
  });

  it('flags multiple events below the floor', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'transfer',
          details: { volumeUl: 1 },
        },
        {
          eventId: 'evt-2',
          event_type: 'transfer',
          details: { volumeUl: 2 },
        },
        {
          eventId: 'evt-3',
          event_type: 'transfer',
          details: { volumeUl: 50 },
        },
      ],
      [{ mountSide: 'left', pipetteType: 'p1000', maxVolumeUl: 1000 }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.details).toEqual({
      pipette: 'p1000',
      affectedCount: 2,
      floor: 10,
    });
  });

  it('reports one finding per pipette that has violations', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'transfer',
          details: { volumeUl: 1 },
        },
        {
          eventId: 'evt-2',
          event_type: 'transfer',
          details: { volumeUl: 3 },
        },
      ],
      [
        { mountSide: 'left', pipetteType: 'p1000', maxVolumeUl: 1000 },
        { mountSide: 'right', pipetteType: 'p200', maxVolumeUl: 200 },
      ],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(2);
    // p1000 floor = max(5, 1000*0.01) = 10; both 1uL and 3uL < 10
    expect(findings[0]!.details).toEqual({
      pipette: 'p1000',
      affectedCount: 2,
      floor: 10,
    });
    // p200 floor = max(5, 200*0.01) = 5; both 1uL and 3uL < 5
    expect(findings[1]!.details).toEqual({
      pipette: 'p200',
      affectedCount: 2,
      floor: 5,
    });
  });

  it('uses feasibility_floor_uL from registry when available', async () => {
    // Stub the registry to return a spec with feasibility_floor_uL: 2
    const { getPipetteCapabilityRegistry } = await import(
      '../../../registry/PipetteCapabilityRegistry.js'
    );
    const originalGet = getPipetteCapabilityRegistry().get;
    const stubbedSpec = {
      id: 'custom-pipette',
      display_name: 'Custom Pipette',
      tool_type: 'pipette' as const,
      channels_supported: [1],
      volume_families: [
        { name: 'mid', volume_min_uL: 10, volume_max_uL: 100, feasibility_floor_uL: 2 },
      ],
      kind: 'pipette-capability' as const,
      recordId: 'pipette-capability/custom',
      type: 'pipette_capability' as const,
    };
    getPipetteCapabilityRegistry().get = (id: string) =>
      id === 'custom-pipette' ? stubbedSpec : undefined;

    try {
      const check = findCheck()!;
      // custom-pipette: registry says floor = 2 uL
      // volume 1 uL < 2 → error
      const ctx = makeContext(
        [
          {
            eventId: 'evt-1',
            event_type: 'transfer',
            details: { volumeUl: 1 },
          },
        ],
        [{ mountSide: 'left', pipetteType: 'custom-pipette', maxVolumeUl: 100 }],
      );
      const findings = check.run(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.details).toEqual({
        pipette: 'custom-pipette',
        affectedCount: 1,
        floor: 2,
      });
    } finally {
      // Restore original
      getPipetteCapabilityRegistry().get = originalGet;
    }
  });
});
