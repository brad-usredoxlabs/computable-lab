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
  createMintMaterialsPass,
  createApplyDirectivesPass,
  createLabwareResolvePass,
  createResolveReferencesPass,
  createResolvePriorLabwareReferencesPass,
  createExpandProtocolPass,
  createExpandPatternsPass,
  createResolveRolesPass,
  createLabStatePass,
  createComputeVolumesPass,
  createComputeResourcesPass,
  createPlanDeckLayoutPass,
  createValidatePass,
  createEmitInstrumentRunFilesPass,
  createEmitDownstreamQueuePass,
  type FileAttachment,
  type LlmClient,
  type AiPrecompileOutput,
  type LabwareResolveOutput,
  type AiLabwareAdditionPatch,
  type ResolveReferencesOutput,
  type ResolvePriorLabwareReferencesOutput,
  type ExpandProtocolOutput,
  type LabStatePassOutput,
  type MintMaterialsPassOutput,
  type ApplyDirectivesPassOutput,
  type ExpandPatternsOutput,
  type ResolveRolesOutput,
  type ComputeResourcesPassOutput,
  type PlanDeckLayoutOutput,
  type ValidatePassOutput,
  type EmitInstrumentRunFilesOutput,
  type EmitDownstreamQueueOutput,
} from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { ExtractionRunnerService } from '../extract/ExtractionRunnerService.js';
import type { PlateEventPrimitive } from '../compiler/biology/BiologyVerbExpander.js';
import type { PassDiagnostic } from '../compiler/pipeline/types.js';
import type {
  TerminalArtifacts,
  CompileOutcome,
  Gap,
  DeckLayoutPlan,
  ResolvedLabwareRef,
} from '../compiler/pipeline/CompileContracts.js';
import type { InstrumentRunFile } from '../compiler/artifacts/InstrumentRunFile.js';
import type { LabStateSnapshot } from '../compiler/state/LabState.js';
import { emptyLabState } from '../compiler/state/LabState.js';
import type { DirectiveNode } from '../compiler/directives/Directive.js';
import type { LabStateCache } from '../compiler/state/LabStateCache.js';
import { getProtocolSpecRegistry } from '../registry/ProtocolSpecRegistry.js';
import { getAssaySpecRegistry } from '../registry/AssaySpecRegistry.js';
import { getStampPatternRegistry } from '../registry/StampPatternRegistry.js';
import { getCompoundClassRegistry } from '../registry/CompoundClassRegistry.js';
import * as path from 'node:path';
import '../compiler/patterns/index.js'; // registers all pattern expanders
import '../compiler/validation/checks/index.js'; // registers validation checks (specs 035-036)
import '../compiler/artifacts/QuantStudioEmitter.js'; // registers QuantStudio instrument emitter (spec-038)

export interface RunChatbotCompileArgs {
  prompt: string;
  attachments?: FileAttachment[];
  priorLabState?: LabStateSnapshot;
  deps: {
    extractionService: ExtractionRunnerService;
    llmClient: LlmClient;
    searchLabwareByHint: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
    labStateCache?: LabStateCache;
  };
  /** Optional conversation identifier used to key the lab-state cache. */
  conversationId?: string;
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
  // Resolve priorLabState: explicit arg > cache lookup > emptyLabState
  const convId = args.conversationId;
  const cache = args.deps.labStateCache;
  const effectivePrior =
    args.priorLabState
    ?? (convId && cache ? cache.get(convId) : undefined)
    ?? emptyLabState();

  const registry = new PassRegistry();
  registry.register(createExtractEntitiesPass({ extractionService: args.deps.extractionService }));
  registry.register(createAiPrecompilePass({ llmClient: args.deps.llmClient, ...(args.model ? { model: args.model } : {}) }));
  registry.register(createMintMaterialsPass());
  registry.register(createApplyDirectivesPass());
  registry.register(createExpandBiologyVerbsPass());
  registry.register(createLabwareResolvePass({ searchLabwareByHint: args.deps.searchLabwareByHint }));
  registry.register(createResolveReferencesPass({
    protocolRegistry: getProtocolSpecRegistry(),
    assayRegistry: getAssaySpecRegistry(),
    stampPatternRegistry: getStampPatternRegistry(),
    compoundClassRegistry: getCompoundClassRegistry(),
  }));
  registry.register(createResolvePriorLabwareReferencesPass());
  registry.register(createExpandProtocolPass({
    protocolRegistry: getProtocolSpecRegistry(),
  }));
  registry.register(createExpandPatternsPass({
    stampPatternRegistry: getStampPatternRegistry(),
  }));
  registry.register(createResolveRolesPass());
  registry.register(createLabStatePass());
  registry.register(createComputeVolumesPass());
  registry.register(createComputeResourcesPass());
  registry.register(createPlanDeckLayoutPass());
  registry.register(createValidatePass());
  registry.register(createEmitInstrumentRunFilesPass());
  registry.register(createEmitDownstreamQueuePass());

  const spec = loadPipeline(PIPELINE_YAML_PATH);
  const result = await runPipeline(spec, registry, {
    prompt: args.prompt,
    attachments: args.attachments ?? [],
    labState: effectivePrior,
  });

  // Extract outputs from each pass; all are optional (pass may have been skipped or empty)
  const ai = (result.outputs.get('ai_precompile') ?? {}) as Partial<AiPrecompileOutput>;
  const mintOutput = (result.outputs.get('mint_materials') ?? { events: [] }) as MintMaterialsPassOutput;
  const applyDirOutput = (result.outputs.get('apply_directives') ?? { directives: [] }) as ApplyDirectivesPassOutput;
  const patterns = (result.outputs.get('expand_patterns') ?? { events: [] }) as ExpandPatternsOutput;
  const verbs = (result.outputs.get('expand_biology_verbs') ?? { events: [] }) as { events: PlateEventPrimitive[] };
  const resolvedRoles = (result.outputs.get('resolve_roles') ?? { events: [] }) as ResolveRolesOutput;
  const labware = (result.outputs.get('resolve_labware') ?? { labwareAdditions: [], resolvedLabwares: [] }) as LabwareResolveOutput;
  const resolveRefs = (result.outputs.get('resolve_references') ?? { resolvedRefs: [], unresolvableRefs: [] }) as ResolveReferencesOutput;
  const priorLabware = (result.outputs.get('resolve_prior_labware_references') ?? { resolvedLabwareRefs: [], unresolved: [] }) as ResolvePriorLabwareReferencesOutput;
  const protocolEvents = (result.outputs.get('expand_protocol') ?? { events: [], stepsExpanded: 0 }) as ExpandProtocolOutput;
  const labStateOutput = (result.outputs.get('lab_state') ?? { events: [], snapshotAfter: emptyLabState() }) as LabStatePassOutput;
  const computeResourcesOutput = (result.outputs.get('compute_resources') ?? { resourceManifest: { tipRacks: [], reservoirLoads: [], consumables: [] } }) as ComputeResourcesPassOutput;

  // Merge events: use resolve_roles output as the definitive event list
  // (it aggregates mint, patterns, verbs, protocol and resolves roles)
  const events = resolvedRoles.events ?? [];
  const unresolvedRefs = ai.unresolvedRefs ?? [];
  const clarification = typeof ai.clarification === 'string' ? ai.clarification : undefined;
  const diagnostics = result.diagnostics;

  // Build terminalArtifacts.gaps from unresolvedRefs + clarification + unresolvable refs
  const gaps: Gap[] = unresolvedRefs.map((ref) => ({
    kind: 'unresolved_ref' as const,
    message: `${ref.label} (${ref.reason})`,
    details: { ...ref },
  }));
  if (clarification) {
    gaps.push({ kind: 'clarification' as const, message: clarification });
  }
  // Append unresolvable refs from resolve_references pass
  for (const ref of resolveRefs.unresolvableRefs) {
    gaps.push({
      kind: 'unresolved_ref' as const,
      message: `${ref.label} (${ref.reason})`,
      details: { ...ref },
    });
  }

  // Append unresolved prior labware refs from resolve_prior_labware_references pass
  for (const ref of priorLabware.unresolved) {
    gaps.push({
      kind: 'unresolved_ref' as const,
      message: `${ref.hint} (${ref.reason})`,
      details: { ...ref },
    });
  }

  // Compute outcome
  let outcome: CompileOutcome;
  if (diagnostics.some((d) => d.severity === 'error')) {
    outcome = 'error';
  } else if (gaps.length > 0) {
    outcome = 'gap';
  } else {
    outcome = 'complete';
  }

  // Check validationReport for error findings (spec-034)
  const validateOutput = (result.outputs.get('validate') ?? { validationReport: { findings: [] } }) as ValidatePassOutput;
  const validationReport = validateOutput.validationReport;
  if (validationReport.findings.some((f: { severity: string }) => f.severity === 'error')) {
    outcome = 'error';
  }

  // Build terminalArtifacts
  const terminalArtifacts: TerminalArtifacts = {
    events,
    directives: applyDirOutput.directives ?? [],
    gaps,
    resolvedRefs: resolveRefs.resolvedRefs,
    labStateDelta: {
      events: labStateOutput.events,
      snapshotAfter: labStateOutput.snapshotAfter,
    },
    resolvedLabwareRefs: priorLabware.resolvedLabwareRefs as ResolvedLabwareRef[] | undefined,
  };

  // Build deckLayoutPlan from plan_deck_layout pass output (spec-033)
  const planDeckLayoutOutput = (result.outputs.get('plan_deck_layout') ?? { pinned: [], autoFilled: [], conflicts: [] }) as PlanDeckLayoutOutput;
  const deckLayoutPlan: DeckLayoutPlan = {
    pinned: planDeckLayoutOutput.pinned,
    autoFilled: planDeckLayoutOutput.autoFilled,
    conflicts: planDeckLayoutOutput.conflicts,
  };
  terminalArtifacts.deckLayoutPlan = deckLayoutPlan;

  // Populate resourceManifest from compute_resources pass (spec-032)
  terminalArtifacts.resourceManifest = computeResourcesOutput.resourceManifest;

  // Populate validationReport from validate pass (spec-034)
  terminalArtifacts.validationReport = validationReport;

  // Populate instrumentRunFiles from emit_instrument_run_files pass (spec-038)
  const emitInstrumentRunFilesOutput = (result.outputs.get('emit_instrument_run_files') ?? { instrumentRunFiles: [] }) as EmitInstrumentRunFilesOutput;
  terminalArtifacts.instrumentRunFiles = emitInstrumentRunFilesOutput.instrumentRunFiles;

  // Populate downstreamQueue from emit_downstream_queue pass (spec-039)
  const emitDownstreamQueueOutput = (result.outputs.get('emit_downstream_queue') ?? { downstreamQueue: [] }) as EmitDownstreamQueueOutput;
  terminalArtifacts.downstreamQueue = emitDownstreamQueueOutput.downstreamQueue;

  // Persist snapshotAfter to cache if conversationId and cache are present
  if (convId && cache) {
    cache.put(convId, terminalArtifacts.labStateDelta.snapshotAfter);
  }

  return {
    events,
    labwareAdditions: labware.labwareAdditions ?? [],
    unresolvedRefs,
    ...(clarification ? { clarification } : {}),
    diagnostics,
    terminalArtifacts,
    outcome,
  };
}
