/**
 * MDER-REF-1 — cross-schema $ref lock test for material-derivation.schema.yaml.
 *
 * RED-first defect lock: the schema's four ref pointers (inputs.items,
 * outputs.items, protocol_ref, source_event_graph_ref) pointed at
 * '../core/ref.schema.yaml', which does not exist under the schema's $id
 * (the datatype lives at core/datatypes/ref.schema.yaml, $id
 * .../computable-lab/datatypes/ref.schema.yaml). Ajv defers resolution, so
 * addSchema succeeds and boot logs stay silent; the FIRST validation of a
 * material-derivation payload throws
 * "can't resolve reference ../core/ref.schema.yaml from id ...material-derivation.schema.yaml".
 *
 * This test mirrors the production boot path (server.ts: addSchema per entry,
 * then validate) on a hermetic explicit file list (convention of
 * BiologicalTypesSchema.test.ts): getSchema must COMPILE, a well-formed record
 * ref entry must validate, and an inputs entry missing the required `kind`
 * must be REJECTED as a data error naming `inputs` — not a validator throw.
 * DATA-only fix: the pointers must use the repo convention
 * './datatypes/ref.schema.yaml' (see aliquot.schema.yaml:28).
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_PATHS = [
  'core/datatypes/ref.schema.yaml',
  'lab/material-derivation.schema.yaml',
] as const;

const MDER_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/material-derivation.schema.yaml';

async function loadMderSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  const result = loadSchemasFromContent(contents);
  expect(result.errors.map((e) => `${e.path}: ${e.error}`)).toEqual([]);
  return result.entries;
}

/** Register the subset the way server.ts does: addSchema each entry. */
async function buildValidator() {
  const entries = await loadMderSchemas();
  const validator = createValidator();
  for (const entry of entries) validator.addSchema(entry.schema, entry.id);
  return validator;
}

function mderPayload(inputs: unknown[], outputs: unknown[]): Record<string, unknown> {
  return {
    kind: 'material-derivation',
    id: 'MDER-l2t1955-lock-1',
    name: 'Conditioned media collection',
    derivation_type: 'collection',
    inputs,
    outputs,
  };
}

const wellFormedInputRef = { kind: 'record', id: 'STU-1', type: 'study' };
const wellFormedOutputRef = { kind: 'record', id: 'MAT-1', type: 'material' };

describe('material-derivation cross-schema $ref (MDER-REF-1)', () => {
  it('compiles material-derivation through addSchema + getSchema (RED: throws "can\'t resolve reference ../core/ref.schema.yaml")', async () => {
    const validator = await buildValidator();
    // RED today: this getSchema triggers Ajv's deferred compile and THROWS
    // because ../core/ref.schema.yaml cannot be resolved from the $id.
    const validateFn = validator.getSchema(MDER_SCHEMA_ID);
    expect(validateFn).toBeDefined();
  });

  it('validates a well-formed material-derivation payload with record refs', async () => {
    const validator = await buildValidator();
    const out = validator.validate(
      mderPayload([wellFormedInputRef], [wellFormedOutputRef]),
      MDER_SCHEMA_ID,
    );
    expect(out.errors.map((e) => `${e.path}: ${e.message}`)).toEqual([]);
    expect(out.valid).toBe(true);
  });

  it('rejects an inputs entry missing the required kind as a DATA error naming inputs', async () => {
    const validator = await buildValidator();
    // {id:'STU-1'} without kind — must be a rejection verdict, not a throw.
    const out = validator.validate(
      mderPayload([{ id: 'STU-1' }], [wellFormedOutputRef]),
      MDER_SCHEMA_ID,
    );
    expect(out.valid).toBe(false);
    expect(out.errors.some((e) => e.path.includes('inputs'))).toBe(true);
    expect(out.errors.some((e) => e.keyword === 'required')).toBe(true);
  });
});
