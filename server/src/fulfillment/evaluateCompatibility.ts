/**
 * evaluateCompatibility — MATRES-FULFIL §7.5: the PURE verdict-derivation read.
 *
 * Three-state law (P8): a required declared fact MISSING => the data's
 * missing-fact outcome (INCOMPLETE) — "not known to mismatch" NEVER evaluates
 * as "known to match". The evaluator holds NO policy: verdict names, outcome
 * mapping, check selection by fulfilledBy, and the paths compared are all read
 * from the loaded policy document (fulfillmentPolicy.ts). It runs on the DRAFT
 * path (the review interaction), NEVER the compiler (P6: compilation runs
 * against accepted stable references).
 *
 * Generic operators (no domain knowledge of which records/fields are involved):
 * - membership:   every EVIDENCE value must be a member of the REQUIREMENT's
 *                 declared value set (the evidence must satisfy what the
 *                 requirement declared it accepts);
 * - ref-equality: the REQUIREMENT's selected values and the EVIDENCE's
 *                 selected values must intersect (the evidence names the
 *                 referent the requirement asks for).
 */

import { resolvePath } from '../lint/PathResolver.js';
import type { FulfillmentCompatibilityPolicy } from './fulfillmentPolicy.js';

export interface EvaluationResult {
  /** The declared requirement slot this evaluation covers (data-named). */
  requirementSlot: string;
  /** The verdict name — always the policy document's verdict for an outcome. */
  verdict: string;
  /** The declared fact paths this verdict rests on (data-derived basis). */
  basis: string[];
}

/** Select values at a declared path: unresolvable => []; scalar => one-item
 *  selection; array (incl. [*] projection) => as-is. */
function selectValues(data: Record<string, unknown>, path: string): unknown[] {
  const result = resolvePath(data, path);
  if (!result.found || result.value === undefined) return [];
  if (Array.isArray(result.value)) return result.value;
  return [result.value];
}

function presentValues(values: unknown[]): unknown[] {
  return values.filter(v => v !== undefined && v !== null && v !== '');
}

function key(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * Evaluate the policy's checks for one (requirement, evidence) pair. Returns
 * one EvaluationResult per applicable check — verdicts are the policy's, never
 * this module's.
 */
export function evaluateCompatibility(
  policy: FulfillmentCompatibilityPolicy,
  fulfilledBy: string,
  requirement: Record<string, unknown>,
  evidencePayload: Record<string, unknown>,
): EvaluationResult[] {
  const results: EvaluationResult[] = [];

  for (const check of policy.checksFor(fulfilledBy)) {
    const requirementValues = presentValues(selectValues(requirement, check.requirementPath));
    const evidenceValues = presentValues(
      check.evidencePaths.flatMap(path => selectValues(evidencePayload, path)),
    );

    let outcome: string;
    if (requirementValues.length === 0) {
      // A required declared fact is missing on the requirement side.
      outcome = 'missing-requirement-fact';
    } else if (evidenceValues.length === 0) {
      // The evidence names nothing to compare against.
      outcome = 'missing-evidence-fact';
    } else if (check.operator === 'membership') {
      const declared = new Set(requirementValues.map(key));
      outcome = evidenceValues.every(v => declared.has(key(v))) ? 'satisfied' : 'contradicted';
    } else if (check.operator === 'ref-equality') {
      const evidenceSet = new Set(evidenceValues.map(key));
      outcome = requirementValues.some(v => evidenceSet.has(key(v))) ? 'satisfied' : 'contradicted';
    } else {
      // An operator the interpreter does not implement fails LOUDLY — never a
      // silent pass and never a silent mismatch.
      throw new Error(`Fulfillment compatibility check '${check.id}' declares operator '${check.operator}' the evaluator does not implement`);
    }

    results.push({
      requirementSlot: check.requirementSlot,
      verdict: policy.verdictFor(outcome),
      basis: [check.requirementPath, ...check.evidencePaths],
    });
  }

  return results;
}
