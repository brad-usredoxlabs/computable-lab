/**
 * PARAM-FOLD-1 (W28-A5j) — the declared-optional-absence fold in the
 * resolve_nouns pass. RED-first.
 *
 * Contract (decision W28-A5j, spec PARAM-FOLD-1): a MODEL-side unresolved fact
 * is MOOT — dropped before the bar — exactly when all five guards hold, each
 * read as data/identity: (1) slot identity (actionIndex + string argument),
 * (2) the fact's own actionLocation joins a declared arg contract of its verb
 * (no contract -> KEEP), (3) the contract declares the absence legal
 * (required !== true), (4) the argument is ABSENT in the parsed action
 * (a PRESENT hedge stays answerable), (5) the fact carries the stable
 * not-stated reason code. Folded facts never enter `clarifications` and
 * therefore never count toward `blocked`. Engine clarifications and gated
 * survivors ride UNTOUCHED by construction (the fold reads only the model's
 * own facts against the declared contract data + the parsed action).
 *
 * ZERO domain literals: the verb and every argument name are READ FROM the
 * shipped vocabulary data (argContracts entries), never written here. The
 * probe-shaped label is prose from the captured gate log, not a vocabulary
 * name.
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import type { ScientistIntent, ScientistIntentUnresolvedFact } from '../scientistIntent/types.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import {
  createResolveNounsPass,
  MISSING_REQUIRED_ARGUMENT_REASON,
  RESOLVE_NOUNS_PASS_ID,
  UNRESOLVED_ARGUMENTS_CODE,
  type ResolveNounsOutput,
} from './resolveNounsPass.js';
import type { EngineOutcome } from './types.js';
import type { PassRunArgs } from '../pipeline/types.js';

const vocab = loadScientistIntentVocabulary();

/** The model's closed-set not-stated reason (the code the fold pins as a
 *  stable constant product-side; written here as data for the RED phase). */
const NOT_STATED = 'not-stated';

/** First verb (declaration order) whose declared contract list is entirely
 *  optional AND carries at least three optional args: the fold's clean stage
 *  — the §5.2 sweep can fire nothing and the stubbed engine sees no values,
 *  so every clarification in the run is a model fact. */
const foldVerb = vocab.verbs().find((verb) => {
  const args = vocab.argContracts(verb);
  return args.length > 0 && args.every((a) => a.required !== true) && args.length >= 3;
})!;
const optionalArgs = vocab.argContracts(foldVerb);
/** Three optional argument NAMES read from the data (the probe's three
 *  hedged params, generalized: never literals). */
const foldArgs = optionalArgs.slice(0, 3);
/** A declared-optional RESOLVABLE arg (the SAMPLE-CARD-1 class) and a
 *  declared-optional non-resolvable arg (the probe's scalar/quantity class),
 *  both read from the data. */
const optionalResolvable = optionalArgs.find((a) => a.kind === 'resolvable')!;
const optionalPlain = optionalArgs.find((a) => a.kind !== 'resolvable')!;
/** First verb (declaration order) with a declared-REQUIRED argument — the
 *  sweep's stage for the never-folded engine-fact pin. */
const requiredVerb = vocab.verbs().find((verb) =>
  vocab.argContracts(verb).some((a) => a.required === true),
)!;
const requiredArg = vocab.argContracts(requiredVerb).find((a) => a.required === true)!;

const PROBE_LABEL = 'Lyse the sample (gate 2025)';

function hedge(
  argument: string,
  reason: string = NOT_STATED,
  action: string = foldVerb,
  actionIndex = 0,
): ScientistIntentUnresolvedFact {
  return {
    label: PROBE_LABEL,
    reason,
    actionLocation: { actionIndex, action: action as ScientistIntent['actions'][number]['action'], argument },
  };
}

function intentOf(
  actions: ScientistIntent['actions'],
  unresolved: ScientistIntentUnresolvedFact[] = [],
): ScientistIntent {
  return {
    kind: 'scientist-intent',
    version: '0.1.0',
    intentId: 'param-fold-1',
    actions,
    unresolved,
  };
}

/** Silent engine seam: the probe's reality for an ABSENT declared-optional
 *  param — no binding, no clarification (resolutionEngine.ts:326: the engine
 *  only ever touches resolvable/wells contracts and produces nothing for an
 *  absent param). */
const silentEngine = async (): Promise<EngineOutcome> => ({
  bindings: [],
  clarifications: [],
  failures: [],
  traces: [],
});

const emptyRunArgs: PassRunArgs = {
  pass_id: RESOLVE_NOUNS_PASS_ID,
  state: { input: {}, context: {}, meta: {}, outputs: new Map(), diagnostics: [] },
};

function runPass(intent: ScientistIntent, resolutionGatedClarifications?: ScientistIntentUnresolvedFact[]) {
  return createResolveNounsPass({
    intent,
    vocabulary: vocab,
    spine: createResolveSpine({ termProvider: async () => [] }),
    resolve: silentEngine,
    ...(resolutionGatedClarifications ? { resolutionGatedClarifications } : {}),
  }).run(emptyRunArgs);
}

describe('param-fold-1.declared-optional-absence fold (resolve_nouns)', () => {
  it('V1 RED pin (probe shape): three not-stated hedges on three ABSENT declared-optional args of one action are folded — zero clarifications from them, blocked:false', async () => {
    const result = await runPass(
      intentOf([{ action: foldVerb }], foldArgs.map((a) => hedge(a.name))),
    );
    const output = result.output as ResolveNounsOutput;

    expect(output.clarifications).toEqual([]);
    expect(output.blocked).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('V2a KEEP guard (4): a not-stated hedge whose argument is PRESENT in the action is KEPT (the fold never hides a stated value)', async () => {
    const stated = optionalPlain;
    const action = { action: foldVerb, [stated.name]: 'a stated value' } as ScientistIntent['actions'][number];
    const result = await runPass(
      intentOf([action], [
        hedge(stated.name),
        ...foldArgs.filter((a) => a.name !== stated.name).map((a) => hedge(a.name)),
      ]),
    );
    const output = result.output as ResolveNounsOutput;

    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.reason).toBe(NOT_STATED);
    expect(output.clarifications[0]!.actionLocation?.argument).toBe(stated.name);
    expect(output.blocked).toBe(true);
  });

  it('V2b KEEP guard (5): reason ambiguous on an ABSENT declared-optional arg is KEPT (stated-but-uncommitted stays visible)', async () => {
    const result = await runPass(
      intentOf([{ action: foldVerb }], [hedge(foldArgs[0]!.name, 'ambiguous')]),
    );
    const output = result.output as ResolveNounsOutput;

    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.reason).toBe('ambiguous');
    expect(output.blocked).toBe(true);
  });

  it('V2c KEEP guard (1): a not-stated hedge WITHOUT actionLocation is KEPT (slot-less facts stay visible defects)', async () => {
    const slotless: ScientistIntentUnresolvedFact = { label: PROBE_LABEL, reason: NOT_STATED };
    const result = await runPass(intentOf([{ action: foldVerb }], [slotless]));
    const output = result.output as ResolveNounsOutput;

    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.reason).toBe(NOT_STATED);
    expect(output.blocked).toBe(true);
  });

  it('V2d KEEP guard (2): an actionLocation naming an argument NOT in the verb\'s declared contracts is KEPT (the data cannot speak for it)', async () => {
    const result = await runPass(
      intentOf([{ action: foldVerb }], [hedge('undeclaredArgumentName')]),
    );
    const output = result.output as ResolveNounsOutput;

    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.reason).toBe(NOT_STATED);
    expect(output.blocked).toBe(true);
  });

  it('V2e NEVER-folded: the declared-required sweep fact survives the fold untouched (the vocabulary\'s own demand bars)', async () => {
    const result = await runPass(
      intentOf([{ action: requiredVerb }], [hedge(requiredArg.name, NOT_STATED, requiredVerb)]),
    );
    const output = result.output as ResolveNounsOutput;

    const sweepFacts = output.clarifications.filter((c) => c.reason === MISSING_REQUIRED_ARGUMENT_REASON);
    expect(sweepFacts).toHaveLength(1);
    expect(sweepFacts[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: requiredVerb,
      argument: requiredArg.name,
    });
    // The model hedge on the REQUIRED arg is NEVER folded (guard 3): at the
    // pass level it meets the sweep fact on the same §5.1 key and MERGES
    // into it (existing reconcile behavior — engine wins), so exactly ONE
    // clarification rides: the sweep fact.
    expect(output.clarifications).toHaveLength(1);
    expect(output.blocked).toBe(true);
    expect(result.diagnostics![0]!.code).toBe(UNRESOLVED_ARGUMENTS_CODE);

    // Guard (3) pinned cleanly: a not-stated hedge on a REQUIRED argument
    // that IS PRESENT in the action (no sweep fact to merge with) is KEPT —
    // the fold never touches a required contract, present or absent.
    const presentAction = {
      action: requiredVerb,
      [requiredArg.name]: 'a stated value',
    } as ScientistIntent['actions'][number];
    const present = await runPass(
      intentOf([presentAction], [hedge(requiredArg.name, NOT_STATED, requiredVerb)]),
    );
    const presentOut = present.output as ResolveNounsOutput;
    expect(presentOut.clarifications).toHaveLength(1);
    expect(presentOut.clarifications[0]!.reason).toBe(NOT_STATED);
    expect(presentOut.blocked).toBe(true);
  });

  it('V2f two-class separation: an ABSENT declared-optional RESOLVABLE hedge is FOLDED; a PRESENT declared-optional resolvable (the SAMPLE-CARD-1 class) is KEPT', async () => {
    // Absent resolvable -> folded (unanswerable-by-construction, like the
    // scalar case: answeredSlotBindings can never bind a non-string raw).
    const absent = await runPass(
      intentOf([{ action: foldVerb }], [hedge(optionalResolvable.name)]),
    );
    const absentOut = absent.output as ResolveNounsOutput;
    expect(absentOut.clarifications).toEqual([]);
    expect(absentOut.blocked).toBe(false);

    // Present resolvable with a hedge -> KEPT (answerable via the answer
    // channel; guard (4) separates the classes purely by data).
    const present = await runPass(
      intentOf(
        [{ action: foldVerb, [optionalResolvable.name]: PROBE_LABEL } as ScientistIntent['actions'][number]],
        [hedge(optionalResolvable.name)],
      ),
    );
    const presentOut = present.output as ResolveNounsOutput;
    expect(presentOut.clarifications).toHaveLength(1);
    expect(presentOut.clarifications[0]!.actionLocation?.argument).toBe(optionalResolvable.name);
    expect(presentOut.blocked).toBe(true);
  });

  it('V3 characterization: an engine clarification and a gated survivor ride the pass byte-identically with the fold installed (order kept, folded facts absent)', async () => {
    const engineFact: ScientistIntentUnresolvedFact = {
      label: PROBE_LABEL,
      reason: 'ambiguous-noun',
      actionLocation: { actionIndex: 0, action: foldVerb as ScientistIntent['actions'][number]['action'], argument: optionalResolvable.name },
    };
    const gatedFact: ScientistIntentUnresolvedFact = {
      label: 'gated blob survivor',
      reason: NOT_STATED,
      actionLocation: { actionIndex: 0, action: foldVerb as ScientistIntent['actions'][number]['action'], argument: 'undeclaredArgumentName' },
    };
    // Foldable = hedges on ABSENT declared-optional args only (the one
    // resolvable arg is PRESENT on this action — guard (4) keeps its hedge,
    // which is the SAMPLE-CARD-1 class this characterization must NOT fold).
    const foldable = foldArgs
      .filter((a) => a.name !== optionalResolvable.name)
      .map((a) => hedge(a.name));

    const result = await createResolveNounsPass({
      intent: intentOf([{ action: foldVerb, [optionalResolvable.name]: PROBE_LABEL } as ScientistIntent['actions'][number]], foldable),
      vocabulary: vocab,
      spine: createResolveSpine({ termProvider: async () => [] }),
      resolve: async (): Promise<EngineOutcome> => ({
        bindings: [],
        clarifications: [engineFact],
        failures: [],
        traces: [],
      }),
      resolutionGatedClarifications: [gatedFact],
    }).run(emptyRunArgs);
    const output = result.output as ResolveNounsOutput;

    // Engine fact first (verbatim), gated survivor last (the pinned
    // end-of-list position); the foldable model facts are GONE.
    expect(output.clarifications).toEqual([engineFact, gatedFact]);
    expect(output.blocked).toBe(true);
  });
});
