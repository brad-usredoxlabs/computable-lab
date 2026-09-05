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
});