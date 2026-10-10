/**
 * W2-5 T6 — schema leg for the OQ1 seam (spec §5 + §6 T6).
 *
 * Harness COPY of server/src/schema/Wave2ProtocolIntentSchema.test.ts:
 * loadAllSchemas + registry topological order + createValidator({strict:false})
 * over the REAL schema tree.
 *
 * Arms per §5: an intent-step provenance ref with type: evidence PASSES the
 * widened $defs/StepProvenanceRef; type: material-spec still REJECTS (closed
 * enum, not a free string); type: vendor-protocol-candidate (the original
 * const) still passes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const schemaRoot = join(process.cwd(), '..', 'schema');

let validator: ReturnType<typeof createValidator>;
let registry: ReturnType<typeof createSchemaRegistry>;

beforeAll(async () => {
  const result = await loadAllSchemas({ basePath: schemaRoot });
  expect(result.errors).toEqual([]);
  registry = createSchemaRegistry();
  registry.addSchemas(result.entries);
  validator = createValidator({ strict: false });
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
});

function intentProtocolWithProvenanceType(type: string): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId: 'PRT-w25-seam',
    title: 'W2-5 OQ1 seam fixture',
    steps: [
      {
        stepId: 'inc-batch',
        label: 'Incubate the batch',
        ordinal: 1,
        kind: 'incubate',
        intent: {
          semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'VERB-INCUBATE' }, canonical: 'incubate' },
          provenance: [{ kind: 'record', type, id: 'CAN-w25-demo', pageStart: 1 }],
        },
      },
    ],
  };
}

describe('W2-5 T6: StepProvenanceRef type widening (OQ1 seam, enum [vendor-protocol-candidate, evidence])', () => {
  it('the seam site exists as a CLOSED ENUM at both sites of the $defs block (promotion-record widening, not a free string)', () => {
    const entry = registry.getById(PROTOCOL_ID);
    const raw = JSON.stringify(entry!.schema);
    const stepRef = (entry!.schema as Record<string, unknown>).$defs as Record<string, unknown>;
    expect(stepRef.StepProvenanceRef).toBeDefined();
    // Both sites widened consistently (allOf constraint + properties block).
    expect(raw.match(/"enum":\["vendor-protocol-candidate","evidence"\]/g)?.length).toBe(2);
  });

  it('POSITIVE: an intent-step provenance ref with type: evidence validates (family-side INFERRED_INVARIANT anchor)', async () => {
    const r = await validator.validate(intentProtocolWithProvenanceType('evidence'), PROTOCOL_ID);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('the original const member still validates (widening is additive)', async () => {
    const r = await validator.validate(intentProtocolWithProvenanceType('vendor-protocol-candidate'), PROTOCOL_ID);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('NEGATIVE: type: material-spec still REJECTS — closed enum, not a free string', async () => {
    const r = await validator.validate(intentProtocolWithProvenanceType('material-spec'), PROTOCOL_ID);
    expect(r.valid).toBe(false);
    expect(JSON.stringify(r.errors)).toContain('vendor-protocol-candidate');
  });

  it('NEGATIVE: a free string type still REJECTS', async () => {
    const r = await validator.validate(intentProtocolWithProvenanceType('semantic-protocol-family'), PROTOCOL_ID);
    expect(r.valid).toBe(false);
  });
});
