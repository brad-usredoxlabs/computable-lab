/**
 * Analysis record schema contract tests.
 *
 * Loads the WHOLE schema tree (like production) so the FAIRCommon $ref chain
 * resolves — mirroring the ajv-unevaluatedproperties pitfall.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const IDS = {
  rev: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml',
  run: 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml',
  out: 'https://computable-lab.com/schema/computable-lab/analysis-output-artifact.schema.yaml',
  view: 'https://computable-lab.com/schema/computable-lab/view-spec.schema.yaml',
};

function validateFor(id: string) {
  return (payload: unknown) => validate(payload, id);
}

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

describe('analysis-revision schema', () => {
  it('accepts a minimal valid revision', () => {
    expect(validateFor(IDS.rev)({
      kind: 'analysis-revision',
      id: 'ANREV-000001',
      title: 'GC peak area',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
    }).valid).toBe(true);
  });

  it('accepts a revision with a model input', () => {
    expect(validateFor(IDS.rev)({
      kind: 'analysis-revision',
      id: 'ANREV-000010',
      title: 'predict with model',
      entryScript: 'def run(ctx):\n    m = ctx.input("model").file_bytes()',
      sdkVersion: '0.1.0',
      inputs: [{ name: 'model', dataKind: 'model', required: true }],
    }).valid).toBe(true);
  });

  it('rejects a revision missing entryScript', () => {
    expect(validateFor(IDS.rev)({
      kind: 'analysis-revision',
      id: 'ANREV-000002',
      title: 'bad',
      sdkVersion: '0.1.0',
    }).valid).toBe(false);
  });
});

describe('analysis-run schema', () => {
  it('accepts a minimal valid run', () => {
    expect(validateFor(IDS.run)({
      kind: 'analysis-run',
      id: 'ANR-000001',
      title: 'run 1',
      revisionRef: { kind: 'record', id: 'ANREV-000001', type: 'analysis-revision' },
      status: 'queued',
    }).valid).toBe(true);
  });

  it('rejects a run with bad status', () => {
    expect(validateFor(IDS.run)({
      kind: 'analysis-run',
      id: 'ANR-000002',
      title: 'run 2',
      revisionRef: { kind: 'record', id: 'ANREV-000001', type: 'analysis-revision' },
      status: 'nonsense',
    }).valid).toBe(false);
  });

  it('accepts a full run with inputs + output artifacts', () => {
    expect(validateFor(IDS.run)({
      kind: 'analysis-run',
      id: 'ANR-000003',
      title: 'full run',
      revisionRef: { kind: 'record', id: 'ANREV-000001', type: 'analysis-revision' },
      status: 'succeeded',
      inputs: {
        trace: { kind: 'record', id: 'DREF-000001', type: 'data-reference' },
      },
      parameters: { window: [0.1, 0.5] },
      outputArtifactRefs: [{ kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' }],
      completedAt: '2026-09-05T12:00:00Z',
    }).valid).toBe(true);
  });

  // GC-13 (OQ-2): the optional measurement-context hop. OPTIONAL — a run
  // without it stays valid (zero backfill, GC-5 engineRef precedent) — and
  // TYPE-PINNED when present (kind record, type measurement-context).
  it('accepts a run with an optional measurementContextRef (type-pinned)', () => {
    expect(validateFor(IDS.run)({
      kind: 'analysis-run',
      id: 'ANR-000014',
      title: 'run with acquisition context',
      revisionRef: { kind: 'record', id: 'ANREV-000008', type: 'analysis-revision' },
      status: 'succeeded',
      measurementContextRef: { kind: 'record', id: 'MCTX-TEST-GC13', type: 'measurement-context' },
    }).valid).toBe(true);
  });

  it('accepts a measurementContextRef with a REV- snapshot pin', () => {
    expect(validateFor(IDS.run)({
      kind: 'analysis-run',
      id: 'ANR-000015',
      title: 'run with pinned acquisition context',
      revisionRef: { kind: 'record', id: 'ANREV-000008', type: 'analysis-revision' },
      status: 'succeeded',
      measurementContextRef: {
        kind: 'record',
        id: 'MCTX-TEST-GC13',
        type: 'measurement-context',
        revisionRef: { kind: 'record', type: 'record-revision', id: 'REV-ABC123' },
      },
    }).valid).toBe(true);
  });

  it('rejects a measurementContextRef pinned to a different record type', () => {
    expect(validateFor(IDS.run)({
      kind: 'analysis-run',
      id: 'ANR-000016',
      title: 'run with wrong-type context ref',
      revisionRef: { kind: 'record', id: 'ANREV-000008', type: 'analysis-revision' },
      status: 'succeeded',
      measurementContextRef: { kind: 'record', id: 'ACQP-TEST-GC13', type: 'acquisition-package' },
    }).valid).toBe(false);
  });

  it('rejects a measurementContextRef of ontology kind', () => {
    expect(validateFor(IDS.run)({
      kind: 'analysis-run',
      id: 'ANR-000017',
      title: 'run with ontology context ref',
      revisionRef: { kind: 'record', id: 'ANREV-000008', type: 'analysis-revision' },
      status: 'succeeded',
      measurementContextRef: { kind: 'ontology', id: 'CL:0000182', namespace: 'CL', label: 'cell' },
    }).valid).toBe(false);
  });
});

describe('analysis-output-artifact schema', () => {
  it('accepts a minimal inline artifact', () => {
    expect(validateFor(IDS.out)({
      kind: 'analysis-output-artifact',
      id: 'AOUT-000001',
      title: 'peak results',
      runRef: { kind: 'record', id: 'ANR-000001', type: 'analysis-run' },
      name: 'peak_results',
      dataKind: 'table',
      inlineValue: [{ start: 0.1, end: 0.5, area: 3.2 }],
    }).valid).toBe(true);
  });

  it('accepts a model artifact with a data-reference', () => {
    expect(validateFor(IDS.out)({
      kind: 'analysis-output-artifact',
      id: 'AOUT-000010',
      title: 'trained model',
      runRef: { kind: 'record', id: 'ANR-000001', type: 'analysis-run' },
      name: 'model',
      dataKind: 'model',
      format: 'pkl',
      dataReferenceRef: { kind: 'record', id: 'DREF-000001', type: 'data-reference' },
      sourceRelations: [{ kind: 'record', id: 'DREF-000000', type: 'data-reference' }],
    }).valid).toBe(true);
  });

  it('rejects an artifact missing name', () => {
    expect(validateFor(IDS.out)({
      kind: 'analysis-output-artifact',
      id: 'AOUT-000002',
      title: 'bad',
      runRef: { kind: 'record', id: 'ANR-000001', type: 'analysis-run' },
      dataKind: 'table',
    }).valid).toBe(false);
  });
});

describe('view-spec schema', () => {
  it('accepts a minimal signal view', () => {
    expect(validateFor(IDS.view)({
      kind: 'view-spec',
      id: 'VSPEC-000001',
      title: 'trace view',
      artifactRef: { kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' },
      renderer: 'signal',
      bindings: { x: 'time', y: 'intensity' },
    }).valid).toBe(true);
  });

  it('rejects an unsupported renderer', () => {
    expect(validateFor(IDS.view)({
      kind: 'view-spec',
      id: 'VSPEC-000002',
      title: 'bad renderer',
      artifactRef: { kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' },
      renderer: 'quantum',
    }).valid).toBe(false);
  });

  // GC-10 [E]: the two NEW enum ids validate (task: "view-spec enum extended").
  // The quantum rejection above stays — the closed-set error is preserved for
  // unshipped renderers.
  it('accepts a chromatogram view (GC-10 new enum id)', () => {
    expect(validateFor(IDS.view)({
      kind: 'view-spec',
      id: 'VSPEC-000101',
      title: 'interactive chromatogram',
      artifactRef: { kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' },
      renderer: 'chromatogram',
      bindings: { markersFrom: 'peak_table' },
    }).valid).toBe(true);
  });

  it('accepts a trace-compare view (GC-10 new enum id, AOUT refs in bindings)', () => {
    expect(validateFor(IDS.view)({
      kind: 'view-spec',
      id: 'VSPEC-000102',
      title: 'trace comparison',
      artifactRef: { kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' },
      renderer: 'trace-compare',
      bindings: {
        traces: [
          { artifactRef: { kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' } },
          {
            artifactRef: { kind: 'record', id: 'AOUT-000002', type: 'analysis-output-artifact' },
            conversion: { factor: 1000, toUnit: 'pA', declaredBy: 'brad' },
          },
        ],
        axisUnits: { x: 'min', y: 'pA' },
      },
    }).valid).toBe(true);
  });

  // GC-11 [D1]: the calibration review composite's NEW enum id validates
  // (task :8412 "Calibration-curve view (view-spec renderer)"; the schema
  // comment block documents its data-only bindings). The quantum rejection
  // above stays — the closed-set error is preserved for unshipped renderers.
  it('accepts a calibration-curve view (GC-11 new enum id, data-only bindings)', () => {
    expect(validateFor(IDS.view)({
      kind: 'view-spec',
      id: 'VSPEC-000201',
      title: 'calibration review',
      artifactRef: { kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' },
      renderer: 'calibration-curve',
      bindings: { modelArtifact: 'calibration_model', outlierTopN: 1 },
    }).valid).toBe(true);
  });

  // FAME-6 [E]: the generic artifact-report renderer's NEW enum id validates
  // (task: "one new generic renderer id (GC-10 enum precedent)"; the
  // architect OQ-1 ruling ratifies the exact id string, .hermes/plans/
  // 2026-11-01_fame-6-oq1-oq2-oq3-decision.md). The OQ-3 binding slots
  // (columns / captionFrom / warningsFrom / warningTextField) ride the free
  // bindings object — documented as canonical-shape comments in
  // view-spec.schema.yaml. The quantum rejection above stays — the
  // closed-set error is preserved for unshipped renderers.
  it('accepts an artifact-table view (FAME-6 new enum id, OQ-3 binding slots)', () => {
    expect(validateFor(IDS.view)({
      kind: 'view-spec',
      id: 'VSPEC-000301',
      title: 'artifact report',
      artifactRef: { kind: 'record', id: 'AOUT-000001', type: 'analysis-output-artifact' },
      renderer: 'artifact-table',
      bindings: {
        columns: ['label', 'state'],
        captionFrom: 'basis',
        warningsFrom: 'warnings',
        warningTextField: 'reason',
      },
    }).valid).toBe(true);
  });
});

describe('analysis-revision FAME-7 (OQ-3) input-item keys', () => {
  it('accepts a revision whose input slot declares acceptsKinds + acceptedArtifactNames', () => {
    expect(validateFor(IDS.rev)({
      kind: 'analysis-revision',
      id: 'ANREV-000020',
      title: 'declared inputs',
      entryScript: 'def run(ctx):\n    t = ctx.input("left_table")\n    return t',
      sdkVersion: '0.1.0',
      inputs: [
        { name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] },
        { name: 'right_table', dataKind: 'table', required: true, acceptedArtifactNames: ['right_summary'] },
      ],
    }).valid).toBe(true);
  });

  it('still accepts a LEGACY revision (no FAME-7 keys on the slot) — zero backfill (OQ-3 named skip)', () => {
    expect(validateFor(IDS.rev)({
      kind: 'analysis-revision',
      id: 'ANREV-000021',
      title: 'legacy',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      inputs: [{ name: 'trace', dataKind: 'signal', required: true }],
    }).valid).toBe(true);
  });

  it('still accepts a revision with NO inputs declaration (legacy, key absent)', () => {
    expect(validateFor(IDS.rev)({
      kind: 'analysis-revision',
      id: 'ANREV-000022',
      title: 'no inputs',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
    }).valid).toBe(true);
  });

  it('still accepts an EMPTY inputs array (absent vs empty-array is semantic; both valid)', () => {
    expect(validateFor(IDS.rev)({
      kind: 'analysis-revision',
      id: 'ANREV-000023',
      title: 'empty inputs',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      inputs: [],
    }).valid).toBe(true);
  });

  it('rejects an input slot with an undeclared extra key (additionalProperties: false)', () => {
    expect(validateFor(IDS.rev)({
      kind: 'analysis-revision',
      id: 'ANREV-000024',
      title: 'bad slot key',
      entryScript: 'def run(ctx):\n    return ctx',
      sdkVersion: '0.1.0',
      inputs: [{ name: 'x', dataKind: 'table', bogusKey: true }],
    }).valid).toBe(false);
  });
});