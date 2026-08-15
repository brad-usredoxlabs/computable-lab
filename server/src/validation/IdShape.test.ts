/**
 * Id-shape patterns (Task 1 of the 2026-08-15 study/experiment schema audit):
 * Ajv must reject a cross-kind id (e.g. an EXP- id in a studyId field, or an
 * EXP- id inside projectIds[]) at write time.
 *
 * The harness loads the REAL schemas from disk via the repo's own
 * SchemaLoader + SchemaRegistry + AjvValidator pipeline (same order as
 * server.ts), so this test exercises exactly what the store enforces.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from './AjvValidator.js';

const SCHEMA_ID = (name: string) =>
  `https://computable-lab.com/schema/computable-lab/${name}`;

describe('run + experiment schema id-shape patterns', () => {
  let validator: ReturnType<typeof createValidator>;

  beforeAll(async () => {
    const schemaDir = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema');
    const loaded = await loadAllSchemas({ basePath: schemaDir, recursive: true });
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema as never, id);
      }
    }
  });

  function validateRun(payload: Record<string, unknown>) {
    return validator.validate(payload, SCHEMA_ID('run.schema.yaml'));
  }

  function validateExperiment(payload: Record<string, unknown>) {
    return validator.validate(payload, SCHEMA_ID('experiment.schema.yaml'));
  }

  it('rejects an EXP- id in studyId', () => {
    const ok = validateRun({
      kind: 'run',
      recordId: 'RUN-x',
      status: 'planned',
      studyId: 'EXP-first-experiment-ot9r',
    });
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.path === '/studyId' && e.keyword === 'pattern')).toBe(true);
  });

  it('accepts a well-formed STU-/EXP- pair', () => {
    const ok = validateRun({
      kind: 'run',
      recordId: 'RUN-x',
      status: 'planned',
      studyId: 'STU-1',
      experimentId: 'EXP-1',
    });
    expect(ok.valid).toBe(true);
  });

  it('rejects an EXP- id inside projectIds[]', () => {
    const ok = validateRun({
      kind: 'run',
      recordId: 'RUN-x',
      status: 'planned',
      projectIds: ['EXP-1'],
    });
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'pattern' && e.path?.startsWith('/projectIds'))).toBe(true);
  });

  it('accepts well-formed projectIds[]', () => {
    const ok = validateRun({
      kind: 'run',
      recordId: 'RUN-x',
      status: 'planned',
      projectIds: ['STU-1', 'STU-2'],
    });
    expect(ok.valid).toBe(true);
  });

  it('rejects a non-STU- studyId on an experiment', () => {
    const ok = validateExperiment({
      kind: 'experiment',
      recordId: 'EXP-1',
      title: 'E',
      shortSlug: 'e',
      studyId: 'RUN-1',
    });
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.path === '/studyId' && e.keyword === 'pattern')).toBe(true);
  });

  it('accepts a well-formed experiment studyId', () => {
    const ok = validateExperiment({
      kind: 'experiment',
      recordId: 'EXP-1',
      title: 'E',
      shortSlug: 'e',
      studyId: 'STU-1',
    });
    expect(ok.valid).toBe(true);
  });
});
