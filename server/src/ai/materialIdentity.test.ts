import { describe, expect, it } from 'vitest';
import { eventMaterialIdentity, normalizeMaterialName, refNames } from './materialIdentity.js';

/**
 * The material identity is what decides whether a range of wells gets ONE
 * question — and whether an answer may reach a well at all. Brad's correction
 * (2026-09-20) is the invariant under test: a shared selection is NOT evidence
 * of a shared addition, so only an event that NAMES its material may fan an
 * answer out (see `explicit`).
 */
function addMaterial(details: Record<string, unknown>) {
  return { event_type: 'add_material', details };
}

describe('materialIdentity', () => {
  it('reads the nested mint label small models emit', () => {
    const identity = eventMaterialIdentity(addMaterial({ material_ref: { mint: { label: '  CloFibrate ' } } }));
    expect(identity).toEqual({ key: 'clofibrate', label: 'clofibrate', explicit: true });
  });

  it('prefers a ref’s own label over its id', () => {
    const identity = eventMaterialIdentity(
      addMaterial({ material_ref: { kind: 'record', id: 'MAT-1', type: 'material', label: 'HepG2' } }),
    );
    expect(identity.key).toBe('hepg2');
    expect(identity.explicit).toBe(true);
  });

  it('falls back to the note with innocent well tokens stripped, and marks it implicit', () => {
    // "add 100ul of 1mM clofibrate to A2" and the same text for B2 must group.
    const a = eventMaterialIdentity(addMaterial({ labwareId: 'p1', wells: ['A2'], note: 'Add 100ul of 1mM clofibrate to A2' }));
    const b = eventMaterialIdentity(addMaterial({ labwareId: 'p1', wells: ['B2'], note: 'Add 100ul of 1mM clofibrate to B2' }));
    expect(a.key).toBe(b.key);
    expect(a.explicit).toBe(false);
  });

  it('falls back to the labware for a draft that names nothing at all', () => {
    expect(eventMaterialIdentity(addMaterial({ labwareId: 'plate-9', wells: ['A1'] }))).toEqual({
      key: 'labware:plate-9',
      label: '',
      explicit: false,
    });
    expect(eventMaterialIdentity(addMaterial({ wells: ['A1'] })).key).toBe('unnamed');
  });

  it('keeps DIFFERENT materials apart', () => {
    const clofibrate = eventMaterialIdentity(addMaterial({ material_ref: { mint: { label: 'clofibrate' } } }));
    const rotenone = eventMaterialIdentity(addMaterial({ material_ref: { mint: { label: 'rotenone' } } }));
    expect(clofibrate.key).not.toBe(rotenone.key);
  });

  it('never claims an explicit signal for a note/labware fallback', () => {
    // The whole point of the flag: an implicit identity may group a QUESTION but
    // must never let one answer be written into another well.
    for (const details of [{ labwareId: 'p1', wells: ['A1'] }, { wells: ['A1'], note: 'add clofibrate' }]) {
      expect(eventMaterialIdentity(addMaterial(details)).explicit).toBe(false);
    }
  });

  it('normalizes names for comparison', () => {
    expect(normalizeMaterialName('  1 mM  Clofibrate in DMSO.  ')).toBe('1 mm clofibrate in dmso');
    expect(refNames({ label: 'X', mint: { label: 'Y' } })).toEqual(['x', 'y']);
    expect(refNames(null)).toEqual([]);
  });
});
