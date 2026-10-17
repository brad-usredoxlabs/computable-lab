/**
 * compileScientistIntent — run a scientist-intent wire document through the
 * deterministic compiler and produce the canonical TerminalArtifacts bundle.
 *
 * Architecture: the chatbot pipeline's deterministic passes consume everything
 * downstream of `ai_precompile`. Instead of an LLM, this runner feeds the SAME
 * seam a synthetic `ai_precompile` output built by normalizeScientistIntent
 * ({ protocolIntent, candidateEvents, unresolvedRefs }), then runs a focused
 * pipeline (`scientist-intent-compile.yaml`) through the existing pass
 * factories. Every deterministic pass — noun resolution (SPINE-4's
 * `resolve_nouns`, registered over SPINE-3's resolution engine), protocol-intent
 * state planning, validation, lowering, geometric-macro expansion,
 * biology-verb expansion, labware resolution, role resolution, compute_volumes,
 * deck layout, resource manifest, lab-state fold, instrument run-files — runs
 * against it.
 *
 * SPINE-4 bar: `resolve_nouns` runs ahead of every noun-consuming stage. When
 * ANY argument remains unresolved after reconciliation, the pass fails with ONE
 * error diagnostic and the runner's cascade barrier skips every consumer and
 * graph stage without invoking run(). The compile then reports outcome
 * 'needs-clarification' with the structured SPINE-1 clarifications and ZERO
 * artifact-bearing slots — atomically, never a half-resolved graph.
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
import { stripRedundantMixtureLabels } from './mixtureLabelRedundancy.js';
import { capResolvedLabwares } from './deckReviewFold.js';
import { defaultScientistIntentVocabulary, type ScientistIntentVocabulary } from './vocabulary.js';
import type { EngineSpineLike } from '../resolution/adapters.js';
import {
  createResolveNounsPass,
  UNRESOLVED_ARGUMENTS_CODE,
  type ResolveNounsEngine,
  type ResolveNounsOutput,
} from '../resolution/resolveNounsPass.js';
import type { TermLike } from '../../materials/termReconciliation.js';
import type { ScientistIntent, ScientistIntentUnresolvedFact } from './types.js';
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
  /** SPINE-4: vocabulary for the resolve_nouns pass (fixture injection via
   *  the loader's opts.path discipline; defaults to the shipped singleton). */
  vocabulary?: ScientistIntentVocabulary;
  /** SPINE-4: READ-ONLY candidate spine for the engine's spine adapter.
   *  REQUIRED in practice (fix1/D1): production callers inject a store-backed
   *  spine built with createResolveSpineFromContext (the server.ts:733
   *  composition); omitting it throws at pass registration (§3 fail-loud —
   *  NO degraded no-resolution mode). createResolveSpine({}) is legal only
   *  as an explicitly injected test seam. */
  spine?: EngineSpineLike;
  /** SPINE-4: READ-ONLY term list for near-miss clarification evidence. */
  termsForSuggestions?: () => Promise<readonly TermLike[]>;
  /** SPINE-4: engine door override (tests stub the engine deps; the pass,
   *  reconciliation, registration, and the bar are always the real ones). */
  resolveNounsEngine?: ResolveNounsEngine;
  /** DECK-FOLD-1: deck-review fold policy path override (tests inject a temp
   *  policy to prove the cap is per-call DATA, not a process-cached literal;
   *  production uses the shipped config/drafting/deck-review.yaml). */
  deckReviewPolicyPath?: string | URL;
}

export interface ScientistIntentCompileResult {
  terminalArtifacts: TerminalArtifacts;
  normalized: ScientistIntentNormalized;
  outcome: CompileOutcome;
  diagnostics: Array<{ severity: string; code?: string; message: string }>;
  /** SPINE-4: the structured SPINE-1 clarifications the bar presents instead
   *  of stringified gaps (empty when nothing is unresolved). */
  clarifications: ScientistIntentUnresolvedFact[];
}

/**
 * Build the pass registry shared by scientist-intent compiles.
 * The synthetic `ai_precompile` pass returns the parsed+normalized intent, then
 * every downstream pass is the real, existing implementation.
 */
function buildRegistry(
  intent: ScientistIntent,
  normalized: ScientistIntentNormalized,
  deps: ScientistIntentCompileDeps,
): PassRegistry {
  const registry = new PassRegistry();

  // Seed the seam the whole pipeline consumes.
  registry.register({
    id: 'ai_precompile',
    family: 'parse' as const,
    run: () => ({ ok: true, output: normalized }),
  });

  // SPINE-4: the one noun-resolution door, registered over SPINE-3's engine.
  // NO degraded no-resolution mode (fix1/D1, §3 fail-loud doctrine): the
  // vocabulary is always present (shipped singleton or injected fixture);
  // the spine MUST be injected — production callers pass a store-backed
  // spine (createResolveSpineFromContext, the server.ts:733 composition).
  // A missing deps.spine throws LOUD at registration: silently composing a
  // provider-less spine would false-bar every store-resolvable noun the
  // spine adapter cannot see (the adversarial D1 defect). An explicitly
  // injected provider-less spine is legal only as a declared test seam.
  if (!deps.spine) {
    throw new Error(
      'SPINE-4 resolve_nouns registration requires an injected spine (deps.spine): '
      + 'production callers pass a store-backed spine via createResolveSpineFromContext; '
      + 'a provider-less spine is legal only as an explicitly injected test seam '
      + '(§3: NO degraded no-resolution mode).',
    );
  }
  registry.register(createResolveNounsPass({
    intent,
    vocabulary: deps.vocabulary ?? defaultScientistIntentVocabulary(),
    spine: deps.spine,
    ...(deps.searchLabwareByHint ? { searchLabwareByHint: deps.searchLabwareByHint } : {}),
    ...(deps.termsForSuggestions ? { termsForSuggestions: deps.termsForSuggestions } : {}),
    ...(deps.resolveNounsEngine ? { resolve: deps.resolveNounsEngine } : {}),
    // SH-QA-1 (OQ1 ruling): the gated producer facts (the mixture-blob bar)
    // ride INTO the pass — the pass owns their fate now (drop on a bound
    // slot, append survivors after engine+required+model facts).
    ...(normalized.resolutionGatedClarifications
      ? { resolutionGatedClarifications: normalized.resolutionGatedClarifications }
      : {}),
  }));

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
  // SPINE-7 fix1/D4: the producer reads the SAME vocabulary instance the
  // resolve_nouns registration below threads (deps.vocabulary ?? shipped
  // singleton) — never the default singleton behind an injected vocab.
  const vocabulary = deps.vocabulary ?? defaultScientistIntentVocabulary();
  // SH-QA-3 (spec §A): the redundancy strip runs BEFORE both normalize AND the
  // resolve_nouns registration — the door reads the RAW intent doc
  // (buildRegistry passes `intent` to createResolveNounsPass; normalize is a
  // separate call), so a normalize-only strip would leave the prose-blob
  // sentence card fully alive. A top-level scalar noun that is a description
  // OF a composition riding the same action is stripped from the compile
  // input; the expander already derives the mixture label from the components
  // (simpleVerbs compositionSnapshotFromParams). Nothing fired (the
  // overwhelming case) ⇒ identity passthrough ⇒ the compile is byte-identical
  // to before. A strip is LOUD (one console.log per stripped slot, the
  // loud-normalize precedent — never silent data loss: the composition itself
  // remains the scientist's declared truth). The held chat YAML is untouched
  // (this is an in-memory compile-input transform, idempotent by T5).
  const { intent: compileIntent, stripped } = stripRedundantMixtureLabels(intent, vocabulary);
  for (const slot of stripped) {
    const carried = (intent.actions[slot.actionIndex] as unknown as Record<string, unknown>)[slot.argument];
    console.log(
      `SH-QA-3 redundancy strip: removed the redundant top-level noun "${String(carried)}" `
      + `at actions[${slot.actionIndex}].${slot.argument} — the composition riding the same action `
      + 'carries its components; the mixture label is derived from them.',
    );
  }
  const normalized = normalizeScientistIntent(compileIntent, { vocabulary });
  const registry = buildRegistry(compileIntent, normalized, deps);
  const spec = loadPipeline(SCIENTIST_INTENT_PIPELINE_PATH);

  const input: Record<string, unknown> = {
    prompt: intent.sourcePrompt ?? '',
    attachments: [],
    mentions: [],
    editorLabwares: [],
    labState: deps.priorLabState ?? emptyLabState(),
  };

  const result = await runPipeline(spec, registry, input, undefined, deps.onPassEvent);

  // SPINE-4 bar: an unresolved argument bars ATOMICALLY. The runner stores a
  // pass's output slot only for ok:true passes (PipelineRunner.ts:341-384), so
  // the bar is read from the resolve_nouns error diagnostic — whose details
  // carry the structured clarifications verbatim. The cascade barrier already
  // skipped every consumer/graph stage (their output slots are absent); the
  // assembly below therefore sees empty slots. The structured clarifications —
  // not stringified error-diag gaps — are the presentation channel, and
  // 'needs-clarification' keeps 'error' meaning "compile machinery broke"
  // (OQ1 ruling (a)).
  // SPINE-7 fix1/D1: producer-emitted clarifications (a schema-valid scalar
  // well-label with no lowering consumer) bar on the SAME atomic 422 arm —
  // the engine may have bound the label cleanly (no engine clarification), yet
  // the value cannot reach any compiled event; shipping it silently would be
  // silent data loss. Engine clarifications keep their verbatim precedence;
  // producer items append after them.
  // SH-QA-1: the gated facts (normalized.resolutionGatedClarifications) are
  // NO LONGER appended here — the resolve_nouns pass decided their fate and
  // survivors already ride the bar diagnostic in the same end-of-list
  // position this append used to produce. Only the ungated producer facts
  // (unrealized-well-label / unrealized-declared-argument) still append.
  const producerClarifications = normalized.clarifications ?? [];
  const barDiagnostic = result.diagnostics.find((d) => d.code === UNRESOLVED_ARGUMENTS_CODE);
  if (barDiagnostic || producerClarifications.length > 0) {
    const clarifications = [
      ...((barDiagnostic?.details?.['clarifications'] as ScientistIntentUnresolvedFact[] | undefined) ?? []),
      ...producerClarifications,
    ];
    const terminalArtifacts: TerminalArtifacts = {
      events: [],
      directives: [],
      gaps: [],
    };
    if (normalized.protocolIntent) terminalArtifacts.protocolIntent = normalized.protocolIntent;
    return {
      terminalArtifacts,
      normalized,
      outcome: 'needs-clarification',
      diagnostics: result.diagnostics,
      clarifications,
    };
  }

  const nounsOutput = result.outputs.get('resolve_nouns') as ResolveNounsOutput | undefined;

  const eventOutput = (result.outputs.get('resolve_roles') as { events?: unknown[] } | undefined)?.events ?? [];
  const directiveOutput = (result.outputs.get('apply_directives') as { directives?: unknown[] } | undefined)?.directives ?? [];
  const labStateOutput = (result.outputs.get('lab_state') as { events?: unknown[]; snapshotAfter?: LabStateSnapshot } | undefined);
  const deckOutput = (result.outputs.get('plan_deck_layout') as { pinned?: unknown[]; autoFilled?: unknown[]; conflicts?: unknown[] } | undefined);
  const resolveLabwareOutput = (result.outputs.get('resolve_labware') as {
    labwareAdditions?: Array<{ recordId: string; reason?: string; deckSlot?: string }>;
    resolvedLabwares?: Array<{ hint: string; recordId: string; title?: string }>;
  } | undefined);
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
    ...(resolveLabwareOutput?.labwareAdditions && resolveLabwareOutput.labwareAdditions.length > 0
      ? { labwareAdditions: resolveLabwareOutput.labwareAdditions }
      : {}),
    // DECK-FOLD-1: the hints the pass bound against REAL inventory ride to the
    // deck review as placement offers of the EXISTING records. Same
    // non-empty-only idiom as labwareAdditions; capped at this single choke
    // every consumer shares (OQ1) by config/drafting/deck-review.yaml
    // maxResolvedOffers — rank is the pass-output order verbatim, truncation
    // is a silent head-slice (a gap would flip outcome via computeOutcome).
    ...(resolveLabwareOutput?.resolvedLabwares && resolveLabwareOutput.resolvedLabwares.length > 0
      ? { resolvedLabwares: capResolvedLabwares(resolveLabwareOutput.resolvedLabwares, deps.deckReviewPolicyPath) }
      : {}),
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
    clarifications: nounsOutput?.clarifications ?? [],
  };
}
