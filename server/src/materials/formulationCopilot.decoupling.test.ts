/**
 * ROLE-AXES-1 LEG 2 — formulationCopilot decoupling (RED-first).
 *
 * Defect: roleDefaultMeasureMode (formulationCopilot.ts :71) returned
 * qs_to_final iff the roleType LABEL was solvent/diluent/matrix, and the
 * sourceState default (:87) returned liquid iff the label was solvent/diluent.
 * A mislabeled record therefore got the bring-to-final mode and a liquid
 * source state from the LABEL. Decoupled, both defaults ride the config
 * convention (legacyRoleMapping, loud-off fallback; participation arms win when
 * declared — see formulationCopilot.repoint.test.ts for the LEG 2b legs).
 *
 * Legs:
 *  1. Mislabeled solvent label: a solid powder mislabeled role 'solvent' gets
 *     NO qs_to_final and NO liquid source state (RED at base: the label drove
 *     both).
 *  2. Correct-label legacy records: the defaults are byte-stable (solvent ->
 *     qs_to_final + liquid; diluent -> qs_to_final + liquid; matrix ->
 *     qs_to_final + other; solute -> target_concentration + other).
 *  3. Recipe-name label site (:173): byte-stable for correct labels.
 *  4. Convention absent -> LOUD-off console.warn naming the path, arithmetic
 *     unchanged, never throws. Convention malformed -> THROWS naming the path.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inferIngredientMeasureMode,
  summarizeFormulationDraft,
  suggestMissingFormulationFields,
  type CopilotIngredientDraft,
} from './formulationCopilot.js';
import { computeFormulation } from './formulationMath.js';
import { loadParticipationConvention } from './participationConvention.js';

const ref = (kind: 'record' | 'ontology', id: string, label: string) => ({ kind, id, label });

describe('ROLE-AXES-1 copilot defaults: config-driven, not label-driven', () => {
  it('a solid powder mislabeled role solvent gets NO qs_to_final (RED at base: the label chose it)', () => {
    const ingredient: CopilotIngredientDraft = {
      ref: ref('record', 'ms-powder', 'Buffer powder'),
      roleType: 'solvent',
      sourceState: 'solid',
      targetContribution: { value: 100, unit: 'mM', basis: 'molar' },
    };
    const conv = loadParticipationConvention()!;
    expect(inferIngredientMeasureMode(ingredient, conv)).toBe('target_concentration');
  });

  it('the sourceState default no longer fires liquid off the solvent label for a declared solid', () => {
    const result = summarizeFormulationDraft({
      ingredients: [{
        ref: ref('record', 'ms-powder', 'Buffer powder'),
        roleType: 'solvent',
        sourceState: 'solid',
        targetContribution: { value: 100, unit: 'mM', basis: 'molar' },
        molecularWeight: { value: 100, unit: 'g/mol' },
      }],
      totalProduced: { value: 10, unit: 'mL' },
    });
    const row = result.calculationSummary[0]!;
    expect(row.measureMode).toBe('target_concentration');
    expect(row.sourceState).toBe('solid');
    expect(JSON.parse(JSON.stringify(row.requiredAmount))).toEqual({ value: 100, unit: 'mg' });
  });

  it('correct-label legacy defaults stay byte-stable (solvent/diluent/matrix/solute)', () => {
    const conv = loadParticipationConvention()!;
    const cases: Array<[string, CopilotIngredientDraft, string, string]> = [
      ['solvent', { ref: ref('ontology', 'CHEBI:15377', 'Water'), roleType: 'solvent' }, 'qs_to_final', 'liquid'],
      ['diluent', { ref: ref('record', 'vp-dms', 'DMSO'), roleType: 'diluent' }, 'qs_to_final', 'liquid'],
      ['matrix', { ref: ref('record', 'ms-gel', 'Matrix gel'), roleType: 'matrix' }, 'qs_to_final', 'other'],
      ['solute', { ref: ref('record', 'ms-salt', 'Salt'), roleType: 'solute' }, 'target_concentration', 'other'],
    ];
    for (const [name, ingredient, mode, state] of cases) {
      const result = summarizeFormulationDraft({
        ingredients: [ingredient],
        totalProduced: { value: 10, unit: 'mL' },
      });
      const row = result.calculationSummary[0]!;
      expect(row.measureMode, name).toBe(mode);
      expect(row.sourceState, name).toBe(state);
      expect(inferIngredientMeasureMode(ingredient, conv), name).toBe(mode);
    }
  });

  it('recipe-name label site stays byte-stable for correct labels', () => {
    const result = suggestMissingFormulationFields({
      ingredients: [
        { ref: ref('ontology', 'CHEBI:28284', 'NaCl'), roleType: 'solute', sourceState: 'solid', targetContribution: { value: 150, unit: 'mM', basis: 'molar' }, molecularWeight: { value: 58.44, unit: 'g/mol' } },
        { ref: ref('ontology', 'CHEBI:15377', 'Water'), roleType: 'solvent' },
      ],
      totalProduced: { value: 10, unit: 'mL' },
    });
    expect(result.draftPatch.recipeName).toBe('NaCl in Water');
  });

  it('a diluent-labeled carrier names the recipe exactly as before (byte-stable)', () => {
    const result = suggestMissingFormulationFields({
      ingredients: [
        { ref: ref('record', 'ms-cp', 'Compound'), roleType: 'solute', sourceState: 'solid', targetContribution: { value: 1, unit: 'mM', basis: 'molar' }, molecularWeight: { value: 200, unit: 'g/mol' } },
        { ref: ref('record', 'vp-dms', 'DMSO'), roleType: 'diluent' },
      ],
      totalProduced: { value: 10, unit: 'mL' },
    });
    expect(result.draftPatch.recipeName).toBe('Compound in DMSO');
  });
});

describe('ROLE-AXES-1 convention loader semantics (loud-off / throw, naming the path)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'roleaxes-convention-'));

  it('absent convention file -> LOUD console.warn naming the path, arithmetic unchanged, never throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const missingPath = join(tmp, 'absent-convention.yaml');
      const result = computeFormulation({
        ingredients: [
          { ref: ref('ontology', 'CHEBI:28284', 'NaCl'), roleType: 'solute', measureMode: 'target_concentration', sourceState: 'solid', targetContribution: { value: 150, unit: 'mM', basis: 'molar' }, molecularWeight: { value: 58.44, unit: 'g/mol' } },
          { ref: ref('ontology', 'CHEBI:15377', 'Water'), roleType: 'solvent', measureMode: 'qs_to_final', sourceState: 'liquid' },
        ],
        totalOutputQuantity: { value: 10, unit: 'mL' },
        conventionPath: missingPath,
      });
      // Arithmetic unchanged: the declared facts (modes, states, amounts) drive it.
      expect(JSON.parse(JSON.stringify(result.outputComposition))).toEqual([
        { componentRef: { kind: 'ontology', id: 'CHEBI:28284', label: 'NaCl' }, role: 'solute', concentration: { value: 150, unit: 'mM', basis: 'molar' } },
        { componentRef: { kind: 'ontology', id: 'CHEBI:15377', label: 'Water' }, role: 'solvent', concentration: { value: 100, unit: '% v/v', basis: 'volume_fraction' } },
      ]);
      const warns = warnSpy.mock.calls.map((call) => String(call[0]));
      expect(warns.some((w) => w.includes('composition-participation-convention-off') && w.includes(missingPath))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('malformed convention file -> THROWS naming the path', () => {
    const badPath = join(tmp, 'malformed-convention.yaml');
    writeFileSync(badPath, 'legacyRoleMapping: [this, is, not, an, object]\n');
    expect(() => loadParticipationConvention(badPath)).toThrowError(/composition-participation convention.*malformed-convention\.yaml/);
  });

  it('malformed convention file -> computeFormulation throws naming the path', () => {
    const badPath = join(tmp, 'malformed-convention2.yaml');
    writeFileSync(badPath, 'version: 1\nlegacyRoleMapping:\n  solute:\n    emittedRole: solute\n    defaultMeasureMode: not_a_mode\n');
    expect(() => computeFormulation({
      ingredients: [{ ref: ref('record', 'r-1', 'Reagent'), roleType: 'solute', measureMode: 'fixed_amount', requiredAmount: { value: 1, unit: 'mL' } }],
      conventionPath: badPath,
    })).toThrowError(/composition-participation convention.*malformed-convention2\.yaml/);
  });
});
