/**
 * WellStateTrackingPass — unit tests (T5).
 * Covers the pure assessWellStates gloss (go/no + diagnostics) and the
 * Pass-shaped wrapper reading context.wellStateEvents.
 */

import { describe, it, expect } from 'vitest';
import {
  assessWellStates,
  createWellStateTrackingPass,
} from './WellStateTrackingPass.js';

const d1 = { id: 'MAT-dna', type: 'material' };

describe('assessWellStates', () => {
  it('go = true with zero diagnostics on a clean SPE flow', () => {
    const assessment = assessWellStates([
      { event_type: 'add_material', details: { wells: ['A1'], material_ref: d1, volume_uL: 200, concentration: { value: 10, unit: 'nM', basis: 'molar' } } },
      { event_type: 'magnetize', phase: 'adsorbed', details: { wells: ['A1'], materialRefs: ['MAT-dna'] } },
      { event_type: 'discard_supernatant', details: { wells: ['A1'], residualVolumeUl: 0 } },
      { event_type: 'wash', details: { wells: ['A1'], washVolume_uL: 500, cycles: 2 } },
      { event_type: 'elute', phase: 'adsorbed', details: { wells: ['A1'], elution_volume_uL: 50 } },
    ]);
    expect(assessment.go).toBe(true);
    expect(assessment.wellCount).toBe(1);
    expect(assessment.dirtyWells).toEqual([]);
    expect(assessment.diagnostics).toEqual([]);
  });

  it('go = false and a diagnostic when a magnetize names an unknown bound ref', () => {
    const assessment = assessWellStates([
      { event_type: 'add_material', details: { wells: ['A1'], material_ref: d1, volume_uL: 100, concentration: { value: 10, unit: 'nM', basis: 'molar' } } },
      { event_type: 'magnetize', phase: 'adsorbed', details: { wells: ['A1'], materialRefs: ['MAT-does-not-exist'] } },
    ]);
    expect(assessment.go).toBe(false);
    expect(assessment.dirtyWells).toContain('A1');
    expect(assessment.diagnostics.some((d) => d.includes('MAT-does-not-exist'))).toBe(true);
  });

  it('empty events → go = true, wellCount = 0', () => {
    const assessment = assessWellStates([]);
    expect(assessment.go).toBe(true);
    expect(assessment.wellCount).toBe(0);
  });
});

describe('createWellStateTrackingPass', () => {
  it('runs and emits an ok result + gloss from context.wellStateEvents', async () => {
    const pass = createWellStateTrackingPass();
    const result = await pass.run({
      pass_id: 'well_state_tracking',
      state: {
        input: {},
        context: {
          wellStateEvents: [
            { event_type: 'mix', details: { wells: ['A1'] } },
          ],
        },
        meta: {},
        outputs: new Map(),
        diagnostics: [],
      },
    });
    expect(result.ok).toBe(true);
    const output = result.output as { go: boolean; wellCount: number };
    expect(output.go).toBe(true);
    expect(output.wellCount).toBe(1);
  });

  it('no events in context → ok with zero wells (never gates)', async () => {
    const pass = createWellStateTrackingPass();
    const result = await pass.run({
      pass_id: 'well_state_tracking',
      state: {
        input: {},
        context: {},
        meta: {},
        outputs: new Map(),
        diagnostics: [],
      },
    });
    expect(result.ok).toBe(true);
    expect((result.output as { wellCount: number }).wellCount).toBe(0);
  });
});