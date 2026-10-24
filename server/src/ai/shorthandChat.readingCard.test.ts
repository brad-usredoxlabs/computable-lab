/**
 * READING-CARD-ANSWER-1 — the readings-as-choices MAP arm (RED-first).
 *
 * The defect (architect basis decisions/REVISEGHOST1-a5tier2-readingcard-decision-l2t0650.md,
 * Ruling 2 + Amendment 1): a fact CARRYING non-empty `readings` (the data the
 * composition-fraction bar itself attached, normalizeScientistIntent.ts:927)
 * renders as a `/m` material binder with the noun-template prompt and a mint
 * exit — the scientist has no way to answer the bar through the UI.
 *
 * The fix shape is STRUCTURAL, never a reason literal (Amendment 1): the map's
 * new arm fires on the fact CARRYING readings, routes it to menuProvider
 * 'choice' (mint suppression falls out of the existing
 * `menuProvider !== 'choice' && mintable` expression — zero new policy), and
 * the prompt is the fact's OWN `message` (already data-derived). kind stays
 * from the vocabulary's declared domain. A fact WITHOUT readings renders
 * byte-identically to today (pinned by hash comparison).
 *
 * Fixture strings live ONLY in this test (repo rip-out rule — no reagent nouns
 * in src/ product code).
 */
import { describe, expect, it } from 'vitest';
import { clarificationsFromUnresolvedFacts, factRequestId } from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

/** The fact AS THE PRODUCER BAR EMITS IT: the declared envelope is
 *  {label, reason, actionLocation}; `message` and `readings` ride at runtime
 *  via normalizeScientistIntent's conditional spreads. This fixture type
 *  names that runtime shape so the test seeds stay type-clean. */
type ReadingFactFixture = ScientistIntentUnresolvedFact & {
  message: string;
  readings: Array<{
    id: string;
    label: string;
    finalFractions: Array<{ label: string; percent: number }>;
    nestedFractions?: Array<{ label: string; percent: number }>;
    note?: string;
  }>;
};

/** A readings-bearing fact shaped exactly as the fraction bar emits it
 *  (normalizeScientistIntent.ts:921-928: label = the parseable component
 *  labels joined by ', ', reason, actionLocation, message, readings by
 *  conditional spread). Test seeds ONLY. */
const READING_FACT: ReadingFactFixture = {
  label: 'Alpha Reagent, Beta Buffer, Gamma Serum',
  reason: 'composition-fraction-sum',
  actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' },
  message: 'The declared composition fractions sum to 110 percent, not the declared 100 percent (percent-of-final-volume). The utterance carries more than one legal parse — choose which reading applies; each candidate lists its computed final fractions.',
  readings: [
    {
      id: 'whole-mixture-supplement',
      label: 'whole-mixture supplement (the supplement is a share of the final volume; the bases re-base)',
      finalFractions: [
        { label: 'Alpha Reagent', percent: 45.45 },
        { label: 'Beta Buffer', percent: 45.45 },
        { label: 'Gamma Serum', percent: 9.1 },
      ],
    },
    {
      id: 'preceding-noun-recipe',
      label: 'preceding-noun in-house recipe (the supplement attaches to the entry that precedes it — a complete medium the lab makes)',
      finalFractions: [
        { label: 'Alpha Reagent', percent: 50 },
        { label: 'Beta Buffer', percent: 45 },
        { label: 'Gamma Serum', percent: 5 },
      ],
      nestedFractions: [
        { label: 'Beta Buffer', percent: 90 },
        { label: 'Gamma Serum', percent: 10 },
      ],
    },
    {
      id: 'explicit-on-top',
      label: 'explicit on-top (declared fractions stay fractions-of-mixture)',
      finalFractions: [
        { label: 'Alpha Reagent', percent: 50 },
        { label: 'Beta Buffer', percent: 50 },
        { label: 'Gamma Serum', percent: 10 },
      ],
      note: 'Declared fractions sum to 110 percent of the mixture, not 100 percent — the fractions are kept as declared fractions-of-mixture.',
    },
  ],
};

describe('READING-CARD-ANSWER-1 — the map arm: a readings-bearing fact becomes a choice card', () => {
  it('a fact carrying non-empty readings maps to menuProvider choice with the readings as its option set', () => {
    const [request] = clarificationsFromUnresolvedFacts([READING_FACT]);
    expect(request).toBeDefined();
    // STRUCTURAL arm: the fact carries readings → choice card. kind stays from
    // the vocabulary's declared domain for the composition arg (material).
    expect(request!.menuProvider).toBe('choice');
    expect(request!.kind).toBe('material');
    expect(request!.entityType).toBe('material');
    // The readings ride as the option set in ARRAY ORDER (server never
    // pre-picks; DATA order stands). id = the reading id, label = the
    // reading's own label, snippet = the computed final fractions (+note).
    expect(request!.options.map((o) => o.id)).toEqual([
      'whole-mixture-supplement',
      'preceding-noun-recipe',
      'explicit-on-top',
    ]);
    expect(request!.options.map((o) => o.label)).toEqual(
      READING_FACT.readings!.map((r) => r.label),
    );
    expect(request!.options[0]!.snippet).toContain('Alpha Reagent');
    expect(request!.options[0]!.snippet).toContain('45.45');
    // The snippet is the reading's COMPUTED FINAL fractions (Ruling 2:
    // finalFractions + note — the nested view stays in the reading data,
    // never the row).
    expect(request!.options[1]!.snippet).toContain('45');
    expect(request!.options[1]!.snippet).toContain('5');
    // The note rides the option that carries it (explicit-on-top).
    expect(request!.options[2]!.snippet).toContain('110');
  });

  it('prompt text = the fact\u2019s OWN message (data-derived), NOT the noun template', () => {
    const [request] = clarificationsFromUnresolvedFacts([READING_FACT]);
    expect(request!.prompt).toBe(READING_FACT.message);
    // The noun-template wording never appears on a reading card.
    expect(request!.prompt).not.toContain('could not bind it');
    expect(request!.prompt).not.toContain('Choose what it is');
  });

  it('mint suppression falls out of the existing expression: a reading card has allowCreateLocal false', () => {
    const [request] = clarificationsFromUnresolvedFacts([READING_FACT]);
    // The label is a plain noun-phrase (mintable by the nounShape DATA) —
    // the suppression comes from menuProvider === 'choice' ALONE (the
    // existing `menuProvider !== 'choice' && mintable` expression). Zero new
    // policy expressions.
    expect(request!.allowCreateLocal).toBe(false);
  });

  it('the join id is unchanged: requestId = factRequestId(fact) (no new wire shape)', () => {
    const [request] = clarificationsFromUnresolvedFacts([READING_FACT]);
    expect(request!.id).toBe(factRequestId(READING_FACT));
    // The fact rides VERBATIM on unresolvedFact — the map consumes facts, it
    // never rewrites them.
    expect(request!.unresolvedFact).toBe(READING_FACT);
  });

  it('byte-stability: a fact WITHOUT readings renders EXACTLY as today (hash pin)', () => {
    const noReadings: ScientistIntentUnresolvedFact = {
      label: 'Enigma Broth',
      reason: 'unknown-noun',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
    };
    const [request] = clarificationsFromUnresolvedFacts([noReadings]);
    // The shipped shape verbatim: /m provider, noun-template prompt with the
    // mint clause (Enigma Broth is DATA-mintable), empty options.
    expect(request!.menuProvider).toBe('/m');
    expect(request!.allowCreateLocal).toBe(true);
    expect(request!.prompt).toBe(
      'The draft names "Enigma Broth" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.',
    );
    expect(request!.options).toEqual([]);
    // An EMPTY readings array is not "carrying readings" — the arm fires on
    // NON-EMPTY readings only (the bar never emits an empty array; the
    // conditional spread at normalizeScientistIntent.ts:927 proves it).
    const emptyReadings: ReadingFactFixture = {
      ...noReadings,
      message: '',
      readings: [],
    };
    const [same] = clarificationsFromUnresolvedFacts([emptyReadings]);
    expect(same!.menuProvider).toBe('/m');
    expect(same!.allowCreateLocal).toBe(true);
    expect(same!.prompt).toBe(request!.prompt);
  });

  it('the discriminator is STRUCTURAL: a readings-bearing fact with ANY reason routes to choice (no reason-name branch)', () => {
    // Same readings payload, a different reason code — the arm fires on the
    // CARRIED DATA, never on a reason literal (Amendment 1).
    const otherReason: ScientistIntentUnresolvedFact = {
      ...READING_FACT,
      reason: 'some-future-producer-reason',
    };
    const [request] = clarificationsFromUnresolvedFacts([otherReason]);
    expect(request!.menuProvider).toBe('choice');
    expect(request!.allowCreateLocal).toBe(false);
    expect(request!.prompt).toBe(otherReason.message);
    expect(request!.options.length).toBe(3);
  });

  it('a readings-bearing fact with a prose (non-mintable) label keeps the same choice shape (no mint clause either way)', () => {
    const prose: ScientistIntentUnresolvedFact = {
      ...READING_FACT,
      label: 'the supernatant containing the cells with the debris',
    };
    const [request] = clarificationsFromUnresolvedFacts([prose]);
    expect(request!.menuProvider).toBe('choice');
    expect(request!.allowCreateLocal).toBe(false);
    expect(request!.prompt).toBe(prose.message);
  });
});
