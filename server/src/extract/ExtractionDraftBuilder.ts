/**
 * ExtractionDraftBuilder - Builds extraction-draft records from extraction candidates.
 * 
 * This module provides a pure function to assemble an extraction-draft record
 * (spec-035) from extraction candidates and ambiguity spans.
 */

import type { ExtractionCandidate } from './ExtractorAdapter.js';
import type { AmbiguitySpan } from './MentionResolver.js';
import type { PassDiagnostic } from '../compiler/pipeline/types.js';

/**
 * Arguments for building an extraction draft.
 */
export interface BuildExtractionDraftArgs {
  recordId: string;                                   // e.g., XDR-<slug>-v1
  source_artifact: { kind: 'file' | 'publication' | 'freetext'; id: string; locator?: string };
  candidates: ExtractionCandidate[];
  ambiguity_spans_by_candidate?: AmbiguitySpan[][];   // index-aligned with candidates
  diagnostics?: PassDiagnostic[];
  extractor_profile?: string;
  now?: () => Date;
}

/**
 * A candidate in an extraction draft with optional status tracking.
 */
export interface ExtractionDraftCandidate extends ExtractionCandidate {
  ambiguity_spans?: AmbiguitySpan[];
  status?: 'promoted' | 'rejected';
  evidence_span?: string;
  uncertainty?: string;
}

/**
 * The body of an extraction-draft record.
 */
export interface ExtractionDraftBody {
  kind: 'extraction-draft';
  recordId: string;
  source_artifact: BuildExtractionDraftArgs['source_artifact'];
  status: 'pending_review' | 'partially_promoted' | 'rejected' | 'promoted';
  candidates: ExtractionDraftCandidate[];
  created_at: string;                                 // ISO
  diagnostics?: PassDiagnostic[];
  extractor_profile?: string;
  notes?: string;
}

/**
 * Full extraction draft record type (for use in handlers).
 */
export interface ExtractionDraft extends ExtractionDraftBody {
  // Same as ExtractionDraftBody but may be extended in the future
}

/**
 * Build an extraction-draft record body from extraction candidates.
 * 
 * This is a pure function that assembles an extraction-draft record
 * from the results of extraction and mention resolution.
 * 
 * @param args - Arguments for building the draft
 * @returns The extraction-draft record body
 * @throws Error if recordId does not start with 'XDR-'
 */
export function buildExtractionDraft(args: BuildExtractionDraftArgs): ExtractionDraftBody {
  // Validate recordId prefix
  if (!args.recordId.startsWith('XDR-')) {
    throw new Error(`recordId must start with 'XDR-', got: ${args.recordId}`);
  }

  // Build per-candidate ambiguity spans by folding provided spans with existing ones
  const candidatesWithSpans: Array<ExtractionCandidate & { ambiguity_spans?: AmbiguitySpan[] }> =
    args.candidates.map((candidate, index) => {
      const existingSpans = candidate.ambiguity_spans ?? [];
      const providedSpans = args.ambiguity_spans_by_candidate?.[index] ?? [];
      
      // Concatenate: existing spans first, then provided spans
      const allSpans = [...existingSpans, ...providedSpans];
      
      // Only include ambiguity_spans if there are any
      if (allSpans.length > 0) {
        return {
          ...candidate,
          ambiguity_spans: allSpans
        };
      }
      
      return candidate;
    });

  // Generate created_at timestamp
  const nowFn = args.now ?? (() => new Date());
  const createdAt = nowFn().toISOString();

  const body: ExtractionDraftBody = {
    kind: 'extraction-draft',
    recordId: args.recordId,
    source_artifact: args.source_artifact,
    status: 'pending_review',
    candidates: candidatesWithSpans,
    created_at: createdAt
  };

  if (args.diagnostics && args.diagnostics.length > 0) body.diagnostics = args.diagnostics;
  if (args.extractor_profile) body.extractor_profile = args.extractor_profile;

  return body;
}
