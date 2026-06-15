import { describe, expect, it } from 'vitest'
import {
  cellsInstancePayload,
  compositionFormulationPayload,
  materialConceptPayload,
  sampleInstancePayload,
  singleActiveFormulationPayload,
} from './materialSavePayload'
import type { CompositionEntryValue } from '../../../types/material'
import type { OLSResultRef } from '../../../shared/api/olsClient'

const chebi: OLSResultRef = { kind: 'ontology', id: 'CHEBI:5001', namespace: 'CHEBI', label: 'fenofibrate', uri: 'http://x/CHEBI_5001' }

describe('materialConceptPayload', () => {
  it('builds the material concept record, omitting empty class/tags', () => {
    expect(materialConceptPayload({ materialId: 'MAT-1', name: 'Feno', domain: 'chemical' })).toEqual({
      kind: 'material', id: 'MAT-1', name: 'Feno', domain: 'chemical',
    })
  })
  it('attaches class refs and tags when present', () => {
    const p = materialConceptPayload({ materialId: 'MAT-1', name: 'Feno', domain: 'chemical', classRefs: [chebi], tags: ['x'] })
    expect(p.class).toEqual([chebi])
    expect(p.tags).toEqual(['x'])
  })
})

describe('singleActiveFormulationPayload', () => {
  it('always emits a non-empty solute role (regression: inputRoles must not be [])', () => {
    const req = singleActiveFormulationPayload({
      materialId: 'MAT-1', conceptName: 'Feno', outputName: '1 mM Feno in DMSO', classRefs: [chebi],
      concentration: { value: 1, unit: 'mM' },
      solventRef: { kind: 'record', id: 'MAT-dmso', label: 'DMSO' },
    })
    expect(req.recipe.inputRoles.length).toBe(2)
    const [solute, solvent] = req.recipe.inputRoles
    expect(solute).toMatchObject({ roleId: 'active', roleType: 'solute', materialRefId: 'MAT-1', targetContribution: { value: 1, unit: 'mM' } })
    expect(solvent).toMatchObject({ roleId: 'solvent', roleType: 'solvent', materialRefId: 'MAT-dmso' })
    expect(req.outputSpec).toMatchObject({ materialRefId: 'MAT-1', formulationKind: 'single_active' })
    expect(req.outputSpec.solventRef).toEqual({ kind: 'record', id: 'MAT-dmso', label: 'DMSO' })
  })

  it('emits only the solute role when no solvent is given', () => {
    const req = singleActiveFormulationPayload({ materialId: 'MAT-1', conceptName: 'Feno', outputName: 'Feno', classRefs: [] })
    expect(req.recipe.inputRoles.map((r) => r.roleId)).toEqual(['active'])
    expect(req.outputSpec.concentration).toBeUndefined()
    expect(req.material?.classRefs).toBeUndefined()
  })
})

describe('compositionFormulationPayload', () => {
  const comp: CompositionEntryValue[] = [
    { role: 'solvent', componentRef: { kind: 'record', id: 'MAT-dmem', label: 'DMEM' } },
    { role: 'additive', componentRef: { kind: 'record', id: 'MAT-fbs', label: 'FBS' }, concentration: { value: 10, unit: '% v/v' } },
  ] as unknown as CompositionEntryValue[]

  it('maps each composition row to a role and picks complex_composition for >1 component', () => {
    const req = compositionFormulationPayload({ materialId: 'MAT-mix', conceptName: 'Growth media', outputName: 'Growth media', domain: 'media', classRefs: [], composition: comp })
    expect(req.recipe.inputRoles).toHaveLength(2)
    expect(req.recipe.inputRoles[0]).toMatchObject({ roleId: 'solvent-1', roleType: 'solvent', materialRefId: 'MAT-dmem' })
    expect(req.recipe.inputRoles[1]).toMatchObject({ roleId: 'additive-2', materialRefId: 'MAT-fbs', targetContribution: { value: 10, unit: '% v/v' } })
    expect(req.outputSpec.formulationKind).toBe('complex_composition')
    expect(req.outputSpec.composition).toBe(comp)
  })

  it('picks defined_composition for a single component', () => {
    const req = compositionFormulationPayload({ materialId: 'MAT-mix', conceptName: 'x', outputName: 'x', domain: 'reagent', classRefs: [], composition: [comp[0]!] })
    expect(req.outputSpec.formulationKind).toBe('defined_composition')
  })
})

describe('instance payloads', () => {
  it('cells instance carries materialRef, status, cells tag, biologicalState when present', () => {
    const req = cellsInstancePayload({ materialId: 'MAT-cho', name: 'CHO cells', preparedOn: '2026-06-14', biologicalState: { passage_number: 3 } })
    expect(req).toMatchObject({
      name: 'CHO cells', status: 'available', tags: ['cells'], preparedOn: '2026-06-14',
      materialRef: { kind: 'record', id: 'MAT-cho', type: 'material', label: 'CHO cells' },
      biologicalState: { passage_number: 3 },
    })
  })
  it('cells instance omits biologicalState when empty', () => {
    const req = cellsInstancePayload({ materialId: 'MAT-cho', name: 'CHO', preparedOn: '2026-06-14', biologicalState: {} })
    expect('biologicalState' in req).toBe(false)
  })
  it('sample instance carries derivedState, sample+type tags, and omits preparedOn when no date', () => {
    const req = sampleInstancePayload({ materialId: 'MAT-s', name: 'cDNA', derivationType: 'extraction', derivedState: { derivation_type: 'extraction' } })
    expect(req).toMatchObject({ name: 'cDNA', status: 'available', tags: ['sample', 'extraction'], derivedState: { derivation_type: 'extraction' } })
    expect('preparedOn' in req).toBe(false)
  })
})
