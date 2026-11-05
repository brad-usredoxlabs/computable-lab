/**
 * demoteUnstatedQuantities.test.ts — L2-CLARIFY-TARGET-1 (RULING l2t1200
 * R1.2 + R1.7): the non-vacuous pin for the pre-compile EMISSION demotion.
 *
 * The pin must have caught the 6/10 "smuggled volumeUl" path: a draft that
 * carries a quantity the scientist's OWN turn never stated must, after the
 * demotion, (a) no longer carry that quantity in the parsed document and
 * (b) raise the declared `missing-required-argument` fact so the existing
 * machinery stamps the assumed-value chip DETERMINISTICALLY.
 *
 * RED against the pre-fix tree: `demoteUnstatedQuantities.ts` did not exist
 * and the seam did not call it — the smuggled `volumeUl: 100` would survive
 * parse, the sweep's presence test would see "present" and stay silent, and
 * no `missing-required-argument` fact (hence no chip) would fire. GREEN after
 * the fix.
 *
 * The stated-volume CONTROL ("Add 200 uL of DMEM to A1") must fire NO chip:
 * the demotion keeps a volume the scientist actually stated (R1.2: "never
 * strip a volume the scientist actually stated"). This is a no-op path — the
 * demotion returns the SAME document, the sweep sees the stated volume and
 * stays silent.
 *
 * The chip TEXT (the `clarifyControl.question` / `prompt`) must be the
 * DECLARED `assumedValues:` DATA sentence — not a TS literal (R1.3).
 */
import { describe, it, expect } from 'vitest';
import { demoteUnstatedQuantities } from './demoteUnstatedQuantities.js';
import { extractQuantity } from './reconcileDraftQuantities.js';
import {
  requiredArgumentClarifications,
  MISSING_REQUIRED_ARGUMENT_REASON,
} from '../compiler/resolution/resolveNounsPass.js';
import { defaultScientistIntentVocabulary } from '../compiler/scientistIntent/vocabulary.js';
import { clarificationsFromUnresolvedFacts } from './shorthandChat.js';
import type { ScientistIntent, ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

const VOCAB = defaultScientistIntentVocabulary();

function addMaterialDoc(withVolumeUl: boolean, volumeUlValue: number = 100): ScientistIntent {
  const action: Record<string, unknown> = {
    action: 'add_material',
    material: 'DMEM',
    targetWells: ['A1'],
  };
  if (withVolumeUl) action.volumeUl = volumeUlValue;
  return {
    kind: 'scientist-intent',
    version: '0.1.0',
    intentId: 't1-demote',
    actions: [action as unknown as ScientistIntent['actions'][number]],
    unresolved: [],
  };
}

function volumeUlFacts(doc: ScientistIntent): ScientistIntentUnresolvedFact[] {
  return requiredArgumentClarifications(doc, VOCAB).filter(
    (f) => f.reason === MISSING_REQUIRED_ARGUMENT_REASON
      && f.actionLocation?.argument === 'volumeUl',
  );
}

describe('demoteUnstatedQuantities — the pre-compile EMISSION demotion (R1.2)', () => {
  it('6/10 path: a draft carrying a quantity the prompt never stated is demoted to absence', () => {
    const smuggled = addMaterialDoc(true, 100);
    const r = demoteUnstatedQuantities(smuggled, 'Add DMEM to A1');
    // The smuggled volumeUl must be STRIPPED from the parsed document.
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.action).toBe('add_material');
    expect(r.demoted[0]!.argument).toBe('volumeUl');
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volumeUl' in action).toBe(false);
    // The declaration-driven machinery must now RAISE the missing fact
    // (the chip's precondition) — the 6/10 path that was silent pre-fix.
    const facts = volumeUlFacts(r.doc);
    expect(facts.length).toBe(1);
    expect(facts[0]!.reason).toBe(MISSING_REQUIRED_ARGUMENT_REASON);
  });

  it('the demoted fact stamps the assumed-value chip with the DECLARED DATA wording', () => {
    const smuggled = addMaterialDoc(true, 100);
    const r = demoteUnstatedQuantities(smuggled, 'Add DMEM to A1');
    const facts = volumeUlFacts(r.doc);
    const [req] = clarificationsFromUnresolvedFacts(facts);
    expect(req).toBeDefined();
    // The chip's declared control (R1.3: value/unit/label/source/question
    // all from the `assumedValues:` DATA — never a TS literal).
    const cc = req!.clarifyControl;
    expect(cc).toBeDefined();
    expect(cc!.kind).toBe('quantity');
    const qty = cc as { kind: 'quantity'; label: string; value: number; unit: string; source: string; question: string };
    expect(qty.value).toBe(100);
    expect(qty.unit).toBe('uL');
    // The chip's RAW question template (the DATA-declared placeholders —
    // the client renders the sentence; the server ships the template).
    expect(qty.question).toBe(
      'How much {label}? The prompt states none — {value} {unit} is assumed; approve it or enter the amount.',
    );
    // The card's rendered prompt is the DECLARED :101 sentence — the
    // user-visible wording the ruling requires to remain unchanged.
    expect(req!.prompt).toBe(
      'How much volume? The prompt states none — 100 uL is assumed; approve it or enter the amount.',
    );
  });

  it('discloses the strip through the reconcile-notes channel (never silently)', () => {
    const r = demoteUnstatedQuantities(addMaterialDoc(true, 100), 'Add DMEM to A1');
    expect(r.notes.length).toBe(1);
    expect(r.notes[0]).toMatch(/add_material/);
    expect(r.notes[0]).toMatch(/volumeUl/);
  });

  it('stated-volume control: a volume the scientist actually stated is NEVER stripped (no chip)', () => {
    const stated = addMaterialDoc(true, 100);
    const r = demoteUnstatedQuantities(stated, 'Add 200 uL of DMEM to A1');
    // The 200 uL is in the words → the slot is STATED → no demotion.
    expect(r.demoted.length).toBe(0);
    // Same document (the no-op path — byte-identical, no copy).
    expect(r.doc).toBe(stated);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volumeUl' in action).toBe(true);
    // The sweep sees the stated volume and stays silent → no chip.
    expect(volumeUlFacts(r.doc).length).toBe(0);
  });

  it('a fresh ask with NO quantity slot is a no-op (the pre-fix behaviour, byte-identical)', () => {
    const fresh = addMaterialDoc(false);
    const r = demoteUnstatedQuantities(fresh, 'Add DMEM to A1');
    expect(r.demoted.length).toBe(0);
    expect(r.doc).toBe(fresh);
    expect(r.notes.length).toBe(0);
  });

  it('checks BOTH the slot and its declared satisfiedBy alias generically (data-driven)', () => {
    // A declared `satisfiedBy: [volume]` alias that the prompt did NOT state
    // must ALSO be demoted (the same shape the sweep's present-check reads —
    // zero TS field-name tables).
    const doc: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 't1-alias',
      actions: [{
        action: 'add_material',
        material: 'DMEM',
        targetWells: ['A1'],
        volume: { value: 100, unit: 'uL' },
      } as unknown as ScientistIntent['actions'][number]],
      unresolved: [],
    };
    const r = demoteUnstatedQuantities(doc, 'Add DMEM to A1');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.field).toBe('volume');
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volume' in action).toBe(false);
    expect(volumeUlFacts(r.doc).length).toBe(1);
  });

  it('keeps a stated alias-object volume (the satisfiedBy shape the sweep honors)', () => {
    const doc: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 't1-alias-stated',
      actions: [{
        action: 'add_material',
        material: 'DMEM',
        targetWells: ['A1'],
        volume: { value: 150, unit: 'uL' },
      } as unknown as ScientistIntent['actions'][number]],
      unresolved: [],
    };
    const r = demoteUnstatedQuantities(doc, 'Add 150 uL of DMEM to A1');
    expect(r.demoted.length).toBe(0);
    expect(r.doc).toBe(doc);
    expect(volumeUlFacts(r.doc).length).toBe(0);
  });
});

/**
 * cycle 7 unit 1 (browser-gate c6, defects 4+6) — the no-material mix leg.
 *
 * Gate evidence (receipts 2026-11-04_1405-c6-gate, q3-result.json paneTail):
 * the mix action named NO material (label = ''), so the demotion's
 * `label ? extractQuantity(...) : null` arm never asked the ONE extractor —
 * and the turn's OWN words stated BOTH quantities ("Mix 75 uL ... for
 * 3 cycles"), yet the server demoted BOTH ("carried 75" and "carried 3").
 * A STATED amount must never be demoted (R1.2). The no-label action is
 * adjudicated by the extractor's OWN no-anchor arm (reconcileDraftQuantities.ts
 * :112-113 — the first amount-with-unit in the turn's own words = stated),
 * and the extractor's ONE unit grammar (ONE-grammar law: it EXTENDS, never a
 * second grammar) must recognize "N cycles" as a stated count — the declared
 * `kind: quantity` contract for the mix `cycles` slot can otherwise never be
 * satisfied in prose.
 */
describe('demoteUnstatedQuantities — the no-material mix leg (cycle 7 unit 1, defects 4+6)', () => {
  // The gate's REAL mix face (shots/q3-mix-row.png): "Mix 75 uL ... for 3
  // cycles" — the action carries BOTH quantities and names NO material.
  // The mix verb's DECLARED quantity contracts are `volume` and `cycles`
  // (schema/scientist-intent/scientist-intent-vocabulary.yaml :91-96 — the
  // gate note's field "volume" carried 75; `volumeUl` is the add_material
  // slot, not a mix field).
  function mixDoc(volume: number, cycles?: number): ScientistIntent {
    const action: Record<string, unknown> = {
      action: 'mix',
      volume,
    };
    if (cycles !== undefined) action.cycles = cycles;
    return {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 't1-c7d1-mix',
      actions: [action as unknown as ScientistIntent['actions'][number]],
      unresolved: [],
    };
  }

  it('P-a: a material-less mix whose turn STATES both quantities strips NOTHING (no over-strip)', () => {
    const r = demoteUnstatedQuantities(mixDoc(75, 3), 'Mix 75 uL for 3 cycles');
    // Today (pre-fix) BOTH are stripped — the gate's raw notes:
    //   'Demoted unstated quantity: action "mix" argument "volume" ... carried 75'
    //   'Demoted unstated quantity: action "mix" argument "cycles" ... carried 3'
    expect(r.demoted.length).toBe(0);
    expect(r.notes.length).toBe(0);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volume' in action).toBe(true);
    expect('cycles' in action).toBe(true);
  });

  it('P-d1: the gate REAL face — well-addressed mix clause states both "75 uL" and "3 cycles" (D1)', () => {
    // Browser-gate cycle-1 defect D1: "Mix 75 uL in wells B1 and B2 for 3 cycles"
    // demoted cycles:3 because the tokenRe filler window ate the "2" from B2
    // as an amount. The filler must start with a letter, not a digit.
    const r = demoteUnstatedQuantities(mixDoc(75, 3), 'Mix 75 uL in wells B1 and B2 for 3 cycles');
    expect(r.demoted.length).toBe(0);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volume' in action).toBe(true);
    expect('cycles' in action).toBe(true);
  });

  it('P-b: a stated volume WITH a material label is still kept (control — the label-adjacency arm)', () => {
    const doc = addMaterialDoc(true, 150);
    const r = demoteUnstatedQuantities(doc, 'Add 150 uL of DMEM to A1');
    expect(r.demoted.length).toBe(0);
    expect(r.doc).toBe(doc);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volumeUl' in action).toBe(true);
    expect(volumeUlFacts(r.doc).length).toBe(0);
  });

  it('P-c: the ONE grammar recognizes "3 cycles" as a stated count (kind count, unit cycles)', () => {
    const q = extractQuantity('Mix 75 uL for 3 cycles', '');
    // The FIRST amount-with-unit in the turn (the no-anchor arm) is the
    // volume; the cycles count must ALSO be recognized by the same grammar.
    expect(q).toEqual({ value: 75, unit: 'uL', kind: 'volume' });
    const c = extractQuantity('Mix for 3 cycles', 'cycles');
    expect(c).toEqual({ value: 3, unit: 'cycles', kind: 'count' });
  });

  it('P-d: a material-less mix whose turn states NO amount is STILL demoted + disclosed (no 6/10 regression)', () => {
    const r = demoteUnstatedQuantities(mixDoc(75), 'Mix on the plate');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.action).toBe('mix');
    expect(r.demoted[0]!.argument).toBe('volume');
    expect(r.demoted[0]!.field).toBe('volume');
    expect(r.notes.length).toBe(1);
    expect(r.notes[0]).toMatch(/mix/);
    expect(r.notes[0]).toMatch(/volume/);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volume' in action).toBe(false);
    expect('cycles' in action).toBe(false); // the slot was ABSENT in the doc — untouched
  });
});

/**
 * cycle 7 unit 2 (advc-c7 D1 MAJOR) — the material-less OVER-KEEP guard.
 * Fix A (c7d1) over-corrected: for a material-less action the demote side
 * asked the ONE extractor over the WHOLE turn, whose no-anchor arm returns the
 * FIRST amount-with-unit ANYWHERE (kind-blind, association-blind), so an
 * UNRELATED action's amount or a wrong-KIND amount satisfied the slot.
 * Rule (advc (a)): stated only if the slot's DECLARED KIND appears in the
 * CLAUSE naming THIS action's verb. K1 = unrelated clause; K2 = wrong kind.
 */
describe('demoteUnstatedQuantities — the no-material over-KEEP guard (cycle 7 unit 2, D1)', () => {
  it('K1: an UNRELATED action\'s volume (different clause) must NOT keep this mix\'s invented volume', () => {
    // The mix names no material (label=''). The 200 uL belongs to the ADD action
    // (a different clause); the mix's own volume:50 was never stated → DEMOTED.
    const r = demoteUnstatedQuantities(mixDocSlots({ volume: 50 }), 'Add 200 uL of DMEM to A1, then mix');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.action).toBe('mix');
    expect(r.demoted[0]!.argument).toBe('volume');
    expect(r.notes.length).toBe(1);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volume' in action).toBe(false);
  });

  it('K2: a wrong-KIND amount (a volume) must NOT keep this mix\'s invented cycles (a count slot)', () => {
    // The mix names no material (label=''). The turn states only a VOLUME
    // (75 uL); the mix's cycles:3 is a COUNT slot never stated in a count → DEMOTED.
    const r = demoteUnstatedQuantities(mixDocSlots({ cycles: 3 }), 'Mix 75 uL');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.action).toBe('mix');
    expect(r.demoted[0]!.argument).toBe('cycles');
    expect(r.notes.length).toBe(1);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('cycles' in action).toBe(false);
  });
});

/**
 * cycle 9 unit 1 (advc-c8: D1 MAJOR over-STRIP e1/e2/e3, D2 MINOR
 * no-separator over-KEEP a2/a3/a6) — the material-less arm inverts to
 * DEFAULT-KEEP (ruling l2t1200 R1.2 "Never strip a volume the scientist
 * actually stated"): a material-less declared-quantity slot is STATED when
 * EITHER the clause rule holds (the clause naming THIS verb carries an
 * amount of the declared kind; clause boundary now extends to `then`/`and`
 * junctions) OR the VALUE-MATCH arm holds (the turn carries an
 * amount-with-unit of the declared KIND whose amount EQUALS the slot value —
 * the scientist's number is present in their own words).
 */
// A material-less mix doc carrying the given quantity slots (module scope,
// hoisted from the cycle 7 K1/K2 describe so BOTH describes can build docs;
// body unchanged from the cycle 7 helper).
function mixDocSlots(slots: Record<string, number>): ScientistIntent {
  const action: Record<string, unknown> = { action: 'mix', ...slots };
  return {
    kind: 'scientist-intent',
    version: '0.1.0',
    intentId: 't1-c7d2-mix',
    actions: [action as unknown as ScientistIntent['actions'][number]],
    unresolved: [],
  };
}

describe('demoteUnstatedQuantities — material-less DEFAULT-KEEP (cycle 9 unit 1, c8 D1/D2)', () => {
  it('e1: a PARAPHRASED stated volume (verb word differs from the clause verb) keeps the slot (no over-strip)', () => {
    const r = demoteUnstatedQuantities(mixDocSlots({ volume: 75 }), 'Combine 75 uL of buffer');
    expect(r.demoted.length).toBe(0);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect(action['volume']).toBe(75);
  });

  it('e2: a stated volume in a SIBLING sentence keeps the slot (no over-strip)', () => {
    const r = demoteUnstatedQuantities(mixDocSlots({ volume: 75 }), 'Mix the plate. Add 75 uL.');
    expect(r.demoted.length).toBe(0);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect(action['volume']).toBe(75);
  });

  it('e3: a stated COUNT in a differently-worded turn keeps the slot (no over-strip)', () => {
    const r = demoteUnstatedQuantities(mixDocSlots({ cycles: 3 }), 'Vortex for 3 cycles');
    expect(r.demoted.length).toBe(0);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect(action['cycles']).toBe(3);
  });

  it('a2: an UNRELATED volume with NO clause separator still demotes (over-KEEP guard, then-split)', () => {
    const r = demoteUnstatedQuantities(mixDocSlots({ volume: 50 }), 'Add 200 uL of DMEM to A1 then mix');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.action).toBe('mix');
    expect(r.demoted[0]!.argument).toBe('volume');
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volume' in action).toBe(false);
  });

  it('a3: an UNRELATED volume joined only by a NEWLINE still demotes (over-KEEP guard, sentence split)', () => {
    const r = demoteUnstatedQuantities(mixDocSlots({ volume: 50 }), 'Add 200 uL of DMEM to A1\nmix');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.action).toBe('mix');
    expect(r.demoted[0]!.argument).toBe('volume');
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volume' in action).toBe(false);
  });

  it('a6: an UNRELATED volume joined by `and` still demotes (over-KEEP guard, and-split)', () => {
    const r = demoteUnstatedQuantities(mixDocSlots({ volume: 50 }), 'Add 200 uL of DMEM to A1 and mix');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.action).toBe('mix');
    expect(r.demoted[0]!.argument).toBe('volume');
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volume' in action).toBe(false);
  });
});

/**
 * cycle 11 (advc-c10 §9, both residuals pinned pre-existing at 80649c80):
 * over-KEEP of a number NOT in the turn is a defect (orchestrator
 * acceptance criterion). Two arms close it: (1) the clause splitter extends
 * to the c10 §4 probe shapes — case-insensitive `and`/`then` + `plus`/`to`
 * junctions, `&`, tab, and no-whitespace sentence punctuation; (2) the
 * material-less CLAUSE arm becomes value-DEPENDENT — a same-kind amount in
 * the verb's clause keeps the slot ONLY when its parsed value EQUALS the
 * slot value (the value-match restricted to the verb clause; the whole-turn
 * VALUE-MATCH arm already does the rest). P-1 = value-equal keep guard;
 * P-2 = the value-independent clause arm is dead; P-3 = each splitter
 * variant shape no longer over-KEeps an unrelated amount (RED at HEAD, all
 * demoted=0); P-4 = the K1/K2/P-a..P-d + cycle-9 e1/e2/e3/a2/a3/a6 pins
 * above pass UNEDITED (the matrix run, not a new assertion).
 */
/**
 * L2-PROMPT2-VOLUME-N1-MISREAD-1 — the N1 defect: the prompt states "1uL" but the
 * material label "1 mM Clofibrate in DMSO" (with space) doesn't match "1mM clofibrate
 * in DMSO" (no space) in the raw turn, so extractQuantity returns null. The fix
 * falls through to clauseStatesKind with slotValue: value-equality (1 === 1) keeps it.
 */
describe('N1: stated volume with label-adjacency miss (PROMPT2 re-gate)', () => {
  it('the prompt states 1uL — volumeUl:1 IS NOT demoted when value-equality confirms the match', () => {
    // Exact shape from the served revision: the model emitted volumeUl:1 (the
    // scientist's own value), the turn says "Add 1uL of 1mM clofibrate in DMSO
    // to wells E2-H5." The material label "1 mM Clofibrate in DMSO" (normalized,
    // with space) is NOT literally present in the turn ("1mM" has no space) →
    // extractQuantity returns null → fall through to clauseStatesKind with
    // slotValue (1 === 1) → STATED → keep.
    const doc: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 't1-n1',
      actions: [{
        action: 'add_material',
        material: '1 mM Clofibrate in DMSO',
        targetWells: ['E2','E3','E4','E5','F2','F3','F4','F5','G2','G3','G4','G5','H2','H3','H4','H5'],
        volumeUl: 1,
      } as unknown as ScientistIntent['actions'][number]],
      unresolved: [],
    };
    const r = demoteUnstatedQuantities(doc, 'Add 1uL of 1mM clofibrate in DMSO to wells E2-H5.');
    // The 1uL IS stated in the clause → NOT demoted.
    expect(r.demoted.length).toBe(0);
    expect(r.doc).toBe(doc);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volumeUl' in action).toBe(true);
    expect(action['volumeUl']).toBe(1);
    expect(volumeUlFacts(r.doc).length).toBe(0);
  });

  it('a genuinely unstated volume STILL demotes — the smuggled-100 guard holds', () => {
    // "Add DMEM to A1" states no volume → volumeUl:100 must still be demoted.
    const r = demoteUnstatedQuantities(addMaterialDoc(true, 100), 'Add DMEM to A1');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.argument).toBe('volumeUl');
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volumeUl' in action).toBe(false);
    expect(volumeUlFacts(r.doc).length).toBe(1);
  });

  it('over-keep guard — labelled near-miss: DMEM 50 uL vs "500 uL of water" is DEMOTED', () => {
    // The labelled path with value-equality: the doc carries volumeUl:50 for DMEM,
    // but the turn states "500 uL of water" (a different material, different value).
    // With value-equality: 50 !== 500 → DEMOTED.
    // Without value-equality (kind-only): any volume in clause → STATED → over-KEPT.
    const doc: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 't1-overkeep',
      actions: [{
        action: 'add_material',
        material: 'DMEM',
        targetWells: ['A1'],
        volumeUl: 50,
      } as unknown as ScientistIntent['actions'][number]],
      unresolved: [],
    };
    const r = demoteUnstatedQuantities(doc, 'Add 500 uL of water to A1');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.argument).toBe('volumeUl');
    expect(r.notes.length).toBe(1);
    expect(r.notes[0]).toMatch(/Demoted unstated quantity/);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volumeUl' in action).toBe(false);
    expect(volumeUlFacts(r.doc).length).toBe(1);
  });

  it('100-vs-stated-1 — volumeUl:100 vs "Add 1uL…" is DEMOTED with disclosed fact', () => {
    // The model smuggled 100 uL when the scientist stated 1 uL.
    // Value-equality: 100 !== 1 → DEMOTED with a disclosed assumed-value fact.
    const doc: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 't1-100vs1',
      actions: [{
        action: 'add_material',
        material: '1 mM Clofibrate in DMSO',
        targetWells: ['E2','E3','E4','E5','F2','F3','F4','F5','G2','G3','G4','G5','H2','H3','H4','H5'],
        volumeUl: 100,
      } as unknown as ScientistIntent['actions'][number]],
      unresolved: [],
    };
    const r = demoteUnstatedQuantities(doc, 'Add 1uL of 1mM clofibrate in DMSO to wells E2-H5.');
    expect(r.demoted.length).toBe(1);
    expect(r.demoted[0]!.argument).toBe('volumeUl');
    expect(r.demoted[0]!.value).toBe(100);
    expect(r.notes.length).toBe(1);
    expect(r.notes[0]).toMatch(/Demoted unstated quantity/);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect('volumeUl' in action).toBe(false);
    expect(volumeUlFacts(r.doc).length).toBe(1);
  });
});

describe('demoteUnstatedQuantities — splitter variants + value-dependent clause arm (cycle 11, c10 D1/D2)', () => {
  it('P-1: a slot value EQUAL to a same-kind clause amount KEEPS (value-equal clause arm; both kinds)', () => {
    const r = demoteUnstatedQuantities(mixDocSlots({ volume: 50 }), 'Mix 50 uL');
    expect(r.demoted.length).toBe(0);
    expect(r.notes.length).toBe(0);
    const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
    expect(action['volume']).toBe(50);
    const rc = demoteUnstatedQuantities(mixDocSlots({ cycles: 3 }), 'Mix for 3 cycles');
    expect(rc.demoted.length).toBe(0);
    expect((rc.doc.actions[0]! as unknown as Record<string, unknown>)['cycles']).toBe(3);
  });

  it('P-2: a slot value NOT equal to ANY amount in the turn is DEMOTED even when the verb clause carries a different same-kind amount (value-independent clause arm killed)', () => {
    // c10 §4 probe: "Mix 75 uL" kept volume:50 / 999 / 0.5 at HEAD.
    for (const v of [50, 999, 0.5]) {
      const r = demoteUnstatedQuantities(mixDocSlots({ volume: v }), 'Mix 75 uL');
      expect(r.demoted.length, `volume:${v}`).toBe(1);
      expect(r.demoted[0]!.action, `volume:${v}`).toBe('mix');
      expect(r.demoted[0]!.argument, `volume:${v}`).toBe('volume');
      const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
      expect('volume' in action, `volume:${v}`).toBe(false);
    }
  });

  it('P-3: each splitter variant shape (to/plus/& connectors, capital AND/Then, tab, no-whitespace sentence) no longer over-KEEPS an unrelated amount', () => {
    // c10 §4 probe table verbatim — slot volume:50 is NOT in any of these
    // turns; at HEAD each over-KEPT (demoted=0).
    const words = [
      'Add 200 uL of DMEM to A1 to mix',
      'Add 200 uL of DMEM to A1 plus mix',
      'Add 200 uL of DMEM to A1 & mix',
      'Add 200 uL of DMEM to A1.mix',
      'Add 200 uL of DMEM to A1 AND mix',
      'Add 200 uL of DMEM to A1 Then mix',
      'Add 200 uL of DMEM to A1\tmix',
    ];
    for (const w of words) {
      const r = demoteUnstatedQuantities(mixDocSlots({ volume: 50 }), w);
      expect(r.demoted.length, w).toBe(1);
      expect(r.demoted[0]!.action, w).toBe('mix');
      expect(r.demoted[0]!.argument, w).toBe('volume');
      const action = r.doc.actions[0]! as unknown as Record<string, unknown>;
      expect('volume' in action, w).toBe(false);
    }
  });
});
