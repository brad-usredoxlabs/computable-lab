/**
 * WellStateTracker — A4: trackRunningComposition public API over an event list.
 *
 * Walks an ordered list of PlateEvent-shaped events, adapting each to the
 * appropriate well-state reducer per well, and returns the final derived
 * composition per well. This is the composition-carrying state machine that
 * runs over the compiled event graph.
 */

import {
  initWell,
  finalizeWell,
  reduceAdd,
  reduceDilute,
  reduceMix,
  reduceTransfer,
  reduceMagnetize,
  reduceDiscardSupernatant,
  reduceWash,
  reduceElute,
  reduceResuspend,
  type WellState,
  type WellFinal,
  type CompartmentPhase,
  type AddOp,
} from './WellStateTracker.js';
import type { Concentration } from '../../materials/concentration.js';

/** Minimal structural shape of a PlateEvent the tracker can consume. */
export interface PlateEventLike {
  eventId?: string;
  event_type: string;
  phase?: CompartmentPhase;
  details: Record<string, unknown>;
}

export interface TrackCompositionRequest {
  events: PlateEventLike[];
  /** wellId -> starting liquid volume (uL). */
  initialWells?: Record<string, number>;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function parseVolume(details: Record<string, unknown>): number | undefined {
  const vol = details.volume as { value?: unknown; unit?: unknown } | undefined;
  if (vol && typeof vol.value === 'number') {
    const unit = typeof vol.unit === 'string' ? vol.unit : 'uL';
    if (unit === 'uL' || unit === 'ul' || unit === 'µL') return vol.value;
    if (unit === 'mL') return vol.value * 1000;
    if (unit === 'L') return vol.value * 1e6;
  }
  return num(details.volume_uL) ?? num(details.volumeUl) ?? num(details.addVolumeUl) ?? num(details.elution_volume_uL);
}

function refToId(ref: unknown): string | undefined {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object') {
    const r = ref as { id?: unknown };
    if (typeof r.id === 'string') return r.id;
  }
  return undefined;
}

function materialRefs(details: Record<string, unknown>): string[] | undefined {
  const refs = details.materialRefs as unknown;
  if (Array.isArray(refs) && refs.length > 0) {
    const ids = refs.map(refToId).filter((x): x is string => typeof x === 'string');
    if (ids.length) return ids;
  }
  return undefined;
}

/** The wells an event applies to (payload wells or transfer wells). */
function eventWellIds(event: PlateEventLike): string[] {
  const details = event.details;
  if (Array.isArray(details.wells) && details.wells.length > 0) {
    return (details.wells as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  return [];
}

function adaptAdd(well: WellState, event: PlateEventLike, materialRef: string, volumeUl: number): void {
  const details = event.details;
  const phase = event.phase ?? 'soluble';
  const op: AddOp = {
    kind: 'add',
    materialRef,
    volumeUl,
    phase,
    ...(details.concentration ? { concentration: details.concentration as Concentration } : {}),
  };
  reduceAdd(well, op);
}

function forEachTargetWell(
  wells: Map<string, WellState>,
  event: PlateEventLike,
  initialWells: Record<string, number>,
  fn: (w: WellState, wellId: string) => void,
): void {
  const ids = eventWellIds(event);
  for (const wellId of ids) {
    let w = wells.get(wellId);
    if (!w) {
      w = initWell(wellId, initialWells[wellId] ?? 0);
      wells.set(wellId, w);
    }
    fn(w, wellId);
  }
}

/**
 * Walk an ordered event list and produce the final derived composition per
 * well (a Map<wellId, WellFinal>). Volumes/amounts are the inputs; amount is
 * tracked per component and split into soluble/bound compartments; the
 * concentration is derived (amount / volume). Deterministic.
 */
export function trackRunningComposition({ events, initialWells = {} }: TrackCompositionRequest): Map<string, WellFinal> {
  const wells = new Map<string, WellState>();

  for (const event of events) {
    const details = event.details;
    switch (event.event_type) {
      case 'add_material': {
        const ref = refToId(details.material_ref ?? details.materialRef) ?? 'material';
        const volumeUl = parseVolume(details);
        if (volumeUl === undefined) {
          forEachTargetWell(wells, event, initialWells, (w) => {
            w.dirty = true;
            w.warnings.push(`add_material: no volume for ${ref}`);
          });
          break;
        }
        forEachTargetWell(wells, event, initialWells, (w) => adaptAdd(w, event, ref, volumeUl));
        break;
      }
      case 'dilute': {
        const v = parseVolume(details) ?? num(details.addVolumeUl);
        forEachTargetWell(wells, event, initialWells, (w) => {
          if (v === undefined) {
            w.dirty = true;
            w.warnings.push('dilute: no volume');
          } else {
            reduceDilute(w, { kind: 'dilute', addVolumeUl: v });
          }
        });
        break;
      }
      case 'mix':
        forEachTargetWell(wells, event, initialWells, (w) => reduceMix(w));
        break;
      case 'wash': {
        const vol = num(details.washVolume_uL) ?? num(details.washVolumeUl) ?? parseVolume(details) ?? num(details.bufferVolumeUl);
        const cycles = num(details.cycles ?? details.washCount) ?? 1;
        forEachTargetWell(wells, event, initialWells, (w) => {
          if (vol === undefined) {
            w.dirty = true;
            w.warnings.push('wash: no buffer volume');
          } else {
            reduceWash(w, vol, cycles);
          }
        });
        break;
      }
      case 'magnetize':
      case 'magnetize_incubate':
        forEachTargetWell(wells, event, initialWells, (w) => reduceMagnetize(w, materialRefs(details)));
        break;
      case 'discard_supernatant':
      case 'remove_supernatant':
      case 'decant':
      case 'discard': {
        const residual = num(details.residualVolumeUl ?? details.residual_volume_uL) ?? 0;
        forEachTargetWell(wells, event, initialWells, (w) => reduceDiscardSupernatant(w, residual));
        break;
      }
      case 'elute': {
        const vol = num(details.elution_volume_uL) ?? num(details.elutionVolumeUl) ?? parseVolume(details);
        forEachTargetWell(wells, event, initialWells, (w) => {
          if (vol === undefined) {
            w.dirty = true;
            w.warnings.push('elute: no elution volume');
          } else {
            reduceElute(w, vol);
          }
        });
        break;
      }
      case 'resuspend': {
        const vol = num(details.volume_uL) ?? num(details.resuspension_volume_uL) ?? num(details.volumeUl);
        forEachTargetWell(wells, event, initialWells, (w) => {
          if (vol === undefined) {
            w.dirty = true;
            w.warnings.push('resuspend: no volume');
          } else {
            reduceResuspend(w, vol);
          }
        });
        break;
      }
      case 'transfer': {
        const sources = (details.source_wells as unknown[] | undefined) ?? (details.sourceWells as unknown[] | undefined);
        const dests = (details.dest_wells as unknown[] | undefined) ?? (details.destWells as unknown[] | undefined);
        const transferVolume = num(details.transferVolumeUl ?? details.transfer_volume_uL);
        if (!sources || !dests || sources.length === 0 || dests.length === 0 || transferVolume === undefined) break;
        for (const dstId of dests.filter((x): x is string => typeof x === 'string')) {
          const target = initWell(dstId, initialWells[dstId] ?? 0);
          wells.set(dstId, (wells.get(dstId) ?? target));
        }
        for (const srcId of sources.filter((x): x is string => typeof x === 'string')) {
          const src = wells.get(srcId) ?? initWell(srcId, initialWells[srcId] ?? 0);
          wells.set(srcId, src);
          for (const dstId of dests.filter((x): x is string => typeof x === 'string')) {
            const tgt = wells.get(dstId)!;
            const frac = src.volume_ul > 0 ? Math.min(1, transferVolume / src.volume_ul) : 0;
            reduceTransfer(src, tgt, frac);
          }
        }
        break;
      }
      case 'harvest':
      default:
        // harvest / observers / genealogy: read-only, no state change
        break;
    }
  }

  const result = new Map<string, WellFinal>();
  for (const [wellId, w] of wells) result.set(wellId, finalizeWell(w));
  return result;
}