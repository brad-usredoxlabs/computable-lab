/**
 * Tests for protocol phases schema contracts.
 *
 * Validates:
 *  - phases array is optional and validates when present
 *  - phase id pattern enforcement
 *  - ordinal minimum enforcement
 *  - step phaseId pattern enforcement
 *  - back-compat: protocols without phases still validate
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

describe('ProtocolPhasesSchema', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    const schemaRoot = join(process.cwd(), '..', 'schema');
    const paths = [
      'workflow/protocol.schema.yaml',
      'core/common.schema.yaml',
      'core/datatypes/ref.schema.yaml',
    ];

    const contents = new Map<string, string>();
    for (const path of paths) {
      contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
    }

    const result = loadSchemasFromContent(contents);
    expect(result.errors).toEqual([]);

    registry.addSchemas(result.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema, entry.id);
      }
    }
  });

  // ── Registration ────────────────────────────────────────────────────

  it('registers the protocol schema in the registry', () => {
    const schemaId =
      'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

    expect(registry.has(schemaId)).toBe(true);
  });

  // ── Valid payload ───────────────────────────────────────────────────

  describe('protocol with phases', () => {
    // ── valid-with-phases ────────────────────────────────────────────

    it('accepts a protocol with three phases and three steps each tagged with phaseId', () => {
      const valid = {
        kind: 'protocol',
        recordId: 'PRT-000001',
        title: 'Test Protocol with Phases',
        phases: [
          { id: 'prep', label: 'Preparation', ordinal: 1 },
          { id: 'treatment', label: 'Treatment', ordinal: 2 },
          { id: 'readout', label: 'Readout', ordinal: 3 },
        ],
        steps: [
          {
            stepId: 'step-001',
            kind: 'add_material',
            phaseId: 'prep',
            target: { labwareRole: 'plate' },
            wells: { kind: 'all' },
            material: { materialRole: 'dye' },
            volume_uL: 50,
          },
          {
            stepId: 'step-002',
            kind: 'incubate',
            phaseId: 'treatment',
            target: { labwareRole: 'plate' },
            duration_min: 30,
          },
          {
            stepId: 'step-003',
            kind: 'read',
            phaseId: 'readout',
            target: { labwareRole: 'plate' },
            modality: 'fluorescence',
          },
        ],
      };

      const result = validator.validate(
        valid,
        'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'
      );
      if (!result.valid) {
        console.error('Validation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.valid).toBe(true);
    });
  });

  // ── Back-compat ─────────────────────────────────────────────────────

  describe('protocol without phases', () => {
    // ── valid-without-phases ─────────────────────────────────────────

    it('accepts a protocol with no phases field and steps with no phaseId', () => {
      const valid = {
        kind: 'protocol',
        recordId: 'PRT-000002',
        title: 'Test Protocol without Phases',
        steps: [
          {
            stepId: 'step-001',
            kind: 'add_material',
            target: { labwareRole: 'plate' },
            wells: { kind: 'all' },
            material: { materialRole: 'dye' },
            volume_uL: 50,
          },
          {
            stepId: 'step-002',
            kind: 'transfer',
            source: { labwareRole: 'source_plate', wells: { kind: 'all' } },
            target: { labwareRole: 'dest_plate', wells: { kind: 'all' } },
            volume_uL: 25,
          },
        ],
      };

      const result = validator.validate(
        valid,
        'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'
      );
      if (!result.valid) {
        console.error('Validation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.valid).toBe(true);
    });
  });

  // ── Invalid: phase id pattern ───────────────────────────────────────

  describe('invalid phase id pattern', () => {
    // ── invalid-phase-id-pattern ─────────────────────────────────────

    it('rejects a phase with id "Bad ID"', () => {
      const invalid = {
        kind: 'protocol',
        recordId: 'PRT-000003',
        title: 'Test Protocol with Bad Phase Id',
        phases: [
          { id: 'Bad ID', label: 'Preparation', ordinal: 1 },
        ],
        steps: [
          {
            stepId: 'step-001',
            kind: 'add_material',
            target: { labwareRole: 'plate' },
            wells: { kind: 'all' },
            material: { materialRole: 'dye' },
            volume_uL: 50,
          },
        ],
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'
        ).valid
      ).toBe(false);
    });
  });

  // ── Invalid: ordinal zero ───────────────────────────────────────────

  describe('invalid ordinal', () => {
    // ── invalid-ordinal-zero ─────────────────────────────────────────

    it('rejects a phase with ordinal 0', () => {
      const invalid = {
        kind: 'protocol',
        recordId: 'PRT-000004',
        title: 'Test Protocol with Zero Ordinal',
        phases: [
          { id: 'prep', label: 'Preparation', ordinal: 0 },
        ],
        steps: [
          {
            stepId: 'step-001',
            kind: 'add_material',
            target: { labwareRole: 'plate' },
            wells: { kind: 'all' },
            material: { materialRole: 'dye' },
            volume_uL: 50,
          },
        ],
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'
        ).valid
      ).toBe(false);
    });
  });

  // ── Invalid: step phaseId pattern ───────────────────────────────────

  describe('invalid step phaseId pattern', () => {
    // ── invalid-step-phase-id-pattern ────────────────────────────────

    it('rejects a step with phaseId "Bad ID"', () => {
      const invalid = {
        kind: 'protocol',
        recordId: 'PRT-000005',
        title: 'Test Protocol with Bad Step PhaseId',
        phases: [
          { id: 'prep', label: 'Preparation', ordinal: 1 },
        ],
        steps: [
          {
            stepId: 'step-001',
            kind: 'add_material',
            phaseId: 'Bad ID',
            target: { labwareRole: 'plate' },
            wells: { kind: 'all' },
            material: { materialRole: 'dye' },
            volume_uL: 50,
          },
        ],
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'
        ).valid
      ).toBe(false);
    });
  });
});
