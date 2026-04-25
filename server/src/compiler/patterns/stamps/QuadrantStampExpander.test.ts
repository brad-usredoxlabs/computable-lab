/**
 * QuadrantStampExpander tests.
 */

import { describe, it, expect } from 'vitest';
import { quadrantStampExpander } from './QuadrantStampExpander.js';
import type { PatternEvent } from '../../pipeline/passes/ChatbotCompilePasses.js';
import type { StampPatternSpec } from '../../../registry/StampPatternRegistry.js';
import type { PatternExpanderContext } from '../PatternExpanders.js';

describe('quadrantStampExpander', () => {
  const mockSpec: StampPatternSpec = {
    id: 'quadrant_stamp',
    name: 'Quadrant Stamp',
    inputTopology: { rows: 8, cols: 12 },
    outputTopology: { rows: 16, cols: 24 },
    perPositionFields: [],
  };

  const mockCtx: PatternExpanderContext = {
    labState: { labware: {}, materials: {}, turnIndex: 0 },
  };

  function makeEvent(overrides: Partial<PatternEvent> = {}): PatternEvent {
    return {
      pattern: 'quadrant_stamp',
      fromLabwareHint: '96-plate',
      toLabwareHint: '384-plate',
      ...overrides,
    };
  }

  it('should emit exactly 384 events (96 source wells × 4 quadrant positions)', () => {
    const events = quadrantStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    expect(events).toHaveLength(384);
  });

  it('should map source A1 to destination wells {A1, A2, B1, B2}', () => {
    const events = quadrantStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    const a1Events = events.filter(
      (e) => (e.details as { from: { well: string } }).from.well === 'A1',
    );
    expect(a1Events).toHaveLength(4);
    const destWells = new Set(
      a1Events.map((e) => (e.details as { to: { well: string } }).to.well),
    );
    expect(destWells).toEqual(new Set(['A1', 'A2', 'B1', 'B2']));
  });

  it('should map source A2 to destination wells {A3, A4, B3, B4}', () => {
    const events = quadrantStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    const a2Events = events.filter(
      (e) => (e.details as { from: { well: string } }).from.well === 'A2',
    );
    expect(a2Events).toHaveLength(4);
    const destWells = new Set(
      a2Events.map((e) => (e.details as { to: { well: string } }).to.well),
    );
    expect(destWells).toEqual(new Set(['A3', 'A4', 'B3', 'B4']));
  });

  it('should map source H12 to destination wells {O23, O24, P23, P24}', () => {
    const events = quadrantStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    const h12Events = events.filter(
      (e) => (e.details as { from: { well: string } }).from.well === 'H12',
    );
    expect(h12Events).toHaveLength(4);
    const destWells = new Set(
      h12Events.map((e) => (e.details as { to: { well: string } }).to.well),
    );
    expect(destWells).toEqual(new Set(['O23', 'O24', 'P23', 'P24']));
  });

  it('should emit transfer event_type for all events', () => {
    const events = quadrantStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    expect(events.every((e) => e.event_type === 'transfer')).toBe(true);
  });

  it('should set volumeUl from perPosition when present', () => {
    const events = quadrantStampExpander.expand(
      makeEvent({ perPosition: { volumeUl: 50 } }),
      mockSpec,
      mockCtx,
    );
    expect(events.every((e) => (e.details as { volumeUl: number }).volumeUl === 50)).toBe(true);
  });

  it('should default volumeUl to 0 when perPosition is absent', () => {
    const events = quadrantStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    expect(events.every((e) => (e.details as { volumeUl: number }).volumeUl === 0)).toBe(true);
  });

  it('should attach assayContext from perPosition when quadrant position keys are present', () => {
    const events = quadrantStampExpander.expand(
      makeEvent({
        perPosition: {
          A1: { assay: '16S' },
          A2: { assay: 'species_A2' },
          B1: { assay: 'species_B1' },
          B2: { assay: 'species_B2' },
        },
      }),
      mockSpec,
      mockCtx,
    );
    // Check the first quadrant (source A1 → dest A1, A2, B1, B2)
    const a1Events = events.filter(
      (e) => (e.details as { from: { well: string } }).from.well === 'A1',
    );
    const a1Dest = a1Events.find(
      (e) => (e.details as { to: { well: string } }).to.well === 'A1',
    );
    const a2Dest = a1Events.find(
      (e) => (e.details as { to: { well: string } }).to.well === 'A2',
    );
    const b1Dest = a1Events.find(
      (e) => (e.details as { to: { well: string } }).to.well === 'B1',
    );
    const b2Dest = a1Events.find(
      (e) => (e.details as { to: { well: string } }).to.well === 'B2',
    );
    expect((a1Dest?.details as { assayContext?: { assay: string } }).assayContext).toEqual({
      assay: '16S',
    });
    expect((a2Dest?.details as { assayContext?: { assay: string } }).assayContext).toEqual({
      assay: 'species_A2',
    });
    expect((b1Dest?.details as { assayContext?: { assay: string } }).assayContext).toEqual({
      assay: 'species_B1',
    });
    expect((b2Dest?.details as { assayContext?: { assay: string } }).assayContext).toEqual({
      assay: 'species_B2',
    });
  });

  it('should cover all 96 source wells', () => {
    const events = quadrantStampExpander.expand(makeEvent(), mockSpec, mockCtx);
    const sourceWells = new Set(
      events.map((e) => (e.details as { from: { well: string } }).from.well),
    );
    expect(sourceWells.size).toBe(96);
    // Verify all expected wells are present
    for (let r = 0; r < 8; r++) {
      for (let c = 1; c <= 12; c++) {
        const well = `${String.fromCharCode(65 + r)}${c}`;
        expect(sourceWells.has(well)).toBe(true);
      }
    }
  });
});
