/**
 * WellStateTracker — unit tests for the well-state core (A1) and the
 * volumetric C₁V₁=C₂V₂ reducers (A2).
 *
 * The tracker carries each well's composition as per-component AMOUNTS split
 * into a soluble (free solution) and bound (solid-phase) compartment.
 * Concentration is derived (amount / volume), not stored.
 */

import { describe, it, expect } from 'vitest';
import {
  initWell,
  addComponentAmount,
  finalizeWell,
  reduceAdd,
  reduceDilute,
  reduceTransfer,
  reduceMix,
} from './WellStateTracker.js';

const TEMPLATE_UM = { value: 1, unit: 'uM', basis: 'molar' as const };
const TEMPLATE_NM = { value: 1, unit: 'nM', basis: 'molar' as const };

describe('A1 — WellState core', () => {
  it('initWell creates an empty well with the given volume', () => {
    const w = initWell('A1', 100);
    expect(w.wellId).toBe('A1');
    expect(w.volume_ul).toBe(100);
    expect(w.components.size).toBe(0);
    expect(w.dirty).toBe(false);
  });

  it('addComponentAmount adds a soluble amount', () => {
    const w = initWell('A1', 100);
    addComponentAmount(w, 'MAT-feno', 'soluble', 1e-10, TEMPLATE_UM);
    const comp = w.components.get('MAT-feno');
    expect(comp).toBeDefined();
    expect(comp!.soluble).toBeCloseTo(1e-10, 20);
    expect(comp!.bound).toBe(0);
  });

  it('addComponentAmount reconciles repeated additions of the same ref', () => {
    const w = initWell('A1', 100);
    addComponentAmount(w, 'MAT-feno', 'soluble', 1e-10, TEMPLATE_UM);
    addComponentAmount(w, 'MAT-feno', 'soluble', 2e-10, TEMPLATE_UM);
    expect(w.components.get('MAT-feno')!.soluble).toBeCloseTo(3e-10, 20);
    expect(w.components.size).toBe(1);
  });

  it('addComponentAmount routes an adsorbed amount into the bound compartment', () => {
    const w = initWell('A1', 100);
    addComponentAmount(w, 'MAT-anal', 'adsorbed', 5e-11, TEMPLATE_NM);
    const comp = w.components.get('MAT-anal')!;
    expect(comp.soluble).toBe(0);
    expect(comp.bound).toBeCloseTo(5e-11, 20);
  });

  it('finalizeWell derives soluble concentrations and lists components', () => {
    const w = initWell('A1', 100);
    // 1e-10 mol in 100 uL = 1e-10 / 1e-4 L = 1e-6 mol/L = 1 uM
    addComponentAmount(w, 'MAT-a', 'soluble', 1e-10, TEMPLATE_UM);
    addComponentAmount(w, 'MAT-b', 'adsorbed', 2e-10, TEMPLATE_NM);
    const fin = finalizeWell(w);
    expect(fin.componentNames).toEqual(['MAT-a', 'MAT-b']);
    const concA = fin.finalConcentrations.get('MAT-a');
    expect(concA).toBeDefined();
    expect(concA!.value).toBeCloseTo(1, 6);
    expect(concA!.unit).toBe('uM');
    // bound-only component has NO soluble concentration
    expect(fin.finalConcentrations.has('MAT-b')).toBe(false);
    expect(fin.boundAmounts.get('MAT-b')).toBeCloseTo(2e-10, 20);
  });
});

describe('A2 — volumetric reducers (C₁V₁=C₂V₂)', () => {
  it('reduceAdd grows volume and sets concentration = amount / volume', () => {
    const w = initWell('A1', 100);
    // add 100 uL of 1 uM → amount = 1e-6 mol/L × 100e-6 L = 1e-10 mol
    reduceAdd(w, { kind: 'add', materialRef: 'MAT-x', volumeUl: 100, concentration: TEMPLATE_UM });
    expect(w.volume_ul).toBe(200);
    const fin = finalizeWell(w);
    const conc = fin.finalConcentrations.get('MAT-x')!;
    // 1e-10 mol / 200e-6 L = 5e-7 mol/L = 0.5 uM
    expect(conc.value).toBeCloseTo(0.5, 6);
    expect(conc.unit).toBe('uM');
  });

  it('reduceAdd with an adsorbed phase routes into bound', () => {
    const w = initWell('A1', 100);
    reduceAdd(w, { kind: 'add', materialRef: 'MAT-bead', volumeUl: 50, concentration: TEMPLATE_NM, phase: 'adsorbed' });
    const fin = finalizeWell(w);
    // 1e-9 mol/L × 50e-6 L = 5e-14 mol bound; no soluble concentration
    expect(fin.boundAmounts.get('MAT-bead')).toBeCloseTo(5e-14, 20);
    expect(fin.finalConcentrations.has('MAT-bead')).toBe(false);
  });

  it('reduceDilute grows volume and halves concentration (amount unchanged)', () => {
    const w = initWell('A1', 100);
    reduceAdd(w, { kind: 'add', materialRef: 'MAT-x', volumeUl: 100, concentration: TEMPLATE_UM });
    // 200 uL @ 0.5 uM → add 100 uL pure → 300 uL @ 0.3333 uM
    reduceDilute(w, { kind: 'dilute', addVolumeUl: 100 });
    expect(w.volume_ul).toBe(300);
    const fin = finalizeWell(w);
    expect(fin.finalConcentrations.get('MAT-x')!.value).toBeCloseTo(1 / 3, 4);
    // amount preserved: 1e-10 mol still present
    expect(fin.solubleAmounts.get('MAT-x')).toBeCloseTo(1e-10, 20);
  });

  it('reduceMix does not change volume or amounts', () => {
    const w = initWell('A1', 100);
    reduceAdd(w, { kind: 'add', materialRef: 'MAT-x', volumeUl: 100, concentration: TEMPLATE_UM });
    const beforeVol = w.volume_ul;
    const beforeAmount = w.components.get('MAT-x')!.soluble;
    reduceMix(w);
    expect(w.volume_ul).toBe(beforeVol);
    expect(w.components.get('MAT-x')!.soluble).toBeCloseTo(beforeAmount, 20);
  });

  it('reduceTransfer splits soluble proportionally but keeps bound in source', () => {
    const src = initWell('S', 0);
    const tgt = initWell('T', 0);
    reduceAdd(src, { kind: 'add', materialRef: 'MAT-sol', volumeUl: 100, concentration: TEMPLATE_UM });
    reduceAdd(src, { kind: 'add', materialRef: 'MAT-bead', volumeUl: 50, concentration: TEMPLATE_NM, phase: 'adsorbed' });
    // 150 uL liquid @ 1e-10 mol soluble (from 100uL of 1uM) + bound
    reduceTransfer(src, tgt, 0.5);
    // half the liquid (75 uL) moves
    expect(src.volume_ul).toBeCloseTo(75, 6);
    expect(tgt.volume_ul).toBeCloseTo(75, 6);
    // half the soluble amount moves
    expect(src.components.get('MAT-sol')!.soluble).toBeCloseTo(5e-11, 20);
    expect(tgt.components.get('MAT-sol')!.soluble).toBeCloseTo(5e-11, 20);
    // bound stays entirely in source
    expect(src.components.get('MAT-bead')!.bound).toBeCloseTo(5e-14, 20);
    expect(tgt.components.has('MAT-bead')).toBe(false);
  });

  it('reduceTransfer clamps a full transfer to all soluble + all volume', () => {
    const src = initWell('S', 0);
    const tgt = initWell('T', 0);
    reduceAdd(src, { kind: 'add', materialRef: 'MAT-x', volumeUl: 100, concentration: TEMPLATE_UM });
    reduceTransfer(src, tgt, 1);
    expect(src.volume_ul).toBeCloseTo(0, 6);
    expect(tgt.volume_ul).toBeCloseTo(100, 6);
    expect(src.components.get('MAT-x')!.soluble).toBeCloseTo(0, 20);
    expect(tgt.components.get('MAT-x')!.soluble).toBeCloseTo(1e-10, 20);
  });
});
