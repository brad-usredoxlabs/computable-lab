/**
 * ColumnStampExpander tests.
 */

import { describe, it, expect } from 'vitest';
import { columnStampExpander } from './ColumnStampExpander.js';
import type { PatternEvent } from '../../pipeline/passes/ChatbotCompilePasses.js';
import type { StampPatternSpec } from '../../../registry/StampPatternRegistry.js';
import type { PatternExpanderContext } from '../PatternExpanders.js';

describe('columnStampExpander', () => {
  const mockSpec: StampPatternSpec = {
    id: 'column_stamp',
    name: 'Column Stamp',
    inputTopology: { rows: 8, cols: 12 },
    outputTopology: { rows: 8, cols: 12 },
    perPositionFields: [],
  };

  const mockCtx: PatternExpanderContext = {
    labState: { labware: {}, materials: {}, turnIndex: 0 },
  };

  function makeEvent(overrides: Partial<PatternEvent> = {}): PatternEvent {
    return {
      pattern: 'column_stamp',
      fromLabwareHint: 'source-plate',
      toLabwareHint: 'dest-plate',
      startCol: 1,
      ...overrides,
    };
  }

  it('should emit exactly 8 events for default startCol', () => {
    const events = columnStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    expect(events).toHaveLength(8);
  });

  it('should emit events for wells A1..H1 when startCol=1', () => {
    const events = columnStampExpander.expand(makeEvent({ startCol: 1 }), mockSpec, mockCtx);
    const sourceWells = new Set(events.map((e) => (e.details as { from: { well: string } }).from.well));
    const destWells = new Set(events.map((e) => (e.details as { to: { well: string } }).to.well));
    const expectedWells = new Set(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1']);
    expect(sourceWells).toEqual(expectedWells);
    expect(destWells).toEqual(expectedWells);
  });

  it('should emit events for wells A3..H3 when startCol=3', () => {
    const events = columnStampExpander.expand(makeEvent({ startCol: 3 }), mockSpec, mockCtx);
    const sourceWells = new Set(events.map((e) => (e.details as { from: { well: string } }).from.well));
    const destWells = new Set(events.map((e) => (e.details as { to: { well: string } }).to.well));
    const expectedWells = new Set(['A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3', 'H3']);
    expect(sourceWells).toEqual(expectedWells);
    expect(destWells).toEqual(expectedWells);
  });

  it('should set volumeUl from perPosition when present', () => {
    const events = columnStampExpander.expand(
      makeEvent({ perPosition: { volumeUl: 50 } }),
      mockSpec,
      mockCtx,
    );
    expect(events.every((e) => (e.details as { volumeUl: number }).volumeUl === 50)).toBe(true);
  });

  it('should default volumeUl to 0 when perPosition is absent', () => {
    const events = columnStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    expect(events.every((e) => (e.details as { volumeUl: number }).volumeUl === 0)).toBe(true);
  });

  it('should emit transfer event_type for all events', () => {
    const events = columnStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    expect(events.every((e) => e.event_type === 'transfer')).toBe(true);
  });
});
