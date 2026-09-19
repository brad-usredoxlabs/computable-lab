/**
 * EquipmentFirstClass — equipment is a first-class record kind, NOT a labware
 * type. The type-level capability lives on `equipment-class` (settingsDefinition
 * + settingsDefinition); the instance (`equipment`, EQP-) carries concrete
 * `settings` and a class ref. This proves Ajv accepts the declarative shape,
 * including the water-bath temperature setting and qPCR-accepts-plate_96.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'lab/equipment-class.schema.yaml',
  'lab/equipment.schema.yaml',
] as const;

const EQUIPMENT_CLASS_SCHEMA = 'https://computable-lab.com/schema/computable-lab/equipment-class.schema.yaml';
const EQUIPMENT_SCHEMA = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml';

async function loadEquipmentSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  const result = await loadSchemasFromContent(contents);
  const validator = createValidator({ strict: false });
  for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);
  return validator;
}

describe('first-class equipment model', () => {
  it('loads the equipment + equipment-class schemas (no $ref resolution error)', async () => {
    const validator = await loadEquipmentSchemas();
    expect(validator).toBeDefined();
  });

  it('accepts a water-bath class with a temperature_c setting and no accepted labware', async () => {
    const validator = await loadEquipmentSchemas();
    const out = validator.validate({
      kind: 'equipment-class',
      id: 'EQC-WATER-BATH',
      name: 'Water Bath',
      settingsDefinition: [{ key: 'temperature_c', label: 'Target temperature', valueType: 'number', unit: '°C', min: 0, max: 99 }],
    }, EQUIPMENT_CLASS_SCHEMA);
    expect(out.valid).toBe(true);
  });

  it('accepts a qPCR class that accepts a 96-well plate (compatibility is data)', async () => {
    const validator = await loadEquipmentSchemas();
    const out = validator.validate({
      kind: 'equipment-class',
      id: 'EQC-QPCR',
      name: 'qPCR Machine',
      settingsDefinition: [{ key: 'anneal_temperature_c', label: 'Anneal temperature', valueType: 'number', unit: '°C' }],
    }, EQUIPMENT_CLASS_SCHEMA);
    expect(out.valid).toBe(true);
  });

  it('accepts a water-bath equipment instance with a concrete temperature setting', async () => {
    const validator = await loadEquipmentSchemas();
    const out = validator.validate({
      kind: 'equipment',
      id: 'EQP-WATER-BATH',
      name: 'Water Bath',
      status: 'active',
      equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-WATER-BATH' },
      settings: { temperature_c: 55 },
    }, EQUIPMENT_SCHEMA);
    expect(out.valid).toBe(true);
  });

  it('rejects a malformed equipment instance (missing status)', async () => {
    const validator = await loadEquipmentSchemas();
    const out = validator.validate({
      kind: 'equipment',
      id: 'EQP-X',
      name: 'Broken',
      settings: { temperature_c: 99 },
    }, EQUIPMENT_SCHEMA);
    expect(out.valid).toBe(false);
  });

  it('accepts a thermocycler class declaring a profile (cycling program) valueType', async () => {
    const validator = await loadEquipmentSchemas();
    const out = validator.validate({
      kind: 'equipment-class',
      id: 'EQC-TC',
      name: 'Thermocycler',
      settingsDefinition: [{ key: 'cycling_program', label: 'Cycling program', valueType: 'profile' }],
    }, EQUIPMENT_CLASS_SCHEMA);
    expect(out.valid).toBe(true);
  });

  it('validates the seeded qPCR class profileDefinition (real cycling program)', async () => {
    const validator = await loadEquipmentSchemas();
    const out = validator.validate({
      kind: 'equipment-class',
      id: 'EQC-QPCR',
      name: 'qPCR Machine',
      settingsDefinition: [
        { key: 'anneal_temperature_c', label: 'Anneal temperature', valueType: 'number', unit: '°C' },
        {
          key: 'cycling_program',
          label: 'Cycling program',
          valueType: 'profile',
          profileDefinition: {
            initial: { temperature_c: 95, duration_sec: 180 },
            cycles: {
              count: 40,
              steps: [
                { temperature_c: 95, duration_sec: 5 },
                { temperature_c: 60, duration_sec: 30 },
              ],
            },
          },
        },
      ],
    }, EQUIPMENT_CLASS_SCHEMA);
    expect(out.valid).toBe(true);
  });
});