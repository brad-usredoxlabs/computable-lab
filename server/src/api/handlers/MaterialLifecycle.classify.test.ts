// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifyMaterialRecord } from './MaterialLifecycleHandlers.js';
import type { RecordEnvelope } from '../../store/types.js';

const SPEC_SCHEMA = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';
const VENDOR_SCHEMA = 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml';

function vendorProduct(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return { recordId, schemaId: VENDOR_SCHEMA, payload };
}

function spec(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return { recordId, schemaId: SPEC_SCHEMA, payload };
}

describe('classifyMaterialRecord — material-spec subtitle', () => {
  it('carries formulation concentration so 1 mM and 2 mM specs are distinguishable', () => {
    const item = classifyMaterialRecord(
      spec('MSP-T-1', {
        kind: 'material-spec',
        id: 'MSP-T-1',
        name: 'Clofibrate in DMSO',
        formulation: { concentration: { value: 1, unit: 'mM', basis: 'molar' } },
      }),
    );
    expect(item).not.toBeNull();
    expect(item?.subtitle).toContain('1 mM');
    expect(item?.subtitle).toContain('Saved stock or formulation');
  });

  it('falls back to the pinned label when the spec declares no concentration', () => {
    const item = classifyMaterialRecord(
      spec('MSP-T-2', { kind: 'material-spec', id: 'MSP-T-2', name: 'Clofibrate stock' }),
    );
    expect(item).not.toBeNull();
    expect(item?.subtitle).toBe('Saved stock or formulation');
  });
});

describe('classifyMaterialRecord — vendor-product material_ref', () => {
  it('emits materialRefKind/materialRefId from a record-kind material_ref', () => {
    const item = classifyMaterialRecord(
      vendorProduct('VPR-001', {
        kind: 'vendor-product',
        id: 'VPR-001',
        name: 'Clofibrate',
        vendor: 'Sigma',
        catalog_number: 'C8418',
        material_ref: { kind: 'record', id: 'MAT-CONCEPT1', type: 'material' },
      }),
    );
    expect(item).not.toBeNull();
    expect(item?.materialRefKind).toBe('record');
    expect(item?.materialRefId).toBe('MAT-CONCEPT1');
  });

  it('emits materialRefKind/materialRefId from an ontology-kind material_ref', () => {
    const item = classifyMaterialRecord(
      vendorProduct('VPR-002', {
        kind: 'vendor-product',
        id: 'VPR-002',
        name: 'DMSO',
        vendor: 'Sigma',
        catalog_number: 'D2650',
        material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
      }),
    );
    expect(item).not.toBeNull();
    expect(item?.materialRefKind).toBe('ontology');
    expect(item?.materialRefId).toBe('NCIT:C185409');
  });

  it('omits materialRef keys when material_ref is absent', () => {
    const item = classifyMaterialRecord(
      vendorProduct('VPR-003', {
        kind: 'vendor-product',
        id: 'VPR-003',
        name: 'Phenol Red',
        vendor: 'Sigma',
        catalog_number: 'P0364',
      }),
    );
    expect(item).not.toBeNull();
    expect(Object.keys(item)).not.toContain('materialRefKind');
    expect(Object.keys(item)).not.toContain('materialRefId');
  });
});
