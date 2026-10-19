/**
 * PARAM-FOLD-2 (W28-A5k) — the declared-optional-absence fold as a LEAF rule.
 *
 * Extracted VERBATIM from resolveNounsPass.ts (PARAM-FOLD-1 / W28-A5j) so the
 * SAME rule serves both raw consumers of a parsed scientist-intent document:
 *   • the resolve_nouns pass (clarifications + the atomic bar), and
 *   • normalizeScientistIntent (the `unresolvedRefs` -> gaps channel and
 *     `protocolIntent.unresolved` — the RAW source every downstream gap
 *     consumer reads).
 * W28-A5k Q1: the gaps channel is legitimate; its RAW input was the defect.
 * One shared fold rule, consumed at the RAW SOURCE, keeps both channels
 * speaking the same truth. The single-fold-point invariant is per-RULE, not
 * per-process: both call sites call THIS function; the fold is an idempotent
 * filter, so a re-fold of an already-folded set is a no-op by construction.
 *
 * Leaf law (W28-A5k): type-only imports from `scientistIntent/` + a private
 * copy of the sweep's `argumentPresent` shape — NO import of the pass module
 * and no import edge into normalizeScientistIntent (acyclic by construction).
 *
 * Hard boundary (inherited engine law): this module switches on NOTHING but
 * identity + declared contract fields + one stable reason code. No verb,
 * class, or domain NAME appears here.
 */
import type { ScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import type {
  ScientistIntent,
  ScientistIntentUnresolvedFact,
} from '../scientistIntent/types.js';

/** Stable reason code for the model's not-stated hedge (the emitter
 *  contract's closed reason set, intentCompile.ts:107 + the mirror yaml).
 *  A stable code like resolveNounsPass's sweep code — legal per the module
 *  law, NOT a verb/class/argument NAME. PARAM-FOLD-1 (W28-A5j) guard (5). */
export const NOT_STATED_REASON = 'not-stated' as const;

/** Same presence test as the §5.2 sweep's helper (resolveNounsPass.ts) —
 *  private copy so this leaf stays acyclic and importable from both call
 *  sites (W28-A5k: 'a private argumentPresent copy or a shared-helper
 *  import — smallest diff'). */
function argumentPresent(raw: unknown): boolean {
  if (typeof raw === 'string') return raw.trim().length > 0;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'number') return Number.isFinite(raw);
  return false;
}

// ---------------------------------------------------------------------------
// PARAM-FOLD-1 (W28-A5j) — the declared-optional-absence fold. The exact
// mirror of §5.2 in the other direction: the sweep trusts DECLARED DATA over
// a SILENT model (a required absence becomes a question the DATA raises);
// the fold trusts DECLARED DATA over a HEDGING model (a question the model
// raises about an OPTIONAL absence the data says is not a question). A
// MODEL-side fact is MOOT — dropped before the bar — exactly when all five
// guards hold, each read as data/identity, never as a domain name:
//   (1) the fact carries slot identity (same guard shape as SH-QA-1's gate);
//   (2) its own actionLocation joins a declared arg contract of its verb
//       (no contract -> KEEP: never silently drop a fact the data can't
//       speak for);
//   (3) the contract declares the absence legal (required !== true);
//   (4) the argument is ABSENT in the parsed action (a PRESENT hedge stays
//       answerable — the SAMPLE-CARD-1 class survives on data alone, no
//       kind check needed);
//   (5) the fact carries the stable NOT_STATED_REASON code (ambiguous /
//       contradicts-the-text are stated-but-uncommitted — kept).
// Engine clarifications and gated survivors are UNTOUCHED by construction:
// this reads only the model's own facts against the declared contract list
// + the parsed action — never identity-matched against engine output.
// ---------------------------------------------------------------------------

export function foldDeclaredOptionalAbsentHedges(
  intent: ScientistIntent,
  vocabulary: ScientistIntentVocabulary,
  modelFacts: readonly ScientistIntentUnresolvedFact[],
): ScientistIntentUnresolvedFact[] {
  return modelFacts.filter((fact) => {
    const loc = fact.actionLocation;
    // Guard (1): slot identity, or KEEP.
    if (loc?.actionIndex === undefined || typeof loc.argument !== 'string') return true;
    // Guard (2): the declared contract list of the fact's OWN verb location;
    // a location that names no verb, or no contract for that (action,
    // argument) -> KEEP.
    const verb = loc.action;
    if (typeof verb !== 'string') return true;
    const contract = vocabulary
      .argContracts(verb)
      .find((c) => c.name === loc.argument);
    if (!contract) return true;
    // Guard (3): the vocabulary declares the absence legal, or KEEP.
    if (contract.required === true) return true;
    // Guard (4): the argument is ABSENT in the parsed action, or KEEP.
    const action = intent.actions[loc.actionIndex];
    if (!action) return true;
    if (argumentPresent((action as unknown as Record<string, unknown>)[contract.name])) return true;
    // Guard (5): a stable reason code, or KEEP.
    if (fact.reason !== NOT_STATED_REASON) return true;
    // All five: the data already settles this — the hedge is moot. FOLD.
    return false;
  });
}
