/**
 * demoteUnstatedQuantities.ts — L2-CLARIFY-TARGET-1 (RULING l2t1200, R1.2):
 * the pre-compile EMISSION demotion (AI path, compiler untouched).
 *
 * The defect the ruling assigns to this fix run: a declared-`kind: quantity`
 * slot the scientist's OWN turn never stated was being SMUGGLED into the
 * parsed document (the model copied `volumeUl: 100` from a frozen few-shot
 * example). The §5.2 sweep's presence test then correctly saw "present" and
 * stayed silent, so the assumed-value chip the declared policy promises never
 * fired.
 *
 * The fix (R1.2 verbatim): a present declared-quantity slot whose amount is
 * NOT in the request's own words is DEMOTED to absence (stripped from the
 * parsed document) so the existing declared machinery (the `missing-required-argument`
 * sweep + `clarificationsFromUnresolvedFacts`'s assumed-value stamp) raises it
 * DETERMINISTICALLY. Behaviour no longer depends on the model omitting
 * anything.
 *
 * Discipline (ONE data home, ONE grammar, zero TS name tables):
 *   • WHICH slots are demotion-eligible is the vocabulary's DECLARED `kind`
 *     (`'quantity'`) on `argContracts(verb)` — read via
 *     `defaultScientistIntentVocabulary()` (the SAME data the sweep reads);
 *     zero per-verb / per-argument TS tables.
 *   • WHICH field names satisfy a contract is the contract's own `name` plus
 *     its DECLARED `satisfiedBy` alias list (data) — the SAME shape the
 *     sweep's `argumentPresent` reads. Both the slot and its declared
 *     aliases are checked generically.
 *   • WHETHER the amount is STATED is the ONE existing quantity extractor,
 *     `extractQuantity` (`reconcileDraftQuantities.ts`) — the label-adjacency
 *     window. This module does NOT invent a second quantity grammar
 *     (ONE-grammar law).
 *   • The material label the extractor reads is the action's `material` noun
 *     label (the same symbolic label the compiler binds). When the action
 *     names no material, there is no label to associate an amount with — the
 *     slot is left untouched (honest no-op, never a guess).
 *   • The strip is DISCLOSED through the caller's reconcile-notes channel
 *     (the `extraSubmissionNotes` pattern at AgentOrchestrator.ts:2830-2841
 *     / :3141-3142 / :4168-4172) — never silently.
 *
 * Boundary (R1.6): this module runs UPSTREAM of the compile, in the
 * `event_shorthand` handler, between `parseShorthandForChat` and
 * `shorthandResultFromCompile`. It does NOT touch `foldAnswersIntoShorthand`
 * (the fold path) or its tests; the fold path's `compiledFold.doc` is the
 * HELD intent's already-stamped document and never re-parses — so an
 * ANSWERED volume (the fold's splice) is never re-demoted, and the
 * stated-volume control ("Add 200 uL of DMEM to A1") still fires no chip:
 * the 200 rides the stated path end-to-end.
 *
 * Compiler + goldens stay byte-identical BY CONSTRUCTION (R1.7): the demotion
 * is on the AI path upstream of the compile; the fix touches none of the
 * MANIFEST treeState pins. The guard test
 * `goldenTreeStateNoReblessPin.test.ts` pins that argument.
 */
import type { ScientistIntent } from '../compiler/scientistIntent/types.js';
import { defaultScientistIntentVocabulary } from '../compiler/scientistIntent/vocabulary.js';
import { extractQuantity } from './reconcileDraftQuantities.js';

/** One slot demoted by {@link demoteUnstatedQuantities} (for the note). */
export interface DemotedSlot {
  /** The action (verb) that carried the slot. */
  action: string;
  /** The action index within `doc.actions`. */
  actionIndex: number;
  /** The contract's declared `name` (the slot name in the vocabulary). */
  argument: string;
  /** The field name that was actually stripped (the `name` or a
   *  declared `satisfiedBy` alias). */
  field: string;
  /** The stripped value (the smuggled number / quantity object), for the
   *  disclosure note. */
  value: unknown;
}

/** The module's return shape. */
export interface DemoteUnstatedQuantitiesResult {
  /** The demoted document (a NEW object; the caller assigns). When nothing
   *  is demoted, this is the SAME object (no copy) — the no-op path. */
  doc: ScientistIntent;
  /** One entry per stripped slot, in action-then-field order. */
  demoted: readonly DemotedSlot[];
  /** Human-readable disclosure lines (one per strip) for the caller's
   *  reconcile-notes channel. Empty when nothing was stripped. */
  notes: readonly string[];
}

type Dict = Record<string, unknown>;

/** True when the field carries a finite number (a bare numeric slot, e.g.
 *  `volumeUl: 100`). Matches the sweep's `argumentPresent` number arm —
 *  the SAME shape the sweep reads, so a slot the demotion sees as "present"
 *  is exactly the slot the sweep would also see. */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** True when the field carries a quantity-object shape the sweep's
 *  `argumentPresent` object arm recognises: a plain object with a finite
 *  numeric `value` AND a non-empty-string `unit`. (A bare `volume: {}` is
 *  ABSENT — the sweep would also see it as absent, so the demotion never
 *  touches an empty object.) */
function isQuantityObjectPresent(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Dict;
  return (
    typeof o.value === 'number' &&
    Number.isFinite(o.value) &&
    typeof o.unit === 'string' &&
    o.unit.trim().length > 0
  );
}

/** True when the field is "present" per the sweep's `argumentPresent`
 *  (the shapes the sweep would treat as a satisfied slot). Only these two
 *  shapes matter for a `kind: quantity` slot: a bare finite number, or the
 *  quantity-object {value, unit}. Strings / arrays are not quantity slots in
 *  the vocabulary's declared shapes (a `kind: quantity` arg is always a
 *  number or a quantity-object; the schema enforces it). */
function quantitySlotPresent(v: unknown): boolean {
  return isFiniteNumber(v) || isQuantityObjectPresent(v);
}

/** The action's material noun label (the symbolic label the extractor
 *  associates an amount with). Absent when the action names no material —
 *  the demotion is a no-op in that case (no label to associate an amount
 *  with; the extractor would have nothing to anchor to). */
function actionMaterialLabel(action: Dict): string {
  const m = action.material;
  return typeof m === 'string' ? m.trim() : '';
}

/**
 * R1.2 — demote, for every parsed action × every declared `kind: quantity`
 * argument whose field the sweep's `argumentPresent` would see as present,
 * the slot when the request's OWN words never stated an amount with a unit
 * associated with the action's material label.
 *
 * Returns a NEW document when anything is stripped (the caller assigns it);
 * the SAME document when nothing was stripped (the no-op path — no copy, so
 * the no-statement case is byte-identical to the pre-fix behaviour).
 *
 * `words` is the scientist's own turn (the prompt + appended clarification
 * answers — the same string the LLM was asked to draft from). The ONE
 * extractor (`extractQuantity`) adjudicates "stated" — this module does not
 * re-parse prose, write a second quantity grammar, or invent a unit
 * conversion.
 */
export function demoteUnstatedQuantities(
  doc: ScientistIntent,
  words: string,
): DemoteUnstatedQuantitiesResult {
  const vocabulary = defaultScientistIntentVocabulary();
  const demoted: DemotedSlot[] = [];
  let mutated = false;

  const actions = doc.actions.map((action) => {
    const fields: Dict = { ...(action as unknown as Dict) };
    const verb = action.action;
    const contracts = vocabulary.argContracts(verb);
    if (contracts.length === 0) return action; // unknown verb — no contract, no demotion

    // The action's material label — the label the extractor associates an
    // amount with. When the action names no material, no slot is demoted
    // (honest no-op; the extractor would have nothing to anchor to).
    const label = actionMaterialLabel(fields);

    let actionMutated = false;
    for (const contract of contracts) {
      // Only the DECLARED `kind: quantity` contracts are demotion-eligible
      // (data-driven — zero per-verb / per-argument TS tables).
      if (contract.kind !== 'quantity') continue;
      // The field names that satisfy this contract: the contract's own
      // `name` plus its DECLARED `satisfiedBy` alias list (the SAME shape the
      // sweep's present-check reads — data, never TS).
      const fieldNames: string[] = [contract.name, ...(contract.satisfiedBy ?? [])];
      for (const fieldName of fieldNames) {
        const value = fields[fieldName];
        // Only a slot the sweep's `argumentPresent` would see as present is
        // a demotion candidate (an absent slot is already absent — the sweep
        // will raise it; nothing to demote).
        if (!quantitySlotPresent(value)) continue;
        // Is the amount STATED in the request's own words? The ONE extractor
        // decides (ONE-grammar law — no second quantity grammar here).
        const stated = label ? extractQuantity(words, label) : null;
        if (stated) continue; // the scientist stated a volume for this material — keep it
        // Demote: strip the field and disclose.
        delete fields[fieldName];
        actionMutated = true;
        mutated = true;
        demoted.push({
          action: verb,
          actionIndex: doc.actions.indexOf(action),
          argument: contract.name,
          field: fieldName,
          value,
        });
      }
    }
    if (!actionMutated) return action; // unchanged — no copy
    // Rebuild the action as a fresh ScientistIntentActionValue (strip only;
    // every other field carries over by spread).
    return fields as unknown as typeof action;
  });

  if (!mutated) {
    return { doc, demoted, notes: [] };
  }
  const newDoc: ScientistIntent = {
    ...doc,
    actions: actions as ScientistIntent['actions'],
  };
  const notes = demoted.map((d) => {
    const rendered = typeof d.value === 'object' && d.value !== null
      ? JSON.stringify(d.value)
      : String(d.value);
    return `Demoted unstated quantity: action "${d.action}" argument "${d.argument}" (field "${d.field}") carried ${rendered} — the scientist's turn stated no amount for that material; the slot is absent so the declared assumed-value policy raises it.`;
  });
  return { doc: newDoc, demoted, notes };
}
