/**
 * ChatbotCompilePasses - Factory functions for passes in the chatbot-compile pipeline.
 * 
 * This module contains pass implementations for the chatbot-compile pipeline,
 * starting with the extract_entities pass that runs extraction on prompts and attachments.
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic, PipelineState } from '../types.js';
import type {
  ExecutionScaleLabwareKind,
  ExecutionScalePlan,
  ExecutionScalePlatform,
  ResourceManifest,
} from '../CompileContracts.js';
import type { ExtractionRunnerService } from '../../../extract/ExtractionRunnerService.js';
import type { CompletionRequest } from '../../../ai/types.js';
import type { RegistryLoader } from '../../../registry/RegistryLoader.js';
import type { ProtocolSpec } from '../../../registry/ProtocolSpecRegistry.js';
import type { AssaySpec } from '../../../registry/AssaySpecRegistry.js';
import type { StampPatternSpec } from '../../../registry/StampPatternRegistry.js';
import type { CompoundClass } from '../../../registry/CompoundClassRegistry.js';
import type { OntologyTerm } from '../../../registry/OntologyTermRegistry.js';
import { getOntologyTermRegistry } from '../../../registry/OntologyTermRegistry.js';
import type { LabStateSnapshot } from '../../../compiler/state/LabState.js';
import { applyEventToLabState, emptyLabState } from '../../../compiler/state/LabState.js';
import { applyDirectiveToLabState, type DirectiveNode } from '../../../compiler/directives/Directive.js';
import { normalizeProtocolIntent, type ProtocolIntent } from '../../../compiler/protocolIntent/ProtocolIntent.js';
import { getValidationChecks } from '../../../compiler/validation/ValidationCheck.js';
import { renderPromptTemplate } from '../../../registry/PromptTemplateRegistry.js';
import {
  getExecutionScaleProfileRegistry,
  type ExecutionScaleProfileRecord,
} from '../../../registry/ExecutionScaleProfileRegistry.js';

/**
 * An entity extracted from a prompt or attachment.
 */
export interface ExtractedEntity {
  kind: string;                     // e.g. 'labware-spec', 'material', 'protocol', 'context'
  draft: unknown;                   // the extraction candidate's draft payload
  confidence?: number;
  source: 'prompt' | 'attachment';
  attachment_name?: string;
}

/**
 * A file attachment to be processed.
 */
export interface FileAttachment {
  name: string;
  mime_type: string;
  content: string | Buffer;         // text or binary
}

/**
 * Dependencies for creating the extract_entities pass.
 */
export interface CreateExtractEntitiesPassDeps {
  extractionService: ExtractionRunnerService;
}

/**
 * Creates the extract_entities pass that runs ExtractionRunnerService on prompt + file attachments.
 * 
 * This pass:
 * - Reads state.input.prompt (string) and state.input.attachments (FileAttachment[])
 * - Calls extractionService.run once per attachment (target_kind derived from filename) 
 *   plus once on freetext prompt
 * - Accumulates candidates into an entities array
 * - Propagates extraction diagnostics via PassResult.diagnostics with pass_id='extract_entities'
 */
export function createExtractEntitiesPass(
  deps: CreateExtractEntitiesPassDeps
): Pass {
  return {
    id: 'extract_entities',
    family: 'parse' as const,
    async run(args: PassRunArgs): Promise<PassResult> {
      const { state } = args;
      const pass_id = 'extract_entities';
      const prompt = typeof state.input?.prompt === 'string' ? state.input.prompt : '';
      const attachments = Array.isArray(state.input?.attachments) ? state.input.attachments : [];
      const entities: ExtractedEntity[] = [];
      const diagnostics: PassDiagnostic[] = [];

      // Helper to convert extraction diagnostics to pass diagnostics
      const convertDiagnostic = (d: unknown, attachmentName?: string): PassDiagnostic => {
        const diag = d as Record<string, unknown>;
        return {
          severity: (diag.severity as 'info' | 'warning' | 'error') ?? 'warning',
          code: (diag.code as string) ?? 'EXTRACTION_DIAG',
          message: (diag.message as string) ?? 'Extraction diagnostic',
          pass_id,
          details: {
            ...(diag.details as Record<string, unknown> ?? {}),
            ...(attachmentName ? { attachment_name: attachmentName } : {}),
          },
        };
      };

      // 1. Run extraction on prompt text if non-empty
      if (prompt.trim().length > 0) {
        try {
          const extractionResult = await deps.extractionService.run({
            target_kind: 'unknown',
            text: prompt,
            source: { kind: 'freetext', id: 'prompt' },
          });

          // Handle ExtractionDraftBody shape
          if (extractionResult && typeof extractionResult === 'object' && 'candidates' in extractionResult) {
            const result = extractionResult as { candidates?: unknown[]; diagnostics?: unknown[] };
            for (const cand of result.candidates ?? []) {
              const candidate = cand as Record<string, unknown>;
              entities.push({
                kind: (candidate.target_kind as string) ?? 'unknown',
                draft: candidate,
                ...(typeof candidate.confidence === 'number' ? { confidence: candidate.confidence } : {}),
                source: 'prompt',
              });
            }
            // Propagate diagnostics
            if (result.diagnostics) {
              for (const d of result.diagnostics) {
                diagnostics.push(convertDiagnostic(d));
              }
            }
          } else if (typeof extractionResult === 'string') {
            // Legacy string response
            let parsedData: unknown;
            try {
              parsedData = JSON.parse(extractionResult);
            } catch {
              parsedData = [];
            }
            if (Array.isArray(parsedData)) {
              for (const item of parsedData) {
                entities.push({ kind: 'tagged_phrase', draft: item, source: 'prompt' });
              }
            }
          }
        } catch (error) {
          diagnostics.push({
            severity: 'error',
            code: 'EXTRACTION_ERROR',
            message: `Failed to extract from prompt: ${error instanceof Error ? error.message : String(error)}`,
            pass_id,
          });
        }
      }

      // 2. Run extraction on each attachment
      for (const att of attachments) {
        const attName = typeof att === 'string' ? att : (att as any).name || 'unknown';
        const content = typeof att === 'string' ? att : (att as any).content || '';
        const fileNameLower = attName.toLowerCase();

        let targetKind = 'unknown';
        if (fileNameLower.endsWith('.pdf')) targetKind = 'protocol';
        else if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) targetKind = 'material';
        else if (fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm')) targetKind = 'material';

        const contentText = typeof content === 'string' ? content : String(content);

        try {
          const result = await deps.extractionService.run({
            target_kind: targetKind,
            text: contentText,
            source: { kind: 'file', id: attName, locator: attName },
          } as any);

          if (result && typeof result === 'object' && 'candidates' in result) {
            for (const cand of (result as any).candidates ?? []) {
              const candidate = cand as Record<string, unknown>;
              entities.push({
                kind: (candidate.target_kind as string) ?? targetKind,
                draft: candidate,
                ...(typeof candidate.confidence === 'number' ? { confidence: candidate.confidence } : {}),
                source: 'attachment',
                attachment_name: attName,
              });
            }
            // Propagate diagnostics
            if ((result as any).diagnostics) {
              for (const d of (result as any).diagnostics) {
                diagnostics.push(convertDiagnostic(d, attName));
              }
            }
          }
        } catch (error) {
          diagnostics.push({
            severity: 'error',
            code: 'EXTRACTION_ERROR',
            message: `Failed to extract from attachment ${attName}: ${error instanceof Error ? error.message : String(error)}`,
            pass_id,
            details: { attachment_name: attName },
          });
        }
      }

      return { ok: true, output: { entities }, ...(diagnostics.length ? { diagnostics } : {}) };
    },
  };
}

/**
 * Minimal LLM client interface for the ai_precompile pass.
 */
export interface LlmClient {
  complete(req: CompletionRequest): Promise<{
    choices: Array<{ message: { content: string | null } }>;
  }>;
}

/**
 * A directive to mint new material records at once.
 */
export interface MintMaterialsDirective {
  template: string;                          // e.g. 'fecal-sample'
  count: number;                             // e.g. 96
  namingPattern: string;                     // e.g. 'FS_{n}' where {n} is 1..count
  placementLabwareHint?: string;             // e.g. '96-well-deepwell-plate'
  wellSpread?: 'all' | 'first-row' | 'explicit';  // default 'all'
  wellList?: string[];                       // when wellSpread === 'explicit'
  properties?: Record<string, unknown>;
}

/**
 * A candidate labware hint from ai_precompile.
 */
export interface CandidateLabware {
  hint: string;
  reason?: string;
  deckSlot?: string;   // e.g. 'target', 'C1', 'D1'
}

/**
 * A reference to a labware that already exists in the lab (from a prior turn).
 */
export interface PriorLabwareRef {
  hint: string;           // original user text, e.g. "96-well deepwell plate of fecal samples"
  kindHint?: string;      // e.g. '96-well deepwell plate'
  contentHint?: string;   // e.g. 'fecal samples', 'binding buffer'
}

/**
 * A state-change directive emitted by ai_precompile (non-liquid-handling).
 */
export interface Directive {
  kind: 'reorient_labware' | 'mount_pipette' | 'swap_pipette';
  params: Record<string, unknown>;
}

/**
 * A declared future compile job (e.g. downstream analysis).
 */
export interface DownstreamCompileJob {
  kind: string;             // e.g. 'qPCR', 'GC-FID', 'GC-MS', 'plate-reader', 'imaging'
  description?: string;
  params?: Record<string, unknown>;
}

/**
 * A named stamp / fanout / triplicate pattern invocation.
 */
export interface PatternEvent {
  pattern: string;          // id from stamp-pattern registry
  fromLabwareHint?: string;
  toLabwareHint?: string;
  startCol?: number;
  startRow?: string;
  count?: number;
  perPosition?: Record<string, unknown>;  // keyed by position index or label
}

/**
 * A labware addition patch produced by resolve_labware.
 */
export interface AiLabwareAdditionPatch {
  recordId: string;
  reason: string;
  deckSlot?: string;   // carried through from candidateLabwares
}

/**
 * Output shape for the ai_precompile pass.
 */
export interface AiPrecompileOutput {
  candidateActions?: CandidateAction[];
  taggedPhrases?: TaggedPhrase[];
  protocolIntent?: ProtocolIntent;
  candidateEvents: Array<{ verb: string; [key: string]: unknown }>;
  candidateLabwares: CandidateLabware[];
  unresolvedRefs: Array<{ kind: string; label: string; reason: string }>;
  clarification?: string;
  mintMaterials?: MintMaterialsDirective[];
  priorLabwareRefs?: PriorLabwareRef[];   // references to labware that already exists
  directives?: Directive[];                   // state-change nodes (reorient, mount, swap)
  downstreamCompileJobs?: DownstreamCompileJob[];  // declared future compile targets
  patternEvents?: PatternEvent[];             // named stamp pattern invocations
}

export interface CandidateAction {
  phrase?: string;
  verb: string;
  object?: string;
  material?: string;
  reagent?: string;
  target?: string;
  amount?: string;
  volume?: string;
  duration?: string;
  temperature?: string | number;
  section?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface TaggedPhrase {
  text?: string;
  phrase?: string;
  tag?: string;
  kind?: string;
  verb?: string;
  value?: string;
  unit?: string;
  [key: string]: unknown;
}

/**
 * System prompt for the ai_precompile pass — loaded from the prompt-template registry.
 */
let _cachedPrompt: string | null = null;

/**
 * Lazily render the precompile system prompt from the registry.
 */
export function getAiPrecompileSystemPrompt(): string {
  if (_cachedPrompt === null) {
    _cachedPrompt = renderPromptTemplate('chatbot-compile.precompile.system');
  }
  return _cachedPrompt;
}

// Backward-compat shim — prefer getAiPrecompileSystemPrompt() in new code:
export const AI_PRECOMPILE_SYSTEM_PROMPT = getAiPrecompileSystemPrompt();

/**
 * Zod schema for validating ai_precompile LLM output.
 * Malformed fields produce a warning diagnostic; the pass never throws.
 * Note: z.record() is broken in zod v4 in vitest, so we use z.any() instead.
 */
// @ts-expect-error TS6133: unused function, kept for backward compat
function _createAiPrecompileOutputSchema() {
  const { z } = require('zod') as typeof import('zod');
  return z.object({
    candidateEvents: z.array(z.any()).nullable().default([]),
    candidateActions: z.array(z.any()).optional(),
    taggedPhrases: z.array(z.any()).optional(),
    candidateLabwares: z.array(z.any()).nullable().default([]),
    unresolvedRefs: z.array(z.any()).nullable().default([]),
    clarification: z.string().nullable().optional(),
    mintMaterials: z.array(z.any()).optional(),
    priorLabwareRefs: z.array(z.any()).optional(),
    directives: z.array(z.any()).optional(),
    downstreamCompileJobs: z.array(z.any()).optional(),
    patternEvents: z.array(z.any()).optional(),
    protocolIntent: z.any().optional(),
  });
}

function normalizeCandidateActionVerb(verb: string): string {
  const normalized = verb.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases: Record<string, string> = {
    add: 'add_material',
    pipette: 'transfer',
    dispense: 'transfer',
    aspirate: 'transfer',
    transfer: 'transfer',
    incubate: 'incubate',
    mix: 'mix',
    vortex: 'mix',
    resuspend: 'resuspend',
    wash: 'wash',
    rinse: 'wash',
    spin: 'spin',
    centrifuge: 'spin',
    pellet: 'pellet',
    seed: 'seed',
    read: 'read',
    measure: 'read',
    quantify: 'read',
    run: 'run_protocol',
  };
  return aliases[normalized] ?? normalized;
}

function lowerCandidateActionsToEvents(actions: unknown[] | undefined): Array<{ verb: string; [key: string]: unknown }> {
  if (!Array.isArray(actions)) return [];
  const events: Array<{ verb: string; [key: string]: unknown }> = [];
  for (const action of actions) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) continue;
    const record = action as Record<string, unknown>;
    const rawVerb = typeof record.verb === 'string'
      ? record.verb
      : typeof record.action === 'string'
        ? record.action
        : undefined;
    if (!rawVerb) continue;
    const verb = normalizeCandidateActionVerb(rawVerb);
    const phrase = typeof record.phrase === 'string'
      ? record.phrase
      : typeof record.text === 'string'
        ? record.text
        : undefined;
    const material = record.material ?? record.reagent ?? record.object;
    const volume = record.volume ?? record.amount;
    const event: { verb: string; [key: string]: unknown } = {
      verb,
      source: 'llm_candidate_action',
      ...(phrase ? { phrase, originalPhrase: phrase } : {}),
      ...(material !== undefined ? { material, material_name: material, reagent: material } : {}),
      ...(volume !== undefined ? { volume } : {}),
      ...(record.target !== undefined ? { target: record.target } : {}),
      ...(record.duration !== undefined ? { duration: record.duration } : {}),
      ...(record.temperature !== undefined ? { temperature: record.temperature } : {}),
      ...(record.labware !== undefined ? { labware: record.labware } : {}),
      ...(record.labware_id !== undefined ? { labware_id: record.labware_id } : {}),
      ...(record.wells !== undefined ? { wells: record.wells } : {}),
      candidateAction: record,
    };
    events.push(event);
  }
  return events;
}

/**
 * Normalize malformed unresolvedRefs from LLM output.
 * Handles character-index objects (e.g. {"0": "p", "1": "r"...}) by reconstructing the label string.
 * Returns a clean array of { kind, label, reason } objects.
 */
function normalizeUnresolvedRefs(input: unknown): Array<{ kind: string; label: string; reason: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(item => ({
      kind: (item.kind as string) || 'unknown',
      label: (item.label as string) || '',
      reason: (item.reason as string) || 'unresolved reference',
    }))
    .filter(ref => ref.kind && ref.kind !== 'unknown');
}

function salvageAiPrecompileOutput(input: { raw?: string | object; parsed?: unknown }): AiPrecompileOutput {
  let data: unknown = input.parsed;
  if (data === undefined && input.raw) {
    try {
      data = typeof input.raw === 'string' ? JSON.parse(input.raw) : input.raw;
    } catch {
      data = {};
    }
  }

  if (!data || typeof data !== 'object') {
    data = {};
  }

  const obj = data as Record<string, unknown>;
  // Extract raw fields
  const candidateActions: CandidateAction[] | undefined = Array.isArray(obj.candidateActions) ? (obj.candidateActions as CandidateAction[]) : undefined;
  const taggedPhrases: TaggedPhrase[] | undefined = Array.isArray(obj.taggedPhrases) ? (obj.taggedPhrases as TaggedPhrase[]) : undefined;
  
  // Lower candidateActions into candidateEvents (merge with any existing candidateEvents)
  const existingEvents = Array.isArray(obj.candidateEvents) ? obj.candidateEvents : [];
  const loweredEvents = lowerCandidateActionsToEvents(candidateActions);
  const candidateEvents = [...existingEvents, ...loweredEvents];

  return {
    candidateEvents,
    candidateLabwares: Array.isArray(obj.candidateLabwares) ? obj.candidateLabwares : [],
    unresolvedRefs: normalizeUnresolvedRefs(obj.unresolvedRefs),
    clarification: typeof obj.clarification === 'string' ? obj.clarification : undefined,
    candidateActions,
    taggedPhrases,
    protocolIntent: normalizeProtocolIntent(obj.protocolIntent),
    mintMaterials: Array.isArray(obj.mintMaterials) ? obj.mintMaterials : undefined,
    priorLabwareRefs: Array.isArray(obj.priorLabwareRefs) ? obj.priorLabwareRefs : undefined,
    directives: Array.isArray(obj.directives) ? obj.directives : undefined,
    downstreamCompileJobs: Array.isArray(obj.downstreamCompileJobs) ? obj.downstreamCompileJobs : [],
    patternEvents: Array.isArray(obj.patternEvents) ? obj.patternEvents : [],
  } as AiPrecompileOutput;
}

/**
 * Dependencies for creating the ai_precompile pass.
 */
export interface CreateAiPrecompilePassDeps {
  llmClient: LlmClient;
  model?: string;
}

type DeterministicPlanFrame = {
  verbText?: string;
  verb: string;
  span?: [number, number];
  sourceText?: string;
  parameters?: Record<string, unknown>;
  roles?: Record<string, unknown>;
  links?: Record<string, unknown>;
  diagnostics?: PassDiagnostic[];
};

export interface DeterministicProtocolPlanStep {
  stepId: string;
  verb: string;
  sourceText: string;
  roles: Record<string, unknown>;
  parameters: Record<string, unknown>;
  dependsOn: string[];
  status: 'ready' | 'blocked';
  blockers: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
}

export interface DeterministicProtocolPlan {
  kind: 'deterministic-protocol-plan';
  source: 'deterministic_precompile';
  steps: DeterministicProtocolPlanStep[];
  bindings: {
    labwareRoles: Record<string, string>;
    materialRoles: Record<string, unknown>;
  };
  assumptions: string[];
  blockers: Array<{ stepId: string; code: string; message: string; details?: Record<string, unknown> }>;
}

export interface DeterministicPlanConsolidationOutput extends AiPrecompileOutput {
  deterministicCompleteness: number;
  residualClauses: unknown[];
  protocolPlan: DeterministicProtocolPlan;
  aiPrecompile: AiPrecompileOutput;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function textMentions(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function cloneEvent(event: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...(event ?? {}) };
}

function setIfMissing(target: Record<string, unknown>, key: string, value: string | undefined): boolean {
  if (typeof target[key] === 'string' || !value) return false;
  target[key] = value;
  return true;
}

function eventParameters(event: Record<string, unknown>): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const key of ['volume_uL', 'count', 'wells', 'duration_seconds', 'concentration_uM', 'concentration']) {
    if (event[key] !== undefined) parameters[key] = event[key];
  }
  return parameters;
}

function eventRoles(event: Record<string, unknown>): Record<string, unknown> {
  const roles: Record<string, unknown> = {};
  for (const key of [
    'labware_id',
    'source_labware_id',
    'target_labware_id',
    'source_well',
    'target_wells',
    'well',
    'source',
    'destination',
    'material',
    'source_material_ref',
    'instrument',
  ]) {
    if (event[key] !== undefined) roles[key] = event[key];
  }
  return roles;
}

function stepBlocker(code: string, message: string, details?: Record<string, unknown>) {
  return {
    code,
    message,
    ...(details ? { details } : {}),
  };
}

function lowerConsolidatedCandidateEvent(
  event: Record<string, unknown>,
  roles: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...event };
  Object.assign(next, roles);
  return next;
}

function isLabwareSetupStep(verb: string, sourceText: string, roles: Record<string, unknown>): boolean {
  return verb === 'add_material'
    && typeof roles.labware_id === 'string'
    && !roles.material
    && textMentions(sourceText, ['plate', 'reservoir', 'tube', 'target position', 'source position']);
}

/**
 * Creates the deterministic_plan_consolidation pass.
 *
 * This is the second deterministic pass: it takes clause-local action frames
 * from deterministic_precompile and stitches them into an ordered protocol
 * plan with cross-clause labware bindings, simple pronoun/role resolution,
 * dependencies, and explicit blockers.
 */
export function createDeterministicPlanConsolidationPass(): Pass {
  return {
    id: 'deterministic_plan_consolidation',
    family: 'parse' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const deterministic = state.outputs.get('deterministic_precompile') as
        | (Partial<AiPrecompileOutput> & {
            deterministicCompleteness?: number;
            residualClauses?: unknown[];
            compileIr?: {
              actionFrames?: DeterministicPlanFrame[];
            };
          })
        | undefined;

      const candidateEvents = (deterministic?.candidateEvents ?? []) as Array<Record<string, unknown>>;
      const frames = deterministic?.compileIr?.actionFrames ?? [];
      const candidateLabwares = deterministic?.candidateLabwares ?? [];
      const unresolvedRefs = deterministic?.unresolvedRefs ?? [];
      const residualClauses = deterministic?.residualClauses ?? [];
      const deterministicCompleteness = typeof deterministic?.deterministicCompleteness === 'number'
        ? deterministic.deterministicCompleteness
        : 0;

      const labwareRoles = new Map<string, string>();
      const materialRoles = new Map<string, unknown>();
      const assumptions: string[] = [];
      const blockers: DeterministicProtocolPlan['blockers'] = [];
      const diagnostics: PassDiagnostic[] = [];
      const consolidatedEvents: Array<{ verb: string; [key: string]: unknown }> = [];
      const steps: DeterministicProtocolPlanStep[] = [];
      const lastMutationByLabware = new Map<string, string>();
      let lastLabwareId: string | undefined;
      let lastMaterial: unknown;

      frames.forEach((frame, index) => {
        const event = cloneEvent(candidateEvents[index]);
        if (!event.verb) event.verb = frame.verb;
        const verb = stringValue(event.verb) ?? frame.verb;
        const sourceText = frame.sourceText ?? '';
        const roles = { ...eventRoles(event), ...(frame.roles ?? {}) };
        const stepId = `det-step-${index + 1}`;
        const dependsOn = new Set<string>();

        const currentTarget = labwareRoles.get('target') ?? labwareRoles.get('plate') ?? lastLabwareId;
        const currentSource = labwareRoles.get('source') ?? labwareRoles.get('reservoir');

        if (verb === 'read') {
          const resolved = currentTarget;
          if (setIfMissing(roles, 'labware_id', resolved)) {
            assumptions.push(`${stepId}: resolved read labware from current target/plate context.`);
          }
        }
        if (verb === 'add_material') {
          const resolved = textMentions(sourceText, ['it', 'target', 'plate']) ? currentTarget : undefined;
          if (setIfMissing(roles, 'labware_id', resolved)) {
            assumptions.push(`${stepId}: resolved add-material target from current target/plate context.`);
          }
        }
        if (verb === 'transfer') {
          if (setIfMissing(roles, 'source_labware_id', currentSource)) {
            assumptions.push(`${stepId}: resolved transfer source from current source/reservoir context.`);
          }
          if (setIfMissing(roles, 'target_labware_id', currentTarget)) {
            assumptions.push(`${stepId}: resolved transfer target from current target/plate context.`);
          }
        }

        const labwareId = stringValue(roles.labware_id);
        const sourceLabwareId = stringValue(roles.source_labware_id);
        const targetLabwareId = stringValue(roles.target_labware_id);
        const mutatesLabwareId = verb === 'transfer' ? targetLabwareId : labwareId;
        const readsLabwareId = verb === 'read' ? labwareId : undefined;

        if (readsLabwareId) {
          const upstream = lastMutationByLabware.get(readsLabwareId);
          if (upstream) dependsOn.add(upstream);
        }
        if (sourceLabwareId) {
          const upstream = lastMutationByLabware.get(sourceLabwareId);
          if (upstream) dependsOn.add(upstream);
        }
        if (targetLabwareId) {
          const upstream = lastMutationByLabware.get(targetLabwareId);
          if (upstream) dependsOn.add(upstream);
        }

        const stepBlockers: DeterministicProtocolPlanStep['blockers'] = [];
        if (verb === 'read') {
          if (!roles.labware_id) {
            stepBlockers.push(stepBlocker('missing_read_labware', 'Read step has no resolved labware.'));
          }
          if (!roles.instrument) {
            stepBlockers.push(stepBlocker('missing_read_instrument', 'Read step has no resolved instrument.'));
          }
        }
        if (verb === 'add_material') {
          if (!roles.labware_id) {
            stepBlockers.push(stepBlocker('missing_add_material_target', 'Add-material step has no resolved target labware.'));
          }
          if (!roles.material && !isLabwareSetupStep(verb, sourceText, roles)) {
            stepBlockers.push(stepBlocker('missing_add_material_material', 'Add-material step has no resolved material/source.'));
          }
        }
        if (verb === 'transfer') {
          if (!roles.source_labware_id) {
            stepBlockers.push(stepBlocker('missing_transfer_source_labware', 'Transfer step has no resolved source labware.'));
          }
          if (!roles.target_labware_id) {
            stepBlockers.push(stepBlocker('missing_transfer_target_labware', 'Transfer step has no resolved target labware.'));
          }
        }

        if (stepBlockers.length > 0) {
          for (const blocker of stepBlockers) {
            blockers.push({ stepId, ...blocker });
            diagnostics.push({
              severity: 'warning',
              code: `deterministic_plan_${blocker.code}`,
              message: blocker.message,
              pass_id,
              details: { stepId, verb, sourceText },
            });
          }
        }

        if (labwareId) {
          lastLabwareId = labwareId;
          if (textMentions(sourceText, ['target', 'destination'])) labwareRoles.set('target', labwareId);
          if (textMentions(sourceText, ['plate'])) labwareRoles.set('plate', labwareId);
          if (textMentions(sourceText, ['source', 'reservoir'])) labwareRoles.set('source', labwareId);
          if (textMentions(sourceText, ['reservoir'])) labwareRoles.set('reservoir', labwareId);
        }
        if (sourceLabwareId && textMentions(sourceText, ['source', 'reservoir'])) {
          labwareRoles.set('source', sourceLabwareId);
          if (textMentions(sourceText, ['reservoir'])) labwareRoles.set('reservoir', sourceLabwareId);
        }
        if (targetLabwareId && textMentions(sourceText, ['target', 'destination', 'plate'])) {
          labwareRoles.set('target', targetLabwareId);
          if (textMentions(sourceText, ['plate'])) labwareRoles.set('plate', targetLabwareId);
        }
        if (roles.material !== undefined) {
          lastMaterial = roles.material;
          materialRoles.set('last', roles.material);
        } else if (lastMaterial !== undefined && textMentions(sourceText, ['it', 'same material', 'that material'])) {
          roles.material = lastMaterial;
          materialRoles.set('last', lastMaterial);
          assumptions.push(`${stepId}: resolved material back-reference from prior material.`);
        }

        if (mutatesLabwareId) lastMutationByLabware.set(mutatesLabwareId, stepId);

        consolidatedEvents.push(lowerConsolidatedCandidateEvent(event, roles) as { verb: string; [key: string]: unknown });
        steps.push({
          stepId,
          verb,
          sourceText,
          roles,
          parameters: { ...eventParameters(event), ...(frame.parameters ?? {}) },
          dependsOn: Array.from(dependsOn),
          status: stepBlockers.length > 0 ? 'blocked' : 'ready',
          blockers: stepBlockers,
        });
      });

      if (frames.length === 0 && candidateEvents.length > 0) {
        for (const [index, event] of candidateEvents.entries()) {
          consolidatedEvents.push(event as { verb: string; [key: string]: unknown });
          steps.push({
            stepId: `det-step-${index + 1}`,
            verb: stringValue(event.verb) ?? 'unknown',
            sourceText: '',
            roles: eventRoles(event),
            parameters: eventParameters(event),
            dependsOn: [],
            status: 'ready',
            blockers: [],
          });
        }
      }

      const protocolPlan: DeterministicProtocolPlan = {
        kind: 'deterministic-protocol-plan',
        source: 'deterministic_precompile',
        steps,
        bindings: {
          labwareRoles: Object.fromEntries(labwareRoles),
          materialRoles: Object.fromEntries(materialRoles),
        },
        assumptions,
        blockers,
      };
      const aiPrecompile: AiPrecompileOutput = {
        candidateEvents: consolidatedEvents,
        candidateLabwares,
        unresolvedRefs,
        downstreamCompileJobs: [],
        patternEvents: [],
      };

      return {
        ok: true,
        output: {
          ...aiPrecompile,
          deterministicCompleteness,
          residualClauses,
          protocolPlan,
          aiPrecompile,
        } satisfies DeterministicPlanConsolidationOutput,
        secondaryOutputs: { ai_precompile: aiPrecompile },
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    },
  };
}

/**
 * Creates the ai_precompile pass that asks an LLM to reason over prompt + entities
 * and emit supplemental compile directives.
 *
 * spec-046: Gated on deterministic_precompile output. If deterministic completeness >= 0.9
 * and no residual clauses, returns the deterministic plan directly (no LLM call).
 * Otherwise, includes the deterministic plan in the user message for context. Once
 * deterministic_precompile has emitted core artifacts, ai_precompile no longer
 * contributes candidateEvents/candidateLabwares; it only contributes supplemental
 * outputs such as mintMaterials, directives, patternEvents, downstream jobs, and
 * clarification. When deterministic_precompile is absent or emitted no core artifacts,
 * legacy LLM candidateEvents/candidateLabwares remain accepted as a fallback.
 */
export function createAiPrecompilePass(deps: CreateAiPrecompilePassDeps): Pass {
  return {
    id: 'ai_precompile',
    family: 'expand' as const,
    run: async (args: PassRunArgs) => {
      const { state } = args;
      const consolidated = state.outputs.get('deterministic_plan_consolidation') as
        | DeterministicPlanConsolidationOutput
        | undefined;
      if (
        consolidated
        && consolidated.deterministicCompleteness >= 0.9
        && consolidated.residualClauses.length === 0
      ) {
        return { ok: true, output: consolidated.aiPrecompile };
      }

      const raw = await deps.llmClient.complete({
        model: deps.model ?? 'claude-sonnet-4-6',
        messages: [
          { role: 'system', content: getAiPrecompileSystemPrompt() },
          { role: 'user', content: JSON.stringify(state) }
        ],
        response_format: { type: 'json_object' },
      } as CompletionRequest);
      const content = raw.choices[0]?.message?.content ?? '';

      // Try to parse JSON
      let parsed: unknown;
      try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content;
      } catch {
        // JSON parse failed — return empty output with warning diagnostic
        return {
          ok: true,
          output: consolidated?.aiPrecompile ?? salvageAiPrecompileOutput({ raw: '' }),
          diagnostics: [{
            severity: 'warning',
            code: 'ai_precompile_parse_error',
            message: 'LLM response was not valid JSON',
            pass_id: 'ai_precompile',
            details: { raw_preview: content.slice(0, 300) },
          }],
        };
      }

      const output = salvageAiPrecompileOutput({ parsed });
      if (consolidated?.aiPrecompile.candidateEvents.length) {
        output.candidateEvents = consolidated.aiPrecompile.candidateEvents;
        output.candidateLabwares = consolidated.aiPrecompile.candidateLabwares;
        output.unresolvedRefs = [
          ...consolidated.aiPrecompile.unresolvedRefs,
          ...output.unresolvedRefs,
        ];
      }

      // Regression detection: warn when LLM emits physical well addresses instead of role coordinates
      const diagnostics: PassDiagnostic[] = [];
      const physicalWellCount = output.candidateEvents.filter(
        e => (e as any).wells || ((e as any).params && (e as any).params.wells)
      ).length;
      if (physicalWellCount > 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'ai_precompile_role_regression',
          message: `${physicalWellCount} events use physical well addresses instead of role coordinates`,
          pass_id: 'ai_precompile',
        });
      }

      return { ok: true, output, ...(diagnostics.length ? { diagnostics } : {}) };
    }
  };
}

/**
 * Import the biology verb expander registry (side-effect registration).
 */
import { getExpander, type PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';
import '../../biology/verbs/simpleVerbs.js';
import '../../biology/verbs/compoundVerbs.js';
import '../../biology/verbs/centrifugeVerbs.js';

/**
 * Import the role resolver.
 */
import { defaultRoleResolver, type RoleResolutionContext } from '../../roles/RoleResolver.js';

/**
 * Import the pattern expander registry.
 */
import {
  getPatternExpander,
} from '../../patterns/PatternExpanders.js';

// ---------------------------------------------------------------------------
// resolve_prior_labware_references pass
// ---------------------------------------------------------------------------

/**
 * A labware reference that was successfully resolved against a prior snapshot.
 */
export interface ResolvedLabwareRef {
  hint: string;
  matched: { instanceId: string; labwareType: string };
}

/**
 * A labware reference that could not be resolved.
 */
export interface UnresolvedLabwareRef {
  hint: string;
  reason: string;
}

/**
 * Output shape for the resolve_prior_labware_references pass.
 */
export interface ResolvePriorLabwareReferencesOutput {
  resolvedLabwareRefs: ResolvedLabwareRef[];
  unresolved: UnresolvedLabwareRef[];
}

/**
 * Simple heuristic: match a PriorLabwareRef against labware in a snapshot.
 * Uses kindHint (labwareType substring/token overlap) and contentHint
 * (material kind substring) to find the best match.
 */
function findLabwareByHints(
  snapshot: LabStateSnapshot,
  ref: PriorLabwareRef,
): { instanceId: string; labwareType: string } | undefined {
  for (const instance of Object.values(snapshot.labware)) {
    // Match by labwareType substring (case-insensitive) against kindHint.
    if (ref.kindHint) {
      const normalizedKindHint = ref.kindHint.toLowerCase().replace(/[\s-]/g, '');
      const normalizedType = instance.labwareType.toLowerCase().replace(/[\s-]/g, '');
      if (normalizedType.includes(normalizedKindHint)) {
        // Strong substring match — also check contentHint if present
        if (ref.contentHint) {
          const materials = Object.values(instance.wells).flat();
          const firstWord = ref.contentHint!.toLowerCase().split(/\s+/)[0] ?? '';
          const anyMatch = materials.some(
            m => (m.kind ?? '').toLowerCase().includes(firstWord),
          );
          if (anyMatch) {
            return { instanceId: instance.instanceId, labwareType: instance.labwareType };
          }
        } else {
          return { instanceId: instance.instanceId, labwareType: instance.labwareType };
        }
      } else {
        // Fallback: split on non-alpha and check token overlap.
        const wantTokens = ref.kindHint.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        const haveTokens = instance.labwareType.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        const overlap = wantTokens.filter(t => haveTokens.includes(t)).length;
        if (overlap >= 2) {
          // Token overlap sufficient — also check contentHint if present
          if (ref.contentHint) {
            const materials = Object.values(instance.wells).flat();
            const firstWord = ref.contentHint!.toLowerCase().split(/\s+/)[0] ?? '';
            const anyMatch = materials.some(
              m => (m.kind ?? '').toLowerCase().includes(firstWord),
            );
            if (anyMatch) {
              return { instanceId: instance.instanceId, labwareType: instance.labwareType };
            }
          } else {
            return { instanceId: instance.instanceId, labwareType: instance.labwareType };
          }
        }
      }
    }
    // If no kindHint, try contentHint only.
    if (ref.contentHint) {
      const materials = Object.values(instance.wells).flat();
      const firstWord = (ref.contentHint ?? '').toLowerCase().split(/\s+/)[0] ?? '';
      const anyMatch = materials.some(
        m => (m.kind ?? '').toLowerCase().includes(firstWord),
      );
      if (anyMatch) {
        return { instanceId: instance.instanceId, labwareType: instance.labwareType };
      }
    }
  }
  return undefined;
}

/**
 * Creates the resolve_prior_labware_references pass that resolves
 * priorLabwareRefs against the prior lab-state snapshot.
 *
 * This pass:
 * - Reads priorLabwareRefs from state.outputs.get('ai_precompile')
 * - Reads prior labState from state.input.labState
 * - For each ref, tries to match against labware in the snapshot
 * - Emits resolvedLabwareRefs[] for matches, unresolved[] for gaps
 */
export function createResolvePriorLabwareReferencesPass(): Pass {
  return {
    id: 'resolve_prior_labware_references',
    family: 'disambiguate' as const,
    run({ state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { priorLabwareRefs?: PriorLabwareRef[] } | undefined;
      const refs = ai?.priorLabwareRefs ?? [];
      const prior = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();
      const resolved: ResolvedLabwareRef[] = [];
      const gaps: UnresolvedLabwareRef[] = [];

      for (const ref of refs) {
        const match = findLabwareByHints(prior, ref);
        if (match) {
          resolved.push({ hint: ref.hint, matched: match });
        } else {
          gaps.push({ hint: ref.hint, reason: 'no matching labware in prior snapshot' });
        }
      }

      return {
        ok: true,
        output: { resolvedLabwareRefs: resolved, unresolved: gaps } satisfies ResolvePriorLabwareReferencesOutput,
      };
    },
  };
}

/**
 * Creates the expand_biology_verbs pass that lowers high-level biology verbs
 * to primitive event types that the ContextEngine handles.
 * 
 * This pass:
 * - Reads candidateEvents from state.outputs.get('ai_precompile')
 * - Looks up expanders for each verb
 * - Concatenates expanded PlateEventPrimitive[] into output { events }
 * - Unknown verbs produce a warning diagnostic code='unknown_biology_verb' and are skipped
 * - Special verbs like 'run_protocol' are passed through unchanged for downstream
 *   expand_protocol pass to handle
 * - Handles targetLabwareRef: 'prior' sentinel by resolving against
 *   resolve_prior_labware_references output and passing the resolved
 *   instanceId as labware_id to the expander
 */
export function createExpandBiologyVerbsPass(): Pass {
  return {
    id: 'expand_biology_verbs',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as { candidateEvents?: Array<{ verb: string; [k: string]: unknown }> } | undefined;
      const candidateEvents = ai?.candidateEvents ?? [];
      const events: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];

      // Look up resolved prior labware refs (for targetLabwareRef: 'prior' sentinel)
      const priorLabwareOutput = state.outputs.get('resolve_prior_labware_references') as
        { resolvedLabwareRefs?: Array<{ hint: string; matched: { instanceId: string; labwareType: string } }> } | undefined;
      const resolvedPriorRefs = priorLabwareOutput?.resolvedLabwareRefs ?? [];

      for (const cand of candidateEvents) {
        const { verb, ...params } = cand;

        // Pass through 'run_protocol' events unchanged — expand_protocol will handle them
        if (verb === 'run_protocol') {
          events.push({
            eventId: `evt_run_protocol_${cand.protocolRef ?? 'unknown'}`,
            event_type: 'run_protocol' as any,
            details: { ...params },
          });
          continue;
        }

        // Handle targetLabwareRef: 'prior' sentinel — resolve against prior labware refs
        if ((params.targetLabwareRef as string | undefined) === 'prior') {
          const firstResolved = resolvedPriorRefs[0];
          if (firstResolved) {
            // Pass the resolved instanceId as labware_id to the expander
            (params as Record<string, unknown>).labware_id = firstResolved.matched.instanceId;
          } else {
            // No resolved ref available — emit with null labwareInstanceId and flag in gaps
            diagnostics.push({
              severity: 'warning' as const,
              code: 'prior_labware_not_resolved',
              message: `targetLabwareRef 'prior' resolved to no labware; emitting event with null labwareId.`,
              pass_id,
            });
          }
        }

        const expander = getExpander(verb);
        if (!expander) {
          diagnostics.push({
            severity: 'warning' as const,
            code: 'unknown_biology_verb',
            message: `No expander registered for verb '${verb}'; dropping candidate event.`,
            pass_id,
            details: { verb },
          });
          continue;
        }
        const expanded = expander.expand({ verb, params });
        for (const e of expanded) events.push(e);
      }

      return { ok: true, output: { events }, diagnostics };
    },
  };
}

// ---------------------------------------------------------------------------
// resolve_references pass
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
 * A reference that could not be resolved.
 */
export interface UnresolvedReference {
  kind: string;
  label: string;
  reason: string;
  candidates?: unknown[];
}

/**
 * Output shape for the resolve_references pass.
 */
export interface ResolveReferencesOutput {
  resolvedRefs: ResolvedReference[];
  unresolvableRefs: UnresolvedReference[];
}

/**
 * Dependencies for creating the resolve_references pass.
 */
export interface CreateResolveReferencesPassDeps {
  protocolRegistry: RegistryLoader<ProtocolSpec>;
  assayRegistry: RegistryLoader<AssaySpec>;
  stampPatternRegistry: RegistryLoader<StampPatternSpec>;
  compoundClassRegistry: RegistryLoader<CompoundClass>;
  ontologyTermRegistry: ReturnType<typeof getOntologyTermRegistry>;
}

/**
 * Simple fuzzy match: case-insensitive, strips non-alphanumeric chars,
 * returns true if either string contains the other.
 */
function fuzzyMatch(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const n = needle.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return h.includes(n) || n.includes(h);
}

/**
 * Creates the resolve_references pass that dispatches unresolved refs
 * from ai_precompile to the appropriate registry for lookup.
 *
 * This pass:
 * - Reads unresolvedRefs from state.outputs.get('ai_precompile')
 * - Dispatches each ref by kind to the correct registry
 * - Returns resolvedRefs[] and unresolvableRefs[]
 * - For compound-class with >1 candidates, emits a gap (not auto-pick)
 */
export function createResolveReferencesPass(
  deps: CreateResolveReferencesPassDeps,
): Pass {
  return {
    id: 'resolve_references',
    family: 'disambiguate' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { unresolvedRefs?: Array<{ kind: string; label: string; reason: string }> } | undefined;
      const refs = ai?.unresolvedRefs ?? [];
      const resolved: ResolvedReference[] = [];
      const unresolvable: UnresolvedReference[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const ref of refs) {
        switch (ref.kind) {
          case 'protocol': {
            const found = deps.protocolRegistry.list().find(
              p => fuzzyMatch(p.name, ref.label) || p.id === ref.label,
            );
            if (found) {
              resolved.push({
                kind: ref.kind,
                label: ref.label,
                resolvedId: found.id,
                resolvedName: found.name,
              });
            } else {
              unresolvable.push({ ...ref, reason: 'no matching protocol-spec' });
            }
            break;
          }
          case 'assay': {
            const found = deps.assayRegistry.list().find(
              a => fuzzyMatch(a.name, ref.label) || a.id === ref.label,
            );
            if (found) {
              resolved.push({
                kind: ref.kind,
                label: ref.label,
                resolvedId: found.id,
                resolvedName: found.name,
              });
            } else {
              unresolvable.push({ ...ref, reason: 'no matching assay-spec' });
            }
            break;
          }
          case 'pattern': {
            const found =
              deps.stampPatternRegistry.get(ref.label) ??
              deps.stampPatternRegistry.list().find(
                p => fuzzyMatch(p.name, ref.label),
              );
            if (found) {
              resolved.push({
                kind: ref.kind,
                label: ref.label,
                resolvedId: found.id,
                resolvedName: found.name,
              });
            } else {
              unresolvable.push({ ...ref, reason: 'no matching stamp-pattern' });
            }
            break;
          }
          case 'compound-class': {
            const found = deps.compoundClassRegistry.list().find(
              c => fuzzyMatch(c.name, ref.label) || c.id === ref.label,
            );
            if (!found) {
              unresolvable.push({ ...ref, reason: 'no matching compound-class' });
              break;
            }
            if (found.candidates.length === 1) {
              const candidate = found.candidates[0]!;
              const resolvedRef: ResolvedReference & { chebiTerms?: OntologyTerm[] } = {
                kind: ref.kind,
                label: ref.label,
                resolvedId: candidate.compoundId,
                resolvedName: candidate.name,
              };
              // Resolve chebi_ids if present
              if (found.chebi_ids && found.chebi_ids.length > 0) {
                const chebiTerms: OntologyTerm[] = [];
                for (const chebiId of found.chebi_ids) {
                  const term = deps.ontologyTermRegistry.get(chebiId);
                  if (term) {
                    chebiTerms.push(term);
                  } else {
                    diagnostics.push({
                      severity: 'warning',
                      code: 'unknown_chebi_id',
                      message: `compound-class "${found.id}" references unknown ChEBI id ${chebiId}`,
                      pass_id,
                      details: { classId: found.id, chebiId },
                    });
                  }
                }
                if (chebiTerms.length > 0) {
                  resolvedRef.chebiTerms = chebiTerms;
                }
              }
              resolved.push(resolvedRef);
            } else {
              unresolvable.push({
                ...ref,
                reason: `compound-class has ${found.candidates.length} candidates; pick one`,
                candidates: found.candidates,
              });
            }
            break;
          }
          default:
            // labware, material, other — not handled here (spec-014 for labware)
            unresolvable.push({
              ...ref,
              reason: `kind ${ref.kind} not handled by resolve_references`,
            });
        }
      }

      return {
        ok: true,
        output: { resolvedRefs: resolved, unresolvableRefs: unresolvable } satisfies ResolveReferencesOutput,
        diagnostics,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// expand_protocol pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the expand_protocol pass.
 */
export interface ExpandProtocolOutput {
  events: PlateEventPrimitive[];
  stepsExpanded: number;
}

/**
 * Dependencies for creating the expand_protocol pass.
 */
export interface CreateExpandProtocolPassDeps {
  protocolRegistry: RegistryLoader<ProtocolSpec>;
}

/**
 * Creates the expand_protocol pass that unrolls resolved protocol-specs
 * into primitive PlateEventPrimitive events.
 *
 * This pass:
 * - Reads resolvedRefs from state.outputs.get('resolve_references')
 * - Filters for kind === 'protocol'
 * - For each resolved protocol, looks up the spec from the registry
 * - Finds the matching run_protocol invocation in ai_precompile's candidateEvents
 * - Substitutes {{key}} placeholders in step params from invocation bindings
 * - Emits one PlateEventPrimitive per step with the mapped event_type
 * - Unresolved placeholders produce warning diagnostics (not errors)
 */
export function createExpandProtocolPass(
  deps: CreateExpandProtocolPassDeps,
): Pass {
  return {
    id: 'expand_protocol',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const resolvedRefs = (
        state.outputs.get('resolve_references') as
          { resolvedRefs?: ResolvedReference[] } | undefined
      )?.resolvedRefs ?? [];
      const protocolRefs = resolvedRefs.filter(r => r.kind === 'protocol');

      const ai = state.outputs.get('ai_precompile') as
        { candidateEvents?: Array<{ verb: string; [k: string]: unknown }> } | undefined;
      const candidateEvents = ai?.candidateEvents ?? [];

      const emitted: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];
      let stepsExpanded = 0;

      for (const ref of protocolRefs) {
        const spec = deps.protocolRegistry.get(ref.resolvedId);
        if (!spec) {
          diagnostics.push({
            severity: 'warning',
            code: 'protocol_not_found',
            message: `Protocol ${ref.resolvedId} resolved but not findable`,
            pass_id,
          });
          continue;
        }

        // Find the run_protocol invocation in candidateEvents that refers to this ref
        const invocation = candidateEvents.find(
          e =>
            e.verb === 'run_protocol' &&
            (e.protocolRef === ref.label || e.protocolRef === ref.resolvedId),
        );
        const bindings = (invocation?.bindings as Record<string, string> | undefined) ?? {};

        for (const step of spec.steps) {
          const substituted = substituteParams(
            step.params,
            bindings,
            diagnostics,
            pass_id,
          );
          emitted.push({
            eventId: `pe_proto_${ref.resolvedId}_${step.step}`,
            event_type: mapProtocolVerbToEventType(step.verb),
            details: {
              protocolStepNumber: step.step,
              protocolId: ref.resolvedId,
              ...substituted,
            },
          });
          stepsExpanded++;
        }
      }

      return { ok: true, output: { events: emitted, stepsExpanded }, diagnostics };
    },
  };
}

/**
 * Substitute {{key}} placeholders in step params with values from bindings.
 * Unresolved placeholders produce a warning diagnostic and are set to null.
 */
function substituteParams(
  params: Record<string, unknown>,
  bindings: Record<string, string>,
  diagnostics: PassDiagnostic[],
  pass_id: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== 'string') {
      out[k] = v;
      continue;
    }
    const match = v.match(/^\{\{([^}]+)\}\}$/);
    if (!match) {
      out[k] = v;
      continue;
    }
    const key = match[1]!.trim();
    // Try exact key first, then fall back to the last segment after '.'
    const resolved =
      bindings[key] ?? bindings[key.split('.').pop() ?? ''];
    if (resolved === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'unresolved_placeholder',
        message: `Unresolved placeholder: {{${key}}}`,
        pass_id,
      });
      out[k] = null;
    } else {
      out[k] = resolved;
    }
  }
  return out;
}

/**
 * Map a protocol step verb to a PlateEventPrimitive event_type.
 * Falls back to 'transfer' for unmapped verbs.
 */
function mapProtocolVerbToEventType(
  verb: string,
): PlateEventPrimitive['event_type'] {
  switch (verb) {
    case 'add_material':
      return 'add_material';
    case 'transfer':
    case 'aliquot':
    case 'wash':
    case 'elute':
      return 'transfer';
    case 'mix':
      return 'mix';
    case 'incubate':
      return 'incubate';
    case 'read':
      return 'read';
    case 'spin':
    case 'pellet':
      return 'centrifuge';
    default:
      return 'transfer'; // fallback
  }
}

/**
 * A labware hint that was successfully resolved to an existing instance.
 */
export interface ResolvedLabware {
  hint: string;
  recordId: string;
  title?: string;
}

/**
 * Output shape for the resolve_labware pass.
 */
export interface LabwareResolveOutput {
  labwareAdditions: AiLabwareAdditionPatch[];
  resolvedLabwares: ResolvedLabware[];
}

/**
 * Dependencies for creating the resolve_labware pass.
 */
export interface CreateLabwareResolvePassDeps {
  searchLabwareByHint: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
}

/**
 * Creates the resolve_labware pass that disambiguates candidate labware hints.
 * 
 * This pass:
 * - Reads candidateLabwares from state.outputs.get('ai_precompile')
 * - For each hint, calls searchLabwareByHint and:
 *   (a) if one match → adds to resolvedLabwares with {hint, recordId, title}
 *   (b) if >1 matches → adds to resolvedLabwares with the top match AND emits an 'ambiguous_labware_hint' info diagnostic
 *   (c) if zero matches → emits an AiLabwareAddition {recordId: hint, reason: 'proposed from prompt'} in labwareAdditions
 * - Carries deckSlot from candidateLabwares through to labwareAdditions
 * - Output shape: { labwareAdditions, resolvedLabwares }
 */
export function createLabwareResolvePass(
  deps: CreateLabwareResolvePassDeps,
): Pass {
  return {
    id: 'resolve_labware',
    family: 'disambiguate' as const,
    async run({ pass_id, state }: PassRunArgs): Promise<PassResult> {
      const ai = state.outputs.get('ai_precompile') as { candidateLabwares?: CandidateLabware[] } | undefined;
      const lowered = state.outputs.get('lower_protocol_intent') as { candidateLabwares?: CandidateLabware[] } | undefined;
      const candidates = [
        ...(ai?.candidateLabwares ?? []),
        ...(lowered?.candidateLabwares ?? []),
      ];
      const labwareAdditions: AiLabwareAdditionPatch[] = [];
      const resolvedLabwares: ResolvedLabware[] = [];
      const diagnostics: PassDiagnostic[] = [];

      // Fold runtime/editor mention-resolved labware into resolvedLabwares so
      // downstream passes can find them without a record-store lookup. Labware
      // records/definitions mentioned as `lbw-...` or `def:...` are still
      // allowed to flow through candidateLabwares so the UI can propose placing
      // them on the deck.
      const mentions = Array.isArray(state.input.mentions) ? state.input.mentions as Array<{ type?: string; id?: string; label?: string }> : [];
      const editorLabwares = Array.isArray(state.input.editorLabwares) ? state.input.editorLabwares as Array<{ labwareId?: string; name?: string }> : [];
      const editorTitleById = new Map<string, string>();
      for (const lw of editorLabwares) {
        if (lw && typeof lw.labwareId === 'string' && typeof lw.name === 'string') {
          editorTitleById.set(lw.labwareId, lw.name);
        }
      }
      const runtimeMentionLabwareIds = new Set<string>();
      for (const m of mentions) {
        if (m && m.type === 'labware' && typeof m.id === 'string' && m.id.startsWith('lw-')) {
          runtimeMentionLabwareIds.add(m.id);
          const title = editorTitleById.get(m.id) ?? (typeof m.label === 'string' ? m.label : undefined);
          resolvedLabwares.push({ hint: m.id, recordId: m.id, ...(title ? { title } : {}) });
        }
      }

      for (const cand of candidates) {
        const hint = cand.hint;
        if (typeof hint !== 'string' || hint.trim().length === 0) continue;

        // Mention-shortcut: the LLM is told not to do this, but if a hint
        // exactly matches a mention id, honor it without a record-store hit.
        if (runtimeMentionLabwareIds.has(hint)) continue;

        const matches = await deps.searchLabwareByHint(hint);

        if (matches.length === 0) {
          // Zero matches: propose a new labware addition
          labwareAdditions.push({
            recordId: hint,
            ...(cand.reason ? { reason: cand.reason } : { reason: 'proposed from prompt' }),
            ...(cand.deckSlot ? { deckSlot: cand.deckSlot } : {}),
          });
        } else if (matches.length === 1) {
          // One match: resolve directly
          resolvedLabwares.push({ hint, recordId: matches[0]!.recordId, title: matches[0]!.title });
          // When the prompt named a deck slot, also surface a placement so
          // the editor puts the resolved labware on that slot.
          if (cand.deckSlot) {
            labwareAdditions.push({
              recordId: matches[0]!.recordId,
              reason: cand.reason ?? 'placed via prompt',
              deckSlot: cand.deckSlot,
            });
          }
        } else {
          // Multi-match: pick top, emit info diagnostic so the UI can prompt the user
          resolvedLabwares.push({ hint, recordId: matches[0]!.recordId, title: matches[0]!.title });
          if (cand.deckSlot) {
            labwareAdditions.push({
              recordId: matches[0]!.recordId,
              reason: cand.reason ?? 'placed via prompt',
              deckSlot: cand.deckSlot,
            });
          }
          diagnostics.push({
            severity: 'info' as const,
            code: 'ambiguous_labware_hint',
            message: `Hint '${hint}' matched ${matches.length} labware candidates; chose '${matches[0]!.title}' (${matches[0]!.recordId})`,
            pass_id,
            details: {
              hint,
              chosen: matches[0],
              alternatives: matches.slice(1, 5),
            },
          });
        }
      }

      return {
        ok: true,
        output: { labwareAdditions, resolvedLabwares } satisfies LabwareResolveOutput,
        diagnostics,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// lab_state pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the lab_state pass.
 */
export interface LabStatePassOutput {
  events: PlateEventPrimitive[];
  snapshotAfter: LabStateSnapshot;
}

/**
 * Creates the lab_state pass that folds expanded events over the prior
 * lab-state snapshot and emits the updated state.
 *
 * This pass:
 * - Reads prior labState from state.input.labState (defaults to emptyLabState)
 * - Reads directives from state.outputs.get('apply_directives')
 * - Reads events from state.outputs.get('resolve_roles') (which aggregates
 *   mint_materials, expand_patterns, expand_biology_verbs, expand_protocol)
 * - Folds directives FIRST, then events, via applyDirectiveToLabState / applyEventToLabState
 * - Increments turnIndex by 1
 * - Returns { events, snapshotAfter }
 */
export function createLabStatePass(): Pass {
  return {
    id: 'lab_state',
    family: 'emit' as const,
    run({ state }: PassRunArgs): PassResult {
      const prior = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();
      // resolve_roles aggregates all expanded events (mint, patterns, verbs, protocol)
      const resolvedRolesOutput = state.outputs.get('resolve_roles') as
        { events?: PlateEventPrimitive[] } | undefined;
      const events = resolvedRolesOutput?.events ?? [];

      // Fold directives FIRST, then events (events depend on post-directive state)
      let snapshot: LabStateSnapshot = { ...prior, turnIndex: prior.turnIndex + 1 };
      const directives = (state.outputs.get('apply_directives') as { directives?: DirectiveNode[] } | undefined)?.directives ?? [];
      for (const d of directives) {
        snapshot = applyDirectiveToLabState(snapshot, d);
      }
      for (const event of events) {
        snapshot = applyEventToLabState(snapshot, event);
      }
      return { ok: true, output: { events, snapshotAfter: snapshot } };
    },
  };
}

// ---------------------------------------------------------------------------
// mint_materials pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the mint_materials pass.
 */
export interface MintMaterialsPassOutput {
  events: PlateEventPrimitive[];
}

/**
 * Output shape for the apply_directives pass.
 */
export interface ApplyDirectivesPassOutput {
  directives: DirectiveNode[];
}

/**
 * Creates the apply_directives pass that turns ai_precompile.directives
 * entries into DirectiveNode[] with generated directiveIds.
 *
 * This pass:
 * - Reads directives from state.outputs.get('ai_precompile')
 * - For each directive, generates a directiveId (dir_<counter>)
 * - Emits { directives: DirectiveNode[] }
 */
export function createApplyDirectivesPass(): Pass {
  return {
    id: 'apply_directives',
    family: 'expand' as const,
    run({ state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { directives?: Directive[] } | undefined;
      const lowered = state.outputs.get('lower_protocol_intent') as
        { directives?: Directive[] } | undefined;
      const rawDirectives = [
        ...(ai?.directives ?? []),
        ...(lowered?.directives ?? []),
      ];
      const directives: DirectiveNode[] = [];

      for (let i = 0; i < rawDirectives.length; i++) {
        const raw = rawDirectives[i]!;
        directives.push({
          directiveId: `dir_${i + 1}`,
          kind: raw.kind,
          params: raw.params ?? {},
        });
      }

      return {
        ok: true,
        output: { directives } satisfies ApplyDirectivesPassOutput,
      };
    },
  };
}

/**
 * Generate a well address for a 96-well plate (rows A-H × cols 1-12).
 * Fills left-to-right, top-to-bottom.
 */
function wellAddressForIndex(index: number): string {
  const row = String.fromCharCode(65 + Math.floor(index / 12)); // A=65
  const col = (index % 12) + 1;
  return `${row}${col}`;
}

/**
 * Collect all existing materialIds from labState for collision detection.
 */
function collectExistingMaterialIds(labState: LabStateSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const instance of Object.values(labState.labware)) {
    for (const materials of Object.values(instance.wells)) {
      for (const m of materials) {
        ids.add(m.materialId);
      }
    }
  }
  return ids;
}

/**
 * Resolve the placement labware for a mint directive.
 * Priority order:
 * 1. resolve_prior_labware_references (by labwareType match)
 * 2. resolve_labware pass output (resolvedLabwares)
 * 3. labState direct lookup (by labwareType match)
 * 4. Otherwise return undefined (will create new container)
 */
function resolvePlacementLabware(
  directive: MintMaterialsDirective,
  state: PipelineState,
): { instanceId: string; labwareType: string } | undefined {
  const hint = directive.placementLabwareHint;
  if (!hint) return undefined;

  // 1. Check resolve_prior_labware_references output
  const priorLabwareOutput = state.outputs.get('resolve_prior_labware_references') as
    { resolvedLabwareRefs?: Array<{ hint: string; matched: { instanceId: string; labwareType: string } }> } | undefined;
  const priorRefs = priorLabwareOutput?.resolvedLabwareRefs ?? [];
  for (const ref of priorRefs) {
    if (ref.matched.labwareType === hint) {
      return ref.matched;
    }
  }

  // 2. Check resolve_labware pass output
  const labwareResolveOutput = state.outputs.get('resolve_labware') as
    { resolvedLabwares?: Array<{ hint: string; recordId: string; title?: string }> } | undefined;
  const resolvedLabwares = labwareResolveOutput?.resolvedLabwares ?? [];
  for (const rl of resolvedLabwares) {
    if (rl.hint === hint) {
      return { instanceId: rl.recordId, labwareType: hint };
    }
  }

  // 3. Check labState directly for existing labware of this type
  const labState = (state.input as { labState?: LabStateSnapshot }).labState ?? emptyLabState();
  for (const instance of Object.values(labState.labware)) {
    if (instance.labwareType === hint) {
      return { instanceId: instance.instanceId, labwareType: hint };
    }
  }

  return undefined;
}

/**
 * Creates the mint_materials pass that expands mintMaterials directives
 * into create_container + add_material events.
 *
 * This pass:
 * - Reads mintMaterials from state.outputs.get('ai_precompile')
 * - Iterates ALL directives (not just the first)
 * - For each directive with a placementLabwareHint:
 *   - Resolves against resolve_prior_labware_references, then resolve_labware
 *   - If an existing labware instance is found, reuses it (no create_container)
 *   - Otherwise emits one create_container
 * - For each material to mint, emits one add_material with generated materialId
 * - Name collision check: if materialId already exists in labState, appends _2, _3, etc.
 *   and emits a warning diagnostic with code 'mint_materials_name_collision'
 * - wellSpread: 'explicit' uses directive.wellList verbatim
 * - wellSpread: 'first-row' fills A1..L1 (12 wells)
 * - wellSpread: 'all' (default) fills every well left-to-right, top-to-bottom
 */
export function createMintMaterialsPass(): Pass {
  return {
    id: 'mint_materials',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { mintMaterials?: MintMaterialsDirective[] } | undefined;
      const directives = ai?.mintMaterials ?? [];
      const events: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];
      const createdHints = new Set<string>();

      // Collect existing materialIds from labState for collision detection
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();
      const existingMaterialIds = collectExistingMaterialIds(labState);

      // Track used disambiguation suffixes per naming pattern
      const usedMaterialIds = new Set<string>(existingMaterialIds);

      for (const d of directives) {
        // 1. Resolve placement labware
        const resolvedLabware = resolvePlacementLabware(d, state);
        const labwareInstanceId = resolvedLabware?.instanceId ?? d.placementLabwareHint ?? 'auto';
        const labwareType = resolvedLabware?.labwareType ?? d.placementLabwareHint ?? '96-well-plate';

        // 2. Emit create_container only if labware doesn't already exist in labState
        if (d.placementLabwareHint && !createdHints.has(d.placementLabwareHint)) {
          // Check if this labware already exists in labState
          const alreadyExists = Object.values(labState.labware).some(
            inst => inst.labwareType === d.placementLabwareHint,
          );

          if (!alreadyExists) {
            createdHints.add(d.placementLabwareHint);
            events.push({
              eventId: `evt-mint-container-${d.placementLabwareHint}`,
              event_type: 'create_container',
              details: {
                labwareType,
                slot: 'auto',
                instanceId: labwareInstanceId,
              },
            });
          }
          // If already exists, skip create_container — reuse existing instance
        }

        // 3. For n = 1..count: compute materialId, destination well, emit add_material
        const count = Math.max(0, d.count);
        for (let n = 1; n <= count; n++) {
          let materialId = d.namingPattern.replace('{n}', String(n));

          // Name collision check: if materialId already exists, append suffix
          let suffix = 2;
          while (usedMaterialIds.has(materialId)) {
            materialId = `${d.namingPattern.replace('{n}', String(n))}_${suffix}`;
            suffix++;
          }
          usedMaterialIds.add(materialId);

          // Emit warning diagnostic on collision
          if (suffix > 2) {
            diagnostics.push({
              severity: 'warning',
              code: 'mint_materials_name_collision',
              message: `MaterialId '${materialId}' collides with existing material; disambiguated to '${materialId}'`,
              pass_id,
              details: {
                originalPattern: d.namingPattern,
                n,
                template: d.template,
              },
            });
          }

          let well: string;

          if (d.wellSpread === 'first-row') {
            // First row: A1..L1 (12 wells)
            well = wellAddressForIndex(n - 1);
          } else if (d.wellSpread === 'explicit' && d.wellList && d.wellList.length > 0) {
            // Explicit well list: use wellList verbatim
            well = d.wellList[n - 1] ?? wellAddressForIndex(n - 1);
          } else {
            // Default: 'all' — fills every well left-to-right, top-to-bottom
            well = wellAddressForIndex(n - 1);
          }

          events.push({
            eventId: `evt-mint-${d.template}-${n}`,
            event_type: 'add_material',
            details: {
              labwareInstanceId,
              well,
              material: {
                materialId,
                kind: d.template,
                ...(d.properties ? { properties: d.properties } : {}),
              },
            },
          });
        }
      }

      return { ok: true, output: { events } satisfies MintMaterialsPassOutput, diagnostics };
    },
  };
}

// ---------------------------------------------------------------------------
// expand_patterns pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the expand_patterns pass.
 */
export interface ExpandPatternsOutput {
  events: PlateEventPrimitive[];
}

export interface FallbackSideEvidenceEventsOutput {
  events: PlateEventPrimitive[];
}

/**
 * Dependencies for creating the expand_patterns pass.
 */
export interface CreateExpandPatternsPassDeps {
  stampPatternRegistry: RegistryLoader<StampPatternSpec>;
}

/**
 * Creates the expand_patterns pass that dispatches patternEvents from
 * ai_precompile to registered pattern expanders.
 *
 * This pass:
 * - Reads patternEvents from state.outputs.get('ai_precompile')
 * - For each PatternEvent, looks up the stamp-pattern spec from the registry
 * - Looks up the registered expander by pattern id
 * - Invokes the expander, collecting emitted events
 * - Missing expander → warning diagnostic, no events emitted for that entry
 * - Output: { events: PlateEventPrimitive[] }
 */
export function createExpandPatternsPass(
  deps: CreateExpandPatternsPassDeps,
): Pass {
  return {
    id: 'expand_patterns',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { patternEvents?: PatternEvent[] } | undefined;
      const patternEvents = ai?.patternEvents ?? [];
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();
      const emitted: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const pe of patternEvents) {
        const spec = deps.stampPatternRegistry.get(pe.pattern);
        if (!spec) {
          diagnostics.push({
            severity: 'warning',
            code: 'unknown_pattern',
            message: `Unknown stamp pattern: ${pe.pattern}`,
            pass_id,
          });
          continue;
        }
        const expander = getPatternExpander(pe.pattern);
        if (!expander) {
          diagnostics.push({
            severity: 'warning',
            code: 'missing_expander',
            message: `No expander registered for pattern: ${pe.pattern}`,
            pass_id,
          });
          continue;
        }
        const events = expander.expand(pe, spec, { labState });
        emitted.push(...events);
      }

      return { ok: true, output: { events: emitted }, diagnostics };
    },
  };
}

function safeEvidenceId(value: string, fallback: string): string {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return safe || fallback;
}

function sideEvidenceLabwareHints(ai: Partial<AiPrecompileOutput>): string[] {
  const hints = [
    ...(ai.priorLabwareRefs ?? []).map((ref) => ref.hint || ref.kindHint),
    ...(ai.candidateLabwares ?? []).map((labware) => labware.hint),
    ...(ai.mintMaterials ?? []).map((directive) => directive.placementLabwareHint),
  ].filter((hint): hint is string => typeof hint === 'string' && hint.trim().length > 0);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const hint of hints) {
    const key = hint.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hint);
  }
  return unique.slice(0, 4);
}

function upstreamEventCount(state: PipelineState): number {
  return [
    'mint_materials',
    'expand_patterns',
    'expand_biology_verbs',
    'expand_protocol',
  ].reduce((count, passId) => {
    const output = state.outputs.get(passId) as { events?: PlateEventPrimitive[] } | undefined;
    return count + (output?.events?.length ?? 0);
  }, 0);
}

/**
 * Creates conservative event graph anchors from useful side evidence when the
 * extractor/precompiler found labware/readout context but no candidate events.
 *
 * This is intentionally a fallback: if any normal event-producing pass has
 * emitted events, it returns an empty list. It should make zero-event protocols
 * renderable and reviewable without pretending that the protocol is complete.
 */
export function createFallbackSideEvidenceEventsPass(): Pass {
  return {
    id: 'fallback_side_evidence_events',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = (state.outputs.get('ai_precompile') ?? {}) as Partial<AiPrecompileOutput>;
      if ((ai.candidateEvents?.length ?? 0) > 0 || upstreamEventCount(state) > 0) {
        return { ok: true, output: { events: [] } satisfies FallbackSideEvidenceEventsOutput };
      }

      const events: PlateEventPrimitive[] = [];
      const labwareHints = sideEvidenceLabwareHints(ai);
      const labwareInstanceIds: string[] = [];
      for (const [index, hint] of labwareHints.entries()) {
        const instanceId = `fallback-${safeEvidenceId(hint, `labware-${index + 1}`)}`;
        labwareInstanceIds.push(instanceId);
        events.push({
          eventId: `evt-fallback-container-${index + 1}`,
          event_type: 'create_container',
          details: {
            instanceId,
            labwareType: hint,
            slot: 'auto',
            source: 'ai_precompile_side_evidence',
          },
        });
      }

      for (const [index, job] of (ai.downstreamCompileJobs ?? []).slice(0, 4).entries()) {
        const details: Record<string, unknown> = {
          readout: job.kind,
          description: job.description ?? job.kind,
          source: 'ai_precompile_downstream_compile_job',
          ...(job.params ? { params: job.params } : {}),
        };
        const labwareId = labwareInstanceIds[0];
        if (labwareId) details.labwareInstanceId = labwareId;
        events.push({
          eventId: `evt-fallback-read-${safeEvidenceId(job.kind, `job-${index + 1}`)}-${index + 1}`,
          event_type: 'read',
          details,
          ...(labwareId ? { labwareId } : {}),
        });
      }

      if (events.length === 0 && (ai.directives?.length ?? 0) > 0) {
        events.push({
          eventId: 'evt-fallback-directive-context',
          event_type: 'create_container',
          details: {
            instanceId: 'fallback-protocol-context',
            labwareType: 'protocol-context',
            slot: 'auto',
            source: 'ai_precompile_directive_context',
            directives: ai.directives,
          },
        });
      }

      const diagnostics: PassDiagnostic[] = events.length > 0
        ? [{
            severity: 'warning',
            code: 'fallback_side_evidence_events',
            message: `Emitted ${events.length} conservative fallback event(s) from ai_precompile side evidence because no candidate events were available.`,
            pass_id,
            details: {
              priorLabwareRefs: ai.priorLabwareRefs?.length ?? 0,
              candidateLabwares: ai.candidateLabwares?.length ?? 0,
              mintMaterials: ai.mintMaterials?.length ?? 0,
              downstreamCompileJobs: ai.downstreamCompileJobs?.length ?? 0,
              directives: ai.directives?.length ?? 0,
            },
          }]
        : [];
      return { ok: true, output: { events } satisfies FallbackSideEvidenceEventsOutput, diagnostics };
    },
  };
}

// ---------------------------------------------------------------------------
// resolve_roles pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the resolve_roles pass.
 */
export interface ResolveRolesOutput {
  events: PlateEventPrimitive[];
}

/**
 * Collect all events from upstream passes that may contain role fields.
 * This includes events from mint_materials, expand_patterns, expand_biology_verbs,
 * and expand_protocol passes.
 */
function collectEventsToResolve(state: PipelineState): PlateEventPrimitive[] {
  const mintOutput = state.outputs.get('mint_materials') as
    { events?: PlateEventPrimitive[] } | undefined;
  const lowerProtocolIntentOutput = state.outputs.get('lower_protocol_intent') as
    { events?: PlateEventPrimitive[] } | undefined;
  const protocolIntentPatternsOutput = state.outputs.get('expand_protocol_intent_patterns') as
    { events?: PlateEventPrimitive[] } | undefined;
  const patternsOutput = state.outputs.get('expand_patterns') as
    { events?: PlateEventPrimitive[] } | undefined;
  const verbsOutput = state.outputs.get('expand_biology_verbs') as
    { events?: PlateEventPrimitive[] } | undefined;
  const protocolOutput = state.outputs.get('expand_protocol') as
    { events?: PlateEventPrimitive[] } | undefined;
  const fallbackOutput = state.outputs.get('fallback_side_evidence_events') as
    { events?: PlateEventPrimitive[] } | undefined;

  return [
    ...(mintOutput?.events ?? []),
    ...(lowerProtocolIntentOutput?.events ?? []),
    ...(protocolIntentPatternsOutput?.events ?? []),
    ...(patternsOutput?.events ?? []),
    ...(verbsOutput?.events ?? []),
    ...(protocolOutput?.events ?? []),
    ...(fallbackOutput?.events ?? []),
  ];
}

/**
 * Find the labware type for an event from the labState.
 * Falls back to '96-well-plate' if no labware info is available.
 */
function findLabwareTypeForEvent(
  event: PlateEventPrimitive,
  labState: LabStateSnapshot,
): string {
  const details = event.details as Record<string, unknown> | undefined;
  const labwareInstanceId = details?.labwareInstanceId as string | undefined;
  if (labwareInstanceId && labState.labware[labwareInstanceId]) {
    return labState.labware[labwareInstanceId]!.labwareType;
  }
  // Default to 96-well-plate for role resolution
  return '96-well-plate';
}

/**
 * Find the orientation for an event from the labState.
 * Falls back to 'landscape' if no labware info is available.
 */
function findOrientationForEvent(
  event: PlateEventPrimitive,
  labState: LabStateSnapshot,
): 'landscape' | 'portrait' {
  const details = event.details as Record<string, unknown> | undefined;
  const labwareInstanceId = details?.labwareInstanceId as string | undefined;
  if (labwareInstanceId && labState.labware[labwareInstanceId]) {
    return labState.labware[labwareInstanceId]!.orientation;
  }
  return 'landscape';
}

/**
 * Resolve cell_type_id on a cell_region event against the ontology registry.
 *
 * - If cell_type_id is absent: no-op, returns { cellTypeTerm: undefined, diagnostics: [] }
 * - If cell_type_id resolves to a cell-ontology term: attaches it as cellTypeTerm
 * - If cell_type_id is unknown or wrong source: emits a warning diagnostic
 *
 * This function is called during resolve_roles expansion of cell_region events.
 */
function resolveCellTypeLink(
  cellTypeId: string,
  ontologyTermRegistry: ReturnType<typeof getOntologyTermRegistry>,
  pass_id: string,
): { cellTypeTerm: OntologyTerm | undefined; diagnostics: PassDiagnostic[] } {
  const diagnostics: PassDiagnostic[] = [];
  const term = ontologyTermRegistry.get(cellTypeId);

  if (!term) {
    // Unknown cell_type_id — emit warning, no cellTypeTerm
    diagnostics.push({
      severity: 'warning',
      code: 'unknown_cell_type_id',
      message: `cell_region references unknown Cell Ontology id ${cellTypeId}; no cellTypeTerm attached`,
      pass_id,
      details: { cellTypeId },
    });
    return { cellTypeTerm: undefined, diagnostics };
  }

  if (term.source !== 'cell-ontology') {
    // Wrong-source ontology term — emit warning, no cellTypeTerm
    diagnostics.push({
      severity: 'warning',
      code: 'unknown_cell_type_id',
      message: `cell_region cell_type_id ${cellTypeId} resolved to non-cell-ontology term (source: ${term.source}); no cellTypeTerm attached`,
      pass_id,
      details: { cellTypeId, actualSource: term.source },
    });
    return { cellTypeTerm: undefined, diagnostics };
  }

  // Happy path: valid cell-ontology term
  return { cellTypeTerm: term, diagnostics };
}

/**
 * Creates the resolve_roles pass that maps role-based coordinates
 * to physical well addresses under the current labware orientation.
 *
 * This pass:
 * - Collects events from mint_materials, expand_patterns, expand_biology_verbs, expand_protocol
 * - For each event with a role field in details, resolves the role to concrete wells
 * - Events without a role pass through unchanged
 * - Events with a role are expanded into N concrete events (one per well)
 * - Original role event is removed; new events get regenerated IDs
 * - Uses the current labware orientation from labState
 * - Uses assay-spec panelConstraints if an assay is tagged
 * - Falls back to the default role library for common roles
 * - For cell_region events with cell_type_id, resolves against the Cell Ontology registry
 *   and attaches cellTypeTerm on the expanded events (or emits a warning if unknown)
 */
export function createResolveRolesPass(): Pass {
  return {
    id: 'resolve_roles',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const events = collectEventsToResolve(state);
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();

      // Look up resolved assay refs for panelConstraints
      const resolvedRefs = (
        state.outputs.get('resolve_references') as
          { resolvedRefs?: ResolvedReference[] } | undefined
      )?.resolvedRefs ?? [];
      const assayRefs = resolvedRefs.filter(r => r.kind === 'assay');
      const assaySpec = assayRefs.length > 0
        ? assayRefs[0] as unknown as AssaySpec
        : undefined;

      // Get the ontology term registry for cell_type_id resolution
      const ontologyTermRegistry = getOntologyTermRegistry();

      const out: PlateEventPrimitive[] = [];
      let counter = 0;
      const allDiagnostics: PassDiagnostic[] = [];

      for (const ev of events) {
        const details = ev.details as Record<string, unknown> | undefined;
        const role = details?.role as string | undefined;

        if (!role) {
          // No role — pass through unchanged
          out.push(ev);
          continue;
        }

        // Resolve the role to concrete well addresses
        const labwareType = findLabwareTypeForEvent(ev, labState);
        const orientation = findOrientationForEvent(ev, labState);

        const ctx: RoleResolutionContext = {
          orientation,
          labwareType,
          ...(assaySpec ? { assay: assaySpec } : {}),
          args: details as Record<string, unknown>,
        };

        const wells = defaultRoleResolver(role, ctx);

        if (wells.length === 0) {
          // Unknown role — pass through unchanged with a warning
          out.push(ev);
          continue;
        }

        // For cell_region events, resolve cell_type_id against the ontology registry
        const cellTypeId = details?.cell_type_id as string | undefined;
        let cellTypeTerm: OntologyTerm | undefined = undefined;
        if (role === 'cell_region' && cellTypeId) {
          const { cellTypeTerm: resolvedTerm, diagnostics } = resolveCellTypeLink(
            cellTypeId,
            ontologyTermRegistry,
            pass_id,
          );
          cellTypeTerm = resolvedTerm;
          if (diagnostics.length > 0) {
            allDiagnostics.push(...diagnostics);
          }
        }

        // Expand into one event per well
        for (const well of wells) {
          const expandedEvent: PlateEventPrimitive = {
            ...ev,
            eventId: `${ev.eventId}_r${counter++}`,
            details: {
              ...ev.details,
              well,
              role: undefined,
            } as Record<string, unknown>,
          };

          // Attach cellTypeTerm on expanded events if resolved
          if (cellTypeTerm) {
            (expandedEvent.details as Record<string, unknown>).cellTypeTerm = cellTypeTerm;
          }

          out.push(expandedEvent);
        }
      }

      return {
        ok: true,
        output: { events: out } satisfies ResolveRolesOutput,
        ...(allDiagnostics.length > 0 ? { diagnostics: allDiagnostics } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// compute_volumes pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the compute_volumes pass.
 */
export interface ComputeVolumesPassOutput {
  events: PlateEventPrimitive[];
}

/**
 * Import the volume resolver.
 */
import {
  isVolumePlaceholder,
  resolveVolumePlaceholder,
  type VolumePlaceholder,
} from '../../math/VolumeResolver.js';

/**
 * Creates the compute_volumes pass that resolves placeholder volumes
 * ('just_enough', { percent, of }, 'COMPUTED', etc.) to concrete uL values.
 *
 * This pass:
 * - Reads events from state.outputs.get('resolve_roles')
 * - For each event with a placeholder volumeUl, invokes the resolver
 * - Replaces the placeholder with the concrete value, or surfaces a gap
 * - Pass never throws — unresolvable placeholders produce warning diagnostics
 */
export function createComputeVolumesPass(): Pass {
  return {
    id: 'compute_volumes',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const resolvedRolesOutput = state.outputs.get('resolve_roles') as
        { events?: PlateEventPrimitive[] } | undefined;
      const events = resolvedRolesOutput?.events ?? [];
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();

      const resolved: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const ev of events) {
        const details = ev.details as Record<string, unknown>;
        const rawVolume = details.volumeUl;

        // Skip events that already have a concrete numeric volume
        if (typeof rawVolume === 'number' && !Number.isNaN(rawVolume)) {
          resolved.push(ev);
          continue;
        }

        // Skip events without a volumeUl field at all
        if (rawVolume === undefined) {
          resolved.push(ev);
          continue;
        }

        // Check if this is a volume placeholder
        if (!isVolumePlaceholder(rawVolume)) {
          resolved.push(ev);
          continue;
        }

        // Determine the reagent kind from the event
        const material = details.material as { kind?: string } | undefined;
        const reagentKind = material?.kind ?? 'unknown';

        // Resolve the placeholder
        const result = resolveVolumePlaceholder(
          rawVolume as VolumePlaceholder,
          reagentKind,
          events,
          labState,
        );

        if (result.resolvedUl !== null) {
          // Replace the placeholder with the concrete value
          resolved.push({
            ...ev,
            details: {
              ...details,
              volumeUl: result.resolvedUl,
            },
          });
        } else {
          // Unresolvable — surface as a gap diagnostic, pass through event
          diagnostics.push({
            severity: 'warning',
            code: 'unresolvable_volume',
            message: result.gap ?? `Unresolvable volume for event ${ev.eventId}`,
            pass_id,
            details: {
              eventId: ev.eventId,
              placeholder: String(rawVolume),
              reagentKind,
            },
          });
          resolved.push(ev);
        }
      }

      return {
        ok: true,
        output: { events: resolved } satisfies ComputeVolumesPassOutput,
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// compute_resources pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the compute_resources pass.
 */
export interface ComputeResourcesPassOutput {
  resourceManifest: ResourceManifest;
}

/**
 * Pipetting event types that consume a tip.
 */
/**
 * Pipetting event types that consume a tip.
 * Only liquid-handling operations — excludes spin, pellet, freeze, thaw,
 * label, count, passage which do not use pipette tips.
 */
const PIPETTING_EVENT_TYPES: ReadonlySet<string> = new Set([
  'transfer',
  'add_material',
  'mix',
  'aliquot',
  'wash',
  'elute',
  'resuspend',
  'dilute',
  'stain',
  'fix',
  'permeabilize',
  'block',
  'quench',
  'transfect',
]);

/**
 * Tips per rack (standard 96-tip rack).
 */
const TIPS_PER_RACK = 96;

/**
 * Creates the compute_resources pass that walks the final event list
 * and emits a ResourceManifest with tip-rack counts, reservoir loads,
 * and consumable labware.
 *
 * This pass:
 * - Reads events from state.outputs.get('compute_volumes')
 * - Reads labState from state.input.labState
 * - Reads deckLayoutPlan from state.outputs.get('lab_state') (labStateDelta)
 *   to determine which labware is already "pinned"
 * - For each pipetting event, increments tip counter per pipetteType
 * - For each transfer from a reservoir, aggregates volume by reservoir+well+reagentKind
 * - Consumables: labware instances not in deckLayoutPlan.pinned
 * - Output: { resourceManifest }
 */
export function createComputeResourcesPass(): Pass {
  return {
    id: 'compute_resources',
    family: 'emit' as const,
    run({ state }: PassRunArgs): PassResult {
      const computeVolumesOutput = state.outputs.get('compute_volumes') as
        { events?: PlateEventPrimitive[] } | undefined;
      const events = computeVolumesOutput?.events ?? [];
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();

      // 1. Tip counting: walk pipetting events, count tips per pipetteType
      const tipCounts = new Map<string, number>(); // pipetteType → total tips used

      for (const ev of events) {
        if (!PIPETTING_EVENT_TYPES.has(ev.event_type)) {
          continue;
        }

        const details = ev.details as Record<string, unknown> | undefined;
        const pipetteType = (details?.pipetteType as string)
          ?? (details?.pipette as string)
          ?? 'unknown';

        // Each pipetting operation consumes exactly 1 tip.
        // The pipetteType determines which rack type to use, not the tip count.
        tipCounts.set(pipetteType, (tipCounts.get(pipetteType) ?? 0) + 1);
      }

      // Convert tip counts to rack counts (ceil(total / 96))
      const tipRacks: Array<{ pipetteType: string; rackCount: number }> = [];
      for (const [pipetteType, totalTips] of tipCounts) {
        const rackCount = Math.ceil(totalTips / TIPS_PER_RACK);
        tipRacks.push({ pipetteType, rackCount });
      }

      // 2. Reservoir loads: aggregate volumes from transfer events where source is a reservoir
      const reservoirLoads = new Map<string, { reservoirRef: string; well: string; reagentKind: string; volumeUl: number }>();

      for (const ev of events) {
        if (ev.event_type !== 'transfer') {
          continue;
        }

        const details = ev.details as Record<string, unknown> | undefined;
        const from = details?.from as Record<string, unknown> | undefined;
        const fromLabwareId = from?.labwareInstanceId as string | undefined;

        // Check if source is a reservoir
        if (!fromLabwareId || !(fromLabwareId in labState.reservoirs) || !from) {
          continue;
        }

        const fromWell = from.well as string | undefined;
        const volumeUl = typeof details?.volumeUl === 'number' ? details.volumeUl : 0;
        const material = details?.material as { kind?: string } | undefined;
        const reagentKind = material?.kind ?? 'unknown';

        if (!fromWell || volumeUl <= 0) {
          continue;
        }

        const key = `${fromLabwareId}::${fromWell}::${reagentKind}`;
        const existing = reservoirLoads.get(key);
        if (existing) {
          existing.volumeUl += volumeUl;
        } else {
          reservoirLoads.set(key, {
            reservoirRef: fromLabwareId,
            well: fromWell,
            reagentKind,
            volumeUl,
          });
        }
      }

      const reservoirLoadsArray = Array.from(reservoirLoads.values());

      // 3. Consumables: labware instances not already declared in deckLayoutPlan.pinned
      // Also check the lab_stateDelta output for deckLayoutPlan
      const deckLayoutPlan = (state.outputs.get('lab_state') as
        { deckLayoutPlan?: { pinned: Array<{ slot: string; labwareHint: string }> } } | undefined
      )?.deckLayoutPlan;

      // Collect pinned labware hints
      const pinnedHints = new Set<string>();
      if (deckLayoutPlan?.pinned) {
        for (const pin of deckLayoutPlan.pinned) {
          pinnedHints.add(pin.labwareHint);
        }
      }

      // Also check labStateDelta for deckLayoutPlan
      const labStateDelta = (state.outputs.get('lab_state') as
        { labStateDelta?: { deckLayoutPlan?: { pinned: Array<{ slot: string; labwareHint: string }> } } } | undefined
      )?.labStateDelta;
      if (labStateDelta?.deckLayoutPlan?.pinned) {
        for (const pin of labStateDelta.deckLayoutPlan.pinned) {
          pinnedHints.add(pin.labwareHint);
        }
      }

      // Collect labware types not in pinned hints
      const consumables = new Set<string>();
      for (const instance of Object.values(labState.labware)) {
        // Check if this labware's type is in the pinned hints
        let isPinned = false;
        for (const hint of pinnedHints) {
          if (instance.labwareType.includes(hint) || hint.includes(instance.labwareType)) {
            isPinned = true;
            break;
          }
        }
        if (!isPinned) {
          consumables.add(instance.labwareType);
        }
      }

      const consumablesArray = Array.from(consumables);

      return {
        ok: true,
        output: {
          resourceManifest: {
            tipRacks,
            reservoirLoads: reservoirLoadsArray,
            consumables: consumablesArray,
          },
        } satisfies ComputeResourcesPassOutput,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// derive_execution_scale_plan pass
// ---------------------------------------------------------------------------

export interface DeriveExecutionScalePlanOutput {
  executionScalePlan?: ExecutionScalePlan;
}

const EXECUTION_SCALE_PROMPT_CUES = [
  'scale',
  'scaled',
  'high-throughput',
  'high throughput',
  '96',
  '384',
  'plate',
  'reservoir',
  'multi-channel',
  'multichannel',
  '8-channel',
  '12-channel',
  'robot',
  'deck',
  'opentrons',
  'assist plus',
  'tube',
  'tubes',
] as const;

const WELL_RE = /^[A-P](?:[1-9]|1[0-9]|2[0-4])$/;

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeWell(value: unknown): string | undefined {
  const raw = asString(value)?.toUpperCase();
  return raw && WELL_RE.test(raw) ? raw : undefined;
}

function collectWellsFromValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((item) => collectWellsFromValue(item)));
  }
  const well = normalizeWell(value);
  return well ? [well] : [];
}

function collectDestinationWells(events: PlateEventPrimitive[]): string[] {
  const wells: string[] = [];

  for (const event of events) {
    const details = event.details as Record<string, unknown>;
    wells.push(...collectWellsFromValue(details.well));
    wells.push(...collectWellsFromValue(details.wells));

    const to = details.to as Record<string, unknown> | undefined;
    wells.push(...collectWellsFromValue(to?.well));
    wells.push(...collectWellsFromValue(to?.wells));

    const target = details.target as Record<string, unknown> | undefined;
    wells.push(...collectWellsFromValue(target?.well));
    wells.push(...collectWellsFromValue(target?.wells));
  }

  return uniqueStrings(wells);
}

function parseSampleCount(prompt: string): number | undefined {
  const match = prompt.match(/\b(\d{1,4})\s+(?:samples?|specimens?|isolates?|conditions?|replicates?|tubes?)\b/i);
  if (!match?.[1]) return undefined;
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) && count > 0 ? count : undefined;
}

function generatePlateWells(count: number, labwareKind: Extract<ExecutionScaleLabwareKind, '96_well_plate' | '384_well_plate'>): string[] {
  const rows = labwareKind === '384_well_plate'
    ? 'ABCDEFGHIJKLMNOP'.split('')
    : 'ABCDEFGH'.split('');
  const columns = labwareKind === '384_well_plate' ? 24 : 12;
  const wells: string[] = [];

  for (let col = 1; col <= columns && wells.length < count; col++) {
    for (const row of rows) {
      if (wells.length >= count) break;
      wells.push(`${row}${col}`);
    }
  }

  return wells;
}

function inferTargetLevel(promptLower: string): ExecutionScalePlan['targetLevel'] | undefined {
  if (includesAny(promptLower, ['robot', 'deck', 'opentrons', 'assist plus', 'assist+'])) {
    return 'robot_deck';
  }
  if (includesAny(promptLower, ['scale', 'scaled', 'high-throughput', 'high throughput', '96', '384', 'plate', 'reservoir', 'multi-channel', 'multichannel', '8-channel', '12-channel'])) {
    return 'bench_plate_multichannel';
  }
  if (includesAny(promptLower, ['tube', 'tubes', 'tube rack', 'tuberack'])) {
    return 'manual_tubes';
  }
  return undefined;
}

function inferSourceLevel(promptLower: string): ExecutionScalePlan['sourceLevel'] {
  if (includesAny(promptLower, ['manual', 'hand', 'tube', 'tubes', 'tube rack', 'tuberack'])) {
    return 'manual_tubes';
  }
  if (includesAny(promptLower, ['robot', 'deck', 'opentrons', 'assist plus', 'assist+'])) {
    return 'robot_deck';
  }
  if (includesAny(promptLower, ['96', '384', 'plate', 'reservoir', 'multi-channel', 'multichannel'])) {
    return 'bench_plate_multichannel';
  }
  return 'manual_tubes';
}

function inferPlatform(promptLower: string): ExecutionScalePlatform {
  if (promptLower.includes('assist')) return 'integra_assist';
  if (promptLower.includes('flex')) return 'opentrons_flex';
  if (promptLower.includes('opentrons')) return 'opentrons_ot2';
  return 'manual';
}

function inferSampleLabwareKind(promptLower: string): Extract<ExecutionScaleLabwareKind, 'tube_rack' | '96_well_plate' | '384_well_plate'> {
  if (promptLower.includes('384')) return '384_well_plate';
  if (includesAny(promptLower, ['tube', 'tubes', 'tube rack', 'tuberack']) && !includesAny(promptLower, ['96', '384', 'plate'])) {
    return 'tube_rack';
  }
  return '96_well_plate';
}

function inferReservoirKind(promptLower: string): Extract<ExecutionScaleLabwareKind, 'tube' | '1_well_reservoir' | '2_well_reservoir' | '8_well_reservoir' | '12_well_reservoir'> {
  if (includesAny(promptLower, ['12-well reservoir', '12 well reservoir', '12-channel reservoir'])) return '12_well_reservoir';
  if (includesAny(promptLower, ['8-well reservoir', '8 well reservoir'])) return '8_well_reservoir';
  if (/\b2[- ]well reservoir\b/.test(promptLower)) return '2_well_reservoir';
  if (/\b(?:1|one|single)[- ]well reservoir\b/.test(promptLower) || includesAny(promptLower, ['single reservoir', 'shared reservoir', 'reagent trough'])) return '1_well_reservoir';
  if (includesAny(promptLower, ['reservoir', '96', '384', 'plate', 'multi-channel', 'multichannel'])) return '1_well_reservoir';
  return 'tube';
}

function collectReagentRoles(events: PlateEventPrimitive[], resourceManifest?: ResourceManifest): ExecutionScalePlan['reagentLayout'] {
  const roles: ExecutionScalePlan['reagentLayout'] = [];

  for (const load of resourceManifest?.reservoirLoads ?? []) {
    roles.push({
      materialRole: load.reagentKind,
      sourceLabwareRole: load.reservoirRef,
      sourceLabwareKind: '12_well_reservoir',
      sourceWells: [load.well],
      reason: 'resource manifest computed this reagent load from transfer events',
    });
  }

  for (const event of events) {
    if (event.event_type !== 'add_material' && event.event_type !== 'transfer') continue;
    const details = event.details as Record<string, unknown>;
    const material = details.material as { kind?: string; label?: string } | undefined;
    const materialRole =
      asString(details.materialRole)
      ?? asString(details.recordId)
      ?? asString(material?.kind)
      ?? asString(material?.label)
      ?? (event.event_type === 'transfer' ? 'transfer_reagent' : undefined);
    if (!materialRole) continue;

    const sourceWell =
      normalizeWell(details.source_well)
      ?? normalizeWell((details.from as Record<string, unknown> | undefined)?.well)
      ?? normalizeWell(details.well)
      ?? '1';

    roles.push({
      materialRole,
      sourceLabwareRole: asString(details.source_labware) ?? 'reagent_source',
      sourceLabwareKind: '12_well_reservoir',
      sourceWells: [sourceWell],
      reason: 'inferred from liquid-handling events without creating material instances',
    });
  }

  const seen = new Set<string>();
  return roles.filter((role) => {
    const key = `${role.materialRole}:${role.sourceLabwareRole}:${role.sourceWells.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function maxTransferVolumeUl(events: PlateEventPrimitive[]): number | undefined {
  let max: number | undefined;
  for (const event of events) {
    if (event.event_type !== 'transfer') continue;
    const details = event.details as Record<string, unknown>;
    const numericVolume =
      typeof details.volumeUl === 'number'
        ? details.volumeUl
        : typeof details.volume_uL === 'number'
          ? details.volume_uL
          : undefined;
    const structuredVolume = details.volume as { value?: unknown; unit?: unknown } | undefined;
    const structuredUl = typeof structuredVolume?.value === 'number'
      && String(structuredVolume.unit ?? '').toLowerCase() === 'ul'
      ? structuredVolume.value
      : undefined;
    const candidate = numericVolume ?? structuredUl;
    if (candidate === undefined) continue;
    max = max === undefined ? candidate : Math.max(max, candidate);
  }
  return max;
}

function labwareDefinitionFor(kind: ExecutionScaleLabwareKind): string | undefined {
  if (kind === '96_well_plate') return 'lbw-def-generic-96-well-plate';
  if (kind === '384_well_plate') return 'lbw-def-generic-384-well-plate';
  if (kind === '1_well_reservoir') return 'lbw-def-generic-reservoir-1-v1';
  if (kind === '12_well_reservoir') return 'lbw-def-generic-12-reservoir';
  if (kind === '2_well_reservoir') return 'lbw-def-generic-2-well-reservoir';
  if (kind === '8_well_reservoir') return 'lbw-def-generic-8-reservoir';
  return undefined;
}

function cueScore(promptLower: string, profile: ExecutionScaleProfileRecord): number {
  return profile.matching.prompt_cues.reduce(
    (score, cue) => score + (promptLower.includes(cue.toLowerCase()) ? 1 : 0),
    0,
  );
}

function selectExecutionScaleProfile(
  promptLower: string,
  sourceLevel: ExecutionScalePlan['sourceLevel'],
  targetLevel: ExecutionScalePlan['targetLevel'],
  platform: ExecutionScalePlatform,
): ExecutionScaleProfileRecord | undefined {
  const profiles = getExecutionScaleProfileRegistry().list()
    .filter((profile) => profile.targetLevel === targetLevel)
    .filter((profile) => profile.sourceLevel === sourceLevel || profile.sourceLevel === 'manual_tubes')
    .filter((profile) => !profile.matching.platforms || profile.matching.platforms.includes(platform));

  let best: { profile: ExecutionScaleProfileRecord; score: number } | undefined;
  for (const profile of profiles) {
    const score = cueScore(promptLower, profile);
    if (score === 0 && targetLevel !== profile.targetLevel) continue;
    if (!best || score > best.score || (score === best.score && profile.priority > best.profile.priority)) {
      best = { profile, score };
    }
  }

  return best?.profile ?? profiles.sort((a, b) => b.priority - a.priority)[0];
}

/**
 * Derive a deterministic execution scaling plan from the compiled event graph.
 *
 * This pass creates an execution handoff only when the prompt contains explicit
 * scaling/execution cues. It records missing sample counts, labware definitions,
 * or tool capabilities as blockers instead of inventing run-specific instances.
 */
export function createDeriveExecutionScalePlanPass(): Pass {
  return {
    id: 'derive_execution_scale_plan',
    family: 'emit' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const prompt = typeof state.input.prompt === 'string' ? state.input.prompt : '';
      const promptLower = prompt.toLowerCase();
      const shouldPlan = includesAny(promptLower, EXECUTION_SCALE_PROMPT_CUES);

      if (!shouldPlan) {
        return { ok: true, output: {} satisfies DeriveExecutionScalePlanOutput };
      }

      const events = ((state.outputs.get('compute_volumes') as { events?: PlateEventPrimitive[] } | undefined)?.events)
        ?? ((state.outputs.get('resolve_roles') as { events?: PlateEventPrimitive[] } | undefined)?.events)
        ?? [];
      const resourceManifest = (state.outputs.get('compute_resources') as { resourceManifest?: ResourceManifest } | undefined)?.resourceManifest;

      const sourceLevel = inferSourceLevel(promptLower);
      const targetLevel = inferTargetLevel(promptLower) ?? (
        sourceLevel === 'manual_tubes' ? 'bench_plate_multichannel' : sourceLevel
      );
      const platform = inferPlatform(promptLower);
      const profile = selectExecutionScaleProfile(promptLower, sourceLevel, targetLevel, platform);
      const explicitMultichannel = includesAny(promptLower, ['multi-channel pipette', 'multichannel pipette', '8-channel pipette', '12-channel pipette']);
      const explicitScaleOut = includesAny(promptLower, ['scale', 'scaled', 'high-throughput', 'high throughput']);
      const sampleLabwareKind = targetLevel === 'manual_tubes'
        ? 'tube_rack'
        : (profile?.sampleLayout.labwareKind ?? inferSampleLabwareKind(promptLower));
      const explicitSampleCount = parseSampleCount(prompt);
      const eventWells = collectDestinationWells(events);
      const generatedWells = eventWells.length === 0 && explicitSampleCount && sampleLabwareKind !== 'tube_rack'
        ? generatePlateWells(explicitSampleCount, sampleLabwareKind)
        : [];
      let sampleWells = eventWells.length > 0 ? eventWells : generatedWells;
      let sampleCount = explicitSampleCount
        ?? (sampleWells.length > 0 ? sampleWells.length : undefined)
        ?? (!explicitScaleOut && events.length > 0 ? 1 : undefined);
      const blockers: ExecutionScalePlan['blockers'] = [];
      const assumptions: string[] = [];
      for (const blocker of profile?.defaultBlockers ?? []) {
        blockers.push({
          code: blocker.code,
          message: blocker.message,
          ...(blocker.requiredInput ? { requiredInput: blocker.requiredInput } : {}),
          source: 'platform_data' as const,
        });
      }

      if (!sampleCount) {
        // For robot_deck with a valid profile, apply a default sample layout
        // (first column of the plate) instead of blocking. This covers the common
        // case where the protocol describes liquid-handling steps without specifying
        // how many samples to run.
        if (targetLevel === 'robot_deck' && profile?.deckBinding) {
          const defaultSampleCount = sampleLabwareKind === '384_well_plate' ? 16 : 8;
          sampleCount = defaultSampleCount;
          sampleWells = sampleLabwareKind !== 'tube_rack'
            ? generatePlateWells(defaultSampleCount, sampleLabwareKind)
            : [];
          assumptions.push(
            `No sample count was specified; defaulting to ${defaultSampleCount} samples (first column of ${sampleLabwareKind}).`,
          );
        } else {
          blockers.push({
            code: 'missing_sample_count',
            message: 'Sample count or target wells are required to scale a manual protocol into a plate layout.',
            requiredInput: 'sampleCount',
            source: 'user_input' as const,
          });
        }
      }

      const plateCapacity = sampleLabwareKind === '384_well_plate' ? 384 : sampleLabwareKind === '96_well_plate' ? 96 : undefined;
      if (plateCapacity && sampleCount && sampleCount > plateCapacity) {
        blockers.push({
          code: 'sample_count_exceeds_plate_capacity',
          message: `${sampleCount} samples exceed ${sampleLabwareKind} capacity.`,
          requiredInput: 'larger plate layout or batching strategy',
          source: 'user_input' as const,
        });
      }

      const profileReagentDefinition = profile?.reagentSource.labwareDefinition;
      const reagentLayout = collectReagentRoles(events, resourceManifest).map((role) => ({
        ...role,
        sourceLabwareKind: profile?.reagentSource.sourceLabwareKind ?? inferReservoirKind(promptLower),
        ...(profileReagentDefinition ? { sourceLabwareDefinition: profileReagentDefinition } : {}),
      }));

      if (reagentLayout.length === 0 && includesAny(promptLower, ['reagent', 'buffer', 'media', 'medium', 'dmso', 'solution', 'clofibrate'])) {
        reagentLayout.push({
          materialRole: 'reagent',
          sourceLabwareRole: profile?.reagentSource.sourceLabwareRole ?? 'reagent_source',
          sourceLabwareKind: profile?.reagentSource.sourceLabwareKind ?? inferReservoirKind(promptLower),
          ...(profile?.reagentSource.labwareDefinition ? { sourceLabwareDefinition: profile.reagentSource.labwareDefinition } : {}),
          sourceWells: profile?.reagentSource.defaultSourceWells ?? ['1'],
          reason: 'prompt mentions reagents but compiled events did not identify concrete reagent roles',
        });
        assumptions.push('Reagent source role is provisional until material roles are resolved.');
      }

      const maxVolume = maxTransferVolumeUl(events);
      const requestedChannels = profile?.pipetting.channels ?? (promptLower.includes('12-channel pipette') ? 12 : 8);
      const shouldUseMulti =
        targetLevel !== 'manual_tubes'
        && (explicitMultichannel || (explicitScaleOut && (sampleCount ?? 0) >= 8));
      const channels = shouldUseMulti ? requestedChannels : 1;
      const maxProfileVolume = profile?.pipetting.maxVolumeUl ?? 20;

      if (channels > 1 && maxVolume !== undefined && maxVolume > maxProfileVolume) {
        blockers.push({
          code: 'missing_multichannel_volume_capability',
          message: `No registered multichannel pipette capability covers ${maxVolume} uL transfers for profile ${profile?.id ?? 'default'}; add a compatible multichannel tool or lower the transfer volume.`,
          requiredInput: 'pipette-capability',
          source: 'platform_data' as const,
        });
      }

      if (
        targetLevel === 'robot_deck'
        && (profile?.reagentSource.sourceLabwareKind ?? inferReservoirKind(promptLower)) === '2_well_reservoir'
        && !profile?.reagentSource.labwareDefinition
        && !blockers.some((blocker) => blocker.code === 'missing_2_well_reservoir_definition')
      ) {
        blockers.push({
          code: 'missing_2_well_reservoir_definition',
          message: 'INTEGRA ASSIST PLUS scaling requested a 2-well reservoir, but no 2-well reservoir labware definition is registered.',
          requiredInput: 'labware-definition:2_well_reservoir',
          source: 'platform_data' as const,
        });
      }

      const sampleLabwareDefinition = profile?.sampleLayout.labwareDefinition ?? labwareDefinitionFor(sampleLabwareKind);
      const reagentDefinitions = uniqueStrings(reagentLayout
        .map((role) => {
          if (role.sourceLabwareKind === profile?.reagentSource.sourceLabwareKind) {
            return profile.reagentSource.labwareDefinition;
          }
          return labwareDefinitionFor(role.sourceLabwareKind);
        })
        .filter((value): value is string => Boolean(value)));

      if (!sampleLabwareDefinition && sampleLabwareKind !== 'tube_rack') {
        blockers.push({
          code: 'missing_sample_labware_definition',
          message: `No registered labware definition is mapped for ${sampleLabwareKind}.`,
          requiredInput: `labware-definition:${sampleLabwareKind}`,
          source: 'platform_data' as const,
        });
      }

      if (sampleWells.length > 0 && eventWells.length === 0) {
        assumptions.push('Samples are mapped down plate columns in row order.');
      }
      if (sourceLevel === 'manual_tubes' && targetLevel !== 'manual_tubes') {
        assumptions.push('Manual tube operations preserve biological intent when lifted to plate wells and shared reagent reservoirs.');
      }
      assumptions.push(...(profile?.assumptions ?? []));

      const plan: ExecutionScalePlan = {
        kind: 'execution-scale-plan',
        recordId: `execution-scale-plan/${targetLevel}`,
        ...(profile ? { profileRef: profile.recordId } : {}),
        sourceLevel,
        targetLevel,
        status: blockers.length > 0 ? 'blocked' : 'ready',
        ...(sampleCount || sampleWells.length > 0
          ? {
              sampleLayout: {
                labwareRole: profile?.sampleLayout.labwareRole ?? (targetLevel === 'manual_tubes' ? 'sample_tube_rack' : 'sample_plate'),
                labwareKind: sampleLabwareKind,
                ...(sampleLabwareDefinition ? { labwareDefinition: sampleLabwareDefinition } : {}),
                ...(sampleCount ? { sampleCount } : {}),
                wellGroups: sampleWells.length > 0 ? [{ groupId: 'samples', wells: sampleWells }] : [],
              },
            }
          : {}),
        reagentLayout,
        ...(events.length > 0 || shouldUseMulti
          ? {
              pipettingStrategy: {
                pipetteMode: channels > 1 ? profile?.pipetting.pipetteMode ?? 'multi_channel_parallel' : 'single_channel',
                channels,
                laneStrategy: channels > 1 ? profile?.pipetting.laneStrategy ?? 'parallel_lanes' : 'sequential_lanes',
                channelization: channels > 1 ? profile?.pipetting.channelization ?? 'multi_channel_prefer' : 'single_channel',
                batching: channels > 1 ? profile?.pipetting.batching ?? 'group_by_source' : 'none',
              },
            }
          : {}),
        ...(targetLevel === 'robot_deck'
          ? {
              deckBinding: {
                platform: profile?.deckBinding?.platform ?? platform,
                requiredLabwareDefinitions: uniqueStrings([
                  ...(profile?.deckBinding?.requiredLabwareDefinitions ?? []),
                  ...(sampleLabwareDefinition ? [sampleLabwareDefinition] : []),
                  ...reagentDefinitions,
                ]),
                requiredTools: uniqueStrings([
                  ...(profile?.deckBinding?.requiredTools ?? []),
                  ...(profile?.pipetting.requiredTools ?? []),
                  ...(channels > 1 ? ['pipette-capability/p20-multi-8'] : ['pipette-capability/p1000-single']),
                ]),
              },
            }
          : {}),
        assumptions,
        blockers,
      };

      return {
        ok: true,
        output: { executionScalePlan: plan } satisfies DeriveExecutionScalePlanOutput,
        diagnostics: [{
          severity: plan.status === 'blocked' ? 'warning' : 'info',
          code: plan.status === 'blocked' ? 'execution_scale_plan_blocked' : 'execution_scale_plan_ready',
          message: plan.status === 'blocked'
            ? `Execution scaling plan has ${plan.blockers.length} blocker(s).`
            : `Execution scaling plan is ready for ${plan.targetLevel}.`,
          pass_id,
          details: { sourceLevel: plan.sourceLevel, targetLevel: plan.targetLevel, profileId: profile?.id, blockers: plan.blockers },
        }],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// plan_deck_layout pass
// ---------------------------------------------------------------------------

/**
 * Opentrons-style 4×4 deck slot grid (A1–D4).
 */
const OT_DECK_SLOTS = [
  'A1','A2','A3','A4',
  'B1','B2','B3','B4',
  'C1','C2','C3','C4',
  'D1','D2','D3','D4',
] as const;

/**
 * Output shape for the plan_deck_layout pass.
 */
export interface PlanDeckLayoutOutput {
  pinned: Array<{ slot: string; labwareHint: string }>;
  autoFilled: Array<{ slot: string; labwareHint: string; reason: string }>;
  conflicts: Array<{ slot: string; candidates: string[] }>;
}

/**
 * Creates the plan_deck_layout pass that assembles a full deck layout plan.
 *
 * This pass:
 * - Reads labwareAdditions from resolve_labware (which carries deckSlot hints)
 * - Reads tipRacks from resourceManifest (compute_resources output)
 * - Assembles pinned: one per unique deckSlot hint (first-wins on conflict)
 * - Detects conflicts: two hints for the same slot → record conflict, keep first
 * - Auto-fills remaining labware + tipRacks into first available OT_DECK_SLOTS
 * - Output: { pinned, autoFilled, conflicts }
 */
export function createPlanDeckLayoutPass(): Pass {
  return {
    id: 'plan_deck_layout',
    family: 'emit' as const,
    run({ state }: PassRunArgs): PassResult {
      // 1. Read labware additions from resolve_labware
      const labwareOutput = state.outputs.get('resolve_labware') as
        { labwareAdditions?: AiLabwareAdditionPatch[] } | undefined;
      const labwareAdditions = labwareOutput?.labwareAdditions ?? [];

      // 2. Read tipRacks from resourceManifest (compute_resources output)
      const computeResourcesOutput = state.outputs.get('compute_resources') as
        { resourceManifest?: { tipRacks: Array<{ pipetteType: string; rackCount: number }> } } | undefined;
      const tipRacks = computeResourcesOutput?.resourceManifest?.tipRacks ?? [];

      // 3. Build pinned list from deckSlot hints (first-wins on conflict)
      const pinned: Array<{ slot: string; labwareHint: string }> = [];
      const conflicts: Array<{ slot: string; candidates: string[] }> = [];
      const pinnedSlots = new Set<string>();
      const pinnedLabwareHints = new Set<string>();

      for (const patch of labwareAdditions) {
        const slot = patch.deckSlot;
        if (!slot) continue;
        if (pinnedSlots.has(slot)) {
          // Conflict: another labware already pinned here
          const existing = pinned.find(p => p.slot === slot);
          if (existing) {
            const conflictEntry = conflicts.find(c => c.slot === slot);
            if (conflictEntry) {
              conflictEntry.candidates.push(patch.recordId);
            } else {
              conflicts.push({ slot, candidates: [existing.labwareHint, patch.recordId] });
            }
          }
        } else {
          pinnedSlots.add(slot);
          pinned.push({ slot, labwareHint: patch.recordId });
          pinnedLabwareHints.add(patch.recordId);
        }
      }

      // 4. Collect remaining labware hints (no deckSlot)
      const remainingLabware = labwareAdditions
        .filter(p => !p.deckSlot)
        .map(p => p.recordId);

      // 5. Auto-fill: remaining labware + tipRacks into first available slots
      const autoFilled: Array<{ slot: string; labwareHint: string; reason: string }> = [];
      const usedSlots = new Set(pinnedSlots);

      // Helper: find first available slot
      const nextAvailableSlot = (): string | undefined => {
        for (const slot of OT_DECK_SLOTS) {
          if (!usedSlots.has(slot)) {
            usedSlots.add(slot);
            return slot;
          }
        }
        return undefined;
      };

      // Auto-fill remaining labware
      for (const hint of remainingLabware) {
        const slot = nextAvailableSlot();
        if (slot) {
          autoFilled.push({ slot, labwareHint: hint, reason: 'autoFill' });
        }
      }

      // Auto-fill tipRacks
      for (const tipRack of tipRacks) {
        const slot = nextAvailableSlot();
        if (slot) {
          autoFilled.push({ slot, labwareHint: tipRack.pipetteType, reason: 'tipRack' });
        }
      }

      return {
        ok: true,
        output: { pinned, autoFilled, conflicts } satisfies PlanDeckLayoutOutput,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// validate pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the validate pass.
 */
export interface ValidatePassOutput {
  validationReport: { findings: unknown[] };
}

/**
 * Creates the validate pass that aggregates findings from all
 * registered ValidationChecks into a ValidationReport.
 *
 * This pass:
 * - Reads TerminalArtifacts from the pipeline state (assembled from
 *   upstream pass outputs)
 * - Reads priorLabState from state.input.labState
 * - Invokes every registered ValidationCheck
 * - Aggregates all findings into a ValidationReport
 * - Returns { validationReport: { findings } }
 */
export function createValidatePass(): Pass {
  return {
    id: 'validate',
    family: 'validate' as const,
    run({ state }: PassRunArgs): PassResult {
      // Read events from resolve_roles output (the definitive event list)
      const resolvedRolesOutput = state.outputs.get('resolve_roles') as
        { events?: PlateEventPrimitive[] } | undefined;
      const events = resolvedRolesOutput?.events ?? [];
      const artifacts = {
        events,
        directives: [],
        gaps: [],
      };
      const priorLabState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();

      const findings: unknown[] = [];
      for (const check of getValidationChecks()) {
        findings.push(...check.run({ artifacts, priorLabState }));
      }

      return {
        ok: true,
        output: { validationReport: { findings } } satisfies ValidatePassOutput,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// emit_instrument_run_files pass
// ---------------------------------------------------------------------------

import {
  getInstrumentEmitter,
  type InstrumentRunFile,
} from '../../artifacts/InstrumentRunFile.js';
import {
  createGeminiEmActiveReadJob,
  evaluateInstrumentExecutionReadiness,
  isGeminiEmInstrument,
  type InstrumentExecutionReadiness,
  type InstrumentApplianceJob,
} from '../../artifacts/InstrumentApplianceJob.js';

/**
 * Output shape for the emit_instrument_run_files pass.
 */
export interface EmitInstrumentRunFilesOutput {
  instrumentRunFiles: InstrumentRunFile[];
}

/**
 * Creates the emit_instrument_run_files pass that generates
 * InstrumentRunFile artifacts for each read-event instrument group.
 *
 * This pass:
 * - Reads all events from resolve_roles output
 * - Groups read events by details.instrument
 * - For each instrument with a registered emitter, invokes it
 * - Unregistered instruments emit a warning diagnostic + skipped run file
 * - Output: { instrumentRunFiles: InstrumentRunFile[] }
 */
export function createEmitInstrumentRunFilesPass(): Pass {
  return {
    id: 'emit_instrument_run_files',
    family: 'emit' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      // Collect all events from upstream passes
      const resolvedRolesOutput = state.outputs.get('resolve_roles') as
        { events?: PlateEventPrimitive[] } | undefined;
      const allEvents = resolvedRolesOutput?.events ?? [];

      // Read resolved refs for emitter context
      const resolveRefsOutput = state.outputs.get('resolve_references') as
        { resolvedRefs?: ResolvedReference[] } | undefined;
      const resolvedRefs = resolveRefsOutput?.resolvedRefs ?? [];

      // Group read events by instrument
      const instrumentGroups = new Map<string, PlateEventPrimitive[]>();
      for (const event of allEvents) {
        if (event.event_type === 'read') {
          const instrument = (event.details as { instrument?: string }).instrument;
          if (instrument) {
            const group = instrumentGroups.get(instrument) ?? [];
            group.push(event);
            instrumentGroups.set(instrument, group);
          }
        }
      }

      const instrumentRunFiles: InstrumentRunFile[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const [instrument, events] of instrumentGroups) {
        const emitter = getInstrumentEmitter(instrument);
        if (!emitter) {
          // Unregistered instrument: emit warning + skipped run file
          diagnostics.push({
            severity: 'warning',
            code: 'unregistered_instrument',
            message: `No emitter registered for instrument '${instrument}'; skipping run-file generation.`,
            pass_id,
            details: { instrument },
          });
          instrumentRunFiles.push({
            instrument,
            wells: [],
          });
          continue;
        }
        try {
          const runFile = emitter(events, resolvedRefs);
          instrumentRunFiles.push(runFile);
        } catch (err) {
          diagnostics.push({
            severity: 'error',
            code: 'emitter_failure',
            message: `Emitter for instrument '${instrument}' threw: ${err instanceof Error ? err.message : String(err)}`,
            pass_id,
            details: { instrument },
          });
        }
      }

      return {
        ok: true,
        output: { instrumentRunFiles } satisfies EmitInstrumentRunFilesOutput,
        diagnostics,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// emit_instrument_appliance_jobs pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the emit_instrument_appliance_jobs pass.
 */
export interface EmitInstrumentApplianceJobsOutput {
  instrumentApplianceJobs: InstrumentApplianceJob[];
}

/**
 * Creates the emit_instrument_appliance_jobs pass that lowers instrument
 * run-file artifacts into active-control request jobs.
 *
 * This pass:
 * - Reads InstrumentRunFile artifacts from emit_instrument_run_files
 * - Emits MeasurementActiveControlService-compatible jobs for supported appliances
 * - Preserves the source run-file so plate/well selection stays explicit
 * - Output: { instrumentApplianceJobs: InstrumentApplianceJob[] }
 */
export function createEmitInstrumentApplianceJobsPass(): Pass {
  return {
    id: 'emit_instrument_appliance_jobs',
    family: 'emit' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const runFilesOutput = state.outputs.get('emit_instrument_run_files') as
        { instrumentRunFiles?: InstrumentRunFile[] } | undefined;
      const runFiles = runFilesOutput?.instrumentRunFiles ?? [];
      const diagnostics: PassDiagnostic[] = [];
      const instrumentApplianceJobs: InstrumentApplianceJob[] = [];

      runFiles.forEach((runFile) => {
        if (!isGeminiEmInstrument(runFile.instrument)) return;
        if (runFile.wells.length === 0) {
          diagnostics.push({
            severity: 'warning',
            code: 'empty_gemini_em_run_file',
            message: `Gemini EM run-file '${runFile.instrument}' has no wells; appliance job will be emitted but is likely not executable.`,
            pass_id,
            details: { instrument: runFile.instrument },
          });
        }
        instrumentApplianceJobs.push(createGeminiEmActiveReadJob(runFile, instrumentApplianceJobs.length));
      });

      return {
        ok: true,
        output: { instrumentApplianceJobs } satisfies EmitInstrumentApplianceJobsOutput,
        diagnostics,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// evaluate_instrument_execution_readiness pass
// ---------------------------------------------------------------------------

export interface EvaluateInstrumentExecutionReadinessOutput {
  instrumentApplianceJobs: InstrumentApplianceJob[];
  instrumentExecutionReadiness: InstrumentExecutionReadiness[];
}

/**
 * Creates the evaluate_instrument_execution_readiness pass that gates
 * appliance jobs before runtime execution can be requested.
 */
export function createEvaluateInstrumentExecutionReadinessPass(): Pass {
  return {
    id: 'evaluate_instrument_execution_readiness',
    family: 'validate' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const jobsOutput = state.outputs.get('emit_instrument_appliance_jobs') as
        { instrumentApplianceJobs?: InstrumentApplianceJob[] } | undefined;
      const jobs = jobsOutput?.instrumentApplianceJobs ?? [];
      const instrumentExecutionReadiness = jobs.map(evaluateInstrumentExecutionReadiness);
      const instrumentApplianceJobs = jobs.map((job, index) => ({
        ...job,
        executionReadiness: instrumentExecutionReadiness[index]!,
      }));
      const diagnostics: PassDiagnostic[] = instrumentExecutionReadiness
        .filter((readiness) => readiness.status === 'blocked')
        .map((readiness) => ({
          severity: 'warning',
          code: 'instrument_execution_blocked',
          message: `Instrument appliance job '${readiness.jobId}' is blocked from execution.`,
          pass_id,
          details: {
            jobId: readiness.jobId,
            blockers: readiness.blockers,
          },
        }));

      return {
        ok: true,
        output: {
          instrumentApplianceJobs,
          instrumentExecutionReadiness,
        } satisfies EvaluateInstrumentExecutionReadinessOutput,
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// emit_downstream_queue pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the emit_downstream_queue pass.
 */
export interface EmitDownstreamQueueOutput {
  downstreamQueue: DownstreamCompileJob[];
}

/**
 * Creates the emit_downstream_queue pass that reads
 * ai_precompile.downstreamCompileJobs and passes them through
 * to its output as downstreamQueue.
 *
 * This pass:
 * - Reads downstreamCompileJobs from state.outputs.get('ai_precompile')
 * - Passes them through verbatim as downstreamQueue
 * - Returns { downstreamQueue: DownstreamCompileJob[] }
 */
export function createEmitDownstreamQueuePass(): Pass {
  return {
    id: 'emit_downstream_queue',
    family: 'emit' as const,
    run({ state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { downstreamCompileJobs?: DownstreamCompileJob[] } | undefined;
      const queue = ai?.downstreamCompileJobs ?? [];
      return { ok: true, output: { downstreamQueue: queue } satisfies EmitDownstreamQueueOutput };
    },
  };
}
export interface LowerPlateMapPassOutput {
  eventsAdded: number;
}

export function createLowerPlateMapPass(): Pass {
  return {
    id: 'lower_plate_map',
    family: 'expand' as const,
    run: async (args: PassRunArgs): Promise<PassResult> => {
      const { state } = args;
      const candidates = (state as any).candidates || [];
      const plateMapCandidates = candidates.filter((c: any) => 
        c.kind === 'plate-map' || c.kind === 'well-content-table'
      );

      const newEvents: any[] = [];
      for (const candidate of plateMapCandidates) {
        const rows = candidate.data?.rows || candidate.data?.wells || candidate.data?.contents || [];
        for (const row of rows) {
          const well = row.well || row.Well || row['Well'];
          const compound = row.compound || row.Compound || row.contents || row['Item Number'] || row.material;
          if (well && compound) {
            newEvents.push({
              id: `plate_map_dispense_${String(well)}_${String(compound).replace(/\s+/g, '_')}`,
              type: 'dispense',
              source: { labware: 'reagent_source', well: 'A1' },
              destination: { labware: 'target_plate', well: String(well) },
              volumeUl: row.volumeUl || row.volume || 100,
              material: String(compound),
              metadata: { sourceCandidate: candidate.id, originalRow: row }
            });
          }
        }
      }

      return {
        ok: true,
        output: { eventsAdded: newEvents.length },
      };
    }
  };
}
