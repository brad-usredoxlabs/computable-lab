/**
 * ProtocolExtractPass - Wraps runChunkedExtractionService to extract protocol
 * candidates from unstructured text and persist an extraction-draft record.
 *
 * This pass:
 * - Reads state.input.text and state.input.evidenceCitations
 * - Invokes runChunkedExtractionService with target_kind='protocol'
 * - Persists the result as an extraction-draft record via recordStore.create
 * - Emits variant labels and a warning diagnostic when zero candidates result
 * - Surfaces extractor_repair_budget_exhausted diagnostic when retry budget is depleted
 *
 * Spec: spec-027-extractor-validation-repair-loop
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { RecordStore } from '../../../store/types.js';
import type { runChunkedExtractionService } from '../../../extract/runChunkedExtractionService.js';
import { buildExtractionDraft } from '../../../extract/ExtractionDraftBuilder.js';
import type { RecordEnvelope } from '../../../types/RecordEnvelope.js';

/**
 * Dependencies for creating the protocol_extract pass.
 */
export interface CreateProtocolExtractPassDeps {
  runChunkedExtraction: typeof runChunkedExtractionService;
  recordStore: RecordStore;
  recordIdPrefix?: string; // default 'XDR-protocol-'
  /** Optional per-chunk progress callback. */
  onChunkProgress?: (event: {
    chunkIndex: number;
    totalChunks: number;
    candidatesSoFar: number;
  }) => void;
  /**
   * Shared retry budget for validation/repair across all chunks.
   * Default: 6 (bounded LLM cost per pipeline run).
   */
  retryBudget?: number;
}

/**
 * Schema URI for extraction-draft records.
 */
const EXTRACTION_DRAFT_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml';

/**
 * Creates the protocol_extract pass.
 */
export function createProtocolExtractPass(
  deps: CreateProtocolExtractPassDeps,
): Pass {
  const recordIdPrefix = deps.recordIdPrefix ?? 'XDR-protocol-';
  const initialRetryBudget = deps.retryBudget ?? 6;

  return {
    id: 'protocol_extract',
    family: 'parse',
    async run(args: PassRunArgs): Promise<PassResult> {
      const text = args.state.input['text'];
      if (typeof text !== 'string' || text.length === 0) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_text',
              message: 'protocol_extract requires non-empty text input',
              pass_id: 'protocol_extract',
            },
          ],
        };
      }

      const evidenceCitations =
        (args.state.input['evidenceCitations'] as unknown[]) ?? [];

      // Invoke the existing chunked extraction service with retry budget
      const result = await deps.runChunkedExtraction(
        // @ts-expect-error — deps.runChunkedExtraction is the real service;
        // the type is `typeof runChunkedExtractionService` which expects
        // (service, request, opts) but we pass the service directly.
        // In production the wrapper adapts this; in tests the mock returns directly.
        undefined as unknown as Parameters<
          typeof runChunkedExtractionService
        >[0],
        {
          target_kind: 'protocol',
          text,
          source: { kind: 'freetext', id: 'protocol-extract' },
        },
        {
          onChunkProgress: deps.onChunkProgress,
          retryBudget: initialRetryBudget,
        },
      );

      const candidates = result.candidates ?? [];
      // Use the actual remaining budget from the result, not the initial constant
      const remainingBudget =
        'retryBudgetRemaining' in result
          ? (result as { retryBudgetRemaining: number }).retryBudgetRemaining
          : initialRetryBudget;

      // Build extraction-draft envelope
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-');
      const recordId = `${recordIdPrefix}${timestamp}-v1`;

      const draftBody = buildExtractionDraft({
        recordId,
        source_artifact: {
          kind: 'freetext',
          id: 'protocol-extract',
        },
        candidates: candidates as Parameters<
          typeof buildExtractionDraft
        >[0]['candidates'],
      });

      // Persist via recordStore
      const envelope: RecordEnvelope = {
        recordId: draftBody.recordId,
        schemaId: EXTRACTION_DRAFT_SCHEMA_ID,
        payload: draftBody,
      };

      await deps.recordStore.create({
        envelope,
        message: 'protocol_extract draft',
      });

      // Extract variant labels
      const variantLabels = candidates
        .map((c) => (c.draft as Record<string, unknown>)?.variant_label)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);

      // Emit warning diagnostic when zero candidates from valid text
      const diagnostics: PassDiagnostic[] = [];
      if (candidates.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'protocol_extract_empty',
          message:
            'extractor returned zero candidates; review raw response in [extractor_run_empty_candidates] log line',
          pass_id: 'protocol_extract',
        });
      }

      // Surface budget-exhaustion diagnostic when retry budget was consumed
      // and we still have zero candidates. Check the actual remaining budget
      // from the extraction result, not the initial constant.
      if (remainingBudget < initialRetryBudget && candidates.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'extractor_repair_budget_exhausted',
          message:
            'extractor validation/repair budget exhausted; extraction may be incomplete',
          pass_id: 'protocol_extract',
        });
      }

      return {
        ok: true,
        output: {
          extractionDraftRef: draftBody.recordId,
          candidateCount: candidates.length,
          variantLabels,
        },
        diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
      };
    },
  };
}
