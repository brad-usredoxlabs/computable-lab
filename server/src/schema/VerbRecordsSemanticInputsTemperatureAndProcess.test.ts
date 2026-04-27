/**
 * Tests for temperature/process verb records with semanticInputs.
 *
 * Validates:
 *  - exactly 10 temperature/process verb records exist under records/workflow/
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
  centrifuge: 1,
  pellet: 2,
  incubate: 1,
  heat: 1,
  cool: 1,
  thermal_cycle: 2,
  sonicate: 1,
  vortex: 1,
  homogenize: 1,
  lyse: 1,
};

// The 10 verb IDs we care about
const TARGET_VERB_IDS = [
  'VERB-CENTRIFUGE',
  'VERB-PELLET',
  'VERB-INCUBATE',
  'VERB-HEAT',
  'VERB-COOL',
  'VERB-THERMAL-CYCLE',
  'VERB-SONICATE',
  'VERB-VORTEX',
  'VERB-HOMOGENIZE',
  'VERB-LYSE',
];

describe('VerbRecordsSemanticInputsTemperatureAndProcess', () => {
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

  function loadTemperatureAndProcessVerbs(): Array<Record<string, unknown>> {
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

  it('loads exactly 10 temperature/process verb records', () => {
    const records = loadTemperatureAndProcessVerbs();
    const targetVerbs = records.filter((r) =>
      TARGET_VERB_IDS.includes(r.id as string)
    );
    expect(targetVerbs).toHaveLength(10);
  });

  it('every temperature/process verb record has semanticInputs', () => {
    const records = loadTemperatureAndProcessVerbs();
    const targetVerbs = records.filter((r) =>
      TARGET_VERB_IDS.includes(r.id as string)
    );

    for (const record of targetVerbs) {
      expect(record.semanticInputs).toBeDefined();
      expect(Array.isArray(record.semanticInputs)).toBe(true);
    }
  });

  it('every temperature/process verb record validates against the verb-definition schema', () => {
    const records = loadTemperatureAndProcessVerbs();
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
    const records = loadTemperatureAndProcessVerbs();
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

  it('VERB-CENTRIFUGE has 1 semanticInputs entry', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-CENTRIFUGE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-PELLET has 2 semanticInputs entries', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-PELLET');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
    expect(verb!.semanticInputs[1].name).toBe('substance');
  });

  it('VERB-INCUBATE has 1 semanticInputs entry', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-INCUBATE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-HEAT has 1 semanticInputs entry', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-HEAT');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-COOL has 1 semanticInputs entry', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-COOL');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-THERMAL-CYCLE has 2 semanticInputs entries', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-THERMAL-CYCLE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(2);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
    expect(verb!.semanticInputs[1].name).toBe('program');
  });

  it('VERB-SONICATE has 1 semanticInputs entry', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-SONICATE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-VORTEX has 1 semanticInputs entry', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-VORTEX');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-HOMOGENIZE has 1 semanticInputs entry', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-HOMOGENIZE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });

  it('VERB-LYSE has 1 semanticInputs entry', () => {
    const records = loadTemperatureAndProcessVerbs();
    const verb = records.find((r) => r.id === 'VERB-LYSE');
    expect(verb).toBeDefined();
    expect(verb!.semanticInputs).toHaveLength(1);
    expect(verb!.semanticInputs[0].name).toBe('targetRole');
  });
});
