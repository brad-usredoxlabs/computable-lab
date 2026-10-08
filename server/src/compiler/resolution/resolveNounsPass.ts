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
import type { BoundNoun, EngineDeps, EngineFailure, EngineOutcome } from './types.js';
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
      const engineDeps: EngineDeps = {
        adapters,
        strategies: buildStrategyRegistry(),
        ...(deps.termsForSuggestions ? { termsForSuggestions: deps.termsForSuggestions } : {}),
      };

      const engine = await resolve(deps.intent, deps.vocabulary, engineDeps);

      // Declared-required fires BEFORE anything downstream has compiled
      // (resolve_nouns topologically precedes every noun consumer).
      const required = requiredArgumentClarifications(deps.intent, deps.vocabulary);

      const clarifications = reconcileModelUnresolved(
        deps.intent.unresolved,
        [...engine.clarifications, ...required],
        engine.bindings,
      );

      const resolvedByLabel: Record<string, ResolvedNounBinding> = {};
      for (const binding of engine.bindings) {
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
        bindings: engine.bindings,
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
