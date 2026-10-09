/**
 * W2-2-QUANTITY-CONSTRAINTS — schema contracts for the shared Quantity datatype
 * family and the constraint vocabulary document.
 *
 * Harness: ConcentrationFirstSchemaContract.test.ts style — loadAllSchemas from
 * cwd-relative schema/ (vitest runs from server/), SchemaRegistry + AjvValidator.
 * Ajv is the structural authority; every rejection arm is asserted with the
 * offending shape named.
 *
 * Acceptance arms proven here (task-list W2-2 `verified by:`):
 *  - all 8+1 constraint classes instantiate (DATA-DRIVEN: the class list and
 *    each class's example bound are read from constraint-vocabulary.yaml — no
 *    class names or per-class branches in TypeScript);
 *  - dimension mismatches and uncontrolled units rejected;
 *  - quantity volume EXACTLY 0 accepted (the concentration exclusiveMinimum trap
 *    is NOT repeated — spec §6.1);
 *  - quantity-per-quantity ratio: count/beads over count/wells accepted (same
 *    dimension, DIFFERENT units — ratio != dimensionless); count-over-volume
 *    representable at the datatype level, while the same-dimension requirement
 *    is declared as DATA (class dimensionRule) — see the vocabulary arm.
 *  - W2-1 admission leg: every W2-2-minted noun resolves through
 *    wave2-naming-crosswalk.yaml and passes the crosswalk's own declared
 *    admission rules (generic set comparison, same machinery W2-1's test uses).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const QUANTITY_ID = 'https://computable-lab.com/schema/computable-lab/datatypes/quantity.schema.yaml';
const QUANTITY_RATIO_ID = 'https://computable-lab.com/schema/computable-lab/datatypes/quantity-ratio.schema.yaml';
const CONSTRAINT_ID = 'https://computable-lab.com/schema/computable-lab/registry/constraint.schema.yaml';
const VOCAB_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/registry/constraint-vocabulary.schema.yaml';

const CROSSWALK_PATH = join(process.cwd(), '..', 'schema', 'registry', 'wave2-naming-crosswalk.yaml');
const VOCAB_DOC_PATH = join(process.cwd(), '..', 'schema', 'registry', 'constraint-vocabulary', 'constraint-vocabulary.yaml');
const QUANTITY_SCHEMA_PATH = join(process.cwd(), '..', 'schema', 'core', 'datatypes', 'quantity.schema.yaml');
const SCHEMA_ROOT = join(process.cwd(), '..', 'schema');
const RECORDS_VERB_DIR = join(process.cwd(), '..', 'records', 'seed', 'verb-definition');

type VocabularyClass = {
  id: string;
  curie: string;
  defaultBindingKind: string;
  allowedBindingKinds: string[];
  overridePolicy?: string;
  dimensionRule: string;
  boundShape: string;
  example_bound?: Record<string, unknown>;
};

type CrosswalkEntry = {
  term: string;
  status: string;
  curie_plan?: string;
  binds_to?: Record<string, unknown>;
};

async function readYaml(path: string): Promise<unknown> {
  return parseYaml(await readFile(path, 'utf8'));
}

let validator!: ReturnType<typeof createValidator>;
let registry!: ReturnType<typeof createSchemaRegistry>;

beforeAll(async () => {
  const schemaDir = join(process.cwd(), 'schema');
  const result = await loadAllSchemas({ basePath: schemaDir });
  expect(result.errors).toEqual([]);

  registry = createSchemaRegistry();
  registry.addSchemas(result.entries);
  validator = createValidator({ strict: false });
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
});

describe('W2-2 datatype registration (loader blast-radius arm, spec §6.6)', () => {
  it('registers quantity, quantity-ratio, constraint, and constraint-vocabulary schemas', () => {
    expect(registry.has(QUANTITY_ID)).toBe(true);
    expect(registry.has(QUANTITY_RATIO_ID)).toBe(true);
    expect(registry.has(CONSTRAINT_ID)).toBe(true);
    expect(registry.has(VOCAB_SCHEMA_ID)).toBe(true);
  });
});

describe('Quantity datatype (value+unit+dimension)', () => {
  it('accepts the aspiration well-state pair: 10000 cells exact AND 0 uL approximately_zero, both as first-class quantities', () => {
    const cells = { value: 10000, unit: 'cells', dimension: 'count', qualifier: 'exact' };
    const volume = { value: 0, unit: 'uL', dimension: 'volume', qualifier: 'approximately_zero' };
    expect(validator.validate(cells, QUANTITY_ID).valid).toBe(true);
    expect(validator.validate(volume, QUANTITY_ID).valid).toBe(true);
  });

  it('accepts volume EXACTLY 0 (minimum: 0, NOT exclusiveMinimum — the concentration trap is not repeated)', () => {
    expect(validator.validate({ value: 0, unit: 'uL', dimension: 'volume' }, QUANTITY_ID).valid).toBe(true);
  });

  it('rejects a negative value', () => {
    expect(validator.validate({ value: -1, unit: 'uL', dimension: 'volume' }, QUANTITY_ID).valid).toBe(false);
  });

  it('rejects a dimension/unit mismatch: dimension count with a volume unit', () => {
    expect(validator.validate({ value: 10, unit: 'uL', dimension: 'count' }, QUANTITY_ID).valid).toBe(false);
  });

  it('rejects a dimension/unit mismatch: dimension volume with a count unit', () => {
    expect(validator.validate({ value: 10, unit: 'cells', dimension: 'volume' }, QUANTITY_ID).valid).toBe(false);
  });

  it('rejects a dimension/unit mismatch: dimension molar with a count unit', () => {
    expect(validator.validate({ value: 10, unit: 'wells', dimension: 'molar' }, QUANTITY_ID).valid).toBe(false);
  });

  it('rejects an uncontrolled unit (dimension count, unit banana)', () => {
    expect(validator.validate({ value: 10, unit: 'banana', dimension: 'count' }, QUANTITY_ID).valid).toBe(false);
  });

  it('rejects a missing dimension (dimension is required — no unit-less quantities)', () => {
    expect(validator.validate({ value: 10, unit: 'cells' }, QUANTITY_ID).valid).toBe(false);
  });

  it('rejects an unknown qualifier value; qualifier absent is valid (exact is the default reading)', () => {
    expect(validator.validate({ value: 10, unit: 'cells', dimension: 'count', qualifier: 'approx' }, QUANTITY_ID).valid).toBe(false);
    expect(validator.validate({ value: 10, unit: 'cells', dimension: 'count' }, QUANTITY_ID).valid).toBe(true);
  });

  it('rejects an unknown dimension (first wave is count/volume/mass/molar; extension is a data edit)', () => {
    expect(validator.validate({ value: 10, unit: 'degC', dimension: 'temperature' }, QUANTITY_ID).valid).toBe(false);
  });

  it('rejects an unknown sibling field (additionalProperties: false)', () => {
    expect(validator.validate({ value: 10, unit: 'cells', dimension: 'count', bogus: 1 }, QUANTITY_ID).valid).toBe(false);
  });

  it('accepts mass and molar dimensions with controlled units (spellings reconciled with concentration.schema.yaml)', () => {
    expect(validator.validate({ value: 250, unit: 'ng', dimension: 'mass' }, QUANTITY_ID).valid).toBe(true);
    expect(validator.validate({ value: 10, unit: 'nM', dimension: 'molar' }, QUANTITY_ID).valid).toBe(true);
  });
});

describe('QuantityRatio datatype (quantity-per-quantity, load-bearing)', () => {
  it('accepts 5 beads / 1 well: both dimension count, DIFFERENT units (ratio != dimensionless)', () => {
    const ratio = {
      numerator: { value: 5, unit: 'beads', dimension: 'count', qualifier: 'exact' },
      denominator: { value: 1, unit: 'wells', dimension: 'count', qualifier: 'exact' },
    };
    expect(validator.validate(ratio, QUANTITY_RATIO_ID).valid).toBe(true);
  });

  it('accepts labels mirroring the reference-ratio affordances', () => {
    const ratio = {
      numerator: { value: 5, unit: 'beads', dimension: 'count' },
      denominator: { value: 1, unit: 'wells', dimension: 'count' },
      basis_label: 'well',
      ratioed_label: 'bashing bead',
    };
    expect(validator.validate(ratio, QUANTITY_RATIO_ID).valid).toBe(true);
  });

  it('represents a count-over-volume ratio at the datatype level (cross-dimension is schema-legal; the same-dimension requirement is a DATA rule on the ratio class — see vocabulary arm)', () => {
    const ratio = {
      numerator: { value: 10000, unit: 'cells', dimension: 'count' },
      denominator: { value: 500, unit: 'uL', dimension: 'volume' },
    };
    expect(validator.validate(ratio, QUANTITY_RATIO_ID).valid).toBe(true);
  });

  it('rejects a ratio whose numerator is a bare number (that is reference-ratio shape — the advisory datatype, not this one)', () => {
    expect(validator.validate({ numerator: 1, denominator: 2.5 }, QUANTITY_RATIO_ID).valid).toBe(false);
  });

  it('rejects a ratio missing the denominator', () => {
    expect(validator.validate({ numerator: { value: 5, unit: 'beads', dimension: 'count' } }, QUANTITY_RATIO_ID).valid).toBe(false);
  });
});

describe('Constraint datatype (the object W2-3 steps will embed)', () => {
  it('accepts a hard_bound capacity constraint with a Quantity bound and a declared override policy', () => {
    const c = {
      class: 'capacity',
      bound: { value: 96, unit: 'wells', dimension: 'count' },
      bindingKind: 'hard_bound',
      overridePolicy: 'never-override',
    };
    expect(validator.validate(c, CONSTRAINT_ID).valid).toBe(true);
  });

  it('accepts a vendor_default ratio constraint with a QuantityRatio bound', () => {
    const c = {
      class: 'ratio',
      bound: {
        numerator: { value: 5, unit: 'beads', dimension: 'count' },
        denominator: { value: 1, unit: 'wells', dimension: 'count' },
      },
      bindingKind: 'vendor_default',
      overridePolicy: 'lab-may-tighten',
    };
    expect(validator.validate(c, CONSTRAINT_ID).valid).toBe(true);
  });

  it('accepts a capabilityRequirement riding the EXISTING equipment-capability machinery: CL:bead_beater ontology ref (no new prefix)', () => {
    const c = {
      class: 'capacity',
      bound: { value: 5, unit: 'beads', dimension: 'count' },
      bindingKind: 'hard_bound',
      overridePolicy: 'never-override',
      capabilityRequirement: { kind: 'ontology', id: 'CL:bead_beater', namespace: 'CL', label: 'bead beater' },
    };
    expect(validator.validate(c, CONSTRAINT_ID).valid).toBe(true);
  });

  it('accepts a symbolic subject (applicability refs only, never inline payloads)', () => {
    const c = {
      class: 'threshold',
      bound: { value: 10000, unit: 'cells', dimension: 'count' },
      bindingKind: 'hard_bound',
      overridePolicy: 'never-override',
      subject: { ref: 'cf:constraint-threshold', role: 'culture_well' },
    };
    expect(validator.validate(c, CONSTRAINT_ID).valid).toBe(true);
  });

  it('rejects an unknown bindingKind (the vendor-vs-material seam is a closed enum)', () => {
    const c = {
      class: 'capacity',
      bound: { value: 96, unit: 'wells', dimension: 'count' },
      bindingKind: 'soft_suggestion',
      overridePolicy: 'lab-may-relax',
    };
    expect(validator.validate(c, CONSTRAINT_ID).valid).toBe(false);
  });

  it('rejects an unknown sibling field (unevaluatedProperties: false with the $refs)', () => {
    const c = {
      class: 'capacity',
      bound: { value: 96, unit: 'wells', dimension: 'count' },
      bindingKind: 'hard_bound',
      overridePolicy: 'never-override',
      bogus_field: true,
    };
    expect(validator.validate(c, CONSTRAINT_ID).valid).toBe(false);
  });

  it('rejects a capabilityRequirement with a bogus ref shape (ontology ref missing namespace)', () => {
    const c = {
      class: 'capacity',
      bound: { value: 5, unit: 'beads', dimension: 'count' },
      bindingKind: 'hard_bound',
      overridePolicy: 'never-override',
      capabilityRequirement: { kind: 'ontology', id: 'CL:bead_beater' },
    };
    expect(validator.validate(c, CONSTRAINT_ID).valid).toBe(false);
  });
});

describe('Constraint vocabulary document (classes/applicability/override policy as DATA)', () => {
  let vocab: { classes: VocabularyClass[]; overridePolicies: { id: string }[] };

  beforeAll(async () => {
    vocab = (await readYaml(VOCAB_DOC_PATH)) as { classes: VocabularyClass[]; overridePolicies: { id: string }[] };
  });

  it('the shipped vocabulary document validates against its structural schema', async () => {
    const doc = await readYaml(VOCAB_DOC_PATH);
    const res = validator.validate(doc, VOCAB_SCHEMA_ID);
    expect(res.errors.map((e) => `${e.path} ${e.message}`)).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it('ALL 8+1 constraint classes instantiate — data-driven from the vocabulary YAML (no class list in TypeScript)', () => {
    expect(vocab.classes.length).toBe(10); // 8 memo classes (minima/maxima split) + vendor_default
    for (const cls of vocab.classes) {
      const instance: Record<string, unknown> = {
        class: cls.id,
        bindingKind: cls.defaultBindingKind,
        ...(cls.overridePolicy !== undefined ? { overridePolicy: cls.overridePolicy } : {}),
        ...(cls.example_bound !== undefined ? { bound: cls.example_bound } : {}),
      };
      const res = validator.validate(instance, CONSTRAINT_ID);
      expect(res.errors.map((e) => `${e.path} ${e.message}`), `class ${cls.id}`).toEqual([]);
      expect(res.valid, `class ${cls.id} must instantiate`).toBe(true);
    }
  });

  it('the same-dimension ratio requirement is declared as data: the ratio class declares dimensionRule same-dimension while cross-dimension ratios remain schema-representable', () => {
    const ratio = vocab.classes.find((c) => c.id === 'ratio');
    expect(ratio?.dimensionRule).toBe('same-dimension');
    const perUnitDose = vocab.classes.find((c) => c.id === 'per_unit_dose');
    expect(perUnitDose?.dimensionRule).toBe('quantity-per-count');
  });

  it('every class overridePolicy names a declared policy (schema-level closure mirror of lint R1)', () => {
    const declared = new Set(vocab.overridePolicies.map((p) => p.id));
    for (const cls of vocab.classes) {
      if (cls.overridePolicy !== undefined) {
        expect(declared.has(cls.overridePolicy), `class ${cls.id} -> ${cls.overridePolicy}`).toBe(true);
      }
    }
  });
});

describe('W2-1 admission leg for W2-2-minted nouns (crosswalk resolves, no collision, cf: CURIE)', () => {
  function normalize(term: string): string {
    return term.trim().toLowerCase().replace(/-/g, '_');
  }

  async function walkSchemaYaml(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walkSchemaYaml(p)));
      else if (entry.isFile() && entry.name.endsWith('.schema.yaml')) out.push(p);
    }
    return out;
  }

  async function enumerateNamespaces(): Promise<Record<string, Set<string>>> {
    const kinds = new Set<string>();
    for (const path of await walkSchemaYaml(SCHEMA_ROOT)) {
      const doc = (await readYaml(path)) as Record<string, unknown> | null;
      const props = doc?.properties as Record<string, unknown> | undefined;
      const kind = props?.kind as Record<string, unknown> | undefined;
      if (kind && typeof kind.const === 'string') kinds.add(kind.const);
    }
    const ops = (await readYaml(join(SCHEMA_ROOT, 'registry', 'operations.yaml'))) as { operations: { id: string }[] };
    const siSchema = (await readYaml(join(SCHEMA_ROOT, 'workflow', 'scientist-intent.schema.yaml'))) as { $defs: { actionVerb: { enum: string[] } } };
    const vdCanonicals = new Set<string>();
    for (const name of await readdir(RECORDS_VERB_DIR)) {
      if (!name.endsWith('.yaml')) continue;
      const rec = (await readYaml(join(RECORDS_VERB_DIR, name))) as { canonical: string };
      vdCanonicals.add(rec.canonical);
    }
    const vam = (await readYaml(join(SCHEMA_ROOT, 'registry', 'verb-action-map.yaml'))) as { mappings: { verb: string }[] };
    return {
      'record-kind': kinds,
      'operation-id': new Set(ops.operations.map((o) => o.id)),
      'scientist-intent-verb': new Set(siSchema.$defs.actionVerb.enum),
      'verb-definition-canonical': vdCanonicals,
      'verb-action-map-verb': new Set(vam.mappings.map((m) => m.verb)),
    };
  }

  // Minted nouns are READ from the shipped data files — never hardcoded here.
  let mintedClasses: VocabularyClass[] = [];
  let mintedDims: string[] = [];

  function mintedNouns(): { term: string; curie: string }[] {
    const nouns: { term: string; curie: string }[] = [];
    for (const cls of mintedClasses) nouns.push({ term: `constraint-class-${cls.id}`, curie: cls.curie });
    for (const dim of mintedDims) nouns.push({ term: `quantity-dimension-${dim}`, curie: `cf:quantity-dimension-${dim}` });
    return nouns;
  }

  beforeAll(async () => {
    const doc = (await readYaml(VOCAB_DOC_PATH)) as { classes: VocabularyClass[] };
    mintedClasses = doc.classes;
    const q = (await readYaml(QUANTITY_SCHEMA_PATH)) as { properties: { dimension: { enum: string[] } } };
    mintedDims = q.properties.dimension.enum;
  });

  it('every minted noun is listed in the crosswalk and carries its cf: CURIE plan', async () => {
    const crosswalk = (await readYaml(CROSSWALK_PATH)) as { entries: CrosswalkEntry[] };
    for (const noun of mintedNouns()) {
      const entry = crosswalk.entries.find((e) => normalize(e.term) === normalize(noun.term));
      expect(entry, `${noun.term} must resolve through the crosswalk`).toBeDefined();
      expect(entry?.curie_plan, `${noun.term} curie_plan`).toBe(noun.curie);
    }
  });

  it('no minted noun collides with any admission namespace (generic set comparison against the crosswalk-declared namespaces)', async () => {
    const namespaces = await enumerateNamespaces();
    for (const noun of mintedNouns()) {
      const norm = normalize(noun.term);
      for (const [nsName, set] of Object.entries(namespaces)) {
        expect(set.has(norm), `${noun.term} collides with ${nsName}`).toBe(false);
      }
    }
  });

  it('the bare dimension word `count` WOULD collide (operation-id + verb-action-map) — recorded finding W2-2-F1: dimensions enter the crosswalk qualified, never bare', async () => {
    const namespaces = await enumerateNamespaces();
    const opIds = namespaces['operation-id'] ?? new Set<string>();
    const vamVerbs = namespaces['verb-action-map-verb'] ?? new Set<string>();
    const bare = normalize('count');
    expect(opIds.has(bare)).toBe(true);
    expect(vamVerbs.has(bare)).toBe(true);
    // The qualified form does not collide:
    expect(opIds.has(normalize('quantity-dimension-count'))).toBe(false);
  });
});
