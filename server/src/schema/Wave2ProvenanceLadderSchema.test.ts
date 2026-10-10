/**
 * W2-4-PROVENANCE-LADDER — T1 schema contracts (spec §3 T1).
 *
 * Harness (COPY of BranchAxisSchemaContracts.test.ts:28-40): whole-tree
 * loadAllSchemas({ basePath: join(process.cwd(), 'schema') }) + registry
 * topological order + createValidator({ strict: false }). vitest ONLY from
 * <wt>/server.
 *
 * Arms (spec §3 T1 a-i):
 *  a. the rung datatype registers with zero loader errors
 *  b. the rung enum is EXACTLY the four admitted rungs (read from the parsed
 *     schema, not hardcoded twice — §8.1 reads IT)
 *  c. per-rung lineage arms (conditional if/then arms)
 *  d. candidate closure arms — the SCHEMA leg of "DERIVED can never be
 *     promoted to VENDOR": rung / locally_validated / validatedBy keys on
 *     candidate facts are schema REJECTS (additionalProperties:false)
 *  e. ladder-absence regression: candidate / local-protocol / ref schemas
 *     validate a pre-W2-4 clean fixture (files untouched)
 *  f. vocabulary-as-data parse: rung ids read back EXACTLY the four strings,
 *     set-agree with the datatype enum, curies agree with the crosswalk
 *  g. forbidden-kind hygiene (mirrors the pinned admission test's leg without
 *     touching it) + provenance-rung / provenance-vocabulary explicitly
 *  h. INFERRED_INVARIANT instantiation on TODAY's surfaces (the honest OQ1
 *     leg): assertion.evidence_refs + evidence required supports/sources
 *  i. the derived-query name is NOT a field: no enum / property / status
 *     named like it in any *.schema.yaml (semantic version of the §6 grep)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const RUNG_REF_ID =
  'https://computable-lab.com/schema/computable-lab/datatypes/provenance-rung-ref.schema.yaml';
const CANDIDATE_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';
const LOCAL_PROTOCOL_ID =
  'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';
const REF_ID =
  'https://computable-lab.com/schema/computable-lab/datatypes/ref.schema.yaml';
const EVIDENCE_ID =
  'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml';
const ASSERTION_ID =
  'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml';

const RUNGS = ['VENDOR', 'DERIVED', 'INFERRED_INVARIANT', 'LOCAL_REALIZATION'];

const VOCAB_PATH = fileURLToPath(
  new URL('../../../schema/registry/provenance-ladder/rung-vocabulary.yaml', import.meta.url),
);
const CROSSWALK_PATH = fileURLToPath(
  new URL('../../../schema/registry/wave2-naming-crosswalk.yaml', import.meta.url),
);
const SCHEMA_ROOT = join(process.cwd(), 'schema');

let entries: Array<{ id: string; schema: Record<string, unknown> }>;
let registry!: ReturnType<typeof createSchemaRegistry>;
let validator!: ReturnType<typeof createValidator>;

beforeAll(async () => {
  const result = await loadAllSchemas({ basePath: SCHEMA_ROOT });
  expect(result.errors).toEqual([]);
  entries = result.entries as Array<{ id: string; schema: Record<string, unknown> }>;
  registry = createSchemaRegistry();
  registry.addSchemas(result.entries);
  validator = createValidator({ strict: false });
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Walk a parsed schema for properties.rung.enum (structure-tolerant read). */
function findRungEnum(schema: unknown): unknown[] | undefined {
  if (schema === null || typeof schema !== 'object') return undefined;
  if (Array.isArray(schema)) {
    for (const item of schema) {
      const found = findRungEnum(item);
      if (found) return found;
    }
    return undefined;
  }
  const obj = schema as Record<string, unknown>;
  const props = obj.properties as Record<string, unknown> | undefined;
  const rung = props?.rung as Record<string, unknown> | undefined;
  if (rung && Array.isArray(rung.enum)) return rung.enum;
  for (const value of Object.values(obj)) {
    const found = findRungEnum(value);
    if (found) return found;
  }
  return undefined;
}

/** A minimal candidate payload built from the schema's required skeleton. */
function candidateFixture(): Record<string, unknown> {
  const provenance = { documentId: 'doc-w24-1', pageStart: 1 };
  const extracted = (id: string): Record<string, unknown> => ({
    id,
    label: `Extracted ${id}`,
    sourceText: 'source text',
    provenance: { ...provenance },
    confidence: 0.9,
  });
  return {
    kind: 'vendor-protocol-candidate',
    source: { documentId: 'doc-w24-1', filename: 'w24.pdf', pageCount: 3, vendor: 'W2-4 Fixture Vendor' },
    title: 'W2-4 candidate fixture',
    sections: [
      { id: 'sec-spec', kind: 'specifications', title: 'Specifications', provenance: { ...provenance } },
    ],
    materials: [extracted('mat-1')],
    equipment: [extracted('eq-1')],
    labware: [extracted('lw-1')],
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        sourceText: 'Add reagent to the plate.',
        actions: [{ actionKind: 'add', sourceText: 'Add reagent', provenance: { ...provenance } }],
        conditions: {},
        materials: ['mat-1'],
        labware: ['lw-1'],
        equipment: [],
        notes: [],
        branches: [],
        provenance: { ...provenance },
        confidence: 0.9,
      },
    ],
    tables: [
      {
        id: 'tbl-1',
        title: 'Reagents',
        headers: ['name', 'volume'],
        rows: [{ name: 'reagent A', volume: '10 uL' }],
        sourceText: 'table text',
        provenance: { ...provenance },
      },
    ],
    notes: [extracted('note-1')],
    outputs: [extracted('out-1')],
    diagnostics: [],
  };
}

function localProtocolFixture(): Record<string, unknown> {
  return {
    kind: 'local-protocol',
    recordId: 'LPR-w24-schema-fixture',
    title: 'W2-4 local protocol schema fixture',
    inherits_from: { kind: 'record', id: 'PRT-w24-schema-fixture', type: 'protocol' },
    status: 'draft',
  };
}

// ---------------------------------------------------------------------------
// (a) the rung datatype registers
// ---------------------------------------------------------------------------

describe('rung datatype registration', () => {
  it('the whole-tree loader registers provenance-rung-ref with zero errors', () => {
    expect(registry.has(RUNG_REF_ID)).toBe(true);
    const entry = entries.find((e) => e.id === RUNG_REF_ID);
    expect(entry).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// (b) rung enum EXACT (read from the parsed schema — §8.1)
// ---------------------------------------------------------------------------

describe('rung enum is EXACTLY the four admitted rungs', () => {
  it('the datatype rung enum set-equals the four rung names', () => {
    const entry = entries.find((e) => e.id === RUNG_REF_ID)!;
    const rungEnum = findRungEnum(entry.schema);
    expect(rungEnum, 'rung enum found in the parsed schema').toBeDefined();
    expect(new Set(rungEnum)).toEqual(new Set(RUNGS));
    expect(rungEnum!.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// (c) per-rung lineage arms
// ---------------------------------------------------------------------------

describe('per-rung conditional lineage arms', () => {
  it('DERIVED with a document anchor is VALID', () => {
    const payload = {
      kind: 'record',
      type: 'vendor-protocol-candidate',
      id: 'CAN-w24-demo',
      rung: 'DERIVED',
      pageStart: 1,
    };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(true);
  });

  it('DERIVED WITHOUT pageStart is INVALID (lineage required)', () => {
    const payload = {
      kind: 'record',
      type: 'vendor-protocol-candidate',
      id: 'CAN-w24-demo',
      rung: 'DERIVED',
    };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(false);
  });

  it('INFERRED_INVARIANT without evidence anchors is INVALID', () => {
    const payload = { kind: 'record', type: 'assertion', id: 'ASN-w24-1', rung: 'INFERRED_INVARIANT' };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(false);
  });

  it('INFERRED_INVARIANT with a non-empty evidence anchor array is VALID', () => {
    const payload = {
      kind: 'record',
      type: 'assertion',
      id: 'ASN-w24-1',
      rung: 'INFERRED_INVARIANT',
      evidence: [{ kind: 'record', id: 'EVD-1', type: 'evidence' }],
    };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(true);
  });

  it('INFERRED_INVARIANT with an EMPTY evidence array is INVALID', () => {
    const payload = {
      kind: 'record',
      type: 'assertion',
      id: 'ASN-w24-1',
      rung: 'INFERRED_INVARIANT',
      evidence: [],
    };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(false);
  });

  it('VENDOR rides a candidate ref + pageStart and is VALID', () => {
    const payload = {
      kind: 'record',
      type: 'vendor-protocol-candidate',
      id: 'CAN-w24-demo',
      rung: 'VENDOR',
      pageStart: 2,
    };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(true);
  });

  it('VENDOR with a non-candidate type is INVALID (constrained ref arm)', () => {
    const payload = { kind: 'record', type: 'run', id: 'RUN-000041', rung: 'VENDOR', pageStart: 1 };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(false);
  });

  it('LOCAL_REALIZATION rides the LPR record ref and is VALID', () => {
    const payload = {
      kind: 'record',
      type: 'local-protocol',
      id: 'LPR-w24-demo',
      rung: 'LOCAL_REALIZATION',
    };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(true);
  });

  it('an unknown rung value is INVALID', () => {
    const payload = { kind: 'record', type: 'protocol', id: 'PRT-w24-demo', rung: 'NOT_A_RUNG' };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(false);
  });

  it('a fifth-rung mutation is INVALID (enum closed to the four)', () => {
    const payload = { kind: 'record', type: 'protocol', id: 'PRT-w24-demo', rung: 'ATTESTED' };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(false);
  });

  // Named probe (spec §2.3 closure decision): the datatype closes rung VALUES
  // (enum), NOT extra keys — ref.schema.yaml is open, so an unknown key on a
  // rung-ref is ACCEPTED BY DESIGN. Probed, not assumed.
  it('PROBE: unknown extra keys are accepted by design (rung VALUES closed, keys open)', () => {
    const payload = {
      kind: 'record',
      type: 'vendor-protocol-candidate',
      id: 'CAN-w24-demo',
      rung: 'DERIVED',
      pageStart: 1,
      someFutureKey: 'open ref datatype — closure decision recorded in the report',
    };
    expect(validator.validate(payload, RUNG_REF_ID).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (d) candidate closure arms — the SCHEMA leg of the no-promotion wall
// ---------------------------------------------------------------------------

describe('candidate closure arms (schema REJECTS, zero lint needed)', () => {
  it('the clean candidate fixture validates (baseline)', () => {
    expect(validator.validate(candidateFixture(), CANDIDATE_ID).valid).toBe(true);
  });

  it('a rung key on a candidate fact provenance is INVALID (additionalProperties:false)', () => {
    const payload = candidateFixture();
    const steps = payload.steps as Array<Record<string, unknown>>;
    const provenance = { ...(steps[0]!.provenance as Record<string, unknown>), rung: 'VENDOR' };
    steps[0] = { ...steps[0]!, provenance };
    expect(validator.validate(payload, CANDIDATE_ID).valid).toBe(false);
  });

  it('a locally_validated flag on a candidate step is INVALID (closed step)', () => {
    const payload = candidateFixture();
    const steps = payload.steps as Array<Record<string, unknown>>;
    steps[0] = { ...steps[0]!, locally_validated: true };
    expect(validator.validate(payload, CANDIDATE_ID).valid).toBe(false);
  });

  it('a validatedBy key on a candidate step is INVALID (closed step)', () => {
    const payload = candidateFixture();
    const steps = payload.steps as Array<Record<string, unknown>>;
    steps[0] = { ...steps[0]!, validatedBy: 'vendor QA' };
    expect(validator.validate(payload, CANDIDATE_ID).valid).toBe(false);
  });

  it('a rung key on an ExtractedItem provenance is INVALID (labware fact)', () => {
    const payload = candidateFixture();
    const labware = payload.labware as Array<Record<string, unknown>>;
    const provenance = { ...(labware[0]!.provenance as Record<string, unknown>), rung: 'DERIVED' };
    labware[0] = { ...labware[0]!, provenance };
    expect(validator.validate(payload, CANDIDATE_ID).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (e) ladder-absence regression: untouched schemas still validate
// ---------------------------------------------------------------------------

describe('ladder-absence regression (non-scope guard from inside the suite)', () => {
  it('candidate / local-protocol / ref validate a pre-W2-4 clean fixture', () => {
    expect(validator.validate(candidateFixture(), CANDIDATE_ID).valid).toBe(true);
    expect(validator.validate(localProtocolFixture(), LOCAL_PROTOCOL_ID).valid).toBe(true);
    expect(
      validator.validate({ kind: 'record', id: 'PRT-000001', type: 'protocol' }, REF_ID).valid,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (f) vocabulary-as-data parse + crosswalk curie agreement
// ---------------------------------------------------------------------------

describe('rung vocabulary parses as data', () => {
  it('rung ids read back EXACTLY the four strings and set-agree with the datatype enum', async () => {
    const vocab = (await parseYaml(await readFile(VOCAB_PATH, 'utf-8'))) as {
      kind: string;
      doc_id: string;
      rungs: Array<{ id: string; curie: string }>;
    };
    expect(vocab.kind).toBe('provenance-vocabulary');
    expect(vocab.rungs.map((r) => r.id)).toEqual(RUNGS);

    const datatypeEntry = entries.find((e) => e.id === RUNG_REF_ID)!;
    const rungEnum = findRungEnum(datatypeEntry.schema)!;
    // the two sources agree as SETS (Wave2NamingCrosswalk.test.ts's own style)
    expect(new Set(vocab.rungs.map((r) => r.id))).toEqual(new Set(rungEnum));
  });

  it('every rung curie matches ^cf:provenance-[a-z-]+$ and equals the crosswalk curie_plan', async () => {
    const vocab = (await parseYaml(await readFile(VOCAB_PATH, 'utf-8'))) as {
      rungs: Array<{ id: string; curie: string }>;
    };
    const crosswalk = (await parseYaml(await readFile(CROSSWALK_PATH, 'utf-8'))) as {
      entries: Array<{ term: string; curie_plan?: string }>;
    };
    for (const rung of vocab.rungs) {
      expect(rung.curie).toMatch(/^cf:provenance-[a-z-]+$/);
      const entry = crosswalk.entries.find((e) => e.term === rung.id);
      expect(entry, `crosswalk entry for ${rung.id}`).toBeDefined();
      expect(entry!.curie_plan, `no curie drift for ${rung.id}`).toBe(rung.curie);
    }
  });
});

// ---------------------------------------------------------------------------
// (g) forbidden-kind hygiene (mirrors the pinned admission leg, untouched)
// ---------------------------------------------------------------------------

describe('forbidden-kind hygiene', () => {
  it('no forbidden string (and provenance-rung / provenance-vocabulary) is a kind const', async () => {
    const crosswalk = (await parseYaml(await readFile(CROSSWALK_PATH, 'utf-8'))) as {
      forbidden_kinds: string[];
    };
    const watched = new Set<string>([...crosswalk.forbidden_kinds, 'provenance-rung', 'provenance-vocabulary']);

    async function walk(dir: string): Promise<string[]> {
      const { readdir } = await import('node:fs/promises');
      const out: string[] = [];
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...(await walk(p)));
        else if (e.isFile() && e.name.endsWith('.schema.yaml')) out.push(p);
      }
      return out;
    }

    const kindConsts = new Set<string>();
    for (const path of await walk(SCHEMA_ROOT)) {
      const doc = (await parseYaml(await readFile(path, 'utf-8'))) as Record<string, unknown> | null;
      const props = doc?.properties as Record<string, unknown> | undefined;
      const kind = props?.kind as Record<string, unknown> | undefined;
      if (kind && typeof kind.const === 'string') kindConsts.add(kind.const);
    }
    for (const forbidden of watched) {
      expect(kindConsts.has(forbidden), `forbidden kind ${forbidden} exists`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// (h) INFERRED_INVARIANT on TODAY's surfaces (the honest OQ1 leg)
// ---------------------------------------------------------------------------

describe('INFERRED_INVARIANT instantiation on the knowledge layer (OQ1 seam honesty)', () => {
  const assertionPayload = (): Record<string, unknown> => ({
    kind: 'assertion',
    id: 'ASN-w24-inferred',
    scope: 'single_context',
    statement: 'Family invariant: lysis precedes binding in this protocol family.',
    context_refs: [{ kind: 'record', id: 'CTX-w24-1', type: 'context' }],
    evidence_refs: [{ kind: 'record', id: 'EVD-w24-inferred', type: 'evidence' }],
    status: 'active',
  });

  const evidencePayload = (): Record<string, unknown> => ({
    kind: 'evidence',
    id: 'EVD-w24-inferred',
    supports: [{ kind: 'record', id: 'ASN-w24-inferred', type: 'assertion' }],
    sources: [{ type: 'event', ref: { kind: 'record', id: 'EVG-w24-1', type: 'event-graph' } }],
    status: 'active',
  });

  it('assertion with evidence_refs + evidence with sources are both VALID', () => {
    expect(validator.validate(assertionPayload(), ASSERTION_ID).valid).toBe(true);
    expect(validator.validate(evidencePayload(), EVIDENCE_ID).valid).toBe(true);
  });

  it('the same evidence WITHOUT supports is INVALID (lineage required by the schema)', () => {
    const payload = evidencePayload();
    delete (payload as Record<string, unknown>).supports;
    expect(validator.validate(payload, EVIDENCE_ID).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (i) the derived-query name is NOT a field anywhere (semantic §6 grep)
// ---------------------------------------------------------------------------

describe('the derived-query name is never a property / enum value / status', () => {
  it('no *.schema.yaml declares a property, enum value, or status named like it', async () => {
    const offenders: string[] = [];

    function scan(doc: unknown, path: string, file: string): void {
      if (doc === null || typeof doc !== 'object') return;
      if (Array.isArray(doc)) {
        doc.forEach((item, i) => scan(item, `${path}[${i}]`, file));
        return;
      }
      const obj = doc as Record<string, unknown>;
      if (Array.isArray(obj.enum)) {
        for (const value of obj.enum) {
          if (typeof value === 'string' && /locally[-_]valid/i.test(value)) {
            offenders.push(`${file} ${path} enum value ${value}`);
          }
        }
      }
      if (obj.properties && typeof obj.properties === 'object') {
        for (const key of Object.keys(obj.properties as Record<string, unknown>)) {
          if (/locally[-_]valid/i.test(key)) offenders.push(`${file} ${path} property ${key}`);
        }
      }
      for (const [key, value] of Object.entries(obj)) {
        scan(value, `${path}.${key}`, file);
      }
    }

    async function walk(dir: string): Promise<string[]> {
      const { readdir } = await import('node:fs/promises');
      const out: string[] = [];
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...(await walk(p)));
        else if (e.isFile() && e.name.endsWith('.schema.yaml')) out.push(p);
      }
      return out;
    }

    for (const path of await walk(SCHEMA_ROOT)) {
      const doc = await parseYaml(await readFile(path, 'utf-8'));
      scan(doc, '', path.replace(SCHEMA_ROOT, 'schema'));
    }
    expect(offenders).toEqual([]);
  });
});
