/**
 * CandidatePromoter - Promotes extraction-draft candidates to canonical records.
 * 
 * This module validates candidates against their target-kind schema and emits
 * canonical records along with extraction-promotion audit records.
 * 
 * Note: This is distinct from context-promotion (see PromotionCompiler.ts).
 * AI-extracted candidates do not come from computed contexts and must not
 * emit context-promotion records.
 */

import { createHash } from 'node:crypto';
import type { ExtractionCandidate } from './ExtractorAdapter.js';
import type { AmbiguitySpan } from './MentionResolver.js';

export interface SchemaValidator {
  validate(draft: unknown, schemaId: string): { ok: true } | { ok: false; errors: string[] };
}

export interface PromoteCandidateArgs {
  candidate: ExtractionCandidate & { ambiguity_spans?: AmbiguitySpan[] };
  draftRecordId: string;             // the XDR-* recordId the candidate came from
  candidatePath: string;             // JSON-path into XDR.candidates[] (e.g. "candidates[2]")
  sourceArtifactRef: { kind: 'file' | 'publication' | 'freetext'; id: string; locator?: string };
  targetRecordId: string;            // id to assign to the new canonical record
  promotionRecordId?: string;        // optional override; default `XPR-${targetRecordId}-v1`
  targetSchemaIdByKind: ReadonlyMap<string, string>;   // kind → $id
  validator: SchemaValidator;
  now?: () => Date;
}

export interface CanonicalRecord {
  kind: string;
  recordId: string;
  [k: string]: unknown;
}

export interface ExtractionPromotion {
  kind: 'extraction-promotion';
  recordId: string;                  // XPR-*
  output_kind: string;
  source_draft_ref: { kind: 'record'; id: string; type: 'extraction-draft' };
  candidate_path: string;
  source_artifact_ref: { kind: 'file' | 'publication' | 'freetext'; id: string; locator?: string };
  output_ref: { kind: 'record'; id: string; type: string };
  source_content_hash: string;
  promoted_at: string;
  version: 1;
}

export type PromotionOutcome =
  | { ok: true; record: CanonicalRecord; promotion: ExtractionPromotion }
  | { ok: false; reason: string; validation_errors?: string[] };

/**
 * Canonicalize a value for content hashing.
 * Recursively sorts object keys to ensure deterministic output.
 * 
 * KEEP IN SYNC with PromotionCompiler.ts canonicalize helper.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Compute a content hash for a record.
 * Uses SHA-256 and returns the full hex digest.
 */
function computeContentHash(record: unknown): string {
  const canon = canonicalize(record);
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

/**
 * Promote an extraction candidate to a canonical record.
 * 
 * @param args - Promotion arguments including candidate, validator, and schema registry
 * @returns PromotionOutcome - success with record+promotion, or failure with reason
 */
export function promoteCandidate(args: PromoteCandidateArgs): PromotionOutcome {
  const {
    candidate,
    draftRecordId,
    candidatePath,
    sourceArtifactRef,
    targetRecordId,
    promotionRecordId,
    targetSchemaIdByKind,
    validator,
    now
  } = args;

  // Guard: Check for unresolved ambiguity_spans
  // Note: The draft record's status enum (pending_review | partially_promoted | rejected | promoted)
  // lives on the parent extraction-draft per schema/workflow/extraction-draft.schema.yaml.
  // Gating on status is an upstream concern; this spec validates at the candidate level only.
  if (candidate.ambiguity_spans && candidate.ambiguity_spans.length > 0) {
    return {
      ok: false,
      reason: 'candidate has unresolved ambiguity_spans'
    };
  }

  // Guard: Check if schema is registered for target_kind
  const schemaId = targetSchemaIdByKind.get(candidate.target_kind);
  if (!schemaId) {
    return {
      ok: false,
      reason: `no schema registered for target_kind '${candidate.target_kind}'`
    };
  }

  // Validate the candidate's draft against the schema
  const validation = validator.validate(candidate.draft, schemaId);
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'schema validation failed',
      validation_errors: validation.errors
    };
  }

  // Mint the canonical record
  // Override kind and recordId even if the draft provided them
  const record: CanonicalRecord = {
    ...candidate.draft,
    kind: candidate.target_kind,
    recordId: targetRecordId
  };

  // Compute content hash
  const sourceContentHash = computeContentHash(record);

  // Create the extraction-promotion record
  const promotion: ExtractionPromotion = {
    kind: 'extraction-promotion',
    recordId: promotionRecordId ?? `XPR-${targetRecordId}-v1`,
    output_kind: candidate.target_kind,
    source_draft_ref: { kind: 'record', id: draftRecordId, type: 'extraction-draft' },
    candidate_path: candidatePath,
    source_artifact_ref: sourceArtifactRef,
    output_ref: { kind: 'record', id: targetRecordId, type: candidate.target_kind },
    source_content_hash: sourceContentHash,
    promoted_at: (now ? now() : new Date()).toISOString(),
    version: 1
  };

  return {
    ok: true,
    record,
    promotion
  };
}
