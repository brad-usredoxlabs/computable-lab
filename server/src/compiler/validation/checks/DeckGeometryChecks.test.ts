/**
 * Tests for DeckGeometryChecks.
 */

import { describe, it, expect } from 'vitest';
import {
  getValidationChecks,
} from '../ValidationCheck.js';
import type { ValidationContext } from '../ValidationCheck.js';
import type { TerminalArtifacts } from '../../pipeline/CompileContracts.js';

// Side-effect import registers checks on module load
import './DeckGeometryChecks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
  events: TerminalArtifacts['events'] = [],
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
      mountedPipettes: [],
      labware: {},
      reservoirs: {},
      mintCounter: 0,
      turnIndex: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// deck-slot-conflict
// ---------------------------------------------------------------------------

describe('deck-slot-conflict', () => {
  function findCheck(): ReturnType<typeof getValidationChecks>[number] | undefined {
    return getValidationChecks().find((c) => c.id === 'deck-slot-conflict');
  }

  it('registers the check', () => {
    expect(findCheck()).toBeDefined();
  });

  it('returns empty findings when no conflicts exist', () => {
    const check = findCheck()!;
    const ctx = makeContext([], {
      pinned: [],
      autoFilled: [],
      conflicts: [],
    });
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('returns empty findings when deckLayoutPlan is undefined', () => {
    const check = findCheck()!;
    const ctx = makeContext([]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('returns error when a slot has conflicts', () => {
    const check = findCheck()!;
    const ctx = makeContext([], {
      pinned: [],
      autoFilled: [],
      conflicts: [
        { slot: 'A1', candidates: ['96-well-plate', '12-well-reservoir'] },
      ],
    });
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.message).toContain('A1');
    expect(findings[0]!.message).toContain('96-well-plate');
    expect(findings[0]!.message).toContain('12-well-reservoir');
    expect(findings[0]!.suggestion).toBeDefined();
    expect(findings[0]!.details).toEqual({
      slot: 'A1',
      candidates: ['96-well-plate', '12-well-reservoir'],
    });
  });

  it('returns one error per conflict', () => {
    const check = findCheck()!;
    const ctx = makeContext([], {
      pinned: [],
      autoFilled: [],
      conflicts: [
        { slot: 'A1', candidates: ['plate-a', 'plate-b'] },
        { slot: 'B2', candidates: ['reservoir-x', 'plate-c'] },
      ],
    });
    const findings = check.run(ctx);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.details!.slot).toBe('A1');
    expect(findings[1]!.details!.slot).toBe('B2');
  });

  it('has correct category', () => {
    const check = findCheck()!;
    const ctx = makeContext([], {
      pinned: [],
      autoFilled: [],
      conflicts: [{ slot: 'A1', candidates: ['x', 'y'] }],
    });
    const findings = check.run(ctx);
    expect(findings[0]!.category).toBe('deck-geometry');
  });
});
