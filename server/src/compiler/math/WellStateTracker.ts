/**
 * WellStateTracker — deterministic, step-wise well-concentration state tracker.
 *
 * Walks an ordered event list and carries each well's composition as
 * per-component AMOUNTS split into two compartments:
 *   soluble  — in the free solution (dilutable / mixable / removable by decant)
 *   bound    — immobilized on the solid phase (beads / pellet); NOT removable
 *              by discarding the supernatant
 *
 * Concentration is DERIVED (amount / volume), never stored, and differs by
 * compartment: C_soluble = soluble / volume_ul, whereas after an elution the
 * retained analyte is bound / elution_volume — the SPE reality that a purely
 * volumetric C₁V₁=C₂V₂ model gets wrong.
 *
 * This is the composition-carrying state machine that `formulationMath` /
 * `WorkingConcentrationResolver` seam into. All reducers are pure; a well is
 * mutated in place and returns void (caller owns the walk loop).
 */

import {
  concentrationToBase,
  concentrationFromBase,
} from '../../materials/formulationMath.js';
import type { Concentration } from '../../materials/concentration.js';

/** Compartment hint; the well-state tracker NEVER infers this from context. */
export type CompartmentPhase = 'soluble' | 'adsorbed';

/** Per-component amounts in the two compartments, in `basis` base units. */
export interface ComponentAmount {
  /** Amount in the free solution (moles / g / cells / fraction). */
  soluble: number;
  /** Amount immobilized on the solid phase (same base units). */
  bound: number;
  /** Basis the amounts are denominated in (molar, mass_per_volume, ...). */
  basis: string;
  /** Template concentration used to re-express base amounts as display units. */
  template: Concentration;
}

export interface WellState {
  wellId: string;
  volume_ul: number;
  components: Map<string, ComponentAmount>;
  /** True when a reducer hit a non-physical input (negative/overrun/unknown). */
  dirty: boolean;
  warnings: string[];
  /** True once the well has been homogenized by a mix step. */
  homogenized?: boolean;
}

export interface WellFinal {
  wellId: string;
  volume_ul: number;
  componentNames: string[];
  /** Derived free-solution concentration per component with a soluble amount. */
  finalConcentrations: Map<string, Concentration>;
  /** Soluble amount per component (base units). */
  solubleAmounts: Map<string, number>;
  /** Bound amount per component (base units). */
  boundAmounts: Map<string, number>;
  dirty: boolean;
  warnings: string[];
}

/** Create an empty well with the given starting liquid volume (uL). */
export function initWell(wellId: string, volume_ul = 0): WellState {
  return {
    wellId,
    volume_ul,
    components: new Map(),
    dirty: false,
    warnings: [],
  };
}

/** Track an amount of a component into a compartment (reconciling duplicates). */
export function addComponentAmount(
  well: WellState,
  ref: string,
  phase: CompartmentPhase,
  amountBase: number,
  template: Concentration,
): void {
  if (!Number.isFinite(amountBase) || amountBase < 0) {
    well.dirty = true;
    well.warnings.push(`addComponentAmount: non-positive amount (${amountBase}) for ${ref}`);
    return;
  }
  const existing = well.components.get(ref);
  if (existing) {
    if (phase === 'adsorbed') existing.bound += amountBase;
    else existing.soluble += amountBase;
    return;
  }
  well.components.set(ref, {
    soluble: phase === 'adsorbed' ? 0 : amountBase,
    bound: phase === 'adsorbed' ? amountBase : 0,
    basis: template.basis ?? 'molar',
    template,
  });
}

/** Derive the final per-component concentrations and amounts for a well. */
export function finalizeWell(well: WellState): WellFinal {
  const finalConcentrations = new Map<string, Concentration>();
  const volumeL = well.volume_ul * 1e-6;
  for (const [ref, comp] of well.components) {
    if (comp.soluble > 0 && volumeL > 0) {
      const basePerLiter = comp.soluble / volumeL;
      const conc = concentrationFromBase(basePerLiter, comp.template);
      if (conc) finalConcentrations.set(ref, conc);
    }
  }
  return {
    wellId: well.wellId,
    volume_ul: well.volume_ul,
    componentNames: [...well.components.keys()],
    finalConcentrations,
    solubleAmounts: new Map([...well.components].map(([r, c]) => [r, c.soluble])),
    boundAmounts: new Map([...well.components].map(([r, c]) => [r, c.bound])),
    dirty: well.dirty,
    warnings: [...well.warnings],
  };
}

// ── A2: volumetric C₁V₁=C₂V₂ reducers ────────────────────────────────────

export interface AddOp {
  kind: 'add';
  materialRef: string;
  volumeUl: number;
  phase?: CompartmentPhase;
  /** Stock concentration; amount added = conc × volume. */
  concentration?: Concentration;
  /** Explicit amount in base units (used when concentration is absent). */
  amountBase?: number;
}

export interface DiluteOp {
  kind: 'dilute';
  /** Volume of pure solvent/carrier (no analyte) to add. */
  addVolumeUl: number;
}

export interface MixOp {
  kind: 'mix';
}

export type VolumetricOp = AddOp | DiluteOp | MixOp;

function markDirty(well: WellState, message: string): void {
  well.dirty = true;
  well.warnings.push(message);
}

/** Add material: incoming amount + volume; concentration = amount / volume. */
export function reduceAdd(well: WellState, op: AddOp): void {
  if (!Number.isFinite(op.volumeUl) || op.volumeUl < 0) {
    markDirty(well, `reduceAdd: invalid volume (${op.volumeUl}) for ${op.materialRef}`);
    return;
  }
  let amountBase = op.amountBase;
  if (amountBase === undefined && op.concentration) {
    const perLiter = concentrationToBase(op.concentration);
    if (perLiter === undefined) {
      markDirty(well, `reduceAdd: cannot reduce concentration to base for ${op.materialRef}`);
      return;
    }
    // amount = conc (per L) × volume added (L)
    amountBase = perLiter * op.volumeUl * 1e-6;
  }
  if (amountBase === undefined) {
    markDirty(well, `reduceAdd: no amount or concentration for ${op.materialRef}`);
    return;
  }
  const phase = op.phase ?? 'soluble';
  well.volume_ul += op.volumeUl;
  addComponentAmount(
    well,
    op.materialRef,
    phase,
    amountBase,
    op.concentration ?? { value: 1, unit: 'uL', basis: phase === 'adsorbed' ? 'volume_fraction' : 'molar' },
  );
}

/** Dilute: add pure solvent; every soluble amount is unchanged, volume grows. */
export function reduceDilute(well: WellState, op: DiluteOp): void {
  if (!Number.isFinite(op.addVolumeUl) || op.addVolumeUl < 0) {
    markDirty(well, `reduceDilute: invalid volume (${op.addVolumeUl})`);
    return;
  }
  well.volume_ul += op.addVolumeUl;
}

/** Mix: no net volume/amount change; mark the well homogenized. */
export function reduceMix(well: WellState): void {
  well.homogenized = true;
}

/**
 * Transfer a fraction of the source well's LIQUID into the target. Soluble
 * components move proportionally; bound (solid-phase) components stay with the
 * source — a partial liquid transfer does not carry the pellet.
 */
export function reduceTransfer(source: WellState, target: WellState, volumeFraction: number): void {
  if (!Number.isFinite(volumeFraction) || volumeFraction < 0 || volumeFraction > 1) {
    markDirty(source, `reduceTransfer: invalid fraction (${volumeFraction})`);
    return;
  }
  const movedVolume = source.volume_ul * volumeFraction;
  source.volume_ul -= movedVolume;
  target.volume_ul += movedVolume;
  for (const [ref, comp] of source.components) {
    const moving = comp.soluble * volumeFraction;
    if (moving <= 0) continue;
    comp.soluble -= moving;
    addComponentAmount(target, ref, 'soluble', moving, comp.template);
  }
}

// ── A3: partitioning reducers (SPE / magnetize / discard / elute / wash) ──

export interface MagnetizeOp {
  kind: 'magnetize' | 'magnetize_incubate';
  /** Structural hint: this event binds the well's soluble content to the solid phase. */
  phase: 'adsorbed';
  /**
   * Optional selectivity: only bind these component refs. Absent = bind all
   * soluble components. Declaring the bound set is how SPE keeps non-binding
   * impurities soluble so the subsequent wash can remove them.
   */
  materialRefs?: string[];
}

export interface DiscardSupernatantOp {
  kind: 'discard_supernatant';
  /** Residual liquid volume retained after discarding (e.g. bead slurry). */
  residualVolumeUl: number;
}

export interface WashOp {
  kind: 'wash';
  /** Volume of wash buffer added each cycle. */
  bufferVolumeUl: number;
  /** Number of wash cycles (add → mix → discard). */
  washCount: number;
}

export interface EluteOp {
  kind: 'elute';
  /** Final elution volume the bound analyte is released into. */
  elutionVolumeUl: number;
  /** Structural hint: this event releases the bound/solid-phase analyte. */
  phase: 'adsorbed';
}

export interface ResuspendOp {
  kind: 'resuspend';
  /** Volume the resuspended pellet is brought to. */
  volumeUl: number;
  /** Structural hint: this event returns the bound/solid-phase analyte to solution. */
  phase: 'adsorbed';
}

export type PartitioningOp = MagnetizeOp | DiscardSupernatantOp | WashOp | EluteOp | ResuspendOp;

/**
 * Magnetize: bind soluble content onto the solid phase. Driven by the event's
 * declared `phase: 'adsorbed'` — the tracker does NOT infer which analytes are
 * magnetizable from context. When `materialRefs` is given, only those
 * components bind (non-binding impurities stay soluble and wash away); when
 * absent, all soluble components bind.
 */
export function reduceMagnetize(well: WellState, materialRefs?: string[]): void {
  if (materialRefs && materialRefs.length > 0) {
    for (const ref of materialRefs) {
      const comp = well.components.get(ref);
      if (!comp) {
        markDirty(well, `reduceMagnetize: unknown component ref '${ref}'`);
        continue;
      }
      comp.bound += comp.soluble;
      comp.soluble = 0;
    }
    return;
  }
  for (const comp of well.components.values()) {
    comp.bound += comp.soluble;
    comp.soluble = 0;
  }
}

/**
 * Discard supernatant: remove the entire liquid phase (all soluble components
 * go with it); bound components are retained on the solid. This is the step
 * that makes SPE correct — the retained elution concentration is NOT C₁V₁=C₂V₂.
 */
export function reduceDiscardSupernatant(well: WellState, residualVolumeUl: number): void {
  if (!Number.isFinite(residualVolumeUl) || residualVolumeUl < 0) {
    markDirty(well, `reduceDiscardSupernatant: invalid residual volume (${residualVolumeUl})`);
    return;
  }
  for (const comp of well.components.values()) {
    comp.soluble = 0;
  }
  well.volume_ul = residualVolumeUl;
}

/**
 * Wash: for each cycle, add buffer → mix → discard supernatant. Soluble
 * impurities are removed with each discard; bound analyte is retained. Net
 * effect after k washes: all soluble amounts → 0, bound untouched.
 */
export function reduceWash(well: WellState, bufferVolumeUl: number, washCount: number): void {
  if (!Number.isInteger(washCount) || washCount < 0) {
    markDirty(well, `reduceWash: invalid washCount (${washCount})`);
    return;
  }
  if (washCount === 0) return;
  if (!Number.isFinite(bufferVolumeUl) || bufferVolumeUl < 0) {
    markDirty(well, `reduceWash: invalid bufferVolumeUl (${bufferVolumeUl})`);
    return;
  }
  for (let i = 0; i < washCount; i++) {
    well.volume_ul += bufferVolumeUl; // add buffer
    well.homogenized = true; // mix
    // discard supernatant: remove all liquid + soluble
    for (const comp of well.components.values()) {
      comp.soluble = 0;
    }
    well.volume_ul = 0;
  }
}

/**
 * Elute: release the bound analyte into the elution volume. Concentration
 * becomes bound / elution_vol — an INCREASE relative to the removed supernatant,
 * the opposite of a dilution.
 */
export function reduceElute(well: WellState, elutionVolumeUl: number): void {
  if (!Number.isFinite(elutionVolumeUl) || elutionVolumeUl < 0) {
    markDirty(well, `reduceElute: invalid elution volume (${elutionVolumeUl})`);
    return;
  }
  for (const comp of well.components.values()) {
    comp.soluble = comp.bound;
    comp.bound = 0;
  }
  well.volume_ul = elutionVolumeUl;
}

/** Resuspend pellet: return the bound analyte to solution at a given volume. */
export function reduceResuspend(well: WellState, volumeUl: number): void {
  if (!Number.isFinite(volumeUl) || volumeUl < 0) {
    markDirty(well, `reduceResuspend: invalid volume (${volumeUl})`);
    return;
  }
  for (const comp of well.components.values()) {
    comp.soluble = comp.bound;
    comp.bound = 0;
  }
  well.volume_ul = volumeUl;
}
