/**
 * Example demonstrating the ProtocolCompileMonolithPass wiring.
 *
 * This file is NOT executed at startup. It is reference only —
 * invoke via tests or a manual script.
 */

import { PassRegistry } from './PassRegistry.js';
import { runPipeline, type PipelineSpec } from './PipelineRunner.js';
import { createProtocolCompileMonolithPass } from './passes/ProtocolCompileMonolithPass.js';

/**
 * Run the protocol compile monolith pipeline example.
 *
 * This demonstrates loading the protocol-compile pass, registering it,
 * and running it through the pipeline runner.
 *
 * @param protocolRecord - The protocol record to compile
 * @returns PipelineRunResult with outputs and diagnostics
 */
export async function runProtocolPipelineExample(protocolRecord: Record<string, unknown>) {
  const registry = new PassRegistry();
  registry.register(createProtocolCompileMonolithPass());

  // For the monolith wrapper, we substitute the full pipeline with a single-pass spec
  // rather than running the full 8-pass YAML (which has no real implementations yet).
  const spec: PipelineSpec = {
    pipelineId: 'protocol-compile-monolith',
    entrypoint: 'protocol-compile',
    passes: [{ id: 'protocol_compile_monolith', family: 'project' }],
  };

  return runPipeline(spec, registry, { protocol: protocolRecord });
}
