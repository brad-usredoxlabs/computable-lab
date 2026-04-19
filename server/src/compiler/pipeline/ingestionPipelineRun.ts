/**
 * Ingestion pipeline runner.
 * 
 * This module provides an end-to-end entrypoint for running the ingestion-compile
 * pipeline, which ingests PDFs and produces extraction-draft records.
 */

import type { ExtractorAdapter } from '../../extract/ExtractorAdapter.js';
import type { ResolutionCandidate } from '../../extract/MentionResolver.js';
import { PassRegistry } from './PassRegistry.js';
import { runPipeline, type PipelineSpec } from './PipelineRunner.js';
import { createPdfTextExtractPass, createChunkTextPass, createMultiChunkExtractorPass } from './passes/IngestionPasses.js';
import { createMentionResolvePass, createDraftAssemblePass } from './passes/ExtractionPasses.js';
import * as fs from 'fs';
import * as yaml from 'yaml';

/**
 * Arguments for running the ingestion pipeline.
 */
export interface RunIngestionPipelineArgs {
  /** Path to the pipeline YAML file */
  pipelinePath: string;
  
  /** The extractor adapter to use */
  extractor: ExtractorAdapter;
  
  /** Map from kind to list of resolution candidates (for mention resolution) */
  candidatesByKind: ReadonlyMap<string, ReadonlyArray<ResolutionCandidate>>;
  
  /** Source artifact metadata */
  source_artifact: {
    kind: 'file' | 'publication' | 'freetext';
    id: string;
    locator?: string;
  };
  
  /** The PDF buffer to process */
  pdfBuffer: Buffer | Uint8Array;
  
  /** Optional prefix for the extraction-draft record ID */
  recordIdPrefix?: string;
  
  /** Optional maximum chunk characters (default: 2000) */
  maxChunkChars?: number;
}

/**
 * Run the ingestion-compile pipeline.
 * 
 * This function:
 * 1. Builds a fresh PassRegistry with ingestion-specific passes
 * 2. Loads the pipeline YAML from the specified path
 * 3. Runs the pipeline with the provided PDF buffer
 * 
 * @param args - Arguments for running the pipeline
 * @returns Pipeline run result with outputs and diagnostics
 */
export async function runIngestionPipeline(args: RunIngestionPipelineArgs) {
  const {
    pipelinePath,
    extractor,
    candidatesByKind,
    source_artifact,
    pdfBuffer,
    recordIdPrefix,
    maxChunkChars,
  } = args;

  // Build a fresh PassRegistry
  const registry = new PassRegistry();

  // Register ingestion passes
  registry.register(createPdfTextExtractPass());
  registry.register(createChunkTextPass(maxChunkChars ?? 2000));
  registry.register(createMultiChunkExtractorPass(extractor));
  registry.register(createMentionResolvePass(candidatesByKind));
  registry.register(
    createDraftAssemblePass({
      recordIdPrefix: recordIdPrefix ?? 'XDR-ingestion-',
      source_artifact,
    })
  );

  // Load pipeline from YAML
  const pipelineYaml = fs.readFileSync(pipelinePath, 'utf-8');
  const pipelineSpec: PipelineSpec = yaml.parse(pipelineYaml);

  // Run the pipeline
  const result = await runPipeline(pipelineSpec, registry, { pdfBuffer });

  return result;
}
