/**
 * WellStateTracker — partitioning reducers (A3): the SPE correctness core.
 *
 * The Zymo MagBead flow: bind the analyte to magnetic beads, discard the
 * supernatant, wash ×2 (removing soluble impurities while retaining the bound
 * analyte), then elute. The elution concentration is bound/elution_vol — an
 * INCREASE, not a C₁V₁=C₂V₂ dilution. A volumetric-only model gets this wrong.
 */

import { describe, it, expect } from 'vitest';
import {
  initWell,
  finalizeWell,
  reduceAdd,
  reduceMagnetize,
  reduceDiscardSupernatant,
  reduceWash,
  reduceElute,
  reduceResuspend,
} from './WellStateTracker.js';

const TEMPLATE_NM = { value: 1, unit: 'nM', basis: 'molar' as const };
const DNA_REF = 'MAT-dna';
const IMPURITY_REF = 'MAT-impurity';

describe('A3 — Zymo MagBead SPE flow', () => {
  it('elutes a 10× concentrated analyte after bind → discard → wash×2', () => {
    const w = initWell('A1', 0);
    // 1) Add 200 uL sample @ 10 nM DNA → 2e-12 mol soluble
    reduceAdd(w, { kind: 'add', materialRef: DNA_REF, volumeUl: 200, concentration: { value: 10, unit: 'nM', basis: 'molar' } });
    // 2) Add 500 uL shield (no analyte) → 700 uL; DNA diluted to 2.857 nM
    reduceAdd(w, { kind: 'add', materialRef: 'MAT-shield', volumeUl: 500, concentration: { value: 100, unit: '% v/v', basis: 'volume_fraction' } });
    // intermediate check: DNA still fully soluble
    expect(w.components.get(DNA_REF)!.soluble).toBeCloseTo(2e-12, 20);
    // 3) Magnetize (bind DNA)
    reduceMagnetize(w, [DNA_REF]);
    expect(w.components.get(DNA_REF)!.bound).toBeCloseTo(2e-12, 20);
    expect(w.components.get(DNA_REF)!.soluble).toBe(0);
    // 4) Discard supernatant
    reduceDiscardSupernatant(w, 0);
    expect(w.volume_ul).toBe(0);
    expect(w.components.get(DNA_REF)!.bound).toBeCloseTo(2e-12, 20);
    // 5) Wash ×2 — bound DNA retained, no soluble loss
    reduceWash(w, 500, 2);
    expect(w.components.get(DNA_REF)!.bound).toBeCloseTo(2e-12, 20);
    // 6) Elute into 50 uL → 2e-12 mol / 50e-6 L = 4e-8 M = 40 nM
    reduceElute(w, 50);
    expect(w.volume_ul).toBe(50);
    const fin = finalizeWell(w);
    const conc = fin.finalConcentrations.get(DNA_REF)!;
    expect(conc.value).toBeCloseTo(40, 4);
    expect(conc.unit).toBe('nM');
    // bound is spent, now fully soluble
    expect(fin.boundAmounts.get(DNA_REF)).toBeCloseTo(0, 20);
  });

  it('keeps non-binding impurities soluble so washes remove them', () => {
    const w = initWell('A1', 0);
    reduceAdd(w, { kind: 'add', materialRef: DNA_REF, volumeUl: 100, concentration: { value: 10, unit: 'nM', basis: 'molar' } });
    reduceAdd(w, { kind: 'add', materialRef: IMPURITY_REF, volumeUl: 100, concentration: { value: 1, unit: 'uM', basis: 'molar' } });
    // bind ONLY the DNA; the impurity stays soluble
    reduceMagnetize(w, [DNA_REF]);
    reduceDiscardSupernatant(w, 0);
    // the discard already removes all soluble (impurity + leftover buffer)
    expect(w.components.get(IMPURITY_REF)!.soluble).toBe(0);
    expect(w.components.get(IMPURITY_REF)!.bound).toBe(0);
    // DNA bound and retained
    expect(w.components.get(DNA_REF)!.bound).toBeCloseTo(1e-12, 20);
    // wash ×2 + elute
    reduceWash(w, 400, 2);
    reduceElute(w, 50);
    const fin = finalizeWell(w);
    // impurity is gone; DNA elutes at 1e-12/50e-6 = 2e-8 M = 20 nM
    expect(fin.finalConcentrations.has(IMPURITY_REF)).toBe(false);
    expect(fin.finalConcentrations.get(DNA_REF)!.value).toBeCloseTo(20, 4);
  });

  it('resuspend returns the bound analyte to solution at the resuspension volume', () => {
    const w = initWell('A1', 0);
    reduceAdd(w, { kind: 'add', materialRef: DNA_REF, volumeUl: 100, concentration: { value: 10, unit: 'nM', basis: 'molar' } });
    reduceMagnetize(w, [DNA_REF]);
    reduceDiscardSupernatant(w, 0);
    reduceResuspend(w, 20);
    expect(w.volume_ul).toBe(20);
    const fin = finalizeWell(w);
    // 1e-12 mol / 20e-6 L = 5e-8 M = 50 nM
    expect(fin.finalConcentrations.get(DNA_REF)!.value).toBeCloseTo(50, 4);
    expect(fin.boundAmounts.get(DNA_REF)).toBeCloseTo(0, 20);
  });

  it('magnetize with no refs binds everything (blanket)', () => {
    const w = initWell('A1', 0);
    reduceAdd(w, { kind: 'add', materialRef: 'A', volumeUl: 50, concentration: { value: 10, unit: 'nM', basis: 'molar' } });
    reduceAdd(w, { kind: 'add', materialRef: 'B', volumeUl: 50, concentration: { value: 10, unit: 'nM', basis: 'molar' } });
    reduceMagnetize(w);
    expect(w.components.get('A')!.soluble).toBe(0);
    expect(w.components.get('A')!.bound).toBeCloseTo(5e-13, 20);
    expect(w.components.get('B')!.soluble).toBe(0);
    expect(w.components.get('B')!.bound).toBeCloseTo(5e-13, 20);
  });

  it('flags a magnetize with an unknown ref as dirty (never silently drop)', () => {
    const w = initWell('A1', 0);
    reduceAdd(w, { kind: 'add', materialRef: DNA_REF, volumeUl: 100, concentration: { value: 10, unit: 'nM', basis: 'molar' } });
    reduceMagnetize(w, ['MAT-nonexistent']);
    expect(w.dirty).toBe(true);
  });
});
