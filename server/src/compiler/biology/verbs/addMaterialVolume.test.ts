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
