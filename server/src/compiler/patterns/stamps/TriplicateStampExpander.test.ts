/**
 * TriplicateStampExpander tests.
 */

import { describe, it, expect } from 'vitest';
import { triplicateStampExpander } from './TriplicateStampExpander.js';
import type { PatternEvent } from '../../pipeline/passes/ChatbotCompilePasses.js';
import type { StampPatternSpec } from '../../../registry/StampPatternRegistry.js';
import type { PatternExpanderContext } from '../PatternExpanders.js';

describe('triplicateStampExpander', () => {
  const mockSpec: StampPatternSpec = {
    id: 'triplicate_stamp',
    name: 'Triplicate Stamp',
    inputTopology: { rows: 8, cols: 12 },
    outputTopology: { rows: 8, cols: 12 },
    perPositionFields: [],
  };

  const mockCtx: PatternExpanderContext = {
    labState: { labware: {}, materials: {}, turnIndex: 0 },
  };

  function makeEvent(overrides: Partial<PatternEvent> = {}): PatternEvent {
    return {
      pattern: 'triplicate_stamp',
      fromLabwareHint: 'source-plate',
      toLabwareHint: 'dest-plate',
      startCol: 1,
      ...overrides,
    };
  }

  it('should emit exactly 24 events for default startCol', () => {
    const events = triplicateStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    expect(events).toHaveLength(24);
  });

  it('should emit events for source col 2, destination cols 2,3,4 when startCol=2', () => {
    const events = triplicateStampExpander.expand(makeEvent({ startCol: 2 }), mockSpec, mockCtx);
    expect(events).toHaveLength(24);

    // Collect source wells
    const sourceWells = new Set(events.map((e) => (e.details as { from: { well: string } }).from.well));
    // Collect destination wells
    const destWells = new Set(events.map((e) => (e.details as { to: { well: string } }).to.well));

    // Source should be all wells in column 2
    const expectedSource = new Set(['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2']);
    expect(sourceWells).toEqual(expectedSource);

    // Destination should be all wells in columns 2, 3, 4
    const expectedDest = new Set([
      'A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2',
      'A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3', 'H3',
      'A4', 'B4', 'C4', 'D4', 'E4', 'F4', 'G4', 'H4',
    ]);
    expect(destWells).toEqual(expectedDest);
  });

  it('should emit events for source col 1, destination cols 1,2,3 when startCol=1', () => {
    const events = triplicateStampExpander.expand(makeEvent({ startCol: 1 }), mockSpec, mockCtx);
    expect(events).toHaveLength(24);

    const sourceWells = new Set(events.map((e) => (e.details as { from: { well: string } }).from.well));
    const destWells = new Set(events.map((e) => (e.details as { to: { well: string } }).to.well));

    const expectedSource = new Set(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1']);
    expect(sourceWells).toEqual(expectedSource);

    const expectedDest = new Set([
      'A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1',
      'A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2',
      'A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3', 'H3',
    ]);
    expect(destWells).toEqual(expectedDest);
  });

  it('should emit transfer event_type for all events', () => {
    const events = triplicateStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    expect(events.every((e) => e.event_type === 'transfer')).toBe(true);
  });

  it('should set volumeUl from perPosition when present', () => {
    const events = triplicateStampExpander.expand(
      makeEvent({ perPosition: { volumeUl: 25 } }),
      mockSpec,
      mockCtx,
    );
    expect(events.every((e) => (e.details as { volumeUl: number }).volumeUl === 25)).toBe(true);
  });

  it('should default volumeUl to 0 when perPosition is absent', () => {
    const events = triplicateStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    expect(events.every((e) => (e.details as { volumeUl: number }).volumeUl === 0)).toBe(true);
  });
});
