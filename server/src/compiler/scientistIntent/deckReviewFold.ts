/**
 * DECK-FOLD-1 — deck-review fold policy (product-side).
 *
 * How many resolved-inventory placement offers the deck review may carry is
 * DATA: the `maxResolvedOffers` key of config/drafting/deck-review.yaml (the
 * shorthand-drafting.yaml / analysis-composition.yaml precedent — loaded PER
 * call, never process-cached). The compile runner applies the cap at the ONE
 * propagation choke every consumer shares (OQ1: server-side), so a broad-
 * inventory echo can never flood the review deck. Zero numeric cap literals
 * in TypeScript (repo rule #1).
 *
 * ABSENT file/section => null => cap OFF (legacy pass-through, the same
 * absent-means-off doctrine as shorthandDrafting.ts). PRESENT-but-malformed
 * (not a positive integer) throws honestly, naming the key
 * (analysisReferenceGrounding.ts maxPerKind wording precedent).
 *
 * Truncation is a silent head-slice of the already-deterministic pass-output
 * order (candidate order = protocol order — the same determinism the goldens
 * pin). It must NOT emit a gap: a gap would flip `outcome` via computeOutcome
 * and change compile outcomes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const defaultPolicyPath = new URL('../../../../config/drafting/deck-review.yaml', import.meta.url);

export interface DeckReviewPolicy {
  /** Max resolved-inventory placement offers propagated per compile — membership
   *  of the cap is DATA, never a TS literal. */
  maxResolvedOffers: number;
}

export function loadDeckReviewPolicy(
  policyPath: string | URL = defaultPolicyPath,
): DeckReviewPolicy | null {
  const abs = typeof policyPath === 'string' && !policyPath.startsWith('file:')
    ? policyPath
    : policyPath;
  if (!existsSync(abs)) return null;
  let raw: unknown;
  try {
    raw = parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    throw new Error(`deck review policy unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('deck review policy must be an object');
  }
  const maxResolvedOffers = (raw as Record<string, unknown>).maxResolvedOffers;
  if (maxResolvedOffers === undefined || maxResolvedOffers === null) return null;
  if (typeof maxResolvedOffers !== 'number' || !Number.isInteger(maxResolvedOffers) || maxResolvedOffers < 1) {
    throw new Error('deck review policy: maxResolvedOffers must be a positive integer');
  }
  return { maxResolvedOffers };
}

/**
 * Apply the cap to the resolve_labware pass's output, verbatim order.
 * Absent policy => the list passes through uncapped. No gap, no diagnostic:
 * the slice is silent by design (a gap would flip the compile outcome).
 */
export function capResolvedLabwares<T>(items: readonly T[], policyPath?: string | URL): T[] {
  const policy = loadDeckReviewPolicy(policyPath ?? defaultPolicyPath);
  if (!policy) return [...items];
  return items.slice(0, policy.maxResolvedOffers);
}
