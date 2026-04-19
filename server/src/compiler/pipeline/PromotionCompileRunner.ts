/**
 * PromotionCompileRunner
 *
 * A thin wrapper over PipelineRunner that executes the promotion-compile pipeline.
 * This runner is responsible for promoting extraction-draft candidates to canonical
 * records, producing both the canonical record and an extraction-promotion audit record.
 */

import { runPipeline, type PipelineSpec, type WhenEvaluator } from './PipelineRunner.js';
import type { PipelineState } from './types.js';
import { loadPipeline } from './PipelineLoader.js';
import { PassRegistry } from './PassRegistry.js';
import {
  createValidateExtractionCandidatePass,
  createResolveTargetSchemaPass,
  createProjectExtractionPromotionPass,
} from './passes/PromotionExtractionPasses.js';
import { createClassifyPromotionInputPass } from './passes/ClassifyPromotionInputPass.js';
import { createSchemaValidateDraftPass } from './passes/SchemaValidateDraftPass.js';
import { createValidateContextSourcePass, createProjectContextPromotionPass } from './passes/ContextPromotionPasses.js';

/**
 * Arguments for running a promotion compile.
 */
export interface PromotionCompileRunArgs {
  /** Path to the promotion-compile.yaml pipeline spec */
  pipelinePath: string;
  /** The candidate to promote */
  candidate: {
    target_kind: string;
    draft: unknown;
    confidence: number;
  };
  /** The recordId of the source extraction-draft */
  source_draft_id: string;
  /** Optional prefix for generated recordIds (default: 'XPR-') */
  recordIdPrefix?: string;
  /** Optional timestamp function for deterministic testing */
  now?: () => Date;
}

/**
 * Result of a promotion compile run.
 */
export interface PromotionCompileResult {
  ok: boolean;
  canonicalRecord?: unknown;
  auditRecord?: unknown;
  diagnostics: Array<{
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    pass_id?: string;
  }>;
  passStatuses: Array<{
    pass_id: string;
    status: 'ok' | 'failed' | 'skipped' | 'not_run';
    reason?: string;
  }>;
}

/**
 * Run the promotion-compile pipeline.
 *
 * This function:
 * 1. Loads the promotion-compile pipeline spec
 * 2. Registers all required passes (extraction branch + context passes)
 * 3. Executes the pipeline with the provided candidate
 * 4. Returns the canonical and audit records from the pipeline outputs
 *
 * @param args - Promotion compile arguments
 * @returns Result with canonical record, audit record, and diagnostics
 */
export async function runPromotionCompile(args: PromotionCompileRunArgs): Promise<PromotionCompileResult> {
  const registry = new PassRegistry();

  // Register the classify_promotion_input pass (parse family)
  registry.register(createClassifyPromotionInputPass());

  // Register context branch passes
  registry.register(createValidateContextSourcePass());
  registry.register(createProjectContextPromotionPass({
    recordIdPrefix: 'XCP-',
    ...(args.now ? { now: args.now } : {}),
  }));

  // Register extraction branch passes
  registry.register(createValidateExtractionCandidatePass());
  registry.register(createResolveTargetSchemaPass());
  
  // Register schema_validate_draft pass
  registry.register(createSchemaValidateDraftPass());

  // Register the project_extraction_promotion pass with the given prefix
  registry.register(createProjectExtractionPromotionPass({
    recordIdPrefix: args.recordIdPrefix ?? 'XPR-',
    ...(args.now ? { now: args.now } : {}),
  }));

  // Load the pipeline spec
  let spec: PipelineSpec;
  try {
    spec = loadPipeline(args.pipelinePath);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        severity: 'error',
        code: 'PIPELINE_LOAD_ERROR',
        message: error instanceof Error ? error.message : String(error),
      }],
      passStatuses: [],
    };
  }

  // Custom when evaluator that supports simple conditions like "meta.branch == 'extraction'"
  const whenEvaluator: WhenEvaluator = (condition: string, state: PipelineState): boolean => {
    if (condition === undefined || condition === null || condition.trim() === '') {
      return true;
    }
    
    // Support simple equality checks like "meta.branch == 'extraction'"
    const match = condition.match(/^meta\.(\w+)\s*==\s*['"](\w+)['"]$/);
    if (match) {
      const [, key, expectedValue] = match;
      const actualValue = state.meta[key as keyof typeof state.meta];
      return actualValue === expectedValue;
    }
    
    // Default: skip if condition is not empty
    return false;
  };

  // Run the pipeline
  // The promotion-compile pipeline expects input with:
  // - draft_record_id: the recordId of the extraction-draft
  // - candidate_path: path to the candidate within the draft (e.g., "candidates[0]")
  // - candidate: the actual candidate object
  const result = await runPipeline(spec, registry, {
    draft_record_id: args.source_draft_id,
    candidate_path: 'candidates[0]',
    candidate: args.candidate,
  }, whenEvaluator);

  // Extract outputs
  const canonicalRecord = result.outputs.get('project_extraction_promotion');
  const auditRecord = canonicalRecord; // For extraction branch, the projection IS the audit record

  // Convert diagnostics to the result format
  const diagnostics = result.diagnostics.map(d => ({
    severity: d.severity,
    code: d.code,
    message: d.message,
    pass_id: d.pass_id,
  }));

  // Convert pass statuses
  const passStatuses = result.pass_statuses.map(s => ({
    pass_id: s.pass_id,
    status: s.status,
    ...(s.reason !== undefined ? { reason: s.reason } : {}),
  }));

  return {
    ok: result.ok,
    canonicalRecord,
    auditRecord,
    diagnostics,
    passStatuses,
  };
}

/**
 * Load and return the promotion-compile pipeline spec.
 *
 * @param pipelinePath - Path to the promotion-compile.yaml file
 * @returns The validated PipelineSpec
 */
export function loadPromotionCompilePipeline(pipelinePath: string): PipelineSpec {
  return loadPipeline(pipelinePath);
}
