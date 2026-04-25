/**
 * Tests for DirectiveNode type and applyDirectiveToLabState.
 */

import { describe, it, expect } from 'vitest';
import { applyDirectiveToLabState, type DirectiveNode } from './Directive.js';
import { emptyLabState, type LabStateSnapshot } from '../state/LabState.js';

// ---------------------------------------------------------------------------
// Helper: build a DirectiveNode with defaults
// ---------------------------------------------------------------------------

function makeDirective(
  kind: DirectiveNode['kind'],
  params: Record<string, unknown>,
  id = 'dir_1',
): DirectiveNode {
  return { directiveId: id, kind, params };
}

// ---------------------------------------------------------------------------
// reorient_labware tests
// ---------------------------------------------------------------------------

describe('applyDirectiveToLabState — reorient_labware', () => {
  it('flips orientation on the named labware instance', () => {
    const snapshot: LabStateSnapshot = {
      ...emptyLabState(),
      labware: {
        'plate-1': {
          instanceId: 'plate-1',
          labwareType: '96-well-plate',
          slot: 'A1',
          orientation: 'landscape',
          wells: {},
        },
      },
    };

    const directive = makeDirective('reorient_labware', {
      labwareInstanceId: 'plate-1',
      orientation: 'portrait',
    });

    const result = applyDirectiveToLabState(snapshot, directive);

    expect(result).not.toBe(snapshot); // immutable clone
    expect(result.labware['plate-1'].orientation).toBe('portrait');
    expect(snapshot.labware['plate-1'].orientation).toBe('landscape'); // original unchanged
  });

  it('flips orientation by labwareHint (instanceId match)', () => {
    const snapshot: LabStateSnapshot = {
      ...emptyLabState(),
      labware: {
        'plate-1': {
          instanceId: 'plate-1',
          labwareType: '96-well-plate',
          slot: 'A1',
          orientation: 'landscape',
          wells: {},
        },
      },
    };

    const directive = makeDirective('reorient_labware', {
      labwareHint: 'plate-1',
      orientation: 'portrait',
    });

    const result = applyDirectiveToLabState(snapshot, directive);

    expect(result.labware['plate-1'].orientation).toBe('portrait');
  });

  it('returns unchanged snapshot when labware not found', () => {
    const snapshot = emptyLabState();
    const directive = makeDirective('reorient_labware', {
      labwareInstanceId: 'nonexistent',
      orientation: 'portrait',
    });

    const result = applyDirectiveToLabState(snapshot, directive);
    expect(result).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// mount_pipette tests
// ---------------------------------------------------------------------------

describe('applyDirectiveToLabState — mount_pipette', () => {
  it('appends a MountedPipette to mountedPipettes', () => {
    const snapshot = emptyLabState();

    const directive = makeDirective('mount_pipette', {
      mountSide: 'left',
      pipetteType: 'p1000Single',
    });

    const result = applyDirectiveToLabState(snapshot, directive);

    expect(result.mountedPipettes).toHaveLength(1);
    expect(result.mountedPipettes[0]).toMatchObject({
      mountSide: 'left',
      pipetteType: 'p1000Single',
    });
    expect(result.mountedPipettes[0]!.maxVolumeUl).toBe(1000);
  });

  it('appends a second pipette without removing the first', () => {
    const snapshot = emptyLabState();

    const d1 = makeDirective('mount_pipette', {
      mountSide: 'left',
      pipetteType: 'p1000Single',
    });
    const d2 = makeDirective('mount_pipette', {
      mountSide: 'right',
      pipetteType: 'p300Multi',
    });

    const result1 = applyDirectiveToLabState(snapshot, d1);
    const result2 = applyDirectiveToLabState(result1, d2);

    expect(result2.mountedPipettes).toHaveLength(2);
    expect(result2.mountedPipettes[0]!.mountSide).toBe('left');
    expect(result2.mountedPipettes[1]!.mountSide).toBe('right');
  });
});

// ---------------------------------------------------------------------------
// swap_pipette tests
// ---------------------------------------------------------------------------

describe('applyDirectiveToLabState — swap_pipette', () => {
  it('replaces the pipette at the given mount side', () => {
    const snapshot: LabStateSnapshot = {
      ...emptyLabState(),
      mountedPipettes: [
        { mountSide: 'left', pipetteType: 'p300Multi', maxVolumeUl: 300 },
      ],
    };

    const directive = makeDirective('swap_pipette', {
      from: 'left',
      to: 'p1000Single',
    });

    const result = applyDirectiveToLabState(snapshot, directive);

    expect(result.mountedPipettes).toHaveLength(1);
    expect(result.mountedPipettes[0]).toMatchObject({
      mountSide: 'left',
      pipetteType: 'p1000Single',
      maxVolumeUl: 1000,
    });
  });

  it('adds a pipette when no existing pipette at that mount', () => {
    const snapshot = emptyLabState();

    const directive = makeDirective('swap_pipette', {
      from: 'left',
      to: 'p1000Single',
    });

    const result = applyDirectiveToLabState(snapshot, directive);

    expect(result.mountedPipettes).toHaveLength(1);
    expect(result.mountedPipettes[0]).toMatchObject({
      mountSide: 'left',
      pipetteType: 'p1000Single',
    });
  });
});
