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
 */

import { chunkText, type ChunkOptions } from './TextChunker.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from './ExtractionRunnerService.js';
import type { ExtractionDraftBody } from './ExtractionDraftBuilder.js';

export interface RunChunkedExtractionOpts {
  thresholdChars?: number;
  chunkOpts?: ChunkOptions;
}

export async function runChunkedExtractionService(
  service: ExtractionRunnerService,
  baseRequest: RunExtractionServiceArgs,
  opts: RunChunkedExtractionOpts = {},
): Promise<ExtractionDraftBody> {
  const threshold = opts.thresholdChars ?? 12000;

  // Below threshold: single call, return unchanged (byte-identical to direct call)
  if (baseRequest.text.length <= threshold) {
    return service.run(baseRequest);
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
      const result = await service.run({ ...baseRequest, text: chunk.text });
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
  } as ExtractionDraftBody;
}
