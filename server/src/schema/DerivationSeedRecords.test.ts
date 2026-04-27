/**
 * Tests for derivation seed records.
 *
 * Validates:
 *  - exactly 7 derivation records exist under schema/registry/derivations/
 *  - every record validates against the derivation schema
 *  - every record's canonical field is unique
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const derivationDir = resolve(repoRoot, 'schema', 'registry', 'derivations');

describe('derivation seed records', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    // Load the derivation schema
    const schemaRoot = join(repoRoot, 'schema');
    const schemaPath = 'registry/derivations/derivation.schema.yaml';
    const schemaContent = await import('node:fs/promises').then(
      ({ readFile }) => readFile(join(schemaRoot, schemaPath), 'utf8')
    );

    const contents = new Map<string, string>();
    contents.set(schemaPath, schemaContent);

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

  // ── Load all derivation records ──────────────────────────────────────

  function loadDerivationRecords(): Array<Record<string, unknown>> {
    const files = readdirSync(derivationDir)
      .filter(
        (f) =>
          f.endsWith('.yaml') &&
          !f.endsWith('.schema.yaml') &&
          !f.endsWith('.lint.yaml') &&
          !f.endsWith('.ui.yaml')
      );

    const records: Array<Record<string, unknown>> = [];
    for (const file of files) {
      const raw = readFileSync(resolve(derivationDir, file), 'utf8');
      const parsed = load(raw) as Record<string, unknown>;
      // Strip $schema before validation — RecordParser strips it at line 113
      // before building the envelope, so the schema (additionalProperties: false)
      // never sees it.
      const { $schema: _schema, ...record } = parsed;
      records.push(record);
    }

    return records;
  }

  // ── Tests ────────────────────────────────────────────────────────────

  it('loads exactly 7 derivation records', () => {
    const records = loadDerivationRecords();
    expect(records).toHaveLength(7);
  });

  it('every record has kind: derivation', () => {
    const records = loadDerivationRecords();
    for (const record of records) {
      expect(record.kind).toBe('derivation');
    }
  });

  it('every record validates against the derivation schema', () => {
    const records = loadDerivationRecords();
    const schemaId =
      'https://computable-lab.com/schema/computable-lab/registry/derivation.schema.yaml';

    for (const record of records) {
      const result = validator.validate(record, schemaId);
      expect(result.valid).toBe(true);
      if (!result.valid) {
        console.error(
          `Validation failed for ${record.id}:`,
          result.errors
        );
      }
    }
  });

  it('every canonical value is unique across the loaded set', () => {
    const records = loadDerivationRecords();
    const canonicals = records.map((r) => r.canonical as string);
    const unique = new Set(canonicals);
    expect(unique.size).toBe(7);
  });
});
