// @vitest-environment node
/**
 * Tests for composition expansion in createResolveRolesPass.
 *
 * When a formulation record carries formulation.composition entries, the
 * emitted composition_snapshot should expand those entries (each keeping its
 * own component_ref + role) instead of wrapping the formulation recordId once.
 *
 * Legacy: no lookup → snapshot is [{ component_ref: typedRef, role: 'other' }].
 * Expanded: lookup returns 2 entries → snapshot has 2 entries with distinct
 *   component_ref.ids and their original roles.
 */

import { describe, it, expect } from 'vitest';
import { createResolveRolesPass } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import { emptyLabState } from '../../state/LabState.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockStateWithNouns(nounBindings: Record<string, { recordId: string }>) {
  return {
    input: { labState: emptyLabState() },
    context: {},
    meta: {},
    outputs: new Map([
      ['mint_materials', { events: [] }],
      ['expand_patterns', { events: [] }],
      ['expand_biology_verbs', { events: [] }],
      ['expand_protocol', { events: [] }],
      ['resolve_references', { resolvedRefs: [] }],
      ['resolve_nouns', { resolvedByLabel: nounBindings }],
    ]),
    diagnostics: [],
  } satisfies PipelineState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createResolveRolesPass — composition expansion', () => {
  it('expands formulation composition into snapshot when lookup returns entries', () => {
    // Two-component formulation: solute → SOL-1, solvent → SOLV-1
    const compositionEntries = [
      { component_ref: { kind: 'record' as const, type: 'material' as const, id: 'SOL-1' }, role: 'solute' as const },
      { component_ref: { kind: 'record' as const, type: 'material' as const, id: 'SOLV-1' }, role: 'solvent' as const },
    ];

    const pass = createResolveRolesPass({
      materialComposition: (recordId: string) => {
        if (recordId === 'FORM-1') return compositionEntries;
        return undefined;
      },
    });

    const mockState = mockStateWithNouns({
      'Clofibrate in DMSO': { recordId: 'FORM-1' },
    });

    // Add an add_material event with no role (passes through, enriched with material_ref)
    (mockState.outputs.get('mint_materials') as any).events = [
      {
        eventId: 'evt-add-clo',
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          well: 'A2',
          material: 'Clofibrate in DMSO',
          volumeUl: 1,
        },
      },
    ];

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(1);

    const event = output.events[0];
    expect(event.eventId).toBe('evt-add-clo');

    const details = event.details;

    // material_ref points to the formulation
    expect(details.material_ref).toEqual({
      kind: 'record',
      type: 'material',
      id: 'FORM-1',
    });

    // composition_snapshot has TWO entries (not one)
    const snapshot = details.composition_snapshot as Array<{ component_ref: { id: string }; role: string }>;
    expect(snapshot).toHaveLength(2);

    // First entry is the solute
    expect(snapshot[0].component_ref).toEqual({
      kind: 'record',
      type: 'material',
      id: 'SOL-1',
    });
    expect(snapshot[0].role).toBe('solute');

    // Second entry is the solvent
    expect(snapshot[1].component_ref).toEqual({
      kind: 'record',
      type: 'material',
      id: 'SOLV-1',
    });
    expect(snapshot[1].role).toBe('solvent');

    // NO entry's component_ref.id equals FORM-1
    for (const entry of snapshot) {
      expect(entry.component_ref.id).not.toBe('FORM-1');
    }
  });

  it('falls back to single-entry snapshot when lookup is absent (legacy behavior)', () => {
    // No materialComposition option — legacy behavior
    const pass = createResolveRolesPass();

    const mockState = mockStateWithNouns({
      'Clofibrate in DMSO': { recordId: 'FORM-1' },
    });

    (mockState.outputs.get('mint_materials') as any).events = [
      {
        eventId: 'evt-add-clo',
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          well: 'A2',
          material: 'Clofibrate in DMSO',
          volumeUl: 1,
        },
      },
    ];

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(1);

    const event = output.events[0];
    const details = event.details;

    // material_ref points to the formulation
    expect(details.material_ref).toEqual({
      kind: 'record',
      type: 'material',
      id: 'FORM-1',
    });

    // composition_snapshot is the legacy single-entry
    const snapshot = details.composition_snapshot as Array<{ component_ref: { id: string }; role: string }>;
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toEqual({
      component_ref: { kind: 'record', type: 'material', id: 'FORM-1' },
      role: 'other',
    });
  });

  it('falls back to single-entry when lookup returns undefined for the record', () => {
    // Lookup exists but returns undefined for this record
    const pass = createResolveRolesPass({
      materialComposition: (_recordId: string) => undefined,
    });

    const mockState = mockStateWithNouns({
      'Clofibrate in DMSO': { recordId: 'FORM-1' },
    });

    (mockState.outputs.get('mint_materials') as any).events = [
      {
        eventId: 'evt-add-clo',
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          well: 'A2',
          material: 'Clofibrate in DMSO',
          volumeUl: 1,
        },
      },
    ];

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(1);

    const event = output.events[0];
    const details = event.details;

    // Legacy single-entry snapshot
    const snapshot = details.composition_snapshot as Array<{ component_ref: { id: string }; role: string }>;
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toEqual({
      component_ref: { kind: 'record', type: 'material', id: 'FORM-1' },
      role: 'other',
    });
  });

  it('falls back to single-entry when lookup returns empty array', () => {
    // Lookup returns empty array
    const pass = createResolveRolesPass({
      materialComposition: (_recordId: string) => [],
    });

    const mockState = mockStateWithNouns({
      'Clofibrate in DMSO': { recordId: 'FORM-1' },
    });

    (mockState.outputs.get('mint_materials') as any).events = [
      {
        eventId: 'evt-add-clo',
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          well: 'A2',
          material: 'Clofibrate in DMSO',
          volumeUl: 1,
        },
      },
    ];

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(1);

    const event = output.events[0];
    const details = event.details;

    // Legacy single-entry snapshot
    const snapshot = details.composition_snapshot as Array<{ component_ref: { id: string }; role: string }>;
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toEqual({
      component_ref: { kind: 'record', type: 'material', id: 'FORM-1' },
      role: 'other',
    });
  });

  it('preserves eventId/well/ordering when expanding composition', () => {
    const compositionEntries = [
      { component_ref: { kind: 'record' as const, type: 'material' as const, id: 'SOL-1' }, role: 'solute' as const },
    ];

    const pass = createResolveRolesPass({
      materialComposition: (_recordId: string) => compositionEntries,
    });

    const mockState = mockStateWithNouns({
      'Clofibrate in DMSO': { recordId: 'FORM-1' },
    });

    (mockState.outputs.get('mint_materials') as any).events = [
      {
        eventId: 'evt-add-clo',
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          well: 'A2',
          material: 'Clofibrate in DMSO',
          volumeUl: 1,
        },
      },
    ];

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };
    expect(output.events).toHaveLength(1);

    const event = output.events[0];
    // eventId and well are preserved
    expect(event.eventId).toBe('evt-add-clo');
    expect(event.details.well).toBe('A2');
    // volumeUl is preserved
    expect(event.details.volumeUl).toBe(1);
  });

  it('works for role-based expansion path (not just pass-through)', () => {
    // Test the role-based expansion path (line ~2729)
    const compositionEntries = [
      { component_ref: { kind: 'record' as const, type: 'material' as const, id: 'SOL-1' }, role: 'solute' as const },
      { component_ref: { kind: 'record' as const, type: 'material' as const, id: 'SOLV-1' }, role: 'solvent' as const },
    ];

    const pass = createResolveRolesPass({
      materialComposition: (recordId: string) => {
        if (recordId === 'FORM-1') return compositionEntries;
        return undefined;
      },
    });

    // Use a lab state with a plate so role resolution works
    const mockState = mockStateWithNouns({
      'Clofibrate in DMSO': { recordId: 'FORM-1' },
    });

    // Set up labware in lab state
    (mockState.input as any).labState = {
      ...emptyLabState(),
      labware: {
        'plate-1': {
          instanceId: 'plate-1',
          labwareType: '96-well-plate',
          slot: 'A1',
          orientation: 'landscape' as const,
          wells: {},
        },
      },
    };

    (mockState.outputs.get('mint_materials') as any).events = [
      {
        eventId: 'evt-role-perturbant',
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          role: 'perturbant_col_1',
          material: 'Clofibrate in DMSO',
          volumeUl: 1,
        },
      },
    ];

    const result = pass.run({
      pass_id: 'resolve_roles',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> };

    // perturbant_col_1 expands to 6 wells
    expect(output.events).toHaveLength(6);

    // Check first expanded event
    const first = output.events[0];
    expect(first.details.well).toBe('B1');
    expect(first.details.role).toBeUndefined();
    expect(first.details.material_ref).toEqual({
      kind: 'record',
      type: 'material',
      id: 'FORM-1',
    });

    const snapshot = first.details.composition_snapshot as Array<{ component_ref: { id: string }; role: string }>;
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0].component_ref.id).toBe('SOL-1');
    expect(snapshot[1].component_ref.id).toBe('SOLV-1');
  });
});
