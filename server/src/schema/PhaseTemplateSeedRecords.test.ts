/**
 * Tests for phase-template seed records.
 *
 * Validates:
 *  - exactly 15 phase-template records exist under records/workflow/
 *  - every record validates against the phase-template schema
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
const phaseTemplateDir = resolve(repoRoot, 'records', 'workflow');

describe('phase-template seed records', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    // Load the phase-template schema
    const schemaRoot = join(repoRoot, 'schema');
    const schemaPath = 'workflow/phase-template.schema.yaml';
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

  // ── Load all phase-template records ──────────────────────────────────

  function loadPhaseTemplateRecords(): Array<Record<string, unknown>> {
    const files = readdirSync(phaseTemplateDir)
      .filter((f) => f.startsWith('PHASE-') && f.endsWith('.yaml'));

    const records: Array<Record<string, unknown>> = [];
    for (const file of files) {
      const raw = readFileSync(resolve(phaseTemplateDir, file), 'utf8');
      const parsed = load(raw) as Record<string, unknown>;
      // Strip $schema before validation — RecordParser strips it at line 113
      // before building the envelope, so the schema (additionalProperties: false)
      // never sees it.
      const { $schema: _schema, ...record } = parsed;
      records.push(record);
    }

    return records;
  }

  it('loads exactly 15 phase-template records', () => {
    const records = loadPhaseTemplateRecords();
    expect(records).toHaveLength(15);
  });

  it('every record has kind: phase-template', () => {
    const records = loadPhaseTemplateRecords();
    for (const record of records) {
      expect(record.kind).toBe('phase-template');
    }
  });

  it('every record validates against the phase-template schema', () => {
    const records = loadPhaseTemplateRecords();
    const schemaId =
      'https://computable-lab.com/schema/computable-lab/phase-template.schema.yaml';

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
    const records = loadPhaseTemplateRecords();
    const canonicals = records.map((r) => r.canonical as string);
    const unique = new Set(canonicals);
    expect(unique.size).toBe(15);
  });

  it('every record has a valid domain value', () => {
    const records = loadPhaseTemplateRecords();
    const validDomains = new Set([
      'cell-biology',
      'biochemistry',
      'molecular-biology',
      'general',
    ]);

    for (const record of records) {
      expect(validDomains.has(record.domain as string)).toBe(true);
    }
  });

  it('every record has a valid id pattern (PHASE-*)', () => {
    const records = loadPhaseTemplateRecords();
    const idPattern = /^PHASE-[A-Z0-9-]+$/;

    for (const record of records) {
      expect(idPattern.test(record.id as string)).toBe(true);
    }
  });

  it('every record has a valid canonical pattern (lowercase kebab-case)', () => {
    const records = loadPhaseTemplateRecords();
    const canonicalPattern = /^[a-z][a-z0-9-]*$/;

    for (const record of records) {
      expect(canonicalPattern.test(record.canonical as string)).toBe(true);
    }
  });
});
