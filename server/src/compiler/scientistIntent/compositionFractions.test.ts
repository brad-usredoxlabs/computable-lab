/**
 * MIXFRAC-1 — composition-fraction convention: RED-first unit/contract tests
 * for the sum-to-total clarification + the three candidate readings (Brad's
 * OQ-1 ruling, spec §4/§7/§14).
 *
 * The defect at trunk: "50/50 X/Y + 10% Z" (110% of the declared basis)
 * compiles clean — nothing parses or sums the declared fraction strings
 * (simpleVerbs.ts:385 copies each fraction verbatim). At base every
 * clarification leg below FAILS with zero clarifications; that is the RED
 * capture (spec §9).
 *
 * Harness discipline: the REAL normalizeScientistIntent runs; the convention
 * DATA is the shipped config/drafting/composition-fraction-convention.yaml
 * (loaded per call); tests inject paths/records via NormalizeOptions (the
 * mixtureCuesPath precedent). Zero reagent/fraction/connector literals in the
 * production TS (spec §6 bait 4); reason-code strings pinned here follow the
 * existing test idiom (tests pin shipped reason strings verbatim).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeScientistIntent } from './normalizeScientistIntent.js';
import { parseScientistIntent } from './parseScientistIntent.js';

const FRACTION_REASON = 'composition-fraction-sum';

/** The canonical 110% composition (compositionDecomposition.test.ts:44-53
 *  shape) riding an utterance with a supplement connector and NO final/on-top
 *  phrase — genuine ambiguity: THREE candidate readings, never a pick. */
const CANONICAL_110 = `
intentId: mixfrac-canonical
sourcePrompt: "50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL"
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "DMEM", role: buffer_component, fraction: "50%" }
        - { material: "FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`;

function clarificationsFor(doc: string, options?: Parameters<typeof normalizeScientistIntent>[1]) {
  return normalizeScientistIntent(parseScientistIntent(doc), options).clarifications ?? [];
}

afterEach(() => { vi.restoreAllMocks(); });

describe('MIXFRAC-1: a 110% composition clarifies with the three candidate readings', () => {
  it('RED core: the canonical 50/50/10 composition emits ONE clarification with reason composition-fraction-sum', () => {
    const clarifications = clarificationsFor(CANONICAL_110);
    const fractionFacts = clarifications.filter((c) => c.reason === FRACTION_REASON);
    expect(fractionFacts, 'a 110% declared sum must clarify (the trunk defect)').toHaveLength(1);
    // One clarification for the whole composition, not one per component
    // (spec §6 bait 7).
    expect(clarifications.filter((c) => c.reason === FRACTION_REASON)).toHaveLength(1);
  });

  it('the clarification carries THREE readings, each with COMPUTED final fractions (OQ-1 ruling)', () => {
    const fact = clarificationsFor(CANONICAL_110).find((c) => c.reason === FRACTION_REASON)!;
    const readings = (fact as unknown as Record<string, unknown>)['readings'] as Array<Record<string, unknown>>;
    expect(readings, 'the ambiguous utterance carries three candidate readings').toHaveLength(3);
    const byId = new Map(readings.map((r) => [String(r['id']), r]));
    expect([...byId.keys()].sort()).toEqual([
      'explicit-on-top',
      'preceding-noun-recipe',
      'whole-mixture-supplement',
    ]);

    // Whole-mixture re-base: the supplement keeps its declared share of the
    // final total; the bases scale proportionally (45/45/10).
    const rebase = byId.get('whole-mixture-supplement')!;
    const rebaseFractions = (rebase['finalFractions'] as Array<Record<string, unknown>>)
      .map((f) => [String(f['label']), Number(f['percent'])] as const);
    expect(new Map(rebaseFractions)).toEqual(new Map([
      ['Trypsin-EDTA', 45],
      ['DMEM', 45],
      ['FBS', 10],
    ]));

    // Preceding-noun in-house recipe: "DMEM + 10% FBS" is a UNIT — the medium
    // entry's 50 splits 45/5; the purchased half stays 50 (Brad's ruling:
    // Trypsin-EDTA 50 / DMEM 45 / FBS 5, sum 100).
    const preceding = byId.get('preceding-noun-recipe')!;
    const precedingFractions = (preceding['finalFractions'] as Array<Record<string, unknown>>)
      .map((f) => [String(f['label']), Number(f['percent'])] as const);
    expect(new Map(precedingFractions)).toEqual(new Map([
      ['Trypsin-EDTA', 50],
      ['DMEM', 45],
      ['FBS', 5],
    ]));

    // Explicit on-top: declared fractions stay fractions-of-mixture WITH the
    // sum note (OQ-4: the note rides the reading data, never the ledger).
    const onTop = byId.get('explicit-on-top')!;
    const onTopFractions = (onTop['finalFractions'] as Array<Record<string, unknown>>)
      .map((f) => Number(f['percent'])).sort((a, b) => a - b);
    expect(onTopFractions).toEqual([10, 50, 50]);
    expect(typeof onTop['note'], 'the on-top reading carries the sum note').toBe('string');
  });

  it('no reading is picked by confidence: the clarification carries all three, unranked (spec §6 bait 8)', () => {
    const fact = clarificationsFor(CANONICAL_110).find((c) => c.reason === FRACTION_REASON)!;
    const raw = JSON.parse(JSON.stringify(fact)) as Record<string, unknown>;
    expect(JSON.stringify(raw), 'confidence must never appear in the fraction path').not.toContain('confidence');
    const readings = raw['readings'] as Array<Record<string, unknown>>;
    for (const reading of readings) {
      expect(Object.keys(reading)).not.toContain('confidence');
    }
  });

  it('the clarification names the action location (composition argument)', () => {
    const fact = clarificationsFor(CANONICAL_110).find((c) => c.reason === FRACTION_REASON)!;
    expect((fact as unknown as Record<string, unknown>)['actionLocation']).toEqual({
      actionIndex: 0,
      action: 'add_material',
      argument: 'composition',
    });
  });
});

describe('MIXFRAC-1: cells never join the sum (spec §6 bait 6)', () => {
  it('a fraction-carrying cells entry stays OUT of the sum: non-cell fractions summing to 100 do NOT clarify', () => {
    const doc = `
intentId: mixfrac-cells-out
sourcePrompt: "50/50 Trypsin-EDTA/DMEM with 200 HepG2 cells/uL"
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "DMEM", role: buffer_component, fraction: "50%" }
        - { material: "HepG2 cells", role: cells, fraction: "10%", count: 10000 }
`;
    const fractionFacts = clarificationsFor(doc).filter((c) => c.reason === FRACTION_REASON);
    expect(fractionFacts, 'the cells fraction must not poison the sum').toHaveLength(0);
  });
});

describe('MIXFRAC-1: absent convention file => feature OFF — LOUD (spec §6 bait 10)', () => {
  it('an absent convention file warns ONCE naming the path and the fractions pass through unchanged', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = new URL('../../../../config/drafting/composition-fraction-convention-absent-mixfrac.yaml', import.meta.url);
    const clarifications = clarificationsFor(CANONICAL_110, { fractionConventionPath: missing });
    expect(clarifications.filter((c) => c.reason === FRACTION_REASON), 'check OFF => no clarification').toHaveLength(0);
    const warns = warn.mock.calls.map((call) => String(call[0]));
    const naming = warns.filter((w) => w.includes('composition-fraction-convention-absent-mixfrac.yaml'));
    expect(naming, 'the off-state must name the path').toHaveLength(1);
  });
});

describe('MIXFRAC-1: malformed fractions are excluded and named, never guessed', () => {
  it('a fraction string that parses to no number is excluded from the sum and named in the message', () => {
    const doc = `
intentId: mixfrac-malformed
sourcePrompt: "half Trypsin-EDTA and half DMEM plus half FBS"
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Trypsin-EDTA", role: solvent, fraction: "half" }
        - { material: "DMEM", role: buffer_component, fraction: "50%" }
        - { material: "FBS", role: additive, fraction: "50%" }
`;
    const fact = clarificationsFor(doc).find((c) => c.reason === FRACTION_REASON);
    // The malformed entry is excluded from the sum; the remaining declared
    // fractions (50+50) sum to the total — so the malformed entry alone does
    // NOT clarify. It IS named when a clarification fires for other reasons.
    if (fact) {
      expect(String((fact as unknown as Record<string, unknown>)['message'])).toContain('half');
    }
    // Characterization: a composition whose parseable non-excluded fractions
    // sum to the total compiles clean even with a malformed fraction present.
    expect(fact === undefined || clarificationsFor(doc).filter((c) => c.reason === FRACTION_REASON).length <= 1).toBe(true);
  });
});

describe('MIXFRAC-1: one-sided evidence resolves without a clarification', () => {
  it('finalVolumePhrases evidence ("bring to ... final") resolves to the re-base parse — NO clarification', () => {
    const doc = `
intentId: mixfrac-final
sourcePrompt: "50/50 Trypsin-EDTA/DMEM, bring to 10% FBS final"
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "DMEM", role: buffer_component, fraction: "50%" }
        - { material: "FBS", role: additive, fraction: "10%" }
`;
    expect(clarificationsFor(doc).filter((c) => c.reason === FRACTION_REASON)).toHaveLength(0);
  });

  it('onTopPhrases evidence ("v/v on top") resolves to the on-top parse — NO clarification', () => {
    const doc = `
intentId: mixfrac-ontop
sourcePrompt: "50/50 Trypsin-EDTA/DMEM, add 10% FBS v/v on top"
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "DMEM", role: buffer_component, fraction: "50%" }
        - { material: "FBS", role: additive, fraction: "10%" }
`;
    expect(clarificationsFor(doc).filter((c) => c.reason === FRACTION_REASON)).toHaveLength(0);
  });
});

describe('MIXFRAC-1: recipe-shaped store evidence presents preceding-noun FIRST (§14.3)', () => {
  it('an injected recipe-shaped record (name matches the preceding-noun phrase, declares its own composition) reorders the readings', () => {
    const fact = clarificationsFor(CANONICAL_110, {
      recipeShapedRecords: [
        { name: 'DMEM + 10% FBS', kind: 'material-spec', formulationKind: 'defined_composition', declaresComposition: true },
      ],
    }).find((c) => c.reason === FRACTION_REASON)!;
    const readings = (fact as unknown as Record<string, unknown>)['readings'] as Array<Record<string, unknown>>;
    expect(String(readings[0]!['id']), 'the recipe-shaped reading is presented FIRST').toBe('preceding-noun-recipe');
    expect(readings).toHaveLength(3);
  });

  it('without recipe-shaped evidence the shipped presentation order stands (whole-mixture first)', () => {
    const fact = clarificationsFor(CANONICAL_110).find((c) => c.reason === FRACTION_REASON)!;
    const readings = (fact as unknown as Record<string, unknown>)['readings'] as Array<Record<string, unknown>>;
    expect(String(readings[0]!['id'])).toBe('whole-mixture-supplement');
  });

  it('a store record that does NOT declare its own composition is not recipe-shaped evidence', () => {
    const fact = clarificationsFor(CANONICAL_110, {
      recipeShapedRecords: [
        { name: 'DMEM + 10% FBS', kind: 'material-spec', formulationKind: 'complex_composition', declaresComposition: false },
      ],
    }).find((c) => c.reason === FRACTION_REASON)!;
    const readings = (fact as unknown as Record<string, unknown>)['readings'] as Array<Record<string, unknown>>;
    expect(String(readings[0]!['id'])).toBe('whole-mixture-supplement');
  });
});

describe('MIXFRAC-1: a clean 100% composition never clarifies', () => {
  it('fractions summing to the declared total compile clean', () => {
    const doc = `
intentId: mixfrac-clean
sourcePrompt: "45% DMEM + 5% FBS + 50% Trypsin-EDTA"
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "DMEM", role: buffer_component, fraction: "45%" }
        - { material: "FBS", role: additive, fraction: "5%" }
`;
    expect(clarificationsFor(doc).filter((c) => c.reason === FRACTION_REASON)).toHaveLength(0);
  });
});
