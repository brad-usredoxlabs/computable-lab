/**
 * W2-3-PROTOCOL-SEMANTIC-UPGRADE — T1 schema contract tests.
 *
 * Harness (mirrors BranchAxisSchemaContracts.test.ts:28-40): whole-tree
 * loadAllSchemas + registry topological order + createValidator({strict:false}).
 *
 * Arms (spec §3 T1):
 *  a. legacy inventory byte-stability (six prt-seed-* records: validation outcome
 *     identical to the recorded BASE outcome — 1 valid, 5 pre-existing failures
 *     with the SAME error keys; no new failure introduced by W2-3)
 *  b. intent family fixture valid
 *  c. hidden literal volume_uL / catalog inside an intent step -> REJECTED
 *  d. actionable error names the literal key at the step path
 *  e. intent without semanticVerb -> REJECTED
 *  f. semanticVerb ref with type != verb-definition -> REJECTED
 *  g. PDT-derived branch_axes fixture validates (datatype + full record)
 *  h. W2-2 cross-file closure: constraint+quantity registered; fixture constraint
 *     class ids are members of the merged vocabulary data; undeclared class caught
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const CONDITION_ID = 'https://computable-lab.com/schema/computable-lab/datatypes/condition.schema.yaml';
const CONSTRAINT_ID = 'https://computable-lab.com/schema/computable-lab/registry/constraint.schema.yaml';
const QUANTITY_ID = 'https://computable-lab.com/schema/computable-lab/datatypes/quantity.schema.yaml';
const QUANTITY_RATIO_ID = 'https://computable-lab.com/schema/computable-lab/datatypes/quantity-ratio.schema.yaml';

const schemaRoot = join(process.cwd(), '..', 'schema');
const seedDir = join(process.cwd(), '..', 'records', 'seed', 'protocols');

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function verbRef(id: string, canonical: string): Record<string, unknown> {
  return { ref: { kind: 'record', type: 'verb-definition', id }, canonical };
}

function capabilityRef(): Record<string, unknown> {
  return { kind: 'ontology', id: 'CL:bead_beater', namespace: 'CL', label: 'bead beater' };
}

function capacityConstraint(): Record<string, unknown> {
  return {
    class: 'capacity',
    bindingKind: 'hard_bound',
    bound: { value: 200, unit: 'uL', dimension: 'volume' },
    subject: { ref: 'cf:well' },
  };
}

function provenanceRef(): Record<string, unknown> {
  return { kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-w23-demo', pageStart: 1, pageEnd: 3 };
}

/** The PDT-derived branch axis (mapping: schema/registry/branch-axis-mapping/pdt-axis-to-branch-axis.yaml):
 *  PDT axis {axisId, question, choiceKey, origin, conditions} -> BranchAxis {axisId, label, conditions};
 *  question -> label; choiceKey/origin/evidence NOT carried; predicates target $.branchSelection.<axisId>. */
function pdtDerivedAxis(): Record<string, unknown> {
  return {
    axisId: 'axis-dnasource',
    label: 'What is the DNA source?',
    conditions: [
      {
        id: 'branch-mammalian',
        label: 'Mammalian cell culture',
        predicate: { op: 'equals', path: '$.branchSelection.axis-dnasource', value: 'mammalian' },
        then_stepIds: ['inc-batch'],
      },
      {
        id: 'branch-bacterial',
        label: 'Bacterial pellet',
        predicate: { op: 'equals', path: '$.branchSelection.axis-dnasource', value: 'bacterial' },
        then_stepIds: ['read-od'],
      },
    ],
    shared_stepIds: ['read-od'],
  };
}

function intentFamily(): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId: 'PRT-w23-family',
    protocolLayer: 'universal',
    title: 'W2-3 intent family protocol',
    branch_axes: [pdtDerivedAxis()],
    variants: [
      { variantId: 'branch-mammalian', label: 'Mammalian cell culture', starting_material: 'DNA from mammalian cell culture' },
      { variantId: 'branch-bacterial', label: 'Bacterial pellet', starting_material: 'DNA from bacterial pellet' },
    ],
    roles: {
      materialRoles: [{ roleId: 'beads', description: 'Bashing beads' }],
      labwareRoles: [{ roleId: 'tube', description: '2 mL tube', expectedLabwareKinds: ['80x2ml-tube-rack'] }],
      instrumentRoles: [],
    },
    steps: [
      {
        stepId: 'inc-batch',
        label: 'Incubate the batch',
        ordinal: 1,
        kind: 'incubate',
        intent: {
          semanticVerb: verbRef('VERB-INCUBATE', 'incubate'),
          materialNeeds: [
            { need: 'beads', capabilityRequirement: capabilityRef() },
          ],
          constraints: [capacityConstraint()],
          provenance: [provenanceRef()],
          intentNotes: 'Hold at 4 C; the bound is the tube capacity, not a vendor number.',
        },
      },
      {
        stepId: 'read-od',
        label: 'Read the culture',
        ordinal: 2,
        kind: 'read',
        intent: {
          semanticVerb: verbRef('VERB-READ', 'read'),
          constraints: [
            {
              class: 'threshold',
              bindingKind: 'vendor_default',
              overridePolicy: 'lab-may-tighten',
              bound: { value: 0, unit: 'uL', dimension: 'volume', qualifier: 'approximately_zero' },
            },
          ],
          provenance: [provenanceRef()],
        },
      },
    ],
  };
}

function errorsOf(result: { errors?: Array<{ keyword?: string; path?: string; message?: string }> }): string[] {
  return (result.errors ?? []).map((e) => `${e.keyword}@${e.path ?? '/'}`).sort();
}

// ---------------------------------------------------------------------------
// (a) legacy inventory byte-stability
// ---------------------------------------------------------------------------

// BASE outcomes recorded at 7f4e751b BEFORE any W2-3 edit (scratch probe 11,
// /tmp/l2t1650-probe11.txt): only prt-seed-biological-transfer validates; the
// other five fail with PRE-EXISTING errors (missing step `ordinal`, unknown
// `notes` on labwareRoles). W2-3 must not change ANY of these outcomes.
const BASE_SEED_OUTCOMES: Record<string, { valid: boolean; errors: string[] }> = {
  'prt-seed-biological-transfer.yaml': { valid: true, errors: [] },
  'prt-seed-buffer-prep-50ml.yaml': {
    valid: false,
    errors: ['additionalProperties@/roles/labwareRoles/0', 'required@/steps/0', 'required@/steps/1', 'required@/steps/2'],
  },
  'prt-seed-incubate-plate.yaml': { valid: false, errors: ['required@/steps/0'] },
  'prt-seed-pbs-wash.yaml': {
    valid: false,
    errors: ['required@/steps/0', 'required@/steps/1', 'required@/steps/2'],
  },
  'prt-seed-serial-dilution-96.yaml': {
    valid: false,
    errors: Array.from({ length: 11 }, (_, i) => `required@/steps/${i}`),
  },
  'prt-seed-standard-curve-tubes.yaml': {
    valid: false,
    errors: ['additionalProperties@/roles/labwareRoles/0', ...Array.from({ length: 5 }, (_, i) => `required@/steps/${i}`)],
  },
};

describe('T1(a) legacy inventory byte-stability', () => {
  it('each of the six prt-seed records validates with the EXACT base outcome (no new failure)', async () => {
    const files = (await readdir(seedDir)).filter((f) => f.endsWith('.yaml')).sort();
    expect(files.sort()).toEqual(Object.keys(BASE_SEED_OUTCOMES).sort());
    for (const name of files) {
      const rec = parseYaml(await readFile(join(seedDir, name), 'utf8')) as Record<string, unknown>;
      delete rec.$schema; // store-side strip (seedProtocols.ts:26-28)
      const r = validator.validate(rec, PROTOCOL_ID);
      const expected = BASE_SEED_OUTCOMES[name]!;
      expect(r.valid, `${name} valid`).toBe(expected.valid);
      expect(errorsOf(r), `${name} error keys`).toEqual([...expected.errors].sort());
    }
  });
});

// ---------------------------------------------------------------------------
// (b) intent family fixture valid
// ---------------------------------------------------------------------------

describe('T1(b) intent family fixture', () => {
  it('the intent family protocol validates against protocol.schema.yaml', () => {
    const r = validator.validate(intentFamily(), PROTOCOL_ID);
    expect(errorsOf(r), JSON.stringify((r.errors ?? []).map((e) => `${e.keyword}@${e.instancePath} ${e.message}`))).toEqual([]);
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) hidden literal inside an intent step -> REJECTED
// ---------------------------------------------------------------------------

describe('T1(c) hidden literal execution params inside intent steps', () => {
  it('rejects an intent step carrying volume_uL', () => {
    const fam = intentFamily();
    const steps = fam.steps as Array<Record<string, unknown>>;
    steps[0] = { ...steps[0]!, volume_uL: 7 };
    const r = validator.validate(fam, PROTOCOL_ID);
    expect(r.valid).toBe(false);
  });

  it('rejects an intent step carrying a hidden unknown literal (catalog)', () => {
    const fam = intentFamily();
    const steps = fam.steps as Array<Record<string, unknown>>;
    steps[0] = { ...steps[0]!, catalog: 'D1001' };
    const r = validator.validate(fam, PROTOCOL_ID);
    expect(r.valid).toBe(false);
  });

  it('rejects an intent step carrying a COMPLETE literal payload (kind incubate + target + duration_min)', () => {
    const fam = intentFamily();
    const steps = fam.steps as Array<Record<string, unknown>>;
    steps[0] = { ...steps[0]!, target: { labwareRole: 'tube' }, duration_min: 30 };
    const r = validator.validate(fam, PROTOCOL_ID);
    expect(r.valid).toBe(false);
  });

  it('rejects an intent step carrying a hidden literal even when the step ALSO fully matches a literal arm (kind other + description + catalog)', () => {
    const fam = intentFamily();
    const steps = fam.steps as Array<Record<string, unknown>>;
    steps[1] = { ...steps[1]!, kind: 'other', description: 'legacy-ish', catalog: 'D1001' };
    const r = validator.validate(fam, PROTOCOL_ID);
    expect(r.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (d) actionable error names the literal key at the step path
// ---------------------------------------------------------------------------

describe('T1(d) actionable error', () => {
  it('the violation names the literal key path on the intent step', () => {
    const fam = intentFamily();
    const steps = fam.steps as Array<Record<string, unknown>>;
    steps[0] = { ...steps[0]!, volume_uL: 7 };
    const r = validator.validate(fam, PROTOCOL_ID);
    expect(r.valid).toBe(false);
    const messages = (r.errors ?? []).map((e) => `${e.path ?? '/'} ${e.message ?? e.keyword}`);
    expect(
      messages.some((m) => m.includes('/steps/0') && m.includes('volume_uL')),
      `errors name volume_uL at /steps/0: ${JSON.stringify(messages)}`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (e) intent without semanticVerb -> REJECTED
// ---------------------------------------------------------------------------

describe('T1(e) intent requires semanticVerb', () => {
  it('rejects an intent payload without semanticVerb', () => {
    const fam = intentFamily();
    const steps = fam.steps as Array<Record<string, unknown>>;
    steps[0] = { ...steps[0]!, intent: { intentNotes: 'no verb here' } };
    const r = validator.validate(fam, PROTOCOL_ID);
    expect(r.valid).toBe(false);
    expect(errorsOf(r)).toContain('required@/steps/0/intent');
  });
});

// ---------------------------------------------------------------------------
// (f) verb-definition ref shape enforced
// ---------------------------------------------------------------------------

describe('T1(f) semanticVerb ref constrained to verb-definition', () => {
  it('rejects a semanticVerb ref whose type is not verb-definition', () => {
    const fam = intentFamily();
    const steps = fam.steps as Array<Record<string, unknown>>;
    const intent = { ...(steps[1]!.intent as Record<string, unknown>) };
    intent.semanticVerb = { ref: { kind: 'record', type: 'material', id: 'MAT-1' } };
    steps[1] = { ...steps[1]!, intent };
    const r = validator.validate(fam, PROTOCOL_ID);
    expect(r.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (g) PDT-derived branch_axes fixture
// ---------------------------------------------------------------------------

describe('T1(g) PDT-derived branch axis', () => {
  it('the PDT-derived axis validates at the BranchAxis datatype level', () => {
    const r = validator.validate(pdtDerivedAxis(), CONDITION_ID);
    expect(errorsOf(r), JSON.stringify((r.errors ?? []).map((e) => `${e.keyword}@${e.instancePath} ${e.message}`))).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('the PDT-derived axis validates inside the full protocol record (branch_axes)', () => {
    const r = validator.validate(intentFamily(), PROTOCOL_ID);
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (h) W2-2 cross-file closure (the DSL cannot; the test can)
// ---------------------------------------------------------------------------

describe('T1(h) W2-2 datatype mount + vocabulary closure', () => {
  it('constraint + quantity datatypes are registered and resolve in the validator', () => {
    expect(registry.has(CONSTRAINT_ID)).toBe(true);
    expect(registry.has(QUANTITY_ID)).toBe(true);
    expect(registry.has(QUANTITY_RATIO_ID)).toBe(true);
    expect(validator.hasSchema(CONSTRAINT_ID)).toBe(true);
    expect(validator.hasSchema(QUANTITY_ID)).toBe(true);
  });

  it('the fixture constraint class ids are members of the merged vocabulary classIds', async () => {
    const vocab = parseYaml(
      await readFile(join(schemaRoot, 'registry', 'constraint-vocabulary', 'constraint-vocabulary.yaml'), 'utf8'),
    ) as { classIds: string[] };
    const fam = intentFamily() as { steps: Array<{ intent: { constraints?: Array<{ class: string }> } }> };
    const used = fam.steps.flatMap((s) => (s.intent.constraints ?? []).map((c) => c.class));
    expect(used.length).toBeGreaterThan(0);
    for (const cls of used) {
      expect(vocab.classIds, `constraint class ${cls} declared in vocabulary`).toContain(cls);
    }
  });

  it('a mutated fixture with an UNDECLARED class fails the closure assertion (non-vacuity)', async () => {
    const vocab = parseYaml(
      await readFile(join(schemaRoot, 'registry', 'constraint-vocabulary', 'constraint-vocabulary.yaml'), 'utf8'),
    ) as { classIds: string[] };
    const mutated = capacityConstraint();
    mutated.class = 'not_a_declared_class';
    expect(vocab.classIds).not.toContain(mutated.class);
    // And the datatype itself still rejects nothing structurally — closure is the vocabulary's job:
    const fam = intentFamily();
    const steps = fam.steps as Array<Record<string, unknown>>;
    const intent = { ...(steps[0]!.intent as Record<string, unknown>), constraints: [mutated] };
    steps[0] = { ...steps[0]!, intent };
    // structurally the class pattern is legal (^[a-z][a-z0-9_]*$), so the schema passes;
    // the CROSS-FILE closure is what the test above enforces.
    const r = validator.validate(fam, PROTOCOL_ID);
    expect(r.valid).toBe(true);
    expect(vocab.classIds).not.toContain('not_a_declared_class');
  });

  it('a Quantity bound with an approximately_zero qualifier validates through the mounted constraint (W2-2 OQ2 binding)', () => {
    const bound = { value: 0, unit: 'uL', dimension: 'volume', qualifier: 'approximately_zero' };
    const r = validator.validate(bound, QUANTITY_ID);
    expect(errorsOf(r), JSON.stringify((r.errors ?? []).map((e) => `${e.keyword}@${e.instancePath} ${e.message}`))).toEqual([]);
    expect(r.valid).toBe(true);
  });
});
