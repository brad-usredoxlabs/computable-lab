/**
 * Tests for verb-definition semanticInputs schema contract.
 *
 * Validates:
 *  - schema is registered in the registry
 *  - one valid verb-definition with semanticInputs
 *  - one valid verb-definition without semanticInputs (back-compat)
 *  - one invalid payload missing name in a semanticInputs entry
 *  - one invalid payload missing derivedFrom in a semanticInputs entry
 *  - uniqueness helper: findDuplicateSemanticInputNames catches duplicates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Types ────────────────────────────────────────────────────────────────

interface SemanticInput {
  name: string;
  derivedFrom: { input: string; fn: string };
  required: boolean;
}

interface VerbDefinition {
  kind?: string;
  id?: string;
  canonical?: string;
  label?: string;
  domain?: string;
  semanticInputs?: SemanticInput[];
}

/**
 * Return a list of duplicate names found in semanticInputs[].name.
 * Empty array means all names are unique.
 */
function findDuplicateSemanticInputNames(verb: VerbDefinition): string[] {
  if (!verb.semanticInputs) return [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const si of verb.semanticInputs) {
    if (seen.has(si.name)) {
      if (!duplicates.includes(si.name)) {
        duplicates.push(si.name);
      }
    } else {
      seen.add(si.name);
    }
  }
  return duplicates;
}

describe('VerbDefinitionSemanticInputs', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    const schemaRoot = join(__dirname, '..', '..', '..', 'schema');
    const paths = [
      'core/common.schema.yaml',
      'core/datatypes/ref.schema.yaml',
      'workflow/verb-definition.schema.yaml',
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

  // ── Registration ──────────────────────────────────────────────────────

  it('registers the verb-definition schema in the registry', () => {
    const schemaId =
      'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml';

    expect(registry.has(schemaId)).toBe(true);
  });

  // ── Valid payloads ────────────────────────────────────────────────────

  describe('verb-definition', () => {
    // ── Valid: with semanticInputs ─────────────────────────────────────

    it('accepts a verb-definition with semanticInputs', () => {
      const valid: VerbDefinition = {
        kind: 'verb-definition',
        id: 'VERB-TRANSFER',
        canonical: 'transfer',
        label: 'Transfer',
        domain: 'liquid_handling',
        semanticInputs: [
          {
            name: 'substance',
            derivedFrom: { input: 'formulation', fn: 'active_ingredients' },
            required: true,
          },
          {
            name: 'sourceRole',
            derivedFrom: { input: 'source', fn: 'labware_role' },
            required: true,
          },
          {
            name: 'destRole',
            derivedFrom: { input: 'destination', fn: 'labware_role' },
            required: true,
          },
        ],
      };

      expect(
        validator.validate(
          valid,
          'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml'
        ).valid
      ).toBe(true);
    });

    // ── Valid: without semanticInputs (back-compat) ────────────────────

    it('accepts a verb-definition without semanticInputs', () => {
      const valid: VerbDefinition = {
        kind: 'verb-definition',
        id: 'VERB-ASPIRATE',
        canonical: 'aspirate',
        label: 'Aspirate',
        domain: 'liquid_handling',
      };

      expect(
        validator.validate(
          valid,
          'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml'
        ).valid
      ).toBe(true);
    });
  });

  // ── Invalid payloads ──────────────────────────────────────────────────

  describe('invalid semanticInputs', () => {
    // ── Invalid: missing name ──────────────────────────────────────────

    it('rejects a semanticInputs entry missing name', () => {
      const invalid = {
        kind: 'verb-definition',
        id: 'VERB-TRANSFER',
        canonical: 'transfer',
        label: 'Transfer',
        domain: 'liquid_handling',
        semanticInputs: [
          {
            // @ts-expect-error name is intentionally missing
            derivedFrom: { input: 'formulation', fn: 'active_ingredients' },
            required: true,
          },
        ],
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml'
        ).valid
      ).toBe(false);
    });

    // ── Invalid: missing derivedFrom ───────────────────────────────────

    it('rejects a semanticInputs entry missing derivedFrom', () => {
      const invalid = {
        kind: 'verb-definition',
        id: 'VERB-TRANSFER',
        canonical: 'transfer',
        label: 'Transfer',
        domain: 'liquid_handling',
        semanticInputs: [
          {
            name: 'substance',
            // @ts-expect-error derivedFrom is intentionally missing
            required: true,
          },
        ],
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml'
        ).valid
      ).toBe(false);
    });
  });

  // ── Uniqueness helper ─────────────────────────────────────────────────

  describe('findDuplicateSemanticInputNames', () => {
    it('returns empty array when all names are unique', () => {
      const verb: VerbDefinition = {
        kind: 'verb-definition',
        id: 'VERB-TRANSFER',
        canonical: 'transfer',
        label: 'Transfer',
        domain: 'liquid_handling',
        semanticInputs: [
          {
            name: 'substance',
            derivedFrom: { input: 'formulation', fn: 'active_ingredients' },
            required: true,
          },
          {
            name: 'sourceRole',
            derivedFrom: { input: 'source', fn: 'labware_role' },
            required: true,
          },
          {
            name: 'destRole',
            derivedFrom: { input: 'destination', fn: 'labware_role' },
            required: true,
          },
        ],
      };

      expect(findDuplicateSemanticInputNames(verb)).toEqual([]);
    });

    it('returns duplicate names when there are duplicates', () => {
      const verb: VerbDefinition = {
        kind: 'verb-definition',
        id: 'VERB-TRANSFER',
        canonical: 'transfer',
        label: 'Transfer',
        domain: 'liquid_handling',
        semanticInputs: [
          {
            name: 'substance',
            derivedFrom: { input: 'formulation', fn: 'active_ingredients' },
            required: true,
          },
          {
            name: 'substance', // duplicate
            derivedFrom: { input: 'secondary', fn: 'active_ingredients' },
            required: false,
          },
        ],
      };

      const duplicates = findDuplicateSemanticInputNames(verb);
      expect(duplicates).toContain('substance');
      expect(duplicates.length).toBeGreaterThan(0);
    });

    it('returns empty array when semanticInputs is undefined', () => {
      const verb: VerbDefinition = {
        kind: 'verb-definition',
        id: 'VERB-ASPIRATE',
        canonical: 'aspirate',
        label: 'Aspirate',
        domain: 'liquid_handling',
      };

      expect(findDuplicateSemanticInputNames(verb)).toEqual([]);
    });
  });
});
