/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cpclassify): the RETURN-PAYLOAD CLASSIFICATION
 * seam. One pure decision over two already-validated documents: may this
 * context delta be INJECTED into the parked prompt, or must the whole payload
 * be RE-PRESENTED to the person as a request revision? The rule it enforces is
 * already DECLARED in context-delta.schema.yaml (request_revision's presence
 * "FORBIDS silent injection into the pending prompt"); this module is the
 * missing decision point. No store, no route, no Ajv, no schema read — the
 * same two documents always classify the same way.
 */
import type { ContextDelta, PendingIntentCheckpoint } from './checkpointContract.js';

/** The two dispositions a returned context delta can be classified as. */
export const RETURN_DISPOSITIONS = ['inject', 'request_revision'] as const;
/** The closed refusal codes; every 'request_revision' result names exactly one. */
export const INJECTION_REFUSALS = ['request-revision-declared', 'slot-already-set', 'slot-undetermined'] as const;
export type ReturnDisposition = (typeof RETURN_DISPOSITIONS)[number];
export type InjectionRefusal = (typeof INJECTION_REFUSALS)[number];
export interface ReturnPayloadClassification {
  disposition: ReturnDisposition;
  /** Present exactly when disposition is 'request_revision'; ABSENT on 'inject' (exactOptionalPropertyTypes). */
  code?: InjectionRefusal;
  /** Offending delta.entries indexes; a whole-delta refusal carries none. */
  refusedEntryIndexes: number[];
}

/**
 * Classify a returned context delta against its pending-intent checkpoint.
 *
 * (a) A delta whose request_revision is PRESENT is refused whole (the schema's
 *     declared rule): nothing about it may be injected, so refusedEntryIndexes
 *     stays empty and the good entries are NOT partial injections.
 * (b) Each 'unresolved-slot' entry is injectable only if its semantic_type
 *     matches EXACTLY ONE declared unresolved slot: zero matches is a rewrite
 *     of a value the pending intent already decided (slot-already-set); more
 *     than one match leaves the identity undecided (slot-undetermined — never
 *     guess which slot).
 * (c) A 'proposed-addition' entry always injects: it adds knowledge beside
 *     the request instead of restating it.
 * (d) ANY entry refusal re-presents the WHOLE payload as a request revision;
 *     refusedEntryIndexes names every offending entry, code names the first.
 * All matches are keyed on the declared data — no slot name, field name, or
 * changed-field vocabulary is compared here.
 */
export function classifyReturnPayload(
  delta: ContextDelta,
  checkpoint: PendingIntentCheckpoint,
): ReturnPayloadClassification {
  if (delta.request_revision !== undefined)
    return { disposition: 'request_revision', code: 'request-revision-declared', refusedEntryIndexes: [] };
  const refusedEntryIndexes: number[] = [];
  let code: InjectionRefusal | undefined;
  delta.entries.forEach((entry, index) => {
    if (entry.kind !== 'unresolved-slot') return; // (c): proposed-addition injects beside the request
    const matches = checkpoint.unresolved_slots.filter((slot) => slot.semantic_type === entry.semantic_type);
    const refusal: InjectionRefusal | undefined =
      matches.length === 0 ? 'slot-already-set' : matches.length > 1 ? 'slot-undetermined' : undefined;
    if (refusal !== undefined) {
      if (code === undefined) code = refusal;
      refusedEntryIndexes.push(index);
    }
  });
  // (d): any refusal makes the whole delta a request revision; code is spread
  // in only when set (exactOptionalPropertyTypes: never `code: undefined`).
  if (refusedEntryIndexes.length > 0)
    return { disposition: 'request_revision', ...(code !== undefined ? { code } : {}), refusedEntryIndexes };
  return { disposition: 'inject', refusedEntryIndexes: [] };
}
