import { describe, expect, it } from 'vitest';
import { getAddMaterialRef, getEventSummary, type AddMaterialDetails, type PlateEvent } from './events.js';

function addEvent(overrides: Partial<PlateEvent['details']> = {}): PlateEvent {
  return {
    eventId: 'evt-1',
    event_type: 'add_material',
    t_offset: 'PT0M',
    details: {
      wells: ['A1'],
      material_ref: { kind: 'record', id: 'TERM-heparg-4abc', type: 'term', label: 'HepaRG' },
      volume: { value: 100, unit: 'uL' },
      count: 50000,
      ...overrides,
    },
  };
}

describe('getEventSummary (biological add-material)', () => {
  it('renders count + condition chips + estimate mechanism for a biological seed', () => {
    const evt = addEvent({
      count_estimate: { measuredBy: 'hemocytometer', isEstimate: true },
      condition_refs: [
        { kind: 'record', id: 'anoxic', type: 'term', label: 'anoxic' },
        { kind: 'record', id: 'organ-on-a-chip', type: 'term', label: 'organ-on-a-chip' },
      ],
      biological_type: { kind: 'record', id: 'TERM-heparg-4abc', type: 'term', label: 'HepaRG' },
    });
    const s = getEventSummary(evt);
    expect(s).toContain('HepaRG');
    expect(s).toContain('50000');
    expect(s).toContain('100 uL');
    expect(s).toContain('hemocytometer');
    expect(s).toContain('anoxic');
    expect(s).toContain('organ-on-a-chip');
  });

  it('omits estimate/conditions when absent (chemical/volume-first unchanged)', () => {
    const s = getEventSummary(addEvent({ count: undefined, count_estimate: undefined, condition_refs: undefined }));
    expect(s).toContain('100 uL');
    expect(s).not.toContain('est.');
    expect(s).not.toContain('anoxic');
  });

  it('falls back to volume-only text for a chemical (no count, no estimate)', () => {
    const s = getEventSummary(addEvent({ count: undefined, volume: { value: 50, unit: 'uL' } }));
    expect(s).toContain('50 uL');
    expect(s).not.toContain(' · ');
  });
});

// L2-PROMPT1-GHOST-1 (b): the compiler writes the material NAME under the
// bare `details.material` key (real committed shape — scout receipt
// record-after.json). It was an UNDECLARED extra: getAddMaterialRef only
// read the five *_ref fields, so tooltip/ribbon/summary named no material.
// The ruled fix: `material` becomes declared data (AddMaterialDetails) and
// the LAST fallback of getAddMaterialRef — the five *_ref precedences are
// unchanged.
describe('getAddMaterialRef (L2-PROMPT1-GHOST-1)', () => {
  it('RED: a details.material-only details yields a ref (the real committed shape)', () => {
    const details: AddMaterialDetails = {
      material: 'Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells',
      volumeUl: 100,
      volume: { value: 100, unit: 'uL' },
      wells: ['A2', 'A3'],
    } as AddMaterialDetails;
    expect(getAddMaterialRef(details)).toBe('Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells');
  });

  it('precedence unchanged: every *_ref still wins over the bare material fallback', () => {
    const bare = { material: 'bare material name' } as AddMaterialDetails;
    const withAliquot = { ...bare, aliquot_ref: 'ALQ-1' } as AddMaterialDetails;
    const withInstance = { ...bare, material_instance_ref: 'MINS-1' } as AddMaterialDetails;
    const withSpec = { ...bare, material_spec_ref: 'MSPEC-1' } as AddMaterialDetails;
    const withVendor = { ...bare, vendor_product_ref: 'VEND-1' } as AddMaterialDetails;
    const withRef = { ...bare, material_ref: 'MAT-1' } as AddMaterialDetails;
    expect(getAddMaterialRef(withAliquot)).toBe('ALQ-1');
    expect(getAddMaterialRef(withInstance)).toBe('MINS-1');
    expect(getAddMaterialRef(withSpec)).toBe('MSPEC-1');
    expect(getAddMaterialRef(withVendor)).toBe('VEND-1');
    expect(getAddMaterialRef(withRef)).toBe('MAT-1');
    // The fallback only fills the gap: absent material -> still undefined.
    expect(getAddMaterialRef({} as AddMaterialDetails)).toBeUndefined();
  });
});