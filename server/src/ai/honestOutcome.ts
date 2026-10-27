/**
 * L2-FREEFORM-1 — the committed honest-outcome trichotomy helper.
 *
 * THE RULE (campaign gate doctrine): every free-form draft turn lands exactly
 * one of four honest outcomes (the trichotomy + the action-delivered arm,
 * L2-FREEFORM-1F) —
 *   1. "events-bound": events > 0 AND every event's labwareId is BOUND
 *      (∈ deck ids ∪ resolved record ids when the probe supplies them);
 *   2. "honest-failure": an error that names itself — checked BEFORE
 *      "cards" (L2-FREEFORM-1 H4) AND before the action arm (the D-1
 *      ruling): the escalation shape carries BOTH an error and the
 *      standing QUESTION (B7: the card channel stays beside the honest
 *      failure). An errored turn is the loop's terminal state — a
 *      cards-only turn (no error) is still the answerable question;
 *   3. "action-delivered" (L2-FREEFORM-1F, the D-1 ruling): the deckLayout
 *      action channel carries a WELL-FORMED delivery — a non-null object
 *      with a non-empty string platformId AND a non-empty string variantId
 *      (the server's emit site stamps exactly this shape). The arm is
 *      STRUCTURAL: the helper judges DELIVERY, never correctness — a
 *      wrong-but-well-formed variantId is an accuracy defect the
 *      expectations catch, not the wall. The server's canonical emptiness
 *      guard already counts deckLayout a deliverable channel (see the
 *      drift comment below), so a turn the product calls delivered is not
 *      the silent shape (defect D-1, closed). CHECKED BEFORE "cards" —
 *      precedence events-bound > honest-failure > action-delivered > cards;
 *   4. "cards": clarification cards > 0, no error (an answerable question).
 * Anything else — the shipped defect shape { success:true, events>0,
 * cards==0, no error } with an UNBOUND raw-label labwareId, or a silent
 * success with zero delivery on every channel — MUST throw (with the
 * delivered-channel dump) so the defect cannot exit the server
 * unclassified.
 *
 * L2-SUITE-A's harness imports `assertHonestOutcome` and does NOT re-implement
 * the trichotomy (spec acceptance #2).
 *
 * Structural only: the helper reads the result's own channels and the probe's
 * own id sets — zero vocabulary, zero name literals. The action-delivered arm
 * adds no manifest/registry lookup and no id literals: the
 * variant-vs-platform check is registry-data-dependent and lives on the
 * client apply path, where it belongs.
 *
 * DRIFT: the action-delivered arm mirrors draftProducedNothingOnServer's
 * (server/src/ai/draftArgDiagnostics.ts) deckLayout term — one of the 7
 * canonical deliverable channels the H5 guard counts. If that 7-channel list
 * changes, this arm must change with it (and the pinned parity feeds will
 * trip). Client superset: app/src/event-editor/right-pane/ai/draftEmptiness.ts
 * (CLIENT ⊇ SERVER, pinned — a divergence fails the app suite, not a live
 * dogfood).
 */

export type HonestOutcomeVerdict =
  | 'events-bound'
  | 'cards'
  | 'honest-failure'
  | 'action-delivered';

/** The id context a probe supplies so "bound" is checkable (acceptance #2(e):
 *  "events-bound" requires every event's labwareId ∈ deck ids ∪ resolved
 *  record ids). Absent ⇒ event labwareIds are not checkable and count as
 *  bound (a plain unit probe that feeds an events-bearing result). */
export interface HonestOutcomeContext {
  deckIds?: readonly string[];
  resolvedIds?: readonly string[];
}

interface HonestOutcomeInput {
  success?: boolean;
  events?: unknown[];
  clarificationRequests?: unknown[];
  error?: string;
  // L2-FREEFORM-1F (D-1): the deckLayout action channel, read STRUCTURALLY
  // (the action-delivered arm below). `unknown` on purpose — the helper
  // never assumes its shape beyond the sound predicate; exactOptionalProperty
  // types: the property is absent OR a value, never undefined.
  deckLayout?: unknown;
}

function eventLabwareId(event: unknown): string | undefined {
  if (!event || typeof event !== 'object') return undefined;
  const labwareId = (event as Record<string, unknown>)['labwareId'];
  return typeof labwareId === 'string' && labwareId.length > 0 ? labwareId : undefined;
}

/** Classify a delivered draft result against the trichotomy. Returns the
 *  verdict, or null when the result is NONE of the four (the silent shape). */
export function classifyHonestOutcome(
  result: HonestOutcomeInput,
  context?: HonestOutcomeContext,
): HonestOutcomeVerdict | null {
  const cards = result.clarificationRequests?.length ?? 0;
  const errored = typeof result.error === 'string' && result.error.length > 0;
  const events = result.events ?? [];
  if (events.length > 0) {
    const boundIds = new Set<string>([
      ...(context?.deckIds ?? []),
      ...(context?.resolvedIds ?? []),
    ]);
    for (const event of events) {
      const labwareId = eventLabwareId(event);
      // An event with no labware identity is not an H1 unbound-label shape —
      // it carries nothing to bind. A string labwareId outside the bound sets
      // (when the probe supplies them) is the shipped defect: throw.
      if (labwareId !== undefined && context && !boundIds.has(labwareId)) {
        throw new Error(
          'assertHonestOutcome: NOT an honest outcome — events>0 with an UNBOUND raw-label labwareId ' +
            `(${JSON.stringify(labwareId)}) and no cards, no error. Delivered channels: ` +
            channelDump(result),
        );
      }
    }
    return 'events-bound';
  }
  // H4: the error outranks the cards — the escalation shape (error + the
  // standing question) is the honest failure, not an answerable cards turn.
  // The error also outranks the action arm: a failed turn never delivers,
  // and the server's emit site makes error and deckLayout mutually
  // exclusive (the defensive order, per the D-1 ruling).
  if (errored) return 'honest-failure';
  // L2-FREEFORM-1F (D-1): the action-delivered arm — STRUCTURAL delivery
  // only. deckLayout counts as delivered IFF it is a non-null object with a
  // non-empty string platformId AND a non-empty string variantId (the shape
  // the server's emit site stamps). {deckLayout:{}}, empty ids, or null stay
  // the silent shape (the anti-ghost pins) and fall through to the throw.
  // No manifest/registry lookup, no id literals — the zero-vocabulary
  // contract holds (header :22-23).
  const deckLayout = result.deckLayout;
  if (deckLayout !== null && typeof deckLayout === 'object' && !Array.isArray(deckLayout)) {
    const platformId = (deckLayout as Record<string, unknown>)['platformId'];
    const variantId = (deckLayout as Record<string, unknown>)['variantId'];
    if (
      typeof platformId === 'string' &&
      platformId.length > 0 &&
      typeof variantId === 'string' &&
      variantId.length > 0
    ) {
      return 'action-delivered';
    }
  }
  if (cards > 0) return 'cards';
  return null;
}

function channelDump(result: HonestOutcomeInput): string {
  const channels: Record<string, unknown> = {};
  for (const key of Object.keys(result) as Array<keyof HonestOutcomeInput>) {
    const value = result[key];
    if (Array.isArray(value)) channels[key] = `array(${value.length})`;
    else if (typeof value === 'string') channels[key] = `string(${value.length} chars)`;
    else channels[key] = value;
  }
  return JSON.stringify(channels);
}

/** The committed probe gate: classify + throw on the silent shape (with the
 *  delivered-channel dump). */
export function assertHonestOutcome(
  result: HonestOutcomeInput,
  context?: HonestOutcomeContext,
): HonestOutcomeVerdict {
  const verdict = classifyHonestOutcome(result, context);
  if (verdict === null) {
    throw new Error(
      'assertHonestOutcome: NOT an honest outcome — success with zero bound events, zero cards, ' +
        `no error (the silent success-with-zero-mountable). Delivered channels: ${channelDump(result)}`,
    );
  }
  return verdict;
}
