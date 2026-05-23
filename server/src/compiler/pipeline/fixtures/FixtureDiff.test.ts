import { describe, expect, it } from 'vitest';
import { diffFixture } from './FixtureDiff.js';
import type { FixtureResult, FixtureExpected } from './FixtureTypes.js';

function res(terminalArtifacts: unknown): FixtureResult {
  return { outcome: 'complete', terminalArtifacts: terminalArtifacts as never, raw: {} as never };
}

describe('diffFixture array handling', () => {
  it('flags a missing TRAILING array element (expected longer than actual)', () => {
    // Regression: a fixture expecting two placements must NOT pass when the
    // actual output emits only the first. Previously min-length comparison
    // silently ignored the second → false pass.
    const expected: FixtureExpected = {
      outcome: 'complete',
      terminalArtifacts: { deckLayoutPlan: { pinned: [{ slot: 'B1' }, { slot: 'B2' }] } } as never,
    };
    const diff = diffFixture(res({ deckLayoutPlan: { pinned: [{ slot: 'B1' }] } }), expected);
    expect(diff.missing).toContain('terminalArtifacts.deckLayoutPlan.pinned[1]');
  });

  it('matches when actual has all expected elements (extra actual items are fine)', () => {
    const expected: FixtureExpected = {
      outcome: 'complete',
      terminalArtifacts: { deckLayoutPlan: { pinned: [{ slot: 'B1' }] } } as never,
    };
    const diff = diffFixture(res({ deckLayoutPlan: { pinned: [{ slot: 'B1' }, { slot: 'B2' }] } }), expected);
    expect(diff.missing).toEqual([]);
  });

  it('matches both elements when both are present', () => {
    const expected: FixtureExpected = {
      outcome: 'complete',
      terminalArtifacts: { deckLayoutPlan: { pinned: [{ slot: 'B1' }, { slot: 'B2' }] } } as never,
    };
    const diff = diffFixture(res({ deckLayoutPlan: { pinned: [{ slot: 'B1' }, { slot: 'B2' }] } }), expected);
    expect(diff.missing).toEqual([]);
  });
});
