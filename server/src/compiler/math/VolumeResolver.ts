/**
 * VolumeResolver - Pure math for resolving placeholder volumes to concrete uL.
 *
 * Handles three placeholder forms:
 *   - 'just_enough' — sum per-destination volumes for a reagent, apply dead-volume multiplier
 *   - { percent: N, of: '<ref>' } — N% of a referenced labware's working volume
 *   - 'COMPUTED' or any other non-numeric string — surfaced as a gap (never throws)
 */

import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { LabStateSnapshot } from '../state/LabState.js';

// ---------------------------------------------------------------------------
// Known labware working volumes (uL)
// ---------------------------------------------------------------------------

export const LABWARE_WORKING_VOLUMES_UL: Record<string, number> = {
  '96-well-plate': 200,
  '96-well-deepwell-plate': 1500,
  '384-well-pcr-plate': 40,
  '12-well-reservoir': 15000,
};

// ---------------------------------------------------------------------------
// Volume placeholder types
// ---------------------------------------------------------------------------

/** A volume placeholder that is the literal string 'just_enough'. */
export type JustEnoughPlaceholder = 'just_enough';

/** A volume placeholder that is { percent: N, of: '<labware-hint>' }. */
export interface PercentOfPlaceholder {
  percent: number;
  of: string;
}

/** A volume placeholder that is any other non-numeric string (e.g. 'COMPUTED'). */
export type GenericPlaceholder = string;

/** Union of all volume placeholder shapes. */
export type VolumePlaceholder =
  | JustEnoughPlaceholder
  | PercentOfPlaceholder
  | GenericPlaceholder;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a value is a volume placeholder (non-numeric).
 */
export function isVolumePlaceholder(
  value: unknown,
): value is VolumePlaceholder {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return false;
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    // { percent: N, of: '<ref>' } shape
    if (
      typeof obj.percent === 'number' &&
      typeof obj.of === 'string'
    ) {
      return true;
    }
    return false;
  }
  // String placeholder (e.g. 'just_enough', 'COMPUTED')
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a value is the 'just_enough' placeholder.
 */
export function isJustEnough(value: unknown): value is JustEnoughPlaceholder {
  return value === 'just_enough';
}

/**
 * Check if a value is a { percent, of } placeholder.
 */
export function isPercentOf(
  value: unknown,
): value is PercentOfPlaceholder {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.percent === 'number' &&
    typeof obj.of === 'string' &&
    obj.of.length > 0
  );
}

// ---------------------------------------------------------------------------
// resolveJustEnough
// ---------------------------------------------------------------------------

/**
 * Resolve a 'just_enough' volume placeholder.
 *
 * Sums per-destination-event volumes needed for the given reagent across
 * the compile, applies a dead-volume multiplier (default 1.15), and returns
 * the total source-side volume.
 *
 * @param reagentKind — material kind to match downstream events against
 * @param events — all events in the compile (used to find downstream consumers)
 * @param deadVolumeMultiplier — multiplier for dead volume (default 1.15)
 * @returns concrete uL value, or null if no downstream events found
 */
export function resolveJustEnough(
  reagentKind: string,
  events: PlateEventPrimitive[],
  deadVolumeMultiplier = 1.15,
): number | null {
  const downstream = events.filter(
    e =>
      (e.details as { material?: { kind?: string } }).material?.kind ===
      reagentKind,
  );
  if (downstream.length === 0) return null;

  const sum = downstream.reduce(
    (acc, e) =>
      acc + Number((e.details as { volumeUl?: number }).volumeUl ?? 0),
    0,
  );
  return sum * deadVolumeMultiplier;
}

// ---------------------------------------------------------------------------
// resolvePercentOf
// ---------------------------------------------------------------------------

/**
 * Resolve a { percent: N, of: '<ref>' } volume placeholder.
 *
 * Looks up the referenced labware's working volume (labware has a
 * workingVolumeUl property — default 200uL for 96-well) and computes
 * N% of it.
 *
 * @param percent — percentage value (e.g. 1 for 1%)
 * @param refLabwareHint — labware type or instanceId to look up
 * @param labState — current lab-state snapshot
 * @returns concrete uL value, or null if labware not found
 */
export function resolvePercentOf(
  percent: number,
  refLabwareHint: string,
  labState: LabStateSnapshot,
): number | null {
  const instance = Object.values(labState.labware).find(
    l => l.labwareType === refLabwareHint || l.instanceId === refLabwareHint,
  );
  const working =
    LABWARE_WORKING_VOLUMES_UL[instance?.labwareType ?? refLabwareHint] ??
    null;
  if (working === null) return null;
  return (percent / 100) * working;
}

// ---------------------------------------------------------------------------
// resolveVolumePlaceholder (public API)
// ---------------------------------------------------------------------------

/**
 * Result of resolving a single volume placeholder.
 */
export interface VolumeResolutionResult {
  /** The resolved concrete volume in uL, or null if unresolvable. */
  resolvedUl: number | null;
  /** Gap diagnostic message if resolution failed, or undefined. */
  gap?: string;
}

/**
 * Resolve a single volume placeholder to a concrete uL value.
 *
 * - 'just_enough' → calls resolveJustEnough (needs reagentKind + events)
 * - { percent, of } → calls resolvePercentOf (needs labState)
 * - Other non-numeric strings → returns gap (unresolvable)
 *
 * @param placeholder — the placeholder value from event.details.volumeUl
 * @param reagentKind — material kind (required for 'just_enough')
 * @param events — all events (required for 'just_enough')
 * @param labState — lab-state snapshot (required for percent-of)
 * @returns resolution result with concrete value or gap message
 */
export function resolveVolumePlaceholder(
  placeholder: VolumePlaceholder,
  reagentKind: string,
  events: PlateEventPrimitive[],
  labState: LabStateSnapshot,
): VolumeResolutionResult {
  // 'just_enough'
  if (isJustEnough(placeholder)) {
    const resolved = resolveJustEnough(reagentKind, events);
    if (resolved === null) {
      return {
        resolvedUl: null,
        gap: `Cannot resolve 'just_enough' for reagent '${reagentKind}': no downstream events found`,
      };
    }
    return { resolvedUl: resolved };
  }

  // { percent, of }
  if (isPercentOf(placeholder)) {
    const resolved = resolvePercentOf(placeholder.percent, placeholder.of, labState);
    if (resolved === null) {
      return {
        resolvedUl: null,
        gap: `Cannot resolve percent-of for '${placeholder.of}': labware not found in labState`,
      };
    }
    return { resolvedUl: resolved };
  }

  // Generic placeholder (e.g. 'COMPUTED')
  return {
    resolvedUl: null,
    gap: `Unresolvable volume placeholder '${String(placeholder)}' for reagent '${reagentKind}'; manual review required`,
  };
}
