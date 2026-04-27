/**
 * Extraction pipeline runner.
 * 
 * This module provides an end-to-end entrypoint for running the extraction
 * pipeline, which transforms source text into an extraction-draft record.
 */

import { PassRegistry } from './PassRegistry.js';
import { runPipeline } from './PipelineRunner.js';
import { loadPipeline } from './PipelineLoader.js';
import { createExtractorRunPass, createMentionResolvePass, createDraftAssemblePass } from './passes/ExtractionPasses.js';
import type { ExtractorAdapter } from '../../extract/ExtractorAdapter.js';
import type { ResolutionCandidate } from '../../extract/MentionResolver.js';

/**
 * Arguments for running the extraction pipeline.
 */
export interface RunExtractionPipelineArgs {
  pipelinePath: string;                                                 // path to extraction-compile.yaml
  extractor: ExtractorAdapter;
  candidatesByKind: ReadonlyMap<string, ReadonlyArray<ResolutionCandidate>>;
  source_artifact: { kind: 'file' | 'publication' | 'freetext'; id: string; locator?: string };
  text: string;
  recordIdPrefix?: string;
  /** Optional target kinds the extractor should look for. */
  target_kinds?: string[];
  /** Optional hint object passed through to downstream passes. */
  hint?: Record<string, unknown>;
}

/**
 * Run the extraction pipeline end-to-end.
 * 
 * This function:
 * 1. Creates a pass registry with the three extraction passes
 * 2. Loads the pipeline specification from the YAML file
 * 3. Runs the pipeline via PipelineRunner
 * 
 * @param args - Arguments for running the pipeline
 * @returns The pipeline run result
 */
export async function runExtractionPipeline(args: RunExtractionPipelineArgs) {
  const registry = new PassRegistry();
  
  // Register the three extraction passes
  registry.register(createExtractorRunPass(args.extractor));
  registry.register(createMentionResolvePass(args.candidatesByKind));
  registry.register(createDraftAssemblePass({
    recordIdPrefix: args.recordIdPrefix ?? 'XDR-run-',
    source_artifact: args.source_artifact,
  }));
  
  // Load the pipeline specification
  const spec = loadPipeline(args.pipelinePath);
  
  // Run the pipeline — pass target_kinds and hint through to state so downstream
  // passes can read them (spec-019: hint pass-through).
  return runPipeline(spec, registry, {
    text: args.text,
    ...(args.target_kinds !== undefined && { target_kinds: args.target_kinds }),
    ...(args.hint !== undefined && { hint: args.hint }),
  });
}
