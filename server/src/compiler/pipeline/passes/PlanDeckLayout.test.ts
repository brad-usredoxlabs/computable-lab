/**
 * Tests for the plan_deck_layout pass.
 */

import { describe, it, expect } from 'vitest';
import { createPlanDeckLayoutPass } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import { emptyLabState } from '../../state/LabState.js';

// ---------------------------------------------------------------------------
// createPlanDeckLayoutPass tests
// ---------------------------------------------------------------------------

describe('createPlanDeckLayoutPass', () => {
  it('pass id is plan_deck_layout and family is emit', () => {
    const pass = createPlanDeckLayoutPass();
    expect(pass.id).toBe('plan_deck_layout');
    expect(pass.family).toBe('emit');
  });

  it('3 labware with 1 pin → 1 pinned + 2 autoFilled', () => {
    const pass = createPlanDeckLayoutPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_labware', {
          labwareAdditions: [
            { recordId: '96-well-deepwell-plate', reason: 'proposed', deckSlot: 'A1' },
            { recordId: 'reservoir-24-well', reason: 'proposed' },
            { recordId: 'tiprack-p300', reason: 'proposed' },
          ],
          resolvedLabwares: [],
        }],
        ['compute_resources', {
          resourceManifest: {
            tipRacks: [],
            reservoirLoads: [],
            consumables: [],
          },
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'plan_deck_layout',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as {
      pinned: Array<{ slot: string; labwareHint: string }>;
      autoFilled: Array<{ slot: string; labwareHint: string; reason: string }>;
      conflicts: Array<{ slot: string; candidates: string[] }>;
    };

    // 1 pinned (96-well-deepwell-plate at A1)
    expect(output.pinned).toHaveLength(1);
    expect(output.pinned[0]).toEqual({ slot: 'A1', labwareHint: '96-well-deepwell-plate' });

    // 2 autoFilled (reservoir-24-well + tiprack-p300)
    expect(output.autoFilled).toHaveLength(2);
    expect(output.autoFilled[0].labwareHint).toBe('reservoir-24-well');
    expect(output.autoFilled[0].reason).toBe('autoFill');
    expect(output.autoFilled[1].labwareHint).toBe('tiprack-p300');
    expect(output.autoFilled[1].reason).toBe('autoFill');

    // No conflicts
    expect(output.conflicts).toHaveLength(0);
  });

  it('2 labware both pinned to C1 → 1 pinned + 1 conflict', () => {
    const pass = createPlanDeckLayoutPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_labware', {
          labwareAdditions: [
            { recordId: '96-well-plate', reason: 'proposed', deckSlot: 'C1' },
            { recordId: '24-well-plate', reason: 'proposed', deckSlot: 'C1' },
          ],
          resolvedLabwares: [],
        }],
        ['compute_resources', {
          resourceManifest: {
            tipRacks: [],
            reservoirLoads: [],
            consumables: [],
          },
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'plan_deck_layout',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as {
      pinned: Array<{ slot: string; labwareHint: string }>;
      autoFilled: Array<{ slot: string; labwareHint: string; reason: string }>;
      conflicts: Array<{ slot: string; candidates: string[] }>;
    };

    // 1 pinned (first-wins: 96-well-plate at C1)
    expect(output.pinned).toHaveLength(1);
    expect(output.pinned[0]).toEqual({ slot: 'C1', labwareHint: '96-well-plate' });

    // 1 conflict (24-well-plate tried to claim C1)
    expect(output.conflicts).toHaveLength(1);
    expect(output.conflicts[0].slot).toBe('C1');
    expect(output.conflicts[0].candidates).toEqual(['96-well-plate', '24-well-plate']);

    // No autoFilled
    expect(output.autoFilled).toHaveLength(0);
  });

  it('tipRacks from resourceManifest get auto-placed with reason=tipRack', () => {
    const pass = createPlanDeckLayoutPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_labware', {
          labwareAdditions: [
            { recordId: '96-well-deepwell-plate', reason: 'proposed', deckSlot: 'A1' },
          ],
          resolvedLabwares: [],
        }],
        ['compute_resources', {
          resourceManifest: {
            tipRacks: [
              { pipetteType: 'p300-multi', rackCount: 1 },
              { pipetteType: 'p20-single', rackCount: 1 },
            ],
            reservoirLoads: [],
            consumables: [],
          },
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'plan_deck_layout',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as {
      pinned: Array<{ slot: string; labwareHint: string }>;
      autoFilled: Array<{ slot: string; labwareHint: string; reason: string }>;
      conflicts: Array<{ slot: string; candidates: string[] }>;
    };

    // 1 pinned
    expect(output.pinned).toHaveLength(1);
    expect(output.pinned[0]).toEqual({ slot: 'A1', labwareHint: '96-well-deepwell-plate' });

    // 2 autoFilled tipRacks
    expect(output.autoFilled).toHaveLength(2);
    expect(output.autoFilled[0].reason).toBe('tipRack');
    expect(output.autoFilled[0].labwareHint).toBe('p300-multi');
    expect(output.autoFilled[1].reason).toBe('tipRack');
    expect(output.autoFilled[1].labwareHint).toBe('p20-single');
  });

  it('empty inputs produce empty plan', () => {
    const pass = createPlanDeckLayoutPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_labware', { labwareAdditions: [], resolvedLabwares: [] }],
        ['compute_resources', {
          resourceManifest: { tipRacks: [], reservoirLoads: [], consumables: [] },
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'plan_deck_layout',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as {
      pinned: unknown[];
      autoFilled: unknown[];
      conflicts: unknown[];
    };
    expect(output.pinned).toHaveLength(0);
    expect(output.autoFilled).toHaveLength(0);
    expect(output.conflicts).toHaveLength(0);
  });

  it('autoFill skips pinned slots in OT_DECK_SLOTS order', () => {
    const pass = createPlanDeckLayoutPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_labware', {
          labwareAdditions: [
            { recordId: 'plate-1', reason: 'proposed', deckSlot: 'B2' },
            { recordId: 'plate-2', reason: 'proposed' },
            { recordId: 'plate-3', reason: 'proposed' },
          ],
          resolvedLabwares: [],
        }],
        ['compute_resources', {
          resourceManifest: { tipRacks: [], reservoirLoads: [], consumables: [] },
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'plan_deck_layout',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as {
      pinned: Array<{ slot: string; labwareHint: string }>;
      autoFilled: Array<{ slot: string; labwareHint: string; reason: string }>;
      conflicts: Array<{ slot: string; candidates: string[] }>;
    };

    // plate-1 pinned at B2
    expect(output.pinned).toHaveLength(1);
    expect(output.pinned[0]).toEqual({ slot: 'B2', labwareHint: 'plate-1' });

    // plate-2 and plate-3 auto-filled at A1, A2 (skipping B2)
    expect(output.autoFilled).toHaveLength(2);
    expect(output.autoFilled[0].slot).toBe('A1');
    expect(output.autoFilled[0].labwareHint).toBe('plate-2');
    expect(output.autoFilled[1].slot).toBe('A2');
    expect(output.autoFilled[1].labwareHint).toBe('plate-3');
  });

  it('multiple conflicts on same slot are recorded together', () => {
    const pass = createPlanDeckLayoutPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_labware', {
          labwareAdditions: [
            { recordId: 'plate-a', reason: 'proposed', deckSlot: 'C1' },
            { recordId: 'plate-b', reason: 'proposed', deckSlot: 'C1' },
            { recordId: 'plate-c', reason: 'proposed', deckSlot: 'C1' },
          ],
          resolvedLabwares: [],
        }],
        ['compute_resources', {
          resourceManifest: { tipRacks: [], reservoirLoads: [], consumables: [] },
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'plan_deck_layout',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as {
      pinned: Array<{ slot: string; labwareHint: string }>;
      autoFilled: Array<{ slot: string; labwareHint: string; reason: string }>;
      conflicts: Array<{ slot: string; candidates: string[] }>;
    };

    // 1 pinned (first-wins)
    expect(output.pinned).toHaveLength(1);
    expect(output.pinned[0]).toEqual({ slot: 'C1', labwareHint: 'plate-a' });

    // 1 conflict with 3 candidates
    expect(output.conflicts).toHaveLength(1);
    expect(output.conflicts[0].slot).toBe('C1');
    expect(output.conflicts[0].candidates).toEqual(['plate-a', 'plate-b', 'plate-c']);
  });
});
