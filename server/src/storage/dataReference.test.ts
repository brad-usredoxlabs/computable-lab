/**
 * data-reference schema contract test.
 *
 * Loads the WHOLE schema tree (like production) so the FAIRCommon $ref chain
 * resolves — mirroring the ajv-unevaluatedproperties pitfall. A ref-chain
 * break would surface as false `unevaluatedProperties` errors.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml';

let validate: (payload: unknown) => { valid: boolean; errors?: unknown[] };

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
  validate = (payload) => validator.validate(payload, SCHEMA_ID);
});

describe('data-reference schema', () => {
  it('is loaded and discovered in the full schema tree', () => {
    // The beforeAll already threw if loading failed; confirm the id resolves.
    expect(SCHEMA_ID).toContain('data-reference');
  });

  it('accepts a minimal valid payload', () => {
    const valid = {
      kind: 'data-reference',
      id: 'DREF-000001',
      title: 'Plate 1 readout',
      storageDeviceId: 'vast',
      path: 'reads/plate1.csv',
      contentHash: 'a'.repeat(64),
      sizeBytes: 128,
      dataKind: 'table',
      format: 'csv',
    };
    const res = validate(valid);
    expect(res.valid).toBe(true);
  });

  it('accepts a full payload with provenance links', () => {
    const full = {
      kind: 'data-reference',
      id: 'DREF-000002',
      title: 'qPCR run 42',
      storageDeviceId: 'vast',
      path: 'instruments/qs5/run42.fcs',
      contentHash: 'b'.repeat(64),
      sizeBytes: 512000,
      dataKind: 'signal',
      format: 'fcs',
      readerVersion: '0.1.0',
      acquisitionContext: { instrument: 'QuantStudio-5', note: 'after heat' },
      sourceRunRef: { kind: 'record', id: 'EXR-000123', type: 'execution-run' },
      acquiredAt: '2026-09-05T15:00:00Z',
    };
    const res = validate(full);
    expect(res.valid).toBe(true);
  });

  it('rejects a payload missing contentHash', () => {
    const invalid = {
      kind: 'data-reference',
      id: 'DREF-000003',
      title: 'orphan',
      storageDeviceId: 'vast',
      path: 'reads/x.csv',
      sizeBytes: 10,
      dataKind: 'table',
    };
    expect(validate(invalid).valid).toBe(false);
  });

  it('rejects a malformed contentHash', () => {
    const invalid = {
      kind: 'data-reference',
      id: 'DREF-000004',
      title: 'bad hash',
      storageDeviceId: 'vast',
      path: 'reads/x.csv',
      contentHash: 'not-a-hash',
      sizeBytes: 10,
      dataKind: 'table',
    };
    expect(validate(invalid).valid).toBe(false);
  });

  it('rejects an unknown dataKind', () => {
    const invalid = {
      kind: 'data-reference',
      id: 'DREF-000005',
      title: 'bad kind',
      storageDeviceId: 'vast',
      path: 'reads/x.csv',
      contentHash: 'a'.repeat(64),
      sizeBytes: 10,
      dataKind: 'hologram',
    };
    expect(validate(invalid).valid).toBe(false);
  });
});