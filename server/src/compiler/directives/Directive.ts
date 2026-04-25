/**
 * Directive - Pure functions for DirectiveNode type and lab-state folding.
 *
 * This module defines the DirectiveNode type (a second node family parallel
 * to PlateEventPrimitive) and provides applyDirectiveToLabState, a pure
 * function that folds DirectiveNode directives into an immutable
 * LabStateSnapshot.
 *
 * Directive kinds:
 *   - reorient_labware: flips the orientation of a named labware instance
 *   - mount_pipette:    appends a MountedPipette to mountedPipettes
 *   - swap_pipette:     replaces the pipette at a given mount side
 */

import type { LabStateSnapshot, LabwareOrientation, MountedPipette } from '../state/LabState.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DirectiveKind = 'reorient_labware' | 'mount_pipette' | 'swap_pipette';

export interface DirectiveNode {
  directiveId: string;
  kind: DirectiveKind;
  params: Record<string, unknown>;
  t_offset?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a single DirectiveNode to a LabStateSnapshot, returning a new
 * immutable snapshot with the directive's effect applied.
 */
export function applyDirectiveToLabState(
  snapshot: LabStateSnapshot,
  directive: DirectiveNode,
): LabStateSnapshot {
  switch (directive.kind) {
    case 'reorient_labware':
      return applyReorient(snapshot, directive);
    case 'mount_pipette':
      return applyMount(snapshot, directive);
    case 'swap_pipette':
      return applySwap(snapshot, directive);
    default:
      return snapshot;
  }
}

// ---------------------------------------------------------------------------
// Helpers — deep-clone a snapshot for immutability
// ---------------------------------------------------------------------------

function cloneSnapshot(s: LabStateSnapshot): LabStateSnapshot {
  return structuredClone(s);
}

// ---------------------------------------------------------------------------
// Directive handlers
// ---------------------------------------------------------------------------

/**
 * Reorient a labware instance.
 * Reads params.labwareHint or params.labwareInstanceId to find the target,
 * then reads params.orientation to set the new orientation.
 */
function applyReorient(
  snapshot: LabStateSnapshot,
  directive: DirectiveNode,
): LabStateSnapshot {
  const params = directive.params as Record<string, unknown>;
  const labwareHint = params.labwareHint as string | undefined;
  const labwareInstanceId = params.labwareInstanceId as string | undefined;
  const orientation = params.orientation as LabwareOrientation | undefined;

  if (!orientation) {
    return snapshot;
  }

  // Find the target labware instance
  const targetInstanceId =
    labwareInstanceId ??
    (labwareHint
      ? Object.keys(snapshot.labware).find(
          (id) => snapshot.labware[id].instanceId === labwareHint,
        )
      : undefined);

  if (!targetInstanceId || !snapshot.labware[targetInstanceId]) {
    return snapshot;
  }

  const newSnapshot = cloneSnapshot(snapshot);
  newSnapshot.labware[targetInstanceId] = {
    ...newSnapshot.labware[targetInstanceId]!,
    orientation,
  };

  return newSnapshot;
}

/**
 * Mount a pipette.
 * Reads params.mountSide + params.pipetteType; appends to mountedPipettes.
 */
function applyMount(
  snapshot: LabStateSnapshot,
  directive: DirectiveNode,
): LabStateSnapshot {
  const params = directive.params as Record<string, unknown>;
  const mountSide = params.mountSide as 'left' | 'right' | undefined;
  const pipetteType = params.pipetteType as string | undefined;

  if (!mountSide || !pipetteType) {
    return snapshot;
  }

  const newSnapshot = cloneSnapshot(snapshot);
  newSnapshot.mountedPipettes = [
    ...newSnapshot.mountedPipettes,
    {
      mountSide,
      pipetteType,
      maxVolumeUl: pipetteType.includes('50') ? 50 : pipetteType.includes('1000') ? 1000 : 50,
    },
  ];

  return newSnapshot;
}

/**
 * Swap a pipette on a mount.
 * Reads params.from (mountSide) + params.to (pipetteType); replaces the
 * pipette at that mount.
 */
function applySwap(
  snapshot: LabStateSnapshot,
  directive: DirectiveNode,
): LabStateSnapshot {
  const params = directive.params as Record<string, unknown>;
  const from = params.from as 'left' | 'right' | undefined;
  const to = params.to as string | undefined;

  if (!from || !to) {
    return snapshot;
  }

  const newSnapshot = cloneSnapshot(snapshot);
  const idx = newSnapshot.mountedPipettes.findIndex(
    (p) => p.mountSide === from,
  );

  if (idx >= 0) {
    newSnapshot.mountedPipettes = [
      ...newSnapshot.mountedPipettes.slice(0, idx),
      {
        mountSide: from,
        pipetteType: to,
        maxVolumeUl: to.includes('50') ? 50 : to.includes('1000') ? 1000 : 50,
      },
      ...newSnapshot.mountedPipettes.slice(idx + 1),
    ];
  } else {
    // No existing pipette at that mount — just add it
    newSnapshot.mountedPipettes = [
      ...newSnapshot.mountedPipettes,
      {
        mountSide: from,
        pipetteType: to,
        maxVolumeUl: to.includes('50') ? 50 : to.includes('1000') ? 1000 : 50,
      },
    ];
  }

  return newSnapshot;
}
