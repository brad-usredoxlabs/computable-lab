/**
 * ANSWER-FOLD-NULL-1 — the fold-null ARM diagnostic (Leg 1) + the canonical
 * 5-card RED->GREEN lock (Leg 2).
 *
 * The defect (architect basis decisions/REVISEGHOST1-gate-f1-answerfold-decision.md):
 * the canonical 5-card hold (4x ambiguous-noun on the composition component
 * labels + 1x unknown-noun on the mixture label) NEVER folds — every 5/5
 * answer submit logs 'no 1:1 mapping' and re-extracts. Which of the fold's
 * null arms fires was UNMEASURED; Leg 1 adds the pure mirror `foldNullArm`
 * (shorthandChat.ts) so the caller can name the arm.
 *
 * The canonical fixture is the in-trunk discriminator capture
 * (.hermes/plans/REVISE-GHOST-1-discriminator-artifact.md, trace tm5izs): the
 * shorthand document `seed-hepg2-32wells` whose action[0].composition is an
 * ARRAY of declared entries (scientist-intent.schema.yaml COMP-4) plus the
 * five engine facts with their actionLocations (4x argument:'composition',
 * 1x argument:'material'). Fixture strings live ONLY in this test (repo
 * rip-out rule — no reagent nouns in src/ product code).
 */
import { describe, expect, it } from 'vitest';
import {
  factRequestId,
  foldAnswersIntoShorthand,
  foldNullArm,
  parseShorthandForChat,
  type HeldShorthandIntent,
} from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

/** The discriminator artifact's shorthand document VERBATIM (SSE done frame,
 *  `shorthand` field): the array-valued composition slot is the shape under
 *  test — doc.actions[0].composition is an ARRAY of entry-objects, not a
 *  string. */
const CANONICAL_YAML = `intentId: seed-hepg2-32wells
actions:
  - action: add_material
    labware: "seeding plate"
    material: "Trypsin-EDTA/DMEM/FBS mix"
    targetWells: [A1:D8]
    composition:
      - material: "Trypsin-EDTA"
        role: additive
        fraction: "50%"
      - material: "DMEM"
        role: buffer_component
        fraction: "50%"
      - material: "FBS"
        role: additive
        fraction: "10%"
      - material: "HepG2 cells"
        role: cells
        counterDensity:
          value: 200
          unit: "cells/uL"
`;

/** The five held facts from the discriminator capture (labels + reasons +
 *  actionLocations VERBATIM; candidates omitted — the fold never reads them). */
const CANONICAL_FACTS: ScientistIntentUnresolvedFact[] = [
  { label: 'Trypsin-EDTA/DMEM/FBS mix', reason: 'unknown-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' } },
  { label: 'Trypsin-EDTA', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'DMEM', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'FBS', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'HepG2 cells', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
];

function canonicalHeld(): HeldShorthandIntent {
  return {
    yaml: CANONICAL_YAML,
    doc: parseShorthandForChat(CANONICAL_YAML),
    clarifications: CANONICAL_FACTS,
  };
}

/** 5/5 answers, one per held card, keyed by the SH-QA-1 content join id. */
function canonicalAnswers(chosenLabels?: Record<string, string>) {
  return CANONICAL_FACTS.map((fact) => ({
    requestId: factRequestId(fact),
    label: chosenLabels?.[fact.label] ?? fact.label,
  }));
}

describe('ANSWER-FOLD-NULL-1 — foldNullArm: the pure mirror of the fold null arms', () => {
  it('arm table: no-answers / join-miss / empty-label / no-action-location / slot-not-string / ajv-reparse-fail map 1:1 to the fold exits', () => {
    const held = canonicalHeld();
    const compositionFact = CANONICAL_FACTS[1]!;

    // 'no-answers' (fold :582)
    expect(foldNullArm(held, [])).toEqual({ arm: 'no-answers', requestId: '' });

    // 'join-miss' (fold :604-615): content-key miss AND legacy-digit miss
    expect(foldNullArm(held, [{ requestId: 'unresolved-c-deadbeef00', label: 'Whatever' }]))
      .toEqual({ arm: 'join-miss', requestId: 'unresolved-c-deadbeef00' });

    // 'empty-label' (fold :616-619)
    expect(foldNullArm(held, [{ requestId: factRequestId(compositionFact), label: '  ' }]))
      .toEqual({ arm: 'empty-label', requestId: factRequestId(compositionFact) });

    // 'no-action-location' (fold :620-621): a fact without actionLocation
    const noLocFact: ScientistIntentUnresolvedFact = { label: 'orphan fact', reason: 'x' };
    const heldNoLoc: HeldShorthandIntent = { ...held, clarifications: [noLocFact] };
    expect(foldNullArm(heldNoLoc, [{ requestId: factRequestId(noLocFact), label: 'ok label' }]))
      .toEqual({ arm: 'no-action-location', requestId: factRequestId(noLocFact) });

    // 'slot-not-string' (fold :622-623 widened by Leg 2): an array slot whose
    // entries carry NONE of the fact's label — nothing to splice (never
    // guess). This is the composition-fraction-sum card shape: its label
    // names the whole composition, not one entry.
    const wholeCompositionFact: ScientistIntentUnresolvedFact = { label: 'Trypsin-EDTA, DMEM, FBS', reason: 'composition-fraction-sum', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } };
    const heldWhole: HeldShorthandIntent = { ...held, clarifications: [wholeCompositionFact] };
    const wholeAnswers = [{ requestId: factRequestId(wholeCompositionFact), label: 'whole-mixture-supplement' }];
    const report = foldNullArm(heldWhole, wholeAnswers);
    expect(report).not.toBeNull();
    expect(report!.arm).toBe('slot-not-string');
    expect(report!.requestId).toBe(factRequestId(wholeCompositionFact));
    expect(report!.argument).toBe('composition');
    expect(report!.slotType).toBe('array');
    // Fold-vs-mirror parity on the same input.
    expect(foldAnswersIntoShorthand(heldWhole, wholeAnswers)).toBeNull();

    // 'ajv-reparse-fail' (fold :653-663): a held doc whose folded
    // re-serialization cannot pass Ajv (the DEFECT-4 shape — a bogus
    // unresolved entry the lift preserves verbatim). Isolated on a STRING-slot
    // document so the per-answer guards all pass and the reparse arm is the
    // first arm that fires (on the canonical array-slot doc the
    // 'slot-not-string' arm fires first — correct mirror ordering).
    const stringYaml = `intentId: fold-null-arms-ajv
actions:
  - action: add_material
    labware: "mystery plate"
    material: "mystery goop"
    volumeUl: 50
    targetWells: [A1]
`;
    const stringFacts: ScientistIntentUnresolvedFact[] = [
      { label: 'mystery goop', reason: 'unknown-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' } },
    ];
    const brokenDoc = parseShorthandForChat(stringYaml);
    brokenDoc.unresolved.push({ label: 'other thing', reason: 'x', bogusField: 'not-a-schema-field' } as never);
    const heldBroken: HeldShorthandIntent = { yaml: stringYaml, doc: brokenDoc, clarifications: stringFacts };
    const answers = stringFacts.map((f) => ({ requestId: factRequestId(f), label: 'chosen goop' }));
    expect(foldNullArm(heldBroken, answers)).toEqual({ arm: 'ajv-reparse-fail', requestId: '' });
    // Fold-vs-mirror parity on the same input: the fold is null for the same arm.
    expect(foldAnswersIntoShorthand(heldBroken, answers)).toBeNull();
  });

  it('the mirror reports null when no arm fires (the fold would not be null) — string-slot answers all map 1:1', () => {
    // A string-slot document: every answer maps 1:1, so no arm fires.
    const yaml = `intentId: fold-null-arms-string-slot
actions:
  - action: add_material
    labware: "mystery plate"
    material: "mystery goop"
    volumeUl: 50
    targetWells: [A1]
`;
    const facts: ScientistIntentUnresolvedFact[] = [
      { label: 'mystery goop', reason: 'unknown-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' } },
      { label: 'mystery plate', reason: 'unknown-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'labware' } },
    ];
    const held: HeldShorthandIntent = { yaml, doc: parseShorthandForChat(yaml), clarifications: facts };
    const answers = facts.map((f) => ({ requestId: factRequestId(f), label: `chosen ${f.label}` }));
    expect(foldNullArm(held, answers)).toBeNull();
    // Mirror-vs-fold parity on the same input: no arm ⇒ the fold is NOT null.
    expect(foldAnswersIntoShorthand(held, answers)).not.toBeNull();
  });
});

describe('ANSWER-FOLD-NULL-1 — the canonical 5-card hold (RED->GREEN lock)', () => {
  it('canonical 5-card characterization: the array composition slot is what the fold guard reads', () => {
    const held = canonicalHeld();
    const action0 = held.doc.actions[0] as unknown as Record<string, unknown>;
    expect(Array.isArray(action0.composition)).toBe(true);
    expect((action0.composition as unknown[]).length).toBe(4);
  });

  it('canonical 5-card fold converges deterministically: per-entry splice, bindings recorded, folded doc re-parses (RED pre-fix: null)', () => {
    const held = canonicalHeld();
    const answers = canonicalAnswers({
      'Trypsin-EDTA': 'Trypsin-EDTA Thermo',
      'DMEM': 'DMEM Corning',
      'FBS': 'FBS Heat-Inactivated',
      'HepG2 cells': 'HepG2 Cell Suspension',
      'Trypsin-EDTA/DMEM/FBS mix': 'Complete Seeding Mix',
    });

    // RED today: the fold returns null on the array slot. GREEN after the fix:
    // the fold splices the matching ENTRY of the array slot per answer.
    const folded = foldAnswersIntoShorthand(held, answers);
    expect(folded).not.toBeNull();

    // Per-entry splice: each composition entry's symbolic noun replaced by
    // the CHOSEN label (symbolic nouns ride the doc — never a record id; the
    // spine re-binds in the recompile).
    const composition = (folded!.doc.actions[0] as unknown as Record<string, unknown>).composition as Array<Record<string, unknown>>;
    expect(composition.map((e) => e.material)).toEqual([
      'Trypsin-EDTA Thermo',
      'DMEM Corning',
      'FBS Heat-Inactivated',
      'HepG2 Cell Suspension',
    ]);
    // The mixture (string) slot splices as before.
    expect((folded!.doc.actions[0] as unknown as Record<string, unknown>).material).toBe('Complete Seeding Mix');
    // Every entry keeps its declared role/fraction (the splice touches the
    // symbolic noun only — the folded doc still parses as scientist-intent).
    expect(composition.map((e) => e.role)).toEqual(['additive', 'buffer_component', 'additive', 'cells']);

    // The ledger records every closed slot (four composition entries + the
    // material slot).
    expect(folded!.answeredSlots).toEqual([
      { actionIndex: 0, argument: 'material', label: 'Complete Seeding Mix' },
      { actionIndex: 0, argument: 'composition', label: 'Trypsin-EDTA Thermo' },
      { actionIndex: 0, argument: 'composition', label: 'DMEM Corning' },
      { actionIndex: 0, argument: 'composition', label: 'FBS Heat-Inactivated' },
      { actionIndex: 0, argument: 'composition', label: 'HepG2 Cell Suspension' },
    ]);

    // The folded document re-parsed through the Ajv door (parseShorthandForChat
    // ran inside the fold — the returned doc IS the re-parse).
    expect(folded!.doc.intentId).toBe('seed-hepg2-32wells');
    expect(folded!.yaml).toMatch('Trypsin-EDTA Thermo');

    // The mirror agrees: with the fix in place, no arm fires on the canonical
    // 5/5 answer set.
    expect(foldNullArm(held, answers)).toBeNull();
  });

  it('never guess: a fact whose label matches NO composition entry keeps the fold null (arm slot-not-string, array tag)', () => {
    // The composition-fraction-sum card shape (measured live 2026-10-23): the
    // label names the WHOLE composition; no entry carries it. The fold must
    // refuse (null), not guess which entry the answer meant.
    const wholeCompositionFact: ScientistIntentUnresolvedFact = { label: 'Trypsin-EDTA, DMEM, FBS', reason: 'composition-fraction-sum', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } };
    const held: HeldShorthandIntent = {
      yaml: CANONICAL_YAML,
      doc: parseShorthandForChat(CANONICAL_YAML),
      clarifications: [...CANONICAL_FACTS, wholeCompositionFact],
    };
    const answers = [
      ...canonicalAnswers(),
      { requestId: factRequestId(wholeCompositionFact), label: 'whole-mixture-supplement' },
    ];
    expect(foldAnswersIntoShorthand(held, answers)).toBeNull();
    expect(foldNullArm(held, answers)?.arm).toBe('slot-not-string');
  });
});
