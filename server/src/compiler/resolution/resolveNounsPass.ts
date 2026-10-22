/**
 * SPINE-4 — the `resolve_nouns` pass: SPINE-3's resolution engine registered
 * as ONE declared pipeline pass (family 'disambiguate'), plus the model/engine
 * reconciliation and the atomic compilation bar.
 *
 * Contract (SPINE-4 spec §3/§4/§5):
 * - "Provides" = the output slot `resolve_nouns` = { bindings, resolvedByLabel,
 *   clarifications, failures, blocked }. `resolvedByLabel` is the consumption
 *   seam downstream stages read instead of re-interpreting hints.
 * - "Requires" = `depends_on: [ai_precompile]` in scientist-intent-compile.yaml
 *   (the engine consumes the PARSED document + normalized symbols, not events).
 * - blocked = ANY argument still unresolved after reconciliation (engine
 *   clarifications + the declared-required sweep + model items the engine never
 *   touched). A blocked pass returns ok:false with ONE error diagnostic
 *   ('unresolved_arguments'); the runner's cascade barrier then skips every
 *   downstream stage without calling run() (PipelineRunner.ts:272-293).
 * - NO write-capable dependency of any kind: the pass reads the parsed doc,
 *   the vocabulary, and injected READ-ONLY lookups only.
 *
 * Hard boundary (inherited engine law): this module switches on NOTHING but
 * identity + engine output + declared contract fields. No verb, class, or
 * domain NAME appears here — reason codes, slot ids, and the pass id are the
 * only string literals with comparison roles.
 */
import type { ScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import type {
  ScientistIntent,
  ScientistIntentActionLocation,
  ScientistIntentUnresolvedFact,
} from '../scientistIntent/types.js';
import type { TermLike } from '../../materials/termReconciliation.js';
import {
  createLabwareHintAdapter,
  createRoleAddressAdapter,
  createSpineAdapter,
  type EngineSpineLike,
  type LabwareHintMatch,
} from './adapters.js';
import { resolveScientistIntentNouns } from './resolutionEngine.js';
import { buildStrategyRegistry } from './strategies.js';
// PARAM-FOLD-2 (W28-A5k): the declared-optional-absence fold lives in a LEAF
// module so the SAME rule serves the pass AND normalizeScientistIntent (the
// raw gaps source). The leaf imports nothing from this module — acyclic.
import { foldDeclaredOptionalAbsentHedges } from './declaredOptionalHedgeFold.js';
// STAGHEDGE-1 (W28-A5m §Q2 (b)): the consume guard (3) reads the SAME stable
// not-stated code the fold leaf declares — imported, never re-declared.
import { NOT_STATED_REASON } from './declaredOptionalHedgeFold.js';
// Re-export both names unchanged: every existing importer/test of
// `foldDeclaredOptionalAbsentHedges` / `NOT_STATED_REASON` from
// './resolveNounsPass.js' resolves through here, byte-unchanged (the pin that
// the extract is a MOVE, not a rewrite).
export {
  foldDeclaredOptionalAbsentHedges,
  NOT_STATED_REASON,
} from './declaredOptionalHedgeFold.js';
import type { BoundNoun, EngineDeps, EngineFailure, EngineOutcome } from './types.js';
import { loadMaterialEligibilityIfPresent, type MaterialEligibilityPolicy } from './eligibility/policy.js';
import type { MaterialLevel } from '../../resolve/types.js';
import type { Pass, PassDiagnostic, PassResult } from '../pipeline/types.js';

export const RESOLVE_NOUNS_PASS_ID = 'resolve_nouns' as const;
/** Bar diagnostic code (pass identity, not domain policy). */
export const UNRESOLVED_ARGUMENTS_CODE = 'unresolved_arguments' as const;
/** Stable reason code for the declared-required sweep (§5.2). */
export const MISSING_REQUIRED_ARGUMENT_REASON = 'missing-required-argument' as const;

/** The engine door, injectable so tests can stub engine output (§6). */
export type ResolveNounsEngine = (
  intent: ScientistIntent,
  vocabulary: ScientistIntentVocabulary,
  deps: EngineDeps,
) => Promise<EngineOutcome>;

/** One ANSWER-BIND-1 validated clarification answer (handler-validated: the
 *  `[[<kind>:<id>|<label>]]` idiom parsed and <id> confirmed present in the
 *  store). The pass consumes it as DATA — it knows nothing about kinds,
 *  reasons, or verbs; the answers map's presence licenses the binding. */
export interface AnsweredNounAnswer {
  /** The answers-map KEY — the clarification's own label (exact-match target
   *  against the parsed intent's raw slot values). */
  label: string;
  /** The record identity validated against the store (id-hint arrays and
   *  mention ids ride the recordId verbatim). */
  recordId: string;
  /** The record's own title/label from the store (resolvedLabel evidence). */
  recordLabel: string;
}

export interface ResolveNounsPassDeps {
  /** The PARSED scientist-intent document (SPINE-1 frozen contract). */
  intent: ScientistIntent;
  vocabulary: ScientistIntentVocabulary;
  /** READ-ONLY candidate spine for the spine adapter (tier 0/1 identity). */
  spine: EngineSpineLike;
  /** READ-ONLY labware lookup for the labware-hint adapter (hint evidence). */
  searchLabwareByHint?: (hint: string) => Promise<readonly LabwareHintMatch[]>;
  /** READ-ONLY term list for near-miss clarification evidence (§5.4). */
  termsForSuggestions?: () => Promise<readonly TermLike[]>;
  /** Engine override (tests); defaults to SPINE-3's resolveScientistIntentNouns. */
  resolve?: ResolveNounsEngine;
  /** MATRES-ELIG (spec §9): the eligibility policy document. Absent ⇒ the pass
   *  loads the shipped triplet PER call (loadMaterialEligibilityIfPresent —
   *  never process-cached). Explicit null ⇒ the disclosed off-state (the
   *  engine's pre-ELIG arms stay inert). A fixture-loaded instance is the
   *  mutation-proof injection route. */
  eligibility?: MaterialEligibilityPolicy | null;
  /** SH-QA-1 (OQ1 ruling): producer facts whose fate depends on resolution —
   *  the pass drops a fact iff the engine BINDS its slot (the same identity
   *  join §5.1 applies to model hedges) and appends the survivors AFTER
   *  engine+required+model facts (the position the compile-side append used
   *  to produce, pinning golden order). The reason code is the producer's
   *  channel selector; the pass switches on IDENTITY only. */
  resolutionGatedClarifications?: readonly ScientistIntentUnresolvedFact[];
  /** ANSWER-BIND-1 (W28-A5h Q2): the scientist's VALIDATED clarification
   *  answers (the handler parsed the `[[<kind>:<id>|<label>]]` idiom and
   *  confirmed <id> in the store — a nonexistent id never reaches this list).
   *  Each entry licenses an AUTHORITATIVE binding for every resolvable slot
   *  whose raw label EQUALS the entry's key (exact-label identity, never a
   *  containment join): the binding REPLACES the engine's gathered set for
   *  that slot ("settled, do not re-ask") and rides the SAME bindings list
   *  the §5.1 boundKeys join and resolvedByLabel consume — zero new drop
   *  rule. Absent/empty: the pass is byte-unchanged for every other caller. */
  answeredSlots?: readonly AnsweredNounAnswer[];
}

/** One authoritative binding flattened for the consumption seams. */
export interface ResolvedNounBinding {
  verb: string;
  argument: string;
  label: string;
  /** Record identity from the binding CURIE ('local:<id>' unwrapped). */
  recordId: string;
  resolvedLabel?: string;
  /** Concrete well addresses for 'wells'-contract bindings. */
  addresses?: string[];
  actionIndex?: number;
}

/** The `resolve_nouns` output slot shape (§3). */
export interface ResolveNounsOutput {
  bindings: BoundNoun[];
  /** label -> authoritative binding (the seam downstream consumes). */
  resolvedByLabel: Record<string, ResolvedNounBinding>;
  clarifications: ScientistIntentUnresolvedFact[];
  failures: EngineFailure[];
  blocked: boolean;
}

// ---------------------------------------------------------------------------
// Identity keys (§5.1): actionIndex+argument when actionLocation carries both,
// label identity otherwise. Identity only — never a verb/class/domain NAME.
// ---------------------------------------------------------------------------

function identityKey(fact: {
  label: string;
  actionLocation?: ScientistIntentActionLocation;
  actionIndex?: number;
  argument?: string;
}): string {
  const actionIndex = fact.actionLocation?.actionIndex ?? fact.actionIndex;
  const argument = fact.actionLocation?.argument ?? fact.argument;
  if (actionIndex !== undefined && argument !== undefined) {
    return `slot:${actionIndex}:${argument}`;
  }
  return `label:${fact.label}`;
}

/**
 * Unwrap the spine's local CURIE convention ('local:<recordId>') into the
 * record identity the consumption seams carry. Generic CURIE plumbing — the
 * prefix is the spine's own declared format (providers/records.ts, terms.ts),
 * not a local invention.
 */
function recordIdFromCurie(curie: string): string {
  const prefix = 'local:';
  return curie.startsWith(prefix) ? curie.slice(prefix.length) : curie;
}

// ---------------------------------------------------------------------------
// §5.1 reconciliation — the SMALLEST GENERIC CODE LOCATION for the cross-
// document join (the lint DSL cannot compose a per-item cross-reference join;
// SPINE-3 §7 documents the same gap). Switches on identity + engine output +
// declared contract fields ONLY.
// ---------------------------------------------------------------------------

export function reconcileModelUnresolved(
  modelUnresolved: readonly ScientistIntentUnresolvedFact[],
  engineClarifications: readonly ScientistIntentUnresolvedFact[],
  bindings: readonly BoundNoun[],
): ScientistIntentUnresolvedFact[] {
  // A binding occupies BOTH identities of the slot it bound: the
  // actionIndex+argument slot key AND the label key (§5.1: "actionIndex+argument
  // identity when actionLocation present; label identity otherwise"). A model
  // item is keyed by its OWN shape, so it meets the binding on whichever
  // identity it carries.
  const boundKeys = new Set<string>();
  for (const b of bindings) {
    boundKeys.add(identityKey(b));
    boundKeys.add(`label:${b.label}`);
  }
  const engineByKey = new Map(engineClarifications.map((c) => [identityKey(c), c]));

  // Engine clarifications win verbatim (SPINE-1 frozen shape).
  const merged: ScientistIntentUnresolvedFact[] = engineClarifications.map((c) => ({ ...c }));

  for (const item of modelUnresolved) {
    const key = identityKey(item);

    // DROP: the engine produced an authoritative binding for this slot — the
    // vocabulary's arg-contract + policy data justified the bind; the model's
    // hedge is superseded.
    if (boundKeys.has(key)) continue;

    const engineFact = engineByKey.get(key);
    if (engineFact) {
      // MERGE: engine clarification wins; model candidates survive as evidence
      // ONLY when their label already appears in the engine candidate set
      // (provenance preserved, NEVER minted — SPINE-3 §5.4: hints are
      // evidence, never canonical identity). Corroborated labels are already
      // carried by the engine fact; uncorroborated model candidates are
      // dropped.
      //
      // D3 note (adversarial fix1, spec §5.1 wording): the merge is
      // LABEL-SET-EQUIVALENT BY CONSTRUCTION. A model candidate whose label
      // corroborates the engine's candidate set is already present in
      // engineFact.candidates (the engine fact carries the full candidate
      // set verbatim), so appending it would duplicate a label the fact
      // already carries; the only delta a model could add for an overlapping
      // label is its own confidence, and §5.1's "engine clarification wins"
      // makes the engine's value authoritative. Hence the merge arm keeps the
      // engine fact untouched — the observable label SET is identical to an
      // append-and-dedupe implementation; only a superseded model confidence
      // is discarded, which "engine wins" authorises.
      continue;
    }

    // KEEP: the model names a slot the engine never saw — it bars exactly like
    // an engine clarification.
    merged.push({ ...item });
  }

  return merged;
}

// ---------------------------------------------------------------------------
// §5.2 declarative required-argument sweep — loops over argContracts(verb)
// entries; NO `if (verb === ...)` anywhere. A declared-required argument of a
// noun/quantity kind (anything but 'scalar') that is absent or blank becomes a
// clarification with the stable reason code and a filled actionLocation.
// ---------------------------------------------------------------------------

function argumentPresent(raw: unknown): boolean {
  if (typeof raw === 'string') return raw.trim().length > 0;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'number') return Number.isFinite(raw);
  return false;
}

export function requiredArgumentClarifications(
  intent: ScientistIntent,
  vocabulary: ScientistIntentVocabulary,
): ScientistIntentUnresolvedFact[] {
  const out: ScientistIntentUnresolvedFact[] = [];
  intent.actions.forEach((action, index) => {
    const fields = action as unknown as Record<string, unknown>;
    for (const contract of vocabulary.argContracts(action.action)) {
      // 'scalar' args are neither nouns nor quantities — the declared KIND
      // field decides eligibility (data), never a per-verb table.
      if (contract.kind === 'scalar') continue;
      if (contract.required !== true) continue;
      if (argumentPresent(fields[contract.name])) continue;
      out.push({
        label: contract.name,
        reason: MISSING_REQUIRED_ARGUMENT_REASON,
        actionLocation: {
          actionIndex: index,
          action: action.action,
          argument: contract.name,
        },
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// ANSWER-BIND-1 — the clarification-answer DATA channel: generic slot matching
// against the PARSED intent + the authoritative bindings. The matcher is the
// DECLARED contract list (argContracts(verb), declared kind 'resolvable') and
// an EXACT-label identity join against the answers-map key — never a
// containment join (a containment join recreates the A5d V6 drift class).
// Zero verb/argument/kind NAME literals: everything rides the declared data.
// ---------------------------------------------------------------------------

interface AnsweredSlotBinding {
  /** The §5.1 slot identity this answer settles. */
  slotKey: string;
  binding: BoundNoun;
}

/** Scan the parsed intent for resolvable slots whose raw label EQUALS an
 *  answered key; each match becomes an authoritative tier-1 binding riding
 *  the store-validated recordId (the spine's own `local:<recordId>` CURIE
 *  convention, providers/records.ts). Several actions carrying the same label
 *  are ALL answered — the scientist answered the mention. */
function answeredSlotBindings(
  intent: ScientistIntent,
  vocabulary: ScientistIntentVocabulary,
  answers: readonly AnsweredNounAnswer[],
): AnsweredSlotBinding[] {
  const out: AnsweredSlotBinding[] = [];
  if (answers.length === 0) return out;
  const answerByKey = new Map(answers.map((a) => [a.label, a]));
  intent.actions.forEach((action, index) => {
    const fields = action as unknown as Record<string, unknown>;
    for (const contract of vocabulary.argContracts(action.action)) {
      // The declared KIND field decides eligibility (data), never a name table.
      if (contract.kind !== 'resolvable') continue;
      const raw = fields[contract.name];
      // Scalar slot values only (the door's scalar arm): a raw string equal to
      // the answered KEY — exact-label identity, never containment.
      if (typeof raw !== 'string') continue;
      const answer = answerByKey.get(raw.trim());
      if (!answer) continue;
      out.push({
        slotKey: `slot:${index}:${contract.name}`,
        binding: {
          verb: action.action,
          argument: contract.name,
          label: answer.label,
          curie: `local:${answer.recordId}`,
          resolvedLabel: answer.recordLabel,
          tier: 1,
          confidence: 1,
          source: 'scientist-answer',
          actionIndex: index,
        },
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// PARAM-FOLD-1 (W28-A5j) — the declared-optional-absence fold. MOVED (verbatim)
// to ./declaredOptionalHedgeFold.ts in PARAM-FOLD-2 (W28-A5k) so the SAME rule
// serves this pass AND normalizeScientistIntent (the raw gaps source); both
// names re-exported from here unchanged (see the import block above). The
// guards 1-5 (slot identity, contract join, required !== true, argument ABSENT,
// stable NOT_STATED_REASON code) live in the leaf module. Engine clarifications
// and gated survivors remain UNTOUCHED by construction: the fold reads only the
// model's own facts against the declared contract data + the parsed action.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// STAGHEDGE-1 (W28-A5m §Q2 option (b)) — the MODEL-HEDGE LABEL-DIVERGENCE
// consume. A model-side not-stated fact whose label DIVERGES from its slot's
// raw value can never bind via the value-join above (`answerByKey.get(raw)`
// needs raw == answer key), so no binding exists, boundKeys never covers its
// identityKey, and every existing drop arm misses it — the card re-emits every
// round (probe r5 arm B stagnation). The fact-level consume mirrors the
// PARAM-FOLD's guard discipline: a MODEL fact is MOOT — dropped before
// reconcile/blocked — exactly when all four guards hold, each read as
// data/identity, never as a domain name:
//   (1) the fact carries slot identity (same guard shape as the fold's guard 1
//       / SH-QA-1's gate);
//   (2) its actionLocation slot is a declared `kind: resolvable` contract of
//       its verb (the SAME read as answeredSlotBindings above — scalar cards
//       stay untouched: no mint-floor, no gate-widening);
//   (3) the fact carries the stable NOT_STATED_REASON code (ambiguous /
//       contradicts-the-text stay kept, same as fold guard 5);
//   (4) an answered entry's KEY EQUALS the fact's label (exact-label identity,
//       never containment — the same join discipline as the value-join, the
//       document side trimmed exactly like the raw slot value is there).
// The consume DROPS THE QUESTION ONLY: the slot keeps its raw value for the
// ENGINE to resolve normally; NO binding is minted here, and the value-join /
// answeredSlotBindings stay byte-unchanged for everything they already settle.
// One label-answered mention consumes EVERY fact carrying that label at a
// resolvable slot — the ':293-295 the scientist answered the MENTION'
// generalization, already this file's own comment (sub-class 2a defused).
// Engine clarifications, the §5.2 sweep, and gated survivors are UNTOUCHED by
// construction: this reads only the model's own facts against the declared
// contract data + the validated answers list.
// ---------------------------------------------------------------------------

export function consumeAnsweredLabelHedges(
  vocabulary: ScientistIntentVocabulary,
  modelFacts: readonly ScientistIntentUnresolvedFact[],
  answers: readonly AnsweredNounAnswer[],
): readonly ScientistIntentUnresolvedFact[] {
  if (answers.length === 0) return modelFacts;
  const answeredByKey = new Map(answers.map((a) => [a.label, a]));
  return modelFacts.filter((fact) => {
    const loc = fact.actionLocation;
    // Guard (1): slot identity, or KEEP.
    if (loc?.actionIndex === undefined || typeof loc.argument !== 'string') return true;
    // Guard (2): the declared contract list of the fact's OWN verb location;
    // no contract, or a contract whose declared kind is not the resolvable
    // kind (the same discriminator answeredSlotBindings reads), -> KEEP.
    const verb = loc.action;
    if (typeof verb !== 'string') return true;
    const contract = vocabulary.argContracts(verb).find((c) => c.name === loc.argument);
    if (!contract || contract.kind !== 'resolvable') return true;
    // Guard (3): a stable not-stated reason code, or KEEP.
    if (fact.reason !== NOT_STATED_REASON) return true;
    // Guard (4): the scientist answered THIS mention (a store-validated entry
    // keyed exactly by the fact's label), or KEEP.
    if (!answeredByKey.has(fact.label.trim())) return true;
    // All four: the question is moot. CONSUME — the QUESTION only.
    return false;
  });
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

export function createResolveNounsPass(deps: ResolveNounsPassDeps): Pass {
  const resolve = deps.resolve ?? resolveScientistIntentNouns;

  return {
    id: RESOLVE_NOUNS_PASS_ID,
    family: 'disambiguate' as const,
    async run(): Promise<PassResult> {
      const tracker = { failed: false };
      const adapters = [
        createSpineAdapter(deps.spine, tracker),
        ...(deps.searchLabwareByHint
          ? [createLabwareHintAdapter(deps.searchLabwareByHint)]
          : []),
        createRoleAddressAdapter(),
      ];
      // SPINE-8-LEVELFOR production supplier: the (verb, argument) ->
      // MaterialLevel mapping is VOCABULARY DATA (the arg contract's declared
      // `level` slot — schema-declared, meta-schema-validated). This is a
      // generic read of the declared contract list, NOT a (verb,arg) table:
      // zero verb/arg name literals, zero level-value branches here. The
      // engine's wantLevel arm (resolutionEngine.ts levelFilter) consumes it.
      const levelFor = (verb: string, argument: string): MaterialLevel | undefined =>
        deps.vocabulary.argContracts(verb).find((a) => a.name === argument)?.level;
      // MATRES-ELIG (spec §9): the eligibility POLICY document is loaded PER
      // call, never process-cached (the nounShape law). An absent triplet is a
      // disclosed off-state (null ⇒ the engine's pre-ELIG arms stay inert and
      // the compile is byte-identical); a present-but-malformed triplet throws
      // naming the path. Tests inject a fixture-loaded policy through
      // ResolveNounsPassDeps.eligibility (the anti-hardcode mutation proof).
      const eligibility = deps.eligibility !== undefined
        ? deps.eligibility
        : loadMaterialEligibilityIfPresent();
      const engineDeps: EngineDeps = {
        adapters,
        strategies: buildStrategyRegistry(),
        levelFor,
        ...(eligibility !== null ? { eligibility } : {}),
        ...(deps.termsForSuggestions ? { termsForSuggestions: deps.termsForSuggestions } : {}),
      };

      const engine = await resolve(deps.intent, deps.vocabulary, engineDeps);

      // Declared-required fires BEFORE anything downstream has compiled
      // (resolve_nouns topologically precedes every noun consumer).
      const required = requiredArgumentClarifications(deps.intent, deps.vocabulary);

      // ANSWER-BIND-1: the scientist's validated answers settle slots BEFORE
      // the bar is computed. Identity machinery only — the answered SLOT keys
      // (§5.1 shape) decide what is replaced and what is dropped.
      const answered = answeredSlotBindings(deps.intent, deps.vocabulary, deps.answeredSlots ?? []);
      const answeredSlotKeys = new Set(answered.map((a) => a.slotKey));

      // REPLACEMENT: an answered slot's gathered candidate set is superseded
      // by the scientist's chosen record ("settled, do not re-ask"). Engine
      // bindings for untouched slots ride verbatim, in engine order.
      const bindings: BoundNoun[] = [
        ...engine.bindings.filter((b) => !answeredSlotKeys.has(identityKey(b))),
        ...answered.map((a) => a.binding),
      ];

      // DROP arm: an engine clarification is moot exactly when its slot is
      // settled by the scientist's answer. The switch is on IDENTITY (the
      // clarification's §5.1 key equals an answered slot key) plus the honest
      // exception the spec names: a declared-required sweep fact is NEVER
      // dropped here (the sweep is the vocabulary's own demand, not a
      // disambiguation the scientist answered). No reason NAME is branched on
      // beyond that stable code the pass itself declares.
      const settledEngineClarifications = engine.clarifications.filter((c) => {
        if (!answeredSlotKeys.has(identityKey(c))) return true;
        return c.reason === MISSING_REQUIRED_ARGUMENT_REASON;
      });

      // PARAM-FOLD-1 (W28-A5j): the model's facts pass the declared-optional-
      // absence fold BEFORE reconciliation — a folded fact never enters
      // `clarifications` and never counts toward `blocked`. Engine
      // clarifications, the §5.2 sweep, and the gated survivors below are
      // UNTOUCHED by construction (the fold reads only the model's own facts
      // against the declared contract data + the parsed action).
      //
      // STAGHEDGE-1 (W28-A5m §Q2 (b)): the answered-label consume rides the
      // SAME stage, applied to the FOLDED model facts, so a consumed fact
      // never re-enters reconcile and never counts toward `blocked` (the
      // stagnation arm the ruling names). Drops the QUESTION only — the slot
      // keeps its raw value and the answeredSlotBindings value-join above is
      // byte-unchanged for everything it already settles.
      const foldedModelFacts = foldDeclaredOptionalAbsentHedges(
        deps.intent,
        deps.vocabulary,
        deps.intent.unresolved,
      );
      const reconciled = reconcileModelUnresolved(
        consumeAnsweredLabelHedges(deps.vocabulary, foldedModelFacts, deps.answeredSlots ?? []),
        [...settledEngineClarifications, ...required],
        bindings,
      );

      // SH-QA-1 resolution-aware firing gate: a gated producer fact is MOOT
      // exactly when the engine bound its slot (resolve-vs-mint is known
      // HERE, post-resolve — normalize could not know it at raise time).
      // The join is the §5.1 machinery verbatim: a binding occupies its slot
      // key; a gated fact is dropped iff its identityKey is a bound SLOT key.
      // A gated fact WITHOUT slot identity (no actionLocation) is KEPT —
      // never silently dropped. Zero verb/arg/domain/reason NAME literals:
      // this switches on engine output + identity keys only.
      const boundSlotKeys = new Set<string>();
      for (const binding of bindings) {
        if (binding.actionIndex !== undefined) boundSlotKeys.add(identityKey(binding));
      }
      const gatedSurvivors = (deps.resolutionGatedClarifications ?? [])
        .filter((fact) => {
          const loc = fact.actionLocation;
          if (loc?.actionIndex === undefined || typeof loc.argument !== 'string') return true;
          return !boundSlotKeys.has(identityKey(fact));
        })
        .map((fact) => ({ ...fact }));

      // Gated survivors ride AFTER engine + required + model facts — the
      // SAME end-of-list position the compile-side producer append produced
      // (golden order pinned). They count toward `blocked` and the bar
      // diagnostic exactly like an engine clarification.
      const clarifications = [...reconciled, ...gatedSurvivors];

      const resolvedByLabel: Record<string, ResolvedNounBinding> = {};
      for (const binding of bindings) {
        if (!binding.curie) continue; // the mint affordance is never a binding
        const entry: ResolvedNounBinding = {
          verb: binding.verb,
          argument: binding.argument,
          label: binding.label,
          recordId: recordIdFromCurie(binding.curie),
          ...(binding.resolvedLabel !== undefined ? { resolvedLabel: binding.resolvedLabel } : {}),
          ...(binding.addresses !== undefined ? { addresses: binding.addresses } : {}),
          ...(binding.actionIndex !== undefined ? { actionIndex: binding.actionIndex } : {}),
        };
        resolvedByLabel[binding.label] = entry;
      }

      const blocked = clarifications.length > 0;
      const output: ResolveNounsOutput = {
        bindings,
        resolvedByLabel,
        clarifications,
        failures: engine.failures,
        blocked,
      };

      if (blocked) {
        const diagnostic: PassDiagnostic = {
          severity: 'error' as const,
          code: UNRESOLVED_ARGUMENTS_CODE,
          message: `resolve_nouns: ${clarifications.length} argument(s) unresolved — compilation barred`,
          pass_id: RESOLVE_NOUNS_PASS_ID,
          details: { clarifications },
        };
        return { ok: false, output, diagnostics: [diagnostic] };
      }

      return { ok: true, output };
    },
  };
}
