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
import { createIntentCompileFromPromptHandlers } from '../../api/handlers/IntentCompileFromPromptHandlers.js';

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
  // fix1/D1 (adversarial review l2t1855): the previous fixture ("half" +
  // "50%" + "50%") provably yields NO clarification — the parseable
  // non-excluded fractions (50+50) already sum to the total, so the check
  // returns before the malformed arm is ever reached and the test asserted
  // nothing (a tautology). Spec §5's rule ("a fraction string that parses to
  // no number is excluded from the sum and NAMED, never guessed") gets its
  // coverage here: a fixture whose PARSEABLE fractions genuinely break the
  // total (50 + 50 + 30 = 130) while ONE entry carries a malformed fraction.
  const MALFORMED_BREAKS_SUM = `
intentId: mixfrac-malformed-breaks-sum
sourcePrompt: "50% Trypsin-EDTA plus 50% DMEM plus half FBS plus 30% Equine Serum"
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "DMEM", role: buffer_component, fraction: "50%" }
        - { material: "FBS", role: additive, fraction: "half" }
        - { material: "Equine Serum", role: additive, fraction: "30%" }
`;

  it('a fraction string that parses to no number is excluded from the sum and named in the message', () => {
    const clarifications = clarificationsFor(MALFORMED_BREAKS_SUM);
    const fractionFacts = clarifications.filter((c) => c.reason === FRACTION_REASON);
    // The parseable non-excluded fractions (50 + 50 + 30) break the total, so
    // the bar fires — the malformed entry alone does not create the break, but
    // once the bar fires the malformed entry MUST be named.
    expect(fractionFacts, 'parseable fractions breaking the total must clarify').toHaveLength(1);
    const fact = fractionFacts[0]!;
    const message = String((fact as unknown as Record<string, unknown>)['message']);

    // EXCLUDED: the sum the clarification reports is the PARSEABLE rest
    // (50+50+30 = 130), never a guessed value for "half" and never counting
    // it (a guessed 0 keeps 130; a guessed 50 would report 180).
    expect(message, 'the reported sum must be the parseable rest — the malformed entry is excluded').toContain('130');
    expect(message, 'the malformed entry must never be guessed into the sum').not.toContain('180');

    // NAMED: the malformed fraction string itself appears in the message.
    expect(message, 'the malformed fraction must be named verbatim').toContain('half');

    // The readings' computed fractions carry ONLY the parseable entries —
    // "half" never appears as a computed reading fraction.
    const readings = (fact as unknown as Record<string, unknown>)['readings'] as Array<Record<string, unknown>>;
    expect(readings).toHaveLength(3);
    for (const reading of readings) {
      const labels = (reading['finalFractions'] as Array<Record<string, unknown>>).map((f) => String(f['label']));
      expect(labels, 'the malformed entry is excluded from every reading').not.toContain('FBS');
    }
  });

  it('characterization: parseable fractions summing to the total compile clean even with a malformed fraction present', () => {
    // The malformed entry alone does NOT clarify: exclusion + naming only
    // applies when a clarification fires for other reasons (the sum holds
    // here, so no fact exists to name it in).
    const doc = `
intentId: mixfrac-malformed-clean-sum
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
    expect(clarificationsFor(doc).filter((c) => c.reason === FRACTION_REASON)).toHaveLength(0);
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

  it('onTopPhrases evidence ("v/v on top") does NOT resolve silently: the bar stands and the on-top reading carries 50/50/10 + the sum note (OQ-4)', async () => {
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
    // On-top evidence is one-sided for the ON-TOP parse, but the declared
    // fractions still break the total — the bar stands (silentResolution
    // names ONLY the final-volume arm) and the explicit-on-top reading keeps
    // the declared fractions-of-mixture WITH the sum note (OQ-4: the note
    // rides the reading data, never the ledger, never the source form).
    const fact = clarificationsFor(doc).find((c) => c.reason === FRACTION_REASON)!;
    const readings = (fact as unknown as Record<string, unknown>)['readings'] as Array<Record<string, unknown>>;
    expect(readings).toHaveLength(3);
    const onTop = readings.find((r) => String(r['id']) === 'explicit-on-top')!;
    const onTopFractions = (onTop['finalFractions'] as Array<Record<string, unknown>>)
      .map((f) => Number(f['percent'])).sort((a, b) => a - b);
    expect(onTopFractions).toEqual([10, 50, 50]);
    expect(typeof onTop['note'], 'the on-top reading carries the sum note').toBe('string');
    expect(String(onTop['note'])).toContain('110');
  });
});

describe('MIXFRAC-1: recipe-shaped store evidence presents preceding-noun FIRST (§14.3)', () => {
  it('an injected recipe-shaped record (name matches the preceding-noun phrase, declares its own composition) reorders the readings', () => {
    const fact = clarificationsFor(CANONICAL_110, {
      recipeShapedRecords: [
        {
          name: 'DMEM + 10% FBS',
          kind: 'material-spec',
          formulationKind: 'defined_composition',
          composition: [
            { material: 'DMEM', role: 'buffer_component', fraction: '90%' },
            { material: 'FBS', role: 'additive', fraction: '10%' },
          ],
        },
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
        { name: 'DMEM + 10% FBS', kind: 'material-spec', formulationKind: 'complex_composition' },
      ],
    }).find((c) => c.reason === FRACTION_REASON)!;
    const readings = (fact as unknown as Record<string, unknown>)['readings'] as Array<Record<string, unknown>>;
    expect(String(readings[0]!['id'])).toBe('whole-mixture-supplement');
  });

  it('document-side arm (§14.1 expressibility): the preceding entry declaring its OWN composition presents preceding-noun FIRST, quotes the declared inner split, and expands it into the flat derived view', () => {
    // The medium entry carries its own declared composition (the ONE additive
    // composition-entry property) — an in-house formulation stated in the
    // document itself is a recipe-shaped component reading. The declared
    // top-level fractions still break the total, so the bar stands.
    const doc = `
intentId: mixfrac-nested-doc
sourcePrompt: "50/50 Trypsin-EDTA/complete medium + 10% FBS with 200 HepG2 cells/uL"
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Trypsin-EDTA", role: solvent, fraction: "50%" }
        - material: "complete medium"
          role: buffer_component
          fraction: "50%"
          composition:
            - { material: "DMEM", role: buffer_component, fraction: "90%" }
            - { material: "FBS", role: additive, fraction: "10%" }
        - { material: "FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000 }
`;
    const fact = clarificationsFor(doc).find((c) => c.reason === FRACTION_REASON)!;
    const readings = (fact as unknown as Record<string, unknown>)['readings'] as Array<Record<string, unknown>>;
    expect(readings).toHaveLength(3);
    expect(String(readings[0]!['id']), 'the document-side recipe reading is presented FIRST').toBe('preceding-noun-recipe');
    // The preceding entry's DECLARED inner composition is quoted VERBATIM as
    // the nested fractions (never re-inferred when the document states it).
    const nested = (readings[0]!['nestedFractions'] as Array<Record<string, unknown>>)
      .map((f) => [String(f['label']), Number(f['percent'])] as const);
    expect(new Map(nested)).toEqual(new Map([
      ['DMEM', 90],
      ['FBS', 10],
    ]));
    // The flat DERIVED view expands the declared children (parentShare x
    // childShare / total) and absorbs the top-level supplement entry — the
    // ruling's blessed numbers: Trypsin-EDTA 50 / DMEM 45 / FBS 5, sum 100.
    const flat = (readings[0]!['finalFractions'] as Array<Record<string, unknown>>)
      .map((f) => [String(f['label']), Number(f['percent'])] as const);
    expect(new Map(flat)).toEqual(new Map([
      ['Trypsin-EDTA', 50],
      ['DMEM', 45],
      ['FBS', 5],
    ]));
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

describe('MIXFRAC-1: a clarification answer selects a reading and drives the carried composition (§14.2 RECORD leg, fix1/D3)', () => {
  it('an answer keyed to the bar label whose value is a declared reading id settles the bar and rewrites the carried composition to that reading', () => {
    const normalized = normalizeScientistIntent(parseScientistIntent(CANONICAL_110), {
      scientistAnswers: { 'Trypsin-EDTA, DMEM, FBS': 'preceding-noun-recipe' },
    });
    const fractionFacts = (normalized.clarifications ?? []).filter((c) => c.reason === FRACTION_REASON);
    expect(fractionFacts, 'the scientist settled the parse — settled, do not re-ask').toHaveLength(0);

    // The carried composition IS the selected reading's flat derived view:
    // the ruling's numbers (Trypsin-EDTA 50 / DMEM 45 / FBS 5), the absorbed
    // top-level supplement line is GONE (the attachment reading says the
    // supplement IS part of the recipe), and the cells entry rides verbatim.
    const composition = (normalized.candidateEvents[0] as Record<string, unknown>)['composition'] as Array<Record<string, unknown>>;
    const byLabel = new Map(composition.map((e) => [String(e['material']), e]));
    expect([...byLabel.keys()].sort()).toEqual(['DMEM', 'FBS', 'HepG2 cells', 'Trypsin-EDTA']);
    expect(byLabel.get('Trypsin-EDTA')!['fraction']).toBe('50%');
    expect(byLabel.get('DMEM')!['fraction']).toBe('45%');
    expect(byLabel.get('FBS')!['fraction']).toBe('5%');
    expect(byLabel.get('HepG2 cells')!['count']).toBe(10000);
    expect(Object.keys(byLabel.get('HepG2 cells')!)).not.toContain('fraction');
    // The flat derived view never carries a nested entry (§14.2).
    for (const entry of composition) expect(Object.keys(entry)).not.toContain('composition');
  });

  it('an answer whose value is not a declared reading id settles nothing — the bar stands with all three readings', () => {
    const clarifications = clarificationsFor(CANONICAL_110, {
      scientistAnswers: { 'Trypsin-EDTA, DMEM, FBS': 'some-free-text-hedge' },
    });
    expect(clarifications.filter((c) => c.reason === FRACTION_REASON)).toHaveLength(1);
  });

  it('an answer keyed to a DIFFERENT label settles nothing (exact-label identity, never containment)', () => {
    const clarifications = clarificationsFor(CANONICAL_110, {
      scientistAnswers: { 'DMEM': 'preceding-noun-recipe' },
    });
    expect(clarifications.filter((c) => c.reason === FRACTION_REASON)).toHaveLength(1);
  });

  it('the whole-mixture reading is selectable the same way (the answer drives the doc, not a canned document)', () => {
    const normalized = normalizeScientistIntent(parseScientistIntent(CANONICAL_110), {
      scientistAnswers: { 'Trypsin-EDTA, DMEM, FBS': 'whole-mixture-supplement' },
    });
    expect((normalized.clarifications ?? []).filter((c) => c.reason === FRACTION_REASON)).toHaveLength(0);
    const composition = (normalized.candidateEvents[0] as Record<string, unknown>)['composition'] as Array<Record<string, unknown>>;
    const byLabel = new Map(composition.map((e) => [String(e['material']), e]));
    expect(byLabel.get('Trypsin-EDTA')!['fraction']).toBe('45%');
    expect(byLabel.get('DMEM')!['fraction']).toBe('45%');
    expect(byLabel.get('FBS')!['fraction']).toBe('10%');
  });
});

// ---------------------------------------------------------------------------
// §5 (spec §3 B): the readings ride the REAL 422 wire slot VERIFIED by a real
// 422 capture BEFORE any schema amendment. The route sends
// `clarifications: compile.clarifications` verbatim (SPINE-4 bar); the
// readings ride that producer-side clarification object — the wire
// `unresolved` slot (additionalProperties:false) carries NOTHING new, so no
// schema change is needed. This test drives the REAL
// createIntentCompileFromPromptHandlers route (only the model client and the
// store are stubbed — the vocabulary, Ajv parse, lift, normalize, resolve_nouns
// and compile all run real, the SPINE-5 harness idiom) and asserts the 422
// body carries the composition-fraction-sum fact WITH its three readings.
// ---------------------------------------------------------------------------
describe('MIXFRAC-1: the readings ride the real 422 body (no schema amendment)', () => {
  it('the route bars 422 NEEDS_CLARIFICATION with the composition-fraction-sum fact carrying readings + computed finalFractions', async () => {
    const store = {
      get: vi.fn(async () => null),
      getRecord: vi.fn(async () => null),
      list: vi.fn(async (filter?: { kind?: string }) =>
        filter?.kind === 'labware'
          ? [{ recordId: 'LAB-plate-1', schemaId: 's', payload: { kind: 'labware', name: 'plate', title: 'Plate' } }]
          : [],
      ),
      create: vi.fn(async () => { throw new Error('422 capture store must never write'); }),
      update: vi.fn(async () => { throw new Error('422 capture store must never write'); }),
      delete: vi.fn(async () => { throw new Error('422 capture store must never write'); }),
      history: vi.fn(async () => { throw new Error('422 capture store must never read history'); }),
    };
    const stubLlm = {
      complete: vi.fn(async (req: { tools?: Array<{ function?: { name?: string } }> }) => {
        const toolName = Array.isArray(req.tools) ? req.tools[0]?.function?.name : undefined;
        if (toolName === 'emit_branch_questions') {
          return { choices: [{ message: { content: null, tool_calls: [{ function: { name: 'emit_branch_questions', arguments: JSON.stringify({ axes: [] }) } }] } }] };
        }
        return {
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                function: {
                  name: 'emit_scientist_intent',
                  arguments: JSON.stringify({
                    intentId: 'mixfrac-422-capture',
                    sourcePrompt: '50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL',
                    actions: [{
                      action: 'add_material',
                      labware: 'plate',
                      volumeUl: 50,
                      targetWells: ['A1'],
                      params: {
                        composition: [
                          { material: 'Trypsin-EDTA', role: 'solvent', fraction: '50%' },
                          { material: 'DMEM', role: 'buffer_component', fraction: '50%' },
                          { material: 'FBS', role: 'additive', fraction: '10%' },
                          { material: 'HepG2 cells', role: 'cells', count: 10000, counterDensity: { value: 200, unit: 'cells/uL' } },
                        ],
                      },
                    }],
                  }),
                },
              }],
            },
          }],
        };
      }),
    };
    const handlers = createIntentCompileFromPromptHandlers(
      { store, appConfig: { ai: { inference: { baseUrl: 'http://mock:8899/v1', model: 'lfm2.5-2.6b' } } } } as never,
      { llmClient: stubLlm as never },
    );
    const calls: Array<{ status?: number; payload?: unknown }> = [];
    let currentStatus: number | undefined;
    const reply = {
      status(code: number) { currentStatus = code; return reply; },
      send(payload: unknown) { calls.push({ status: currentStatus, payload }); return reply; },
    };
    await handlers.compileFromPrompt(
      { body: { protocolText: '50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL', answers: { sample_type: 'bacterial' } }, log: { error: vi.fn() } } as never,
      reply as never,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.status, 'the 110% sum bars the route at 422').toBe(422);
    const payload = calls[0]!.payload as Record<string, unknown>;
    expect(payload.error).toBe('NEEDS_CLARIFICATION');
    const clarifications = payload.clarifications as Array<Record<string, unknown>>;
    const sumFacts = clarifications.filter((c) => c.reason === FRACTION_REASON);
    expect(sumFacts).toHaveLength(1);
    const fact = sumFacts[0]!;
    expect(fact.actionLocation).toEqual({ actionIndex: 0, action: 'add_material', argument: 'composition' });
    // The readings ride the 422 body verbatim — three candidate readings,
    // each with COMPUTED final fractions (the OQ-1 ruling's data).
    const readings = fact['readings'] as Array<Record<string, unknown>>;
    expect(Array.isArray(readings)).toBe(true);
    expect(readings.length).toBe(3);
    for (const reading of readings) {
      expect(Array.isArray(reading.finalFractions)).toBe(true);
      expect((reading.finalFractions as Array<Record<string, unknown>>).length).toBeGreaterThan(0);
    }
    // The wire `unresolved` slot of the held localMacro carries NOTHING new
    // (no schema amendment was needed): the readings ride the clarification
    // object only.
    const localMacro = payload.localMacro as { unresolved: unknown[] };
    expect(localMacro.unresolved).toEqual([]);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });
});
