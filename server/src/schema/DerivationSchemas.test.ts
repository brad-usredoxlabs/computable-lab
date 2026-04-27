/**
 * Tests for derivation registry schema contracts.
 *
 * Validates:
 *  - schema is auto-discovered by loadSchemasFromContent
 *  - one valid minimal payload
 *  - one invalid payload missing canonical
 *  - one invalid payload with bad inputType
 *  - one invalid payload with bad returnType
 *  - canonical uniqueness helper at test time
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

// ── Test-time canonical uniqueness helper ───────────────────────────────

/**
 * Return a sorted array of canonical values that appear more than once
 * in the given derivation records.  Empty array means all unique.
 */
function duplicateCanonicals(records: Array<{ canonical: string }>): string[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    counts.set(r.canonical, (counts.get(r.canonical) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([c]) => c)
    .sort();
}

describe('DerivationSchemas', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    const schemaRoot = join(process.cwd(), '..', 'schema');
    const paths = [
      'registry/derivations/derivation.schema.yaml',
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

  // ── Auto-discovery ────────────────────────────────────────────────────

  it('discovers the derivation schema via loadSchemasFromContent', () => {
    const schemaId =
      'https://computable-lab.com/schema/computable-lab/registry/derivation.schema.yaml';

    expect(registry.has(schemaId)).toBe(true);

    const entry = registry.getById(schemaId);
    expect(entry).toBeDefined();
    expect(entry!.schema.properties?.kind?.const).toBe('derivation');
  });

  // ── Valid payload ─────────────────────────────────────────────────────

  describe('derivation', () => {
    it('accepts a minimal valid payload', () => {
      const valid = {
        kind: 'derivation',
        id: 'DRV-LABWARE-ROLE',
        canonical: 'labware_role',
        description: 'Returns the user-given role of a labware instance.',
        inputType: 'labware-instance',
        returnType: 'string',
      };

      expect(
        validator.validate(
          valid,
          'https://computable-lab.com/schema/computable-lab/registry/derivation.schema.yaml'
        ).valid
      ).toBe(true);
    });

    // ── Invalid: missing canonical ─────────────────────────────────────

    it('rejects a payload missing the canonical field', () => {
      const invalid = {
        kind: 'derivation',
        id: 'DRV-LABWARE-ROLE',
        description: 'Returns the user-given role of a labware instance.',
        inputType: 'labware-instance',
        returnType: 'string',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/registry/derivation.schema.yaml'
        ).valid
      ).toBe(false);
    });

    // ── Invalid: bad inputType ─────────────────────────────────────────

    it('rejects a payload with an invalid inputType value', () => {
      const invalid = {
        kind: 'derivation',
        id: 'DRV-LABWARE-ROLE',
        canonical: 'labware_role',
        description: 'Returns the user-given role of a labware instance.',
        inputType: 'not-a-real-type',
        returnType: 'string',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/registry/derivation.schema.yaml'
        ).valid
      ).toBe(false);
    });

    // ── Invalid: bad returnType ────────────────────────────────────────

    it('rejects a payload with an invalid returnType value', () => {
      const invalid = {
        kind: 'derivation',
        id: 'DRV-LABWARE-ROLE',
        canonical: 'labware_role',
        description: 'Returns the user-given role of a labware instance.',
        inputType: 'labware-instance',
        returnType: 'bogus',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/registry/derivation.schema.yaml'
        ).valid
      ).toBe(false);
    });

    // ── Canonical uniqueness at test time ──────────────────────────────

    it('reports no duplicates for two distinct records', () => {
      const records = [
        { canonical: 'labware_role' },
        { canonical: 'active_ingredients' },
      ];
      expect(duplicateCanonicals(records)).toEqual([]);
    });

    it('reports duplicates when two records share the same canonical', () => {
      const records = [
        { canonical: 'labware_role' },
        { canonical: 'labware_role' },
      ];
      const dups = duplicateCanonicals(records);
      expect(dups.length).toBeGreaterThan(0);
      expect(dups).toContain('labware_role');
    });
  });
});
