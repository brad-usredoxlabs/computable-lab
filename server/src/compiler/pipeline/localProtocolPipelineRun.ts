/**
 * Local-protocol pipeline runner helper.
 *
 * This module provides a convenience function to run the local-protocol-compile
 * pipeline, wiring together the YAML spec with pass implementations.
 */

import { PassRegistry } from './PassRegistry.js';
import { runPipeline, type PipelineSpec } from './PipelineRunner.js';
import { loadPipeline } from './PipelineLoader.js';
import type { Pass } from './types.js';

/**
 * Arguments for running the local-protocol pipeline.
 */
export interface RunLocalProtocolPipelineArgs {
  /** Path to the local-protocol-compile.yaml file */
  pipelinePath: string;
  /** Pass implementations for each pass id in the pipeline */
  passes: Pass[];
  /** Input data for the pipeline */
  input: Record<string, unknown>;
}

/**
 * Run the local-protocol-compile pipeline.
 *
 * This function:
 * 1. Builds a PassRegistry and registers the provided passes
 * 2. Loads the pipeline YAML via PipelineLoader
 * 3. Verifies every pass id in the spec is registered
 * 4. Runs the pipeline and returns the result
 *
 * @param args - Pipeline path, pass implementations, and input data
 * @returns PipelineRunResult with outputs, diagnostics, and pass statuses
 * @throws Error if any pass id in the spec is not registered
 */
export async function runLocalProtocolPipeline(
  args: RunLocalProtocolPipelineArgs,
): Promise<ReturnType<typeof runPipeline>> {
  // Build registry and register passes
  const registry = new PassRegistry();
  for (const pass of args.passes) {
    registry.register(pass);
  }

  // Load pipeline spec from YAML
  const spec: PipelineSpec = loadPipeline(args.pipelinePath);

  // Verify every pass id in the spec is registered
  const missingPasses: string[] = [];
  for (const passSpec of spec.passes) {
    if (!registry.has(passSpec.id)) {
      missingPasses.push(passSpec.id);
    }
  }

  if (missingPasses.length > 0) {
    throw new Error(`pass not registered: ${missingPasses.join(', ')}`);
  }

  // Run the pipeline
  return runPipeline(spec, registry, args.input);
}
