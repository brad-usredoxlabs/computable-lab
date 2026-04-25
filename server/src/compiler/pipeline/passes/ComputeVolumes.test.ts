/**
 * Tests for the compute_volumes pass.
 */

import { describe, it, expect } from 'vitest';
import { createComputeVolumesPass } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import { emptyLabState } from '../../state/LabState.js';

// ---------------------------------------------------------------------------
// createComputeVolumesPass tests
// ---------------------------------------------------------------------------

describe('createComputeVolumesPass', () => {
  it('pass id is compute_volumes and family is expand', () => {
    const pass = createComputeVolumesPass();
    expect(pass.id).toBe('compute_volumes');
    expect(pass.family).toBe('expand');
  });

  it('events with concrete numeric volumes pass through unchanged', () => {
    const pass = createComputeVolumesPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', {
          events: [
            {
              eventId: 'evt-1',
              event_type: 'transfer',
              details: {
                volumeUl: 50,
                from: { labwareInstanceId: 'src', well: 'A1' },
                to: { labwareInstanceId: 'dst', well: 'A2' },
              },
            },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_volumes',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: { volumeUl: number } }> };
    expect(output.events).toHaveLength(1);
    expect(output.events[0].eventId).toBe('evt-1');
    expect(output.events[0].details.volumeUl).toBe(50);
  });

  it('events without volumeUl pass through unchanged', () => {
    const pass = createComputeVolumesPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', {
          events: [
            {
              eventId: 'evt-incubate',
              event_type: 'incubate',
              details: {
                labwareInstanceId: 'plate-1',
                duration: 'PT2H',
              },
            },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_volumes',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string }> };
    expect(output.events).toHaveLength(1);
    expect(output.events[0].eventId).toBe('evt-incubate');
  });

  it('just_enough resolves to concrete uL when downstream events exist', () => {
    const pass = createComputeVolumesPass();

    // Build events where the same reagent is consumed in multiple destinations
    const events = [
      {
        eventId: 'evt-dest-1',
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          well: 'A1',
          material: { kind: 'binding-buffer', materialId: 'mat-1' },
          volumeUl: 50,
        },
      },
      {
        eventId: 'evt-dest-2',
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          well: 'A2',
          material: { kind: 'binding-buffer', materialId: 'mat-2' },
          volumeUl: 50,
        },
      },
      {
        eventId: 'evt-source',
        event_type: 'transfer',
        details: {
          volumeUl: 'just_enough',
          from: { labwareInstanceId: 'reservoir-1', well: 'A1' },
          to: { labwareInstanceId: 'plate-1', well: 'A1' },
          material: { kind: 'binding-buffer' },
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_volumes',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: { volumeUl: number | string } }> };
    expect(output.events).toHaveLength(3);

    // Find the source transfer event
    const sourceEvent = output.events.find(e => e.eventId === 'evt-source');
    expect(sourceEvent).toBeDefined();
    // 50 + 50 = 100, * 1.15 = 115
    expect(sourceEvent!.details.volumeUl).toBe(115);
  });

  it('percent-of resolves to concrete uL', () => {
    const pass = createComputeVolumesPass();

    const labState = emptyLabState();
    labState.labware['plate-1'] = {
      instanceId: 'plate-1',
      labwareType: '96-well-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {},
    };

    const events = [
      {
        eventId: 'evt-percent',
        event_type: 'transfer',
        details: {
          volumeUl: { percent: 10, of: '96-well-plate' },
          from: { labwareInstanceId: 'reservoir-1', well: 'A1' },
          to: { labwareInstanceId: 'plate-1', well: 'A1' },
          material: { kind: 'buffer' },
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_volumes',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: { volumeUl: number } }> };
    expect(output.events).toHaveLength(1);
    // 10% of 200 = 20
    expect(output.events[0].details.volumeUl).toBe(20);
  });

  it('unresolvable placeholder produces a warning diagnostic', () => {
    const pass = createComputeVolumesPass();

    const events = [
      {
        eventId: 'evt-computed',
        event_type: 'transfer',
        details: {
          volumeUl: 'COMPUTED',
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
          material: { kind: 'unknown-reagent' },
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_volumes',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: { volumeUl: string } }> };
    expect(output.events).toHaveLength(1);
    // Event passes through with original placeholder
    expect(output.events[0].details.volumeUl).toBe('COMPUTED');

    // Should have a warning diagnostic
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0].severity).toBe('warning');
    expect(result.diagnostics![0].code).toBe('unresolvable_volume');
    expect(result.diagnostics![0].message).toContain('COMPUTED');
  });

  it('just_enough with no downstream events produces a gap diagnostic', () => {
    const pass = createComputeVolumesPass();

    const events = [
      {
        eventId: 'evt-no-downstream',
        event_type: 'transfer',
        details: {
          volumeUl: 'just_enough',
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
          material: { kind: 'orphan-reagent' },
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_volumes',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0].code).toBe('unresolvable_volume');
    expect(result.diagnostics![0].message).toContain('no downstream events');
  });

  it('percent-of with missing labware produces a gap diagnostic', () => {
    const pass = createComputeVolumesPass();

    const events = [
      {
        eventId: 'evt-missing-labware',
        event_type: 'transfer',
        details: {
          volumeUl: { percent: 5, of: 'nonexistent-plate' },
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
          material: { kind: 'buffer' },
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_volumes',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0].code).toBe('unresolvable_volume');
    expect(result.diagnostics![0].message).toContain('labware not found');
  });

  it('empty events input produces empty output with no diagnostics', () => {
    const pass = createComputeVolumesPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_volumes',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: unknown[] };
    expect(output.events).toHaveLength(0);
    expect(result.diagnostics).toBeUndefined();
  });

  it('mixed events: concrete, placeholder, and no-volume all handled correctly', () => {
    const pass = createComputeVolumesPass();

    const labState = emptyLabState();
    labState.labware['plate-1'] = {
      instanceId: 'plate-1',
      labwareType: '96-well-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {},
    };

    const events = [
      {
        eventId: 'evt-concrete',
        event_type: 'transfer',
        details: {
          volumeUl: 100,
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'dst', well: 'A1' },
        },
      },
      {
        eventId: 'evt-percent',
        event_type: 'transfer',
        details: {
          volumeUl: { percent: 50, of: '96-well-plate' },
          from: { labwareInstanceId: 'src', well: 'A1' },
          to: { labwareInstanceId: 'plate-1', well: 'A1' },
          material: { kind: 'buffer' },
        },
      },
      {
        eventId: 'evt-no-volume',
        event_type: 'incubate',
        details: {
          labwareInstanceId: 'plate-1',
          duration: 'PT1H',
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'compute_volumes',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(3);

    // Concrete event unchanged
    const concrete = output.events.find(e => e.eventId === 'evt-concrete');
    expect(concrete!.details.volumeUl).toBe(100);

    // Percent event resolved: 50% of 200 = 100
    const percent = output.events.find(e => e.eventId === 'evt-percent');
    expect(percent!.details.volumeUl).toBe(100);

    // No-volume event unchanged
    const noVolume = output.events.find(e => e.eventId === 'evt-no-volume');
    expect(noVolume).toBeDefined();
    expect(noVolume!.details.volumeUl).toBeUndefined();
  });
});
