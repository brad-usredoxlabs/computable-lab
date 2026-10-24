/**
 * ROLE-AXES-1 LEG 2 — app-side mirror arithmetic decoupling (cwd=app).
 *
 * app/src/editor/lib/formulationMath.ts performs the mirrored role-labeled
 * arithmetic (the role ladder, the solid-target role fallback, the
 * `role === 'solvent'` volume-fraction fallback). The task's "arithmetic must
 * ride amounts" binds it, so the same byte-pin + mislabel pair runs here.
 */
import { describe, expect, it } from 'vitest'
import { computeFormulationComposition } from './formulationMath'

const ref = (kind: 'record' | 'ontology', id: string, label: string) => ({ kind, id, label })

describe('ROLE-AXES-1 app byte-pin goldens (label-preserving legacy records)', () => {
  it('legacy record 1: NaCl (solid solute) + Water (qs solvent) — byte-identical output', () => {
    const result = computeFormulationComposition({
      ingredients: [
        { ref: ref('ontology', 'CHEBI:28284', 'NaCl'), roleType: 'solute', measureMode: 'target_concentration', sourceState: 'solid', targetContribution: { value: 150, unit: 'mM', basis: 'molar' }, molecularWeight: { value: 58.44, unit: 'g/mol' } },
        { ref: ref('ontology', 'CHEBI:15377', 'Water'), roleType: 'solvent', measureMode: 'qs_to_final', sourceState: 'liquid' },
      ],
      totalOutputQuantity: { value: 10, unit: 'mL' },
    })
    expect(JSON.parse(JSON.stringify(result.outputComposition))).toEqual([
      { componentRef: { kind: 'ontology', id: 'CHEBI:28284', label: 'NaCl' }, role: 'solute', concentration: { value: 150, unit: 'mM', basis: 'molar' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:15377', label: 'Water' }, role: 'solvent', concentration: { value: 100, unit: '% v/v', basis: 'volume_fraction' } },
    ])
    expect(result.warnings).toEqual([])
  })

  it('legacy record 2: diluent/additive/activity/cells + snapshot matrix — byte-identical output', () => {
    const result = computeFormulationComposition({
      ingredients: [
        { ref: ref('record', 'vp-1', 'Ethanol'), roleType: 'diluent', measureMode: 'target_concentration', sourceState: 'liquid', targetContribution: { value: 10, unit: '% v/v', basis: 'volume_fraction' } },
        { ref: ref('ontology', 'CHEBI:51509', 'BSA'), roleType: 'additive', measureMode: 'target_concentration', sourceState: 'solid', targetContribution: { value: 1, unit: 'mg/mL', basis: 'mass_per_volume' } },
        // ROLE-AXES-1 resume fix (RA1-RES1-A1): the activity_source row this
        // test's own title names ("diluent/additive/activity/cells") was
        // dropped from the app fixture while the server twin carries it
        // (server/src/materials/formulationMath.decoupling.test.ts:69). Its
        // resolved 2 mL (100 U/mL target / 1 U/uL stock x 20 mL) is what makes
        // the matrix qs_to_final resolve 16 mL — the pinned 8 mM / 80 % v/v
        // are mathematically consistent ONLY with the full row set. Proven
        // against base 6d64154b: base path on this restored fixture yields
        // EXACTLY the pinned values (see report). The pin was never re-benched.
        { ref: ref('ontology', 'CHEBI:27514', 'DNase'), roleType: 'activity_source', measureMode: 'target_concentration', sourceState: 'liquid', stockConcentration: { value: 1, unit: 'U/uL', basis: 'activity_per_volume' }, targetContribution: { value: 100, unit: 'U/mL', basis: 'activity_per_volume' } },
        { ref: ref('record', 'inst-hepg2', 'HepG2 cells'), roleType: 'cells', measureMode: 'target_concentration', sourceState: 'cells', targetContribution: { value: 200000, unit: 'cells/mL', basis: 'count_per_volume' } },
        { ref: ref('record', 'ms-mix', 'Matrix'), roleType: 'matrix', measureMode: 'qs_to_final', sourceState: 'liquid', compositionSnapshot: [
          { componentRef: ref('ontology', 'CHEBI:28284', 'NaCl'), role: 'buffer_component', concentration: { value: 10, unit: 'mM', basis: 'molar' } },
          { componentRef: ref('ontology', 'CHEBI:15377', 'Water'), role: 'solvent' },
        ] },
      ],
      totalOutputQuantity: { value: 20, unit: 'mL' },
    })
    expect(JSON.parse(JSON.stringify(result.outputComposition))).toEqual([
      { componentRef: { kind: 'record', id: 'vp-1', label: 'Ethanol' }, role: 'solvent', concentration: { value: 1, unit: '% v/v', basis: 'volume_fraction' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:51509', label: 'BSA' }, role: 'additive', concentration: { value: 1, unit: 'mg/mL', basis: 'mass_per_volume' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:27514', label: 'DNase' }, role: 'activity_source', concentration: { value: 10, unit: 'U/mL', basis: 'activity_per_volume' } },
      { componentRef: { kind: 'record', id: 'inst-hepg2', label: 'HepG2 cells' }, role: 'cells', concentration: { value: 200000, unit: 'cells/mL', basis: 'count_per_volume' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:28284', label: 'NaCl' }, role: 'buffer_component', concentration: { value: 8, unit: 'mM', basis: 'molar' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:15377', label: 'Water' }, role: 'solvent', concentration: { value: 80, unit: '% v/v', basis: 'volume_fraction' } },
    ])
    expect(result.warnings).toEqual([])
  })
})

describe('ROLE-AXES-1 app mislabeled fixture: amounts/units drive the fraction, not labels', () => {
  const mislabeled = () => computeFormulationComposition({
    ingredients: [
      { ref: ref('record', 'vp-medium', 'Base medium'), roleType: 'additive', measureMode: 'qs_to_final', sourceState: 'liquid' },
      { ref: ref('record', 'ms-powder', 'Buffer powder'), roleType: 'solvent', measureMode: 'target_concentration', sourceState: 'solid', targetContribution: { value: 100, unit: 'mM', basis: 'molar' }, molecularWeight: { value: 100, unit: 'g/mol' } },
      { ref: ref('record', 'ms-aliquot', 'Salt stock'), roleType: 'solvent', measureMode: 'fixed_amount', requiredAmount: { value: 5, unit: 'mL' }, compositionSnapshot: [
        { componentRef: ref('record', 'ms-aliquot', 'Salt stock'), role: 'solvent' },
      ] },
    ],
    totalOutputQuantity: { value: 50, unit: 'mL' },
  })

  it('the mislabeled carrier carries its COMPUTED volume fraction (RED at base: the label denies it)', () => {
    const carrierEntry = mislabeled().outputComposition.find((e) => e.componentRef.id === 'vp-medium')
    expect(carrierEntry?.concentration).toEqual({ value: 90, unit: '% v/v', basis: 'volume_fraction' })
  })

  it('the mislabeled fixed-volume aliquot gets NO volume fraction from its label (RED at base: the label fabricates 10% v/v)', () => {
    const aliquotEntry = mislabeled().outputComposition.find((e) => e.componentRef.id === 'ms-aliquot')
    expect(aliquotEntry).toBeDefined()
    expect(aliquotEntry?.concentration).toBeUndefined()
  })

  it('the mislabeled powder carries its declared molar contribution', () => {
    const powderEntry = mislabeled().outputComposition.find((e) => e.componentRef.id === 'ms-powder')
    expect(powderEntry?.concentration).toEqual({ value: 100, unit: 'mM', basis: 'molar' })
  })
})
