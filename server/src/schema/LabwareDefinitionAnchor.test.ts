// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_ROOT = resolve(__dirname, '../../../schema');
const RECORDS_ROOT = resolve(__dirname, '../../../records', 'seed');

const SCHEMA_FILES = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'workflow/labware-definition.schema.yaml',
] as const;

const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab';

async function buildValidator() {
  const contents = new Map<string, string>();
  for (const path of SCHEMA_FILES) {
    contents.set(path, readFileSync(join(SCHEMA_ROOT, path), 'utf8'));
  }
  const loaded = await loadSchemasFromContent(contents);
  const validator = createValidator({ strict: false });
  for (const entry of loaded.entries) validator.addSchema(entry.schema, entry.id);
  return validator;
}

function withoutSchemaRef(payload: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = payload;
  return rest;
}

function readRecords(dir: string): Array<{ file: string; payload: Record<string, unknown> }> {
  const abs = join(RECORDS_ROOT, dir);
  const results: Array<{ file: string; payload: Record<string, unknown> }> = [];
  for (const name of readdirSync(abs).filter((n) => n.endsWith('.yaml'))) {
    const content = readFileSync(join(abs, name), 'utf8');
    const docs = parseAllDocuments(content);
    for (const doc of docs) {
      const payload = doc.toJSON() as Record<string, unknown>;
      if (payload && typeof payload === 'object') {
        results.push({ file: `${dir}/${name}`, payload });
      }
    }
  }
  return results;
}

describe('labware-definition ontology_ref anchor', () => {
  it('accepts a valid ontology anchor (kind: ontology, CURIE id)', async () => {
    const validator = await buildValidator();
    const validWithAnchor = {
      kind: 'labware-definition',
      recordId: 'LWD-TEST-001',
      type: 'labware_definition',
      id: 'LWD-TEST-001',
      display_name: 'Test Plate',
      topology: { addressing: 'grid', rows: 8, columns: 12 },
      capacity: { max_well_volume_uL: 200 },
      ontology_ref: { kind: 'ontology', id: 'LWO:0000100' },
    };
    const result = validator.validate(
      validWithAnchor,
      `${SCHEMA_ID}/labware-definition.schema.yaml`
    );
    expect(result.errors).toEqual([]);
  });

  it('seed labware-definition records validate (optional ontology_ref)', async () => {
    const validator = await buildValidator();
    const records = [
      ...readRecords('labware-definition'),
      ...readRecords('labware-definitions'),
    ];

    // Only validate records that match the schema's kind/type
    const matching = records.filter((r) =>
      r.payload.kind === 'labware-definition' &&
      r.payload.type === 'labware_definition'
    );

    let validated = 0;
    for (const record of matching) {
      const res = validator.validate(
        withoutSchemaRef(record.payload),
        `${SCHEMA_ID}/labware-definition.schema.yaml`
      );
      if (!res.errors || res.errors.length === 0) {
        validated++;
      }
    }
    console.log(`Validated ${validated} of ${matching.length} seed labware-definition records`);
    expect(validated).toBeGreaterThan(0);
  });

  // g5d1save D1(b) — the create path stamps provenance keys onto every payload
  // before Ajv validation (RecordHandlers create path). The strict root
  // (additionalProperties: false) must accept those server-supplied keys.
  it('accepts a create payload carrying server-injected provenance timestamps', async () => {
    const validator = await buildValidator();
    const serverBuilt = {
      kind: 'labware-definition',
      recordId: 'LW-ABCD1234',
      type: 'labware_definition',
      id: 'LW-ABCD1234',
      display_name: 'Server-built plate',
      topology: { addressing: 'grid', rows: 8, columns: 12 },
      capacity: { max_well_volume_uL: 200 },
      createdAt: '2026-11-11T00:00:00.000Z',
      updatedAt: '2026-11-11T00:00:00.000Z',
      createdBy: 'local-user',
    };
    const result = validator.validate(
      serverBuilt,
      `${SCHEMA_ID}/labware-definition.schema.yaml`
    );
    expect(result.errors).toEqual([]);
  });

  it('rejects a malformed CURIE (lowercase prefix, space in local part)', async () => {
    const validator = await buildValidator();
    const badCurie = {
      kind: 'labware-definition',
      recordId: 'LWD-FAIL-001',
      type: 'labware_definition',
      id: 'LWD-FAIL-001',
      display_name: 'Bad CURIE',
      topology: { addressing: 'grid', rows: 8, columns: 12 },
      capacity: { max_well_volume_uL: 200 },
      ontology_ref: { kind: 'ontology', id: 'lwo 100' },
    };
    const result = validator.validate(
      badCurie,
      `${SCHEMA_ID}/labware-definition.schema.yaml`
    );
    expect(result.errors).not.toEqual([]);
  });

  it('rejects a wrong kind value', async () => {
    const validator = await buildValidator();
    const wrongKind = {
      kind: 'labware-definition',
      recordId: 'LWD-FAIL-002',
      type: 'labware_definition',
      id: 'LWD-FAIL-002',
      display_name: 'Wrong Kind',
      topology: { addressing: 'grid', rows: 8, columns: 12 },
      capacity: { max_well_volume_uL: 200 },
      ontology_ref: { kind: 'term', id: 'LWO:0000100' },
    };
    const result = validator.validate(
      wrongKind,
      `${SCHEMA_ID}/labware-definition.schema.yaml`
    );
    expect(result.errors).not.toEqual([]);
  });
});
