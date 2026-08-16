/**
 * Schema contracts for the concentration-first + variant-aware protocol model.
 *
 * Validates that the new additive fields resolve and validate against the REAL
 * project schemas (protocol, local-protocol, concentration datatype,
 * reference-ratio datatype):
 *  - protocol.variants[] validates; a bad variant fails `unevaluatedProperties`.
 *  - StepAddMaterial with working_concentration (concentration datatype) resolves.
 *  - StepAddMaterial with ratio (ReferenceRatio) resolves.
 *  - StepAddMaterial with NEITHER volume_uL nor working_concentration fails (oneOf).
 *  - local-protocol.variantRef validates; unknown sibling fails unevaluatedProperties.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const LOCAL_PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';

describe('Concentration-first protocol schema contracts', () => {
  let validator!: ReturnType<typeof createValidator>;
  let registry!: ReturnType<typeof createSchemaRegistry>;

  beforeAll(async () => {
    const schemaDir = join(process.cwd(), 'schema');
    const result = await loadAllSchemas({ basePath: schemaDir });
    expect(result.errors).toEqual([]);

    registry = createSchemaRegistry();
    registry.addSchemas(result.entries);
    validator = createValidator({ strict: false });
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  it('registers the protocol + local-protocol + datatype schemas', () => {
    expect(registry.has(PROTOCOL_ID)).toBe(true);
    expect(registry.has(LOCAL_PROTOCOL_ID)).toBe(true);
    expect(registry.has('https://computable-lab.com/schema/computable-lab/datatypes/concentration.schema.yaml')).toBe(true);
    expect(registry.has('https://computable-lab.com/schema/computable-lab/datatypes/reference-ratio.schema.yaml')).toBe(true);
  });

  // ── StepAddMaterial: volume_uL | working_concentration (oneOf) ─────────

  it('accepts a legacy add_material step with volume_uL only (back-compat)', () => {
    const step = {
      kind: 'add_material',
      stepId: 'add-lyse',
      label: 'Add lysis',
      ordinal: 1,
      target: { labwareRole: 'lysis_rack' },
      wells: { kind: 'all' },
      material: { materialRole: 'lysis_solution' },
      volume_uL: 550,
    };
    const payload = baseProtocol([step]);
    expect(validator.validate(payload, PROTOCOL_ID).valid).toBe(true);
  });

  it('accepts a concentration-first add_material step (working_concentration) with no volume_uL', () => {
    const step = {
      kind: 'add_material',
      stepId: 'add-feno',
      label: 'Add fenofibrate',
      ordinal: 1,
      target: { labwareRole: 'assay_plate' },
      wells: { kind: 'all' },
      material: { materialRole: 'fenofibrate' },
      working_concentration: { value: 10, unit: 'nM', basis: 'molar' },
    };
    const payload = baseProtocol([step]);
    expect(validator.validate(payload, PROTOCOL_ID).valid).toBe(true);
  });

  it('accepts an advisory ratio on an add_material step', () => {
    const step = {
      kind: 'add_material',
      stepId: 'add-lyse',
      label: 'Add lysis',
      ordinal: 1,
      target: { labwareRole: 'lysis_rack' },
      wells: { kind: 'all' },
      material: { materialRole: 'shield' },
      ratio: { numerator: 1, denominator: 2.5, basis_label: 'sample', ratioed_label: 'DNA/RNA Shield' },
      volume_uL: 500,
    };
    const payload = baseProtocol([step]);
    expect(validator.validate(payload, PROTOCOL_ID).valid).toBe(true);
  });

  it('rejects an add_material step with NEITHER volume_uL nor working_concentration (oneOf)', () => {
    const step = {
      kind: 'add_material',
      stepId: 'bad',
      label: 'Bad',
      ordinal: 1,
      target: { labwareRole: 'x' },
      wells: { kind: 'all' },
      material: { materialRole: 'y' },
    };
    const payload = baseProtocol([step]);
    expect(validator.validate(payload, PROTOCOL_ID).valid).toBe(false);
  });

  // ── protocol.variants[] ────────────────────────────────────────────────

  it('accepts variants[] preserving vendor branches', () => {
    const payload = {
      ...baseProtocol([addStep()]),
      variants: [
        {
          variantId: 'mammalian-cell-culture',
          label: 'Mammalian cell culture',
          starting_material: 'DNA from mammalian cell culture',
          kind_hint: 'mammalian-cells',
          stepIds: ['add-lyse'],
        },
        { variantId: 'bacterial-dna', label: 'Bacterial DNA' },
      ],
    };
    expect(validator.validate(payload, PROTOCOL_ID).valid).toBe(true);
  });

  it('rejects a variant with an unknown sibling (unevaluatedProperties)', () => {
    const payload = {
      ...baseProtocol([addStep()]),
      variants: [{ variantId: 'x', label: 'X', bogus_field: true }],
    };
    expect(validator.validate(payload, PROTOCOL_ID).valid).toBe(false);
  });

  it('rejects a variant missing required label', () => {
    const payload = {
      ...baseProtocol([addStep()]),
      variants: [{ variantId: 'x' }],
    };
    expect(validator.validate(payload, PROTOCOL_ID).valid).toBe(false);
  });
});

describe('Local-protocol variantRef contract', () => {
  let validator!: ReturnType<typeof createValidator>;
  let registry!: ReturnType<typeof createSchemaRegistry>;

  beforeAll(async () => {
    const schemaDir = join(process.cwd(), 'schema');
    const result = await loadAllSchemas({ basePath: schemaDir });
    registry = createSchemaRegistry();
    registry.addSchemas(result.entries);
    validator = createValidator({ strict: false });
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  const lpr = {
    kind: 'local-protocol',
    recordId: 'LPR-test-variant',
    title: 'Test LPR',
    protocolLayer: 'lab',
    inherits_from: { kind: 'record', type: 'protocol', id: 'PRT-001' },
    status: 'draft',
    notes: 'n',
    labwares: [],
    equipment: [],
    materials: [],
  };

  it('accepts variantRef linking a realized universal branch', () => {
    expect(validator.validate({ ...lpr, variantRef: 'mammalian-cell-culture' }, LOCAL_PROTOCOL_ID).valid).toBe(true);
  });

  it('accepts a local protocol without variantRef (optional, back-compat)', () => {
    expect(validator.validate(lpr, LOCAL_PROTOCOL_ID).valid).toBe(true);
  });

  it('rejects an unknown sibling field on a local protocol', () => {
    expect(validator.validate({ ...lpr, bogus_field: 1 }, LOCAL_PROTOCOL_ID).valid).toBe(false);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────

function baseProtocol(steps: unknown[]): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId: 'PRT-test',
    title: 'Test protocol',
    protocolLayer: 'universal',
    roles: {
      labwareRoles: [
        { roleId: 'lysis_rack' },
        { roleId: 'assay_plate' },
      ],
      materialRoles: [
        { roleId: 'lysis_solution' },
        { roleId: 'fenofibrate' },
        { roleId: 'shield' },
        { roleId: 'y' },
      ],
    },
    steps,
  };
}

function addStep(): Record<string, unknown> {
  return {
    kind: 'add_material',
    stepId: 'add-lyse',
    label: 'Add lysis',
    ordinal: 1,
    target: { labwareRole: 'lysis_rack' },
    wells: { kind: 'all' },
    material: { materialRole: 'lysis_solution' },
    volume_uL: 550,
  };
}