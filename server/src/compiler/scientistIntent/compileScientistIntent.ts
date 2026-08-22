/**
 * compileScientistIntent — run a scientist-intent wire document through the
 * deterministic compiler and produce the canonical TerminalArtifacts bundle.
 *
 * Architecture: the 26-pass chatbot pipeline consumes everything downstream of
 * `ai_precompile`. Instead of an LLM, this runner feeds the SAME seam a
 * synthetic `ai_precompile` output built by normalizeScientistIntent
 * ({ protocolIntent, candidateEvents, unresolvedRefs }), then runs a focused
 * pipeline (`scientist-intent-compile.yaml`) through the existing pass
 * factories. Every deterministic pass — protocol-intent state planning,
 * validation, lowering, geometric-macro expansion, biology-verb expansion,
 * labware resolution, role resolution, compute_volumes, deck layout, resource
 * manifest, lab-state fold, instrument run-files — runs unchanged.
 */
import { resolve } from 'node:path';
import { PassRegistry } from '../pipeline/PassRegistry.js';
import { runPipeline, type PassProgressEvent } from '../pipeline/PipelineRunner.js';
import { loadPipeline } from '../pipeline/PipelineLoader.js';
import {
  createProtocolIntentStatePlanPass,
} from '../protocolIntent/ProtocolIntentStatePlanner.js';
import {
  createValidateProtocolIntentPass,
} from '../protocolIntent/ProtocolIntentValidation.js';
import {
  createLowerProtocolIntentPass,
} from '../protocolIntent/ProtocolIntentLowering.js';
import { createExpandProtocolIntentPatternsPass } from '../protocolIntent/ProtocolIntentPatternExpanders.js';
import {
  createExpandBiologyVerbsPass,
  createApplyDirectivesPass,
  createLabwareResolvePass,
  createResolveReferencesPass,
  createResolveRolesPass,
  createComputeVolumesPass,
  createComputeResourcesPass,
  createPlanDeckLayoutPass,
  createLabStatePass,
  createValidatePass,
  createEmitInstrumentRunFilesPass,
} from '../pipeline/passes/ChatbotCompilePasses.js';
// side-effect: register the ~25 biology-verb expanders
import '../biology/verbs/simpleVerbs.js';
import '../biology/verbs/compoundVerbs.js';
import '../biology/verbs/centrifugeVerbs.js';

import { getProtocolSpecRegistry } from '../../registry/ProtocolSpecRegistry.js';
import { getAssaySpecRegistry } from '../../registry/AssaySpecRegistry.js';
import { getStampPatternRegistry } from '../../registry/StampPatternRegistry.js';
import { getCompoundClassRegistry } from '../../registry/CompoundClassRegistry.js';
import { getOntologyTermRegistry } from '../../registry/OntologyTermRegistry.js';
import { emptyLabState, type LabStateSnapshot } from '../state/LabState.js';
import { normalizeScientistIntent } from './normalizeScientistIntent.js';
import type { ScientistIntent } from './types.js';
import type { TerminalArtifacts, Gap, CompileOutcome } from '../pipeline/CompileContracts.js';
import type { ScientistIntentNormalized } from './normalizeScientistIntent.js';

const SCIENTIST_INTENT_PIPELINE_PATH = resolve(
  process.cwd(),
  'schema', 'registry', 'compile-pipelines', 'scientist-intent-compile.yaml',
);

export interface ScientistIntentCompileDeps {
  searchLabwareByHint?: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
  priorLabState?: LabStateSnapshot;
  onPassEvent?: (event: PassProgressEvent) => void;
}

export interface ScientistIntentCompileResult {
  terminalArtifacts: TerminalArtifacts;
  normalized: ScientistIntentNormalized;
  outcome: CompileOutcome;
  diagnostics: Array<{ severity: string; code?: string; message: string }>;
}

/**
 * Build the pass registry shared by scientist-intent compiles.
 * The synthetic `ai_precompile` pass returns the parsed+normalized intent, then
 * every downstream pass is the real, existing implementation.
 */
function buildRegistry(normalized: ScientistIntentNormalized, deps: ScientistIntentCompileDeps): PassRegistry {
  const registry = new PassRegistry();

  // Seed the seam the whole pipeline consumes.
  registry.register({
    id: 'ai_precompile',
    family: 'parse' as const,
    run: () => ({ ok: true, output: normalized }),
  });

  registry.register(createProtocolIntentStatePlanPass());
  registry.register(createValidateProtocolIntentPass());
  registry.register(createLowerProtocolIntentPass());
  registry.register(createExpandProtocolIntentPatternsPass());
  registry.register(createExpandBiologyVerbsPass());
  registry.register(createApplyDirectivesPass());
  registry.register(createLabwareResolvePass({
    searchLabwareByHint: deps.searchLabwareByHint ?? (async () => []),
  }));
  registry.register(createResolveReferencesPass({
    protocolRegistry: getProtocolSpecRegistry(),
    assayRegistry: getAssaySpecRegistry(),
    stampPatternRegistry: getStampPatternRegistry(),
    compoundClassRegistry: getCompoundClassRegistry(),
    ontologyTermRegistry: getOntologyTermRegistry(),
  }));
  registry.register(createResolveRolesPass());
  registry.register(createComputeVolumesPass());
  registry.register(createComputeResourcesPass());
  registry.register(createPlanDeckLayoutPass());
  registry.register(createLabStatePass());
  registry.register(createEmitInstrumentRunFilesPass());
  registry.register(createValidatePass());

  return registry;
}

function gatherGaps(normalized: ScientistIntentNormalized, diagnostics: Array<{ severity: string; message: string }>): Gap[] {
  const gaps: Gap[] = [];
  for (const ref of normalized.unresolvedRefs) {
    gaps.push({
      kind: 'unresolved_ref' as const,
      message: `${ref.label} (${ref.reason})`,
      details: { ...ref },
    });
  }
  for (const diag of diagnostics) {
    if (diag.severity === 'error') {
      gaps.push({
        kind: 'clarification' as const,
        message: diag.message,
        details: { source: diag.severity },
      });
    }
  }
  return gaps;
}

function computeOutcome(gaps: Gap[], diagnostics: Array<{ severity: string }>): CompileOutcome {
  if (diagnostics.some((d) => d.severity === 'error')) return 'error';
  if (gaps.length > 0) return 'gap';
  return 'complete';
}

export async function compileScientistIntent(
  intent: ScientistIntent,
  deps: ScientistIntentCompileDeps = {},
): Promise<ScientistIntentCompileResult> {
  const normalized = normalizeScientistIntent(intent);
  const registry = buildRegistry(normalized, deps);
  const spec = loadPipeline(SCIENTIST_INTENT_PIPELINE_PATH);

  const input: Record<string, unknown> = {
    prompt: intent.sourcePrompt ?? '',
    attachments: [],
    mentions: [],
    editorLabwares: [],
    labState: deps.priorLabState ?? emptyLabState(),
  };

  const result = await runPipeline(spec, registry, input, undefined, deps.onPassEvent);

  const eventOutput = (result.outputs.get('resolve_roles') as { events?: unknown[] } | undefined)?.events ?? [];
  const directiveOutput = (result.outputs.get('apply_directives') as { directives?: unknown[] } | undefined)?.directives ?? [];
  const labStateOutput = (result.outputs.get('lab_state') as { events?: unknown[]; snapshotAfter?: LabStateSnapshot } | undefined);
  const deckOutput = (result.outputs.get('plan_deck_layout') as { pinned?: unknown[]; autoFilled?: unknown[]; conflicts?: unknown[] } | undefined);
  const resourcesOutput = (result.outputs.get('compute_resources') as { resourceManifest?: unknown } | undefined)?.resourceManifest;
  const validateOutput = (result.outputs.get('validate') as { validationReport?: unknown } | undefined)?.validationReport;
  const runFilesOutput = (result.outputs.get('emit_instrument_run_files') as { instrumentRunFiles?: unknown[] } | undefined)?.instrumentRunFiles;

  const diagnostics = result.diagnostics;
  const gaps = gatherGaps(normalized, diagnostics);
  const outcome = computeOutcome(gaps, diagnostics);

  const terminalArtifacts: TerminalArtifacts = {
    events: (eventOutput ?? []) as TerminalArtifacts['events'],
    directives: (directiveOutput ?? []) as TerminalArtifacts['directives'],
    gaps,
    ...(labStateOutput ? {
      labStateDelta: {
        events: (labStateOutput.events ?? []) as TerminalArtifacts['events'],
        snapshotAfter: labStateOutput.snapshotAfter ?? emptyLabState(),
      },
    } : {}),
    ...(deckOutput ? {
      deckLayoutPlan: {
        pinned: (deckOutput.pinned ?? []) as Array<{ slot: string; labwareHint: string }>,
        autoFilled: (deckOutput.autoFilled ?? []) as Array<{ slot: string; labwareHint: string; reason: string }>,
        conflicts: (deckOutput.conflicts ?? []) as Array<{ slot: string; candidates: string[] }>,
      },
    } : {}),
    ...(resourcesOutput ? { resourceManifest: resourcesOutput as NonNullable<TerminalArtifacts['resourceManifest']> } : {}),
    ...(validateOutput ? { validationReport: validateOutput as NonNullable<TerminalArtifacts['validationReport']> } : {}),
    ...(runFilesOutput ? { instrumentRunFiles: runFilesOutput as NonNullable<TerminalArtifacts['instrumentRunFiles']> } : {}),
  };
  if (normalized.protocolIntent) terminalArtifacts.protocolIntent = normalized.protocolIntent;

  return {
    terminalArtifacts,
    normalized,
    outcome,
    diagnostics,
  };
}