/**
 * Tests for readout and miscellaneous verb records with semanticInputs.
 *
 * Validates:
 *  - exactly 8 readout/miscellaneous verb records exist under records/workflow/
 *  - every record has a semanticInputs block
 *  - every record validates against the verb-definition schema
 *  - semanticInputs.length matches the expected count per verb
 *  - all 27 VERB-* records across specs 011, 012, 013 have semanticInputs
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
  measure: 2,
  read: 2,
  image: 2,
  weigh: 2,
  seal: 1,
  unseal: 1,
  label: 1,
  store: 2,
};

// The 8 verb IDs we care about
const TARGET_VERB_IDS = [
  'VERB-MEASURE',
  'VERB-READ',
  'VERB-IMAGE',
  'VERB-WEIGH',
  'VERB-SEAL',
  'VERB-UNSEAL',
  'VERB-LABEL',
  'VERB-STORE',
];

describe('VerbRecordsSemanticInputsReadoutAndMisc', () => {
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

  function loadReadoutAndMiscVerbs(): Array<Record<string, unknown>> {
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

  it('loads exactly 8 readout/miscellaneous verb records', () => {
    const records = loadReadoutAndMiscVerbs();
    const targetVerbs = records.filter((r) =>
      TARGET_VERB_IDS.includes(r.id as string)
    );
    expect(targetVerbs).toHaveLength(8);
  });

  it('every readout/miscellaneous verb record has semanticInputs', () => {
    const records = loadReadoutAndMiscVerbs();
    const targetVerbs = records.filter((r) =>
      TARGET_VERB_IDS.includes(r.id as string)
    );

    for (const record of targetVerbs) {
      expect(record.semanticInputs).toBeDefined();
      expect(Array.isArray(record.semanticInputs)).toBe(true);
    }
  });

  it('every readout/miscellaneous verb record validates against the verb-definition schema', () => {
    const records = loadReadoutAndMiscVerbs();
    const schemaId =
      'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml';

    const targetVerbs = records.filter((r) =>
      TARGET_VERB_IDS.includes(r.id as string)
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
    const records = loadReadoutAndMiscVerbs();
    const targetVerbs = records.filter((r) =>
      TARGET_VERB_IDS.includes(r.id as string)
    );

    for (const record of targetVerbs) {
      const canonical = record.canonical as string;
      const expected = EXPECTED_COUNTS[canonical];
      expect(expected).toBeDefined();
      expect(record.semanticInputs).toHaveLength(expected);
    }
  });

  it('VERB-MEASURE has 2 semanticInputs entries', () => {
    const records = loadReadoutAndMiscVerbs();
    const verb = records.find((r) => r.id === 'VERB-MEASURE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
    expect(verb!.semanticInputs[1].name).toBe('measurementType');
  });

  it('VERB-READ has 2 semanticInputs entries', () => {
    const records = loadReadoutAndMiscVerbs();
    const verb = records.find((r) => r.id === 'VERB-READ');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
    expect(verb!.semanticInputs[1].name).toBe('readModality');
  });

  it('VERB-IMAGE has 2 semanticInputs entries', () => {
    const records = loadReadoutAndMiscVerbs();
    const verb = records.find((r) => r.id === 'VERB-IMAGE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
    expect(verb!.semanticInputs[1].name).toBe('imagingMode');
  });

  it('VERB-WEIGH has 2 semanticInputs entries', () => {
    const records = loadReadoutAndMiscVerbs();
    const verb = records.find((r) => r.id === 'VERB-WEIGH');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
    expect(verb!.semanticInputs[1].name).toBe('substance');
  });

  it('VERB-SEAL has 1 semanticInputs entry', () => {
    const records = loadReadoutAndMiscVerbs();
    const verb = records.find((r) => r.id === 'VERB-SEAL');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-UNSEAL has 1 semanticInputs entry', () => {
    const records = loadReadoutAndMiscVerbs();
    const verb = records.find((r) => r.id === 'VERB-UNSEAL');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-LABEL has 1 semanticInputs entry', () => {
    const records = loadReadoutAndMiscVerbs();
    const verb = records.find((r) => r.id === 'VERB-LABEL');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-STORE has 2 semanticInputs entries', () => {
    const records = loadReadoutAndMiscVerbs();
    const verb = records.find((r) => r.id === 'VERB-STORE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
    expect(verb!.semanticInputs[1].name).toBe('locationRole');
  });

  it('has semanticInputs on all 27 verb records', () => {
    const records = loadReadoutAndMiscVerbs();
    const verbRecords = records.filter((r) =>
      (r.id as string).startsWith('VERB-')
    );
    expect(verbRecords).toHaveLength(27);

    for (const record of verbRecords) {
      expect(record.semanticInputs).toBeDefined();
      expect(Array.isArray(record.semanticInputs)).toBe(true);
      expect((record.semanticInputs as unknown[]).length).toBeGreaterThan(0);
    }
  });
});
