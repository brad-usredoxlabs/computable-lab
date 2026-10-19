/**
 * W28-STAGHEDGE-1 (W28-A5m §Q2 option (b)) — the MODEL-HEDGE LABEL-DIVERGENCE
 * consume rule in the resolve_nouns pass. RED-first.
 *
 * Contract (ruling W28-A5m, spec W28-STAGHEDGE-1): a MODEL-side unresolved fact
 * (one arriving via `intent.unresolved` into reconcileModelUnresolved — never an
 * engine clarification, never the §5.2 sweep fact, never a gated survivor) is
 * MOOT — dropped BEFORE reconcile/blocked — exactly when all four guards hold,
 * each read as data/identity, never as a domain name:
 *   (1) the fact carries slot identity (actionIndex + string argument — same
 *       guard shape as the PARAM-FOLD's guard 1 / SH-QA-1's gate);
 *   (2) its actionLocation slot is a declared `kind: resolvable` arg-contract
 *       of its verb (the same read as answeredSlotBindings — scalar cards stay
 *       untouched: no mint-floor, no gate-widening);
 *   (3) the fact carries the stable NOT_STATED_REASON code (ambiguous /
 *       contradicts-the-text stay kept, same as fold guard 5);
 *   (4) deps.answeredSlots contains an entry whose KEY EQUALS the fact's label
 *       (exact-label identity, never containment — the same discipline as the
 *       value-join in answeredSlotBindings).
 * The consume DROPS THE QUESTION ONLY: the slot keeps its raw value; the
 * value-join and answeredSlotBindings stay byte-unchanged for everything they
 * already settle — NO binding is invented for a label-divergent slot.
 *
 * ZERO domain literals: every verb and argument name is READ FROM the shipped
 * vocabulary data (argContracts entries), never written here. The hedge label
 * is prose from the captured probe log (the model's own hedge word), not a
 * vocabulary name.
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import type { ScientistIntent, ScientistIntentUnresolvedFact } from '../scientistIntent/types.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import {
  createResolveNounsPass,
  MISSING_REQUIRED_ARGUMENT_REASON,
  NOT_STATED_REASON,
  RESOLVE_NOUNS_PASS_ID,
  UNRESOLVED_ARGUMENTS_CODE,
  type AnsweredNounAnswer,
  type ResolveNounsOutput,
} from './resolveNounsPass.js';
import { resolveScientistIntentNouns } from './resolutionEngine.js';
import type { EngineOutcome } from './types.js';
import type { PassRunArgs } from '../pipeline/types.js';

const vocab = loadScientistIntentVocabulary();

/** The model's closed-set not-stated reason (the stable code the pass re-exports
 *  from the fold leaf — imported above, never re-declared here). */
const NOT_STATED = NOT_STATED_REASON;

/** The model's hedge word from the probe log (r5 arm B): a label the emitter
 *  chose freely, DIVERGENT from the slot's raw value. Prose, not a vocab name. */
const HEDGE_LABEL = 'variant b';
/** The slot value the model actually wrote (probe round-1 shape: the model
 *  wrote SOMETHING into the slot and separately hedged it). */
const DIVERGENT_VALUE = 'microcentrifuge tube';

/** First verb (declaration order) whose declared contract list is entirely
 *  optional AND carries at least two declared-optional RESOLVABLE args: the
 *  consume's clean stage — the §5.2 sweep can fire nothing, and the two
 *  resolvable slots host the label-collision case. */
const stageVerb = vocab.verbs().find((verb) => {
  const args = vocab.argContracts(verb);
  return (
    args.length > 0 &&
    args.every((a) => a.required !== true) &&
    args.filter((a) => a.kind === 'resolvable').length >= 2
  );
})!;
/** Two declared-optional RESOLVABLE argument NAMES read from the data. */
const resolvableArgs = vocab.argContracts(stageVerb).filter((a) => a.kind === 'resolvable');
const firstResolvable = resolvableArgs[0]!;
const secondResolvable = resolvableArgs[1]!;
/** A declared-optional SCALAR arg (the probe's duration class SH3 pins as
 *  KEPT) — READ from the data, never a name literal. */
const scalarArg = vocab.argContracts(stageVerb).find((a) => a.kind === 'scalar')!;
/** First verb (declaration order) with a declared-REQUIRED argument — the
 *  sweep's stage for the never-consumed pin (SH7). */
const requiredVerb = vocab.verbs().find((verb) =>
  vocab.argContracts(verb).some((a) => a.required === true),
)!;
const requiredArg = vocab.argContracts(requiredVerb).find((a) => a.required === true)!;

function hedge(
  argument: string,
  action: string,
  actionIndex: number,
  reason: string = NOT_STATED,
  label: string = HEDGE_LABEL,
): ScientistIntentUnresolvedFact {
  return {
    label,
    reason,
    actionLocation: {
      actionIndex,
      action: action as ScientistIntent['actions'][number]['action'],
      argument,
    },
  };
}

function intentOf(
  actions: ScientistIntent['actions'],
  unresolved: ScientistIntent['unresolved'] = [],
): ScientistIntent {
  return {
    kind: 'scientist-intent',
    version: '0.1.0',
    intentId: 'staghedge-1',
    actions,
    unresolved,
  };
}

/** The store-validated answer the handler would deliver for a card labelled
 *  HEDGE_LABEL (ANSWER-BIND-1 shape: label = the answers-map KEY). */
const hedgeAnswer: AnsweredNounAnswer = {
  label: HEDGE_LABEL,
  recordId: 'LAB-staghedge-record',
  recordLabel: 'Chosen record',
};

/** Silent engine seam: the probe's stagnation precondition (ruling step 5) —
 *  for the label-divergent slot the engine produced NEITHER a binding NOR a
 *  clarification, so no existing drop arm can ever reach the model fact. */
const silentEngine = async (): Promise<EngineOutcome> => ({
  bindings: [],
  clarifications: [],
  failures: [],
  traces: [],
});

/** Ambiguous spine for DIVERGENT_VALUE: two in-band hits -> the real engine
 *  raises its OWN ambiguous-noun clarification for the slot (the engine-card
 *  arm SH7 pins as untouched). */
const ambiguousSpineForValue = () =>
  createResolveSpine({
    termProvider: async (term) =>
      term === DIVERGENT_VALUE
        ? [
            { curie: 'local:LAB-mct-ont', label: 'Ontology microcentrifuge tube', namespace: 'local' as const, level: 'unknown' as const },
            { curie: 'local:LAB-mct-seed', label: 'Microcentrifuge tube', namespace: 'local' as const, level: 'unknown' as const },
          ]
        : [],
  });

const emptyRunArgs: PassRunArgs = {
  pass_id: RESOLVE_NOUNS_PASS_ID,
  state: { input: {}, context: {}, meta: {}, outputs: new Map(), diagnostics: [] },
};

function runPass(
  intent: ScientistIntent,
  opts: {
    answeredSlots?: readonly AnsweredNounAnswer[];
    resolutionGatedClarifications?: readonly ScientistIntentUnresolvedFact[];
    spine?: ReturnType<typeof createResolveSpine>;
    resolve?: typeof silentEngine | typeof resolveScientistIntentNouns;
  } = {},
) {
  return createResolveNounsPass({
    intent,
    vocabulary: vocab,
    spine: opts.spine ?? createResolveSpine({ termProvider: async () => [] }),
    resolve: opts.resolve ?? silentEngine,
    ...(opts.answeredSlots ? { answeredSlots: opts.answeredSlots } : {}),
    ...(opts.resolutionGatedClarifications
      ? { resolutionGatedClarifications: opts.resolutionGatedClarifications }
      : {}),
  }).run(emptyRunArgs);
}

describe('staghedge-1.model-hedge label-divergence consume (resolve_nouns)', () => {
  it('SH1 RED pin (probe r5 arm B shape): a not-stated fact labelled HEDGE_LABEL at a resolvable slot whose raw value DIVERGES from the label, answered by a validated entry keyed HEDGE_LABEL, is CONSUMED — ok:true, zero clarifications, NO binding invented for the slot', async () => {
    const intent = intentOf(
      [{ action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number]],
      [hedge(firstResolvable.name, stageVerb, 0)],
    );

    const result = await runPass(intent, { answeredSlots: [hedgeAnswer] });
    const output = result.output as ResolveNounsOutput;

    // Today (RED): the fact re-bars — no drop arm covers a label-divergent
    // model fact (no binding, no engine twin at its key). After the fix:
    // consumed before reconcile/blocked.
    expect(result.ok).toBe(true);
    expect(output.blocked).toBe(false);
    expect(output.clarifications).toEqual([]);

    // The consume drops the QUESTION only: the value-join never saw the
    // answer (raw value != answer key), so NO binding is minted for the slot.
    expect(output.bindings).toEqual([]);
    expect(output.resolvedByLabel).toEqual({});
  });

  it('SH1 control: the same intent WITHOUT the validated answer still bars with the not-stated fact (the consume is answer-licensed, never unconditional)', async () => {
    const intent = intentOf(
      [{ action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number]],
      [hedge(firstResolvable.name, stageVerb, 0)],
    );

    const result = await runPass(intent);
    const output = result.output as ResolveNounsOutput;

    expect(result.ok).toBe(false);
    expect(output.blocked).toBe(true);
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.label).toBe(HEDGE_LABEL);
    expect(output.clarifications[0]!.reason).toBe(NOT_STATED);
    expect(result.diagnostics![0]!.code).toBe(UNRESOLVED_ARGUMENTS_CODE);
  });

  it('SH2 label collision (sub-class 2a): TWO not-stated facts share label HEDGE_LABEL at TWO resolvable slots; ONE validated answer keyed HEDGE_LABEL consumes BOTH (the scientist answered the MENTION)', async () => {
    const intent = intentOf(
      [
        { action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number],
        { action: stageVerb, [secondResolvable.name]: 'a different slot value' } as ScientistIntent['actions'][number],
      ],
      [
        hedge(firstResolvable.name, stageVerb, 0),
        hedge(secondResolvable.name, stageVerb, 1),
      ],
    );

    const result = await runPass(intent, { answeredSlots: [hedgeAnswer] });
    const output = result.output as ResolveNounsOutput;

    expect(result.ok).toBe(true);
    expect(output.blocked).toBe(false);
    expect(output.clarifications).toEqual([]);
    // Neither slot gets an invented binding (neither raw value equals the key).
    expect(output.bindings).toEqual([]);
  });

  it('SH3 negative guard (2): label matches an answer key but the slot contract kind is NOT resolvable (the scalar class) — fact KEPT (no mint-floor widening, scalar cards untouched)', async () => {
    const intent = intentOf(
      [{ action: stageVerb, [scalarArg.name]: '30 minutes' } as ScientistIntent['actions'][number]],
      [hedge(scalarArg.name, stageVerb, 0)],
    );

    const result = await runPass(intent, { answeredSlots: [hedgeAnswer] });
    const output = result.output as ResolveNounsOutput;

    expect(result.ok).toBe(false);
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.label).toBe(HEDGE_LABEL);
    expect(output.clarifications[0]!.actionLocation?.argument).toBe(scalarArg.name);
    expect(output.blocked).toBe(true);
  });

  it('SH4 negative guard (3): a fact whose reason is NOT the not-stated code (an ambiguous-class hedge) with a matching label key and no binding — KEPT (ambiguous stays answerable/visible)', async () => {
    const intent = intentOf(
      [{ action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number]],
      [hedge(firstResolvable.name, stageVerb, 0, 'ambiguous')],
    );

    const result = await runPass(intent, { answeredSlots: [hedgeAnswer] });
    const output = result.output as ResolveNounsOutput;

    expect(result.ok).toBe(false);
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.reason).toBe('ambiguous');
    expect(output.blocked).toBe(true);
  });

  it('SH5 negative guard (4): the label is NOT among deps.answeredSlots (an unvalidated mention never reaches the pass) — fact KEPT', async () => {
    const intent = intentOf(
      [{ action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number]],
      [hedge(firstResolvable.name, stageVerb, 0)],
    );

    const result = await runPass(intent, {
      answeredSlots: [{ label: 'some other answered mention', recordId: 'LAB-other', recordLabel: 'Other record' }],
    });
    const output = result.output as ResolveNounsOutput;

    expect(result.ok).toBe(false);
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.label).toBe(HEDGE_LABEL);
    expect(output.blocked).toBe(true);
  });

  it('SH9 negative guard (4) exact-equality discipline: an answered key that is a PROPER SUBSTRING of the fact label at the SAME declared-resolvable slot SH1 drops — fact KEPT (exact-label identity, never containment; a containment join recreates the A5d V6 drift class)', async () => {
    // The answers map carries 'variant' — a proper substring of the fact's
    // label HEDGE_LABEL ('variant b') — at the very slot SH1's drop case
    // uses. Guard (4) is an EXACT-key equality: a partial mention is NOT an
    // answer for this mention, so the card stays visible. A bidirectional
    // containment join (fact.label.includes(a.label) || a.label.includes(
    // fact.label)) would consume the fact here — this case pins the
    // discipline the source states (resolveNounsPass.ts guard (4) comment,
    // 'exact-label identity, never containment — the same join discipline as
    // the value-join').
    const partialAnswer: AnsweredNounAnswer = {
      label: 'variant',
      recordId: 'LAB-staghedge-partial',
      recordLabel: 'Partial mention record',
    };
    const intent = intentOf(
      [{ action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number]],
      [hedge(firstResolvable.name, stageVerb, 0)],
    );

    const result = await runPass(intent, { answeredSlots: [partialAnswer] });
    const output = result.output as ResolveNounsOutput;

    expect(result.ok).toBe(false);
    expect(output.blocked).toBe(true);
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.label).toBe(HEDGE_LABEL);
    expect(output.clarifications[0]!.reason).toBe(NOT_STATED);
    expect(output.clarifications[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: stageVerb,
      argument: firstResolvable.name,
    });
    // The containment join would ALSO have minted nothing here — the failure
    // it catches is the consumed QUESTION, pinned by the assertions above.
    expect(output.bindings).toEqual([]);
  });

  it('SH10 negative guard (4) mirror: an answered key that is a PROPER SUPERSTRING of the fact label at the SAME declared-resolvable slot SH1 drops — fact KEPT (exact-label identity, never containment; pins the a.label.includes(fact.label) join arm SH9 leaves unpinned)', async () => {
    // Mirror of SH9: the answers map carries 'variant b extended' — a proper
    // SUPERSTRING of the fact's label HEDGE_LABEL ('variant b') — at the very
    // slot SH1's drop case uses. Guard (4) is an EXACT-key equality: an answer
    // keyed by a longer mention is NOT an answer for THIS mention, so the card
    // stays visible. The mirror containment arm a.label.includes(fact.label)
    // (cycle-2 defect: SH9 alone passes it) would consume the fact here — the
    // cycle-1 remediation named 'substring OR superstring'; this case pins the
    // superstring half of the discipline the source states (resolveNounsPass.ts
    // guard (4) comment, 'exact-label identity, never containment').
    const superstringAnswer: AnsweredNounAnswer = {
      label: `${HEDGE_LABEL} extended`,
      recordId: 'LAB-staghedge-superstring',
      recordLabel: 'Longer mention record',
    };
    const intent = intentOf(
      [{ action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number]],
      [hedge(firstResolvable.name, stageVerb, 0)],
    );

    const result = await runPass(intent, { answeredSlots: [superstringAnswer] });
    const output = result.output as ResolveNounsOutput;

    expect(result.ok).toBe(false);
    expect(output.blocked).toBe(true);
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.label).toBe(HEDGE_LABEL);
    expect(output.clarifications[0]!.reason).toBe(NOT_STATED);
    expect(output.clarifications[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: stageVerb,
      argument: firstResolvable.name,
    });
    // Same as SH9: the containment join would mint nothing here — the failure
    // it catches is the consumed QUESTION, pinned by the assertions above.
    expect(output.bindings).toEqual([]);
  });

  it('SH6 negative guard (1): a not-stated fact WITHOUT actionLocation is KEPT even when its label is answered (slot-less facts stay visible defects)', async () => {
    const slotless: ScientistIntentUnresolvedFact = { label: HEDGE_LABEL, reason: NOT_STATED };
    const intent = intentOf(
      [{ action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number]],
      [slotless],
    );

    const result = await runPass(intent, { answeredSlots: [hedgeAnswer] });
    const output = result.output as ResolveNounsOutput;

    expect(result.ok).toBe(false);
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.label).toBe(HEDGE_LABEL);
    expect(output.blocked).toBe(true);
  });

  it('SH7 pin: engine clarifications, the §5.2 sweep fact, and gated survivors ride UNTOUCHED (the consume reads only model facts)', async () => {
    // (a) Engine-untouched: the real engine raises its OWN ambiguous-noun
    // clarification for the divergent slot value (two in-band hits for the
    // raw VALUE). The model twin (label-divergent, answered) is consumed;
    // the ENGINE fact survives byte-identically — the consume never touches
    // engine output.
    const engineIntent = intentOf(
      [{ action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number]],
      [hedge(firstResolvable.name, stageVerb, 0)],
    );
    const engineRun = await runPass(engineIntent, {
      answeredSlots: [hedgeAnswer],
      spine: ambiguousSpineForValue(),
      resolve: resolveScientistIntentNouns,
    });
    const engineOut = engineRun.output as ResolveNounsOutput;
    expect(engineRun.ok).toBe(false);
    expect(engineOut.clarifications).toHaveLength(1);
    expect(engineOut.clarifications[0]!.reason).toBe('ambiguous-noun');
    expect(engineOut.clarifications[0]!.label).toBe(DIVERGENT_VALUE);
    expect(engineOut.clarifications[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: stageVerb,
      argument: firstResolvable.name,
    });

    // (b) Sweep-untouched: the §5.2 sweep fact on the declared-REQUIRED slot
    // (absent -> the vocabulary's own demand) survives even though the answer
    // map carries an entry keyed with the sweep fact's own label; the model
    // twin on the same key merges into it (existing reconcile behavior —
    // engine wins), so exactly ONE clarification rides: the sweep fact.
    const sweepIntent = intentOf(
      [{ action: requiredVerb } as ScientistIntent['actions'][number]],
      [hedge(requiredArg.name, requiredVerb, 0)],
    );
    const sweepRun = await runPass(sweepIntent, {
      answeredSlots: [{ label: requiredArg.name, recordId: 'LAB-required', recordLabel: 'Required record' }],
    });
    const sweepOut = sweepRun.output as ResolveNounsOutput;
    expect(sweepRun.ok).toBe(false);
    expect(sweepOut.clarifications).toHaveLength(1);
    expect(sweepOut.clarifications[0]!.reason).toBe(MISSING_REQUIRED_ARGUMENT_REASON);
    expect(sweepOut.clarifications[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: requiredVerb,
      argument: requiredArg.name,
    });

    // (c) Gated survivors: a gated producer fact carrying the answered label
    // at a resolvable slot is KEPT — the consume applies to model facts
    // (intent.unresolved) only, never to resolutionGatedClarifications.
    const gatedFact: ScientistIntentUnresolvedFact = hedge(firstResolvable.name, stageVerb, 0);
    const gatedRun = await runPass(
      intentOf(
        [{ action: stageVerb, [firstResolvable.name]: DIVERGENT_VALUE } as ScientistIntent['actions'][number]],
        [],
      ),
      { answeredSlots: [hedgeAnswer], resolutionGatedClarifications: [gatedFact] },
    );
    const gatedOut = gatedRun.output as ResolveNounsOutput;
    expect(gatedRun.ok).toBe(false);
    expect(gatedOut.clarifications).toHaveLength(1);
    expect(gatedOut.clarifications[0]!.label).toBe(HEDGE_LABEL);
  });

  it('SH8 regression pin: the value-join arm is byte-unchanged — an answer whose KEY EQUALS the slot value still binds authoritatively and the model twin is dropped exactly as before', async () => {
    // Same stage action, but the answer key EQUALS the raw slot value (the
    // value-join arm). The authoritative binding lands; the model twin
    // carrying the answered label is dropped (boundKeys machinery — and the
    // consume agrees it is moot), and the slot's binding shape is unchanged.
    const intent = intentOf(
      [{ action: stageVerb, [firstResolvable.name]: HEDGE_LABEL } as ScientistIntent['actions'][number]],
      [hedge(firstResolvable.name, stageVerb, 0)],
    );

    const result = await runPass(intent, { answeredSlots: [hedgeAnswer] });
    const output = result.output as ResolveNounsOutput;

    expect(result.ok).toBe(true);
    expect(output.blocked).toBe(false);
    expect(output.clarifications).toEqual([]);
    expect(output.bindings).toHaveLength(1);
    const binding = output.bindings[0]!;
    expect(binding).toMatchObject({
      verb: stageVerb,
      argument: firstResolvable.name,
      label: HEDGE_LABEL,
      curie: 'local:LAB-staghedge-record',
      resolvedLabel: 'Chosen record',
      tier: 1,
      confidence: 1,
      source: 'scientist-answer',
      actionIndex: 0,
    });
    expect(output.resolvedByLabel[HEDGE_LABEL]).toMatchObject({
      recordId: 'LAB-staghedge-record',
      verb: stageVerb,
      argument: firstResolvable.name,
      actionIndex: 0,
    });
  });
});
