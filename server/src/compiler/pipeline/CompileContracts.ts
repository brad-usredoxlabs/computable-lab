/**
 * CompileContracts - Canonical type contracts for the chatbot-compile pipeline.
 *
 * This module defines the core request/result contracts that downstream
 * specs build on.  It is intentionally minimal in this spec; later specs
 * extend these types with richer fields.
 */

import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { DirectiveNode } from '../directives/Directive.js';
import type { PassDiagnostic } from './types.js';
import type { ValidationReport } from '../validation/ValidationReport.js';
import type { DownstreamCompileJob } from './passes/ChatbotCompilePasses.js';

// ---------------------------------------------------------------------------
// LabStateSnapshot — re-exported from the canonical state module
// ---------------------------------------------------------------------------

import type { LabStateSnapshot } from '../state/LabState.js';
export type { LabStateSnapshot };

import type { InstrumentRunFile } from '../artifacts/InstrumentRunFile.js';
export type { InstrumentRunFile };

// ---------------------------------------------------------------------------
// ConversationHistoryMessage
// ---------------------------------------------------------------------------

export interface ConversationHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// CompileRequest
// ---------------------------------------------------------------------------

export interface CompileRequest {
  prompt: string;
  attachments?: ReadonlyArray<{
    filename: string;
    mimeType: string;
    content: string | Uint8Array;
  }>;
  history?: ReadonlyArray<ConversationHistoryMessage>;
  conversationId?: string;
  priorLabState?: LabStateSnapshot;
}

// ---------------------------------------------------------------------------
// Gap
// ---------------------------------------------------------------------------

/**
 * Minimal Gap shape.  Later specs extend with richer kinds
 * (validation findings, unresolvable references, compound-class
 * ambiguities, etc.).  For now, string message + kind tag is
 * enough to carry forward.
 */
export interface Gap {
  kind: 'unresolved_ref' | 'clarification' | 'other';
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// CompileOutcome
// ---------------------------------------------------------------------------

export type CompileOutcome = 'complete' | 'gap' | 'error';

// ---------------------------------------------------------------------------
// TerminalArtifacts
// ---------------------------------------------------------------------------

/**
 * A reference that was successfully resolved against a registry.
 */
export interface ResolvedReference {
  kind: string;
  label: string;
  resolvedId: string;
  resolvedName?: string;
}

/**
 * A labware reference that was resolved against a prior lab-state snapshot.
 */
export interface ResolvedLabwareRef {
  hint: string;
  matched: { instanceId: string; labwareType: string };
}

/**
 * Delta produced by the lab_state pass: the events applied and the
 * resulting snapshot.
 */
export interface LabStateDelta {
  events: PlateEventPrimitive[];
  snapshotAfter: LabStateSnapshot;
}

/**
 * Full deck layout plan produced by resolve_labware + plan_deck_layout passes.
 * Includes user-pinned slots, auto-filled slots, and any slot conflicts.
 */
export interface DeckLayoutPlan {
  pinned: Array<{ slot: string; labwareHint: string }>;
  autoFilled: Array<{ slot: string; labwareHint: string; reason: string }>;
  conflicts: Array<{ slot: string; candidates: string[] }>;
}

/**
 * Resource manifest emitted by the compute_resources pass.
 * Summarises tip-rack needs, reservoir loads, and consumable labware.
 */
export interface ResourceManifest {
  tipRacks: Array<{ pipetteType: string; rackCount: number }>;
  reservoirLoads: Array<{
    reservoirRef: string;
    well: string;
    reagentKind: string;
    volumeUl: number;
  }>;
  consumables: string[];
}

// ---------------------------------------------------------------------------
// ExecutionScalePlan
// ---------------------------------------------------------------------------

/**
 * ExecutionScaleLevel describes the execution shape for a protocol without
 * changing its biological meaning.
 *
 * - manual_tubes: source protocol is carried out by hand in tubes/tube racks.
 * - bench_plate_multichannel: protocol is adapted to plates/reservoirs with
 *   manual multichannel pipetting.
 * - robot_deck: the plate/reservoir plan is bound to a robot deck platform.
 */
export type ExecutionScaleLevel =
  | 'manual_tubes'
  | 'bench_plate_multichannel'
  | 'robot_deck';

export type ExecutionScalePlanStatus = 'ready' | 'blocked';

export type ExecutionScaleLabwareKind =
  | 'tube'
  | 'tube_rack'
  | '2_well_reservoir'
  | '8_well_reservoir'
  | '12_well_reservoir'
  | '96_well_plate'
  | '384_well_plate';

export type ExecutionScalePlatform =
  | 'manual'
  | 'integra_assist'
  | 'opentrons_ot2'
  | 'opentrons_flex';

export type ExecutionScalePipetteMode =
  | 'single_channel'
  | 'multi_channel_parallel';

export type ExecutionScaleLaneStrategy =
  | 'sequential_lanes'
  | 'parallel_lanes';

export type ExecutionScaleChannelization =
  | 'single_channel'
  | 'multi_channel_prefer'
  | 'multi_channel_force';

export type ExecutionScaleBatching =
  | 'none'
  | 'group_by_source'
  | 'group_by_destination'
  | 'multi_dispense_prefer';

export interface ExecutionScaleWellGroup {
  groupId: string;
  wells: string[];
}

export interface ExecutionScaleSampleLayout {
  labwareRole: string;
  labwareKind: Extract<ExecutionScaleLabwareKind, 'tube_rack' | '96_well_plate' | '384_well_plate'>;
  labwareDefinition?: string;
  sampleCount?: number;
  wellGroups: ExecutionScaleWellGroup[];
}

export interface ExecutionScaleReagentLayout {
  materialRole: string;
  sourceLabwareRole: string;
  sourceLabwareKind: Extract<ExecutionScaleLabwareKind, 'tube' | '2_well_reservoir' | '8_well_reservoir' | '12_well_reservoir'>;
  sourceLabwareDefinition?: string;
  sourceWells: string[];
  reason: string;
}

export interface ExecutionScalePipettingStrategy {
  pipetteMode: ExecutionScalePipetteMode;
  channels: 1 | 8 | 12;
  laneStrategy: ExecutionScaleLaneStrategy;
  channelization: ExecutionScaleChannelization;
  batching: ExecutionScaleBatching;
}

export interface ExecutionScaleDeckBinding {
  platform: ExecutionScalePlatform;
  requiredLabwareDefinitions: string[];
  requiredTools: string[];
}

export interface ExecutionScaleBlocker {
  code: string;
  message: string;
  requiredInput?: string;
}

/**
 * ExecutionScalePlan is the deterministic handoff between semantic protocol
 * understanding and execution-specific lowering. It may describe a ready plan
 * or a blocked plan with missing context, but it must not invent new biology.
 */
export interface ExecutionScalePlan {
  kind: 'execution-scale-plan';
  recordId: string;
  sourceRef?: Record<string, unknown>;
  profileRef?: string;
  sourceLevel: ExecutionScaleLevel;
  targetLevel: ExecutionScaleLevel;
  status: ExecutionScalePlanStatus;
  sampleLayout?: ExecutionScaleSampleLayout;
  reagentLayout: ExecutionScaleReagentLayout[];
  pipettingStrategy?: ExecutionScalePipettingStrategy;
  deckBinding?: ExecutionScaleDeckBinding;
  assumptions: string[];
  blockers: ExecutionScaleBlocker[];
}

/**
 * Canonical output bundle of a chatbot-compile run.  All fields
 * except `events`, `directives`, and `gaps` are optional because
 * many compiles do not exercise every pass.  See individual
 * owning-spec references for where each field is produced.
 */
export interface TerminalArtifacts {
  /** Pipetting + incubation primitives. Spec-001. */
  events: PlateEventPrimitive[];
  /** State-change nodes (reorient, pipette mount/swap). Spec-024. */
  directives: DirectiveNode[];
  /** Actionable surface for ambiguity, unresolved refs, etc. Spec-001. */
  gaps: Gap[];
  /** Events folded into the post-compile LabStateSnapshot. Spec-009. */
  labStateDelta?: LabStateDelta;
  /** Full deck layout (user pins + auto-fill + conflicts). Specs 012, 033. */
  deckLayoutPlan?: DeckLayoutPlan;
  /** Named references resolved against registries. Spec-023. */
  resolvedRefs?: ResolvedReference[];
  /** Prior-labware refs resolved against cached labState. Spec-014. */
  resolvedLabwareRefs?: ResolvedLabwareRef[];
  /** Tip racks, reservoir loads, consumables. Spec-032. */
  resourceManifest?: ResourceManifest;
  /** Execution scaling plan from semantic protocol to bench/robot shape. */
  executionScalePlan?: ExecutionScalePlan;
  /** Per-instrument run-file artifacts. Spec-038. */
  instrumentRunFiles?: InstrumentRunFile[];
  /** Future compile targets declared by the user. Spec-039. */
  downstreamQueue?: DownstreamCompileJob[];
  /** Aggregated validation findings. Spec-034. */
  validationReport?: ValidationReport;
}

// ---------------------------------------------------------------------------
// CompileResult
// ---------------------------------------------------------------------------

export interface CompileResult {
  terminalArtifacts: TerminalArtifacts;
  outcome: CompileOutcome;
  diagnostics: PassDiagnostic[];
}
