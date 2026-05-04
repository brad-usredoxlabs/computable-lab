/**
 * runChunkedExtractionService - Chunked wrapper around ExtractionRunnerService.run().
 *
 * This module provides a thin wrapper that splits long text into chunks before
 * calling the extraction service, preventing inference timeouts on multi-page PDFs.
 *
 * - Below threshold (default 12 000 chars) → single service.run() call, returned unchanged.
 * - Above threshold → chunkText with defaults { maxCharsPerChunk: 8000, overlapChars: 200 },
 *   sequential service.run() per chunk, candidates deduplicated by
 *   `${target_kind}::${JSON.stringify(draft)}` keeping highest confidence.
 * - A single chunk rejection produces a chunk-tagged warning diagnostic and does NOT abort.
 * - Shared retry budget (default 6) is tracked across all chunks for validation/repair.
 *   When a chunk's extraction fails schema validation, the service retries up to 2
 *   additional times with the validation error appended to the prompt.
 *
 * Spec: spec-027-extractor-validation-repair-loop
 */

import { chunkText, type ChunkOptions } from './TextChunker.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from './ExtractionRunnerService.js';
import type { ExtractionDraftBody } from './ExtractionDraftBuilder.js';

/**
 * Per-chunk progress callback invoked after each chunk completes.
 */
export type OnChunkProgress = (event: {
  chunkIndex: number;
  totalChunks: number;
  candidatesSoFar: number;
}) => void;

export interface RunChunkedExtractionOpts {
  thresholdChars?: number;
  chunkOpts?: ChunkOptions;
  /** Optional callback invoked after each chunk completes. */
  onChunkProgress?: OnChunkProgress;
  /**
   * Shared retry budget for validation/repair across all chunks.
   * Each retry attempt decrements this counter. When exhausted,
   * subsequent chunks skip retry and log directly.
   * Default: 6 (bounded LLM cost per pipeline run).
   */
  retryBudget?: number;
}

/**
 * Return type for runChunkedExtractionService.
 * Extends ExtractionDraftBody with retry budget tracking.
 */
export interface RunChunkedExtractionResult extends ExtractionDraftBody {
  /** Remaining retry budget after all chunks have been processed. */
  retryBudgetRemaining: number;
}

/**
 * Run extraction on text, chunked if necessary.
 *
 * @param service - The extraction runner service
 * @param baseRequest - The extraction request
 * @param opts - Optional configuration
 * @returns The assembled extraction-draft body plus remaining retry budget
 */
export async function runChunkedExtractionService(
  service: ExtractionRunnerService,
  baseRequest: RunExtractionServiceArgs,
  opts: RunChunkedExtractionOpts = {},
): Promise<RunChunkedExtractionResult> {
  const threshold = opts.thresholdChars ?? 12000;
  const retryBudget = { remaining: opts.retryBudget ?? 6 };

  // Below threshold: single call with retry logic, return unchanged
  if (baseRequest.text.length <= threshold) {
    const result = await runWithRetry(service, baseRequest, retryBudget, 0);
    return {
      ...result,
      retryBudgetRemaining: retryBudget.remaining,
    };
  }

  const chunks = chunkText(baseRequest.text, opts.chunkOpts ?? {
    maxCharsPerChunk: 8000,
    overlapChars: 200,
  });

  console.log('[extract_entities] chunked', {
    chunks: chunks.length,
    totalChars: baseRequest.text.length,
  });

  // Sequentially run per chunk; collect successes, tag failures
  const candidates: Array<{
    target_kind: string;
    draft: unknown;
    confidence?: number;
  }> = [];
  const diagnostics: Array<{
    severity: 'warning' | 'error' | 'info';
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }> = [];
  let firstShape: ExtractionDraftBody | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;

    try {
      const result = await runWithRetry(
        service,
        { ...baseRequest, text: chunk.text },
        retryBudget,
        i,
      );
      if (firstShape === null) firstShape = result;
      for (const c of result.candidates ?? []) {
        candidates.push({
          target_kind: c.target_kind,
          draft: c.draft,
          confidence: c.confidence,
        });
      }
      for (const d of result.diagnostics ?? []) {
        diagnostics.push(d);
      }
    } catch (err) {
      diagnostics.push({
        severity: 'warning',
        code: 'chunk_extraction_failed',
        message: err instanceof Error ? err.message : String(err),
        details: {
          chunk_index: i,
          error_message: err instanceof Error ? err.message : String(err),
        },
      });
    }
    // Invoke per-chunk progress callback (fire-and-forget)
    if (opts.onChunkProgress) {
      try {
        opts.onChunkProgress({
          chunkIndex: i,
          totalChunks: chunks.length,
          candidatesSoFar: candidates.length,
        });
      } catch (err) {
        console.warn('[protocol_extract_progress_callback_error]', err);
      }
    }
  }

  // Dedup using ChunkedExtractionMerger.ts:58-65 pattern:
  // key = `${target_kind}::${JSON.stringify(draft)}`, keep highest confidence
  const seen = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) {
    const key = `${c.target_kind}::${JSON.stringify(c.draft)}`;
    const prior = seen.get(key);
    if (!prior || (c.confidence ?? 0) > (prior.confidence ?? 0)) {
      seen.set(key, c);
    }
  }

  return {
    ...(firstShape ?? {} as ExtractionDraftBody),
    candidates: Array.from(seen.values()) as ExtractionDraftBody['candidates'],
    diagnostics: diagnostics as ExtractionDraftBody['diagnostics'],
    retryBudgetRemaining: retryBudget.remaining,
  } as RunChunkedExtractionResult;
}

/**
 * Run a single chunk extraction with validation/repair retry loop.
 *
 * When the extraction service returns zero candidates (indicating a
 * validation failure), this function retries up to 2 additional times
 * with the validation error appended to the prompt.
 *
 * @param service - The extraction runner service
 * @param request - The extraction request for this chunk
 * @param retryBudget - Shared retry budget (mutated in-place)
 * @param chunkIndex - Index of this chunk (for logging)
 * @returns The extraction-draft body for this chunk
 */
async function runWithRetry(
  service: ExtractionRunnerService,
  request: RunExtractionServiceArgs,
  retryBudget: { remaining: number },
  chunkIndex: number,
): Promise<ExtractionDraftBody> {
  const MAX_ATTEMPTS = 3;
  let lastError: string | null = null;
  let lastRawResponse: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (retryBudget.remaining <= 0 && attempt > 1) {
      console.warn(
        `[extractor_run_repair_budget_exhausted] chunkIndex=${chunkIndex}`,
      );
      break;
    }

    // Build the request for this attempt. On retries, include the prior
    // validation error in the hint so the adapter can append it to the
    // user message.
    const attemptRequest: RunExtractionServiceArgs =
      attempt > 1 && lastError
        ? {
            ...request,
            hint: { ...(request.hint ?? {}), prev_validation_error: lastError },
          }
        : request;

    const result = await service.run(attemptRequest);

    if (result.candidates && result.candidates.length > 0) {
      return result;
    }

    // Capture validation error + raw response from result diagnostics.
    // Failure signals: any diagnostic with code extractor_parse_error,
    // candidate_malformed, or extractor_repair_exhausted; otherwise fall
    // back to a generic "zero candidates" message so existing behavior
    // (zero-candidate retry) is preserved.
    const failureDiag = (result.diagnostics ?? []).find((d) =>
      d.code === 'extractor_parse_error' ||
      d.code === 'candidate_malformed' ||
      d.code === 'extractor_empty_choices' ||
      d.code === 'extractor_empty_candidates' ||
      d.code === 'extractor_repair_exhausted',
    );
    lastError = failureDiag?.message ?? `Zero candidates returned on attempt ${attempt}`;
    const failDetails = failureDiag?.details as Record<string, unknown> | undefined;
    if (failDetails && typeof failDetails['rawResponse'] === 'string') {
      lastRawResponse = failDetails['rawResponse'] as string;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.warn(
        `[extractor_run_repair_attempt_${attempt}] chunkIndex=${chunkIndex}`,
      );
      retryBudget.remaining = Math.max(0, retryBudget.remaining - 1);
    }
  }

  console.warn(
    `[extractor_run_repair_exhausted] chunkIndex=${chunkIndex} lastError=${lastError ?? 'unknown'}`,
  );

  return {
    kind: 'extraction-draft',
    recordId: `XDR-chunk-${chunkIndex}-v1`,
    source_artifact: request.source,
    status: 'rejected',
    candidates: [],
    created_at: new Date().toISOString(),
    diagnostics: [
      {
        severity: 'warning',
        code: 'extractor_repair_exhausted',
        message: `Extraction failed after ${MAX_ATTEMPTS} attempts for chunk ${chunkIndex}`,
        pass_id: 'protocol_extract',
        details: {
          chunk_index: chunkIndex,
          last_error: lastError,
          last_raw_response: lastRawResponse,
        },
      },
    ],
  };
}
