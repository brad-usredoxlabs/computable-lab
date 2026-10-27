/**
 * L2-FREEFORM-1 H4 (OQ4 ruling) — the requestId-identity clarification-loop
 * tracker.
 *
 * The shipped detector (clarificationLoop.ts, the LLM-draft material-net arm)
 * keys on the QUESTION TEXT identity: a PARAPHRASED re-ask of the same slot
 * never matches an earlier assistant turn, so an unresolvable-noun card on a
 * shorthand surface is re-asked forever in paraphrase (SH-QA-3's mint
 * refusal, config/drafting/shorthand-drafting.yaml `nounShape:`, removes the
 * mint AFFORDANCE — never the question — so the only way out is a pick or a
 * rephrase the spine still cannot bind).
 *
 * OQ4 RULED: the loop detector keys on the requestId IDENTITY (the
 * content-keyed `factRequestId`, shorthandChat.ts — stable across compiles
 * and PARAPHRASE-INVARIANT: the id hashes the fact's actionLocation+reason+
 * label, not the turn's prompt), N=1 — the `looped` flag flips on the SECOND
 * occurrence of the same requestId, paraphrase or not. The answerable path
 * is untouched (a pick still folds and binds deterministically — the
 * ANSWER-FOLD escapable-loop ruling stands), and no surface membership
 * changes.
 *
 * The occurrence ledger is DATA on the held intent (the `answeredSlots`
 * precedent — travels with the hold, dies with the take/clear, MAX_HELD
 * eviction unchanged). Zero session state beyond the existing per-
 * conversation hold; zero vocabulary: the escalation text is composed
 * ENTIRELY from requestId-scoped fact data (label + reason) and fixed
 * structural sentences — no noun/pattern literals in TS (bait B3), no new
 * badge/term wording (B6), and the question is never removed (B7: the card
 * channel stays; the escalation NAMES the loop instead of laundering it).
 *
 * A plain `Record<string, number>` (not a Map) — the ledger rides the wire
 * on the done result, and a Map would serialize to `{}`.
 */

/** One unresolved fact as this module sees it — the request-scoped data the
 *  escalation is composed from (never any vocabulary). */
export interface LoopAskFact {
  /** The fact's own label (the noun the spine could not bind). */
  label: string;
  /** The bar's structural reason (e.g. the fact's declared reason code). */
  reason?: string;
  /** True when the noun-shape DATA refused this fact's mint affordance
 *   (the card shipped without the create-a-local-term option) — the
 *   escalation then says the mint is closed and the QUESTION stands. */
  mintRefused?: boolean;
}

/** The per-requestId ask ledger, carried on the held shorthand intent (and
 *  riding the done result so the fold re-hold carries it forward). Only
 *  requestIds that have appeared at least once are present; insertion order
 *  is first-ask order. */
export type LoopAskCounts = Readonly<Record<string, number>>;

/** Record this turn's asks into the running ledger (the OQ4 N=1 occurrence
 *  counter). Returns a NEW object — the ledger is immutable data on the held
 *  intent, never mutated in place. */
export function clarificationAskCount(
  prior: LoopAskCounts | undefined,
  requestIds: readonly string[],
): Record<string, number> {
  const next: Record<string, number> = { ...(prior ?? {}) };
  for (const requestId of requestIds) {
    next[requestId] = (next[requestId] ?? 0) + 1;
  }
  return next;
}

/** OQ4: `looped` flips on the SECOND occurrence of a requestId (N=1) —
 *  returns the requestIds whose count reaches 2 after this turn's ask. */
export function clarificationLoopRequestIds(counts: LoopAskCounts): string[] {
  const looped: string[] = [];
  for (const [requestId, count] of Object.entries(counts)) {
    if (count >= 2) looped.push(requestId);
  }
  return looped;
}

/** The honest-failure line for an unresolvable-noun loop. Composed from
 *  requestId-scoped fact data + fixed structural sentences — no vocabulary
 *  literals (B3), existing wording families only (B6). When the noun's mint
 *  affordance was refused by the noun-shape DATA, the text says so and says
 *  the QUESTION STANDS (the YAML header contract: the refusal never removes
 *  the question — only the mint affordance). */
export function clarificationLoopEscalation(requests: readonly LoopAskFact[]): string {
  const first = requests[0];
  const named = first ? `"${first.label}"` : 'the same term';
  const reason = first?.reason?.trim();
  const why = reason ? ` (reason: ${reason})` : '';
  const mintClause = requests.some((r) => r.mintRefused)
    ? ' Its mint affordance is closed by the drafting noun-shape policy (a sentence-shaped label is not a mintable term) — and that refusal never removed the QUESTION, so the way out is a pick from the offered options or naming a term the lab already has.'
    : '';
  const multi = requests.length > 1 ? ` (${requests.length} questions looped this turn.)` : '';
  return (
    `clarification_loop: the draft names ${named}${why}, which the lab spine could not bind, and the SAME question has now been asked twice; ` +
    `a third identical card will not help.${mintClause}${multi} ` +
    'Answer the card (a pick is applied directly and ends the loop) or name an existing lab term explicitly; nothing was applied.'
  );
}
