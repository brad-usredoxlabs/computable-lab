/**
 * ROLE-AXES-1 LEG 2 — arithmetic decoupling from role labels (RED-first).
 *
 * Defect (MIXROLE-1 ruling, Brad's arithmetic-independence consideration):
 * fraction/concentration arithmetic branches on whether a component is LABELED
 * solvent/additive (formulationMath.ts role ladder + `?? 'solute'` + the
 * `role === 'solvent'` volume-fraction fallback; formulationCopilot.ts
 * roleDefaultMeasureMode + the sourceState default). A mislabeled record
 * therefore gets a volume fraction / qs_to_final / liquid sourceState from the
 * LABEL instead of from its declared amounts, units, and measure mode.
 *
 * Fix vector (ratified spec): every role->arithmetic decision rides
 * config/drafting/composition-participation-convention.yaml — loaded PER call
 * (the composition-fraction-convention pattern exactly), LOUD-off when absent
 * (one console.warn naming the path, never a throw, arithmetic unchanged),
 * THROWING when malformed. TS interprets the mapping generically: zero
 * role/vocab string literals in the arithmetic files (the grep gate).
 *
 * Legs in this file:
 *  1. BYTE-PIN goldens over correct-label legacy records: outputs pinned
 *     byte-for-byte to the pre-change base capture (6d64154b). These PASS at
 *     base and must stay green across the config move (bait 5: "cleaner
 *     output" on a legacy record is a REGRESSION).
 *  2. MISLABELED fixture: a volume-carrying bring-to-final entry mislabeled
 *     role 'additive' and a fixed-volume aliquot mislabeled role 'solvent'.
 *     At base the labels drive the math: the carrier is DENIED its computed
 *     volume fraction and the aliquot gets a FABRICATED 10% v/v from its
 *     label. Decoupled, the fraction rides the declared measure mode +
 *     resolved amount (amounts/units), not the label. RED at base.
 *
 * participation (the LEG 1 axis) is deliberately NOT referenced here: a revert
 * of LEG 1 must keep LEG 2 green. The participation-keyed override legs live in
 * the LEG 2b re-point test file.
 */
import { describe, expect, it } from 'vitest';
import { computeFormulation } from './formulationMath.js';

const ref = (kind: 'record' | 'ontology', id: string, label: string) => ({ kind, id, label });

// ---------------------------------------------------------------------------
// Leg 1: byte-pin goldens — correct-label legacy records. Expected outputs
// captured from the pre-change base and pinned verbatim (deep-equal, not
// shape-equal).
// ---------------------------------------------------------------------------

describe('ROLE-AXES-1 byte-pin goldens (label-preserving legacy records)', () => {
  it('legacy record 1: NaCl (solid solute) + Water (qs solvent) — byte-identical output', () => {
    const result = computeFormulation({
      ingredients: [
        { ref: ref('ontology', 'CHEBI:28284', 'NaCl'), roleType: 'solute', measureMode: 'target_concentration', sourceState: 'solid', targetContribution: { value: 150, unit: 'mM', basis: 'molar' }, molecularWeight: { value: 58.44, unit: 'g/mol' } },
        { ref: ref('ontology', 'CHEBI:15377', 'Water'), roleType: 'solvent', measureMode: 'qs_to_final', sourceState: 'liquid' },
      ],
      totalOutputQuantity: { value: 10, unit: 'mL' },
    });
    expect(JSON.parse(JSON.stringify(result.outputComposition))).toEqual([
      { componentRef: { kind: 'ontology', id: 'CHEBI:28284', label: 'NaCl' }, role: 'solute', concentration: { value: 150, unit: 'mM', basis: 'molar' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:15377', label: 'Water' }, role: 'solvent', concentration: { value: 100, unit: '% v/v', basis: 'volume_fraction' } },
    ]);
    expect(result.warnings).toEqual([]);
    const nacl = result.ingredients.find((i) => i.ref?.id === 'CHEBI:28284');
    expect(JSON.parse(JSON.stringify(nacl?.resolvedAmount))).toEqual({ value: 87.66, unit: 'mg' });
  });

  it('legacy record 2: diluent/additive/activity/cells + snapshot matrix — byte-identical output', () => {
    const result = computeFormulation({
      ingredients: [
        { ref: ref('record', 'vp-1', 'Ethanol'), roleType: 'diluent', measureMode: 'target_concentration', sourceState: 'liquid', targetContribution: { value: 10, unit: '% v/v', basis: 'volume_fraction' } },
        { ref: ref('ontology', 'CHEBI:51509', 'BSA'), roleType: 'additive', measureMode: 'target_concentration', sourceState: 'solid', targetContribution: { value: 1, unit: 'mg/mL', basis: 'mass_per_volume' } },
        { ref: ref('ontology', 'CHEBI:27514', 'DNase'), roleType: 'activity_source', measureMode: 'target_concentration', sourceState: 'liquid', stockConcentration: { value: 1, unit: 'U/uL', basis: 'activity_per_volume' }, targetContribution: { value: 100, unit: 'U/mL', basis: 'activity_per_volume' } },
        { ref: ref('record', 'inst-hepg2', 'HepG2 cells'), roleType: 'cells', measureMode: 'target_concentration', sourceState: 'cells', targetContribution: { value: 200000, unit: 'cells/mL', basis: 'count_per_volume' } },
        { compositionSnapshot: [
          { componentRef: ref('ontology', 'CHEBI:28284', 'NaCl'), role: 'buffer_component', concentration: { value: 10, unit: 'mM', basis: 'molar' } },
          { componentRef: ref('ontology', 'CHEBI:15377', 'Water'), role: 'solvent' },
        ], roleType: 'matrix', measureMode: 'qs_to_final', sourceState: 'liquid' },
      ],
      totalOutputQuantity: { value: 20, unit: 'mL' },
    });
    expect(JSON.parse(JSON.stringify(result.outputComposition))).toEqual([
      { componentRef: { kind: 'record', id: 'vp-1', label: 'Ethanol' }, role: 'solvent', concentration: { value: 1, unit: '% v/v', basis: 'volume_fraction' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:51509', label: 'BSA' }, role: 'additive', concentration: { value: 1, unit: 'mg/mL', basis: 'mass_per_volume' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:27514', label: 'DNase' }, role: 'activity_source', concentration: { value: 10, unit: 'U/mL', basis: 'activity_per_volume' } },
      { componentRef: { kind: 'record', id: 'inst-hepg2', label: 'HepG2 cells' }, role: 'cells', concentration: { value: 200000, unit: 'cells/mL', basis: 'count_per_volume' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:28284', label: 'NaCl' }, role: 'buffer_component', concentration: { value: 8, unit: 'mM', basis: 'molar' } },
      { componentRef: { kind: 'ontology', id: 'CHEBI:15377', label: 'Water' }, role: 'solvent', concentration: { value: 80, unit: '% v/v', basis: 'volume_fraction' } },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('merge-key identity stays byte-stable: same component+role+basis merges, different roles stay separate', () => {
    const result = computeFormulation({
      ingredients: [
        { compositionSnapshot: [
          { componentRef: ref('ontology', 'CHEBI:28284', 'NaCl'), role: 'solute', concentration: { value: 10, unit: 'mM', basis: 'molar' } },
          { componentRef: ref('ontology', 'CHEBI:28284', 'NaCl'), role: 'solute', concentration: { value: 5, unit: 'mM', basis: 'molar' } },
          { componentRef: ref('ontology', 'CHEBI:28284', 'NaCl'), role: 'additive', concentration: { value: 1, unit: 'mM', basis: 'molar' } },
        ], roleType: 'additive', measureMode: 'fixed_amount' },
      ],
    });
    expect(result.outputComposition.length).toBe(2);
    const merged = result.outputComposition.find((e) => e.role === 'solute');
    expect(merged?.concentration?.value).toBe(15);
  });

  it('emission ladder stays byte-stable for every legacy roleType (config roleEmissionMap)', () => {
    const roleTypes = ['solute', 'solvent', 'diluent', 'buffer_component', 'matrix', 'activity_source', 'additive', 'cells', 'other', 'unrecognized'] as const;
    const expectedRoles = ['solute', 'solvent', 'solvent', 'buffer_component', 'buffer_component', 'activity_source', 'additive', 'cells', 'other', 'other'] as const;
    for (let i = 0; i < roleTypes.length; i += 1) {
      const roleType = roleTypes[i]!;
      const result = computeFormulation({
        ingredients: [{ ref: ref('record', `r-${roleType}`, `Reagent ${roleType}`), roleType, measureMode: 'fixed_amount', requiredAmount: { value: 1, unit: 'mL' } }],
      });
      expect(result.outputComposition[0]?.role).toBe(expectedRoles[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Leg 2: mislabeled fixture — the volume fraction must ride the declared
// measure mode + resolved amount (amounts/units), NOT the role label.
// RED at base: the label denies the carrier its fraction and fabricates one
// for the fixed-volume aliquot.
// ---------------------------------------------------------------------------

describe('ROLE-AXES-1 mislabeled fixture: amounts/units drive the fraction, not labels', () => {
  const mislabeled = () => computeFormulation({
    ingredients: [
      {
        // A volume-carrying bring-to-final carrier mislabeled role 'additive'.
        ref: ref('record', 'vp-medium', 'Base medium'),
        roleType: 'additive',
        measureMode: 'qs_to_final',
        sourceState: 'liquid',
      },
      {
        // A lyophilized solute powder mislabeled role 'solvent'.
        ref: ref('record', 'ms-powder', 'Buffer powder'),
        roleType: 'solvent',
        measureMode: 'target_concentration',
        sourceState: 'solid',
        targetContribution: { value: 100, unit: 'mM', basis: 'molar' },
        molecularWeight: { value: 100, unit: 'g/mol' },
      },
      {
        // A fixed-volume aliquot mislabeled role 'solvent': it DECLARES the
        // explicit fixed-amount mode — the declared fact that must beat the label.
        ref: ref('record', 'ms-aliquot', 'Salt stock'),
        roleType: 'solvent',
        measureMode: 'fixed_amount',
        requiredAmount: { value: 5, unit: 'mL' },
        compositionSnapshot: [
          { componentRef: ref('record', 'ms-aliquot', 'Salt stock'), role: 'solvent' },
        ],
      },
    ],
    totalOutputQuantity: { value: 50, unit: 'mL' },
  });

  it('the mislabeled carrier resolves its volume from the final total minus declared volumes', () => {
    const result = mislabeled();
    const carrier = result.ingredients.find((i) => i.ref?.id === 'vp-medium');
    expect(JSON.parse(JSON.stringify(carrier?.resolvedAmount))).toEqual({ value: 45, unit: 'mL' });
    expect(result.warnings).toEqual([]);
  });

  it('the mislabeled carrier entry carries its COMPUTED volume fraction (RED at base: the label denies it)', () => {
    const result = mislabeled();
    const carrierEntry = result.outputComposition.find((e) => e.componentRef.id === 'vp-medium');
    expect(carrierEntry?.concentration).toEqual({ value: 90, unit: '% v/v', basis: 'volume_fraction' });
  });

  it('the mislabeled fixed-volume aliquot gets NO volume fraction from its label (RED at base: the label fabricates 10% v/v)', () => {
    const result = mislabeled();
    const aliquotEntry = result.outputComposition.find((e) => e.componentRef.id === 'ms-aliquot');
    expect(aliquotEntry).toBeDefined();
    expect(aliquotEntry?.concentration).toBeUndefined();
  });

  it('the mislabeled powder computes its mass from target_concentration x volume x MW', () => {
    const result = mislabeled();
    const powder = result.ingredients.find((i) => i.ref?.id === 'ms-powder');
    expect(JSON.parse(JSON.stringify(powder?.resolvedAmount))).toEqual({ value: 500, unit: 'mg' });
  });

  it('the mislabeled powder entry carries its declared molar contribution — no label-driven volume synthesis', () => {
    const result = mislabeled();
    const powderEntry = result.outputComposition.find((e) => e.componentRef.id === 'ms-powder');
    expect(powderEntry?.concentration).toEqual({ value: 100, unit: 'mM', basis: 'molar' });
  });

  it('the emitted composition role stays the honest closest role label (decoupling never rewrites role)', () => {
    const result = mislabeled();
    const powderEntry = result.outputComposition.find((e) => e.componentRef.id === 'ms-powder');
    const carrierEntry = result.outputComposition.find((e) => e.componentRef.id === 'vp-medium');
    expect(powderEntry?.role).toBe('solvent');
    expect(carrierEntry?.role).toBe('additive');
  });
});
