import { describe, expect, it, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import type { ValidationResult } from '../types/common.js';

/**
 * PROTO-AI-2 — contract tests for the declarative protocol_edit op envelope.
 *
 * The envelope (schema/workflow/protocol-edit-op.schema.yaml) is the ONE
 * contract shared by the prompt (PROTO-AI-6), the dispatch validator
 * (PROTO-AI-7), the applier (PROTO-AI-8) and the reviewer render
 * (PROTO-AI-9). These tests pin the vocabulary, the identifier patterns, the
 * closed-object rule (D2: no inline concrete instances anywhere), and the
 * settings adjudication: step_update.settings is ALWAYS the array form
 * (Setting[], $ref setting.schema.yaml) — the StepRead object form is a
 * realization artifact and an object for `settings` must be REJECTED.
 *
 * Harness style copied from ProtocolProseFieldsSchema.test.ts
 * (SchemaRegistry + loadSchemasFromContent + createValidator over schema/).
 */
const ENVELOPE_ID =
  'https://computable-lab.com/schema/computable-lab/protocol-edit-op.schema.yaml';

describe('Protocol edit-op envelope schema', () => {
  let validator: ReturnType<typeof createValidator>;

  beforeEach(async () => {
    const registry = createSchemaRegistry();
    validator = createValidator({ strict: false });
    const schemaRoot = join(process.cwd(), '..', 'schema');
    const paths = [
      'workflow/protocol-edit-op.schema.yaml',
      'workflow/setting.schema.yaml',
      // PROTO-AI-9: the step_insert payloads $ref the two shared datatypes the
      // record kind payloads use (mirrored in protocolEditValidation.ts
      // ENVELOPE_FILES).
      'core/datatypes/concentration.schema.yaml',
      'core/datatypes/reference-ratio.schema.yaml',
    ];
    const contents = new Map<string, string>();
    for (const path of paths) contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
    const result = loadSchemasFromContent(contents);
    expect(result.errors).toEqual([]);
    registry.addSchemas(result.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  const validate = (data: unknown): ValidationResult => validator.validate(data, ENVELOPE_ID);

  /** Assert rejection AND that the offending instance path appears in the Ajv errors. */
  const expectRejectedAt = (result: ValidationResult, path: string): void => {
    expect(result.valid).toBe(false);
    const paths = (result.errors ?? []).map((e) => e.path);
    expect(paths).toContain(path);
  };

  const validStepDelete = { op: 'step_delete', stepId: 'step-003' };
  const validSetting = {
    settingId: 'temperature',
    label: 'Temperature',
    type: 'temperature',
    unit: 'C',
    defaultValue: 37,
  };

  // ---------------------------------------------------------------- valid forms

  it('accepts every valid op form in one envelope (step_*, labware_*, equipment_*)', () => {
    const result = validate({
      protocolId: 'PRT-000123',
      ops: [
        {
          op: 'step_update',
          stepId: 'step-001',
          label: 'Incubate lysate',
          description: 'Incubate at 37C for 30 minutes.',
          notes: 'Do not vortex.',
          kind: 'incubate',
          settings: [validSetting],
        },
        { op: 'step_update', stepId: 'step-002', description: 'Text-only edit.' },
        {
          op: 'step_insert', afterStepId: 'step-002', label: 'Wash beads', kind: 'wash', description: 'Three washes.',
          target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3,
        },
        {
          op: 'step_insert', beforeStepId: 'step-001', label: 'Read plate', kind: 'read',
          target: { labwareRole: 'plate' }, modality: 'absorbance',
        },
        validStepDelete,
        {
          op: 'labware_add',
          roleId: 'plate',
          description: 'The assay plate.',
          expectedLabwareKinds: ['LW-plate-96-well'],
        },
        { op: 'labware_update', roleId: 'reservoir' },
        { op: 'labware_delete', roleId: 'tip-rack' },
        { op: 'equipment_add', roleId: 'plate-reader', description: 'Reads the plate.', allowedInstrumentIds: ['INS-plate-reader'] },
        { op: 'equipment_update', roleId: 'plate-reader', description: 'Reads at 450nm.' },
        { op: 'equipment_delete', roleId: 'shaker' },
      ],
    });
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts an envelope without protocolId (attached-protocol scope binds the target)', () => {
    const result = validate({ ops: [validStepDelete] });
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts settings carrying the full Setting shape via the existing setting.schema.yaml $ref', () => {
    const result = validate({
      ops: [
        {
          op: 'step_update',
          stepId: 'step-001',
          settings: [
            {
              settingId: 'wash-count',
              label: 'Wash Count',
              type: 'number',
              constraints: { minimum: 1, maximum: 8, step: 1 },
            },
            { settingId: 'mode', label: 'Mode', type: 'select', options: ['endpoint', 'kinetic'] },
          ],
        },
      ],
    });
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  // -------------------------------------------------------------- rejections

  it('REJECTS an unknown op name, offending path /ops/0/op named', () => {
    const result = validate({ ops: [{ op: 'step_rename', stepId: 'step-001' }] });
    expectRejectedAt(result, '/ops/0/op');
  });

  it('REJECTS an unknown field at the envelope level', () => {
    const result = validate({ ops: [validStepDelete], protocolVersion: 2 });
    expectRejectedAt(result, '/');
  });

  it('REJECTS an unknown field inside an op (closed op objects)', () => {
    const result = validate({
      ops: [{ op: 'step_update', stepId: 'step-001', label: 'Rename', ordinal: 4 }],
    });
    expectRejectedAt(result, '/ops/0');
  });

  it('REJECTS an unknown field inside a settings entry (Setting is closed)', () => {
    const result = validate({
      ops: [
        {
          op: 'step_update',
          stepId: 'step-001',
          settings: [{ settingId: 'temperature', label: 'Temperature', type: 'temperature', unit: 'C', scale: 'celsius' }],
        },
      ],
    });
    expectRejectedAt(result, '/ops/0/settings/0');
  });

  it.each([
    ['uppercase', 'Step-001'],
    ['underscore', 'step_001'],
    ['leading digit', '1-step'],
  ])('REJECTS a malformed stepId (%s) at /ops/0/stepId', (_label, stepId) => {
    const result = validate({ ops: [{ op: 'step_update', stepId, label: 'X' }] });
    expectRejectedAt(result, '/ops/0/stepId');
  });

  it.each([
    ['underscore', 'plate_reader'],
    ['leading digit', '10-sds'],
    ['leading digit + hyphen', '96-100-ethanol'],
  ])('ACCEPTS a real-vocabulary roleId (%s): %s', (_label, roleId) => {
    const result = validate({ ops: [{ op: 'labware_update', roleId }] });
    expect(result.valid).toBe(true);
  });

  it.each([
    ['uppercase', 'Plate'],
    ['space', 'Plate Reader'],
    ['punctuation', 'role!'],
  ])('REJECTS a malformed roleId (%s) at /ops/0/roleId', (_label, roleId) => {
    const result = validate({ ops: [{ op: 'labware_update', roleId }] });
    expectRejectedAt(result, '/ops/0/roleId');
  });

  it('REJECTS an inline concrete-instance object on a labware op (D2)', () => {
    const result = validate({
      ops: [
        {
          op: 'labware_update',
          roleId: 'plate',
          instanceRef: { kind: 'record', id: 'LWI-000123', type: 'labware-instance' },
        },
      ],
    });
    expectRejectedAt(result, '/ops/0');
    const unknown = (result.errors ?? []).find(
      (e) => e.params?.additionalProperty === 'instanceRef' || e.params?.unevaluatedProperty === 'instanceRef',
    );
    expect(unknown).toBeDefined();
  });

  it('REJECTS settings given as an OBJECT — the settings adjudication: array form only, even for kind=read', () => {
    // StepRead.settings object form (protocol.schema.yaml:1004-1007) is a
    // realization artifact, NOT a protocol-edit target.
    const result = validate({
      ops: [
        {
          op: 'step_update',
          stepId: 'step-read-1',
          kind: 'read',
          settings: { exposure_ms: 100, gain: 7 },
        },
      ],
    });
    expectRejectedAt(result, '/ops/0/settings');
  });

  it('REJECTS a kind outside the base ProtocolStep enum at /ops/0/kind', () => {
    const result = validate({
      ops: [{ op: 'step_update', stepId: 'step-001', kind: 'incubation' }],
    });
    expectRejectedAt(result, '/ops/0/kind');
  });

  it('REJECTS a step_insert that gives both afterStepId and beforeStepId (contradictory anchor)', () => {
    const result = validate({
      ops: [
        {
          op: 'step_insert',
          afterStepId: 'step-001',
          beforeStepId: 'step-002',
          label: 'Wash',
          kind: 'wash',
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it('REJECTS a step_insert with no anchor (position is part of the contract)', () => {
    const result = validate({
      ops: [{ op: 'step_insert', label: 'Wash', kind: 'wash', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3 }],
    });
    expect(result.valid).toBe(false);
  });

  // ------------------------------------------------- step_insert payload contract
  // PROTO-AI-9 (architect ruling Option (i)): an insert must carry the SAME
  // per-kind payload the record schema requires (protocol.schema.yaml kind
  // payloads — see the StepInsertOp header comment for mirrored line numbers),
  // so an accepted proposal is always APPLIABLE: the minted record step passes
  // protocol.schema.yaml. Each kind gets a complete-payload ACCEPT and a
  // drop-one-required-field REJECT naming the field-level path.
  const allWells = { kind: 'all' } as const;
  const explicitWells = { kind: 'explicit', wells: ['A1', 'B2'] } as const;

  const completeInsert: Record<string, Record<string, unknown>> = {
    add_material: {
      op: 'step_insert', afterStepId: 'step-001', label: 'Add lysis buffer', kind: 'add_material',
      target: { labwareRole: 'plate' }, wells: allWells,
      material: { materialRole: 'lysis-buffer' }, volume_uL: 20,
    },
    transfer: {
      op: 'step_insert', afterStepId: 'step-001', label: 'Transfer lysate', kind: 'transfer',
      source: { labwareRole: 'plate', wells: explicitWells },
      target: { labwareRole: 'deep-plate', wells: explicitWells },
      volume_uL: { param: 'transfer_uL' },
    },
    mix: {
      op: 'step_insert', afterStepId: 'step-001', label: 'Mix beads', kind: 'mix',
      target: { labwareRole: 'plate' }, wells: allWells,
    },
    wash: {
      op: 'step_insert', afterStepId: 'step-001', label: 'Wash beads', kind: 'wash',
      target: { labwareRole: 'plate' }, wells: allWells, cycles: 3, washVolume_uL: 200,
    },
    incubate: {
      op: 'step_insert', afterStepId: 'step-001', label: 'Incubate lysate', kind: 'incubate',
      target: { labwareRole: 'plate' }, duration_min: 30, temperature_C: 37,
    },
    read: {
      op: 'step_insert', afterStepId: 'step-001', label: 'Read plate', kind: 'read',
      target: { labwareRole: 'plate_reader' }, modality: 'absorbance',
      instrumentRole: 'plate_reader', channels: ['595'],
    },
    harvest: {
      op: 'step_insert', afterStepId: 'step-001', label: 'Harvest eluate', kind: 'harvest',
      source: { labwareRole: 'plate' }, wells: allWells, volume_uL: 50,
      producesArtifactId: 'eluate',
    },
    other: {
      op: 'step_insert', afterStepId: 'step-001', label: 'Spin down', kind: 'other',
      description: 'Brief centrifugal spin.',
    },
  };

  it.each(Object.keys(completeInsert))(
    'ACCEPTS a complete %s step_insert payload (appliable record shape)',
    (kind) => {
      const result = validate({ ops: [completeInsert[kind]!] });
      expect(result.errors ?? []).toEqual([]);
      expect(result.valid).toBe(true);
    },
  );

  it('ACCEPTS add_material expressing working_concentration instead of volume_uL (record oneOf mirrored)', () => {
    const op = { ...completeInsert.add_material! } as Record<string, unknown>;
    delete op.volume_uL;
    op.working_concentration = { value: 10, unit: 'nM', basis: 'molar' };
    const result = validate({ ops: [op] });
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  // One dropped REQUIRED payload field per kind → rejection whose Ajv errors
  // name the op object (the `then` required keyword reports at /ops/0 with
  // missingProperty = the dropped field).
  it.each([
    ['add_material', 'target'],
    ['add_material', 'material'],
    ['transfer', 'source'],
    ['transfer', 'volume_uL'],
    ['mix', 'wells'],
    ['wash', 'cycles'],
    ['incubate', 'duration_min'],
    ['read', 'modality'],
    ['harvest', 'wells'],
    ['other', 'description'],
  ] as const)('REJECTS %s step_insert missing required payload field "%s" (field-level report)', (kind, field) => {
    const op = { ...completeInsert[kind]! };
    delete op[field];
    const result = validate({ ops: [op] });
    expect(result.valid).toBe(false);
    const missing = (result.errors ?? []).filter(
      (e) => e.path === '/ops/0' && e.params?.missingProperty === field,
    );
    expect(missing.length).toBeGreaterThan(0);
  });

  it('REJECTS an add_material step_insert carrying NEITHER volume_uL NOR working_concentration (record oneOf mirrored)', () => {
    const op = { ...completeInsert.add_material! } as Record<string, unknown>;
    delete op.volume_uL;
    const result = validate({ ops: [op] });
    expect(result.valid).toBe(false);
    const paths = (result.errors ?? []).map((e) => e.path);
    expect(paths).toContain('/ops/0');
  });

  it('REJECTS an unknown property on a step_insert payload (closed op object)', () => {
    const result = validate({
      ops: [{ ...completeInsert.wash!, settings: { soak: true } }],
    });
    expectRejectedAt(result, '/ops/0');
  });

  it.each([
    ['uppercase role', 'Plate'],
    ['space in role', 'plate reader'],
  ])('REJECTS a step_insert payload with a malformed labwareRole (%s) at /ops/0/target/labwareRole', (_label, labwareRole) => {
    const result = validate({
      ops: [{ ...completeInsert.wash!, target: { labwareRole } }],
    });
    expectRejectedAt(result, '/ops/0/target/labwareRole');
  });

  it('REJECTS a step_insert payload with a malformed material.materialRole at /ops/0/material/materialRole', () => {
    const result = validate({
      ops: [{ ...completeInsert.add_material!, material: { materialRole: 'Lysis Buffer' } }],
    });
    expectRejectedAt(result, '/ops/0/material/materialRole');
  });

  it('REJECTS a step_insert payload leaking record fields (stepId/ordinal are minted/renumbered, never proposed)', () => {
    const result = validate({
      ops: [{ ...completeInsert.wash!, stepId: 'step-wash-me', ordinal: 4 }],
    });
    expectRejectedAt(result, '/ops/0');
  });

  it('REJECTS a malformed WellSelector on a step_insert payload at the field path', () => {
    const result = validate({
      ops: [{ ...completeInsert.wash!, wells: { kind: 'explicit' } }],
    });
    expectRejectedAt(result, '/ops/0/wells');
  });

  it('REJECTS a modality outside the StepRead enum at /ops/0/modality', () => {
    const result = validate({
      ops: [{ ...completeInsert.read!, modality: 'fluorescence-x' }],
    });
    expectRejectedAt(result, '/ops/0/modality');
  });

  it('REJECTS a step_insert missing the required kind', () => {
    const result = validate({
      ops: [{ op: 'step_insert', afterStepId: 'step-001', label: 'Wash' }],
    });
    expectRejectedAt(result, '/ops/0');
  });

  it('REJECTS an empty ops array (a proposal must carry at least one op)', () => {
    const result = validate({ protocolId: 'PRT-000123', ops: [] });
    expectRejectedAt(result, '/ops');
  });

  it('REJECTS a step_update with no stepId (which step is being edited?)', () => {
    const result = validate({ ops: [{ op: 'step_update', label: 'X' }] });
    expectRejectedAt(result, '/ops/0');
  });

  it('REJECTS an ops value that is a single op object, not an array', () => {
    const result = validate({ ops: validStepDelete });
    expectRejectedAt(result, '/ops');
  });
});
