/**
 * Tests for phase-template schema contracts.
 *
 * Validates:
 *  - schema is registered in the registry
 *  - one valid minimal payload
 *  - one invalid payload with bad domain
 *  - one invalid payload missing canonical
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

describe('PhaseTemplateSchemas', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    const schemaRoot = join(process.cwd(), 'schema');
    const paths = [
      'workflow/phase-template.schema.yaml',
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

  it('registers the phase-template schema in the registry', () => {
    const schemaId =
      'https://computable-lab.com/schema/computable-lab/phase-template.schema.yaml';

    expect(registry.has(schemaId)).toBe(true);
  });

  // ── Valid payload ───────────────────────────────────────────────────

  describe('phase-template', () => {
    it('accepts a minimal valid payload', () => {
      const valid = {
        kind: 'phase-template',
        id: 'PHASE-CELL-PLATING',
        canonical: 'cell-plating',
        label: 'Cell Plating',
        description: 'Seeding cells into culture plates.',
        domain: 'cell-biology',
      };

      expect(
        validator.validate(
          valid,
          'https://computable-lab.com/schema/computable-lab/phase-template.schema.yaml'
        ).valid
      ).toBe(true);
    });

    // ── Invalid: bad domain ──────────────────────────────────────────

    it('rejects a payload with an invalid domain value', () => {
      const invalid = {
        kind: 'phase-template',
        id: 'PHASE-CELL-PLATING',
        canonical: 'cell-plating',
        label: 'Cell Plating',
        description: 'Seeding cells into culture plates.',
        domain: 'not-a-real-domain',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/phase-template.schema.yaml'
        ).valid
      ).toBe(false);
    });

    // ── Invalid: missing canonical ───────────────────────────────────

    it('rejects a payload missing the canonical field', () => {
      const invalid = {
        kind: 'phase-template',
        id: 'PHASE-CELL-PLATING',
        label: 'Cell Plating',
        description: 'Seeding cells into culture plates.',
        domain: 'cell-biology',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/phase-template.schema.yaml'
        ).valid
      ).toBe(false);
    });
  });
});
