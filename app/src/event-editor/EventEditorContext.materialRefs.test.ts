import { describe, expect, it } from 'vitest'
import { addMaterialRefDetails } from './EventEditorContext'
import type { Ref } from '../types/ref'

describe('addMaterialRefDetails', () => {
  it('keeps saved formulations on material_spec_ref', () => {
    const ref: Ref = {
      kind: 'record',
      id: 'MSP-ROS-BLOCKER',
      type: 'material-spec',
      label: '1 mM rotenone in DMSO',
    }

    expect(addMaterialRefDetails(ref)).toEqual({ material_spec_ref: ref })
  })

  it('keeps prepared cell cultures on material_instance_ref', () => {
    const ref: Ref = {
      kind: 'record',
      id: 'MINST-HEPG2-P12',
      type: 'material-instance',
      label: 'HepG2 P12',
    }

    expect(addMaterialRefDetails(ref)).toEqual({ material_instance_ref: ref })
  })

  it('keeps vendor products and aliquots on their own add-material fields', () => {
    const vendor: Ref = {
      kind: 'record',
      id: 'VP-CELLROX-DEEP-RED',
      type: 'vendor-product',
      label: 'CellROX Deep Red',
    }
    const aliquot: Ref = {
      kind: 'record',
      id: 'ALQ-123',
      type: 'aliquot',
      label: 'Working aliquot',
    }

    expect(addMaterialRefDetails(vendor)).toEqual({ vendor_product_ref: vendor })
    expect(addMaterialRefDetails(aliquot)).toEqual({ aliquot_ref: aliquot })
  })

  it('falls back to material_ref for concepts and ontology terms', () => {
    const material: Ref = {
      kind: 'record',
      id: 'MAT-HEPG2',
      type: 'material',
      label: 'HepG2',
    }
    const ontology: Ref = {
      kind: 'ontology',
      id: 'CHEBI:123',
      namespace: 'CHEBI',
      label: 'example term',
    }

    expect(addMaterialRefDetails(material)).toEqual({ material_ref: material })
    expect(addMaterialRefDetails(ontology)).toEqual({ material_ref: ontology })
  })
})
