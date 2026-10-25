/**
 * FulfillmentDraft — MATRES-FULFIL §7.3/§7.4/§7.8: the fulfillment seam.
 *
 * Compiles a fulfillment envelope (attestation kind, zero new kinds — D4) from
 * the PINNED plan + the evidence record and hands a plain AttestationDraft to
 * the merged AttestationAcceptService (D9: ride, don't fork). This module is a
 * WRITER, not a policy engine:
 * - NO transition/verdict branch: the business rules (verb/fulfilledBy
 *   vocabulary, pin pairing, P8 trio, changedFacts-vary) fire through the
 *   LintEngine reading attestation.lint.yaml data at compile AND at accept.
 * - The compatibility evaluations are the policy DATA's verdicts
 *   (fulfillment-compatibility.yaml via fulfillmentPolicy.ts +
 *   evaluateCompatibility.ts — pure read, draft path only, NEVER the compiler
 *   per P6).
 * - against{} carries the reference-copies (plan ref + contentHash revision);
 *   draft.reads pins plan + evidence so accept gate 3 409s post-review drift
 *   (§7.4 structural scoping). Fulfillment writes NOTHING except its own
 *   attestation record — the plan, the requirement object, and the shared
 *   material-spec are never mutated (AC-5).
 * - The copied snapshot fields (assertion.requirementIds /
 *   assertion.componentRefs) are reference-copies of the pinned plan's
 *   requirement occurrence ids and composition component refs (F6 stance:
 *   top-level AND one level of nested composition entries; deeper nesting is
 *   a RECORDED limitation).
 * - claimStatus is the drafting side's DECLARATION carried verbatim (OQ-4
 *   inherited — the server never derives or rewrites it); occurredAt is never
 *   synthesized (occurredAtStatus unknown is the terminal-honest default).
 * - exactOptionalPropertyTypes (server/tsconfig.json:13): optional fields are
 *   absent-or-value via the conditional-spread idiom (FormDraftService.ts:59/
 *   :80-81 shape), never key:undefined.
 */

import type { RecordStore } from '../store/types.js';
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { resolvePath } from '../lint/PathResolver.js';
import type { AttestationDraft } from '../attestation/AttestationAcceptService.js';
import { evaluateCompatibility } from './evaluateCompatibility.js';
import { loadFulfillmentCompatibilityPolicy, defaultFulfillmentPolicyPath } from './fulfillmentPolicy.js';

/** The drafting-side request for one fulfillment (or re-evaluation) draft. */
export interface FulfillmentDraftRequest {
  draftId: string;
  revision: number;
  /** The pinned plan (event-graph) record the requirement occurrence lives in. */
  planRecordId: string;
  /** The requirement occurrence id (REQE- family, requirementId.ts law). */
  requirementId: string;
  /** The evidence record (RECV receipt / material-derivation / instance-aliquot). */
  evidenceRecordId: string;
  /** Evidence family — the lint vocabulary [receipt | derivation | instance]. */
  fulfilledBy: string;
  /** DECLARED claim label carried verbatim (never derived, never rewritten). */
  claimStatus: string;
  /** Optional per-component anchor (D3: componentRef, no second id system). */
  componentRef?: string;
  /** Case-5 re-evaluation: append a NEW record superseding the prior fulfillment. */
  reEvaluation?: {
    supersedesRecordId: string;
    changedFacts: Record<string, unknown>;
  };
  /** Fixture-injectable policy path (per-call load; production default otherwise). */
  policyPath?: string;
}

interface RequirementOccurrence {
  event: Record<string, unknown>;
  requirement: Record<string, unknown>;
}

/** Find the requirement occurrence by its stable id inside the pinned plan.
 *  NOT FOUND throws naming the requirement + plan (the §7.2 escape: the
 *  fulfillment-side check reads the pinned plan and names the missing
 *  occurrence — the lint DSL cannot express pairwise plan-side uniqueness). */
function findRequirementOccurrence(planPayload: Record<string, unknown>, requirementId: string, planRecordId: string): RequirementOccurrence {
  const events = Array.isArray(planPayload.events) ? (planPayload.events as Record<string, unknown>[]) : [];
  for (const event of events) {
    const details = object(event.details);
    const requirement = object(details.material_source_requirement);
    if (requirement.requirementId === requirementId) return { event, requirement };
  }
  throw new Error(`Requirement occurrence '${requirementId}' not found in pinned plan '${planRecordId}' — a fulfillment must name a requirement the pinned plan declares`);
}

/** Copy the pinned plan's composition component refs (F6 stance: top-level
 *  entries AND one level of nested composition entries — the copy iterates
 *  the nested level manually; PathResolver's nested wildcard resolution was
 *  probe-proven but is not what this loop uses (advc O3 precision); deeper
 *  nesting is a RECORDED limitation, named in the lint rule description and
 *  the report, never a silent assumption). */
function copyComponentRefs(event: Record<string, unknown>, requirement: Record<string, unknown>): string[] {
  const collected = new Set<string>();
  const snapshots = [
    ...(Array.isArray(object(event.details).composition_snapshot) ? (object(event.details).composition_snapshot as unknown[]) : []),
    ...(Array.isArray(requirement.composition_snapshot) ? (requirement.composition_snapshot as unknown[]) : []),
  ];
  for (const entry of snapshots) {
    const entryObj = object(entry);
    const topRef = resolvePath(entryObj, 'component_ref.id');
    if (topRef.found && typeof topRef.value === 'string') collected.add(topRef.value);
    if (Array.isArray(entryObj.composition)) {
      for (const nested of entryObj.composition as unknown[]) {
        const nestedRef = resolvePath(object(nested), 'component_ref.id');
        if (nestedRef.found && typeof nestedRef.value === 'string') collected.add(nestedRef.value);
      }
    }
  }
  return [...collected].sort();
}

/**
 * Compile the fulfillment draft: read the pinned plan + evidence, run the
 * declared compatibility evaluation, assemble the envelope, and pin the reads.
 * Writes nothing canonical — the accept service owns the write (D9).
 */
export async function compileFulfillmentDraft(
  store: RecordStore,
  request: FulfillmentDraftRequest,
): Promise<AttestationDraft> {
  const planEnvelope = await store.get(request.planRecordId);
  if (!planEnvelope) {
    throw new Error(`Pinned plan '${request.planRecordId}' not found — a fulfillment draft cannot compile without the plan it is scoped to`);
  }
  const evidenceEnvelope = await store.get(request.evidenceRecordId);
  if (!evidenceEnvelope) {
    throw new Error(`Evidence record '${request.evidenceRecordId}' not found — fulfillment is fulfillment-BY-EVIDENCE, never by assumption`);
  }

  const planPayload = object(planEnvelope.payload);
  const evidencePayload = object(evidenceEnvelope.payload);
  const { event, requirement } = findRequirementOccurrence(planPayload, request.requirementId, request.planRecordId);

  const policy = loadFulfillmentCompatibilityPolicy(request.policyPath ?? defaultFulfillmentPolicyPath());
  const evaluations = evaluateCompatibility(policy, request.fulfilledBy, requirement, evidencePayload);

  const verb = request.reEvaluation !== undefined ? 're-evaluates-fulfillment' : 'fulfills';

  const assertion: Record<string, unknown> = {
    verb,
    about: { kind: 'record', type: 'event-requirement', id: request.requirementId },
    fulfilledBy: request.fulfilledBy,
    // §7.3: evidence is a ref-shaped object (never a bare string), riding the
    // shared ref datatype; the evidence record's own kind is its ref type.
    evidence: { kind: 'record', type: String(object(evidenceEnvelope.payload).kind ?? ''), id: request.evidenceRecordId },
    // Citation makes the case-5 obligation LIVE through
    // CurrentAssertionView.reevaluationObligations (the shipped law: a
    // supersession nobody cites yields nothing to re-evaluate).
    cites: request.evidenceRecordId,
    requirementIds: [request.requirementId],
    componentRefs: copyComponentRefs(event, requirement),
    evaluations,
    ...(request.componentRef !== undefined ? { componentRef: request.componentRef } : {}),
  };

  const claim: Record<string, unknown> = {
    claimStatus: request.claimStatus,
    assertion,
    // Terminal-honest default (Q5): the compile never synthesizes occurredAt.
    occurredAtStatus: 'unknown',
  };

  const envelope: Record<string, unknown> = {
    kind: 'attestation',
    artifactKind: 'attestation-chain',
    claims: [claim],
    // §7.4 reference-copy pinning: plan ref + the revision the plan had at
    // compile. A post-review plan edit cannot ride this accept (gate 3 409);
    // a re-compile re-pins (different revision -> different content-hash id).
    against: {
      eventGraphRef: { kind: 'record', type: 'event-graph', id: request.planRecordId },
      graphRevision: contentHash(planPayload),
    },
    ...(request.reEvaluation !== undefined
      ? {
          supersedes: { kind: 'record', type: 'attestation', id: request.reEvaluation.supersedesRecordId },
          correction: {
            claimTarget: { mode: 'same-entity-reattribute' },
            changedFacts: { ...request.reEvaluation.changedFacts },
          },
        }
      : {}),
  };

  return {
    draftId: request.draftId,
    revision: request.revision,
    envelope,
    // Accept gate 3 re-checks these pinned reads (AttestationAcceptService).
    reads: {
      [request.planRecordId]: contentHash(planPayload),
      [request.evidenceRecordId]: contentHash(evidencePayload),
    },
  };
}
