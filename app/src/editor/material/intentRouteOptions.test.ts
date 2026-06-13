import { describe, expect, it, vi } from 'vitest'
import { intentRouteOptions, type IntentRouteDeps } from './MaterialPicker'
import type { OntologyRef } from '../../shared/ref'

const ref: OntologyRef = { kind: 'ontology', id: 'CHEBI:5001', namespace: 'CHEBI', label: 'fenofibrate' }

function deps(): IntentRouteDeps & Record<string, ReturnType<typeof vi.fn>> {
  return {
    onCreateFormulationFromOntology: vi.fn(),
    setVendorProductSeed: vi.fn(),
    setPreparedMaterialRef: vi.fn(),
    setBiologicalMaterialRef: vi.fn(),
    setDerivedMaterialRef: vi.fn(),
    setModalRef: vi.fn(),
    setIntentRef: vi.fn(),
  } as never
}

describe('intentRouteOptions', () => {
  it('omits the formulation route when no handler is supplied', () => {
    const d = deps()
    delete (d as Partial<IntentRouteDeps>).onCreateFormulationFromOntology
    const kinds = intentRouteOptions(ref, d).map((o) => o.kind)
    expect(kinds).toEqual(['vendor-product', 'prepared-instance', 'biological', 'derived', 'concept'])
  })

  it('includes the formulation route when a handler is supplied', () => {
    const kinds = intentRouteOptions(ref, deps()).map((o) => o.kind)
    expect(kinds[0]).toBe('formulation')
    expect(kinds).toHaveLength(6)
  })

  it.each([
    ['formulation', 'onCreateFormulationFromOntology'],
    ['vendor-product', 'setVendorProductSeed'],
    ['prepared-instance', 'setPreparedMaterialRef'],
    ['biological', 'setBiologicalMaterialRef'],
    ['derived', 'setDerivedMaterialRef'],
    ['concept', 'setModalRef'],
  ])('route %s fires %s and clears the intent', (kind, setter) => {
    const d = deps()
    const option = intentRouteOptions(ref, d).find((o) => o.kind === kind)!
    option.onSelect!()
    expect(d[setter]).toHaveBeenCalledTimes(1)
    expect(d.setIntentRef).toHaveBeenCalledWith(null)
  })

  it('seeds the vendor and concept routes with the ontology ref', () => {
    const d = deps()
    const opts = intentRouteOptions(ref, d)
    opts.find((o) => o.kind === 'vendor-product')!.onSelect!()
    expect(d.setVendorProductSeed).toHaveBeenCalledWith({ ontologyRef: ref, result: null })
    opts.find((o) => o.kind === 'concept')!.onSelect!()
    expect(d.setModalRef).toHaveBeenCalledWith(ref)
  })
})
