/**
 * Core agent orchestrator — runs a multi-turn tool-calling loop
 * against an LLM inference endpoint, returning validated event
 * graph fragments for preview.
 */

import type { InferenceConfig, AgentConfig } from '../config/types.js';
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
import { resolveMentionsForPrompt, buildResolvedContextMessage } from './resolveMentions.js';
import { runChatbotCompile } from './runChatbotCompile.js';
import {
  SUBMIT_SUGGESTION_TOOL_NAME,
  COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF,
  COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME,
  SUBMIT_SUGGESTION_INSTRUCTION,
  parseSubmitSuggestionArgs,
} from './submitSuggestionTool.js';
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

/**
 * Overwrite provenance stamps on model-drafted events. The system prompt is
 * deterministic (no timestamps/ids — see buildSystemPrompt) so models copy
 * placeholder values; the server is the authority for when a draft was made.
 */
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

const FORCED_DRAFT_TOOL_INSTRUCTION = [
  'EVENT-EDITOR DRAFT MODE:',
  `- You MUST finish this turn by calling the ${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME} tool.`,
  '- Do not answer in prose. Do not leave the assistant message empty.',
  '- If the prompt is underspecified, call the tool with a clarification object instead of stopping.',
  '- If the requested operation is simple labware/deck setup, include labwareRequirements with classCurie and deckSlot. Use labwareAdditions only for concrete known definitions.',
  '- Do not ask which vendor/catalog/plate subtype for generic labware such as a 96-well plate; emit a generic labwareRequirement and let the user refine it later.',
].join('\n');

type ChatbotCompileResult = Awaited<ReturnType<typeof runChatbotCompile>>;

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

  return {
    success: true,
    events,
    ...(compileResult.labwareAdditions.length > 0 ? { labwareAdditions: compileResult.labwareAdditions } : {}),
    ...(unresolvedRefs.length > 0 ? { unresolvedRefs: unresolvedRefs as unknown as NonNullable<AgentResult['unresolvedRefs']> } : {}),
    ...(clarification ? { clarification: { prompt: clarification, entityType: 'general', options: [] } } : {}),
    ...(compileResult.terminalArtifacts.downstreamQueue?.length ? { downstreamQueue: compileResult.terminalArtifacts.downstreamQueue } : {}),
    ...(compileResult.terminalArtifacts.executionScalePlan ? { executionScalePlan: compileResult.terminalArtifacts.executionScalePlan } : {}),
    ...(compileResult.terminalArtifacts.instrumentApplianceJobs?.length ? { instrumentApplianceJobs: compileResult.terminalArtifacts.instrumentApplianceJobs } : {}),
    ...(compileResult.ontologyBindings?.length ? { ontologyBindings: compileResult.ontologyBindings } : {}),
    usage: {
      ...usage,
      totalTokens: usage.promptTokens + usage.completionTokens,
      turns,
      toolCalls,
    },
  };
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

function buildForcedDraftJsonPrompt(originalPrompt: string): string {
  return [
    `You did not emit the required ${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME} tool call.`,
    'Return ONLY the JSON arguments for that tool. No markdown, no explanation.',
    'Allowed top-level keys: events, labwareRequirements, labwareAdditions, clarification, unresolvedRefs, notes.',
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
    systemPromptPath,
  } = agentConfig;

  const traceId = () => Math.random().toString(36).slice(2, 8);

  /**
   * Tool definitions offered to the LLM for a non-doc turn. Shared by run()
   * and buildPrefixRequest: the chat template renders tool schemas into the
   * prompt, so warm and real requests must carry IDENTICAL tools or their
   * token prefixes diverge at the very start of the system region (measured:
   * 3 common tokens when the warm omitted tools).
   */
  function buildToolDefs(forceDraftTool?: boolean, toolFilter?: readonly string[]) {
    const allToolDefs = toolBridge.getToolDefinitions();
    const baseToolDefs = forceDraftTool
      ? []
      : toolFilter
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
    const systemPrompt = args.surface
      ? buildSurfaceAwarePrompt(args.surface, args.context)
      : buildSystemPrompt(args.context, systemPromptPath);
    const systemSections: string[] = [systemPrompt];
    if (deps.residentContext) systemSections.push(deps.residentContext);
    systemSections.push(SUBMIT_SUGGESTION_INSTRUCTION);
    if (args.forceDraftTool) systemSections.push(FORCED_DRAFT_TOOL_INSTRUCTION);

    const historyMessages = Array.isArray(args.history)
      ? args.history.map(normalizeHistoryMessage).filter((m): m is ChatMessage => m !== null)
      : [];

    const tools = buildToolDefs(args.forceDraftTool, args.toolFilter);
    return {
      messages: [
        { role: 'system', content: systemSections.join('\n\n---\n\n') },
        ...historyMessages.slice(-historyTurns),
      ],
      tools,
      tool_choice: args.forceDraftTool
        ? { type: 'function', function: { name: COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME } }
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
      const { prompt, context, history, surface, toolFilter, onEvent, attachments, enableThinking, deterministicOnly, forceDraftTool } = request;
      const tid = traceId();
      const t0 = Date.now();
      const surfaceName = surface ?? 'default';
      const model = inferenceConfig.model;
      console.log(`[agent ${tid}] start surface=${surfaceName} model=${model} promptLen=${prompt.length} historyLen=${Array.isArray(history) ? history.length : 0} attachments=${attachments?.length ?? 0} deterministicOnly=${Boolean(deterministicOnly)}`);

      // Instrumentation tracking
      const turnStats: TurnStats[] = [];
      let totalToolCalls = 0;
      let resolvedMentionsCount = 0;

      // 1. Build the message array
      const systemPrompt = surface
        ? buildSurfaceAwarePrompt(surface, context)
        : buildSystemPrompt(context, systemPromptPath);
      const historyMessages = Array.isArray(history)
        ? history.map(normalizeHistoryMessage).filter((message): message is ChatMessage => message !== null)
        : [];

      // Resolve mentions and build resolved context message
      const resolvedMentions = await resolveMentionsForPrompt(prompt, deps);
      resolvedMentionsCount = resolvedMentions.length;
      const resolvedContextMessage = buildResolvedContextMessage(resolvedMentions);
      
      // New: route through chatbot-compile pipeline
      const ctxMentions = Array.isArray(context?.mentions) ? context.mentions : undefined;
      const ctxLabwares = Array.isArray(context?.labwares) ? context.labwares : undefined;
      const skipCompilerPreflight = Boolean(forceDraftTool && !deterministicOnly);
      if (skipCompilerPreflight) {
        onEvent?.({ type: 'status', message: `Skipping compiler preflight; asking AI to call ${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME} directly…` });
        console.log(`[agent ${tid}] skipping compiler preflight for forced draft tool mode`);
      }
      if (!skipCompilerPreflight) {
      const preflightStart = Date.now();
      let preflightLastStatus = 'starting compiler preflight';
      const compileResult = await awaitWithHeartbeat(
        runChatbotCompile({
          prompt,
          ...(attachments ? { attachments } : {}),
          ...(ctxMentions ? { mentions: ctxMentions } : {}),
          ...(ctxLabwares ? { editorLabwares: ctxLabwares } : {}),
          deps: {
            extractionService: deps.extractionService!,
            llmClient: deps.llmClient ?? null,
            searchLabwareByHint: deps.searchLabwareByHint!,
            labStateCache: getDefaultLabStateCache(),
            ...(deps.ontologyResolver ? { ontologyResolver: deps.ontologyResolver } : {}),
            ...(deps.store ? { store: deps.store } : {}),
          },
          ...(deterministicOnly ? { deterministicOnly: true } : {}),
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
        const result: AgentResult = {
          success: true,
          events,
          ...(compileResult.labwareAdditions.length > 0 ? { labwareAdditions: compileResult.labwareAdditions } : {}),
          ...(unresolvedRefs.length > 0 ? { unresolvedRefs: unresolvedRefs as unknown as NonNullable<AgentResult['unresolvedRefs']> } : {}),
          ...(clarification ? { clarification: { prompt: clarification, entityType: 'general', options: [] } } : {}),
          ...(compileResult.terminalArtifacts.downstreamQueue?.length ? { downstreamQueue: compileResult.terminalArtifacts.downstreamQueue } : {}),
          ...(compileResult.terminalArtifacts.executionScalePlan ? { executionScalePlan: compileResult.terminalArtifacts.executionScalePlan } : {}),
          ...(compileResult.terminalArtifacts.instrumentApplianceJobs?.length ? { instrumentApplianceJobs: compileResult.terminalArtifacts.instrumentApplianceJobs } : {}),
          ...(compileResult.ontologyBindings?.length ? { ontologyBindings: compileResult.ontologyBindings } : {}),
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
            max_tokens: inferenceConfig.maxTokens ?? 4096,
            // Routes this request to the slot holding the background-warmed
            // prefix for this editor context (llama.cpp fork; no-op elsewhere).
            cache_key: deriveContextCacheKey(surface, context),
            ...(enableThinking !== undefined ? { enableThinking } : {}),
          };
          if (toolDefs.length > 0) {
            completionReq.tools = toolDefs;
            completionReq.tool_choice = forceDraftTool
              ? { type: 'function', function: { name: COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME } }
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
          let lastId = '';

          const modelStart = Date.now();
          let modelHeartbeatCount = 0;
          let sawModelChunk = false;
          let lastTimings: import('./types.js').LlamaTimings | undefined;
          onEvent?.({
            type: 'status',
            message: `AI request sent to thunderbeast; waiting for ${forceDraftTool ? COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME : 'model output'}…`,
          });
          const streamIterator = inferenceClient.completeStream(completionReq)[Symbol.asyncIterator]();
          while (true) {
            const next = await nextWithHeartbeat(streamIterator, 3000, () => {
              modelHeartbeatCount += 1;
              const elapsedSec = Math.round((Date.now() - modelStart) / 1000);
              const waitingFor = sawModelChunk ? 'next model chunk' : 'first model chunk';
              onEvent?.({
                type: 'status',
                message: `AI drafting on thunderbeast… ${elapsedSec}s elapsed, waiting for ${waitingFor}.`,
              });
            });
            if (next.done) break;
            const chunk = next.value;
            sawModelChunk = true;
            if (modelHeartbeatCount > 0) {
              onEvent?.({ type: 'status', message: 'AI stream resumed from thunderbeast.' });
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
                max_tokens: Math.min(inferenceConfig.maxTokens ?? 4096, 2048),
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
        const submitCall = assistantMsg.tool_calls.find(
          (tc) => tc.function.name === COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME || tc.function.name === SUBMIT_SUGGESTION_TOOL_NAME,
        );
        if (submitCall) {
          let submitArgs: Record<string, unknown>;
          try {
            submitArgs = JSON.parse(submitCall.function.arguments) as Record<string, unknown>;
          } catch {
            submitArgs = {};
          }
          onEvent?.({ type: 'tool_call', toolName: submitCall.function.name, args: submitArgs });

          const parsed = parseSubmitSuggestionArgs(submitArgs, totalUsage, turn + 1, totalToolCalls);
          let result = parsed;
          if ((parsed.events?.length ?? 0) > 0) {
            const compilerPrompt = buildCompilerPromptFromDraftArgs(submitArgs);
            onEvent?.({ type: 'tool_call', toolName: COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME, args: { prompt: compilerPrompt } });
            const compilerToolStart = Date.now();
            let compilerToolLastStatus = 'starting compiler tool';
            const compiledDraft = await awaitWithHeartbeat(
              runChatbotCompile({
                prompt: compilerPrompt,
                ...(ctxMentions ? { mentions: ctxMentions } : {}),
                ...(ctxLabwares ? { editorLabwares: ctxLabwares } : {}),
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
              result = compileResultToAgentResult(compiledDraft, totalUsage, turn + 1, totalToolCalls);
              result.notes = [
                ...(result.notes ?? []),
                'Draft was compiled before preview.',
              ];
            } else {
              result.notes = [
                ...(result.notes ?? []),
                'Compiler returned no ghostable artifacts for the structured draft; showing the validated structured proposal.',
              ];
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
