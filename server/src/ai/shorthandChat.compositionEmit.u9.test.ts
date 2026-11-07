/**
 * Gate 4 D1 — u9 composition-prefetch wire: the scientist-intent path must
 * expand a material-spec's formulation.composition into solute+solvent
 * snapshot entries. Before the fix: resolves to ONE self-referential entry
 * with role:'other'. After the fix: TWO entries (solute + solvent).
 *
 * Mirror the mock-store pattern from shorthandChat.labwareIdBinding.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../compiler/scientistIntent/compileScientistIntent.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import type { RecordStore } from '../store/types.js';
import type { AnsweredNounAnswer } from '../compiler/resolution/resolveNounsPass.js';

// --- Fixtures ---

const SOLUTE_REF = { kind: 'record' as const, type: 'material' as const, id: 'MAT-PR9-TEST-CLO' };
const SOLVENT_REF = { kind: 'record' as const, type: 'material' as const, id: 'MAT-PR9-TEST-DMSO' };

const MATERIAL_SPEC_RECORD = {
  recordId: 'MSP-PR9-TEST-CLO-1MM',
  schemaId: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
  kind: 'material-spec',
  payload: {
    kind: 'material-spec',
    name: 'Clofibrate 1mM',
    formulation: {
      concentration: { value: 1, unit: 'mM' },
      composition: [
        { component_ref: SOLUTE_REF, role: 'solute' },
        { component_ref: SOLVENT_REF, role: 'solvent' },
      ],
    },
  },
};

// Labware record for the plate
const LABWARE_RECORD = {
  recordId: 'LBW-96-TEST',
  schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
  payload: { kind: 'labware', name: 'Test Plate', title: 'Test Plate', synonyms: ['test plate', 'plate'] },
};

// Minimal scientist-intent doc: add material-spec to a well
const DOC = `
intentId: test-u9-compwire
actions:
  - action: add_material
    labware: plate
    targetWells: [A1]
    material: Clofibrate 1mM
    volume: { value: 1, unit: uL }
`;

function mockStore() {
  const materialSpecs = [MATERIAL_SPEC_RECORD];
  const labwares = [LABWARE_RECORD];

  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => {
      const found = [...materialSpecs, ...labwares].find((r) => r.recordId === id);
      return found ?? null;
    }),
    list: vi.fn(async (filter?: { kind?: string; schemaId?: string; limit?: number }) => {
      if (filter?.kind === 'material-spec') return materialSpecs;
      if (filter?.kind === 'labware') return labwares;
      return [...materialSpecs, ...labwares];
    }),
  } as unknown as RecordStore;
}

describe('u9: composition-prefetch wire — compiler emits TWO snapshot entries for material-spec with composition', () => {
  it('material-spec with composition emits TWO snapshot entries (solute + solvent)', async () => {
    const store = mockStore();
    const doc = parseScientistIntent(DOC);
    const spine = createResolveSpineFromContext({ store });

    // Force binding via answeredSlots because the spine level filter excludes
    // 'spec' from add_material.material. This simulates the production flow
    // where [[material-spec:MSP-...|...]] resolves to the spec record.
    const answeredSlots: AnsweredNounAnswer[] = [
      {
        label: 'Clofibrate 1mM',
        recordId: 'MSP-PR9-TEST-CLO-1MM',
        recordLabel: 'Clofibrate 1mM',
      },
    ];

    const compiled = await compileScientistIntent(doc, {
      spine,
      answeredSlots,
    });

    expect(compiled).toBeDefined();
    expect(compiled!.outcome).toBe('complete');

    const events = compiled!.terminalArtifacts.events;
    expect(events.length).toBeGreaterThanOrEqual(1);

    // Find the add_material event
    const addEv = events.find(
      (ev: unknown) => (ev as Record<string, unknown>)?.event_type === 'add_material'
    ) as Record<string, unknown> | undefined;
    expect(addEv).toBeDefined();

    const details = addEv!.details as Record<string, unknown> | undefined;
    expect(details).toBeDefined();

    const snapshot = details!.composition_snapshot as Array<{ component_ref: Record<string, string>; role: string }> | undefined;
    expect(snapshot).toBeDefined();
    expect(Array.isArray(snapshot)).toBe(true);

    // CRITERION: must have TWO entries (solute + solvent), not ONE self-referential 'other'
    expect(snapshot!.length).toBe(2);

    const roles = snapshot!.map((e) => e.role);
    expect(roles).toContain('solute');
    expect(roles).toContain('solvent');

    // The component_ref IDs should match the formulation
    const componentIds = snapshot!.map((e) => e.component_ref.id);
    expect(componentIds).toContain('MAT-PR9-TEST-CLO');
    expect(componentIds).toContain('MAT-PR9-TEST-DMSO');
  });
});
