/**
 * ChunkedExtractionMerger - runs an extractor over text chunks and merges results.
 * 
 * This module implements the logic for processing long documents by chunking them,
 * running extraction on each chunk, and merging the results with deduplication.
 */

import type { ExtractorAdapter, ExtractionRequest, ExtractionResult, ExtractionCandidate, ExtractionDiagnostic } from './ExtractorAdapter.js';
import { chunkText, type ChunkOptions } from './TextChunker.js';

export interface RunChunkedExtractionArgs {
  text: string;
  extractor: ExtractorAdapter;
  hint?: ExtractionRequest['hint'];
  chunkOpts?: ChunkOptions;
}

/**
 * Runs extraction over text chunks and merges the results.
 * 
 * - Splits text into chunks using chunkText
 * - Invokes extractor.extract() sequentially for each chunk
 * - Concatenates all candidates
 * - Deduplicates candidates with identical (target_kind, draft JSON) keeping highest confidence
 * - Preserves diagnostics with chunk_index metadata
 * 
 * @param args - Extraction arguments including text, extractor, optional hint and chunk options
 * @returns Merged extraction result with deduplicated candidates and all diagnostics
 */
export async function runChunkedExtraction(args: RunChunkedExtractionArgs): Promise<ExtractionResult> {
  const chunks = chunkText(args.text, args.chunkOpts);
  const all: ExtractionCandidate[] = [];
  const allDiags: ExtractionDiagnostic[] = [];
  
  for (const chunk of chunks) {
    const req: ExtractionRequest = { text: chunk.text };
    if (args.hint) {
      req.hint = args.hint;
    }
    const r = await args.extractor.extract(req);
    
    // Collect all candidates
    for (const c of r.candidates) {
      all.push(c);
    }
    
    // Collect diagnostics with chunk_index metadata
    for (const d of r.diagnostics) {
      allDiags.push({
        ...d,
        details: { ...(d.details as Record<string, unknown> ?? {}), chunk_index: chunk.index },
      });
    }
  }
  
  // Deduplicate on (target_kind, JSON.stringify(draft))
  // Keep the candidate with the highest confidence
  const seen = new Map<string, ExtractionCandidate>();
  for (const c of all) {
    const key = `${c.target_kind}::${JSON.stringify(c.draft)}`;
    const prior = seen.get(key);
    if (!prior || (c.confidence ?? 0) > (prior.confidence ?? 0)) {
      seen.set(key, c);
    }
  }
  
  return {
    candidates: Array.from(seen.values()),
    diagnostics: allDiags,
  };
}
