/**
 * Tests for VolumeResolver — pure math for resolving placeholder volumes.
 */

import { describe, it, expect } from 'vitest';
import {
  isVolumePlaceholder,
  isJustEnough,
  isPercentOf,
  resolveJustEnough,
  resolvePercentOf,
  resolveVolumePlaceholder,
  LABWARE_WORKING_VOLUMES_UL,
  type VolumePlaceholder,
} from './VolumeResolver.js';
import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import { emptyLabState } from '../state/LabState.js';

// ---------------------------------------------------------------------------
// isVolumePlaceholder tests
// ---------------------------------------------------------------------------

describe('isVolumePlaceholder', () => {
  it('returns false for a concrete number', () => {
    expect(isVolumePlaceholder(100)).toBe(false);
    expect(isVolumePlaceholder(0)).toBe(false);
    expect(isVolumePlaceholder(3.14)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isVolumePlaceholder(null)).toBe(false);
    expect(isVolumePlaceholder(undefined)).toBe(false);
  });

  it('returns true for "just_enough"', () => {
    expect(isVolumePlaceholder('just_enough')).toBe(true);
  });

  it('returns true for "COMPUTED"', () => {
    expect(isVolumePlaceholder('COMPUTED')).toBe(true);
  });

  it('returns true for { percent, of } shape', () => {
    expect(isVolumePlaceholder({ percent: 1, of: '96-well-plate' })).toBe(true);
  });

  it('returns false for { percent } without of', () => {
    expect(isVolumePlaceholder({ percent: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isJustEnough tests
// ---------------------------------------------------------------------------

describe('isJustEnough', () => {
  it('matches "just_enough"', () => {
    expect(isJustEnough('just_enough')).toBe(true);
  });

  it('does not match other strings', () => {
    expect(isJustEnough('COMPUTED')).toBe(false);
    expect(isJustEnough('100')).toBe(false);
  });

  it('does not match numbers or objects', () => {
    expect(isJustEnough(100)).toBe(false);
    expect(isJustEnough({ percent: 1, of: 'x' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isPercentOf tests
// ---------------------------------------------------------------------------

describe('isPercentOf', () => {
  it('matches { percent: 1, of: "96-well-plate" }', () => {
    expect(isPercentOf({ percent: 1, of: '96-well-plate' })).toBe(true);
  });

  it('does not match missing of', () => {
    expect(isPercentOf({ percent: 1 })).toBe(false);
  });

  it('does not match missing percent', () => {
    expect(isPercentOf({ of: 'x' })).toBe(false);
  });

  it('does not match non-number percent', () => {
    expect(isPercentOf({ percent: '1', of: 'x' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveJustEnough tests
// ---------------------------------------------------------------------------

describe('resolveJustEnough', () => {
  function makeEvent(well: string, materialKind: string, volumeUl: number): PlateEventPrimitive {
    return {
      eventId: `evt-${well}`,
      event_type: 'add_material',
      details: {
        labwareInstanceId: 'plate-1',
        well,
        material: { materialId: `mat-${well}`, kind: materialKind },
        volumeUl,
      },
    };
  }

  it('sums downstream volumes and applies dead-volume multiplier', () => {
    const events: PlateEventPrimitive[] = [
      makeEvent('A1', 'binding-buffer', 50),
      makeEvent('A2', 'binding-buffer', 50),
      makeEvent('A3', 'binding-buffer', 50),
    ];
    const result = resolveJustEnough('binding-buffer', events, 1.15);
    expect(result).toBe(150 * 1.15); // 172.5
  });

  it('returns null when no downstream events match the reagent', () => {
    const events: PlateEventPrimitive[] = [
      makeEvent('A1', 'other-reagent', 50),
    ];
    expect(resolveJustEnough('binding-buffer', events)).toBeNull();
  });

  it('uses default dead-volume multiplier of 1.15', () => {
    const events: PlateEventPrimitive[] = [
      makeEvent('A1', 'reagent', 100),
    ];
    expect(resolveJustEnough('reagent', events)).toBeCloseTo(115);
  });

  it('uses custom dead-volume multiplier', () => {
    const events: PlateEventPrimitive[] = [
      makeEvent('A1', 'reagent', 100),
    ];
    expect(resolveJustEnough('reagent', events, 1.0)).toBe(100);
  });

  it('returns null when downstream events have no concrete volumes', () => {
    const events: PlateEventPrimitive[] = [
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          well: 'A1',
          material: { materialId: 'mat-1', kind: 'reagent' },
        },
      },
    ];
    expect(resolveJustEnough('reagent', events)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolvePercentOf tests
// ---------------------------------------------------------------------------

describe('resolvePercentOf', () => {
  it('computes 1% of 96-well-plate working volume (200 uL)', () => {
    const labState = emptyLabState();
    labState.labware['plate-1'] = {
      instanceId: 'plate-1',
      labwareType: '96-well-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {},
    };
    const result = resolvePercentOf(1, '96-well-plate', labState);
    expect(result).toBe(2); // 1% of 200
  });

  it('computes 50% of 96-well-deepwell-plate working volume (1500 uL)', () => {
    const labState = emptyLabState();
    labState.labware['deep-1'] = {
      instanceId: 'deep-1',
      labwareType: '96-well-deepwell-plate',
      slot: 'B1',
      orientation: 'landscape',
      wells: {},
    };
    const result = resolvePercentOf(50, '96-well-deepwell-plate', labState);
    expect(result).toBe(750); // 50% of 1500
  });

  it('computes 10% of 384-well-pcr-plate working volume (40 uL)', () => {
    const labState = emptyLabState();
    labState.labware['pcr-1'] = {
      instanceId: 'pcr-1',
      labwareType: '384-well-pcr-plate',
      slot: 'C1',
      orientation: 'landscape',
      wells: {},
    };
    const result = resolvePercentOf(10, '384-well-pcr-plate', labState);
    expect(result).toBe(4); // 10% of 40
  });

  it('looks up by instanceId when labwareType does not match', () => {
    const labState = emptyLabState();
    labState.labware['my-plate'] = {
      instanceId: 'my-plate',
      labwareType: '96-well-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {},
    };
    // Pass instanceId as ref
    const result = resolvePercentOf(10, 'my-plate', labState);
    expect(result).toBe(20); // 10% of 200
  });

  it('returns null when labware is not found', () => {
    const labState = emptyLabState();
    const result = resolvePercentOf(10, 'nonexistent-plate', labState);
    expect(result).toBeNull();
  });

  it('returns null for unknown labware type', () => {
    const labState = emptyLabState();
    labState.labware['plate-1'] = {
      instanceId: 'plate-1',
      labwareType: 'unknown-type',
      slot: 'A1',
      orientation: 'landscape',
      wells: {},
    };
    const result = resolvePercentOf(10, 'unknown-type', labState);
    expect(result).toBeNull();
  });

  it('uses LABWARE_WORKING_VOLUMES_UL defaults', () => {
    expect(LABWARE_WORKING_VOLUMES_UL['96-well-plate']).toBe(200);
    expect(LABWARE_WORKING_VOLUMES_UL['96-well-deepwell-plate']).toBe(1500);
    expect(LABWARE_WORKING_VOLUMES_UL['384-well-pcr-plate']).toBe(40);
    expect(LABWARE_WORKING_VOLUMES_UL['12-well-reservoir']).toBe(15000);
  });
});

// ---------------------------------------------------------------------------
// resolveVolumePlaceholder tests
// ---------------------------------------------------------------------------

describe('resolveVolumePlaceholder', () => {
  function makeEvent(well: string, materialKind: string, volumeUl: number): PlateEventPrimitive {
    return {
      eventId: `evt-${well}`,
      event_type: 'add_material',
      details: {
        labwareInstanceId: 'plate-1',
        well,
        material: { materialId: `mat-${well}`, kind: materialKind },
        volumeUl,
      },
    };
  }

  it('resolves "just_enough" to concrete uL', () => {
    const events: PlateEventPrimitive[] = [
      makeEvent('A1', 'buffer', 50),
      makeEvent('A2', 'buffer', 50),
    ];
    const labState = emptyLabState();
    const result = resolveVolumePlaceholder('just_enough', 'buffer', events, labState);
    expect(result.resolvedUl).toBeCloseTo(115); // 100 * 1.15
    expect(result.gap).toBeUndefined();
  });

  it('resolves { percent, of } to concrete uL', () => {
    const labState = emptyLabState();
    labState.labware['plate-1'] = {
      instanceId: 'plate-1',
      labwareType: '96-well-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {},
    };
    const events: PlateEventPrimitive[] = [];
    const result = resolveVolumePlaceholder(
      { percent: 10, of: '96-well-plate' },
      'reagent',
      events,
      labState,
    );
    expect(result.resolvedUl).toBe(20); // 10% of 200
    expect(result.gap).toBeUndefined();
  });

  it('returns gap for unresolvable placeholder', () => {
    const events: PlateEventPrimitive[] = [];
    const labState = emptyLabState();
    const result = resolveVolumePlaceholder('COMPUTED', 'reagent', events, labState);
    expect(result.resolvedUl).toBeNull();
    expect(result.gap).toContain('COMPUTED');
  });

  it('returns gap for just_enough with no downstream events', () => {
    const events: PlateEventPrimitive[] = [];
    const labState = emptyLabState();
    const result = resolveVolumePlaceholder('just_enough', 'buffer', events, labState);
    expect(result.resolvedUl).toBeNull();
    expect(result.gap).toContain('no downstream events');
  });

  it('returns gap for percent-of with missing labware', () => {
    const events: PlateEventPrimitive[] = [];
    const labState = emptyLabState();
    const result = resolveVolumePlaceholder(
      { percent: 10, of: 'missing-plate' },
      'reagent',
      events,
      labState,
    );
    expect(result.resolvedUl).toBeNull();
    expect(result.gap).toContain('labware not found');
  });
});
