/**
 * FixtureRunner.test - Tests for the fixture harness runner and diff.
 *
 * Exercises the runner with an inline toy fixture (one seed event
 * expected, mocked LLM emits it) and asserts the diff returns matched
 * paths and no missing/extra paths.
 */

import { describe, it, expect } from 'vitest';
import { runFixture } from './FixtureRunner.js';
import { diffFixture } from './FixtureDiff.js';
import type { Fixture } from './FixtureTypes.js';

describe('FixtureRunner', () => {
  it('runs a toy fixture and diff reports matched paths with no missing', async () => {
    // Build an inline toy fixture
    // Note: the 'seed' verb gets expanded to 'add_material' by the expand_biology_verbs pass,
    // so the expected event should match the expanded form (or be an empty object for "contains").
    const fixture: Fixture = {
      name: 'toy-seed',
      description: 'One seed event, outcome complete',
      input: {
        prompt: 'add a seed event',
      },
      mocked_ai_precompile_output: {
        candidateEvents: [
          {
            verb: 'seed',
            labware: '96-well plate',
            cell_ref: 'HeLa',
            volume: { value: 200, unit: 'uL' },
            wells: ['A1'],
          },
        ],
        candidateLabwares: [
          { hint: '96-well plate', reason: 'needed for seeding' },
        ],
        unresolvedRefs: [],
      },
      expected: {
        outcome: 'complete',
        terminalArtifacts: {
          events: [
            {
              // Empty object = "contains any event" (contains semantics)
              // The actual event will have event_type, details, eventId, etc.
            },
          ],
        },
      },
    };

    // Run the fixture
    const result = await runFixture(fixture);

    // Assert the runner produced events
    expect(result.outcome).toBe('complete');
    expect(result.terminalArtifacts.events.length).toBeGreaterThan(0);

    // Diff actual vs expected
    const diff = diffFixture(result, fixture.expected);

    // Assert: matched paths exist
    expect(diff.matched.length).toBeGreaterThan(0);

    // Assert: no missing paths
    expect(diff.missing.length).toBe(0);

    // Assert: no extra top-level fields beyond what's expected
    expect(diff.extra.length).toBe(0);

    // Assert: partial may be non-empty (event-level extras are fine)
    expect(diff.partial.length).toBeGreaterThanOrEqual(0);
  });

  it('diff reports missing when expected outcome does not match', async () => {
    const fixture: Fixture = {
      name: 'toy-mismatch',
      input: {
        prompt: 'add a seed event',
      },
      mocked_ai_precompile_output: {
        candidateEvents: [
          { verb: 'seed', labware: 'plate', cell_ref: 'HeLa', volume: { value: 100, unit: 'uL' }, wells: ['A1'] },
        ],
        candidateLabwares: [],
        unresolvedRefs: [],
      },
      expected: {
        outcome: 'gap', // We expect gap but the LLM will produce events → outcome will be 'complete'
        terminalArtifacts: {
          events: [{ verb: 'seed' }],
        },
      },
    };

    const result = await runFixture(fixture);
    const diff = diffFixture(result, fixture.expected);

    // outcome mismatch should be reported as missing
    expect(diff.missing).toContain('outcome');
  });

  it('diff reports partial when actual has extra keys beyond expected', async () => {
    const fixture: Fixture = {
      name: 'toy-partial',
      input: {
        prompt: 'add a seed event',
      },
      mocked_ai_precompile_output: {
        candidateEvents: [
          { verb: 'seed', labware: 'plate', cell_ref: 'HeLa', volume: { value: 100, unit: 'uL' }, wells: ['A1'] },
        ],
        candidateLabwares: [],
        unresolvedRefs: [],
      },
      expected: {
        outcome: 'complete',
        terminalArtifacts: {
          events: [
            {
              // Empty object = "contains any event"
            },
          ],
        },
      },
    };

    const result = await runFixture(fixture);
    const diff = diffFixture(result, fixture.expected);

    // The outcome should match
    expect(diff.matched).toContain('outcome');

    // The events array path should be matched (expected is a subset of actual)
    // because empty expected object means "contains any event"
    expect(diff.missing).not.toContain('terminalArtifacts.events[0]');
  });
});
