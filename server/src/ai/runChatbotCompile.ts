/**
 * Helper for running the chatbot-compile pipeline.
 * 
 * This module provides a self-contained function that owns pipeline setup
 * so AgentOrchestrator stays simple.
 */

import { PassRegistry } from '../compiler/pipeline/PassRegistry.js';
import { runPipeline } from '../compiler/pipeline/PipelineRunner.js';
import { loadPipeline } from '../compiler/pipeline/PipelineLoader.js';
import {
  createExtractEntitiesPass,
  createAiPrecompilePass,
  createExpandBiologyVerbsPass,
  createLabwareResolvePass,
  type FileAttachment,
  type LlmClient,
  type AiPrecompileOutput,
  type LabwareResolveOutput,
  type AiLabwareAdditionPatch,
} from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { ExtractionRunnerService } from '../extract/ExtractionRunnerService.js';
import type { PlateEventPrimitive } from '../compiler/biology/BiologyVerbExpander.js';
import type { PassDiagnostic } from '../compiler/pipeline/types.js';
import type {
  TerminalArtifacts,
  CompileOutcome,
  Gap,
} from '../compiler/pipeline/CompileContracts.js';
import * as path from 'node:path';

export interface RunChatbotCompileArgs {
  prompt: string;
  attachments?: FileAttachment[];
  deps: {
    extractionService: ExtractionRunnerService;
    llmClient: LlmClient;
    searchLabwareByHint: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
  };
  model?: string;
}

export interface RunChatbotCompileResult {
  events: PlateEventPrimitive[];
  labwareAdditions: AiLabwareAdditionPatch[];
  unresolvedRefs: AiPrecompileOutput['unresolvedRefs'];
  clarification?: string;
  diagnostics: PassDiagnostic[];
  terminalArtifacts: TerminalArtifacts;
  outcome: CompileOutcome;
}

const PIPELINE_YAML_PATH = path.resolve(
  import.meta.dirname ?? __dirname,
  '../../../schema/registry/compile-pipelines/chatbot-compile.yaml',
);

export async function runChatbotCompile(
  args: RunChatbotCompileArgs,
): Promise<RunChatbotCompileResult> {
  const registry = new PassRegistry();
  registry.register(createExtractEntitiesPass({ extractionService: args.deps.extractionService }));
  registry.register(createAiPrecompilePass({ llmClient: args.deps.llmClient, ...(args.model ? { model: args.model } : {}) }));
  registry.register(createExpandBiologyVerbsPass());
  registry.register(createLabwareResolvePass({ searchLabwareByHint: args.deps.searchLabwareByHint }));

  const spec = loadPipeline(PIPELINE_YAML_PATH);
  const result = await runPipeline(spec, registry, {
    prompt: args.prompt,
    attachments: args.attachments ?? [],
  });

  // Extract outputs from each pass; all are optional (pass may have been skipped or empty)
  const ai = (result.outputs.get('ai_precompile') ?? {}) as Partial<AiPrecompileOutput>;
  const verbs = (result.outputs.get('expand_biology_verbs') ?? { events: [] }) as { events: PlateEventPrimitive[] };
  const labware = (result.outputs.get('resolve_labware') ?? { labwareAdditions: [], resolvedLabwares: [] }) as LabwareResolveOutput;

  const events = verbs.events ?? [];
  const unresolvedRefs = ai.unresolvedRefs ?? [];
  const clarification = typeof ai.clarification === 'string' ? ai.clarification : undefined;
  const diagnostics = result.diagnostics;

  // Build terminalArtifacts.gaps from unresolvedRefs + clarification
  const gaps: Gap[] = unresolvedRefs.map((ref) => ({
    kind: 'unresolved_ref' as const,
    message: `${ref.label} (${ref.reason})`,
    details: { ...ref },
  }));
  if (clarification) {
    gaps.push({ kind: 'clarification' as const, message: clarification });
  }

  // Compute outcome
  let outcome: CompileOutcome;
  if (diagnostics.some((d) => d.severity === 'error')) {
    outcome = 'error';
  } else if (events.length === 0 && gaps.length > 0) {
    outcome = 'gap';
  } else {
    outcome = 'complete';
  }

  return {
    events,
    labwareAdditions: labware.labwareAdditions ?? [],
    unresolvedRefs,
    ...(clarification ? { clarification } : {}),
    diagnostics,
    terminalArtifacts: { events, gaps },
    outcome,
  };
}
