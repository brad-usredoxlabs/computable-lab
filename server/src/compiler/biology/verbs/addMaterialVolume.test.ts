/**
 * SHORTHAND-COMP-1 Task 14/15 (Part III D2/D3): the silent drops pinned.
 *
 * The shorthand path compiles `add_material` through addMaterialExpander. The
 * scientist's DECLARED volume object `{value, unit}` and a compact well range
 * (`wells: 'A1:H12'`, the lowered form of `targetWells: "A1:H12"`) were both
 * silently discarded: the emitted details carried neither `volume` nor any
 * well key, and nothing complained (silent data loss).
 *
 * transferExpander already reads the same object shape (`params.volume as
 * { value, unit }`); add_material must too. Range expansion goes through the
 * ONE parser, expandWellTokens (server/src/ai/wellRange.ts) — no second parser.
 */
import { describe, expect, it } from 'vitest';
import { getExpander } from '../BiologyVerbExpander.js';
import '../verbs/simpleVerbs.js';

describe('add_material honors the declared volume', () => {
  it('carries an object-form volume onto the event', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume: { value: 50, unit: 'uL' }, material: 'DMEM' },
    });
    const details = event!.details as Record<string, unknown>;
    expect(details['volume']).toEqual({ value: 50, unit: 'uL' });
    // unit honesty: volumeUl is derived ONLY when the declared unit is literally uL
    expect(details['volumeUl']).toBe(50);
  });

  it('lets an explicit volume object override the scalar form', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 10, volume: { value: 50, unit: 'uL' }, material: 'DMEM' },
    });
    const details = event!.details as Record<string, unknown>;
    expect(details['volume']).toEqual({ value: 50, unit: 'uL' });
    expect(details['volumeUl']).toBe(50);
  });

  it('performs NO unit conversion: a non-uL volume carries `volume` only, never a fabricated volumeUl', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', well: 'A1', volume: { value: 0.05, unit: 'mL' }, material: 'DMEM' },
    });
    const details = event!.details as Record<string, unknown>;
    expect(details['volume']).toEqual({ value: 0.05, unit: 'mL' });
    expect('volumeUl' in details).toBe(false);
  });

  it('a bare-number volume still behaves as today (byte-identity for the existing arm)', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', well: 'A1', volume: 100, material: 'DMEM' },
    });
    const details = event!.details as Record<string, unknown>;
    expect(details['volumeUl']).toBe(100);
    expect(details['volume']).toEqual({ value: 100, unit: 'uL' });
  });
});

describe('add_material expands a compact well range (D3)', () => {
  it('expands wells: "A1:H12" into per-well events carrying details.well + the declared volume', () => {
    const events = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: 'A1:H12', volume: { value: 50, unit: 'uL' }, material: 'DMEM' },
    });
    // Task 15 shape decision: per-well events (the legacy per-well branch),
    // matching the raw path's expandEventWells fan-out precedent.
    expect(events.length).toBe(96);
    const wells = events.map((e) => (e.details as Record<string, unknown>)['well']);
    expect(wells).toContain('A1');
    expect(wells).toContain('H12');
    expect(new Set(wells).size).toBe(96);
    for (const e of events) {
      const details = e.details as Record<string, unknown>;
      expect(details['volume']).toEqual({ value: 50, unit: 'uL' });
      expect(details['volumeUl']).toBe(50);
    }
  });
});

/**
 * L2-LABSTATE-CONTENTS-1 fix run 3 (architect ruling l2t1050 Q-A, Brad card (A)
 * 2026-11-02): the CONTENTS-LEDGER CANONICAL SHAPE requires the expander to emit
 * CONCRETE well addresses, never range strings. The scalar `wells` form expands
 * through the ONE parser (the leg above); the ARRAY form — the lowered
 * `targetWells: [A1:H1]` shorthand carrier — must route through the SAME
 * expandWellTokens call, element by element. A range string left inside the
 * array becomes a single non-address KEY in the lab_state contents ledger
 * (wellCount "2 well(s)" where 16 carry materials; the 8-channel column-aligned
 * shape can never fire). RED at base: the array form fell through unexpanded.
 */
describe('add_material expands an ARRAY of well range strings to concrete wells (Q-A canonical shape)', () => {
  const eventWells = (events: Array<{ details?: unknown }>): string[] =>
    events.map((e) => (e.details as Record<string, unknown>)['well'] as string);

  it('expands wells: ["A1:H1","A2:H2"] to the 16 CONCRETE per-well events (A1..H1 + A2..H2), no range-string key', () => {
    const events = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1:H1', 'A2:H2'], material: 'beads' },
    });
    const wells = eventWells(events);
    // 8 + 8 concrete per-well events — one per CONCRETE address, not one per range token.
    // Corner semantics (wellRange.ts): row LETTERS span rows, NUMBERS span columns —
    // A1:H1 = column 1 across rows A..H (the 8-channel column shape), A2:H2 = column 2.
    expect(events.length).toBe(16);
    expect(new Set(wells).size).toBe(16);
    expect(wells.sort()).toEqual(
      ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2'].sort(),
    );
    // The ledger-consumption contract: every emitted well parses as a well
    // address — NONE is a range string ("A1:H1" is exactly the defect).
    for (const w of wells) {
      expect(w).not.toContain(':');
    }
  });

  it('expands a mixed array ["A1","B1:H1"]: the concrete element passes through, the range element expands (dedupe keeps A1 once)', () => {
    const events = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1', 'B1:H1'], material: 'DMEM' },
    });
    const wells = eventWells(events);
    // B1:H1 = column 1 across rows B..H (7 wells) + singleton A1 = 8, A1 deduped to one
    expect(events.length).toBe(8);
    expect(wells.sort()).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'].sort());
    for (const w of wells) {
      expect(w).not.toContain(':');
    }
  });

  it('REGRESSION: a plain concrete array ["A1","B1"] is byte-unchanged (2 events, same keys, no dedupe surprise)', () => {
    const events = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1', 'B1'], material: 'DMEM' },
    });
    const wells = eventWells(events);
    expect(events.length).toBe(2);
    expect(wells).toEqual(['A1', 'B1']);
    // per-well legacy branch shape preserved: one details.well each, material carried
    for (const e of events) {
      const details = e.details as Record<string, unknown>;
      expect(details['material']).toBe('DMEM');
    }
  });

  it('REGRESSION: the undefined leg is unchanged (no wells, single modern event with details.well)', () => {
    const events = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', well: 'C3', material: 'DMEM' },
    });
    expect(events.length).toBe(1);
    const details = events[0]!.details as Record<string, unknown>;
    expect(details['well']).toBe('C3');
    expect('wells' in details).toBe(false);
  });
});
