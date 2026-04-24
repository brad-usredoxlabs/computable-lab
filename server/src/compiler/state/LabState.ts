/**
 * LabState - Pure functions for lab-state snapshot management.
 *
 * This module defines the canonical LabStateSnapshot shape and provides
 * a pure function (applyEventToLabState) that folds PlateEventPrimitive
 * events into an immutable snapshot.
 */

import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LabwareOrientation = 'landscape' | 'portrait';

export interface DeckSlot {
  slot: string;
  labwareInstanceId?: string;
}

export interface MountedPipette {
  mountSide: 'left' | 'right';
  pipetteType: string;
  maxVolumeUl: number;
}

export interface LabwareInstance {
  instanceId: string;
  labwareType: string;
  slot: string;
  orientation: LabwareOrientation;
  wells: Record<string, MaterialRecord[]>;
}

export interface MaterialRecord {
  materialId: string;
  kind?: string;
  volumeUl?: number;
  properties?: Record<string, unknown>;
}

export interface ReservoirContents {
  reservoirInstanceId: string;
  wellContents: Record<string, MaterialRecord[]>;
}

export interface LabStateSnapshot {
  deck: DeckSlot[];
  mountedPipettes: MountedPipette[];
  labware: Record<string, LabwareInstance>;
  reservoirs: Record<string, ReservoirContents>;
  mintCounter: number;
  turnIndex: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function emptyLabState(): LabStateSnapshot {
  return {
    deck: [],
    mountedPipettes: [],
    labware: {},
    reservoirs: {},
    mintCounter: 0,
    turnIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers — deep-clone a snapshot for immutability
// ---------------------------------------------------------------------------

function cloneSnapshot(s: LabStateSnapshot): LabStateSnapshot {
  return structuredClone(s);
}

// ---------------------------------------------------------------------------
// Helpers — build a MaterialRecord without assigning undefined to optional props
// ---------------------------------------------------------------------------

function buildMaterialRecord(
  materialId: string,
  kind: string | undefined,
  volumeUl: number | undefined,
  properties: Record<string, unknown> | undefined,
): MaterialRecord {
  const record: MaterialRecord = { materialId };
  if (kind !== undefined) record.kind = kind;
  if (volumeUl !== undefined) record.volumeUl = volumeUl;
  if (properties !== undefined) record.properties = properties;
  return record;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function applyCreateContainer(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
): LabStateSnapshot {
  const details = event.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== 'object') {
    return snapshot;
  }

  const slot = details.slot as string | undefined;
  const labwareType = details.labwareType as string | undefined;

  if (!slot || !labwareType) {
    return snapshot;
  }

  const instanceId = `LWI-${snapshot.mintCounter + 1}`;

  const newSnapshot = cloneSnapshot(snapshot);

  // Update mintCounter
  newSnapshot.mintCounter += 1;

  // Add labware instance
  newSnapshot.labware[instanceId] = {
    instanceId,
    labwareType,
    slot,
    orientation: 'landscape',
    wells: {},
  };

  // Update or append deck slot
  const existingSlotIdx = newSnapshot.deck.findIndex((d) => d.slot === slot);
  if (existingSlotIdx >= 0) {
    newSnapshot.deck = newSnapshot.deck.map((d, i) =>
      i === existingSlotIdx
        ? { ...d, labwareInstanceId: instanceId }
        : d,
    );
  } else {
    newSnapshot.deck = [...newSnapshot.deck, { slot, labwareInstanceId: instanceId }];
  }

  return newSnapshot;
}

function applyAddMaterial(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
): LabStateSnapshot {
  const details = event.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== 'object') {
    return snapshot;
  }

  const labwareInstanceId = details.labwareInstanceId as string | undefined;
  const well = details.well as string | undefined;
  const material = details.material as Record<string, unknown> | undefined;

  if (!labwareInstanceId || !well || !material || typeof material !== 'object') {
    return snapshot;
  }

  const labware = snapshot.labware[labwareInstanceId];
  if (!labware) {
    return snapshot;
  }

  const materialId = material.materialId as string | undefined;
  if (!materialId) {
    return snapshot;
  }

  const newSnapshot = cloneSnapshot(snapshot);
  const targetLabware = newSnapshot.labware[labwareInstanceId]!;

  // Create the well key if it doesn't exist
  const existingWells = targetLabware.wells[well]
    ? structuredClone(targetLabware.wells[well])
    : [];

  const newRecord = buildMaterialRecord(
    materialId,
    material.kind as string | undefined,
    material.volumeUl as number | undefined,
    material.properties as Record<string, unknown> | undefined,
  );

  existingWells.push(newRecord);
  targetLabware.wells = { ...targetLabware.wells, [well]: existingWells };

  return newSnapshot;
}

function applyTransfer(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
): LabStateSnapshot {
  const details = event.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== 'object') {
    return snapshot;
  }

  const from = details.from as Record<string, unknown> | undefined;
  const to = details.to as Record<string, unknown> | undefined;
  const volumeUl = details.volumeUl as number | undefined;

  if (!from || !to || typeof from !== 'object' || typeof to !== 'object') {
    return snapshot;
  }

  const fromLabwareId = from.labwareInstanceId as string | undefined;
  const fromWell = from.well as string | undefined;
  const toLabwareId = to.labwareInstanceId as string | undefined;
  const toWell = to.well as string | undefined;

  if (!fromLabwareId || !fromWell || !toLabwareId || !toWell) {
    return snapshot;
  }

  const fromLabware = snapshot.labware[fromLabwareId];
  if (!fromLabware) {
    return snapshot;
  }

  const toLabware = snapshot.labware[toLabwareId];
  if (!toLabware) {
    return snapshot;
  }

  const newSnapshot = cloneSnapshot(snapshot);
  const srcLabware = newSnapshot.labware[fromLabwareId]!;
  const dstLabware = newSnapshot.labware[toLabwareId]!;

  // Get source well materials
  const srcMaterials = srcLabware.wells[fromWell]
    ? structuredClone(srcLabware.wells[fromWell])
    : [];

  if (srcMaterials.length === 0) {
    return newSnapshot;
  }

  // Calculate how much we can actually transfer
  const requested = volumeUl ?? 0;

  // Work from the top of the stack
  let transferred = 0;
  let sourceMaterialId: string | undefined;
  let sourceKind: string | undefined;
  let sourceProperties: Record<string, unknown> | undefined;

  let remaining = requested;
  while (remaining > 0 && srcMaterials.length > 0) {
    const top = srcMaterials[srcMaterials.length - 1]!;
    const available = top.volumeUl ?? 0;

    if (available <= 0) {
      srcMaterials.pop();
      continue;
    }

    const take = Math.min(remaining, available);
    transferred += take;
    remaining -= take;

    // Deduct volume from the top material's volumeUl directly
    top.volumeUl = available - take;

    // Track source material info for the destination record
    sourceMaterialId = top.materialId;
    sourceKind = top.kind;
    sourceProperties = top.properties;

    // If the top material is fully consumed, remove it
    if (top.volumeUl === 0) {
      srcMaterials.pop();
    }
  }

  // Update source well
  srcLabware.wells = { ...srcLabware.wells, [fromWell]: srcMaterials };

  // Add transferred material to destination
  const dstMaterials = dstLabware.wells[toWell]
    ? structuredClone(dstLabware.wells[toWell])
    : [];

  if (transferred > 0 && sourceMaterialId !== undefined) {
    dstMaterials.push(buildMaterialRecord(
      sourceMaterialId,
      sourceKind,
      transferred,
      sourceProperties,
    ));
  }

  dstLabware.wells = { ...dstLabware.wells, [toWell]: dstMaterials };

  return newSnapshot;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function applyEventToLabState(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
): LabStateSnapshot {
  switch (event.event_type) {
    case 'create_container':
      return applyCreateContainer(snapshot, event);
    case 'add_material':
      return applyAddMaterial(snapshot, event);
    case 'transfer':
      return applyTransfer(snapshot, event);
    default:
      // incubate/mix/read/centrifuge have no deck-state effect for now
      return snapshot;
  }
}
