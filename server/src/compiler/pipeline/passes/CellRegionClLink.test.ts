/**
 * Tests for cell_region → Cell Ontology link in the resolve_roles pass.
 *
 * Verifies:
 * - cell_region with valid cell_type_id (CL:0000182 = hepatocyte) resolves and
 *   carries cellTypeTerm.label matching /hepatocyte/i
 * - cell_region with bogus cell_type_id (CL:99999999) produces a warning finding
 *   and the role still resolves
 * - cell_region without cell_type_id produces no warnings and no cellTypeTerm
 */

import { describe, it, expect } from 'vitest';
import { createResolveRolesPass } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import type { LabStateSnapshot } from '../../state/LabState.js';
import { emptyLabState } from '../../state/LabState.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockState(
  events: Array<{
    eventId: string;
    event_type: string;
    details: Record<string, unknown>;
  }>,
  labState?: LabStateSnapshot,
): PipelineState {
  return {
    input: { labState: labState ?? emptyLabState() },
    context: {},
    meta: {},
    outputs: new Map([
      ['mint_materials', { events }],
      ['expand_patterns', { events: [] }],
      ['expand_biology_verbs', { events: [] }],
      ['expand_protocol', { events: [] }],
      ['resolve_references', { resolvedRefs: [] }],
    ]),
    diagnostics: [],
  };
}

function makeLabState(
  orientation: 'landscape' | 'portrait' = 'landscape',
): LabStateSnapshot {
  return {
    ...emptyLabState(),
    labware: {
      'plate-1': {
        instanceId: 'plate-1',
        labwareType: '96-well-plate',
        slot: 'A1',
        orientation,
        wells: {},
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CellRegionClLink', () => {
  it('cell_region with valid cell_type_id CL:0000182 (hepatocyte) resolves and carries cellTypeTerm', () => {
    const pass = createResolveRolesPass();
    const labState = makeLabState('landscape');

    const mockState: PipelineState = makeMockState(
      [
        {
          eventId: 'evt-cell-seed',
          event_type: 'add_material',
          details: {
            labwareInstanceId: 'plate-1',
            role: 'cell_region',
            cell_type_id: 'CL:0000182',
            material: { kind: 'hepatocyte' },
          },
        },
      ],
      labState,
    );

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ details: Record<string, unknown> }> };

    // Should expand to 60 wells (cell_region on 96-well landscape)
    expect(output.events).toHaveLength(60);

    // All expanded events should carry the cellTypeTerm
    for (const ev of output.events) {
      expect(ev.details.cellTypeTerm).toBeDefined();
      expect(ev.details.cellTypeTerm.id).toBe('CL:0000182');
      expect(ev.details.cellTypeTerm.source).toBe('cell-ontology');
      expect(ev.details.cellTypeTerm.label).toMatch(/hepatocyte/i);
    }

    // No diagnostics (happy path)
    expect(result.diagnostics).toBeUndefined();
  });

  it('cell_region with bogus cell_type_id CL:99999999 produces a warning and role still resolves', () => {
    const pass = createResolveRolesPass();
    const labState = makeLabState('landscape');

    const mockState: PipelineState = makeMockState(
      [
        {
          eventId: 'evt-cell-seed',
          event_type: 'add_material',
          details: {
            labwareInstanceId: 'plate-1',
            role: 'cell_region',
            cell_type_id: 'CL:99999999',
            material: { kind: 'unknown-cell-type' },
          },
        },
      ],
      labState,
    );

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ details: Record<string, unknown> }> };

    // Should still expand to 60 wells (role resolution is not blocked)
    expect(output.events).toHaveLength(60);

    // No cellTypeTerm on any event
    for (const ev of output.events) {
      expect(ev.details.cellTypeTerm).toBeUndefined();
    }

    // Should have a warning diagnostic
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics).toHaveLength(1);
    const diag = result.diagnostics![0];
    expect(diag.severity).toBe('warning');
    expect(diag.code).toBe('unknown_cell_type_id');
    expect(diag.message).toMatch(/CL:99999999/i);
    expect(diag.details?.cellTypeId).toBe('CL:99999999');
  });

  it('cell_region without cell_type_id produces no warnings and no cellTypeTerm', () => {
    const pass = createResolveRolesPass();
    const labState = makeLabState('landscape');

    const mockState: PipelineState = makeMockState(
      [
        {
          eventId: 'evt-cell-seed',
          event_type: 'add_material',
          details: {
            labwareInstanceId: 'plate-1',
            role: 'cell_region',
            material: { kind: 'generic-cells' },
          },
        },
      ],
      labState,
    );

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ details: Record<string, unknown> }> };

    // Should expand to 60 wells
    expect(output.events).toHaveLength(60);

    // No cellTypeTerm on any event
    for (const ev of output.events) {
      expect(ev.details.cellTypeTerm).toBeUndefined();
    }

    // No diagnostics
    expect(result.diagnostics).toBeUndefined();
  });

  it('non-cell_region role with cell_type_id ignores the field', () => {
    const pass = createResolveRolesPass();
    const labState = makeLabState('landscape');

    const mockState: PipelineState = makeMockState(
      [
        {
          eventId: 'evt-control',
          event_type: 'add_material',
          details: {
            labwareInstanceId: 'plate-1',
            role: 'control_well',
            cell_type_id: 'CL:0000182',
            material: { kind: 'buffer' },
          },
        },
      ],
      labState,
    );

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ details: Record<string, unknown> }> };

    // Should produce 1 event (control_well)
    expect(output.events).toHaveLength(1);

    // No cellTypeTerm (cell_type_id is only processed for cell_region)
    expect(output.events[0].details.cellTypeTerm).toBeUndefined();

    // No diagnostics
    expect(result.diagnostics).toBeUndefined();
  });

  it('cell_region in portrait with valid cell_type_id resolves correctly', () => {
    const pass = createResolveRolesPass();
    const labState = makeLabState('portrait');

    const mockState: PipelineState = makeMockState(
      [
        {
          eventId: 'evt-cell-seed',
          event_type: 'add_material',
          details: {
            labwareInstanceId: 'plate-1',
            role: 'cell_region',
            cell_type_id: 'CL:0000182',
            material: { kind: 'hepatocyte' },
          },
        },
      ],
      labState,
    );

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ details: Record<string, unknown> }> };

    // Portrait cell_region on 96-well = 48 wells
    expect(output.events).toHaveLength(48);

    // All expanded events should carry the cellTypeTerm
    for (const ev of output.events) {
      expect(ev.details.cellTypeTerm).toBeDefined();
      expect(ev.details.cellTypeTerm.id).toBe('CL:0000182');
      expect(ev.details.cellTypeTerm.label).toMatch(/hepatocyte/i);
    }
  });
});
