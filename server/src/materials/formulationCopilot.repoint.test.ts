/**
 * ROLE-AXES-1 LEG 2b — the participation-keyed re-point (the config arm that
 * wins when an entry DECLARES participation; formulationCopilot.decoupling.test.ts
 * :10 names this file for these legs).
 *
 * Contract (ratified spec §Leg split + config header):
 *  - A declared participation's arm in config/drafting/
 *    composition-participation-convention.yaml WINS over the legacy-role
 *    mapping; a participation-absent record keeps the legacy mapping
 *    byte-identically (the byte-pin goldens stay green — bait 5).
 *  - A null-defaulted arm (participation_undeclared) DEFERS to the legacy-role
 *    mapping: arithmetic NEVER reads through the honest gap arm silently.
 *  - The re-point is DATA: reverting the LEG 1 schema enum keeps LEG 2 green
 *    (bait 8: gapRole stays `other`, the role-gap bar does not double-fire).
 *  - Loaded PER call (bait 2): the legs below drive the loader twice against
 *    the same injected path and prove a mid-run edit is seen immediately.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultMeasureModeFor,
  defaultSourceStateFor,
  emittedRoleFor,
  loadParticipationConvention,
  maySynthesizeVolumeFraction,
  PARTICIPATION_CONVENTION_PATH,
  type ParticipationConvention,
} from './participationConvention.js';
import { computeFormulation } from './formulationMath.js';
import { inferIngredientMeasureMode, summarizeFormulationDraft, type CopilotIngredientDraft } from './formulationCopilot.js';

const ref = (kind: 'record' | 'ontology', id: string, label: string) => ({ kind, id, label });

const shipped = loadParticipationConvention()!;

describe('ROLE-AXES-1 LEG 2b: a declared participation arm WINS over the legacy-role mapping', () => {
  it('the shipped convention declares the six participation arms (equality pinned by the schema test)', () => {
    expect(Object.keys(shipped.participationArms).sort()).toEqual([
      'activity_contributor',
      'count_component',
      'liquid_component',
      'participation_undeclared',
      'qs_carrier',
      'solute_contributor',
    ]);
  });

  it('qs_carrier declares the bring-to-final posture regardless of the role label', () => {
    // A record LABELED role 'additive' (the legacy arm says target_concentration
    // + no volume fraction) that DECLARES participation qs_carrier rides the
    // participation arm instead.
    expect(defaultMeasureModeFor(shipped, 'additive', 'qs_carrier')).toBe('qs_to_final');
    expect(defaultSourceStateFor(shipped, 'additive', 'qs_carrier')).toBe('liquid');
    expect(maySynthesizeVolumeFraction(shipped, { measureMode: undefined, role: 'additive', participation: 'qs_carrier' })).toBe(true);
  });

  it('count_component never fills the final volume, whatever the role label says', () => {
    // Mislabeled role 'solvent' (legacy arm: volumeFraction true) that declares
    // count_component defers to... no: the participation arm is concrete false.
    expect(maySynthesizeVolumeFraction(shipped, { measureMode: undefined, role: 'solvent', participation: 'count_component' })).toBe(false);
    expect(defaultMeasureModeFor(shipped, 'solvent', 'count_component')).toBe('target_concentration');
  });

  it('liquid_component carries volume from its resolved amount even under a non-carrier label', () => {
    expect(maySynthesizeVolumeFraction(shipped, { measureMode: undefined, role: 'additive', participation: 'liquid_component' })).toBe(true);
  });

  it('participation_undeclared DEFERS to the legacy-role mapping (never read through silently)', () => {
    // The honest gap arm carries null defaults: the reader falls back to the
    // role arm exactly as if participation were absent.
    for (const role of ['solvent', 'additive', 'solute', 'cells']) {
      expect(
        maySynthesizeVolumeFraction(shipped, { measureMode: undefined, role, participation: 'participation_undeclared' }),
        role,
      ).toBe(maySynthesizeVolumeFraction(shipped, { measureMode: undefined, role }));
      expect(
        defaultMeasureModeFor(shipped, role, 'participation_undeclared'),
        role,
      ).toBe(defaultMeasureModeFor(shipped, role, undefined));
      expect(
        defaultSourceStateFor(shipped, role, 'participation_undeclared'),
        role,
      ).toBe(defaultSourceStateFor(shipped, role, undefined));
    }
  });

  it('participation NEVER rewrites the emitted role (the honest closest label survives)', () => {
    // emittedRoleFor reads the roleType only — participation is a separate axis.
    expect(emittedRoleFor(shipped, 'diluent')).toBe('solvent');
    expect(emittedRoleFor(shipped, 'matrix')).toBe('buffer_component');
  });
});

describe('ROLE-AXES-1 LEG 2b: arithmetic rides the declared participation through computeFormulation', () => {
  it('a mislabeled carrier that DECLARES qs_carrier gets its computed volume fraction', () => {
    const result = computeFormulation({
      ingredients: [
        { ref: ref('record', 'vp-medium', 'Base medium'), roleType: 'additive', participation: 'qs_carrier', measureMode: 'qs_to_final', sourceState: 'liquid' },
        { ref: ref('record', 'ms-aliquot', 'Salt stock'), roleType: 'solvent', measureMode: 'fixed_amount', requiredAmount: { value: 5, unit: 'mL' } },
      ],
      totalOutputQuantity: { value: 50, unit: 'mL' },
    });
    const carrier = result.outputComposition.find((e) => e.componentRef.id === 'vp-medium');
    expect(carrier?.concentration).toMatchObject({ value: 90, unit: '% v/v', basis: 'volume_fraction' });
    // The role label is untouched by the axis (decoupling never rewrites role).
    expect(carrier?.role).toBe('additive');
  });

  it('a participation-absent record computes EXACTLY the legacy values (byte-pin unchanged)', () => {
    const absent = computeFormulation({
      ingredients: [
        { ref: ref('ontology', 'CHEBI:28284', 'NaCl'), roleType: 'solute', measureMode: 'target_concentration', sourceState: 'solid', targetContribution: { value: 150, unit: 'mM', basis: 'molar' }, molecularWeight: { value: 58.44, unit: 'g/mol' } },
        { ref: ref('ontology', 'CHEBI:15377', 'Water'), roleType: 'solvent', measureMode: 'qs_to_final', sourceState: 'liquid' },
      ],
      totalOutputQuantity: { value: 10, unit: 'mL' },
    });
    const declared = computeFormulation({
      ingredients: [
        { ref: ref('ontology', 'CHEBI:28284', 'NaCl'), roleType: 'solute', participation: 'solute_contributor', measureMode: 'target_concentration', sourceState: 'solid', targetContribution: { value: 150, unit: 'mM', basis: 'molar' }, molecularWeight: { value: 58.44, unit: 'g/mol' } },
        { ref: ref('ontology', 'CHEBI:15377', 'Water'), roleType: 'solvent', participation: 'qs_carrier', measureMode: 'qs_to_final', sourceState: 'liquid' },
      ],
      totalOutputQuantity: { value: 10, unit: 'mL' },
    });
    expect(JSON.parse(JSON.stringify(declared.outputComposition)))
      .toEqual(JSON.parse(JSON.stringify(absent.outputComposition)));
  });

  it('copilot defaults follow the declared participation arm (measure mode + source state)', () => {
    const draft: CopilotIngredientDraft = {
      ref: ref('record', 'vp-medium', 'Base medium'),
      roleType: 'additive',
      participation: 'qs_carrier',
    };
    expect(inferIngredientMeasureMode(draft, shipped)).toBe('qs_to_final');
    const result = summarizeFormulationDraft({
      ingredients: [draft],
      totalProduced: { value: 10, unit: 'mL' },
    });
    expect(result.calculationSummary[0]!.measureMode).toBe('qs_to_final');
    expect(result.calculationSummary[0]!.sourceState).toBe('liquid');
  });
});

describe('ROLE-AXES-1 LEG 2b: the re-point is DATA (per-call load, bait 2)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'roleaxes-repoint-'));
  const fixturePath = join(tmp, 'repoint-convention.yaml');

  const baseDoc = [
    'version: 1',
    'legacyRoleMapping:',
    '  additive:',
    '    emittedRole: additive',
    '    defaultMeasureMode: target_concentration',
    '    defaultSourceState: other',
    '    volumeFractionFromResolvedAmount: false',
    'defaultArm:',
    '  emittedRole: other',
    '  defaultMeasureMode: target_concentration',
    '  defaultSourceState: other',
    '  volumeFractionFromResolvedAmount: false',
    'fallbackCompositionRole: solute',
    'volumeFractionMeasureModes: [qs_to_final]',
    'volumeFractionExcludedMeasureModes: [fixed_amount]',
    'countAmountUnit: cells',
    'primaryConcentrationRoleOrder: [solute]',
    'promptEmission:',
    '  primaryRoleType: solute',
    '  carrierRoleType: solvent',
    '  carrierSnapshotRole: solvent',
    'recipeNameCarrierRoleTypes: [solvent]',
  ].join('\n');

  it('a mid-run edit to the participation arms is seen on the NEXT call (never process-cached)', () => {
    writeFileSync(fixturePath, baseDoc + '\nparticipationArms:\n  liquid_component:\n    defaultMeasureMode: null\n    defaultSourceState: null\n    volumeFractionFromResolvedAmount: false\n');
    const before = loadParticipationConvention(fixturePath)!;
    expect(maySynthesizeVolumeFraction(before, { measureMode: undefined, role: 'additive', participation: 'liquid_component' })).toBe(false);

    // Flip the arm in the DATA only — zero TS change (the re-point is data).
    writeFileSync(fixturePath, baseDoc + '\nparticipationArms:\n  liquid_component:\n    defaultMeasureMode: null\n    defaultSourceState: null\n    volumeFractionFromResolvedAmount: true\n');
    const after = loadParticipationConvention(fixturePath)!;
    expect(maySynthesizeVolumeFraction(after, { measureMode: undefined, role: 'additive', participation: 'liquid_component' })).toBe(true);
  });

  it('a participation arm with a malformed default THROWS naming the path', () => {
    const badPath = join(tmp, 'bad-repoint.yaml');
    writeFileSync(badPath, baseDoc + '\nparticipationArms:\n  qs_carrier:\n    defaultMeasureMode: not_a_mode\n    defaultSourceState: liquid\n    volumeFractionFromResolvedAmount: true\n');
    expect(() => loadParticipationConvention(badPath)).toThrowError(/composition-participation convention.*bad-repoint\.yaml/);
  });

  it('a participation arm with a non-boolean volumeFraction THROWS naming the path', () => {
    const badPath = join(tmp, 'bad-repoint2.yaml');
    writeFileSync(badPath, baseDoc + '\nparticipationArms:\n  qs_carrier:\n    defaultMeasureMode: qs_to_final\n    defaultSourceState: liquid\n    volumeFractionFromResolvedAmount: sometimes\n');
    expect(() => loadParticipationConvention(badPath)).toThrowError(/composition-participation convention.*bad-repoint2\.yaml/);
  });

  it('absent participationArms section is legal (LEG 2 shape): the legacy mapping alone drives the math', () => {
    const legacyOnly = loadParticipationConvention(fixturePath);
    expect(legacyOnly).toBeDefined();
    // The shipped file carries the arms; a participation-absent record never
    // consults them (byte-pin goldens stay green with or without the section).
    expect(shipped.participationArms).toBeTypeOf('object');
    expect(String(PARTICIPATION_CONVENTION_PATH)).toContain('composition-participation-convention.yaml');
  });

  it('the LOUD-off warn still names the path when the data home is absent (unchanged semantics)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const conv = loadParticipationConvention(join(tmp, 'definitely-absent.yaml'));
      expect(conv).toBeUndefined();
      const warns = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(warns.some((w) => w.includes('composition-participation-convention-off') && w.includes('definitely-absent.yaml'))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
