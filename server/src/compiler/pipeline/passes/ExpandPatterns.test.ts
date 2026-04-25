/**
 * Tests for the expand_patterns pass.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createExpandPatternsPass } from './ChatbotCompilePasses.js';
import {
  registerPatternExpander,
  clearPatternExpanders,
} from '../../patterns/PatternExpanders.js';
import type { PatternEvent } from './ChatbotCompilePasses.js';
import type { StampPatternSpec } from '../../../registry/StampPatternRegistry.js';
import type { PlateEventPrimitive } from '../../../compiler/biology/BiologyVerbExpander.js';
import type { PatternExpanderContext } from '../../patterns/PatternExpanders.js';
import type { PipelineState, PassRunArgs } from '../../../compiler/pipeline/types.js';
import { emptyLabState } from '../../../compiler/state/LabState.js';

describe('createExpandPatternsPass', () => {
  const stampPatternSpec: StampPatternSpec = {
    id: 'test-pattern',
    name: 'Test Pattern',
    inputTopology: { rows: 8, cols: 12 },
    outputTopology: { rows: 8, cols: 12 },
    perPositionFields: [],
  };

  // Create a mock registry loader
  function createMockRegistry(specs: StampPatternSpec[]) {
    return {
      get: (id: string) => specs.find((s) => s.id === id),
      list: () => specs.slice(),
      reload: () => {},
    };
  }

  const mockRegistry = createMockRegistry([stampPatternSpec]);

  beforeEach(() => {
    clearPatternExpanders();
  });

  function makeState(
    patternEvents: PatternEvent[],
    labState = emptyLabState(),
  ): PassRunArgs['state'] {
    return {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { patternEvents }],
      ]),
      diagnostics: [],
    } as unknown as PipelineState;
  }

  it('should emit events from a registered expander', () => {
    const fixedEvent: PlateEventPrimitive = {
      eventId: 'fixed-event',
      event_type: 'transfer',
      details: { from: { well: 'A1' }, to: { well: 'B1' } },
    };
    registerPatternExpander('test-pattern', {
      expand: (): PlateEventPrimitive[] => [fixedEvent],
    });

    const pass = createExpandPatternsPass({ stampPatternRegistry: mockRegistry });
    const result = pass.run({
      pass_id: 'expand_patterns',
      state: makeState([{ pattern: 'test-pattern' }]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: PlateEventPrimitive[] };
    expect(output.events).toContainEqual(fixedEvent);
  });

  it('should emit warning when expander is not registered', () => {
    // Use a pattern that exists in the registry but has no expander
    const pass = createExpandPatternsPass({ stampPatternRegistry: mockRegistry });
    const result = pass.run({
      pass_id: 'expand_patterns',
      state: makeState([{ pattern: 'test-pattern' }]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: PlateEventPrimitive[] };
    expect(output.events).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0].severity).toBe('warning');
    expect(result.diagnostics![0].code).toBe('missing_expander');
  });

  it('should emit warning when pattern spec is unknown', () => {
    const pass = createExpandPatternsPass({ stampPatternRegistry: mockRegistry });
    const result = pass.run({
      pass_id: 'expand_patterns',
      state: makeState([{ pattern: 'nonexistent-pattern' }]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: PlateEventPrimitive[] };
    expect(output.events).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0].severity).toBe('warning');
    expect(result.diagnostics![0].code).toBe('unknown_pattern');
  });

  it('should handle empty patternEvents', () => {
    const pass = createExpandPatternsPass({ stampPatternRegistry: mockRegistry });
    const result = pass.run({
      pass_id: 'expand_patterns',
      state: makeState([]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: PlateEventPrimitive[] };
    expect(output.events).toHaveLength(0);
  });

  it('should handle multiple pattern events', () => {
    const event1: PlateEventPrimitive = {
      eventId: 'event-1',
      event_type: 'transfer',
      details: {},
    };
    const event2: PlateEventPrimitive = {
      eventId: 'event-2',
      event_type: 'transfer',
      details: {},
    };
    registerPatternExpander('test-pattern', {
      expand: (): PlateEventPrimitive[] => [event1, event2],
    });

    const pass = createExpandPatternsPass({ stampPatternRegistry: mockRegistry });
    const result = pass.run({
      pass_id: 'expand_patterns',
      state: makeState([
        { pattern: 'test-pattern' },
        { pattern: 'test-pattern' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: PlateEventPrimitive[] };
    expect(output.events).toHaveLength(4); // 2 events × 2 pattern invocations
  });
});
