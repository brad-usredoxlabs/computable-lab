import { describe, expect, it } from 'vitest';
import { recoverInventedMaterialFields } from './recoverInventedMaterialFields.js';

/**
 * The exact draft from the 2026-09-20 transcript: the dose lived in an invented
 * top-level `materials` array, so the harness saw a quantity-less concept and
 * asked for "a volume and a concentration" the biologist had already given as
 * "10,000 cells".
 */
function transcriptDraft() {
  return {
    event_type: 'add_material',
    verb: 'add_material',
    details: {
      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
      wells: ['A2', 'A3', 'B2'],
      material_ref: { kind: 'local', label: 'HepG2 cells' },
    },
    materials: [
      { slot: 'target', role: 'cells', count: 10000, ref: { mint: { label: 'HepG2 cells', domain: 'cell_line' } } },
    ],
  };
}

describe('recoverInventedMaterialFields', () => {
  it('moves the count out of the invented field into the event', () => {
    const { events, notes } = recoverInventedMaterialFields([transcriptDraft()]);
    const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.count).toBe(10000);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('count 10000');
    expect(notes[0]).toContain('materials');
  });

  it('fills the declared ref with the domain the invented field carried (never overwrites it)', () => {
    const { events, notes } = recoverInventedMaterialFields([transcriptDraft()]);
    const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
    // The draft's own ref is kept as declared (`kind: local` → the gate asks
    // WHICH material), but it gains the domain, which selects the per-type rules.
    expect(details.material_ref).toMatchObject({ kind: 'local', label: 'HepG2 cells', domain: 'cell_line' });
    expect(notes.join(' ')).toContain('domain');
  });

  it('keeps a minted reference a mint when nothing declared one', () => {
    const draft = transcriptDraft();
    delete (draft.details as Record<string, unknown>).material_ref;
    const { events } = recoverInventedMaterialFields([draft]);
    const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toMatchObject({ kind: 'draft', id: 'mint:HepG2 cells', label: 'HepG2 cells' });
  });

  it('never overwrites a value the draft already declares', () => {
    const draft = transcriptDraft();
    (draft.details as Record<string, unknown>).count = 250;
    (draft.details as Record<string, unknown>).material_ref = { kind: 'record', id: 'MAT-1', label: 'already set' };
    const { events } = recoverInventedMaterialFields([draft]);
    const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.count).toBe(250);
    expect(details.material_ref).toMatchObject({ id: 'MAT-1' });
  });

  it('recovers a CURIE reference and the volume/concentration aliases too', () => {
    const event = {
      event_type: 'add_material',
      details: { wells: ['A1'] },
      materials: [{ count: 5, volume: { value: 10, unit: 'uL' }, concentration: { value: 1, unit: 'uM' }, curie: 'CHEBI:5001' }],
    };
    const { events } = recoverInventedMaterialFields([event]);
    const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.count).toBe(5);
    expect(details.volume).toEqual({ value: 10, unit: 'uL' });
    expect(details.concentration).toEqual({ value: 1, unit: 'uM' });
    expect(details.material_ref).toEqual({ kind: 'ontology', id: 'CHEBI:5001' });
  });

  it('also reads the array when it arrived inside details', () => {
    const event = { event_type: 'add_material', details: { wells: ['A1'], materials: [{ count: 7 }] } };
    const { events } = recoverInventedMaterialFields([event]);
    expect(((events[0] as Record<string, unknown>).details as Record<string, unknown>).count).toBe(7);
  });

  it('is a silent no-op for a draft with no invented field', () => {
    const clean = [{ event_type: 'add_material', details: { wells: ['A1'], count: 3 } }];
    const { events, notes } = recoverInventedMaterialFields(clean);
    expect(notes).toEqual([]);
    expect(events).toEqual(clean);
  });
});
