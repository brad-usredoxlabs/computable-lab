/**
 * Tests for IntraEventChecks.
 */

import { describe, it, expect } from 'vitest';
import {
  getValidationChecks,
} from '../ValidationCheck.js';
import type { ValidationContext } from '../ValidationCheck.js';
import type { TerminalArtifacts } from '../../pipeline/CompileContracts.js';
import type { LabStateSnapshot } from '../../state/LabState.js';

// Side-effect import registers checks on module load
import './IntraEventChecks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
  events: TerminalArtifacts['events'] = [],
  mountedPipettes: LabStateSnapshot['mountedPipettes'] = [],
  deckLayoutPlan?: TerminalArtifacts['deckLayoutPlan'],
): ValidationContext {
  return {
    artifacts: {
      events,
      directives: [],
      gaps: [],
      deckLayoutPlan,
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
// pipette-volume-cap
// ---------------------------------------------------------------------------

describe('pipette-volume-cap', () => {
  function findCheck(): ReturnType<typeof getValidationChecks>[number] | undefined {
    return getValidationChecks().find((c) => c.id === 'pipette-volume-cap');
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
        details: { volumeUl: 500 },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('returns warning when volume exceeds max pipette capacity', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'transfer',
          details: { volumeUl: 1200 },
        },
      ],
      [{ mountSide: 'left', pipetteType: 'p1000', maxVolumeUl: 1000 }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warning');
    expect(findings[0]!.message).toContain('1200');
    expect(findings[0]!.message).toContain('1000');
    expect(findings[0]!.affectedIds).toEqual(['evt-1']);
  });

  it('returns empty findings when volume is within capacity', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'transfer',
          details: { volumeUl: 500 },
        },
      ],
      [{ mountSide: 'left', pipetteType: 'p1000', maxVolumeUl: 1000 }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('uses the max of multiple mounted pipettes', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'transfer',
          details: { volumeUl: 1200 },
        },
      ],
      [
        { mountSide: 'left', pipetteType: 'p200', maxVolumeUl: 200 },
        { mountSide: 'right', pipetteType: 'p1000', maxVolumeUl: 1000 },
      ],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('1200');
    expect(findings[0]!.message).toContain('1000');
  });

  it('flags multiple events exceeding capacity', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'transfer',
          details: { volumeUl: 1500 },
        },
        {
          eventId: 'evt-2',
          event_type: 'transfer',
          details: { volumeUl: 2000 },
        },
      ],
      [{ mountSide: 'left', pipetteType: 'p1000', maxVolumeUl: 1000 }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.affectedIds).toEqual(['evt-1']);
    expect(findings[1]!.affectedIds).toEqual(['evt-2']);
  });
});

// ---------------------------------------------------------------------------
// well-address-valid
// ---------------------------------------------------------------------------

describe('well-address-valid', () => {
  function findCheck(): ReturnType<typeof getValidationChecks>[number] | undefined {
    return getValidationChecks().find((c) => c.id === 'well-address-valid');
  }

  it('registers the check', () => {
    expect(findCheck()).toBeDefined();
  });

  it('accepts valid well addresses for 96-well plate', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          labwareType: '96-well-plate',
          well: 'A1',
        },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('errors on well address beyond row limit (I1 on 96-well)', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          labwareType: '96-well-plate',
          well: 'I1',
        },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.message).toContain('I1');
    expect(findings[0]!.message).toContain('96-well-plate');
    expect(findings[0]!.affectedIds).toEqual(['evt-1']);
  });

  it('errors on well address beyond column limit (A13 on 96-well)', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          labwareType: '96-well-plate',
          well: 'A13',
        },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.message).toContain('A13');
  });

  it('accepts valid well addresses for 384-well plate', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          labwareType: '384-well-pcr-plate',
          well: 'P24',
        },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('errors on well address beyond row limit for 384-well (Q1)', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          labwareType: '384-well-pcr-plate',
          well: 'Q1',
        },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
  });

  it('handles transfer events with from/to wells', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'transfer',
        details: {
          from: { labwareType: '96-well-plate', well: 'A1' },
          to: { labwareType: '96-well-plate', well: 'Z1' },
        },
      },
    ]);
    const findings = check.run(ctx);
    // Z1 is invalid for 96-well (only A-H)
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.message).toContain('Z1');
  });

  it('skips events with unknown labware type', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          labwareType: 'unknown-labware',
          well: 'A1',
        },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('skips events without labwareType', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          well: 'A1',
        },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });
});
