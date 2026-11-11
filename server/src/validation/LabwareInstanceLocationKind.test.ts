/**
 * Labware location kind enum — Ajv schema contract test.
 *
 * Proves that the labware-instance schema's location.kind enum:
 *  - REJECTS a non-canonical kind value ('somewhere')
 *  - ACCEPTS a canonical kind value ('bench')
 *
 * Uses the real SchemaRegistry + AjvValidator pipeline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml';

describe('labware-instance location.kind enum (Ajv)', () => {
  let validate: (payload: Record<string, unknown>) => { valid: boolean; errors?: unknown[] };

  beforeAll(async () => {
    const schemaDir = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema');
    const loaded = await loadAllSchemas({ basePath: schemaDir, recursive: true });
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    const validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema as never, id);
      }
    }
    validate = (payload: Record<string, unknown>) =>
      validator.validate(payload, SCHEMA_ID);
  });

  it('rejects a non-canonical location.kind value ("somewhere")', () => {
    const result = validate({
      kind: 'labware-instance',
      recordId: 'LBI-DEADBEEF',
      labwareId: 'LW-PLATE-96',
      location: { kind: 'somewhere' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors?.some(
      (e: any) => e.keyword === 'enum' && e.path === '/location/kind'
    )).toBe(true);
  });

  it('accepts a canonical location.kind value ("bench")', () => {
    const result = validate({
      kind: 'labware-instance',
      recordId: 'LBI-DEADBEEF',
      labwareId: 'LW-PLATE-96',
      location: { kind: 'bench' },
    });
    expect(result.valid).toBe(true);
  });
});
