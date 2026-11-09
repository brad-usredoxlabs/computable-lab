// @vitest-environment node
/**
 * Composition expansion in createResolveRolesPass.
 *
 * A bound formulation's formulation.composition entries should be expanded
 * into the emitted composition_snapshot instead of wrapping the formulation
 * recordId once.
 */

import { describe, it, expect } from 'vitest';
import { createResolveRolesPass } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import { emptyLabState } from '../../state/LabState.js';

function makeState(
  nounBindings: Record<string, { recordId: string; verb: string; argument: string; label: string }>,
): PipelineState {
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
  };
}

describe('composition expansion in createResolveRolesPass', () => {
  it('legacy: no callback produces single-entry snapshot', () => {
    const pass = createResolveRolesPass();

    const state = makeState({
      'Clofibrate in DMSO': { recordId: 'FORM-1', verb: 'add', argument: 'material', label: 'Clofibrate in DMSO' },
    });
    const mint = state.outputs.get('mint_materials') as { events: any[] };
    mint.events = [
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: { material: 'Clofibrate in DMSO', volumeUl: 1, labwareInstanceId: 'plate-1', well: 'A2' },
      },
    ];

    const result = pass.run({ pass_id: 'resolve_roles', state });
    expect(result.ok).toBe(true);
    const events = (result.output as { events: any[] }).events;
    expect(events).toHaveLength(1);
    const details = events[0].details;

    expect(details.material_ref).toEqual({ kind: 'record', type: 'material', id: 'FORM-1' });
    expect(details.composition_snapshot).toEqual([
      { component_ref: { kind: 'record', type: 'material', id: 'FORM-1' }, role: 'other' },
    ]);
  });

  it('expands formulation composition entries when callback returns them', () => {
    const compositionEntries = [
      { component_ref: { kind: 'record', type: 'material', id: 'SOL-1' }, role: 'solute' },
      { component_ref: { kind: 'record', type: 'material', id: 'SOLV-1' }, role: 'solvent' },
    ];

    const pass = createResolveRolesPass({
      materialComposition: (recordId: string) => (recordId === 'FORM-1' ? compositionEntries : undefined),
    });

    const state = makeState({
      'Clofibrate in DMSO': { recordId: 'FORM-1', verb: 'add', argument: 'material', label: 'Clofibrate in DMSO' },
    });
    const mint = state.outputs.get('mint_materials') as { events: any[] };
    mint.events = [
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: { material: 'Clofibrate in DMSO', volumeUl: 1, labwareInstanceId: 'plate-1', well: 'A2' },
      },
    ];

    const result = pass.run({ pass_id: 'resolve_roles', state });
    expect(result.ok).toBe(true);
    const events = (result.output as { events: any[] }).events;
    expect(events).toHaveLength(1);
    const details = events[0].details;

    // material_ref still points to the formulation (material-spec when composition entries exist, D4-2)
    expect(details.material_ref).toEqual({ kind: 'record', type: 'material-spec', id: 'FORM-1' });

    // composition_snapshot has TWO entries
    const snapshot = details.composition_snapshot as Array<{ component_ref: { id: string }; role: string }>;
    expect(snapshot).toHaveLength(2);

    // First entry is the solute
    expect(snapshot[0].component_ref).toEqual({ kind: 'record', type: 'material', id: 'SOL-1' });
    expect(snapshot[0].role).toBe('solute');

    // Second entry is the solvent
    expect(snapshot[1].component_ref).toEqual({ kind: 'record', type: 'material', id: 'SOLV-1' });
    expect(snapshot[1].role).toBe('solvent');

    // NO entry's component_ref.id equals FORM-1
    for (const entry of snapshot) {
      expect(entry.component_ref.id).not.toBe('FORM-1');
    }
  });

  it('callback returning undefined falls back to legacy single-entry', () => {
    const pass = createResolveRolesPass({ materialComposition: () => undefined });

    const state = makeState({
      'Clofibrate in DMSO': { recordId: 'FORM-1', verb: 'add', argument: 'material', label: 'Clofibrate in DMSO' },
    });
    const mint = state.outputs.get('mint_materials') as { events: any[] };
    mint.events = [
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: { material: 'Clofibrate in DMSO', volumeUl: 1, labwareInstanceId: 'plate-1', well: 'A2' },
      },
    ];

    const result = pass.run({ pass_id: 'resolve_roles', state });
    expect(result.ok).toBe(true);
    const details = (result.output as { events: any[] }).events[0].details;
    expect(details.composition_snapshot).toEqual([
      { component_ref: { kind: 'record', type: 'material', id: 'FORM-1' }, role: 'other' },
    ]);
  });

  it('expands composition in role-based expansion path', () => {
    const compositionEntries = [
      { component_ref: { kind: 'record', type: 'material', id: 'SOL-1' }, role: 'solute' },
      { component_ref: { kind: 'record', type: 'material', id: 'SOLV-1' }, role: 'solvent' },
    ];

    const pass = createResolveRolesPass({
      materialComposition: (recordId: string) => (recordId === 'FORM-1' ? compositionEntries : undefined),
    });

    const labState = {
      ...emptyLabState(),
      labware: {
        'plate-1': {
          instanceId: 'plate-1',
          labwareType: '96-well-plate' as const,
          slot: 'A1',
          orientation: 'landscape' as const,
          wells: {},
        },
      },
    };

    const state = makeState({
      'Clofibrate in DMSO': { recordId: 'FORM-1', verb: 'add', argument: 'material', label: 'Clofibrate in DMSO' },
    });
    (state as any).input.labState = labState;

    const mint = state.outputs.get('mint_materials') as { events: any[] };
    mint.events = [
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: { material: 'Clofibrate in DMSO', volumeUl: 1, labwareInstanceId: 'plate-1', role: 'perturbant_col_1' },
      },
    ];

    const result = pass.run({ pass_id: 'resolve_roles', state });
    expect(result.ok).toBe(true);
    const events = (result.output as { events: any[] }).events;

    // perturbant_col_1 expands to 6 wells
    expect(events).toHaveLength(6);

    for (const ev of events) {
      const snap = ev.details.composition_snapshot as Array<{ component_ref: { id: string }; role: string }>;
      expect(snap).toHaveLength(2);
      expect(snap[0].component_ref.id).toBe('SOL-1');
      expect(snap[1].component_ref.id).toBe('SOLV-1');
    }
  });
});
