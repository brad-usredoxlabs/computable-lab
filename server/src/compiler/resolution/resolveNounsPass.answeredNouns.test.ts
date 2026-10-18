/**
 * ANSWER-BIND-1 — data-bound clarification-answer slots BEFORE the resolve_nouns
 * bar (RED-first).
 *
 * Contract (spec §Contract): an answers-map entry whose value is the mention
 * idiom `[[<kind>:<id>|<label>]]` and whose <id> validated against the store
 * (handler-side) becomes an AUTHORITATIVE BoundNoun for every resolvable slot
 * whose raw label EQUALS the entry's key. The binding rides the SAME bindings
 * list the §5.1 join (boundKeys) and resolvedByLabel consume, so the
 * ambiguous-noun fact for that label is gone deterministically on the SAME
 * request's result — zero new drop-rule in reconcileModelUnresolved, zero
 * reason/verb/kind NAME literals (identity + declared contract data only).
 *
 * Pins (spec acceptance (a),(d),(e) + the required-sweep guarantee):
 *  1. baseline: >=2 in-band candidates bar with ambiguous-noun (the fact the
 *     data channel must clear);
 *  2. answered slot: the authoritative binding REPLACES the gathered set; the
 *     ambiguous fact for the label is GONE on this request (ok:true, no redraw);
 *  3. an engine binding for an answered slot is replaced (settled, do not re-ask);
 *  4. §5.1 join: a model hedge carrying the answered label is dropped by the
 *     EXISTING boundKeys machinery — reconcileModelUnresolved untouched;
 *  5. an answer for a label no slot carries changes NOTHING (full output
 *     deep-equality against the no-answers run);
 *  6. the declared-required sweep still fires for genuinely missing slots while
 *     other slots are answered;
 *  7. a required-sweep fact is NEVER dropped even when its slot key is answered
 *     (the spec's `missing-required-argument` exclusion, pinned generically).
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import type { ScientistIntent } from '../scientistIntent/types.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import {
  createResolveNounsPass,
  MISSING_REQUIRED_ARGUMENT_REASON,
  RESOLVE_NOUNS_PASS_ID,
  UNRESOLVED_ARGUMENTS_CODE,
  type AnsweredNounAnswer,
  type ResolveNounsOutput,
} from './resolveNounsPass.js';
import type { EngineDeps, EngineOutcome } from './types.js';
import type { PassRunArgs } from '../pipeline/types.js';

const shippedVocab = () => loadScientistIntentVocabulary();

/** A spine whose hits are keyed by the queried label (the resolveNounsPass.test.ts
 *  idiom). 'microcentrifuge tube' carries TWO tier-1 hits -> ambiguous-noun. */
function spineReturning(bindings: Record<string, Array<[string, string]>>) {
  return createResolveSpine({
    termProvider: async (term) =>
      (bindings[term] ?? []).map(([curie, label]) => ({
        curie,
        label,
        namespace: 'local' as const,
        level: 'unknown' as const,
      })),
  });
}

const emptyRunArgs: PassRunArgs = {
  pass_id: RESOLVE_NOUNS_PASS_ID,
  state: { input: {}, context: {}, meta: {}, outputs: new Map(), diagnostics: [] },
};

function intentOf(actions: ScientistIntent['actions'], unresolved: ScientistIntent['unresolved'] = []): ScientistIntent {
  return {
    kind: 'scientist-intent',
    version: '0.1.0',
    intentId: 'answer-bind-1',
    actions,
    unresolved,
  };
}

/** The gate-shaped fixture: bead_beat.labware is a declared resolvable slot
 *  (vocabulary DATA); two in-band store candidates make it ambiguous-noun. */
const AMBIGUOUS_LABEL = 'microcentrifuge tube';
const ambiguousSpine = () => spineReturning({
  [AMBIGUOUS_LABEL]: [
    ['local:LAB-mct-ont', 'Ontology microcentrifuge tube'],
    ['local:LAB-mct-seed', 'Microcentrifuge tube'],
  ],
});
const ambiguousIntent = (unresolved: ScientistIntent['unresolved'] = []) =>
  intentOf([{ action: 'bead_beat', labware: AMBIGUOUS_LABEL, cycles: 3 }], unresolved);
const chosenAnswer: AnsweredNounAnswer = {
  label: AMBIGUOUS_LABEL,
  recordId: 'LAB-mct-seed',
  recordLabel: 'Microcentrifuge tube',
};

describe('answer-bind-1.answered-slot-binding (resolve_nouns data channel)', () => {
  it('baseline pin: two in-band candidates bar with ambiguous-noun (the fact the data channel must clear)', async () => {
    const result = await createResolveNounsPass({
      intent: ambiguousIntent(),
      vocabulary: shippedVocab(),
      spine: ambiguousSpine(),
    }).run(emptyRunArgs);

    expect(result.ok).toBe(false);
    const output = result.output as ResolveNounsOutput;
    expect(output.blocked).toBe(true);
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.label).toBe(AMBIGUOUS_LABEL);
    expect(output.clarifications[0]!.reason).toBe('ambiguous-noun');
    expect(output.clarifications[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: 'bead_beat',
      argument: 'labware',
    });
  });

  it('answered slot: the validated answer becomes an AUTHORITATIVE binding; the ambiguous fact for the label is GONE on the same request (no redraw)', async () => {
    const result = await createResolveNounsPass({
      intent: ambiguousIntent(),
      vocabulary: shippedVocab(),
      spine: ambiguousSpine(),
      answeredSlots: [chosenAnswer],
    }).run(emptyRunArgs);

    expect(result.ok).toBe(true);
    const output = result.output as ResolveNounsOutput;
    expect(output.blocked).toBe(false);
    expect(output.clarifications).toEqual([]);

    // The gathered set is REPLACED by the scientist's chosen record.
    expect(output.bindings).toHaveLength(1);
    const binding = output.bindings[0]!;
    expect(binding).toMatchObject({
      verb: 'bead_beat',
      argument: 'labware',
      label: AMBIGUOUS_LABEL,
      curie: 'local:LAB-mct-seed',
      resolvedLabel: 'Microcentrifuge tube',
      tier: 1,
      confidence: 1,
      source: 'scientist-answer',
      actionIndex: 0,
    });

    // resolvedByLabel sees a normal tier-1 binding for free (downstream seam).
    expect(output.resolvedByLabel[AMBIGUOUS_LABEL]).toMatchObject({
      recordId: 'LAB-mct-seed',
      resolvedLabel: 'Microcentrifuge tube',
      verb: 'bead_beat',
      argument: 'labware',
      actionIndex: 0,
    });
  });

  it("an engine binding for an answered slot is REPLACED by the scientist's answer (settled, do not re-ask)", async () => {
    // The spine would have bound a DIFFERENT record (single in-band winner).
    const spine = spineReturning({ [AMBIGUOUS_LABEL]: [['local:LAB-engine-pick', 'Ontology microcentrifuge tube']] });
    const result = await createResolveNounsPass({
      intent: ambiguousIntent(),
      vocabulary: shippedVocab(),
      spine,
      answeredSlots: [chosenAnswer],
    }).run(emptyRunArgs);

    const output = result.output as ResolveNounsOutput;
    expect(output.bindings).toHaveLength(1);
    expect(output.bindings[0]!.curie).toBe('local:LAB-mct-seed');
    expect(output.resolvedByLabel[AMBIGUOUS_LABEL]!.recordId).toBe('LAB-mct-seed');
  });

  it('§5.1 join pin: a model hedge carrying the answered label is dropped by the EXISTING boundKeys machinery (reconcileModelUnresolved rules unchanged)', async () => {
    const hedge = [{ label: AMBIGUOUS_LABEL, reason: 'model was unsure about the tube' }];

    // Control: without the data channel the hedge survives (KEEP arm) beside the
    // engine's ambiguous-noun fact.
    const control = await createResolveNounsPass({
      intent: ambiguousIntent(hedge),
      vocabulary: shippedVocab(),
      spine: ambiguousSpine(),
    }).run(emptyRunArgs);
    const controlOut = control.output as ResolveNounsOutput;
    expect(controlOut.clarifications.some((c) => c.reason === 'ambiguous-noun')).toBe(true);
    expect(controlOut.clarifications.some((c) => c.reason === 'model was unsure about the tube')).toBe(true);

    // With the data channel: the binding occupies slot:<i>:<arg> AND
    // label:<label> (the §5.1 machinery verbatim) — the hedge is dropped with
    // ZERO new drop-rule.
    const answered = await createResolveNounsPass({
      intent: ambiguousIntent(hedge),
      vocabulary: shippedVocab(),
      spine: ambiguousSpine(),
      answeredSlots: [chosenAnswer],
    }).run(emptyRunArgs);
    const answeredOut = answered.output as ResolveNounsOutput;
    expect(answered.ok).toBe(true);
    expect(answeredOut.clarifications).toEqual([]);
  });

  it('an answer for a label NO slot carries changes nothing (full output deep-equal, not a subset)', async () => {
    const baseline = await createResolveNounsPass({
      intent: ambiguousIntent(),
      vocabulary: shippedVocab(),
      spine: ambiguousSpine(),
    }).run(emptyRunArgs);
    const unmatched = await createResolveNounsPass({
      intent: ambiguousIntent(),
      vocabulary: shippedVocab(),
      spine: ambiguousSpine(),
      answeredSlots: [{ label: 'a label no slot carries', recordId: 'LAB-mct-seed', recordLabel: 'Microcentrifuge tube' }],
    }).run(emptyRunArgs);

    expect(JSON.stringify(unmatched.output)).toBe(JSON.stringify(baseline.output));
    expect(JSON.stringify(unmatched.diagnostics)).toBe(JSON.stringify(baseline.diagnostics));
  });

  it('the declared-required sweep still fires for genuinely missing slots while other slots are answered', async () => {
    // aliquot.targetWells is declared required (kind wells) in the SHIPPED data.
    const result = await createResolveNounsPass({
      intent: intentOf([{ action: 'aliquot', source: 'reagent bottle', target: 'deep plate', volumeUl: 50 }]),
      vocabulary: shippedVocab(),
      spine: spineReturning({
        'reagent bottle': [['local:LAB-rb', 'Reagent bottle']],
        'deep plate': [['local:LAB-dp', 'Deep plate']],
      }),
      answeredSlots: [{ label: 'reagent bottle', recordId: 'LAB-rb', recordLabel: 'Reagent bottle' }],
    }).run(emptyRunArgs);

    expect(result.ok).toBe(false);
    const output = result.output as ResolveNounsOutput;
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.reason).toBe(MISSING_REQUIRED_ARGUMENT_REASON);
    expect(output.clarifications[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: 'aliquot',
      argument: 'targetWells',
    });
    // The answered slot bound authoritatively (counts as present).
    expect(output.resolvedByLabel['reagent bottle']!.recordId).toBe('LAB-rb');
  });

  it('a required-sweep fact is NEVER dropped even when its slot key is answered (spec exclusion, pinned via a stub engine)', async () => {
    const stubEngine = async (): Promise<EngineOutcome> => ({
      bindings: [],
      clarifications: [{
        label: AMBIGUOUS_LABEL,
        reason: MISSING_REQUIRED_ARGUMENT_REASON,
        actionLocation: { actionIndex: 0, action: 'bead_beat', argument: 'labware' },
      }],
      failures: [],
      traces: [],
    });
    const result = await createResolveNounsPass({
      intent: ambiguousIntent(),
      vocabulary: shippedVocab(),
      spine: ambiguousSpine(),
      resolve: stubEngine,
      answeredSlots: [chosenAnswer],
    }).run(emptyRunArgs);

    expect(result.ok).toBe(false);
    const output = result.output as ResolveNounsOutput;
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.reason).toBe(MISSING_REQUIRED_ARGUMENT_REASON);
    // The authoritative binding still lands (the slot is settled even though a
    // sweep fact on the same key survives).
    expect(output.bindings[0]!.curie).toBe('local:LAB-mct-seed');
    expect(result.diagnostics![0]!.code).toBe(UNRESOLVED_ARGUMENTS_CODE);
  });

  it('zero answeredSlots: the pass output is byte-unchanged vs today (every other caller untouched)', async () => {
    const withEmpty = await createResolveNounsPass({
      intent: ambiguousIntent(),
      vocabulary: shippedVocab(),
      spine: ambiguousSpine(),
      answeredSlots: [],
    }).run(emptyRunArgs);
    const without = await createResolveNounsPass({
      intent: ambiguousIntent(),
      vocabulary: shippedVocab(),
      spine: ambiguousSpine(),
    }).run(emptyRunArgs);
    expect(JSON.stringify(withEmpty.output)).toBe(JSON.stringify(without.output));
  });
});
