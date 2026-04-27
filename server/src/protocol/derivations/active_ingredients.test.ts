import { describe, it, expect } from 'vitest';
import activeIngredients from './active_ingredients.js';
import { derivations } from './index.js';

describe('activeIngredients', () => {
  it('dispatch map has 7 entries', () => {
    expect(Object.keys(derivations).length).toBe(7);
  });

  // Case 1 — single-active formulation
  it('Case 1: single-active formulation returns sorted single-element array', () => {
    const result = activeIngredients({ analyte: 'clofibrate', solvent: 'DMSO' });
    expect(result).toEqual({ ok: true, value: ['clofibrate'] });
  });

  // Case 2 — multi-active cocktail (verifies sort and join semantics)
  it('Case 2: multi-active cocktail returns sorted deduped array', () => {
    const result = activeIngredients({
      ingredients: [
        { analyte: 'fenofibrate' },
        { analyte: 'clofibrate' },
        { analyte: 'gemfibrozil' },
      ],
      solvent: 'DMSO',
    });
    expect(result).toEqual({ ok: true, value: ['clofibrate', 'fenofibrate', 'gemfibrozil'] });
  });

  // Case 3 — named-material boundary (DMEM-style)
  it('Case 3: named-material boundary stops at top-level id', () => {
    const result = activeIngredients({
      id: 'DMEM',
      label: 'Dulbecco modified Eagle medium',
      ingredients: [{ analyte: 'glucose' }, { analyte: 'amino-acids' }],
    });
    expect(result).toEqual({ ok: true, value: ['DMEM'] });
  });

  // Case 4 — pure vehicle (no actives)
  it('Case 4: pure vehicle returns vehicle:<solvent_id>', () => {
    const result = activeIngredients({ solvent: 'DMSO' });
    expect(result).toEqual({ ok: true, value: ['vehicle:DMSO'] });
  });

  // Case 5 — pure vehicle with object-shaped solvent
  it('Case 5: pure vehicle with object-shaped solvent', () => {
    const result = activeIngredients({
      solvent: { id: 'DMSO', label: 'Dimethyl sulfoxide' },
    });
    expect(result).toEqual({ ok: true, value: ['vehicle:DMSO'] });
  });

  // Case 6 — duplicate active gets deduped
  it('Case 6: duplicate active gets deduped', () => {
    const result = activeIngredients({
      ingredients: [
        { analyte: 'clofibrate' },
        { analyte: 'clofibrate' },
      ],
      solvent: 'DMSO',
    });
    expect(result).toEqual({ ok: true, value: ['clofibrate'] });
  });

  // Case 7 — nested named material in ingredients list
  it('Case 7: nested named material in ingredients list', () => {
    const result = activeIngredients({
      ingredients: [
        { id: 'antibiotic-mix' },
        { analyte: 'clofibrate' },
      ],
      solvent: 'DMSO',
    });
    expect(result).toEqual({ ok: true, value: ['antibiotic-mix', 'clofibrate'] });
  });

  // Case 8 — invalid input
  it('Case 8: null input returns ok:false', () => {
    const result = activeIngredients(null);
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
    expect((result as { ok: false; reason: string }).reason.length).toBeGreaterThan(0);
  });

  it('Case 8: string input returns ok:false', () => {
    const result = activeIngredients('just a string');
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
    expect((result as { ok: false; reason: string }).reason.length).toBeGreaterThan(0);
  });
});
