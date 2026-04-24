/**
 * LabState tests — verify empty snapshot, create_container, add_material,
 * transfer, and immutability of applyEventToLabState.
 */

import { describe, expect, it } from 'vitest';
import {
  applyEventToLabState,
  emptyLabState,
  type LabStateSnapshot,
  type PlateEventPrimitive,
} from './LabState.js';

// ---------------------------------------------------------------------------
// Re-export PlateEventPrimitive for test convenience
// ---------------------------------------------------------------------------
import type { PlateEventPrimitive as _PEP } from '../biology/BiologyVerbExpander.js';

// ---------------------------------------------------------------------------
// Test: empty snapshot shape
// ---------------------------------------------------------------------------

describe('emptyLabState', () => {
  it('returns the right shape with mintCounter === 0 and turnIndex === 0', () => {
    const snapshot = emptyLabState();
    expect(snapshot.deck).toEqual([]);
    expect(snapshot.mountedPipettes).toEqual([]);
    expect(snapshot.labware).toEqual({});
    expect(snapshot.reservoirs).toEqual({});
    expect(snapshot.mintCounter).toBe(0);
    expect(snapshot.turnIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test: create_container adds deck + labware
// ---------------------------------------------------------------------------

describe('create_container', () => {
  it('adds a deck entry and a labware instance', () => {
    const snapshot = emptyLabState();
    const event: PlateEventPrimitive = {
      eventId: 'evt-create-1',
      event_type: 'create_container',
      details: {
        slot: 'target',
        labwareType: '96-well-deepwell-plate',
      },
    };

    const result = applyEventToLabState(snapshot, event);

    // Deck should have one entry
    expect(result.deck).toHaveLength(1);
    expect(result.deck[0].slot).toBe('target');
    expect(result.deck[0].labwareInstanceId).toBeDefined();

    const instanceId = result.deck[0].labwareInstanceId!;

    // Labware should exist
    expect(result.labware[instanceId]).toBeDefined();
    expect(result.labware[instanceId].labwareType).toBe('96-well-deepwell-plate');
    expect(result.labware[instanceId].slot).toBe('target');
    expect(result.labware[instanceId].orientation).toBe('landscape');
    expect(result.labware[instanceId].wells).toEqual({});

    // mintCounter should have incremented
    expect(result.mintCounter).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test: add_material adds a record
// ---------------------------------------------------------------------------

describe('add_material', () => {
  it('adds a material record to a well', () => {
    const snapshot = emptyLabState();

    // First create a container
    const createEvent: PlateEventPrimitive = {
      eventId: 'evt-create-2',
      event_type: 'create_container',
      details: {
        slot: 'A',
        labwareType: '96-well-plate',
      },
    };
    const withPlate = applyEventToLabState(snapshot, createEvent);
    const instanceId = withPlate.deck[0].labwareInstanceId!;

    // Now add material
    const addEvent: PlateEventPrimitive = {
      eventId: 'evt-add-1',
      event_type: 'add_material',
      details: {
        labwareInstanceId: instanceId,
        well: 'A1',
        material: {
          materialId: 'mat-sample-1',
          kind: 'fecal-sample',
          volumeUl: 100,
        },
      },
    };

    const result = applyEventToLabState(withPlate, addEvent);
    const wellMaterials = result.labware[instanceId].wells['A1'];

    expect(wellMaterials).toHaveLength(1);
    expect(wellMaterials![0].materialId).toBe('mat-sample-1');
    expect(wellMaterials![0].kind).toBe('fecal-sample');
    expect(wellMaterials![0].volumeUl).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Test: transfer moves volume
// ---------------------------------------------------------------------------

describe('transfer', () => {
  it('moves 50uL from well A1 to well A2', () => {
    const snapshot = emptyLabState();

    // Create a container
    const createEvent: PlateEventPrimitive = {
      eventId: 'evt-create-3',
      event_type: 'create_container',
      details: {
        slot: 'B',
        labwareType: '96-well-plate',
      },
    };
    const withPlate = applyEventToLabState(snapshot, createEvent);
    const instanceId = withPlate.deck[0].labwareInstanceId!;

    // Add material to A1
    const addEvent: PlateEventPrimitive = {
      eventId: 'evt-add-2',
      event_type: 'add_material',
      details: {
        labwareInstanceId: instanceId,
        well: 'A1',
        material: {
          materialId: 'mat-buffer',
          kind: 'binding-buffer',
          volumeUl: 200,
        },
      },
    };
    const withMaterial = applyEventToLabState(withPlate, addEvent);

    // Transfer 50uL from A1 to A2
    const transferEvent: PlateEventPrimitive = {
      eventId: 'evt-xfer-1',
      event_type: 'transfer',
      details: {
        from: {
          labwareInstanceId: instanceId,
          well: 'A1',
        },
        to: {
          labwareInstanceId: instanceId,
          well: 'A2',
        },
        volumeUl: 50,
      },
    };

    const result = applyEventToLabState(withMaterial, transferEvent);

    // Source should have remaining volume (200 - 50 = 150)
    const srcMaterials = result.labware[instanceId].wells['A1'];
    expect(srcMaterials).toHaveLength(1);
    expect(srcMaterials![0].volumeUl).toBe(150);

    // Destination should have a new record of volumeUl 50
    const dstMaterials = result.labware[instanceId].wells['A2'];
    expect(dstMaterials).toHaveLength(1);
    expect(dstMaterials![0].materialId).toBe('mat-buffer');
    expect(dstMaterials![0].volumeUl).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Test: immutability
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('does not mutate the input snapshot', () => {
    const snapshot = emptyLabState();

    // Create a container
    const createEvent: PlateEventPrimitive = {
      eventId: 'evt-create-4',
      event_type: 'create_container',
      details: {
        slot: 'C',
        labwareType: '96-well-plate',
      },
    };

    const originalCopy = structuredClone(snapshot);

    const result = applyEventToLabState(snapshot, createEvent);

    // Input should be unchanged
    expect(snapshot).toEqual(originalCopy);

    // Result should be different
    expect(result).not.toBe(snapshot);
    expect(result.deck).toHaveLength(1);
  });
});
