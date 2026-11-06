// @vitest-environment node
/**
 * u4fix6 pin: the compiler's shorthand add_material emission must be
 * schema-valid — material_ref carries [id, type], composition_snapshot
 * entries use component_ref + role from the enum.
 *
 * Drives the same shorthand compile path as AgentOrchestrator.shorthandChat.test.ts
 * and asserts PRESENCE + SCHEMA VALIDITY against the real YAML schema files.
 */
import { readFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';

import { parseScientistIntent } from '../../scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../../scientistIntent/compileScientistIntent.js';
import { createResolveSpineFromContext } from '../../../resolve/index.js';
import { createLabwareLookup } from '../../../ai/compiler/labwareLookup.js';

const FIXTURE_DIR = resolve(process.cwd(), 'src', 'ai', 'fixtures');
const COMPOSITION_ENTRY_SCHEMA = resolve(
  process.cwd(),
  'schema', 'core', 'datatypes', 'composition-entry.schema.yaml',
);
const REF_SCHEMA = resolve(
  process.cwd(),
  'schema', 'core', 'datatypes', 'ref.schema.yaml',
);
const CONCENTRATION_SCHEMA = resolve(
  process.cwd(),
  'schema', 'core', 'datatypes', 'concentration.schema.yaml',
);

// ---------------------------------------------------------------------------
// Schema loader — reads the REAL files, resolves $ref between them
// ---------------------------------------------------------------------------

function loadSchema(path: string): Record<string, unknown> {
  return yaml.load(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function stripSchema(node: Record<string, unknown>): Record<string, unknown> {
  // Remove $schema so Ajv doesn't try to validate against the meta-schema
  // (the shipped standalone Ajv doesn't carry draft-2020-12 meta by default).
  const { $schema: _, ...rest } = node;
  return rest;
}

function createCompositionValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });

  // Register dependency schemas first so $ref resolves
  // ref.schema.yaml (§52-55: type is record-specific; §73-77: kind=record requires id+type)
  const refSchema = stripSchema(loadSchema(REF_SCHEMA));
  const refId = (refSchema.$id as string) ?? 'ref-schema';
  ajv.addSchema(refSchema, refId);

  // concentration.schema.yaml — required by composition-entry's concentration property
  const concSchema = stripSchema(loadSchema(CONCENTRATION_SCHEMA));
  const concId = (concSchema.$id as string) ?? 'concentration-schema';
  ajv.addSchema(concSchema, concId);

  // composition-entry.schema.yaml (§8: additionalProperties:false, §9: required [component_ref, role])
  const compSchema = stripSchema(loadSchema(COMPOSITION_ENTRY_SCHEMA));
  return ajv.compile(compSchema);
}

// ---------------------------------------------------------------------------
// Seed records — mirrors AgentOrchestrator.shorthandChat.test.ts SEED_RECORDS
// ---------------------------------------------------------------------------

const SEED_RECORDS = [
  {
    recordId: 'LAB-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
  {
    recordId: 'MAT-dmem-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: ['dmem'] },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
  };
}

// ---------------------------------------------------------------------------
// Test: the compiled add_material events carry schema-valid shapes
// ---------------------------------------------------------------------------

describe('u4fix6 — add_material emission is schema-valid', () => {
  it('material_ref has type and composition_snapshot uses component_ref + valid role', async () => {
    const ADD_DMEM_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-add-dmem.yaml'), 'utf-8');

    const store = mockStore();
    const spine = createResolveSpineFromContext({ store: store as never });
    const doc = parseScientistIntent(ADD_DMEM_YAML);

    const { terminalArtifacts } = await compileScientistIntent(doc, {
      spine: spine as never,
      searchLabwareByHint: createLabwareLookup(store as never),
    });

    const events = terminalArtifacts.events as Array<Record<string, unknown>>;
    const addMaterialEvents = events.filter((e) => e.event_type === 'add_material');

    // Vacuity guard: assert count before every()
    // The shorthand-add-dmem fixture produces 12 add_material events (one per well A1:A12).
    expect(addMaterialEvents.length).toBe(12);

    const validateComposition = createCompositionValidator();

    for (const ev of addMaterialEvents) {
      const details = ev.details as Record<string, unknown> | undefined;
      expect(details, 'event must have details').toBeDefined();

      // (a) material_ref shape: kind=record, id=MAT-dmem-1, type=material
      const mr = details!.material_ref as Record<string, unknown> | undefined;
      expect(mr, 'material_ref must be present').toBeDefined();
      // ref.schema.yaml §52-55: type is record-specific; §73-77: kind=record requires id+type
      expect(mr!.kind).toBe('record');
      expect(mr!.id).toBe('MAT-dmem-1');
      expect(mr!.type).toBe('material'); // schema enum member, not domain knowledge

      // (b) composition_snapshot validates against the REAL schema files
      const snapshot = details!.composition_snapshot as Array<Record<string, unknown>> | undefined;
      expect(snapshot, 'composition_snapshot must be present').toBeDefined();
      expect(snapshot!.length).toBeGreaterThanOrEqual(1);

      for (const entry of snapshot!) {
        // component_ref must exist (schema §9: required)
        expect(entry.component_ref, 'composition entry must have component_ref').toBeDefined();
        const cr = entry.component_ref as Record<string, unknown>;
        expect(cr.kind).toBe('record');
        expect(cr.id).toBe('MAT-dmem-1');
        expect(cr.type).toBe('material');

        // (c) role must be one of the schema enum values
        // composition-entry.schema.yaml §15-22: [solute, solvent, buffer_component, additive,
        // activity_source, cells, other]
        const validRoles = ['solute', 'solvent', 'buffer_component', 'additive', 'activity_source', 'cells', 'other'];
        expect(validRoles).toContain(entry.role as string);

        // Ajv validation against the REAL schema
        expect(validateComposition(entry)).toBe(true);
      }

      // Ensure no extra material_ref key on composition entries (forbids the old shape)
      for (const entry of snapshot!) {
        expect('material_ref' in entry).toBe(false);
      }
    }
  });
});
