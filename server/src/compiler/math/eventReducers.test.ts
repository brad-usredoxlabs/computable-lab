/**
 * WellStateTracker — A4: trackRunningComposition walk over a real protocol
 * event chain. Golden Zymo MagBead flow through the event-adapter, plus a
 * multi-well transfer check.
 */

import { describe, it, expect } from 'vitest';
import { trackRunningComposition } from './eventReducers.js';

const A1 = 'A1';

function zymoEvents(): { event_type: string; phase?: 'soluble' | 'adsorbed'; details: Record<string, unknown> }[] {
  return [
    // 1) Add 200 uL sample @ 10 nM DNA
    {
      event_type: 'add_material',
      details: { wells: [A1], material_ref: { id: 'MAT-dna', type: 'material' }, volume: { value: 200, unit: 'uL' }, concentration: { value: 10, unit: 'nM', basis: 'molar' } },
    },
    // 2) Add 500 uL shield (no analyte)
    {
      event_type: 'add_material',
      details: { wells: [A1], material_ref: { id: 'MAT-shield', type: 'material' }, volume: { value: 500, unit: 'uL' }, concentration: { value: 100, unit: '% v/v', basis: 'volume_fraction' } },
    },
    // 3) Bind DNA to magnetic beads
    {
      event_type: 'magnetize',
      phase: 'adsorbed',
      details: { wells: [A1], materialRefs: ['MAT-dna'] },
    },
    // 4) Discard supernatant
    {
      event_type: 'discard_supernatant',
      details: { wells: [A1], residualVolumeUl: 0 },
    },
    // 5) Wash ×2
    {
      event_type: 'wash',
      details: { wells: [A1], bufferVolumeUl: 500, cycles: 2 },
    },
    // 6) Elute into 50 uL
    {
      event_type: 'elute',
      phase: 'adsorbed',
      details: { wells: [A1], elution_volume_uL: 50 },
    },
  ];
}

describe('A4 — trackRunningComposition golden Zymo flow', () => {
  it('elutes 40 nM of the DNA analyte after bind → discard → wash×2 (10× enrichment)', () => {
    const result = trackRunningComposition({ events: zymoEvents() });
    const fin = result.get(A1);
    expect(fin).toBeDefined();
    expect(fin!.volume_ul).toBe(50);
    // 2e-12 mol at 50 uL → 4e-8 M → 40 nM
    const conc = fin!.finalConcentrations.get('MAT-dna')!;
    expect(conc.value).toBeCloseTo(40, 4);
    expect(conc.unit).toBe('nM');
    // shield was a solvent (no trackable molar analyte); DNA fully soluble now
    expect(fin!.boundAmounts.get('MAT-dna')).toBeCloseTo(0, 20);
    expect(fin!.dirty).toBe(false);
  });

  it('an unknown well implicitly initializes at zero liquid volume', () => {
    const result = trackRunningComposition({
      events: [{ event_type: 'mix', details: { wells: ['B2'] } }],
    });
    const fin = result.get('B2');
    expect(fin).toBeDefined();
    expect(fin!.volume_ul).toBe(0);
  });

  it('initialWells seeds a starting liquid volume', () => {
    const result = trackRunningComposition({
      events: [
        { event_type: 'add_material', details: { wells: [A1], material_ref: 'MAT-x', volume_uL: 50, concentration: { value: 10, unit: 'nM', basis: 'molar' } } },
      ],
      initialWells: { [A1]: 100 },
    });
    const fin = result.get(A1)!;
    // 100 + 50 = 150 uL; 5e-13 mol / 150e-6 L = 3.333e-9 = 3.333 nM
    expect(fin.volume_ul).toBe(150);
    expect(fin.finalConcentrations.get('MAT-x')!.value).toBeCloseTo(10 / 3, 4);
  });

  it('a full-well transfer moves soluble composition between wells', () => {
    const result = trackRunningComposition({
      events: [
        { event_type: 'add_material', details: { wells: ['S'], material_ref: 'MAT-a', volume_uL: 100, concentration: { value: 10, unit: 'nM', basis: 'molar' } } },
        { event_type: 'transfer', details: { source_wells: ['S'], dest_wells: ['T'], transferVolumeUl: 100 } },
      ],
    });
    const sFin = result.get('S')!;
    const tFin = result.get('T')!;
    expect(sFin.finalConcentrations.get('MAT-a')).toBeUndefined(); // emptied
    expect(tFin.volume_ul).toBeCloseTo(100, 4);
    expect(tFin.finalConcentrations.get('MAT-a')!.value).toBeCloseTo(10, 4);
  });
});