/**
 * L2-CLARIFY-CARD-1 A2 — the slot-coverage gate (the W12 silent-stage backstop).
 *
 * The deterministic bar (resolveNounsPass.ts:555 `blocked = clarifications.length > 0`)
 * catches every PRESENT STRING resolvable slot the engine processed: the engine either
 * BINDS it or CLARIFIES it (never silently skips a string). But the engine's doc-door
 * (resolutionEngine.ts:505-509) SILENTLY SKIPS a slot whose value is NOT a string
 * (`typeof raw !== 'string'`), and the shipped ambiguity policy is `clarify` — so a
 * document can carry a `resolvable` slot that was NEVER resolved, NEVER asked about,
 * and still compile to a `complete` outcome with the event carrying a bare label
 * (the W12 silent-stage class; the staged event's `material` is a LABEL string,
 * verified in wrongcommit.json `modalText`). A2 converts every such drop into the
 * SAME bar.
 *
 * SCOPE (empirically determined, L2-CLARIFY-CARD-1 l2t0230): the gate covers the
 * declared `kind === 'resolvable'` slots ONLY. The spec's A2 text names
 * `kind === 'resolvable' | 'wells'`, but the shipped engine produces ZERO `wells`
 * bindings: a `wells` slot (array or scalar) is the `explicit_wells` strategy's job
 * (strategies.ts:69-74, the role-address adapter) and is LOWERED by the downstream
 * `resolve_wellsets` pass — `resolve_nouns` never binds it (probe-verified: a
 * `targetWells: [A1]` doc compiles `complete` with NO `resolve_nouns` binding for
 * `targetWells`). Requiring a `resolve_nouns` binding for `wells` would false-bar
 * every `targetWells`/`sourceWells` and break every green golden that carries a
 * well address. So the invariant is the actual W12 hole: a PRESENT `resolvable`
 * slot the engine silently skipped.
 *
 * Pure predicate (the spec's A2 contract): it reads the PARSED intent's declared
 * contracts + the pass's OWN output. No verb/argument/domain NAME literals — it
 * switches on the declared `kind` field + the `(actionIndex, argument)` identity
 * only (the identityKey idiom, resolveNounsPass.ts:154-166). The reviewer's
 * bait-4 counterexample (a directly-constructed parsed intent with a non-string
 * material slot) reaches this predicate because it is decoupled from Ajv (which
 * rejects non-strings on the YAML path — the predicate is the backstop).
 */
import type {
  ScientistIntent,
  ScientistIntentActionKind,
} from '../scientistIntent/types.js';
import type { ScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import type { ResolveNounsOutput } from './resolveNounsPass.js';

/** The `not-stated` sentinel (declaredOptionalHedgeFold.ts:34) — a slot value
 *  equal to it is DECLARED ABSENCE, not presence. Re-exported here so the gate
 *  reads the module's OWN stable code (zero new reason literals). */
import { NOT_STATED_REASON } from './declaredOptionalHedgeFold.js';

/** The engine's OWN stable unknown-noun code (resolutionEngine.ts
 *  `clarificationFor(req, UNKNOWN_NOUN_REASON, mints)`; the same token the
 *  REASON_SPECIFICITY_ORDER precedence table names). The synthesized fact rides
 *  the SAME code the engine itself emits, so the card + fold handle it verbatim
 *  (spec A2: "reason = the engine's OWN stable 'unknown-noun' code").
 *  advc-c1 D3 (fix1): this is the engine's constant RE-EXPORTED under the
 *  gate's name — the single shared source, not a third literal. The emitted
 *  reason bytes are unchanged ('unknown-noun'). */
export { UNKNOWN_NOUN_REASON as UNBOUND_SLOT_REASON } from './resolutionEngine.js';

/** A slot value is PRESENT when the field carries a value the engine's doc-door
 *  would consider (string non-blank-and-not-the-sentinel, non-empty array, finite
 *  number) OR a non-string object the door would SILENTLY SKIP (the bait-4 class).
 *  Mirrors argumentPresent (declaredOptionalHedgeFold.ts:49-54) for string/array/
 *  number; the object arm is the deliberate superset that makes A2 catch the
 *  non-string silent-skip (argumentPresent returns false for an object, which is
 *  exactly the value the engine drops without asking). */
export function unboundSlotValuePresent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'string') return raw.trim().length > 0 && raw.trim() !== NOT_STATED_REASON;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'number') return Number.isFinite(raw);
  // Non-string object (the engine's door silently skips it — resolutionEngine.ts:507):
  // PRESENT, so it requires proof of binding. This is A2's whole purpose.
  return true;
}

/** The `(actionIndex, argument)` slot identity (the identityKey idiom,
 *  resolveNounsPass.ts:154-166). Identity only — never a verb/argument NAME. */
function slotKey(actionIndex: number, argument: string): string {
  return `slot:${actionIndex}:${argument}`;
}

export interface UnboundSlot {
  actionIndex: number;
  action: ScientistIntentActionKind;
  argument: string;
  /** The raw slot value (stringified for the synthesized fact's label). */
  value: string;
}

/**
 * The A2 predicate: every PRESENT declared `resolvable` slot that has NO
 * `resolve_nouns` binding for the same `(actionIndex, argument)` identity.
 *
 * `resolveNounsOutput` is read as `result.outputs.get('resolve_nouns')` in the
 * compile (compileScientistIntent.ts:372). Per the spec's bait 6, `undefined` is
 * treated as "no proof of binding" (every present resolvable slot is unbound —
 * the bar), NEVER as "nothing to check" (that would be the silent-stage hole).
 *
 * Returns the leftover slot identities (empty = coverage holds, no bar).
 */
export function unboundDeclaredSlots(
  intent: ScientistIntent,
  vocabulary: ScientistIntentVocabulary,
  resolveNounsOutput: ResolveNounsOutput | undefined,
): UnboundSlot[] {
  // The bound-slot identity set: a binding occupies its `(actionIndex, argument)`
  // slot key (only bindings with a known actionIndex count — the §5.1 idiom).
  const bound = new Set<string>();
  if (resolveNounsOutput) {
    for (const binding of resolveNounsOutput.bindings) {
      if (binding.actionIndex !== undefined) bound.add(slotKey(binding.actionIndex, binding.argument));
    }
  }

  const leftovers: UnboundSlot[] = [];
  intent.actions.forEach((action, index) => {
    const fields = action as unknown as Record<string, unknown>;
    for (const contract of vocabulary.argContracts(action.action)) {
      // The gate covers the declared `resolvable` slots ONLY (see the module
      // SCOPE note: `wells` slots are the resolve_wellsets pass's job and never
      // carry a resolve_nouns binding). Zero verb/argument NAME literals — the
      // declared `kind` field decides eligibility (data), never a per-verb table.
      if (contract.kind !== 'resolvable') continue;
      const raw = fields[contract.name];
      if (!unboundSlotValuePresent(raw)) continue; // absent / declared-absence
      if (bound.has(slotKey(index, contract.name))) continue; // bound — proof exists
      leftovers.push({
        actionIndex: index,
        action: action.action,
        argument: contract.name,
        value: raw === undefined || raw === null ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw),
      });
    }
  });
  return leftovers;
}
