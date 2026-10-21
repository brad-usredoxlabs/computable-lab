/**
 * receivingIdentity — MATRES-RECV §2b/§2c: the shared receiving identity
 * module (architect ruling MATRESRECV-D1/D2, helper-relocation step D).
 *
 * The two genuinely shared helpers relocated out of the (now deleted)
 * MaterialReceivingAcceptService, plus the two schema-id constants. The live
 * accept rail is FormDraftService (+ the receiving adapter's onAccept hook);
 * this module is identity + gate data, NOT an accept path — no evaluate /
 * compile / accept lives here (a second accept implementation is the exact
 * D1 defect this ruling removes).
 *
 * Hard rules honored here:
 * - Deterministic ids (termId/content-hash law): a receipt id is a pure
 *   content hash of the envelope (a re-draft of identical content lands the
 *   SAME record — AC-2(ii)); a correction id is content-scoped over
 *   (supersedes + changedFacts + claimTarget.mode) like ATTEST Q4e. NEVER
 *   Date.now(), NEVER randomUUID, NEVER derived from a lot number
 *   (vendor-scoped lot: a bare lot never mints an id).
 * - "Already received?" is a REF EXISTENCE + supersedes check (P8) whose
 *   supersession fold IS CurrentAssertionView's (D4 ruling: one fold, one
 *   authority — the local fold that re-read superseded payloads is DELETED;
 *   the gate calls the view's exported currentAssertion). No lot-keyed
 *   lookup, no fuzzy matching, no kind-branch.
 * - Idempotence is identity, not a second gate: a content-identical re-draft
 *   hashes to the SAME deterministic record id, so when the CURRENT receipt
 *   about the entity IS the draft's own deterministic id, the re-draft lands
 *   the SAME record (AC-2(ii) — never a second arrival). A DIFFERENT current
 *   receipt about the entity is what needs the correction-or-distinct-arrival
 *   remedy (AC-2(iii)).
 * - No kind-dispatch: this module is imported BY the receiving writer; it
 *   never branches on a kind to decide who it serves.
 */

import type { RecordStore } from '../store/types.js';
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { currentAssertion } from '../attestation/CurrentAssertionView.js';

export const MATERIAL_RECEIVING_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-receiving.schema.yaml';
export const MATERIAL_INSTANCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml';

/**
 * The ONE deterministic receipt-id formula (termId law, content-scoped per
 * §2b(ii)), shared by the elicited compile AND the accept rail (never two
 * derivations of the same id): a receipt hashes its ENVELOPE (a re-draft of
 * identical content lands the SAME record); a correction hashes (supersedes +
 * changedFacts + claimTarget.mode) exactly like ATTEST Q4e. `attestedAt` is
 * EXCLUDED from the hashed core: it is the server's acceptance stamp (stamped
 * by the adapter's onAccept at accept time), not part of the immutable claim
 * content, so the same claim lands the same record whichever clock value
 * stamps the accept. Never a clock, never randomness, never derived from a
 * lot (vendor-scoped lot).
 */
export function receivingRecordIdOf(envelope: Record<string, unknown>): string {
  const supersedes = envelope.supersedes;
  const correction = envelope.correction;
  if (supersedes !== undefined && correction !== undefined) {
    const c = object(correction);
    return `RECV-${contentHash({ supersedes, changedFacts: c.changedFacts, mode: object(c.claimTarget).mode }).slice(0, 32).toUpperCase()}`;
  }
  const core = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== 'attestedAt' && key !== 'recordId'));
  return `RECV-${contentHash(core).slice(0, 32).toUpperCase()}`;
}

/**
 * "Already received?" — a REF EXISTENCE + supersedes check (P8) routed
 * THROUGH CurrentAssertionView (D4: the supersession fold is the view's
 * currentAssertion — "a record is CURRENT iff no other supersedes it" —
 * never a local re-reading of superseded payloads). A CURRENT
 * (un-superseded) receipt about the SAME entity ref blocks a new draft that
 * carries no supersedes — UNLESS the current receipt IS the draft's own
 * deterministic id: a content-identical re-draft is the SAME record
 * (idempotence, AC-2(ii)), never a second arrival. A correction (supersedes
 * present) passes; a genuinely distinct arrival names a DIFFERENT entity ref
 * and passes. No lot-keyed lookup, no fuzzy matching, no kind-branch.
 */
export async function alreadyReceivedDiagnostic(
  store: RecordStore,
  entity: string,
  supersedesPresent: boolean,
  ownRecordId: string,
): Promise<string | null> {
  if (entity === '') return null;
  if (supersedesPresent) return null;
  const receipts = await store.list({ kind: 'material-receiving' });
  const current = currentAssertion(receipts, entity);
  if (current.sourceRecordId === '' || current.sourceRecordId === ownRecordId) return null;
  return `Entity ${entity} is already received (record ${current.sourceRecordId}) — submit a correction (supersedes) or a genuinely distinct arrival (a new instance entity ref)`;
}
