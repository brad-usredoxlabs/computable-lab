/**
 * Tests for the resolve_roles pass and RoleResolver.
 */

import { describe, it, expect } from 'vitest';
import { defaultRoleResolver } from '../../roles/RoleResolver.js';
import { createResolveRolesPass } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import type { LabStateSnapshot } from '../../state/LabState.js';
import { emptyLabState } from '../../state/LabState.js';

// ---------------------------------------------------------------------------
// RoleResolver tests
// ---------------------------------------------------------------------------

describe('defaultRoleResolver', () => {
  it('cell_region in landscape returns 60 wells (rows B-G, cols 2-11)', () => {
    const ctx = {
      orientation: 'landscape' as const,
      labwareType: '96-well-plate',
    };
    const wells = defaultRoleResolver('cell_region', ctx);
    expect(wells).toHaveLength(60);

    // Verify first and last wells
    expect(wells[0]).toBe('B2');
    expect(wells[wells.length - 1]).toBe('G11');

    // Verify all expected wells are present
    const expected = new Set<string>();
    for (const row of ['B', 'C', 'D', 'E', 'F', 'G']) {
      for (let col = 2; col <= 11; col++) {
        expected.add(`${row}${col}`);
      }
    }
    expect(new Set(wells)).toEqual(expected);
  });

  it('cell_region in portrait returns 48 wells (rows C-J, cols 2-7)', () => {
    const ctx = {
      orientation: 'portrait' as const,
      labwareType: '96-well-plate',
    };
    const wells = defaultRoleResolver('cell_region', ctx);
    expect(wells).toHaveLength(48);

    // Verify first and last wells
    expect(wells[0]).toBe('C2');
    expect(wells[wells.length - 1]).toBe('J7');
  });

  it('control_well always returns A12', () => {
    const ctx = {
      orientation: 'landscape' as const,
      labwareType: '96-well-plate',
    };
    expect(defaultRoleResolver('control_well', ctx)).toEqual(['A12']);
  });

  it('perturbant_col_3 returns rows B-G in column 3', () => {
    const ctx = {
      orientation: 'landscape' as const,
      labwareType: '96-well-plate',
    };
    const wells = defaultRoleResolver('perturbant_col_3', ctx);
    expect(wells).toHaveLength(6);
    expect(wells).toEqual(['B3', 'C3', 'D3', 'E3', 'F3', 'G3']);
  });

  it('perturbant_col_1 returns rows B-G in column 1', () => {
    const ctx = {
      orientation: 'landscape' as const,
      labwareType: '96-well-plate',
    };
    const wells = defaultRoleResolver('perturbant_col_1', ctx);
    expect(wells).toHaveLength(6);
    expect(wells).toEqual(['B1', 'C1', 'D1', 'E1', 'F1', 'G1']);
  });

  it('triplicate_foo with startCol=1 returns 3 columns (B-G × 1-3)', () => {
    const ctx = {
      orientation: 'landscape' as const,
      labwareType: '96-well-plate',
      args: { startCol: 1 },
    };
    const wells = defaultRoleResolver('triplicate_foo', ctx);
    expect(wells).toHaveLength(18); // 6 rows × 3 cols
    expect(wells).toEqual([
      'B1', 'C1', 'D1', 'E1', 'F1', 'G1',
      'B2', 'C2', 'D2', 'E2', 'F2', 'G2',
      'B3', 'C3', 'D3', 'E3', 'F3', 'G3',
    ]);
  });

  it('triplicate_bar with startCol=5 returns 3 columns (B-G × 5-7)', () => {
    const ctx = {
      orientation: 'landscape' as const,
      labwareType: '96-well-plate',
      args: { startCol: 5 },
    };
    const wells = defaultRoleResolver('triplicate_bar', ctx);
    expect(wells).toHaveLength(18);
    expect(wells).toEqual([
      'B5', 'C5', 'D5', 'E5', 'F5', 'G5',
      'B6', 'C6', 'D6', 'E6', 'F6', 'G6',
      'B7', 'C7', 'D7', 'E7', 'F7', 'G7',
    ]);
  });

  it('unknown role returns empty array', () => {
    const ctx = {
      orientation: 'landscape' as const,
      labwareType: '96-well-plate',
    };
    expect(defaultRoleResolver('unknown_role_xyz', ctx)).toEqual([]);
  });

  it('cell_region on non-96 labware returns empty array', () => {
    const ctx = {
      orientation: 'landscape' as const,
      labwareType: '384-well-plate',
    };
    expect(defaultRoleResolver('cell_region', ctx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolve_roles pass tests
// ---------------------------------------------------------------------------

describe('createResolveRolesPass', () => {
  it('pass id is resolve_roles and family is expand', () => {
    const pass = createResolveRolesPass();
    expect(pass.id).toBe('resolve_roles');
    expect(pass.family).toBe('expand');
  });

  it('events without role pass through unchanged', () => {
    const pass = createResolveRolesPass();

    const mockState: PipelineState = {
      input: {
        labState: emptyLabState(),
      },
      context: {},
      meta: {},
      outputs: new Map([
        ['mint_materials', {
          events: [
            {
              eventId: 'evt-1',
              event_type: 'add_material',
              details: { labwareInstanceId: 'plate-1', well: 'A1' },
            },
          ],
        }],
        ['expand_patterns', { events: [] }],
        ['expand_biology_verbs', { events: [] }],
        ['expand_protocol', { events: [] }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(1);
    expect(output.events[0].eventId).toBe('evt-1');
    expect(output.events[0].details.well).toBe('A1');
  });

  it('events with role: cell_region in landscape expand to 60 events', () => {
    const pass = createResolveRolesPass();

    const labState: LabStateSnapshot = {
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

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['mint_materials', {
          events: [
            {
              eventId: 'evt-cell-seed',
              event_type: 'add_material',
              details: {
                labwareInstanceId: 'plate-1',
                role: 'cell_region',
                material: { kind: 'HeLa' },
              },
            },
          ],
        }],
        ['expand_patterns', { events: [] }],
        ['expand_biology_verbs', { events: [] }],
        ['expand_protocol', { events: [] }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(60);

    // Verify no events still have a role field
    for (const ev of output.events) {
      expect(ev.details.role).toBeUndefined();
      expect(ev.details.well).toBeDefined();
    }

    // Verify first and last well
    const wells = output.events.map(e => e.details.well);
    expect(wells[0]).toBe('B2');
    expect(wells[wells.length - 1]).toBe('G11');

    // Verify all expected wells are present
    const expected = new Set<string>();
    for (const row of ['B', 'C', 'D', 'E', 'F', 'G']) {
      for (let col = 2; col <= 11; col++) {
        expected.add(`${row}${col}`);
      }
    }
    expect(new Set(wells)).toEqual(expected);
  });

  it('events with role: cell_region in portrait expand to 48 events', () => {
    const pass = createResolveRolesPass();

    const labState: LabStateSnapshot = {
      ...emptyLabState(),
      labware: {
        'plate-1': {
          instanceId: 'plate-1',
          labwareType: '96-well-plate',
          slot: 'A1',
          orientation: 'portrait',
          wells: {},
        },
      },
    };

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['mint_materials', {
          events: [
            {
              eventId: 'evt-cell-seed',
              event_type: 'add_material',
              details: {
                labwareInstanceId: 'plate-1',
                role: 'cell_region',
                material: { kind: 'HeLa' },
              },
            },
          ],
        }],
        ['expand_patterns', { events: [] }],
        ['expand_biology_verbs', { events: [] }],
        ['expand_protocol', { events: [] }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(48);

    // Verify no events still have a role field
    for (const ev of output.events) {
      expect(ev.details.role).toBeUndefined();
      expect(ev.details.well).toBeDefined();
    }

    // Verify first and last well
    const wells = output.events.map(e => e.details.well);
    expect(wells[0]).toBe('C2');
    expect(wells[wells.length - 1]).toBe('J7');
  });

  it('events with role: control_well expand to 1 event', () => {
    const pass = createResolveRolesPass();

    const labState: LabStateSnapshot = {
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

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['mint_materials', {
          events: [
            {
              eventId: 'evt-control',
              event_type: 'add_material',
              details: {
                labwareInstanceId: 'plate-1',
                role: 'control_well',
                material: { kind: 'buffer' },
              },
            },
          ],
        }],
        ['expand_patterns', { events: [] }],
        ['expand_biology_verbs', { events: [] }],
        ['expand_protocol', { events: [] }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(1);
    expect(output.events[0].details.well).toBe('A12');
    expect(output.events[0].details.role).toBeUndefined();
  });

  it('events with role: perturbant_col_3 expand to 6 events', () => {
    const pass = createResolveRolesPass();

    const labState: LabStateSnapshot = {
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

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['mint_materials', {
          events: [
            {
              eventId: 'evt-perturbant',
              event_type: 'add_material',
              details: {
                labwareInstanceId: 'plate-1',
                role: 'perturbant_col_3',
                material: { kind: 'drug-A' },
              },
            },
          ],
        }],
        ['expand_patterns', { events: [] }],
        ['expand_biology_verbs', { events: [] }],
        ['expand_protocol', { events: [] }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(6);

    const wells = output.events.map(e => e.details.well);
    expect(wells).toEqual(['B3', 'C3', 'D3', 'E3', 'F3', 'G3']);
  });

  it('mixed events: some with role, some without — both handled correctly', () => {
    const pass = createResolveRolesPass();

    const labState: LabStateSnapshot = {
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

    const mockState: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['mint_materials', {
          events: [
            {
              eventId: 'evt-1',
              event_type: 'add_material',
              details: {
                labwareInstanceId: 'plate-1',
                well: 'A1',
                material: { kind: 'buffer' },
              },
            },
            {
              eventId: 'evt-2',
              event_type: 'add_material',
              details: {
                labwareInstanceId: 'plate-1',
                role: 'control_well',
                material: { kind: 'control' },
              },
            },
          ],
        }],
        ['expand_patterns', { events: [] }],
        ['expand_biology_verbs', { events: [] }],
        ['expand_protocol', { events: [] }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    // 1 pass-through + 1 expanded = 2 events
    expect(output.events).toHaveLength(2);

    // Find the pass-through event
    const passThrough = output.events.find(e => e.eventId === 'evt-1');
    expect(passThrough).toBeDefined();
    expect(passThrough!.details.well).toBe('A1');

    // Find the resolved control_well event
    const resolved = output.events.find(e => e.eventId.startsWith('evt-2_r'));
    expect(resolved).toBeDefined();
    expect(resolved!.details.well).toBe('A12');
    expect(resolved!.details.role).toBeUndefined();
  });

  it('empty events input produces empty output', () => {
    const pass = createResolveRolesPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['mint_materials', { events: [] }],
        ['expand_patterns', { events: [] }],
        ['expand_biology_verbs', { events: [] }],
        ['expand_protocol', { events: [] }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: unknown[] };
    expect(output.events).toHaveLength(0);
  });
});
