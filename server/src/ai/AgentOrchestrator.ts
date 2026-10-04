/**
 * Core agent orchestrator — runs a multi-turn tool-calling loop
 * against an LLM inference endpoint, returning validated event
 * graph fragments for preview.
 */

import type { InferenceConfig, AgentConfig, OntologyConfig } from '../config/types.js';
import type {
  InferenceClient,
  ToolBridge,
  AgentOrchestrator,
  AgentRequest,
  AgentResult,
  CompletionRequest,
  AgentClarificationOption,
  AgentLabwareAddition,
  ChatMessage,
  ConversationHistoryMessage,
  EditorContext,
  ResolveMentionDeps,
  AgentSummary,
  TurnStats,
  PlateEventProposal,
} from './types.js';
import type { AiSurface } from './systemPrompt.js';
import { buildSystemPrompt, buildSurfaceAwarePrompt, buildVolatileContextMessage, deriveContextCacheKey } from './systemPrompt.js';
import { resolveMentionsForPrompt, buildResolvedContextMessage, type ResolvedMention } from './resolveMentions.js';
import { runChatbotCompile } from './runChatbotCompile.js';
import {
  COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF,
  COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME,
  SUBMIT_SUGGESTION_INSTRUCTION,
  parseSubmitSuggestionArgs,
  AGENT_INTENT_TOOL_NAME,
  AGENT_INTENT_TOOL_DEF,
  parseAgentIntentArgs,
  parseAlsoPlace,
  parseRecordCreations,
} from './submitSuggestionTool.js';
import { createMaterialLabeler, enrichAddMaterialRefs } from './materialRefLabels.js';
import { forceMaterialClarifications } from './forceMaterialClarifications.js';
import { reconcileDraftQuantities } from './reconcileDraftQuantities.js';
import { bindMaterialAnswersToEvents, refFromAnswer } from './materialBinding.js';
import { DRAFT_ARG_KEYS, draftArgDiagnostics, emptyDraftMessage } from './draftArgDiagnostics.js';
import { clarificationLoopMessage, detectClarificationLoop } from './clarificationLoop.js';
import { followUpForLayer } from './materialFollowUp.js';
import { repairMintedLabelsAgainstUserWords } from './mintLabelFidelity.js';
import { recoverInventedMaterialFields } from './recoverInventedMaterialFields.js';
import { enrichMaterialDomains } from './enrichMaterialDomains.js';
import { filterForbiddenAmountQuestions } from './filterModelClarifications.js';
import { draftTermManifest } from './draftTermManifest.js';
import { coerceToAgentIntentArgs } from './coerceAgentIntent.js';
import { validateProtocolEditPayload, formatProtocolEditErrors } from './protocolEditValidation.js';
import { selectSubmitCall } from './selectSubmitCall.js';
import type { SubmitCallLike } from './selectSubmitCall.js';
import { resolveDraftMaterials } from './resolveDraftMaterials.js';
import { expandWellPattern, wellPatternFromDetails } from './wellPatterns.js';
import { materialLayerOfRef } from './materialRefFields.js';
import { expandEventWells } from './wellRange.js';
import {
  clarificationRequestFromLegacy,
  clarificationRequestsFromGaps,
  clarificationRequestsFromAssurance,
  legacyClarificationFromRequests,
  parseClarificationRequests,
} from './clarifications.js';
import type { PassProgressEvent } from '../compiler/pipeline/PipelineRunner.js';
import { getDefaultLabStateCache } from '../compiler/state/LabStateCache.js';
import { decodeAttachmentText } from '../extract/decodeAttachment.js';

/**
 * Friendly labels for compile-pipeline pass ids, used to surface
 * per-pass progress in the chat UI during the silent compile window.
 */
const PASS_LABELS: Record<string, string> = {
  extract_entities: 'extracting entities from prompt and attachments…',
  tag_prompt: 'tagging prompt clauses…',
  ai_precompile: 'checking deterministic plan…',
  expand_biology_verbs: 'expanding biology verbs…',
  resolve_labware: 'resolving labware references…',
  apply_directives: 'applying directives…',
  expand_patterns: 'expanding stamp patterns…',
  expand_protocol: 'expanding protocol…',
  resolve_roles: 'resolving role-to-well coordinates…',
  mint_materials: 'minting new materials…',
  compute_volumes: 'computing volumes…',
  compute_resources: 'computing tip and reservoir requirements…',
  derive_execution_scale_plan: 'deriving execution scale plan…',
  plan_deck_layout: 'planning deck layout…',
  validate: 'validating…',
};

function compilerPassStatus(passId: string, phase: 'preflight' | 'tool'): string {
  const label = PASS_LABELS[passId] ?? `running ${passId}…`;
  return phase === 'preflight'
    ? `Compiler preflight: ${label}`
    : `Compiler tool: ${label}`;
}

/**
 * Parse the agent's final text response into an AgentResult.
 *
 * Extracts JSON from markdown code fences (```json...```) or raw JSON.
 * If no valid JSON is found, treats the content as a clarification request.
 */
function parseAgentFinalResponse(
  content: string | null,
  usage: { promptTokens: number; completionTokens: number },
  turns: number,
  toolCalls: number,
): AgentResult {
  const usageResult = {
    ...usage,
    totalTokens: usage.promptTokens + usage.completionTokens,
    turns,
    toolCalls,
  };

  if (!content) {
    return { success: false, error: 'Empty response from agent', usage: usageResult };
  }

  // Try to extract JSON from markdown code fences first, then raw JSON
  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)\s*```/) ||
    content.match(/```\s*([\s\S]*?)\s*```/) ||
    content.match(/(\{[\s\S]*\})/);

  if (!jsonMatch || !jsonMatch[1]) {
    // No structured output — treat as clarification request
    return {
      success: false,
      clarificationNeeded: content,
      usage: usageResult,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
    const result: AgentResult = {
      success: true,
      usage: usageResult,
      events: Array.isArray(parsed.events) ? stampDraftProvenance(parsed.events) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      unresolvedRefs: Array.isArray(parsed.unresolvedRefs) ? parsed.unresolvedRefs : [],
    };

    // Structured clarification (from the proactive-resolution prompt)
    if (parsed.clarification && typeof parsed.clarification === 'object' && parsed.clarification !== null) {
      const c = parsed.clarification as Record<string, unknown>;
      const optionsRaw = Array.isArray(c.options) ? c.options : [];
      const options = optionsRaw
        .map((o): AgentClarificationOption | null => {
          if (!o || typeof o !== 'object') return null;
          const oo = o as Record<string, unknown>;
          if (typeof oo.id !== 'string' || typeof oo.label !== 'string') return null;
          const out: AgentClarificationOption = { id: oo.id, label: oo.label };
          if (typeof oo.snippet === 'string') out.snippet = oo.snippet;
          return out;
        })
        .filter((o): o is AgentClarificationOption => o !== null);
      if (typeof c.prompt === 'string' && typeof c.entityType === 'string' && options.length > 0) {
        result.clarification = { prompt: c.prompt, entityType: c.entityType, options };
      }
    }

    const clarificationRequests = [
      ...parseClarificationRequests(parsed.clarificationRequests),
      ...(result.clarification ? [clarificationRequestFromLegacy(result.clarification)] : []),
    ];
    if (clarificationRequests.length > 0) {
      result.clarificationRequests = clarificationRequests;
      if (!result.clarification) {
        const legacyClarification = legacyClarificationFromRequests(clarificationRequests);
        if (legacyClarification) result.clarification = legacyClarification;
      }
    }

    // Labware additions (from the labware-additions prompt)
    if (Array.isArray(parsed.labwareAdditions)) {
      const additions: AgentLabwareAddition[] = [];
      for (const raw of parsed.labwareAdditions) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.recordId !== 'string' || r.recordId.length === 0) continue;
        const entry: AgentLabwareAddition = { recordId: r.recordId };
        if (typeof r.reason === 'string') entry.reason = r.reason;
        additions.push(entry);
      }
      if (additions.length > 0) {
        result.labwareAdditions = additions;
      }
    }

    return result;
  } catch {
    return {
      success: false,
      error: 'Failed to parse agent output as JSON',
      clarificationNeeded: content,
      usage: usageResult,
    };
  }
}

function normalizeHistoryMessage(message: ConversationHistoryMessage): ChatMessage | null {
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if ((message.role !== 'user' && message.role !== 'assistant') || content.length === 0) {
    return null;
  }
  return {
    role: message.role,
    content,
  };
}


function appendClarificationAnswersToPrompt(
  prompt: string,
  answers: AgentRequest['clarificationAnswers'],
): string {
  if (!Array.isArray(answers) || answers.length === 0) return prompt;
  const lines = answers.flatMap((answer, index) => {
    const label = answer.label ?? answer.optionId ?? answer.value ?? answer.requestId;
    const detail = answer.mentionToken ?? answer.value ?? (answer.ref ? JSON.stringify(answer.ref) : '');
    return [
      `- answer ${index + 1} for ${answer.requestId}: ${label}`,
      ...(detail ? [`  resolved: ${detail}`] : []),
    ];
  });
  return prompt + '\n\n[Answered clarifications]\n' + lines.join('\n');
}

/**
 * A clarification answer the user picked is already resolved (the client grounds
 * ontology picks to a local record before sending). Trust its ref and inject it
 * straight into the resolved-context block instead of re-fetching via the store
 * — a just-minted material may not be `store.get`-able yet, and re-resolving it
 * is what caused the clarification to loop. The model then sees the material as
 * grounded and stops re-asking.
 */
/**
 * The agent's output budget. Falls back to a documented legacy value when the
 * profile does not declare one, and says so once — the failure mode of a small
 * budget is invisible (the model is cut off mid-thought and emits an empty tool
 * call), so the absence must not be silent.
 */
const warnedMissingMaxTokens = new Set<string>();
function resolveAgentMaxTokens(configured: number | undefined, model: string): number {
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) return configured;
  if (!warnedMissingMaxTokens.has(model)) {
    warnedMissingMaxTokens.add(model);
    console.warn(
      `[agent] no ai.inference.maxTokens for model ${model}; using 4096. ` +
        'A reasoning model needs far more — it will be cut off mid-draft (see config.example.yaml).',
    );
  }
  return 4096;
}

function resolvedMentionsFromAnswers(
  answers: AgentRequest['clarificationAnswers'],
): ResolvedMention[] {
  if (!Array.isArray(answers)) return [];
  const out: ResolvedMention[] = [];
  for (const answer of answers) {
    // An answer may carry only its mention token (e.g. one typed back in prose).
    // Reading just `answer.ref` dropped those, so the pick never became a
    // resolved mention and the material looked ungrounded all over again.
    const resolvedRef = refFromAnswer(answer);
    if (!resolvedRef) continue;
    const ref = resolvedRef.ref;
    const id = typeof ref.id === 'string' ? ref.id : undefined;
    if (!id) continue;
    const refType = typeof ref.type === 'string' ? ref.type : undefined;
    const kind: ResolvedMention['kind'] =
      refType === 'labware' || ref.kind === 'labware'
        ? 'labware'
        : refType === 'equipment' || ref.kind === 'equipment'
          ? 'equipment'
          : refType === 'material-spec'
            ? 'material-spec'
            : refType === 'material-instance'
              ? 'material-instance'
              : refType === 'vendor-product'
                ? 'vendor-product'
                : refType === 'aliquot'
                  ? 'aliquot'
                  : 'material';
    out.push({
      raw: answer.mentionToken ?? `[[${kind}:${id}]]`,
      kind,
      id,
      label: answer.label ?? id,
      resolved: ref,
    });
  }
  return out;
}

/**
 * Overwrite provenance stamps on model-drafted events. The system prompt is
 * deterministic (no timestamps/ids — see buildSystemPrompt) so models copy
 * placeholder values; the server is the authority for when a draft was made.
 */
/**
 * Rewrite loose labware references in drafted event details against the
 * editor's actual labware list. Models routinely echo a labware's type
 * ("plate_96") or display name instead of its id; when the reference
 * uniquely matches a real labware, repair it rather than shipping an event
 * the canvas can't bind.
 */
function normalizeDraftLabwareRefs<T>(events: T[], context: EditorContext): T[] {
  const labwares = Array.isArray(context?.labwares) ? context.labwares : [];
  if (labwares.length === 0) return events;
  const knownIds = new Set(labwares.map((lw) => lw.labwareId));
  const resolve = (ref: string): string | null => {
    if (knownIds.has(ref)) return ref;
    const needle = ref.toLowerCase();
    const matches = labwares.filter(
      (lw) =>
        lw.labwareType?.toLowerCase() === needle ||
        lw.name?.toLowerCase() === needle ||
        lw.labwareId.toLowerCase() === needle,
    );
    return matches.length === 1 ? matches[0]!.labwareId : null;
  };
  return events.map((ev) => {
    if (!ev || typeof ev !== 'object') return ev;
    const e = ev as Record<string, unknown>;
    const details = e.details;
    if (!details || typeof details !== 'object') return ev;
    const d = details as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = { ...d };
    for (const key of ['labwareId', 'sourceLabwareId', 'targetLabwareId'] as const) {
      const value = d[key];
      if (typeof value === 'string' && value && !knownIds.has(value)) {
        const repaired = resolve(value);
        if (repaired) {
          next[key] = repaired;
          changed = true;
        }
      }
    }
    return changed ? ({ ...e, details: next } as T) : ev;
  });
}

/** A local-record id shape (MAT-/MSP-/ALQ-/VND-/LBW-, optionally `local:`). */
const LOCAL_RECORD_ID = /^(?:local:)?(?:MAT|MSP|ALQ|VND|LBW)-/i;

/**
 * Repair a drafted `material_ref` against the authoritative resolved mentions.
 * The model frequently mangles a grounded pick — e.g. it stuffs a local-record
 * id (`MAT-…`) into an `ontology`-kind ref and copies the id into the label
 * (observed: `{kind:'ontology', id:'MAT-clofibrate-wzj2', label:'MAT-clofibrate-wzj2'}`).
 * When the ref's id matches a resolved mention (a clarification answer or an
 * explicit `[[…]]` the user picked) we rewrite it to a clean record ref with the
 * resolved label; an ontology ref carrying a local-record id is fixed even
 * without a match. Only `material_ref` on `add_material` is touched — a correct
 * `material_spec_ref`/record ref is left alone.
 */
export function normalizeDraftMaterialRefs<T>(events: T[], resolved: readonly ResolvedMention[]): T[] {
  if (!Array.isArray(events) || events.length === 0) return events;
  const byId = new Map<string, ResolvedMention>();
  const byLabel = new Map<string, ResolvedMention>();
  for (const m of resolved) {
    if (m.id) byId.set(m.id, m);
    const label = typeof m.label === 'string' ? m.label.trim().toLowerCase() : '';
    if (label && !byLabel.has(label)) byLabel.set(label, m);
  }

  /**
   * Every name a draft ref might be carrying. A MINTED ref has no id at all —
   * its label (or the `mint:<label>` id suffix, or a nested `mint.label`) is the
   * identity the user answers about. Reading only `id` is what stranded the
   * user's pick and looped the clarification.
   */
  const labelCandidates = (ref: Record<string, unknown>): string[] => {
    const out: string[] = [];
    const push = (v: unknown) => {
      if (typeof v !== 'string') return;
      const value = v.trim();
      if (value) out.push(value.toLowerCase());
    };
    push(ref.label);
    push(ref.name);
    const id = typeof ref.id === 'string' ? ref.id.trim() : '';
    if (id.startsWith('mint:')) push(id.slice('mint:'.length));
    const mint = ref.mint;
    if (mint && typeof mint === 'object' && !Array.isArray(mint)) push((mint as Record<string, unknown>).label);
    if (mint && typeof mint === 'object' && !Array.isArray(mint)) push((mint as Record<string, unknown>).name);
    return out;
  };

  const clean = (match: ResolvedMention, fallbackLabel: string): Record<string, unknown> => ({
    kind: 'record',
    id: match.id,
    // Prefer the resolved record's own type: a mention's kind is a coarse bucket,
    // and losing `material-spec` here re-opens the very gate that asked for the
    // concentration of a formulation.
    type: (typeof match.resolved?.type === 'string' && match.resolved.type) || match.kind,
    label: match.label || fallbackLabel || match.id,
  });

  const repair = (ref: Record<string, unknown>): Record<string, unknown> | null => {
    const id = typeof ref.id === 'string' ? ref.id.trim() : '';
    if (id) {
      const match = byId.get(id);
      if (match) return clean(match, typeof ref.label === 'string' ? ref.label.trim() : '');
      if (ref.kind === 'ontology' && LOCAL_RECORD_ID.test(id)) {
        const label = typeof ref.label === 'string' ? ref.label.trim() : '';
        return { kind: 'record', id, type: 'material', label: label && label !== id ? label : id };
      }
      return null;
    }
    // No id (a minted/draft ref): bind by the name it carries, if the user's
    // resolution names the same thing. Never invents an id.
    for (const candidate of labelCandidates(ref)) {
      const match = byLabel.get(candidate);
      if (match) return clean(match, candidate);
    }
    return null;
  };

  return events.map((ev) => {
    if (!ev || typeof ev !== 'object') return ev;
    const e = ev as Record<string, unknown>;
    if ((e.event_type ?? e.verb) !== 'add_material') return ev;
    const details = e.details;
    if (!details || typeof details !== 'object') return ev;
    const d = details as Record<string, unknown>;
    const mr = d.material_ref;
    if (!mr || typeof mr !== 'object' || Array.isArray(mr)) return ev;
    const repaired = repair(mr as Record<string, unknown>);
    return repaired ? ({ ...e, details: { ...d, material_ref: repaired } } as T) : ev;
  });
}

/**
 * Turn a named well pattern into literal wells, exactly like a range string.
 * The `wells_pattern` key is consumed (removed), so every consumer downstream —
 * deck rendering, per-well materialization, the gate — sees wells and only wells.
 */
function expandWellPatternEvent<T>(event: T): T {
  if (!event || typeof event !== 'object') return event;
  const e = event as Record<string, unknown>;
  const details = e['details'];
  if (!details || typeof details !== 'object' || Array.isArray(details)) return event;
  const d = details as Record<string, unknown>;
  const pattern = wellPatternFromDetails(d);
  if (!pattern) return event;
  const expanded = expandWellPattern(pattern);
  const nextDetails: Record<string, unknown> = { ...d };
  delete nextDetails['wells_pattern'];
  if (expanded.length > 0) {
    // A pattern and explicit wells must agree if both are present; the explicit
    // list wins (the model was more specific), otherwise the pattern fills in.
    const explicit = Array.isArray(d['wells'])
      ? (d['wells'] as unknown[]).filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      : [];
    if (explicit.length === 0) nextDetails['wells'] = expanded;
  }
  return { ...e, details: nextDetails } as T;
}

function stampDraftProvenance<T>(events: T[]): T[] {
  const timestamp = new Date().toISOString();
  const actionGroupId = `ag-${Date.now().toString(36)}`;
  return events.map((ev) => {
    if (!ev || typeof ev !== 'object') return ev;
    const e = ev as Record<string, unknown>;
    const prov =
      e.provenance && typeof e.provenance === 'object'
        ? (e.provenance as Record<string, unknown>)
        : {};
    return {
      ...e,
      provenance: { actor: 'ai-agent', method: 'automated', ...prov, timestamp, actionGroupId },
    } as T;
  });
}

/** Exported for the guard test that pins the equipment bullet (Phase 4.3). */
export const FORCED_DRAFT_TOOL_INSTRUCTION = [
  'EVENT-EDITOR DRAFT MODE:',
  `- You MUST finish this turn by calling the ${AGENT_INTENT_TOOL_NAME} tool exactly once, choosing ONE intent from its menu.`,
  '- To draft events onto the deck (add-material, transfers, labware), choose intent "event_graph" and fill the event/labware fields.',
  '- To change the deck layout (e.g. switch the deck to the freeform bench), choose intent "deck_layout" and set variantId (e.g. "manual_freeform"); LEAVE the event fields empty. The deck switch is applied and persists — you do not need to draft events for a layout change.',
  '- Do not answer in prose. Do not leave the assistant message empty.',
  '- An instrument is NEVER an event: to put one on the bench emit equipmentRequirements[{recordId:"EQP-…"}] (or classCurie "equipment:<kind>"). Never write place_tube / move_tube / transfer with an instrument id — an instrument has no wells, and the labwareId of a tube or transfer event must name LABWARE. When the user named an instrument (a <resolved_context> equipment id), place THAT record — do not substitute a stand-in that happens to be on the bench.',
  '- A tool call with no fields proposes NOTHING: prose is not an action. When the user answers your question (even with "1)" or "yes, do that"), your turn must carry the field that acts — events, equipmentAdditions, equipmentRequirements, labwareRequirements — not just the intent.',
  '- The `resolve` tool is NOT available this turn. Do not output any ontology CURIE you were not given in <resolved_context> — recalling an id from memory is a hallucination. For ANY material you cannot reference as a known record or a <resolved_context> CURIE, GROUND IT IN THE EVENT as {mint:{label:<the user\'s exact words>,domain}} (e.g. {mint:{label:"fenofibrate",domain:"chemical"}}). Never leave a material only in a note, never guess a CURIE.',
  '- DRAFT the events. Do NOT author your own material clarificationRequests, and do NOT invent clarification options (CURIEs, formulation ids, or mint-pseudo-ids) — you have no resolve tool, so any options you list are fabricated. The SYSTEM automatically asks the user to confirm each minted/ungrounded material via a live search; your job is only to draft + mint.',
  '- ALWAYS return the events for an add-materials request (with {mint} for unknowns). NEVER return "events": [] for such a request, and never ask the user to confirm a volume or concentration they already stated.',
  '- Every well-targeted event\'s details MUST include labwareId (an existing labware id from the editor context) and wells (e.g. ["A1"]). An event without them cannot be rendered or executed.',
  '- If the requested operation is simple labware/deck setup, include labwareRequirements with classCurie and deckSlot. Use labwareAdditions only for concrete known definitions.',
  '- THREE intents, ONE call. `event_graph` drafts events onto the deck; `deck_layout` switches the deck; `create_record` AUTHORs records the lab does not have yet (equipment, material or labware) via `records:[{kind,name,…}]`. Adding something the lab lacks is `create_record`; putting something it already has on the bench is equipmentRequirements / labwareRequirements inside `event_graph` — never create a second copy of a record the lab owns. `create_record` writes NOTHING by itself: the user reviews the proposal and Accept creates the record (an existing match is reused with a warning). Set `source` on every creation ("user-description" | "exa:<url>" | "record:<id>"), and never downgrade a named product into a generic kind — ask with an /e clarification or ground it instead. Include `alsoPlace` (e.g. {"surface":"lawn"}) ONLY when the user also wants it on the bench: creating and placing are two decisions and placing is never implied.',
  '- For BENCH EQUIPMENT (water bath, heat block, heater-shaker, orbital shaker, rocker, vortex, qPCR machine, plate reader) use equipmentRequirements — NOT labwareRequirements, and NEVER a deck slot: equipment sits on the bench. "Add the water baths to the deck" is an equipment placement, not a refusal. Records-first: if the lab already owns it, emit its EQP- recordId (warn the user instead of creating a duplicate); otherwise emit classCurie as `equipment:<kind>` (e.g. equipment:water_bath, equipment:heater_shaker) and put the values it is set to in settings, keyed by the class settingsDefinition (e.g. {"temperature_c":55}). Never invent a CL: equipment class CURIE, and never claim what a piece of equipment accepts — acceptance is data, not your judgement.',
  '- Do not ask which vendor/catalog/plate subtype for generic labware such as a 96-well plate; emit a generic labwareRequirement and let the user refine it later.',
  '- For operations, use canonical operation names when possible: dispense, transfer, mix, shake, incubate, centrifuge, wash, read, seed, harvest, etc. The system normalizes verbs automatically.',
].join('\n');

type ChatbotCompileResult = Awaited<ReturnType<typeof runChatbotCompile>>;

function summarizeEvent(e: PlateEventProposal): string {
  const verb = e.verb ?? e.event_type ?? 'operation';
  const details = e.details as Record<string, unknown>;
  const wells = Array.isArray(details?.wells) ? (details.wells as string[]).join(', ') : '';
  const material = typeof details?.material === 'string' ? details.material : '';
  const volume = details?.volume ? ` ${details.volume}` : '';
  return `${verb}${material ? ` ${material}` : ''}${volume}${wells ? ` → ${wells}` : ''}`;
}

function compileResultToAgentResult(
  compileResult: ChatbotCompileResult,
  usage: { promptTokens: number; completionTokens: number },
  turns: number,
  toolCalls: number,
): AgentResult {
  const events = compileResult.events.map((prim) => ({
    eventId: prim.eventId,
    event_type: prim.event_type,
    verb: prim.event_type,
    vocabPackId: 'general',
    details: prim.details,
    ...(prim.labwareId ? { labwareId: prim.labwareId } : {}),
    ...(prim.t_offset ? { t_offset: prim.t_offset } : {}),
    provenance: {
      actor: 'ai-agent',
      timestamp: new Date().toISOString(),
      method: 'compiler',
      actionGroupId: 'compiler-draft',
    },
  })) as unknown as PlateEventProposal[];

  const unresolvedRefs = [...(compileResult.unresolvedRefs ?? [])];
  let clarification: string | undefined = compileResult.clarification;
  for (const gap of compileResult.terminalArtifacts.gaps) {
    if (gap.kind === 'unresolved_ref') {
      const rawReason = (gap.details as Record<string, unknown> | undefined)?.reason;
      unresolvedRefs.push({
        kind: 'other',
        label: gap.message,
        reason: typeof rawReason === 'string' ? rawReason : 'unresolved',
      });
    } else if (gap.kind === 'clarification') {
      clarification = gap.message;
    } else {
      unresolvedRefs.push({ kind: 'other', label: gap.message, reason: `other: ${gap.message}` });
    }
  }

  const clarificationRequests = clarificationRequestsFromGaps(compileResult.terminalArtifacts.gaps);
  if (clarification && !clarificationRequests.some((request) => request.prompt === clarification)) {
    clarificationRequests.push(clarificationRequestFromLegacy({ prompt: clarification, entityType: 'general', options: [] }, clarificationRequests.length));
  }

  const legacyClarification = legacyClarificationFromRequests(clarificationRequests);

  // Build interpretation from compiled events
  const interpretation = {
    operations: events.map((e) => ({
      type: e.event_type ?? e.verb ?? 'unknown',
      ...(e.details && typeof e.details === 'object' && 'wells' in e.details
        ? { target: Array.isArray((e.details as Record<string, unknown>).wells)
            ? ((e.details as Record<string, unknown>).wells as string[]).join(', ')
            : String((e.details as Record<string, unknown>).wells) }
        : {}),
      ...(e.details && typeof e.details === 'object' && 'material' in e.details
        ? { material: String((e.details as Record<string, unknown>).material) }
        : {}),
      resolved: true,
    })),
  };

  // Build changes list from compiled events
  const changes = events.map((e) => ({
    op: 'add' as const,
    description: summarizeEvent(e),
    ...(e.eventId ? { eventId: e.eventId } : {}),
  }));

  return {
    success: true,
    events,
    ...(compileResult.labwareAdditions.length > 0 ? { labwareAdditions: compileResult.labwareAdditions } : {}),
    ...(unresolvedRefs.length > 0 ? { unresolvedRefs: unresolvedRefs as unknown as NonNullable<AgentResult['unresolvedRefs']> } : {}),
    ...(clarificationRequests.length > 0 ? { clarificationRequests } : {}),
    ...(legacyClarification ? { clarification: legacyClarification } : {}),
    ...(compileResult.terminalArtifacts.downstreamQueue?.length ? { downstreamQueue: compileResult.terminalArtifacts.downstreamQueue } : {}),
    ...(compileResult.terminalArtifacts.executionScalePlan ? { executionScalePlan: compileResult.terminalArtifacts.executionScalePlan } : {}),
    ...(compileResult.terminalArtifacts.instrumentApplianceJobs?.length ? { instrumentApplianceJobs: compileResult.terminalArtifacts.instrumentApplianceJobs } : {}),
    ...(compileResult.ontologyBindings?.length ? { ontologyBindings: compileResult.ontologyBindings } : {}),
    interpretation,
    ...(changes.length > 0 ? { changes } : {}),
    usage: {
      ...usage,
      totalTokens: usage.promptTokens + usage.completionTokens,
      turns,
      toolCalls,
    },
  };
}


function eventDetails(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return {};
  const details = (event as Record<string, unknown>).details;
  return details && typeof details === 'object' && !Array.isArray(details)
    ? details as Record<string, unknown>
    : {};
}

function hasGroundedMaterials(event: unknown): boolean {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
  const materials = (event as Record<string, unknown>).materials;
  return Array.isArray(materials) && materials.some((material) => {
    if (!material || typeof material !== 'object' || Array.isArray(material)) return false;
    const ref = (material as Record<string, unknown>).ref;
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return false;
    const record = ref as Record<string, unknown>;
    return typeof record.curie === 'string' && record.curie.trim().length > 0
      || (record.mint !== undefined && typeof record.mint === 'object' && !Array.isArray(record.mint));
  });
}

function hasMaterialSemantics(events: unknown[] | undefined): boolean {
  return (events ?? []).some((event) => {
    const details = eventDetails(event);
    return hasGroundedMaterials(event)
      || details.material_ref !== undefined
      || details.composition_snapshot !== undefined
      || details.material_source_requirement !== undefined
      || details.material_spec_ref !== undefined
      || details.aliquot_ref !== undefined
      || details.material_instance_ref !== undefined
      || details.vendor_product_ref !== undefined;
  });
}

function compilerDroppedMaterialSemantics(parsed: AgentResult, compiled: AgentResult): boolean {
  const parsedEvents = parsed.events as unknown[] | undefined;
  const compiledEvents = compiled.events as unknown[] | undefined;
  return hasMaterialSemantics(parsedEvents) && !hasMaterialSemantics(compiledEvents);
}

function buildCompilerPromptFromDraftArgs(args: Record<string, unknown>): string {
  const events = Array.isArray(args.events) ? args.events : [];
  const lines: string[] = [];

  for (const item of events) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const event = item as Record<string, unknown>;
    const verb = typeof event.verb === 'string'
      ? event.verb
      : typeof event.event_type === 'string'
        ? event.event_type
        : 'do';
    const details = event.details && typeof event.details === 'object' && !Array.isArray(event.details)
      ? event.details as Record<string, unknown>
      : {};
    const parts = [verb.replace(/_/g, ' ')];

    const volume = details.volume_uL ?? details.volumeUl ?? details.volume;
    if (volume !== undefined) {
      parts.push(String(volume));
      if (typeof volume === 'number') parts.push('uL');
    }

    const materials = Array.isArray(event.materials) ? event.materials : [];
    for (const material of materials) {
      if (!material || typeof material !== 'object' || Array.isArray(material)) continue;
      const ref = (material as Record<string, unknown>).ref;
      if (!ref || typeof ref !== 'object' || Array.isArray(ref)) continue;
      const r = ref as Record<string, unknown>;
      if (typeof r.curie === 'string' && r.curie) parts.push(`[[material:${r.curie}|${r.curie}]]`);
      const mint = r.mint;
      if (mint && typeof mint === 'object' && !Array.isArray(mint)) {
        const label = (mint as Record<string, unknown>).label;
        if (typeof label === 'string' && label) parts.push(label);
      }
    }

    const well = details.well ?? details.wells ?? details.target_wells;
    if (Array.isArray(well)) parts.push('to wells', well.join(', '));
    else if (typeof well === 'string') parts.push('to well', well);

    const labware = details.labware_id ?? details.labwareId ?? event.labwareId;
    if (typeof labware === 'string' && labware) parts.push('in', labware);

    lines.push(parts.filter(Boolean).join(' '));
  }

  if (lines.length > 0) return lines.join('; ');
  return JSON.stringify(args);
}


function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const attempts = [candidate];
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(candidate.slice(firstBrace, lastBrace + 1));
  }
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      // Try the next extraction strategy.
    }
  }
  return null;
}

/** Top-level keys that mark a bare forced-draft argument object. */
// DRAFT_ARG_KEYS lives in draftArgDiagnostics.ts — one source, so the guard
// below and the unknown-field diagnostic can never disagree.

/**
 * Recover forced-draft tool arguments from a response that arrived as plain
 * content instead of a native tool call — the common case when the appliance's
 * tool-call parser is off, so the model emits `<tool_call>{…}</tool_call>` or a
 * fenced JSON block into `content`. Returns the bare argument object (unwrapping
 * a `{name, arguments}` envelope, where `arguments` may itself be a JSON string)
 * or null when the content carries no usable draft JSON — in which case the
 * caller re-asks the model. Parsing this inline skips a second inference call.
 */
export function coerceDraftArgsFromContent(content: unknown): Record<string, unknown> | null {
  if (typeof content !== 'string') return null;
  const obj = extractJsonObject(content);
  if (!obj) return null;
  if ('arguments' in obj) {
    const args = obj.arguments;
    if (args && typeof args === 'object' && !Array.isArray(args)) return args as Record<string, unknown>;
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        /* not a JSON-encoded arguments string — fall through */
      }
    }
  }
  // Bare argument object: require a known draft key so unrelated prose-JSON
  // (an example, a code block) is never fed to the compiler.
  if (DRAFT_ARG_KEYS.some((k) => k in obj)) return obj;
  return null;
}

function buildForcedDraftJsonPrompt(originalPrompt: string): string {
  return [
    `You did not emit the required ${AGENT_INTENT_TOOL_NAME} tool call.`,
    'Return ONLY the JSON arguments for that tool (with the "intent" discriminator). No markdown, no explanation.',
    'For event drafting, use intent "event_graph" and allowed top-level keys: events, labwareRequirements, labwareAdditions, clarification, unresolvedRefs, notes.',
    'For a deck layout change, use intent "deck_layout" with variantId (e.g. "manual_freeform") and leave the event fields empty.',
    'For labware/deck setup, prefer labwareRequirements like {"classCurie":"CL:96_well_plate","deckSlot":"B2","reason":"96-well plate requested","specificity":"generic"}. Do not invent LBW-* recordIds.',
    'Do not ask which vendor/catalog/plate subtype for a generic request like a 96-well plate. Emit the generic requirement.',
    'For material nouns, use materials[].ref as {"curie":"..."} or {"mint":{"label":"...","domain":"..."}}.',
    `Original user prompt: ${originalPrompt}`,
  ].join('\n');
}


function waitMs(ms: number): Promise<'heartbeat'> {
  return new Promise((resolve) => setTimeout(() => resolve('heartbeat'), ms));
}

async function nextWithHeartbeat<T>(
  iterator: AsyncIterator<T>,
  intervalMs: number,
  onHeartbeat: () => void,
): Promise<IteratorResult<T>> {
  const next = iterator.next().then(
    (result) => ({ kind: 'result' as const, result }),
    (error) => ({ kind: 'error' as const, error }),
  );
  while (true) {
    const winner = await Promise.race([
      next,
      waitMs(intervalMs).then(() => ({ kind: 'heartbeat' as const })),
    ]);
    if (winner.kind === 'heartbeat') {
      onHeartbeat();
      continue;
    }
    if (winner.kind === 'error') throw winner.error;
    return winner.result;
  }
}

async function awaitWithHeartbeat<T>(
  promise: Promise<T>,
  intervalMs: number,
  onHeartbeat: () => void,
): Promise<T> {
  const settled = promise.then(
    (value) => ({ kind: 'result' as const, value }),
    (error) => ({ kind: 'error' as const, error }),
  );
  while (true) {
    const winner = await Promise.race([
      settled,
      waitMs(intervalMs).then(() => ({ kind: 'heartbeat' as const })),
    ]);
    if (winner.kind === 'heartbeat') {
      onHeartbeat();
      continue;
    }
    if (winner.kind === 'error') throw winner.error;
    return winner.value;
  }
}

/**
 * Human-readable label for the configured inference endpoint, used in the
 * status feed so the user sees where their request actually went. Derived
 * from the live `baseUrl` (not a hardcoded host) so it tracks settings;
 * loopback endpoints read as "the on-box model".
 */
function inferenceEndpointLabel(config: InferenceConfig): string {
  let host = '';
  try {
    host = new URL(config.baseUrl).hostname;
  } catch {
    // baseUrl isn't a parseable URL — fall back to the model name below.
  }
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return 'the on-box model';
  }
  return host;
}

/** Count drafted events in a (possibly partial) tool-call argument string. */
function countDraftedEvents(partialArgs: string): number {
  const matches = partialArgs.match(/"event_type"\s*:/g);
  return matches ? matches.length : 0;
}

/**
 * Create an agent orchestrator.
 */
export interface AgentOrchestratorDeps extends ResolveMentionDeps {
  extractionService?: import('../extract/ExtractionRunnerService.js').ExtractionRunnerService;
  llmClient?: import('../compiler/pipeline/passes/ChatbotCompilePasses.js').LlmClient;
  /**
   * Spine-backed (on-box OAK) ontology resolver forwarded to the precompile
   * noun-resolution tier, so the agent grounds terms the same way the UI and
   * compiler do. Optional — omitted ⇒ frozen ontology-term YAML registry.
   */
  ontologyResolver?: (q: string) => Promise<Array<{ id: string; label: string; source: string }>>;
  /**
   * Record store. Forwarded to runChatbotCompile so ontology-CURIE material
   * mentions are auto-bound to local material records (find-or-mint) before
   * the precompile runs. Optional — omitted ⇒ mentions pass through unchanged.
   */
  store?: import('../store/types.js').RecordStore;
  /**
   * Material profile registry. Its declarative `clarification` policy decides
   * what a pick at a layer still owes (a formulation owes a volume; an aliquot
   * nothing), so the follow-up question is derived from data instead of a
   * hardcoded branch. Optional — without it no follow-up is derived.
   */
  materialProfiles?: import('../materials/MaterialProfileRegistry.js').MaterialProfileRegistry;
  /**
   * The lab's identity spine (ResolveSpine). When present, a material the model
   * named in the biologist's OWN WORDS is resolved here instead of being left as a
   * mint for the gate to interrogate: tier 0/1 (canonical terms, workspace records)
   * binds silently, and anything unresolved stays a proposed local term with its
   * remote candidates offered to the review dialogue's term panel.
   */
  resolveSpine?: import('./resolveDraftMaterials.js').SpineLike;
  /** RESOLVE threshold forwarded to runChatbotCompile (undefined ⇒ 0.9). */
  assuranceThreshold?: number;
  /**
   * Ontology config — gives draft-time material labeling access to the
   * on-box OAK terms endpoint, so grounded CURIEs render as names in well
   * state instead of raw "CHEBI:…" ids. Optional — without it labeling
   * falls back to local records + remote OLS4.
   */
  ontology?: OntologyConfig;
  /**
   * Resident context (#1/#2) — a small, stable world-map + pinned-vocab block
   * (buildResidentContext) injected into the agent's system message on
   * tool-bearing turns. Computed once at construction.
   */
  residentContext?: string;
}

export function createAgentOrchestrator(
  inferenceClient: InferenceClient,
  toolBridge: ToolBridge,
  inferenceConfig: InferenceConfig,
  agentConfig: AgentConfig,
  deps: AgentOrchestratorDeps = {},
): AgentOrchestrator {
  const {
    maxTurns = 15,
    maxToolCallsPerTurn = 5,
    historyTurns = 4,
    draftFlowMode = 'forced-tool',
    systemPromptPath,
  } = agentConfig;

  /**
   * Whether the agent phase forces the terminal draft tool when the request
   * doesn't say. Both 'forced-tool' and 'preflight-deterministic' force it;
   * only the legacy 'preflight-llm' mode runs the open-ended agent loop.
   * Shared by run() and buildPrefixRequest so warm and real renders agree.
   */
  const defaultForceDraftTool = draftFlowMode !== 'preflight-llm';

  const traceId = () => Math.random().toString(36).slice(2, 8);

  /**
   * Tool definitions offered to the LLM for a non-doc turn. Shared by run()
   * and buildPrefixRequest: the chat template renders tool schemas into the
   * prompt, so warm and real requests must carry IDENTICAL tools or their
   * token prefixes diverge at the very start of the system region (measured:
   * 3 common tokens when the warm omitted tools).
   */
  function buildToolDefs(forceDraftTool?: boolean, toolFilter?: readonly string[]) {
    if (forceDraftTool) {
      // Draft mode offers the model a SINGLE forced emission tool whose own
      // schema is the constrained menu (event_graph | deck_layout), keeping
      // every turn a structured emission while widening beyond the lone draft.
      return [AGENT_INTENT_TOOL_DEF];
    }
    const allToolDefs = toolBridge.getToolDefinitions();
    const baseToolDefs = toolFilter
      ? allToolDefs.filter((d) => toolFilter.includes(d.function.name))
      : allToolDefs;
    return [...baseToolDefs, COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF];
  }

  /**
   * Render the stable, cacheable request prefix for a (surface, context)
   * pair: the single system message, the last-n raw history turns, and the
   * tool definitions (template-rendered, hence prefix-relevant). This is the
   * ONE render path shared by run() and the background prompt warmer — if the
   * two ever drifted, warmed prefixes would never match real requests and the
   * KV cache would miss silently.
   */
  function buildPrefixRequest(args: {
    context: EditorContext;
    surface?: AiSurface;
    history?: ConversationHistoryMessage[];
    forceDraftTool?: boolean;
    toolFilter?: readonly string[];
  }): Pick<CompletionRequest, 'messages' | 'tools' | 'tool_choice'> {
    const forceDraftTool = args.forceDraftTool ?? defaultForceDraftTool;
    const systemPrompt = args.surface
      ? buildSurfaceAwarePrompt(args.surface, args.context)
      : buildSystemPrompt(args.context, systemPromptPath);
    const systemSections: string[] = [systemPrompt];
    if (deps.residentContext) systemSections.push(deps.residentContext);
    systemSections.push(SUBMIT_SUGGESTION_INSTRUCTION);
    if (forceDraftTool) systemSections.push(FORCED_DRAFT_TOOL_INSTRUCTION);

    const historyMessages = Array.isArray(args.history)
      ? args.history.map(normalizeHistoryMessage).filter((m): m is ChatMessage => m !== null)
      : [];

    const tools = buildToolDefs(forceDraftTool, args.toolFilter);
    return {
      messages: [
        { role: 'system', content: systemSections.join('\n\n---\n\n') },
        ...historyMessages.slice(-historyTurns),
      ],
      tools,
      tool_choice: forceDraftTool
        ? { type: 'function', function: { name: AGENT_INTENT_TOOL_NAME } }
        : 'auto',
    };
  }

  // Helper to emit the structured summary log line
  function logAgentSummary(_tid: string, summary: AgentSummary): void {
    console.log(`[agent-summary] ${JSON.stringify(summary)}`);
  }

  return {
    buildPrefixRequest,

    async run(request: AgentRequest): Promise<AgentResult> {
      const { prompt, context, history, surface, toolFilter, onEvent, attachments, enableThinking, deterministicOnly, clarificationAnswers } = request;
      const effectivePrompt = appendClarificationAnswersToPrompt(prompt, clarificationAnswers);
      // Draft-flow gating: an explicit request value always wins (the
      // event-editor dock sends forceDraftTool: true; Precompile mode sends
      // deterministicOnly). Otherwise agentConfig.draftFlowMode decides.
      const forceDraftTool = request.forceDraftTool ?? (!deterministicOnly && defaultForceDraftTool);
      const runPreflight = deterministicOnly
        ? true
        : request.forceDraftTool === true
          ? false
          : draftFlowMode !== 'forced-tool';
      // 'preflight-deterministic' keeps the millisecond-fast compiler path
      // but skips its LLM-backed passes (ai_precompile, tag_prompt) — those
      // were the hidden seconds-long LLM calls inside "deterministic"
      // preflight.
      const preflightDeterministicOnly =
        Boolean(deterministicOnly) || draftFlowMode === 'preflight-deterministic';
      const tid = traceId();
      const t0 = Date.now();
      const surfaceName = surface ?? 'default';
      const model = inferenceConfig.model;
      console.log(`[agent ${tid}] start surface=${surfaceName} model=${model} promptLen=${prompt.length} effectivePromptLen=${effectivePrompt.length} historyLen=${Array.isArray(history) ? history.length : 0} attachments=${attachments?.length ?? 0} deterministicOnly=${Boolean(deterministicOnly)} clarificationAnswers=${clarificationAnswers?.length ?? 0}`);

      // Instrumentation tracking
      const turnStats: TurnStats[] = [];
      let totalToolCalls = 0;
      /**
       * Was a turn cut off at the output budget? A truncated turn is NOT a
       * finished thought: the model is mid-sentence and the tool call it managed
       * to emit carries no usable arguments (observed 2026-09-20: 1839 chars of
       * reasoning, agent_intent with NO fields, and the run reported success with
       * zero events — the biologist got no proposal and no explanation).
       * Run-scoped because the flag is read when the final result is assembled.
       */
      let truncatedToolCall = false;
      let resolvedMentionsCount = 0;

      // 1. Build the message array
      const systemPrompt = surface
        ? buildSurfaceAwarePrompt(surface, context)
        : buildSystemPrompt(context, systemPromptPath);
      const historyMessages = Array.isArray(history)
        ? history.map(normalizeHistoryMessage).filter((message): message is ChatMessage => message !== null)
        : [];

      // Resolve mentions and build resolved context message. Answered
      // clarifications are authoritative (already grounded client-side), so they
      // go in first and shadow any same-id prompt mention that failed to fetch —
      // otherwise an un-fetchable just-minted record loops the clarification.
      const answerMentions = resolvedMentionsFromAnswers(clarificationAnswers);
      const answerIds = new Set(answerMentions.map((m) => m.id));
      const promptMentions = await resolveMentionsForPrompt(effectivePrompt, deps);
      const resolvedMentions = [
        ...answerMentions,
        ...promptMentions.filter((m) => !answerIds.has(m.id)),
      ];
      resolvedMentionsCount = resolvedMentions.length;
      const resolvedContextMessage = buildResolvedContextMessage(resolvedMentions);
      
      // New: route through chatbot-compile pipeline
      const ctxMentions = Array.isArray(context?.mentions) ? context.mentions : undefined;
      const ctxLabwares = Array.isArray(context?.labwares) ? context.labwares : undefined;
      const skipCompilerPreflight = !runPreflight;
      if (skipCompilerPreflight) {
        onEvent?.({ type: 'status', message: `Skipping compiler preflight; asking AI to call ${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME} directly…` });
        console.log(`[agent ${tid}] skipping compiler preflight for forced draft tool mode`);
      }
      if (!skipCompilerPreflight) {
      const preflightStart = Date.now();
      let preflightLastStatus = 'starting compiler preflight';
      const compileResult = await awaitWithHeartbeat(
        runChatbotCompile({
          prompt: effectivePrompt,
          ...(attachments ? { attachments } : {}),
          ...(ctxMentions ? { mentions: ctxMentions } : {}),
          ...(ctxLabwares ? { editorLabwares: ctxLabwares } : {}),
          ...(context.activeDeckScope ? { activeDeckScope: context.activeDeckScope } : {}),
          deps: {
            extractionService: deps.extractionService!,
            llmClient: deps.llmClient ?? null,
            searchLabwareByHint: deps.searchLabwareByHint!,
            labStateCache: getDefaultLabStateCache(),
            ...(deps.ontologyResolver ? { ontologyResolver: deps.ontologyResolver } : {}),
            ...(deps.store ? { store: deps.store } : {}),
            ...(deps.assuranceThreshold !== undefined ? { assuranceThreshold: deps.assuranceThreshold } : {}),
          },
          ...(preflightDeterministicOnly ? { deterministicOnly: true } : {}),
          ...(inferenceConfig.model ? { model: inferenceConfig.model } : {}),
          onPassEvent: (event: PassProgressEvent) => {
            if (event.type !== 'pass_started') return;
            const message = compilerPassStatus(event.pass_id, 'preflight');
            preflightLastStatus = message.replace(/^Compiler preflight: /, '');
            try {
              onEvent?.({ type: 'status', message });
            } catch {
              /* swallow — streaming must not abort the pipeline */
            }
          },
        }),
        3000,
        () => {
          const elapsedSec = Math.round((Date.now() - preflightStart) / 1000);
          onEvent?.({
            type: 'status',
            message: `Compiler preflight still running… ${elapsedSec}s elapsed (${preflightLastStatus}).`,
          });
        },
      );
      // Outcome-based forwarding: decide whether to short-circuit the LLM
      // fallback based on compileResult.outcome and terminalArtifacts, not
      // on compileResult.events.length alone.
      const hasArtifacts =
        compileResult.terminalArtifacts.events.length > 0 ||
        compileResult.terminalArtifacts.gaps.length > 0;

      const shouldShortCircuit =
        deterministicOnly || (
          hasArtifacts && (
            compileResult.outcome === 'complete' ||
            compileResult.outcome === 'gap'
          )
        );

      if (shouldShortCircuit) {
        // Pipeline produced concrete events or gaps — return them without
        // invoking the LLM loop.
        const elapsed = Date.now() - t0;

        // Convert PlateEventPrimitive[] to PlateEventProposal[]
        const events = compileResult.events.map((prim) => ({
          eventId: prim.eventId,
          event_type: prim.event_type,
          verb: prim.event_type, // Use event_type as verb for primitives
          vocabPackId: 'general',
          details: prim.details,
          ...(prim.labwareId ? { labwareId: prim.labwareId } : {}),
          ...(prim.t_offset ? { t_offset: prim.t_offset } : {}),
          provenance: {
            actor: 'ai-agent',
            timestamp: new Date().toISOString(),
            method: 'pipeline',
            actionGroupId: 'chatbot-compile',
          },
        })) as unknown as PlateEventProposal[];

        // Wire terminalArtifacts.gaps into the response fields the UI consumes.
        const unresolvedRefs = [...(compileResult.unresolvedRefs ?? [])];
        let clarification: string | undefined = compileResult.clarification;
        for (const gap of compileResult.terminalArtifacts.gaps) {
          if (gap.kind === 'unresolved_ref') {
            const rawReason = (gap.details as Record<string, unknown> | undefined)?.reason;
            unresolvedRefs.push({
              kind: 'other',
              label: gap.message,
              reason: typeof rawReason === 'string' ? rawReason : 'unresolved',
            });
          } else if (gap.kind === 'clarification') {
            clarification = gap.message; // last one wins
          } else {
            // 'other' — wrap into unresolvedRefs with a synthetic kind tag
            unresolvedRefs.push({
              kind: 'other',
              label: gap.message,
              reason: `other: ${gap.message}`,
            });
          }
        }

        const summary: AgentSummary = {
          traceId: tid,
          surface: surfaceName,
          model,
          success: true,
          elapsedMs: elapsed,
          turns: [],
          totals: {
            turns: 0,
            toolCalls: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          resolvedMentions: resolvedMentionsCount,
          bypass: 'compiler',
        };
        logAgentSummary(tid, summary);
        console.log(`[agent ${tid}] chatbot-compile pipeline bypass: success, events=${events.length}, gaps=${compileResult.terminalArtifacts.gaps.length}`);

        // ---- Assurance routing (Phase 3) ---------------------------------
        // When the resolve-assurance decision is CONFIRM, hold the whole draft
        // (events = []) and surface structured clarification requests derived
        // from the blockers, so the user confirms BEFORE anything is previewed.
        const assurance = compileResult.terminalArtifacts.assurance;
        const shouldConfirm = assurance?.decision === 'CONFIRM';
        const clarificationRequests = shouldConfirm
          ? clarificationRequestsFromAssurance(
              assurance?.blockers ?? [],
              clarificationRequestsFromGaps(compileResult.terminalArtifacts.gaps).length,
            )
          : clarificationRequestsFromGaps(compileResult.terminalArtifacts.gaps);
        if (clarification && !clarificationRequests.some((request) => request.prompt === clarification)) {
          clarificationRequests.push(clarificationRequestFromLegacy({ prompt: clarification, entityType: 'general', options: [] }, clarificationRequests.length));
        }

        const legacyClarification = legacyClarificationFromRequests(clarificationRequests);

        const result: AgentResult = {
          success: true,
          // Hold events on CONFIRM — never auto-return a draft needing confirmation.
          ...(shouldConfirm ? {} : { events }),
          ...(compileResult.labwareAdditions.length > 0 ? { labwareAdditions: compileResult.labwareAdditions } : {}),
          ...(unresolvedRefs.length > 0 ? { unresolvedRefs: unresolvedRefs as unknown as NonNullable<AgentResult['unresolvedRefs']> } : {}),
          ...(clarificationRequests.length > 0 ? { clarificationRequests } : {}),
          ...(legacyClarification ? { clarification: legacyClarification } : {}),
          ...(compileResult.terminalArtifacts.downstreamQueue?.length ? { downstreamQueue: compileResult.terminalArtifacts.downstreamQueue } : {}),
          ...(compileResult.terminalArtifacts.executionScalePlan ? { executionScalePlan: compileResult.terminalArtifacts.executionScalePlan } : {}),
          ...(compileResult.terminalArtifacts.instrumentApplianceJobs?.length ? { instrumentApplianceJobs: compileResult.terminalArtifacts.instrumentApplianceJobs } : {}),
          ...(compileResult.ontologyBindings?.length ? { ontologyBindings: compileResult.ontologyBindings } : {}),
          ...(assurance ? { assurance } : {}),
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            turns: 0,
            toolCalls: 0,
          },
        };
        return result;
      } else {
        // Pipeline produced no events and no gaps (or outcome is 'error') —
        // fall through to LLM fallback loop.

        // Emit pipeline diagnostics so the chat UI can surface why the
        // pipeline fell through (spec-020).
        const filtered = (compileResult.diagnostics ?? [])
          .filter(d => d.severity === 'error' || d.severity === 'warning')
          .slice(0, 6)
          .map(d => ({ pass_id: d.pass_id, code: d.code, severity: d.severity, message: d.message }));
        onEvent?.({ type: 'pipeline_diagnostics', outcome: compileResult.outcome, diagnostics: filtered });

        const toolPolicy = forceDraftTool
          ? `Compiler preflight ${compileResult.outcome}; asking AI to call ${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME}…`
          : `Compiler preflight ${compileResult.outcome}; asking AI to continue…`;
        onEvent?.({ type: 'status', message: toolPolicy });
        console.log(`[agent ${tid}] outcome=${compileResult.outcome}, hasArtifacts=${hasArtifacts}; falling through to LLM loop forceDraftTool=${Boolean(forceDraftTool)}`);
      }
      }

      // Decode attachments into plain text so the fallthrough LLM loop can
      // actually see the document. Without this, the pipeline consumed the
      // attachments inside extract_entities/ai_precompile and then discarded
      // them, leaving the agent to flail with no context when the pipeline
      // returned empty. Generous per-attachment cap keeps the context from
      // blowing up on large manuals; truncation is announced in the message
      // so the model can ask for the rest if it matters.
      const ATTACHMENT_CHAR_CAP = 80_000; // ~20K tokens per file at a typical ratio
      const attachmentMessages: ChatMessage[] = [];
      for (const att of attachments ?? []) {
        try {
          const decoded = await decodeAttachmentText(att.name, att.mime_type, att.content);
          if (decoded.text.length === 0) {
            console.warn(`[agent ${tid}] attachment ${att.name} decoded to empty text; skipping`);
            continue;
          }
          const truncated = decoded.text.length > ATTACHMENT_CHAR_CAP;
          const body = truncated
            ? `${decoded.text.slice(0, ATTACHMENT_CHAR_CAP)}\n\n[...truncated: ${decoded.text.length - ATTACHMENT_CHAR_CAP} more characters not shown]`
            : decoded.text;
          attachmentMessages.push({
            role: 'system',
            content: `[Attached file: ${att.name} (${att.mime_type || 'unknown type'})]\n\n${body}`,
          });
        } catch (err) {
          console.warn(`[agent ${tid}] failed to decode attachment ${att.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (attachmentMessages.length > 0) {
        const totalChars = attachmentMessages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
        console.log(`[agent ${tid}] injected ${attachmentMessages.length} attachment(s) into LLM context, totalChars=${totalChars}`);
        onEvent?.({ type: 'status', message: `Reading ${attachmentMessages.length} attachment(s)…` });
      }

      // If the compile pipeline produced no events AND the user attached a
      // document, treat this as a document-discussion turn, not event
      // authoring. Use a lighter system prompt with no tools so the model
      // answers in plain text instead of thrashing against the event-graph
      // system prompt's "return structured JSON or tool-call" directive.
      const isDocDiscussionTurn = attachmentMessages.length > 0;
      const effectiveSystemPrompt = isDocDiscussionTurn
        ? 'You are a helpful laboratory assistant. The user has uploaded one or more documents whose full text appears in earlier system messages. Read them and answer the user\'s question directly, in clear prose. Use markdown for structure when helpful (numbered steps, headings, tables). Be specific and cite values from the document.'
        : systemPrompt;

      // Qwen3 chat template rejects multiple consecutive system messages
      // with "System message must be at the beginning." Fold all system
      // content into a single message before user/assistant turns.
      //
      // The system message must stay a pure function of (mode, editor graph
      // state) — per-turn volatile context (selection, mentions, resolved
      // entities) rides in the user message instead, so llama-server's
      // prompt cache can reuse the prefix between graph mutations. The prefix
      // itself comes from buildPrefixMessages, the same render path the
      // background prompt warmer uses.
      let messages: ChatMessage[];
      if (isDocDiscussionTurn) {
        const systemSections: string[] = [effectiveSystemPrompt];
        for (const m of attachmentMessages) {
          if (typeof m.content === 'string' && m.content.length > 0) systemSections.push(m.content);
        }
        if (resolvedContextMessage) systemSections.push(resolvedContextMessage);
        messages = [
          { role: 'system', content: systemSections.join('\n\n---\n\n') },
          ...historyMessages.slice(-historyTurns),
          { role: 'user', content: prompt },
        ];
      } else {
        const volatileParts: string[] = [];
        const volatileContext = buildVolatileContextMessage(context);
        if (volatileContext) volatileParts.push(volatileContext);
        if (resolvedContextMessage) volatileParts.push(resolvedContextMessage);
        const userContent = volatileParts.length > 0
          ? `${volatileParts.join('\n\n')}\n\n[User request]\n${prompt}`
          : prompt;
        messages = [
          ...buildPrefixRequest({
            context,
            ...(surface ? { surface } : {}),
            ...(history ? { history } : {}),
            ...(forceDraftTool ? { forceDraftTool } : {}),
            ...(toolFilter ? { toolFilter } : {}),
          }).messages,
          { role: 'user', content: userContent },
        ];
      }

      // Append the structured output tool (#8): the agent finalizes by calling
      // compile_event_graph_draft rather than emitting free-text JSON. The
      // event-editor prompt endpoint sets forceDraftTool, which gives the LLM
      // only this terminal tool and sets tool_choice to require it.
      // buildToolDefs is shared with the prompt-warm prefix so warm and real
      // requests render identical tool blocks (prefix-relevant).
      const toolDefs = isDocDiscussionTurn ? [] : buildToolDefs(forceDraftTool, toolFilter);
      const effectiveMaxTurns = isDocDiscussionTurn ? 1 : maxTurns;
      const totalUsage = { promptTokens: 0, completionTokens: 0 };
      console.log(`[agent ${tid}] tools=${toolDefs.length}${toolFilter ? ' (filtered)' : ''} docDiscussion=${isDocDiscussionTurn} maxTurns=${effectiveMaxTurns}`);

      const endpointLabel = inferenceEndpointLabel(inferenceConfig);

      // 2. Agent loop
      for (let turn = 0; turn < effectiveMaxTurns; turn++) {
        const turnStart = Date.now();
        const turnToolStats: Array<{ name: string; durationMs: number; success: boolean }> = [];
        const promptSize = messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
        console.log(`[agent ${tid}] turn ${turn + 1} starting, promptChars=${promptSize}, docDiscussion=${isDocDiscussionTurn}`);
        onEvent?.({ type: 'status', message: isDocDiscussionTurn ? `Generating summary… (${Math.round(promptSize / 1024)} KB context)` : `Turn ${turn + 1}...` });

        let response: import('./types.js').CompletionResponse;
        try {
          const completionReq: import('./types.js').CompletionRequest = {
            model: inferenceConfig.model,
            messages,
            temperature: inferenceConfig.temperature ?? 0.1,
            // No maxTokens in the profile: 4096 is the legacy fallback and is
            // routinely too small for a model that reasons before it drafts. Say
            // so once per process instead of silently truncating (see
            // config.example.yaml — `ai.inference.maxTokens` is the real knob).
            max_tokens: resolveAgentMaxTokens(inferenceConfig.maxTokens, model),
            // Routes this request to the slot holding the background-warmed
            // prefix for this editor context (llama.cpp fork; no-op elsewhere).
            cache_key: deriveContextCacheKey(surface, context),
            ...(enableThinking !== undefined ? { enableThinking } : {}),
          };
          if (toolDefs.length > 0) {
            completionReq.tools = toolDefs;
            completionReq.tool_choice = forceDraftTool
              ? { type: 'function', function: { name: AGENT_INTENT_TOOL_NAME } }
              : 'auto';
          }

          // Accumulators for the streaming response
          let accumulatedContent = '';
          const toolCallAcc = new Map<number, {
            id?: string;
            type?: 'function';
            name?: string;
            args?: string;
          }>();
          let finishReason: 'stop' | 'tool_calls' | 'length' | null = null;
          truncatedToolCall = false;
          let lastId = '';

          const modelStart = Date.now();
          let modelHeartbeatCount = 0;
          let sawModelChunk = false;
          let lastTimings: import('./types.js').LlamaTimings | undefined;
          let lastToolProgressAt = 0;
          onEvent?.({
            type: 'status',
            message: `AI request sent to ${endpointLabel}; waiting for ${forceDraftTool ? COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME : 'model output'}…`,
          });
          const streamIterator = inferenceClient.completeStream(completionReq)[Symbol.asyncIterator]();
          while (true) {
            const next = await nextWithHeartbeat(streamIterator, 3000, () => {
              modelHeartbeatCount += 1;
              const elapsedSec = Math.round((Date.now() - modelStart) / 1000);
              const waitingFor = sawModelChunk ? 'next model chunk' : 'first model chunk';
              onEvent?.({
                type: 'status',
                message: `AI drafting on ${endpointLabel}… ${elapsedSec}s elapsed, waiting for ${waitingFor}.`,
              });
            });
            if (next.done) break;
            const chunk = next.value;
            sawModelChunk = true;
            if (modelHeartbeatCount > 0) {
              onEvent?.({ type: 'status', message: `AI stream resumed from ${endpointLabel}.` });
              modelHeartbeatCount = 0;
            }
            if (chunk.id) lastId = chunk.id;
            if (chunk.timings) lastTimings = chunk.timings;
            const choice = chunk.choices?.[0];
            if (!choice) continue;

            // --- Text content delta ---
            const deltaContent = choice.delta?.content;
            if (typeof deltaContent === 'string' && deltaContent.length > 0) {
              accumulatedContent += deltaContent;
              onEvent?.({ type: 'text_delta', delta: deltaContent });
            }

            // --- Tool-call deltas (structure not in ChatMessage type; needs local cast) ---
            type PartialToolCallDelta = {
              index?: number;
              id?: string;
              type?: 'function';
              function?: { name?: string; arguments?: string };
            };
            const deltaWithToolCalls = choice.delta as Partial<import('./types.js').ChatMessage> & {
              tool_calls?: PartialToolCallDelta[];
            };
            const deltaToolCalls = deltaWithToolCalls.tool_calls;
            if (Array.isArray(deltaToolCalls)) {
              for (const tcDelta of deltaToolCalls) {
                const idx = tcDelta.index ?? 0;
                const entry = toolCallAcc.get(idx) ?? {};
                if (tcDelta.id) entry.id = tcDelta.id;
                if (tcDelta.type) entry.type = tcDelta.type;
                if (tcDelta.function?.name) {
                  entry.name = (entry.name ?? '') + tcDelta.function.name;
                }
                if (typeof tcDelta.function?.arguments === 'string') {
                  entry.args = (entry.args ?? '') + tcDelta.function.arguments;
                }
                toolCallAcc.set(idx, entry);
              }

              // Forced-tool drafts stream as tool-call argument deltas, which
              // carry no assistant text and arrive fast enough that the
              // between-chunk heartbeat never fires — so without this the user
              // sees a long silence while the draft JSON streams. Surface a
              // throttled, growing progress line as events accumulate.
              const now = Date.now();
              if (now - lastToolProgressAt >= 1200) {
                lastToolProgressAt = now;
                const draftArgs = toolCallAcc.get(0)?.args ?? '';
                const n = countDraftedEvents(draftArgs);
                onEvent?.({
                  type: 'status',
                  message: n > 0
                    ? `Drafting on ${endpointLabel}… ${n} event${n === 1 ? '' : 's'} so far.`
                    : `Drafting on ${endpointLabel}…`,
                });
              }
            }

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }
          }

          // KV-cache observability (llama.cpp only): how much of this turn's
          // prompt was served from cache. The compiled-context warmer's whole
          // job is making `cached` ≈ the full prefix on the first turn.
          if (lastTimings?.prompt_n != null) {
            const cached = lastTimings.cache_n ?? 0;
            const total = lastTimings.prompt_n + cached;
            console.log(
              `[agent ${tid}] prefill: ${lastTimings.prompt_n} new + ${cached} cached tokens` +
              `${total > 0 ? ` (${Math.round((100 * cached) / total)}% reused)` : ''}`,
            );
          }

          // Reassemble the final assistant message
          const finalToolCalls = Array.from(toolCallAcc.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, entry]) => ({
              id: entry.id ?? '',
              type: 'function' as const,
              function: {
                name: entry.name ?? '',
                arguments: entry.args ?? '',
              },
            }));

          const assistantMsg: import('./types.js').ChatMessage = {
            role: 'assistant',
            content: accumulatedContent.length > 0 ? accumulatedContent : null,
          };
          if (finalToolCalls.length > 0) {
            assistantMsg.tool_calls = finalToolCalls;
          }

          response = {
            id: lastId,
            choices: [{
              index: 0,
              message: assistantMsg,
              finish_reason: finishReason ?? 'stop',
            }],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[agent ${tid}] turn ${turn + 1} inference error: ${msg}`);
          const elapsed = Date.now() - t0;
          const summary: AgentSummary = {
            traceId: tid,
            surface: surfaceName,
            model,
            success: false,
            elapsedMs: elapsed,
            turns: turnStats,
            totals: {
              turns: turn + 1,
              toolCalls: totalToolCalls,
              promptTokens: totalUsage.promptTokens,
              completionTokens: totalUsage.completionTokens,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            },
            resolvedMentions: resolvedMentionsCount,
            bypass: null,
          };
          summary.error = `Inference error on turn ${turn + 1}: ${msg}`;
          logAgentSummary(tid, summary);
          return {
            success: false,
            error: `Inference error on turn ${turn + 1}: ${msg}`,
            usage: {
              ...totalUsage,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
              turns: turn + 1,
              toolCalls: totalToolCalls,
            },
          };
        }

        // Accumulate usage
        if (response.usage) {
          totalUsage.promptTokens += response.usage.prompt_tokens;
          totalUsage.completionTokens += response.usage.completion_tokens;
        }

        const choice = response.choices[0];
        if (!choice) {
          const elapsed = Date.now() - t0;
          const summary: AgentSummary = {
            traceId: tid,
            surface: surfaceName,
            model,
            success: false,
            elapsedMs: elapsed,
            turns: turnStats,
            totals: {
              turns: turn + 1,
              toolCalls: totalToolCalls,
              promptTokens: totalUsage.promptTokens,
              completionTokens: totalUsage.completionTokens,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            },
            resolvedMentions: resolvedMentionsCount,
            bypass: null,
          };
          summary.error = 'No response from inference';
          logAgentSummary(tid, summary);
          return { success: false, error: 'No response from inference' };
        }

        const assistantMsg = choice.message;
        messages.push(assistantMsg);

        const contentLen = typeof assistantMsg.content === 'string' ? assistantMsg.content.length : 0;
        const tcCount = assistantMsg.tool_calls?.length ?? 0;
        const tcNames = assistantMsg.tool_calls?.map(t => t.function.name).join(',') ?? '';
        console.log(`[agent ${tid}] turn ${turn + 1} finish=${choice.finish_reason} contentLen=${contentLen} toolCalls=${tcCount}${tcNames ? ` [${tcNames}]` : ''}`);

        // 3. If no tool calls, the agent is done. In event-editor draft
        // mode, local OpenAI-compatible servers may ignore tool_choice; when
        // that happens, coerce a JSON argument object and invoke the compiler
        // draft tool locally so the UI still gets a visible tool-call trace.
        if (!assistantMsg.tool_calls?.length && forceDraftTool && !isDocDiscussionTurn) {
          const contentPreview = typeof assistantMsg.content === 'string'
            ? assistantMsg.content.replace(/\s+/g, ' ').slice(0, 400)
            : '<empty>';
          // Fast path: the appliance usually returns the tool call as plain
          // content (its tool-call parser is off). Parse those args directly so
          // the common case costs ONE inference call, not two.
          const rawInlineArgs = coerceDraftArgsFromContent(assistantMsg.content);
          // The forced flow ships `agent_intent` as the terminal tool, so recovered
          // args must be callable AS that tool. Wrapping them as the compile-draft
          // tool produced a call no branch handled and the draft vanished with no
          // diagnostic (observed live 2026-09-20: a perfect 32-well HepG2 payload
          // returned as prose, no proposal). `coerceToAgentIntentArgs` keeps a valid
          // discriminator, infers the obvious one, and returns null rather than
          // handing the tool args it cannot honour.
          const inlineArgs = rawInlineArgs
            ? (forceDraftTool ? coerceToAgentIntentArgs(rawInlineArgs) : rawInlineArgs)
            : null;
          if (inlineArgs) {
            const inlineToolName = forceDraftTool
              ? AGENT_INTENT_TOOL_NAME
              : COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME;
            assistantMsg.content = null;
            assistantMsg.tool_calls = [{
              id: `call-inline-${Date.now().toString(36)}`,
              type: 'function',
              function: {
                name: inlineToolName,
                arguments: JSON.stringify(inlineArgs),
              },
            }];
            choice.finish_reason = 'tool_calls';
            onEvent?.({
              type: 'status',
              message: `Parsed the draft from the model's text (it did not emit a tool call); invoking ${inlineToolName}…`,
            });
            console.log(
              `[agent ${tid}] recovered draft args from content as ${inlineToolName}${rawInlineArgs !== inlineArgs ? ' (intent inferred)' : ''}; skipped the second call`,
            );
          } else {
          onEvent?.({
            type: 'status',
            message: `${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME} was not emitted natively; asking AI for compiler arguments…`,
          });
          try {
            const coerceStart = Date.now();
            const coerceResponse = await awaitWithHeartbeat(
              inferenceClient.complete({
                model: inferenceConfig.model,
                messages: [
                  ...messages.slice(0, -1),
                  { role: 'user', content: buildForcedDraftJsonPrompt(prompt) },
                ],
                temperature: 0,
                // No silent ceiling: a draft JSON for a whole selected plate is
                // exactly what an arbitrary 2048-token cap truncated (observed:
                // a 72-well request produced an unparseable, empty tool call).
                max_tokens: inferenceConfig.maxTokens ?? 4096,
                ...(enableThinking !== undefined ? { enableThinking } : {}),
              }),
              3000,
              () => {
                const elapsedSec = Math.round((Date.now() - coerceStart) / 1000);
                onEvent?.({
                  type: 'status',
                  message: `AI compiler-argument fallback is still running… ${elapsedSec}s elapsed.`,
                });
              },
            );
            if (coerceResponse.usage) {
              totalUsage.promptTokens += coerceResponse.usage.prompt_tokens;
              totalUsage.completionTokens += coerceResponse.usage.completion_tokens;
            }
            const coerceText = typeof coerceResponse.choices[0]?.message?.content === 'string'
              ? coerceResponse.choices[0]!.message.content
              : '';
            const coercedArgs = extractJsonObject(coerceText);
            if (coercedArgs) {
              assistantMsg.content = null;
              assistantMsg.tool_calls = [{
                id: `call-coerced-${Date.now().toString(36)}`,
                type: 'function',
                function: {
                  name: COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME,
                  arguments: JSON.stringify(coercedArgs),
                },
              }];
              choice.finish_reason = 'tool_calls';
              onEvent?.({
                type: 'status',
                message: `AI returned compiler arguments; invoking ${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME}…`,
              });
              console.warn(`[agent ${tid}] model ignored forced tool call; coerced JSON args after stop contentPreview="${contentPreview}"`);
            } else {
              console.warn(`[agent ${tid}] failed to coerce compiler args from response: ${coerceText.replace(/\s+/g, ' ').slice(0, 400)}`);
            }
          } catch (err) {
            console.warn(`[agent ${tid}] compiler-arg coercion failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          }
        }

        if (!assistantMsg.tool_calls?.length && forceDraftTool && !isDocDiscussionTurn) {
          const contentPreview = typeof assistantMsg.content === 'string'
            ? assistantMsg.content.replace(/\s+/g, ' ').slice(0, 400)
            : '<empty>';
          const error = `AI stopped without calling ${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME}, and compiler-argument fallback did not produce valid JSON. Last text: ${contentPreview}`;
          onEvent?.({ type: 'error', message: error });
          const elapsed = Date.now() - t0;
          turnStats.push({
            turn: turn + 1,
            durationMs: Date.now() - turnStart,
            finishReason: choice.finish_reason,
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            tools: turnToolStats,
          });
          const summary: AgentSummary = {
            traceId: tid,
            surface: surfaceName,
            model,
            success: false,
            elapsedMs: elapsed,
            turns: turnStats,
            totals: {
              turns: turn + 1,
              toolCalls: totalToolCalls,
              promptTokens: totalUsage.promptTokens,
              completionTokens: totalUsage.completionTokens,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            },
            resolvedMentions: resolvedMentionsCount,
            bypass: null,
            error,
          };
          logAgentSummary(tid, summary);
          return {
            success: false,
            error,
            usage: {
              ...totalUsage,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
              turns: turn + 1,
              toolCalls: totalToolCalls,
            },
          };
        }

        if (!assistantMsg.tool_calls?.length) {
          // On a document-discussion turn the answer is plain text by
          // design. Don't route it through parseAgentFinalResponse, which
          // would demote prose to clarificationNeeded=false-success.
          const docDiscussionContent = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
          const docUsage = {
            ...totalUsage,
            totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            turns: turn + 1,
            toolCalls: totalToolCalls,
          };
          const result: AgentResult = isDocDiscussionTurn
            ? docDiscussionContent.trim().length > 0
              ? { success: true, clarificationNeeded: docDiscussionContent, events: [], usage: docUsage }
              : {
                  success: false,
                  error: `Model returned an empty response (finish_reason=${choice.finish_reason ?? 'unknown'}). Try shortening the document or asking a more specific question.`,
                  usage: docUsage,
                }
            : parseAgentFinalResponse(
                assistantMsg.content,
                totalUsage,
                turn + 1,
                totalToolCalls,
              );
          const elapsed = Date.now() - t0;
          
          // Record final turn stats
          const turnDuration = Date.now() - turnStart;
          turnStats.push({
            turn: turn + 1,
            durationMs: turnDuration,
            finishReason: choice.finish_reason,
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            tools: turnToolStats,
          });
          
          // Emit summary
          const summary: AgentSummary = {
            traceId: tid,
            surface: surfaceName,
            model,
            success: result.success,
            elapsedMs: elapsed,
            turns: turnStats,
            totals: {
              turns: turn + 1,
              toolCalls: totalToolCalls,
              promptTokens: totalUsage.promptTokens,
              completionTokens: totalUsage.completionTokens,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            },
            resolvedMentions: resolvedMentionsCount,
            bypass: null,
          };
          if (result.error) summary.error = result.error;
          logAgentSummary(tid, summary);
          
          if (!result.success) {
            const preview = typeof assistantMsg.content === 'string'
              ? assistantMsg.content.replace(/\s+/g, ' ').slice(0, 400)
              : '<empty>';
            console.warn(`[agent ${tid}] done success=false elapsedMs=${elapsed} turns=${turn + 1} toolCalls=${totalToolCalls} error=${result.error ?? '(none)'} clarification=${result.clarificationNeeded ? 'yes' : 'no'} contentPreview="${preview}"`);
          } else {
            console.log(`[agent ${tid}] done success=true elapsedMs=${elapsed} turns=${turn + 1} toolCalls=${totalToolCalls} events=${result.events?.length ?? 0}`);
          }
          return result;
        }

        // 3b. Terminal via submit_suggestion (#8): the agent finalized through
        // the structured output tool. Capture its args as the result directly —
        // no regex parse, grounded by the tool schema.
        const extraSubmissionNotes: string[] = [];
        // ONE call is the contract ("call the agent_intent tool exactly once"),
        // and models break it: observed live, a turn carrying [create_record,
        // event_graph] lost the draft because the first match won and the rest
        // vanished without a word. A call that carries draft EVENTS now wins, and
        // whatever else came along is reported rather than dropped.
        const submitSelection = selectSubmitCall(assistantMsg.tool_calls as SubmitCallLike[] | undefined);
        const submitCall = submitSelection.chosen;
        if (submitSelection.ignored.length > 0) {
          const detail = submitSelection.ignored.map((call) => `${call.name} (${call.reason})`).join(', ');
          console.warn(`[agent ${tid}] the model emitted ${submitSelection.ignored.length + 1} submit calls; using ${submitCall?.function.name} and ignoring ${detail}`);
          extraSubmissionNotes.push(
            `The model called the draft tool more than once this turn; I used ${submitCall?.function.name} and ignored ${detail}.`,
          );
        }
        if (submitCall) {
          let submitArgs: Record<string, unknown>;
          const rawToolArguments = typeof submitCall.function.arguments === 'string' ? submitCall.function.arguments.trim() : '';
          try {
            submitArgs = rawToolArguments ? (JSON.parse(rawToolArguments) as Record<string, unknown>) : {};
          } catch {
            // A tool call whose arguments do not parse (typically because the
            // model was cut off mid-JSON) is a failure to report, never an empty
            // draft to pass off as a finished thought.
            submitArgs = {};
            truncatedToolCall = true;
          }
          onEvent?.({ type: 'tool_call', toolName: submitCall.function.name, args: submitArgs });

          // agent_intent with intent=deck_layout: switch the run deck, no event
          // drafting. The variant is validated loosely (the client guards it
          // against the platform manifest before applying). Returns a deckLayout
          // result the client applies to the live editor + persists.
          if (submitCall.function.name === AGENT_INTENT_TOOL_NAME) {
            const agentIntent = parseAgentIntentArgs(submitArgs);

            // intent=create_record: AUTHOR records (equipment/material/labware) the lab
            // does not have yet. Distinct from drafting events, and it writes nothing
            // itself — the client proposes the records and Accept materializes them
            // (records-first, so an existing one is reused with a warning). `alsoPlace`
            // is the explicit second decision: put what was created on the bench.
            if (agentIntent.intent === 'create_record') {
              const creations = parseRecordCreations(submitArgs.records);
              const alsoPlace = parseAlsoPlace(submitArgs.alsoPlace);
              onEvent?.({ type: 'tool_result', toolName: submitCall.function.name, success: creations.length > 0, durationMs: 0 });
              const elapsed = Date.now() - t0;
              const creationResult: AgentResult = creations.length > 0
                ? {
                  success: true,
                  notes: Array.isArray(submitArgs.notes) ? (submitArgs.notes as string[]) : [],
                  recordCreations: creations,
                  ...(alsoPlace ? { alsoPlace } : {}),
                }
                : {
                  success: false,
                  error: 'create_record requires at least one entry in `records` with a `kind` (equipment | material | labware) and a `name`.',
                };
              const summary: AgentSummary = {
                traceId: tid,
                surface: surfaceName,
                model,
                success: creationResult.success,
                elapsedMs: elapsed,
                turns: turnStats,
                totals: {
                  turns: turn + 1,
                  toolCalls: totalToolCalls,
                  promptTokens: totalUsage.promptTokens,
                  completionTokens: totalUsage.completionTokens,
                  totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
                },
                resolvedMentions: resolvedMentionsCount,
                bypass: null,
              };
              if (creationResult.error) summary.error = creationResult.error;
              logAgentSummary(tid, summary);
              console.log(`[agent ${tid}] done create_record success=${creationResult.success} records=${creations.map((c) => c.kind).join(',') || '(none)'} elapsedMs=${elapsed}`);
              return creationResult;
            }

            if (agentIntent.intent === 'deck_layout') {
              const variantId = agentIntent.variantId;
              const platformId = agentIntent.platformId ?? context.activeDeckScope?.platformId ?? 'manual';
              const ok = typeof variantId === 'string' && variantId.length > 0;
              onEvent?.({ type: 'tool_result', toolName: submitCall.function.name, success: ok, durationMs: 0 });
              const elapsed = Date.now() - t0;
              const deckResult: AgentResult = ok
                ? { success: true, deckLayout: { platformId, variantId: variantId as string } }
                : { success: false, error: 'deck_layout intent requires a variantId (e.g. "manual_freeform" = the freeform bench).' };
              const summary: AgentSummary = {
                traceId: tid,
                surface: surfaceName,
                model,
                success: deckResult.success,
                elapsedMs: elapsed,
                turns: turnStats,
                totals: {
                  turns: turn + 1,
                  toolCalls: totalToolCalls,
                  promptTokens: totalUsage.promptTokens,
                  completionTokens: totalUsage.completionTokens,
                  totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
                },
                resolvedMentions: resolvedMentionsCount,
                bypass: null,
              };
              if (deckResult.error) summary.error = deckResult.error;
              logAgentSummary(tid, summary);
              console.log(`[agent ${tid}] done deck_layout success=${deckResult.success} variant=${variantId ?? '(none)'} elapsedMs=${elapsed}`);
              return deckResult;
            }

            // intent=protocol_edit: propose declarative edits to the ATTACHED
            // protocol. The payload is validated against the REGISTERED
            // protocol-edit-op envelope (PROTO-AI-2) — the vocabulary is schema
            // data, never a hand-rolled shape — and the proposal is emitted
            // VERBATIM. Structurally NOTHING else runs: no compiler, no store
            // read-modify-write, no event draft. Accept applies (PROTO-AI-8);
            // until then this turn has written nothing (PROTO-AI-7).
            if (agentIntent.intent === 'protocol_edit') {
              const payload: Record<string, unknown> = {
                ops: agentIntent.ops ?? [],
                ...(agentIntent.protocolId !== undefined ? { protocolId: agentIntent.protocolId } : {}),
              };
              const envelope = await validateProtocolEditPayload(payload);
              const editOk = envelope.valid;
              onEvent?.({ type: 'tool_result', toolName: submitCall.function.name, success: editOk, durationMs: 0 });
              const elapsed = Date.now() - t0;
              const editResult: AgentResult = editOk
                ? { success: true, notes: [], protocolEdit: { ops: payload.ops as unknown[], ...(agentIntent.protocolId !== undefined ? { protocolId: agentIntent.protocolId } : {}) } }
                : {
                  success: false,
                  // The SAME channel every other validation failure uses today
                  // (create_record's missing-`records` error below): success=false
                  // with a corrective `error` string. Ajv's teaching suggestions
                  // ride along so the corrective turn converges.
                  error: `protocol_edit proposal rejected by the protocol-edit-op schema: ${formatProtocolEditErrors(envelope)}. No ops were applied; re-emit with the fields the schema names.`,
                };
              const summary: AgentSummary = {
                traceId: tid,
                surface: surfaceName,
                model,
                success: editResult.success,
                elapsedMs: elapsed,
                turns: turnStats,
                totals: {
                  turns: turn + 1,
                  toolCalls: totalToolCalls,
                  promptTokens: totalUsage.promptTokens,
                  completionTokens: totalUsage.completionTokens,
                  totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
                },
                resolvedMentions: resolvedMentionsCount,
                bypass: null,
              };
              if (editResult.error) summary.error = editResult.error;
              logAgentSummary(tid, summary);
              console.log(`[agent ${tid}] done protocol_edit success=${editResult.success} ops=${(payload.ops as unknown[]).length} elapsedMs=${elapsed}`);
              return editResult;
            }
          }

          // Instruments the USER named this turn (`[[equipment:EQP-…]]`) outrank
          // whatever the draft reached for.
          const namedEquipmentIds: string[] = [];
          const namedEquipmentLabels: Record<string, string> = {};
          for (const match of effectivePrompt.matchAll(/\[\[equipment:([^|\]]+)(?:\|([^\]]*))?\]\]/gi)) {
            const id = match[1]?.trim();
            if (!id) continue;
            if (!namedEquipmentIds.includes(id)) namedEquipmentIds.push(id);
            const label = match[2]?.trim();
            if (label) namedEquipmentLabels[id] = label;
          }
          const parsed = parseSubmitSuggestionArgs(
            submitArgs,
            totalUsage,
            turn + 1,
            totalToolCalls,
            { namedEquipmentIds, namedEquipmentLabels },
          );
          // Name any drafted field the tool does not accept. A silently dropped
          // field is a contract mismatch the model repeats forever (observed:
          // `materials:[{ref:'MSP-…'}]` at the top level, ignored by everything,
          // so the material stayed "ungrounded" and the card came back).
          // Recover what an invented field legitimately carries BEFORE anything
          // reads the draft: the DOSE often lives in a top-level
          // `materials: [{count, ref}]` array no schema accepts, and losing it
          // made a quantity-less concept out of "10,000 HepG2 cells".
          const recovered = recoverInventedMaterialFields((parsed.events ?? []) as unknown[]);
          parsed.events = recovered.events as NonNullable<typeof parsed.events>;
          if (recovered.notes.length > 0) {
            for (const line of recovered.notes) console.warn(`[agent ${tid}] ${line}`);
            parsed.notes = [...(parsed.notes ?? []), ...recovered.notes];
          }

          // Reconcile the QUANTITY KIND against the unit the biologist spoke.
          // Observed (2026-09-21): "Add 200 µL of DMEM" ghosted as 200 *counts*
          // of DMEM — the model dropped the unit and filed the amount as `count`
          // because the materials[] schema had no `volume` slot. The biologist's
          // words (prompt + the event note, which routinely preserves "Adding
          // 200 µL…") carry the unit; heal a misfiled draft from them rather
          // than trusting the field the model happened to reach for.
          {
            const reconcileNotes: string[] = [];
            const eventNotes = (parsed.events ?? []).map((ev) => {
              if (!ev || typeof ev !== 'object') return '';
              const note = (ev as { notes?: unknown }).notes;
              return typeof note === 'string' ? note.trim() : '';
            });
            const quantityResolution = reconcileDraftQuantities(
              (parsed.events ?? []) as unknown[],
              [effectivePrompt, ...eventNotes].filter((s): s is string => typeof s === 'string' && s.length > 0),
            );
            if (quantityResolution.notes.length > 0) {
              parsed.events = quantityResolution.events as NonNullable<typeof parsed.events>;
              for (const line of quantityResolution.notes) {
                reconcileNotes.push(line);
                console.warn(`[agent ${tid}] ${line}`);
              }
              parsed.notes = [...(parsed.notes ?? []), ...reconcileNotes];
            }
          }

          // Read each grounded material's TYPE from its own record. The per-type
          // rules are selected by `domain`, and neither the model's ref nor the
          // wire reliably carries one — so a grounded HepG2 pick kept the chemical
          // rule ("what volume?") instead of the cell rule ("how many?").
          const domainEnrichment = await enrichMaterialDomains((parsed.events ?? []) as unknown[], deps.store);
          parsed.events = domainEnrichment.events as NonNullable<typeof parsed.events>;
          if (domainEnrichment.enriched.length > 0) {
            console.log(`[agent ${tid}] read the material type from the record(s): ${domainEnrichment.enriched.join(', ')}`);
          }

          const draftArgNotes = draftArgDiagnostics(submitArgs);

          // Nothing produced is a FAILURE with a cause, never a silent success.
          // Observed 2026-09-20: the model spent its budget reasoning, was cut
          // off (finish_reason "length"), emitted agent_intent with NO fields, and
          // the run reported success=true / events=0 — the panel showed only
          // "agent_intent · no fields" and the biologist got no proposal at all.
          // Reaching this line means the draft path: the create_record and
          // deck_layout intents return earlier.
          const draftProducedNothing =
            !(parsed.events?.length ?? 0) &&
            !(parsed.clarificationRequests?.length ?? 0) &&
            !parsed.error;
          if (draftProducedNothing) {
            parsed.error = emptyDraftMessage({
              truncated: truncatedToolCall,
              hadArguments: Object.keys(submitArgs).length > 0,
            });
            console.warn(`[agent ${tid}] ${parsed.error}`);
          }
          for (const line of draftArgNotes) console.warn(`[agent ${tid}] ${line}`);
          if (draftArgNotes.length > 0) {
            parsed.notes = [...(parsed.notes ?? []), ...draftArgNotes];
          }
          if (parsed.events?.length) {
            // The names in a draft belong to the biologist. A minted label that
            // is a near-miss of their own words (observed: "HepG23" for "HepG2")
            // is replaced by THEIR phrase — otherwise the clarification asks about
            // a name that exists nowhere and the picker searches a typo.
            const mintRepair = repairMintedLabelsAgainstUserWords(parsed.events, [effectivePrompt]);
            parsed.events = mintRepair.events;
            if (mintRepair.notes.length > 0) {
              for (const line of mintRepair.notes) console.warn(`[agent ${tid}] ${line}`);
              parsed.notes = [...(parsed.notes ?? []), ...mintRepair.notes];
            }
            // Expand compact well ranges ("A1:H12") the model emits into literal
            // wells, so every dock gets the existing per-well format.
            parsed.events = parsed.events.map(expandEventWells);
            // …and the SAME for a named pattern ("checkerboard across A2:D8"),
            // which is otherwise ~35 wells the model has to enumerate by hand.
            // Expanded here, at the boundary: nothing downstream sees a pattern.
            parsed.events = parsed.events.map(expandWellPatternEvent);
            parsed.events = await enrichAddMaterialRefs(
              normalizeDraftLabwareRefs(parsed.events, context),
              createMaterialLabeler({ store: deps.store, ontology: deps.ontology }),
              { store: deps.store, mentions: ctxMentions },
            );
            // Repair material refs the model mangled (e.g. a grounded local
            // record stuffed into an ontology-kind ref) against the resolved
            // mentions, so a confirmed pick renders as the clean record it is.
            parsed.events = normalizeDraftMaterialRefs(parsed.events, resolvedMentions);

            // BIND the user's picks onto the events they answer, before the gate
            // looks at them. The pick is already resolved data (the client
            // grounds it); requiring the MODEL to re-emit it was the loop: a
            // small model kept emitting `material_ref:{mint:{label}}`, which no
            // repair can bind, so the same card returned forever. The
            // clarification request id (`material-<eventIndex+1>`) is the join.
            const materialBinding = bindMaterialAnswersToEvents(
              parsed.events as unknown as Record<string, unknown>[],
              clarificationAnswers,
            );
            parsed.events = materialBinding.events as unknown as typeof parsed.events;

            // RESOLVE the biologist's verbatim term with the lab's identity spine —
            // the same spine the UI and the compiler use, so all three agree on what
            // a term IS. The model no longer chooses a ref field or a CURIE; it emits
            // the words the biologist used, and tier 0 (canonical terms, alias-first)
            // turns "Methanol" into the one local term instead of a new entity.
            // LOCAL TIERS ONLY: tier 0/1 are synchronous, so this never makes the
            // snappy path wait on OLS4 or Exa.
            if (deps.resolveSpine) {
              const spineResolution = await resolveDraftMaterials(parsed.events, deps.resolveSpine);
              parsed.events = spineResolution.events as unknown as typeof parsed.events;
              if (spineResolution.bound.length > 0) {
                console.log(
                  `[agent ${tid}] spine bound ${spineResolution.bound
                    .map((b) => `"${b.label}"→${b.id}@t${b.tier}(${b.field})`)
                    .join(', ')}`,
                );
              }
            }
            if (materialBinding.bound.length > 0) {
              console.log(
                `[agent ${tid}] bound ${materialBinding.bound.length} material pick(s): ` +
                  materialBinding.bound
                    .map((b) => `event[${b.eventIndex}].${b.field}=${String((b.ref as Record<string, unknown>).id)} (${b.source})`)
                    .join(', '),
              );
            }
            if (materialBinding.unbound.length > 0) {
              // Never guess. An unplaceable pick is reported so the surface can
              // say "I could not tell which material this answers" instead of
              // silently dropping it and re-asking.
              console.warn(
                `[agent ${tid}] ${materialBinding.unbound.length} clarification answer(s) could not be bound to an event: ` +
                  materialBinding.unbound.map((a) => a.requestId).join(', '),
              );
            }

            // Force a /m clarification for any ungrounded material. In draft
            // mode the `resolve` tool is off and the post-tool re-compile (the
            // compiler's gap→clarification net) is skipped, so an unconfirmed
            // material — minted, a memory-recalled CURIE, or named only in a
            // note — would otherwise reach the preview unverified. The user
            // picks an ontology term or creates a local record instead.
            const resolvedCuries = new Set<string>();
            for (const m of resolvedMentions) {
              if (m.id) resolvedCuries.add(m.id);
              const cls = m.resolved && Array.isArray((m.resolved as Record<string, unknown>).class)
                ? ((m.resolved as Record<string, unknown>).class as unknown[])
                : [];
              for (const c of cls) {
                const cid = c && typeof c === 'object' ? (c as Record<string, unknown>).id : undefined;
                if (typeof cid === 'string' && cid) resolvedCuries.add(cid);
              }
            }
            // What a pick owes depends on the material's TYPE (a cell line is
            // counted; a chemical is dosed). The registry declares it; the gate
            // stays pure and receives it.
            const materialProfiles = deps.materialProfiles;
            const requirementsFor = materialProfiles
              ? (layer: import('./materialRefFields.js').MaterialLayer, domain?: string) => {
                  const profile = materialProfiles.profileForDomain(domain);
                  const entry = materialProfiles.clarificationForLayer(layer, profile?.id);
                  if (!entry) return null;
                  return {
                    requires: entry.requires,
                    ...(entry.question ? { question: entry.question } : {}),
                  };
                }
              : undefined;
            const materialNet = forceMaterialClarifications(
              parsed.events as unknown as Record<string, unknown>[],
              // Police unconfirmed CURIEs only in forced-tool mode: there the
              // compiler re-compile (which would otherwise validate them) is
              // skipped, so this net is the last gate. Other modes re-compile.
              {
                resolvedCuries,
                policeUnverifiedCuries: draftFlowMode === 'forced-tool',
                // Draft-friction (2026-09-20): on the event-editor surface a
                // NAMED-but-ungrounded material is ACCEPTED as a proposed local
                // term and confirmed in the review dialogue, because the
                // resolution spine already ran here — its only non-bindings are
                // terms the lab does not have locally, and re-asking the
                // biologist up front (the blocking card) defeated the whole
                // draft-to-review flow. Ingestion/protocol surfaces stay strict.
                acceptUngrounded: draftFlowMode === 'forced-tool',
                ...(requirementsFor ? { requirementsFor } : {}),
              },
            );
            // What does each BOUND pick still owe? The registry's layer policy
            // answers (formulation → volume; aliquot → nothing), so the question
            // is derived from the hierarchy rather than hardcoded. The question
            // that looped asked for "a volume and a concentration" of a material
            // whose NAME was a concentration — no answer could satisfy it.
            const layerPolicy = deps.materialProfiles?.clarificationPolicy();
            const followUpRequests: (typeof materialNet.clarificationRequests)[number][] = [];
            // ONLY when the gate asked nothing. The gate's own quantity question
            // (and its "which material?") already covers a concept's
            // requirements, and asking again in different words produced TWO
            // cards for one requirement (observed: "I need a volume and a
            // concentration…" beside "Which material is… I still need
            // concentration and volume…"). The follow-up exists for the case the
            // gate TRUSTS — a formulation, which still owes a volume.
            if (layerPolicy && materialNet.clarificationRequests.length === 0) {
              for (const binding of materialBinding.bound) {
                const event = parsed.events[binding.eventIndex] as unknown as Record<string, unknown>;
                const details = (event?.details ?? {}) as Record<string, unknown>;
                const wells = Array.isArray(details.wells) ? details.wells : [];
                const firstWellRaw = wells.find((w) => typeof w === 'string' && (w as string).trim().length > 0);
                const label = typeof binding.ref.label === 'string' && binding.ref.label.trim().length > 0
                  ? binding.ref.label.trim()
                  : String(binding.ref.id ?? '');
                // The TYPE's requirements, not the global default: a cell line
                // owes a count and never a volume (the default demanded one).
                const boundLayer = materialLayerOfRef(binding.ref);
                const boundDomain = typeof binding.ref.domain === 'string' ? binding.ref.domain.trim() : undefined;
                const boundProfile = boundDomain ? deps.materialProfiles?.profileForDomain(boundDomain) : null;
                const typeRequirements = boundProfile
                  ? deps.materialProfiles?.requirementsForLayer(boundLayer, boundProfile.id) ?? null
                  : null;
                const boundWells = binding.eventIndexes.flatMap((index) => {
                  const boundEvent = (parsed.events ?? [])[index] as unknown as Record<string, unknown>;
                  const boundDetails = (boundEvent?.details ?? {}) as Record<string, unknown>;
                  const wellList = Array.isArray(boundDetails.wells) ? boundDetails.wells : [];
                  return wellList.filter((w): w is string => typeof w === 'string' && w.trim().length > 0);
                });
                const request = followUpForLayer({
                  policy: layerPolicy,
                  layer: boundLayer,
                  label,
                  ...(typeof firstWellRaw === 'string' ? { well: firstWellRaw.trim() } : {}),
                  ...(boundWells.length > 1 ? { wells: [...new Set(boundWells)] } : {}),
                  details,
                  ...(typeRequirements ? { requirements: typeRequirements } : {}),
                  requestId: `material-${binding.eventIndex + 1}`,
                });
                if (request) followUpRequests.push(request);
              }
            }
            const pendingRequests = [...materialNet.clarificationRequests, ...followUpRequests];
            if (pendingRequests.length > 0) {
              // Ask per-material UP FRONT: when any material needs confirming,
              // hold the WHOLE draft (not just the ungrounded subset) and show a
              // named card for each ambiguous material. This avoids "mixing" — a
              // half-draft ghost of the grounded materials alongside the
              // questions. Once every card is answered the model re-drafts the
              // complete graph in one shot.
              parsed.events = [] as unknown as typeof parsed.events;
              parsed.clarificationRequests = [
                ...(parsed.clarificationRequests ?? []),
                ...pendingRequests,
              ];
              if (!parsed.clarification) {
                const legacy = legacyClarificationFromRequests(parsed.clarificationRequests);
                if (legacy) parsed.clarification = legacy;
              }
              // An identical question a second time is a MODEL-SHAPE failure, not
              // a fresh question: say so instead of showing a third card. The
              // pick still works (answers are bound deterministically), so the
              // loop is escapable; it just stops masquerading as a question.
              const loop = detectClarificationLoop({
                requests: pendingRequests,
                history,
              });
              if (loop.looped) {
                parsed.error = clarificationLoopMessage(loop.repeated);
                console.warn(`[agent ${tid}] ${parsed.error}`);
              }
            }
          }
          // The harness ENFORCES what the draft tool's instructions tell the model:
          // materials are never a clarification the model authors, and never to
          // confirm an amount the user already stated. Observed violation: a
          // seeding draft asked "What is the desired final volume per well and
          // the cell suspension concentration (cells/uL)…" for a CELL line, whose
          // type owes only a count and whose adherent cells may have zero volume.
          // Such a question is dropped, and the drop is reported.
          {
            const firstMaterialDomain = (() => {
              for (const ev of (parsed.events ?? []) as unknown[]) {
                const event = ev && typeof ev === 'object' ? (ev as Record<string, unknown>) : null;
                const details = event && typeof event['details'] === 'object' ? (event['details'] as Record<string, unknown>) : null;
                if (!details) continue;
                for (const field of ['material_spec_ref', 'material_instance_ref', 'aliquot_ref', 'vendor_product_ref', 'material_ref']) {
                  const ref = details[field];
                  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) continue;
                  const domain = (ref as Record<string, unknown>)['domain'];
                  if (typeof domain === 'string' && domain.trim()) return domain.trim();
                }
              }
              return undefined;
            })();
            const draftProfile = firstMaterialDomain ? deps.materialProfiles?.profileForDomain(firstMaterialDomain) : null;
            const declared = draftProfile
              ? deps.materialProfiles?.requirementsForLayer('material', draftProfile.id) ?? null
              : null;
            const filtered = filterForbiddenAmountQuestions(parsed.clarificationRequests, declared);
            if (filtered.notes.length > 0) {
              parsed.clarificationRequests = filtered.requests;
              for (const line of filtered.notes) console.warn(`[agent ${tid}] ${line}`);
              parsed.notes = [...(parsed.notes ?? []), ...filtered.notes];
              if (parsed.clarification && filterForbiddenAmountQuestions([clarificationRequestFromLegacy(parsed.clarification, 0)], declared).requests.length === 0) {
                delete parsed.clarification;
              }
            }
          }

          // Forced-draft mode: the model has no resolve tool, so any options it
          // authored on a clarification are fabricated (invented CURIEs like
          // XCO:0000988 / mint-pseudo-ids). Strip them so only the live /m and
          // /l search (real records + ontologies) is ever offered — picking a
          // hallucinated option grounds to a record that doesn't exist.
          if (draftFlowMode === 'forced-tool') {
            if (Array.isArray(parsed.clarificationRequests)) {
              parsed.clarificationRequests = parsed.clarificationRequests.map((r) => ({ ...r, options: [] }));
            }
            if (parsed.clarification) {
              parsed.clarification = { ...parsed.clarification, options: [] };
            }
          }
          let result = parsed;
          // Post-tool re-compile is a legacy-preflight behavior: it rebuilds
          // a text prompt from the structured draft and REPLACES the model's
          // events with the pipeline's output when it produces anything —
          // which can swap a fully-specified draft for a degraded primitive
          // (observed: add_material stripped of wells/labware/volume). In
          // 'forced-tool' mode the schema-validated tool payload IS the
          // draft; the compiler validates later, at Accept/persist time.
          if (draftFlowMode !== 'forced-tool' && (parsed.events?.length ?? 0) > 0) {
            const compilerPrompt = buildCompilerPromptFromDraftArgs(submitArgs);
            onEvent?.({ type: 'tool_call', toolName: COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME, args: { prompt: compilerPrompt } });
            const compilerToolStart = Date.now();
            let compilerToolLastStatus = 'starting compiler tool';
            const compiledDraft = await awaitWithHeartbeat(
              runChatbotCompile({
                prompt: compilerPrompt,
                ...(ctxMentions ? { mentions: ctxMentions } : {}),
                ...(ctxLabwares ? { editorLabwares: ctxLabwares } : {}),
                ...(context.activeDeckScope ? { activeDeckScope: context.activeDeckScope } : {}),
                deps: {
                  extractionService: deps.extractionService!,
                  llmClient: null,
                  searchLabwareByHint: deps.searchLabwareByHint!,
                  labStateCache: getDefaultLabStateCache(),
                  ...(deps.ontologyResolver ? { ontologyResolver: deps.ontologyResolver } : {}),
                  ...(deps.store ? { store: deps.store } : {}),
                },
                deterministicOnly: true,
                onPassEvent: (event: PassProgressEvent) => {
                  if (event.type !== 'pass_started') return;
                  const message = compilerPassStatus(event.pass_id, 'tool');
                  compilerToolLastStatus = message.replace(/^Compiler tool: /, '');
                  try {
                    onEvent?.({ type: 'status', message });
                  } catch {
                    /* streaming must not abort the compiler tool call */
                  }
                },
              }),
              3000,
              () => {
                const elapsedSec = Math.round((Date.now() - compilerToolStart) / 1000);
                onEvent?.({
                  type: 'status',
                  message: `Compiler tool still running… ${elapsedSec}s elapsed (${compilerToolLastStatus}).`,
                });
              },
            );
            const compiledHasArtifacts =
              compiledDraft.terminalArtifacts.events.length > 0 ||
              compiledDraft.terminalArtifacts.gaps.length > 0;
            if (compiledHasArtifacts && compiledDraft.outcome !== 'error') {
              const compiledResult = compileResultToAgentResult(compiledDraft, totalUsage, turn + 1, totalToolCalls);
              if (compilerDroppedMaterialSemantics(parsed, compiledResult)) {
                result = { ...parsed };
                if (compiledResult.labwareAdditions !== undefined) result.labwareAdditions = compiledResult.labwareAdditions;
                if (compiledResult.labwareRequirements !== undefined) result.labwareRequirements = compiledResult.labwareRequirements;
                if (compiledResult.unresolvedRefs !== undefined) result.unresolvedRefs = compiledResult.unresolvedRefs;
                if (compiledResult.downstreamQueue !== undefined) result.downstreamQueue = compiledResult.downstreamQueue;
                if (compiledResult.executionScalePlan !== undefined) result.executionScalePlan = compiledResult.executionScalePlan;
                if (compiledResult.instrumentApplianceJobs !== undefined) result.instrumentApplianceJobs = compiledResult.instrumentApplianceJobs;
                if (compiledResult.ontologyBindings !== undefined) result.ontologyBindings = compiledResult.ontologyBindings;
                result.notes = [
                  ...(result.notes ?? []),
                  'Compiler preflight dropped material refs/composition; showing the validated structured proposal.',
                ];
              } else {
                result = compiledResult;
                result.notes = [
                  ...(result.notes ?? []),
                  'Draft was compiled before preview.',
                ];
              }
            } else {
              result.notes = [
                ...(result.notes ?? []),
                'Compiler returned no ghostable artifacts for the structured draft; showing the validated structured proposal.',
              ];
            }

            // Wherever this draft came from — the tool call, a coerced JSON
            // answer, or the compiler preflight — an EMPTY result is a failure
            // with a cause, never a silent success. The coerced/compile path
            // could end `success=true` with zero events and no explanation
            // (observed live 2026-09-20), the same silence the draft path was
            // fixed for.
            const emptyResult =
              !(result.events?.length ?? 0) &&
              !(result.clarificationRequests?.length ?? 0) &&
              !result.error &&
              !(result.labwareAdditions?.length ?? 0) &&
              !(result.labwareRequirements?.length ?? 0) &&
              !(result.recordCreations?.length ?? 0) &&
              !result.deckLayout;
            if (emptyResult) {
              result = {
                ...result,
                error: emptyDraftMessage({ truncated: truncatedToolCall, hadArguments: true }),
              };
              console.warn(`[agent ${tid}] ${result.error}`);
            }
          }

          const elapsed = Date.now() - t0;
          turnStats.push({
            turn: turn + 1,
            durationMs: Date.now() - turnStart,
            finishReason: choice.finish_reason,
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            tools: turnToolStats,
          });
          const summary: AgentSummary = {
            traceId: tid,
            surface: surfaceName,
            model,
            success: result.success,
            elapsedMs: elapsed,
            turns: turnStats,
            totals: {
              turns: turn + 1,
              toolCalls: totalToolCalls,
              promptTokens: totalUsage.promptTokens,
              completionTokens: totalUsage.completionTokens,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            },
            resolvedMentions: resolvedMentionsCount,
            bypass: null,
          };
          if (result.error) summary.error = result.error;
          logAgentSummary(tid, summary);
          console.log(
            `[agent ${tid}] done success=${result.success} via ${submitCall.function.name} turns=${turn + 1} events=${result.events?.length ?? 0} elapsedMs=${elapsed}`,
          );
          // The terms this draft used, classified ONCE, here: what each matched
          // (local record / ontology / vendor item / not yet in the lab) and where it
          // appeared. The review dialogue's term panel renders this verbatim — the
          // client never re-derives it, so the panel and the harness cannot disagree
          // about what a term IS.
          result = {
            ...result,
            // Classify the WHOLE draft — events plus the labware and equipment
            // requirement arrays — so the term panel shows every thing this step
            // adds (materials, labwares, equipments), not just the materials.
            termManifest: draftTermManifest({
              events: (result.events ?? []) as readonly unknown[],
              ...(result.labwareAdditions?.length ? { labwareAdditions: result.labwareAdditions } : {}),
              ...(result.labwareRequirements?.length ? { labwareRequirements: result.labwareRequirements } : {}),
              ...(result.equipmentRequirements?.length ? { equipmentRequirements: result.equipmentRequirements } : {}),
            }),
            // Never drop a fact silently: if the model emitted extra submit calls,
            // the biologist is told which one was used.
            ...(extraSubmissionNotes.length > 0
              ? { notes: [...(result.notes ?? []), ...extraSubmissionNotes] }
              : {}),
          };
          return result;
        }

        // 4. Execute tool calls (capped per turn) in parallel
        const toolCalls = assistantMsg.tool_calls.slice(0, maxToolCallsPerTurn);

        // Fire all onEvent('tool_call') synchronously in original order so the
        // client UI sees them immediately, not after completions.
        const preparedCalls = toolCalls.map((tc) => {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }
          onEvent?.({ type: 'tool_call', toolName: tc.function.name, args });
          return { tc, args };
        });

        const results = await Promise.all(
          preparedCalls.map(({ tc, args }) => toolBridge.executeTool(tc.function.name, args)),
        );

        // Emit tool_result events and append tool messages in original order.
        for (let i = 0; i < preparedCalls.length; i++) {
          const { tc } = preparedCalls[i]!;
          const result = results[i]!;
          totalToolCalls++;
          turnToolStats.push({ name: tc.function.name, durationMs: result.durationMs, success: result.success });
          console.log(`[agent ${tid}] turn ${turn + 1} tool ${tc.function.name} success=${result.success} durationMs=${result.durationMs}${result.success ? '' : ` error=${(result.content ?? '').slice(0, 200)}`}`);
          onEvent?.({
            type: 'tool_result',
            toolName: tc.function.name,
            success: result.success,
            durationMs: result.durationMs,
          });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.content,
          });
        }

        // 5. If finish_reason is 'length', warn and continue
        if (choice.finish_reason === 'length') {
          truncatedToolCall = true;
          onEvent?.({ type: 'status', message: 'Response truncated, continuing...' });
        }

        // Record turn stats
        const turnEnd = Date.now();
        const turnDuration = turnEnd - turnStart;
        turnStats.push({
          turn: turn + 1,
          durationMs: turnDuration,
          finishReason: choice.finish_reason,
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          tools: turnToolStats,
        });
      }

      // Max turns exceeded
      const elapsed = Date.now() - t0;
      console.warn(`[agent ${tid}] done success=false reason=max_turns turns=${maxTurns} toolCalls=${totalToolCalls} elapsedMs=${elapsed}`);
      
      // Emit summary
      const summary: AgentSummary = {
        traceId: tid,
        surface: surfaceName,
        model,
        success: false,
        elapsedMs: elapsed,
        turns: turnStats,
        totals: {
          turns: maxTurns,
          toolCalls: totalToolCalls,
          promptTokens: totalUsage.promptTokens,
          completionTokens: totalUsage.completionTokens,
          totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
        },
        resolvedMentions: resolvedMentionsCount,
        bypass: null,
      };
      summary.error = `Agent did not converge after ${maxTurns} turns`;
      logAgentSummary(tid, summary);
      
      return {
        success: false,
        error: `Agent did not converge after ${maxTurns} turns`,
        usage: {
          ...totalUsage,
          totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
          turns: maxTurns,
          toolCalls: totalToolCalls,
        },
      };
    },
  };
}
