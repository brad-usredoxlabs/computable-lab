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
