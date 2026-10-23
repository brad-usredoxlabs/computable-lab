/**
 * requirementId — MATRES-FULFIL §7.2 (D3): the stable identity of a
 * requirement OCCURRENCE.
 *
 * The law (mirrors termId.ts exactly — labelSlug + labelHash, NEVER
 * Date.now()/randomUUID): `REQE-<slug>-<hash>` where the anchor is the
 * occurrence's draft-time COORDINATE (graph recordId + eventId + slot name),
 * NEVER the mutable content. Consequences (the §10 5.11 law tests pin these):
 * - editing `reason`, `source_details`, or swapping the bound spec NEVER
 *   changes the id (content is not even a parameter of this function);
 * - a re-draft of identical content at the same coordinate yields the SAME id
 *   (idempotent, Q3a);
 * - distinct coordinates mint distinct ids — pairwise distinctness across a
 *   plan is enforced CONSTRUCTIVELY by this mint law (the lint DSL has no
 *   distinct/count op; the gap is RECORDED in the lint file, not silent).
 *
 * The REQE- family deliberately excludes the procurement REQ- family: one
 * name, no two systems (bait 3). The id is minted-by-reference only — no
 * record is created for a requirement occurrence (Q3b).
 */

import { labelHash, labelSlug } from './termId.js';

/** The occurrence-id family (mirrors the schema pattern on
 *  plate-event.add-material.schema.yaml and the lint belt rule). */
export const REQUIREMENT_ID_PATTERN = '^REQE-[a-z0-9-]+$';

/**
 * Mint the occurrence id from the coordinate alone. `slot` defaults to the
 * requirement slot the occurrence lives in (material_source_requirement);
 * the coordinate is (graph recordId, eventId, slot) — the stable draft-time
 * position, not the content riding on it.
 */
export function requirementOccurrenceId(
  graphRecordId: string,
  eventId: string,
  slot = 'material_source_requirement',
): string {
  const anchor = `${graphRecordId}|${eventId}|${slot}`;
  return `REQE-${labelSlug(anchor)}-${labelHash(anchor)}`;
}
