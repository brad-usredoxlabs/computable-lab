/**
 * Tests for liquid-handling verb records with semanticInputs.
 *
 * Validates:
 *  - exactly 9 liquid-handling verb records exist under records/workflow/
 *  - every record has a semanticInputs block
 *  - every record validates against the verb-definition schema
 *  - semanticInputs.length matches the expected count per verb
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
const verbDir = resolve(repoRoot, 'records', 'workflow');

// Expected semanticInputs counts per verb canonical name
const EXPECTED_COUNTS: Record<string, number> = {
  transfer: 3,
  aspirate: 2,
  dispense: 2,
  mix: 1,
  dilute: 2,
  wash: 1,
  resuspend: 1,
  filter: 2,
  dispose: 1,
};

describe('VerbRecordsSemanticInputsLiquidHandling', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    // Load the verb-definition schema and its dependencies
    const schemaRoot = join(repoRoot, 'schema');
    const schemaPaths = [
      'core/common.schema.yaml',
      'core/datatypes/ref.schema.yaml',
      'workflow/verb-definition.schema.yaml',
    ];

    const contents = new Map<string, string>();
    for (const path of schemaPaths) {
      contents.set(path, await import('node:fs/promises').then(
        ({ readFile }) => readFile(join(schemaRoot, path), 'utf8')
      ));
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

  // ── Load verb records ────────────────────────────────────────────────

  function loadLiquidHandlingVerbs(): Array<Record<string, unknown>> {
    const files = readdirSync(verbDir)
      .filter(
        (f) =>
          f.startsWith('VERB-') &&
          f.endsWith('.yaml') &&
          !f.endsWith('.schema.yaml') &&
          !f.endsWith('.lint.yaml') &&
          !f.endsWith('.ui.yaml')
      );

    const records: Array<Record<string, unknown>> = [];
    for (const file of files) {
      const raw = readFileSync(resolve(verbDir, file), 'utf8');
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

  it('loads exactly 9 liquid-handling verb records', () => {
    const records = loadLiquidHandlingVerbs();
    const liquidHandling = records.filter(
      (r) => r.domain === 'liquid_handling' || r.domain === 'sample_prep' || r.domain === 'manual'
    );
    // We only care about the 9 specific verbs listed in the spec
    const targetVerbs = records.filter(
      (r) =>
        r.id === 'VERB-TRANSFER' ||
        r.id === 'VERB-ASPIRATE' ||
        r.id === 'VERB-DISPENSE' ||
        r.id === 'VERB-MIX' ||
        r.id === 'VERB-DILUTE' ||
        r.id === 'VERB-WASH' ||
        r.id === 'VERB-RESUSPEND' ||
        r.id === 'VERB-FILTER' ||
        r.id === 'VERB-DISPOSE'
    );
    expect(targetVerbs).toHaveLength(9);
  });

  it('every liquid-handling verb record has semanticInputs', () => {
    const records = loadLiquidHandlingVerbs();
    const targetVerbs = records.filter(
      (r) =>
        r.id === 'VERB-TRANSFER' ||
        r.id === 'VERB-ASPIRATE' ||
        r.id === 'VERB-DISPENSE' ||
        r.id === 'VERB-MIX' ||
        r.id === 'VERB-DILUTE' ||
        r.id === 'VERB-WASH' ||
        r.id === 'VERB-RESUSPEND' ||
        r.id === 'VERB-FILTER' ||
        r.id === 'VERB-DISPOSE'
    );

    for (const record of targetVerbs) {
      expect(record.semanticInputs).toBeDefined();
      expect(Array.isArray(record.semanticInputs)).toBe(true);
    }
  });

  it('every liquid-handling verb record validates against the verb-definition schema', () => {
    const records = loadLiquidHandlingVerbs();
    const schemaId =
      'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml';

    const targetVerbs = records.filter(
      (r) =>
        r.id === 'VERB-TRANSFER' ||
        r.id === 'VERB-ASPIRATE' ||
        r.id === 'VERB-DISPENSE' ||
        r.id === 'VERB-MIX' ||
        r.id === 'VERB-DILUTE' ||
        r.id === 'VERB-WASH' ||
        r.id === 'VERB-RESUSPEND' ||
        r.id === 'VERB-FILTER' ||
        r.id === 'VERB-DISPOSE'
    );

    for (const record of targetVerbs) {
      const result = validator.validate(record, schemaId);
      expect(result.valid).toBe(true);
      if (!result.valid) {
        console.error(`Validation failed for ${record.id}:`, result.errors);
      }
    }
  });

  it('semanticInputs.length matches expected count for each verb', () => {
    const records = loadLiquidHandlingVerbs();
    const targetVerbs = records.filter(
      (r) =>
        r.id === 'VERB-TRANSFER' ||
        r.id === 'VERB-ASPIRATE' ||
        r.id === 'VERB-DISPENSE' ||
        r.id === 'VERB-MIX' ||
        r.id === 'VERB-DILUTE' ||
        r.id === 'VERB-WASH' ||
        r.id === 'VERB-RESUSPEND' ||
        r.id === 'VERB-FILTER' ||
        r.id === 'VERB-DISPOSE'
    );

    for (const record of targetVerbs) {
      const canonical = record.canonical as string;
      const expected = EXPECTED_COUNTS[canonical];
      expect(expected).toBeDefined();
      expect(record.semanticInputs).toHaveLength(expected);
    }
  });

  it('VERB-TRANSFER has 3 semanticInputs entries', () => {
    const records = loadLiquidHandlingVerbs();
    const verb = records.find((r) => r.id === 'VERB-TRANSFER');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(3);
    expect(verb!.semanticInputs[0].name).toBe('substance');
    expect(verb!.semanticInputs[1].name).toBe('sourceRole');
    expect(verb!.semanticInputs[2].name).toBe('destRole');
  });

  it('VERB-ASPIRATE has 2 semanticInputs entries', () => {
    const records = loadLiquidHandlingVerbs();
    const verb = records.find((r) => r.id === 'VERB-ASPIRATE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('substance');
    expect(verb!.semanticInputs[1].name).toBe('sourceRole');
  });

  it('VERB-DISPENSE has 2 semanticInputs entries', () => {
    const records = loadLiquidHandlingVerbs();
    const verb = records.find((r) => r.id === 'VERB-DISPENSE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('substance');
    expect(verb!.semanticInputs[1].name).toBe('destRole');
  });

  it('VERB-MIX has 1 semanticInputs entry', () => {
    const records = loadLiquidHandlingVerbs();
    const verb = records.find((r) => r.id === 'VERB-MIX');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-DILUTE has 2 semanticInputs entries', () => {
    const records = loadLiquidHandlingVerbs();
    const verb = records.find((r) => r.id === 'VERB-DILUTE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('substance');
    expect(verb!.semanticInputs[1].name).toBe('targetRole');
  });

  it('VERB-WASH has 1 semanticInputs entry', () => {
    const records = loadLiquidHandlingVerbs();
    const verb = records.find((r) => r.id === 'VERB-WASH');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-RESUSPEND has 1 semanticInputs entry', () => {
    const records = loadLiquidHandlingVerbs();
    const verb = records.find((r) => r.id === 'VERB-RESUSPEND');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-FILTER has 2 semanticInputs entries', () => {
    const records = loadLiquidHandlingVerbs();
    const verb = records.find((r) => r.id === 'VERB-FILTER');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
    expect(verb!.semanticInputs[1].name).toBe('substance');
  });

  it('VERB-DISPOSE has 1 semanticInputs entry', () => {
    const records = loadLiquidHandlingVerbs();
    const verb = records.find((r) => r.id === 'VERB-DISPOSE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });
});
