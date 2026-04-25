/**
 * Tests for the compute_resources pass.
 */

import { describe, it, expect } from 'vitest';
import { createComputeResourcesPass } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import { emptyLabState } from '../../state/LabState.js';

// ---------------------------------------------------------------------------
// createComputeResourcesPass tests
// ---------------------------------------------------------------------------

describe('createComputeResourcesPass', () => {
  it('pass id is compute_resources and family is emit', () => {
    const pass = createComputeResourcesPass();
    expect(pass.id).toBe('compute_resources');
    expect(pass.family).toBe('emit');
  });

  it('empty events produces empty resource manifest', () => {
    const pass = createComputeResourcesPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { tipRacks: unknown[]; reservoirLoads: unknown[]; consumables: unknown[] } };
    expect(output.resourceManifest.tipRacks).toHaveLength(0);
    expect(output.resourceManifest.reservoirLoads).toHaveLength(0);
    expect(output.resourceManifest.consumables).toHaveLength(0);
  });

  it('100 transfer events with 8-channel pipette → 2 racks', () => {
    const pass = createComputeResourcesPass();

    // 100 transfer events with p300-multi (8 channels)
    // Each event consumes 1 tip → 100 tips
    // 100 / 96 = 1.04 → ceil = 2 racks
    const events: Array<{ eventId: string; event_type: string; details: Record<string, unknown> }> = [];
    for (let i = 0; i < 100; i++) {
      events.push({
        eventId: `evt-transfer-${i}`,
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-multi',
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
          volumeUl: 50,
        },
      });
    }

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { tipRacks: Array<{ pipetteType: string; rackCount: number }> } };
    expect(output.resourceManifest.tipRacks).toHaveLength(1);
    expect(output.resourceManifest.tipRacks[0].pipetteType).toBe('p300-multi');
    expect(output.resourceManifest.tipRacks[0].rackCount).toBe(2);
  });

  it('192 transfer events with 8-channel pipette → 2 racks', () => {
    const pass = createComputeResourcesPass();

    // 192 transfer events with p300-multi (8 channels)
    // Each event consumes 1 tip → 192 tips
    // 192 / 96 = 2.0 → ceil = 2 racks
    const events: Array<{ eventId: string; event_type: string; details: Record<string, unknown> }> = [];
    for (let i = 0; i < 192; i++) {
      events.push({
        eventId: `evt-transfer-${i}`,
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-multi',
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
          volumeUl: 50,
        },
      });
    }

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { tipRacks: Array<{ pipetteType: string; rackCount: number }> } };
    expect(output.resourceManifest.tipRacks).toHaveLength(1);
    expect(output.resourceManifest.tipRacks[0].rackCount).toBe(2);
  });

  it('mixed pipettes: 50 ops on 8ch + 30 ops on 12ch → separate rackCount entries', () => {
    const pass = createComputeResourcesPass();

    const events: Array<{ eventId: string; event_type: string; details: Record<string, unknown> }> = [];
    // 50 events on 8-channel
    for (let i = 0; i < 50; i++) {
      events.push({
        eventId: `evt-8ch-${i}`,
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-multi',
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
          volumeUl: 50,
        },
      });
    }
    // 30 events on 12-channel
    for (let i = 0; i < 30; i++) {
      events.push({
        eventId: `evt-12ch-${i}`,
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-12ch',
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
          volumeUl: 50,
        },
      });
    }

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { tipRacks: Array<{ pipetteType: string; rackCount: number }> } };
    expect(output.resourceManifest.tipRacks).toHaveLength(2);

    // 50 events * 1 tip = 50 tips → ceil(50/96) = 1 rack
    const eightCh = output.resourceManifest.tipRacks.find(r => r.pipetteType === 'p300-multi');
    expect(eightCh).toBeDefined();
    expect(eightCh!.rackCount).toBe(1);

    // 30 events * 1 tip = 30 tips → ceil(30/96) = 1 rack
    const twelveCh = output.resourceManifest.tipRacks.find(r => r.pipetteType === 'p300-12ch');
    expect(twelveCh).toBeDefined();
    expect(twelveCh!.rackCount).toBe(1);
  });

  it('reservoir loads aggregate same-well reagent volumes', () => {
    const pass = createComputeResourcesPass();

    const labState = emptyLabState();
    labState.reservoirs['reservoir-1'] = {
      reservoirInstanceId: 'reservoir-1',
      wellContents: {},
    };

    const events: Array<{ eventId: string; event_type: string; details: Record<string, unknown> }> = [
      {
        eventId: 'evt-1',
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-single',
          from: { labwareInstanceId: 'reservoir-1', well: 'A1' },
          to: { labwareInstanceId: 'plate-1', well: 'A1' },
          volumeUl: 50,
          material: { kind: 'buffer' },
        },
      },
      {
        eventId: 'evt-2',
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-single',
          from: { labwareInstanceId: 'reservoir-1', well: 'A1' },
          to: { labwareInstanceId: 'plate-1', well: 'B1' },
          volumeUl: 30,
          material: { kind: 'buffer' },
        },
      },
      {
        eventId: 'evt-3',
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-single',
          from: { labwareInstanceId: 'reservoir-1', well: 'A1' },
          to: { labwareInstanceId: 'plate-1', well: 'C1' },
          volumeUl: 20,
          material: { kind: 'lysis-buffer' },
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { reservoirLoads: Array<{ reservoirRef: string; well: string; reagentKind: string; volumeUl: number }> } };
    expect(output.resourceManifest.reservoirLoads).toHaveLength(2);

    // buffer in A1: 50 + 30 = 80
    const bufferLoad = output.resourceManifest.reservoirLoads.find(
      r => r.reservoirRef === 'reservoir-1' && r.well === 'A1' && r.reagentKind === 'buffer',
    );
    expect(bufferLoad).toBeDefined();
    expect(bufferLoad!.volumeUl).toBe(80);

    // lysis-buffer in A1: 20
    const lysisLoad = output.resourceManifest.reservoirLoads.find(
      r => r.reservoirRef === 'reservoir-1' && r.well === 'A1' && r.reagentKind === 'lysis-buffer',
    );
    expect(lysisLoad).toBeDefined();
    expect(lysisLoad!.volumeUl).toBe(20);
  });

  it('consumables lists labware not in deckLayoutPlan.pinned', () => {
    const pass = createComputeResourcesPass();

    const labState = emptyLabState();
    labState.labware['plate-1'] = {
      instanceId: 'plate-1',
      labwareType: '96-well-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {},
    };
    labState.labware['reservoir-1'] = {
      instanceId: 'reservoir-1',
      labwareType: 'reservoir-24-well',
      slot: 'B1',
      orientation: 'landscape',
      wells: {},
    };

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events: [] }],
        ['lab_state', {
          events: [],
          snapshotAfter: labState,
          deckLayoutPlan: {
            pinned: [{ slot: 'A1', labwareHint: '96-well-plate' }],
            unassigned: [],
          },
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { consumables: string[] } };
    // 96-well-plate is pinned, so only reservoir-24-well should be in consumables
    expect(output.resourceManifest.consumables).toContain('reservoir-24-well');
    expect(output.resourceManifest.consumables).not.toContain('96-well-plate');
  });

  it('non-pipetting events are ignored for tip counting', () => {
    const pass = createComputeResourcesPass();

    const events: Array<{ eventId: string; event_type: string; details: Record<string, unknown> }> = [
      {
        eventId: 'evt-transfer',
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-single',
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
          volumeUl: 50,
        },
      },
      {
        eventId: 'evt-incubate',
        event_type: 'incubate',
        details: {
          labwareInstanceId: 'plate-1',
          duration: 'PT2H',
        },
      },
      {
        eventId: 'evt-read',
        event_type: 'read',
        details: {
          labwareInstanceId: 'plate-1',
          instrument: 'plate-reader',
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { tipRacks: Array<{ pipetteType: string; rackCount: number }> } };
    // Only 1 transfer event → 1 tip → ceil(1/96) = 1 rack
    expect(output.resourceManifest.tipRacks).toHaveLength(1);
    expect(output.resourceManifest.tipRacks[0].rackCount).toBe(1);
  });

  it('add_material and mix events also consume tips', () => {
    const pass = createComputeResourcesPass();

    const events: Array<{ eventId: string; event_type: string; details: Record<string, unknown> }> = [
      {
        eventId: 'evt-add',
        event_type: 'add_material',
        details: {
          pipetteType: 'p20-single',
          labwareInstanceId: 'plate-1',
          well: 'A1',
          volumeUl: 10,
        },
      },
      {
        eventId: 'evt-mix',
        event_type: 'mix',
        details: {
          pipetteType: 'p20-single',
          labwareInstanceId: 'plate-1',
          well: 'A1',
          volumeUl: 20,
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { tipRacks: Array<{ pipetteType: string; rackCount: number }> } };
    // 2 events * 1 tip = 2 tips → ceil(2/96) = 1 rack
    expect(output.resourceManifest.tipRacks).toHaveLength(1);
    expect(output.resourceManifest.tipRacks[0].pipetteType).toBe('p20-single');
    expect(output.resourceManifest.tipRacks[0].rackCount).toBe(1);
  });

  it('unknown pipette type defaults to 1 channel', () => {
    const pass = createComputeResourcesPass();

    const events: Array<{ eventId: string; event_type: string; details: Record<string, unknown> }> = [
      {
        eventId: 'evt-unknown',
        event_type: 'transfer',
        details: {
          pipetteType: 'unknown-pipette',
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
          volumeUl: 50,
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { tipRacks: Array<{ pipetteType: string; rackCount: number }> } };
    expect(output.resourceManifest.tipRacks).toHaveLength(1);
    expect(output.resourceManifest.tipRacks[0].pipetteType).toBe('unknown-pipette');
    // 1 event * 1 tip = 1 tip → ceil(1/96) = 1 rack
    expect(output.resourceManifest.tipRacks[0].rackCount).toBe(1);
  });

  it('reservoir loads only include transfer events from reservoirs', () => {
    const pass = createComputeResourcesPass();

    const labState = emptyLabState();
    labState.reservoirs['reservoir-1'] = {
      reservoirInstanceId: 'reservoir-1',
      wellContents: {},
    };
    labState.labware['plate-1'] = {
      instanceId: 'plate-1',
      labwareType: '96-well-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {},
    };

    const events: Array<{ eventId: string; event_type: string; details: Record<string, unknown> }> = [
      // Transfer from reservoir → should be counted
      {
        eventId: 'evt-from-reservoir',
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-single',
          from: { labwareInstanceId: 'reservoir-1', well: 'A1' },
          to: { labwareInstanceId: 'plate-1', well: 'A1' },
          volumeUl: 100,
          material: { kind: 'buffer' },
        },
      },
      // Transfer from plate → should NOT be counted as reservoir load
      {
        eventId: 'evt-from-plate',
        event_type: 'transfer',
        details: {
          pipetteType: 'p300-single',
          from: { labwareInstanceId: 'plate-1', well: 'A1' },
          to: { labwareInstanceId: 'plate-1', well: 'B1' },
          volumeUl: 50,
          material: { kind: 'sample' },
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['compute_volumes', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_resources',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { resourceManifest: { reservoirLoads: Array<{ reservoirRef: string; well: string; reagentKind: string; volumeUl: number }> } };
    // Only 1 reservoir load (from reservoir-1)
    expect(output.resourceManifest.reservoirLoads).toHaveLength(1);
    expect(output.resourceManifest.reservoirLoads[0].reservoirRef).toBe('reservoir-1');
    expect(output.resourceManifest.reservoirLoads[0].volumeUl).toBe(100);
  });
});
