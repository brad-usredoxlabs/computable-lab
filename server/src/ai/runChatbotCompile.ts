/**
 * Helper for running the chatbot-compile pipeline.
 * 
 * This module provides a self-contained function that owns pipeline setup
 * so AgentOrchestrator stays simple.
 */

import { PassRegistry } from '../compiler/pipeline/PassRegistry.js';
import { runPipeline, type PassProgressEvent } from '../compiler/pipeline/PipelineRunner.js';
import { loadPipeline } from '../compiler/pipeline/PipelineLoader.js';
import {
  createExtractEntitiesPass,
  createAiPrecompilePass,
  createDeterministicPlanConsolidationPass,
  createExpandBiologyVerbsPass,
  createMintMaterialsPass,
  createApplyDirectivesPass,
  createLabwareResolvePass,
  createResolveReferencesPass,
  createResolvePriorLabwareReferencesPass,
  createExpandProtocolPass,
  createExpandPatternsPass,
  createFallbackSideEvidenceEventsPass,
  createResolveRolesPass,
  createLabStatePass,
  createComputeVolumesPass,
  createComputeResourcesPass,
  createDeriveExecutionScalePlanPass,
  createPlanDeckLayoutPass,
  createValidatePass,
  createEmitInstrumentRunFilesPass,
  createEmitInstrumentApplianceJobsPass,
  createEvaluateInstrumentExecutionReadinessPass,
  createEmitDownstreamQueuePass,
  type FileAttachment,
  type LlmClient,
  type AiPrecompileOutput,
  type LabwareResolveOutput,
  type AiLabwareAdditionPatch,
  type ResolveReferencesOutput,
  type ResolvePriorLabwareReferencesOutput,
  type LabStatePassOutput,
  type ApplyDirectivesPassOutput,
  type ResolveRolesOutput,
  type ComputeResourcesPassOutput,
  type DeriveExecutionScalePlanOutput,
  type DeterministicPlanConsolidationOutput,
  type PlanDeckLayoutOutput,
  type ValidatePassOutput,
  type EmitInstrumentRunFilesOutput,
  type EmitInstrumentApplianceJobsOutput,
  type EvaluateInstrumentExecutionReadinessOutput,
  type EmitDownstreamQueueOutput,
} from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import { createDeterministicPrecompilePass } from '../compiler/pipeline/passes/DeterministicPrecompilePass.js';
import { createTagPromptPass } from '../compiler/precompile/PromptTagger.js';
import {
  createProtocolIntentStatePlanPass,
  type ProtocolIntentStatePlannerOutput,
} from '../compiler/protocolIntent/ProtocolIntentStatePlanner.js';
import {
  createValidateProtocolIntentPass,
  type ProtocolIntentValidationOutput,
} from '../compiler/protocolIntent/ProtocolIntentValidation.js';
import {
  createLowerProtocolIntentPass,
  type ProtocolIntentLoweringOutput,
} from '../compiler/protocolIntent/ProtocolIntentLowering.js';
import { createExpandProtocolIntentPatternsPass } from '../compiler/protocolIntent/ProtocolIntentPatternExpanders.js';
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
import type { LabStateSnapshot } from '../compiler/state/LabState.js';
import { emptyLabState } from '../compiler/state/LabState.js';
import type { LabStateCache } from '../compiler/state/LabStateCache.js';
import { parsePromptMentions, type PromptMention } from './promptMentions.js';
import type { LabwareSummary } from './types.js';
import { getProtocolSpecRegistry } from '../registry/ProtocolSpecRegistry.js';
import { getAssaySpecRegistry } from '../registry/AssaySpecRegistry.js';
import { getStampPatternRegistry } from '../registry/StampPatternRegistry.js';
import { getCompoundClassRegistry } from '../registry/CompoundClassRegistry.js';
import { getOntologyTermRegistry } from '../registry/OntologyTermRegistry.js';
import { getVerbActionMap } from '../registry/VerbActionMapRegistry.js';
import { getLabwareDefinitionRegistry } from '../registry/LabwareDefinitionRegistry.js';
import { fuzzyFindByName } from '../registry/fuzzyMatch.js';
import * as path from 'node:path';
import '../compiler/patterns/index.js'; // registers all pattern expanders
import '../compiler/validation/checks/index.js'; // registers validation checks (specs 035-036)
import '../compiler/artifacts/QuantStudioEmitter.js'; // registers QuantStudio instrument emitter (spec-038)
import '../compiler/artifacts/GeminiEmEmitter.js'; // registers Gemini EM plate-reader emitter

export interface RunChatbotCompileArgs {
  prompt: string;
  attachments?: FileAttachment[];
  /**
   * Pre-resolved mention tokens parsed client-side. When omitted, the
   * pipeline parses the prompt server-side using parsePromptMentions so
   * downstream passes always see the structured mentions.
   */
  mentions?: PromptMention[];
  /**
   * Snapshot of in-editor labware instances (runtime `lw-…` IDs) so
   * mention-resolved labware can be honored without a record-store lookup.
   */
  editorLabwares?: LabwareSummary[];
  priorLabState?: LabStateSnapshot;
  deps: {
    extractionService: ExtractionRunnerService;
    /**
     * LLM client used by `ai_precompile` and downstream LLM-backed passes.
     * Nullable so the pipeline can run when no LLM is configured; when null
     * the LLM passes (`ai_precompile`, `tag_prompt`) are skipped.
     */
    llmClient: LlmClient | null;
    searchLabwareByHint: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
    labStateCache?: LabStateCache;
  };
  /** Optional conversation identifier used to key the lab-state cache. */
  conversationId?: string;
  model?: string;
  /**
   * Skip the LLM-backed `ai_precompile` pass even when `llmClient` is
   * available. Used by the event-editor "Precompile" mode to force a pure
   * deterministic run.
   */
  deterministicOnly?: boolean;
  /** Optional callback invoked at each pass boundary for progress tracking. */
  onPassEvent?: (event: PassProgressEvent) => void;
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

function normalizePromptForCompile(prompt: string): string {
  return prompt
    .replace(/^[ \t]*---pasted-content---[ \t]*\r?\n?/gim, '')
    .replace(/\r?\n?[ \t]*---end-pasted-content---[ \t]*$/gim, '')
    .trim();
}

export async function runChatbotCompile(
  args: RunChatbotCompileArgs,
): Promise<RunChatbotCompileResult> {
  // Resolve priorLabState: explicit arg > cache lookup > emptyLabState
  const convId = args.conversationId;
  const cache = args.deps?.labStateCache;
  const effectivePrior =
    args.priorLabState
    ?? (convId && cache ? cache.get(convId) : undefined)
    ?? emptyLabState();
  const compilePrompt = normalizePromptForCompile(args.prompt);

  const llmAvailable = args.deps.llmClient !== null;
  const useLlmPasses = llmAvailable && !args.deterministicOnly;

  const registry = new PassRegistry();
  registry.register(createExtractEntitiesPass({ extractionService: args.deps.extractionService }));
  if (useLlmPasses) {
    registry.register(createTagPromptPass({ llmClient: args.deps.llmClient!, ...(args.model ? { model: args.model } : {}) }));
  } else {
    // tag_prompt is LLM-backed; register a no-op stub so PipelineRunner's
    // registration check passes. No downstream pass reads its output.
    registry.register({
      id: 'tag_prompt',
      family: 'parse' as const,
      run: () => ({ ok: true, output: {} }),
    });
  }
  registry.register(createDeterministicPrecompilePass({
    verbActionMapRegistry: getVerbActionMap(),
    labwareDefinitionRegistry: {
      findByName: (n) => {
        const hit = fuzzyFindByName({
          entries: getLabwareDefinitionRegistry().list(),
          query: n,
          getKeys: (d) => [
            d.id,
            d.display_name,
            ...(d.platform_aliases?.map((alias) => alias.alias) ?? []),
          ],
        });
        return hit
          ? {
              recordId: hit.match.recordId,
              registryMatch: {
                distance: hit.distance,
                matchedKey: hit.matchedKey,
                matchKind: hit.matchKind,
              },
            }
          : undefined;
      },
    },
    compoundClassRegistry: {
      findByName: (n) => {
        const hit = fuzzyFindByName({
          entries: getCompoundClassRegistry().list(),
          query: n,
          getKeys: (c) => [c.id, c.name],
        });
        return hit
          ? {
              recordId: hit.match.id,
              registryMatch: {
                distance: hit.distance,
                matchedKey: hit.matchedKey,
                matchKind: hit.matchKind,
              },
            }
          : undefined;
      },
    },
    ontologyTermRegistry: {
      searchLabel: (q) => {
        const needle = q.toLowerCase();
        return getOntologyTermRegistry().list()
          .filter((t) => t.label.toLowerCase().includes(needle))
          .map((t) => ({ id: t.id, label: t.label, source: t.source }));
      },
    },
    labwareInstanceLookup: args.deps.searchLabwareByHint,
  }));
  registry.register(createDeterministicPlanConsolidationPass());
  if (useLlmPasses) {
    registry.register(createAiPrecompilePass({ llmClient: args.deps.llmClient!, ...(args.model ? { model: args.model } : {}) }));
  } else {
    // Deterministic-only mode: emit the consolidated deterministic plan as
    // the ai_precompile output so downstream when:-gated passes see the
    // deterministic candidateEvents/candidateLabwares without any LLM call.
    registry.register({
      id: 'ai_precompile',
      family: 'expand' as const,
      run: (passArgs) => {
        const consolidated = passArgs.state.outputs.get('deterministic_plan_consolidation') as
          | DeterministicPlanConsolidationOutput
          | undefined;
        return { ok: true, output: consolidated?.aiPrecompile ?? {} };
      },
    });
  }
  registry.register(createProtocolIntentStatePlanPass());
  registry.register(createValidateProtocolIntentPass());
  registry.register(createLowerProtocolIntentPass());
  registry.register(createExpandProtocolIntentPatternsPass());
  registry.register(createMintMaterialsPass());
  registry.register(createApplyDirectivesPass());
  registry.register(createExpandBiologyVerbsPass());
  registry.register(createLabwareResolvePass({ searchLabwareByHint: args.deps.searchLabwareByHint }));
  registry.register(createResolveReferencesPass({
    protocolRegistry: getProtocolSpecRegistry(),
    assayRegistry: getAssaySpecRegistry(),
    stampPatternRegistry: getStampPatternRegistry(),
    compoundClassRegistry: getCompoundClassRegistry(),
    ontologyTermRegistry: getOntologyTermRegistry(),
  }));
  registry.register(createResolvePriorLabwareReferencesPass());
  registry.register(createExpandProtocolPass({
    protocolRegistry: getProtocolSpecRegistry(),
  }));
  registry.register(createExpandPatternsPass({
    stampPatternRegistry: getStampPatternRegistry(),
  }));
  registry.register(createFallbackSideEvidenceEventsPass());
  registry.register(createResolveRolesPass());
  registry.register(createLabStatePass());
  registry.register(createComputeVolumesPass());
  registry.register(createComputeResourcesPass());
  registry.register(createDeriveExecutionScalePlanPass());
  registry.register(createPlanDeckLayoutPass());
  registry.register(createValidatePass());
  registry.register(createEmitInstrumentRunFilesPass());
  registry.register(createEmitInstrumentApplianceJobsPass());
  registry.register(createEvaluateInstrumentExecutionReadinessPass());
  registry.register(createEmitDownstreamQueuePass());

  // Resolve mentions: prefer client-shipped, fall back to a server-side parse
  // so the precompile pass and labware resolver always see structured tokens.
  const effectiveMentions: PromptMention[] = args.mentions && args.mentions.length > 0
    ? args.mentions
    : parsePromptMentions(compilePrompt);

  const spec = loadPipeline(PIPELINE_YAML_PATH);
  const result = await runPipeline(spec, registry, {
    prompt: compilePrompt,
    attachments: args.attachments ?? [],
    mentions: effectiveMentions,
    editorLabwares: args.editorLabwares ?? [],
    labState: effectivePrior,
  }, undefined, args.onPassEvent);

  // Extract outputs from each pass; all are optional (pass may have been skipped or empty)
  const ai = (result.outputs.get('ai_precompile') ?? {}) as Partial<AiPrecompileOutput>;
  const applyDirOutput = (result.outputs.get('apply_directives') ?? { directives: [] }) as ApplyDirectivesPassOutput;
  const resolvedRoles = (result.outputs.get('resolve_roles') ?? { events: [] }) as ResolveRolesOutput;
  const labware = (result.outputs.get('resolve_labware') ?? { labwareAdditions: [], resolvedLabwares: [] }) as LabwareResolveOutput;
  const resolveRefs = (result.outputs.get('resolve_references') ?? { resolvedRefs: [], unresolvableRefs: [] }) as ResolveReferencesOutput;
  const priorLabware = (result.outputs.get('resolve_prior_labware_references') ?? { resolvedLabwareRefs: [], unresolved: [] }) as ResolvePriorLabwareReferencesOutput;
  const labStateOutput = (result.outputs.get('lab_state') ?? { events: [], snapshotAfter: emptyLabState() }) as LabStatePassOutput;
  const computeResourcesOutput = (result.outputs.get('compute_resources') ?? { resourceManifest: { tipRacks: [], reservoirLoads: [], consumables: [] } }) as ComputeResourcesPassOutput;
  const executionScaleOutput = (result.outputs.get('derive_execution_scale_plan') ?? {}) as DeriveExecutionScalePlanOutput;
  const deterministicPlanOutput = (result.outputs.get('deterministic_plan_consolidation') ?? {}) as Partial<DeterministicPlanConsolidationOutput>;
  const protocolIntentStateOutput = (result.outputs.get('protocol_intent_state_plan') ?? {}) as ProtocolIntentStatePlannerOutput;
  const protocolIntentValidationOutput = (result.outputs.get('validate_protocol_intent') ?? {}) as Partial<ProtocolIntentValidationOutput>;
  const protocolIntentLoweringOutput = (result.outputs.get('lower_protocol_intent') ?? {}) as Partial<ProtocolIntentLoweringOutput>;

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

  for (const blocker of executionScaleOutput.executionScalePlan?.blockers ?? []) {
    gaps.push({
      kind: 'clarification' as const,
      message: blocker.message,
      details: { ...blocker, source: 'executionScalePlan' },
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
  const findings = validationReport.findings as Array<{ severity: string }>;
  if (findings.some((f) => f.severity === 'error')) {
    outcome = 'error';
  }

  // Build terminalArtifacts
  const labStateDelta = {
    events: labStateOutput.events,
    snapshotAfter: labStateOutput.snapshotAfter,
  };
  const terminalArtifacts: TerminalArtifacts = {
    events,
    directives: applyDirOutput.directives ?? [],
    gaps,
    resolvedRefs: resolveRefs.resolvedRefs,
    labStateDelta,
    ...(priorLabware.resolvedLabwareRefs
      ? { resolvedLabwareRefs: priorLabware.resolvedLabwareRefs as ResolvedLabwareRef[] }
      : {}),
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

  // Populate executionScalePlan from derive_execution_scale_plan pass.
  if (executionScaleOutput.executionScalePlan) {
    terminalArtifacts.executionScalePlan = executionScaleOutput.executionScalePlan;
  }

  if (deterministicPlanOutput.protocolPlan) {
    terminalArtifacts.deterministicProtocolPlan = deterministicPlanOutput.protocolPlan;
  }
  if (ai.protocolIntent) {
    terminalArtifacts.protocolIntent = ai.protocolIntent;
  }
  if (protocolIntentStateOutput.protocolIntentStatePlan) {
    terminalArtifacts.protocolIntentStatePlan = protocolIntentStateOutput.protocolIntentStatePlan;
  }
  if (protocolIntentValidationOutput.findings || protocolIntentValidationOutput.blockers) {
    terminalArtifacts.protocolIntentValidation = {
      status: protocolIntentValidationOutput.status ?? 'ready',
      findings: protocolIntentValidationOutput.findings ?? [],
      blockers: protocolIntentValidationOutput.blockers ?? [],
    };
  }
  if (protocolIntentLoweringOutput.events || protocolIntentLoweringOutput.candidateLabwares || protocolIntentLoweringOutput.directives) {
    terminalArtifacts.protocolIntentLowering = {
      events: protocolIntentLoweringOutput.events ?? [],
      candidateLabwares: protocolIntentLoweringOutput.candidateLabwares ?? [],
      directives: protocolIntentLoweringOutput.directives ?? [],
    };
  }

  // Populate validationReport from validate pass (spec-034)
  terminalArtifacts.validationReport = validationReport as NonNullable<TerminalArtifacts['validationReport']>;

  // Populate instrumentRunFiles from emit_instrument_run_files pass (spec-038)
  const emitInstrumentRunFilesOutput = (result.outputs.get('emit_instrument_run_files') ?? { instrumentRunFiles: [] }) as EmitInstrumentRunFilesOutput;
  terminalArtifacts.instrumentRunFiles = emitInstrumentRunFilesOutput.instrumentRunFiles;

  // Populate instrumentApplianceJobs from emit_instrument_appliance_jobs pass.
  const emitInstrumentApplianceJobsOutput = (result.outputs.get('emit_instrument_appliance_jobs') ?? { instrumentApplianceJobs: [] }) as EmitInstrumentApplianceJobsOutput;
  const executionReadinessOutput = (result.outputs.get('evaluate_instrument_execution_readiness') ?? {}) as Partial<EvaluateInstrumentExecutionReadinessOutput>;
  terminalArtifacts.instrumentApplianceJobs = executionReadinessOutput.instrumentApplianceJobs ?? emitInstrumentApplianceJobsOutput.instrumentApplianceJobs;
  if (executionReadinessOutput.instrumentExecutionReadiness) {
    terminalArtifacts.instrumentExecutionReadiness = executionReadinessOutput.instrumentExecutionReadiness;
  }

  // Populate downstreamQueue from emit_downstream_queue pass (spec-039)
  const emitDownstreamQueueOutput = (result.outputs.get('emit_downstream_queue') ?? { downstreamQueue: [] }) as EmitDownstreamQueueOutput;
  terminalArtifacts.downstreamQueue = emitDownstreamQueueOutput.downstreamQueue;

  // Persist snapshotAfter to cache if conversationId and cache are present
  if (convId && cache) {
    cache.put(convId, labStateDelta.snapshotAfter);
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
