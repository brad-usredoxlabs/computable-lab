/**
 * ColumnStampDifferentiatedExpander tests.
 */

import { describe, it, expect } from 'vitest';
import { columnStampDifferentiatedExpander } from './ColumnStampDifferentiatedExpander.js';
import type { PatternEvent } from '../../pipeline/passes/ChatbotCompilePasses.js';
import type { StampPatternSpec } from '../../../registry/StampPatternRegistry.js';
import type { PatternExpanderContext } from '../PatternExpanders.js';

describe('columnStampDifferentiatedExpander', () => {
  const mockSpec: StampPatternSpec = {
    id: 'column_stamp_differentiated',
    name: 'Column Stamp Differentiated',
    inputTopology: { rows: 8, cols: 12 },
    outputTopology: { rows: 8, cols: 12 },
    perPositionFields: [],
  };

  const mockCtx: PatternExpanderContext = {
    labState: { labware: {}, materials: {}, turnIndex: 0 },
  };

  function makeEvent(overrides: Partial<PatternEvent> = {}): PatternEvent {
    return {
      pattern: 'column_stamp_differentiated',
      fromLabwareHint: 'reservoir',
      toLabwareHint: 'dest-plate',
      ...overrides,
    };
  }

  it('should emit 8 events per column in perPosition', () => {
    const events = columnStampDifferentiatedExpander.expand(
      makeEvent({
        perPosition: {
          col_1: { perturbant: 'x', volumeUl: 2 },
          col_6: { perturbant: 'y', volumeUl: 3 },
        },
      }),
      mockSpec,
      mockCtx,
    );
    expect(events).toHaveLength(16);
  });

  it('should emit 8*N events for N columns', () => {
    const events = columnStampDifferentiatedExpander.expand(
      makeEvent({
        perPosition: {
          col_1: { perturbant: 'a', volumeUl: 1 },
          col_2: { perturbant: 'b', volumeUl: 2 },
          col_3: { perturbant: 'c', volumeUl: 3 },
        },
      }),
      mockSpec,
      mockCtx,
    );
    expect(events).toHaveLength(24);
  });

  it('should set perturbant and volumeUl per column', () => {
    const events = columnStampDifferentiatedExpander.expand(
      makeEvent({
        perPosition: {
          col_1: { perturbant: 'x', volumeUl: 2 },
          col_6: { perturbant: 'y', volumeUl: 3 },
        },
      }),
      mockSpec,
      mockCtx,
    );

    const col1Events = events.filter(
      (e) => (e.details as { from: { well: string } }).from.well === 'A1',
    );
    const col6Events = events.filter(
      (e) => (e.details as { from: { well: string } }).from.well === 'A6',
    );

    expect(col1Events).toHaveLength(8);
    expect(col6Events).toHaveLength(8);

    // All col_1 events should have perturbant='x', volumeUl=2
    for (const e of col1Events) {
      const d = e.details as { perturbant?: string; volumeUl: number };
      expect(d.perturbant).toBe('x');
      expect(d.volumeUl).toBe(2);
    }

    // All col_6 events should have perturbant='y', volumeUl=3
    for (const e of col6Events) {
      const d = e.details as { perturbant?: string; volumeUl: number };
      expect(d.perturbant).toBe('y');
      expect(d.volumeUl).toBe(3);
    }
  });

  it('should emit transfer event_type for all events', () => {
    const events = columnStampDifferentiatedExpander.expand(
      makeEvent({
        perPosition: {
          col_1: { perturbant: 'x', volumeUl: 2 },
        },
      }),
      mockSpec,
      mockCtx,
    );
    expect(events.every((e) => e.event_type === 'transfer')).toBe(true);
  });

  it('should default volumeUl to 0 when not in perPosition', () => {
    const events = columnStampDifferentiatedExpander.expand(
      makeEvent({
        perPosition: {
          col_1: { perturbant: 'x' },
        },
      }),
      mockSpec,
      mockCtx,
    );
    expect(events.every((e) => (e.details as { volumeUl: number }).volumeUl === 0)).toBe(true);
  });

  it('should omit perturbant when not in perPosition', () => {
    const events = columnStampDifferentiatedExpander.expand(
      makeEvent({
        perPosition: {
          col_1: { volumeUl: 5 },
        },
      }),
      mockSpec,
      mockCtx,
    );
    for (const e of events) {
      const d = e.details as { perturbant?: string };
      expect(d.perturbant).toBeUndefined();
    }
  });

  it('should emit events for all 8 rows per column', () => {
    const events = columnStampDifferentiatedExpander.expand(
      makeEvent({
        perPosition: {
          col_3: { perturbant: 'test', volumeUl: 10 },
        },
      }),
      mockSpec,
      mockCtx,
    );
    const destWells = new Set(
      events.map((e) => (e.details as { to: { well: string } }).to.well),
    );
    const expectedWells = new Set([
      'A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3', 'H3',
    ]);
    expect(destWells).toEqual(expectedWells);
  });
});
