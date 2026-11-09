/**
 * GC-5 — analysis-engine registry record schema contract tests.
 *
 * Loads the WHOLE schema tree (like analysisSchema.test.ts) so the FAIRCommon
 * $ref chain + the datatypes/ref pin resolve against the real pipeline. Three
 * aspects:
 *   1. the NEW analysis-engine record schema (the declared registry record —
 *      the dispatch/provenance DATA the runner reads; bait #3: no package/
 *      engine-name literals, they live HERE in data);
 *   2. analysis-revision GAINS an OPTIONAL engineRef + requiredCapabilities
 *      (bait #2: engineRef stays OPTIONAL — DNA/demo/AI revisions stay valid
 *      with zero backfill);
 *   3. analysis-run GAINS a typed engineProvenance block (machine-readable
 *      ACTUAL engine/interpreter/package versions written at completion).
 *
 * RED-first (EDITOR-1 precedent): this file is committed BEFORE the schema
 * edits land — the "accepts" legs fail (the kind is not yet a declared
 * registry record / the fields are not yet declared) and the "rejects" legs
 * prove the shape once present.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const IDS = {
  engine: 'https://computable-lab.com/schema/computable-lab/analysis-engine.schema.yaml',
  rev: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml',
  run: 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml',
};

// The closed capability vocabulary (GC-1 matrix control ids, OQ1): declared in
// the SCHEMA as data. This array is the test's independent copy of that data.
const CAPABILITY_VOCAB = [
  'baseline_control',
  'width_slope_sensitivity',
  'area_height_reject',
  'timed_integration_windows',
  'peak_detection',
  'deconvolution',
];

let validate: (payload: unknown, schemaId: string) => { valid: boolean; errors?: unknown[] };

beforeAll(async () => {
  const registry = createSchemaRegistry();
  const basePath = `${process.cwd()}/../schema`; // run from server/
  const result = await loadAllSchemas({ basePath, recursive: true });
  expect(result.errors).toEqual([]);
  registry.addSchemas(result.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
  validate = (payload, schemaId) => validator.validate(payload, schemaId);
});

/** A schema-valid analysis-engine record (the declared registry DATA). */
function validEngine(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'analysis-engine',
    id: 'ENG-SCIPI001',
    title: 'scipy-integration-core',
    engine_family: 'scipy-integration-core',
    engine_version: '0.1.0',
    implementation: { adapter: 'python-entry-script', entry: 'run(ctx)', module: 'computable_lab_analysis' },
    version_constraints: {
      python: '>=3.14,<3.15',
      packages: [
        { name: 'numpy', constraint: '==2.5.4' },
        { name: 'scipy', constraint: '==1.18.1' },
      ],
    },
    capabilities: {
      declared: [
        { capability: 'peak_detection', support: 'supported' },
        { capability: 'baseline_control', support: 'approximate' },
        { capability: 'deconvolution', support: 'unsupported' },
      ],
    },
    availability: { available: true, note: 'provisioned venv on the lane' },
    runtime_requirements: { interpreter: 'provisioned-venv' },
    ...over,
  };
}

describe('analysis-engine schema (GC-5 declared registry record)', () => {
  it('is a declared registry kind in the schema tree (knownKinds)', () => {
    // The engine schema must be LOADED (a declared kind) — RED until the
    // triplet lands; the coverage loader's knownKinds gate depends on this.
    const tree = validate(validEngine(), IDS.engine);
    expect(tree.valid).toBe(true);
  });

  it('accepts a minimal-but-complete valid engine record', () => {
    expect(validate(validEngine(), IDS.engine).valid).toBe(true);
  });

  it('accepts the lifecycleId/state registry-ops enums', () => {
    expect(validate(validEngine({ lifecycleId: 'registry-ops', state: 'draft' }), IDS.engine).valid).toBe(true);
    expect(validate(validEngine({ lifecycleId: 'registry-ops', state: 'active' }), IDS.engine).valid).toBe(true);
    expect(validate(validEngine({ lifecycleId: 'registry-ops', state: 'archived' }), IDS.engine).valid).toBe(true);
  });

  it('rejects a record missing a required field (implementation)', () => {
    const payload = validEngine();
    delete (payload as Record<string, unknown>).implementation;
    expect(validate(payload, IDS.engine).valid).toBe(false);
  });

  it('rejects an id that does not match the ^ENG- pattern', () => {
    expect(validate(validEngine({ id: 'NOTANENGINE' }), IDS.engine).valid).toBe(false);
  });

  it('rejects an unshipped adapter id (closed enum = schema refuses it declaratively)', () => {
    expect(
      validate(validEngine({ implementation: { adapter: 'not-shipped', entry: 'x' } }), IDS.engine).valid,
    ).toBe(false);
  });

  it('rejects a capability outside the closed vocabulary', () => {
    expect(
      validate(
        validEngine({ capabilities: { declared: [{ capability: 'bogus_capability', support: 'supported' }] } }),
        IDS.engine,
      ).valid,
    ).toBe(false);
  });

  it('rejects a support value outside the S/A/U/NV legend', () => {
    expect(
      validate(
        validEngine({ capabilities: { declared: [{ capability: 'peak_detection', support: 'maybe' }] } }),
        IDS.engine,
      ).valid,
    ).toBe(false);
  });

  it('rejects a lifecycle state outside registry-ops (three-copies-of-one-fact pin)', () => {
    expect(validate(validEngine({ lifecycleId: 'registry-ops', state: 'published' }), IDS.engine).valid).toBe(false);
  });

  it('rejects an unknown top-level property (unevaluatedProperties:false landmine stays armed)', () => {
    expect(validate(validEngine({ something_undeclared: true }), IDS.engine).valid).toBe(false);
  });
});

describe('analysis-revision schema gains an OPTIONAL engineRef (GC-5 §b, bait #2)', () => {
  it('accepts a revision that pins an engine record + requiredCapabilities', () => {
    expect(
      validate(
        {
          kind: 'analysis-revision',
          id: 'ANREV-000100',
          title: 'pinned engine',
          entryScript: 'def run(ctx):\n    return ctx',
          sdkVersion: '0.1.0',
          engineRef: { kind: 'record', type: 'analysis-engine', id: 'ENG-SCIPI001' },
          requiredCapabilities: ['peak_detection', 'baseline_control'],
        },
        IDS.rev,
      ).valid,
    ).toBe(true);
  });

  it('accepts a revision WITHOUT engineRef (bait #2: stays optional, no backfill)', () => {
    expect(
      validate(
        {
          kind: 'analysis-revision',
          id: 'ANREV-000101',
          title: 'legacy no engine',
          entryScript: 'def run(ctx):\n    return ctx',
          sdkVersion: '0.1.0',
        },
        IDS.rev,
      ).valid,
    ).toBe(true);
  });

  it('accepts an engineRef carrying a REV- snapshot pin (the ref datatype already carries it)', () => {
    expect(
      validate(
        {
          kind: 'analysis-revision',
          id: 'ANREV-000102',
          title: 'pinned engine @ snapshot',
          entryScript: 'def run(ctx):\n    return ctx',
          sdkVersion: '0.1.0',
          engineRef: {
            kind: 'record',
            type: 'analysis-engine',
            id: 'ENG-SCIPI001',
            revisionRef: { kind: 'record', type: 'record-revision', id: 'REV-0123ABCD' },
          },
        },
        IDS.rev,
      ).valid,
    ).toBe(true);
  });

  it('rejects an engineRef whose type is not analysis-engine', () => {
    expect(
      validate(
        {
          kind: 'analysis-revision',
          id: 'ANREV-000103',
          title: 'wrong kind pin',
          entryScript: 'def run(ctx):\n    return ctx',
          sdkVersion: '0.1.0',
          engineRef: { kind: 'record', type: 'gc-method', id: 'ENG-SCIPI001' },
        },
        IDS.rev,
      ).valid,
    ).toBe(false);
  });

  it('rejects an engineRef id outside the ^ENG- pattern', () => {
    expect(
      validate(
        {
          kind: 'analysis-revision',
          id: 'ANREV-000104',
          title: 'bad engine id',
          entryScript: 'def run(ctx):\n    return ctx',
          sdkVersion: '0.1.0',
          engineRef: { kind: 'record', type: 'analysis-engine', id: 'NOTENG' },
        },
        IDS.rev,
      ).valid,
    ).toBe(false);
  });

  it('rejects a requiredCapabilities entry outside the closed vocabulary', () => {
    expect(
      validate(
        {
          kind: 'analysis-revision',
          id: 'ANREV-000105',
          title: 'bad capability',
          entryScript: 'def run(ctx):\n    return ctx',
          sdkVersion: '0.1.0',
          engineRef: { kind: 'record', type: 'analysis-engine', id: 'ENG-SCIPI001' },
          requiredCapabilities: ['not_a_capability'],
        },
        IDS.rev,
      ).valid,
    ).toBe(false);
  });
});

describe('analysis-run schema gains a typed engineProvenance (GC-5 §c)', () => {
  const PROVENANCE = {
    engineRef: { kind: 'record', type: 'analysis-engine', id: 'ENG-SCIPI001' },
    engineRecordId: 'ENG-SCIPI001',
    engineVersion: '0.1.0',
    adapter: 'python-entry-script',
    interpreterPath: '/home/brad/.computable-lab-lane1/analysis-venv/bin/python3',
    interpreterVersion: '3.14.7',
    packages: [
      { name: 'numpy', required: '==2.5.4', actual: '2.5.4' },
      { name: 'scipy', required: '==1.18.1', actual: '1.18.1' },
    ],
    probedAt: '2026-10-26T12:00:00Z',
    capabilitiesReported: [
      { capability: 'peak_detection', support: 'supported' },
      { capability: 'baseline_control', support: 'approximate' },
    ],
  };

  it('accepts a succeeded run carrying engineProvenance', () => {
    expect(
      validate(
        {
          kind: 'analysis-run',
          id: 'ANR-000200',
          title: 'engine run',
          revisionRef: { kind: 'record', id: 'ANREV-000100', type: 'analysis-revision' },
          status: 'succeeded',
          engineProvenance: PROVENANCE,
        },
        IDS.run,
      ).valid,
    ).toBe(true);
  });

  it('accepts a run WITHOUT engineProvenance (legacy path: no provenance is added)', () => {
    expect(
      validate(
        {
          kind: 'analysis-run',
          id: 'ANR-000201',
          title: 'legacy run',
          revisionRef: { kind: 'record', id: 'ANREV-000101', type: 'analysis-revision' },
          status: 'succeeded',
        },
        IDS.run,
      ).valid,
    ).toBe(true);
  });

  it('rejects an engineProvenance whose support is outside the legend', () => {
    const prov = structuredClone(PROVENANCE);
    (prov.capabilitiesReported as Array<Record<string, unknown>>)[0].support = 'maybe';
    expect(
      validate(
        {
          kind: 'analysis-run',
          id: 'ANR-000202',
          title: 'bad provenance',
          revisionRef: { kind: 'record', id: 'ANREV-000100', type: 'analysis-revision' },
          status: 'succeeded',
          engineProvenance: prov,
        },
        IDS.run,
      ).valid,
    ).toBe(false);
  });
});
