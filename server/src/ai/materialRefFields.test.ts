import { describe, it, expect } from 'vitest';
import {
  canonicalMaterialField,
  isWellReadyRef,
  materialLayerOf,
  materialLayerOfRef,
  MATERIAL_LAYER_FIELD,
} from './materialRefFields.js';

describe('materialRefFields — one table decides which field carries which layer', () => {
  it('maps every layer to exactly one canonical details field', () => {
    expect(MATERIAL_LAYER_FIELD).toEqual({
      'material-spec': 'material_spec_ref',
      'material-instance': 'material_instance_ref',
      aliquot: 'aliquot_ref',
      'vendor-product': 'vendor_product_ref',
      material: 'material_ref',
    });
  });

  it('reads the layer from a ref type, tolerating snake_case and plural spellings', () => {
    expect(materialLayerOf('material-spec')).toBe('material-spec');
    expect(materialLayerOf('material_spec')).toBe('material-spec');
    expect(materialLayerOf('aliquots')).toBe('aliquot');
    expect(materialLayerOf('material_instance')).toBe('material-instance');
    expect(materialLayerOf('vendor_product')).toBe('vendor-product');
    expect(materialLayerOf('nonsense')).toBe('material');
  });

  it('treats a memory-recalled ontology CURIE as a CONCEPT, never a formulation', () => {
    // The model stuffing a local record id into an ontology ref is the observed
    // mangling; the layer must still be the bare concept.
    expect(materialLayerOfRef({ kind: 'ontology', id: 'CHEBI:12345' })).toBe('material');
    expect(materialLayerOfRef({ kind: 'draft', id: 'mint:clofibrate' })).toBe('material');
  });

  it('places a repaired material-spec in the FORMULATION field', () => {
    // This is the E1 bug in one assertion: the repair wrote material_ref while
    // the gate only trusted material_spec_ref.
    const repaired = { kind: 'record', id: 'MSP-API-mu50x5z7', type: 'material-spec', label: '1 mM Clofibrate in DMSO' };
    expect(canonicalMaterialField(repaired)).toBe('material_spec_ref');
    expect(isWellReadyRef(repaired)).toBe(true);
  });

  it('is well-ready only with an id, and never for a bare concept', () => {
    expect(isWellReadyRef({ kind: 'record', type: 'material-spec' })).toBe(false); // no id
    expect(isWellReadyRef({ kind: 'record', id: 'MAT-x', type: 'material' })).toBe(false);
    expect(isWellReadyRef({ kind: 'record', id: 'ALQ-x', type: 'aliquot' })).toBe(true);
    expect(isWellReadyRef(null)).toBe(false);
  });
});
