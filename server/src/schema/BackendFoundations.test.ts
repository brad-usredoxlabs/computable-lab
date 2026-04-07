import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const FOUNDATION_SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'lab/person.schema.yaml',
  'lab/training-material.schema.yaml',
  'lab/training-record.schema.yaml',
  'lab/competency-authorization.schema.yaml',
  'lab/equipment-class.schema.yaml',
  'lab/equipment.schema.yaml',
  'lab/equipment-training-requirement.schema.yaml',
  'lab/calibration-record.schema.yaml',
  'lab/qualification-record.schema.yaml',
  'workflow/verb-definition.schema.yaml',
  'workflow/equipment-capability.schema.yaml',
  'workflow/method-training-requirement.schema.yaml',
] as const;

async function loadFoundationSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();

  for (const path of FOUNDATION_SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }

  return loadSchemasFromContent(contents);
}

describe('Backend foundation schemas', () => {
  it('load into the schema registry with capability and authorization dependencies', async () => {
    const result = await loadFoundationSchemas();
    expect(result.errors).toEqual([]);

    const registry = createSchemaRegistry();
    registry.addSchemas(result.entries);

    expect(registry.has('https://computable-lab.com/schema/computable-lab/person.schema.yaml')).toBe(true);
    expect(registry.has('https://computable-lab.com/schema/computable-lab/equipment.schema.yaml')).toBe(true);
    expect(registry.has('https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml')).toBe(true);
    expect(registry.has('https://computable-lab.com/schema/computable-lab/equipment-capability.schema.yaml')).toBe(true);
    expect(
      registry.getDependencies('https://computable-lab.com/schema/computable-lab/equipment-capability.schema.yaml'),
    ).toContain('https://computable-lab.com/schema/computable-lab/datatypes/ref.schema.yaml');
  });

  it('validate representative payloads for people, authorization, equipment, and semantic capabilities', async () => {
    const result = await loadFoundationSchemas();
    expect(result.errors).toEqual([]);

    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }

    const person = validator.validate(
      {
        kind: 'person',
        id: 'PER-ALICE',
        displayName: 'Alice Analyst',
        status: 'active',
      },
      'https://computable-lab.com/schema/computable-lab/person.schema.yaml',
    );
    expect(person.valid).toBe(true);

    const equipment = validator.validate(
      {
        kind: 'equipment',
        id: 'EQP-SHAKER-1',
        name: 'Orbital Shaker 1',
        status: 'active',
        equipmentClassRef: {
          kind: 'record',
          type: 'equipment-class',
          id: 'EQC-SHAKER',
        },
      },
      'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml',
    );
    expect(equipment.valid).toBe(true);

    const authorization = validator.validate(
      {
        kind: 'competency-authorization',
        id: 'AUTH-MIX-1',
        personRef: {
          kind: 'record',
          type: 'person',
          id: 'PER-ALICE',
        },
        status: 'active',
        effectiveAt: '2026-01-01T00:00:00Z',
        scope: {
          verbRefs: [
            {
              kind: 'record',
              type: 'verb-definition',
              id: 'VERB-MIX',
            },
          ],
          equipmentClassRefs: [
            {
              kind: 'record',
              type: 'equipment-class',
              id: 'EQC-SHAKER',
            },
          ],
        },
      },
      'https://computable-lab.com/schema/computable-lab/competency-authorization.schema.yaml',
    );
    expect(authorization.valid).toBe(true);

    const capability = validator.validate(
      {
        kind: 'equipment-capability',
        id: 'ECP-SHAKER-MIX',
        status: 'active',
        equipmentClassRef: {
          kind: 'record',
          type: 'equipment-class',
          id: 'EQC-SHAKER',
        },
        capabilities: [
          {
            verbRef: {
              kind: 'record',
              type: 'verb-definition',
              id: 'VERB-MIX',
            },
            backendImplementations: ['orbital_shaker', 'manual'],
            constraints: {
              rpmMax: 1200,
            },
          },
        ],
      },
      'https://computable-lab.com/schema/computable-lab/equipment-capability.schema.yaml',
    );
    expect(capability.valid).toBe(true);
  });
});
