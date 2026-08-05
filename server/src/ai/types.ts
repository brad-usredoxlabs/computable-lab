/**
 * Types for the AI agent orchestrator.
 *
 * These types define the inference protocol (OpenAI-compatible),
 * agent request/response shapes, and streaming event types.
 */

import type { ExecutionScalePlan, InstrumentApplianceJob } from '../compiler/pipeline/CompileContracts.js';
import type { AssuranceResult } from './assurance.js';

// ============================================================================
// OpenAI-compatible inference types
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /**
   * Some OpenAI-compatible reasoning models return the assistant's usable
   * answer here when `content` is null.
   */
  reasoning?: string | null;
  reasoning_content?: string | null;
  /** Tool calls requested by the assistant. */
  tool_calls?: ToolCall[];
  /** ID of the tool call this message is responding to. */
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  response_format?:
    | { type: 'json_object' }
    | { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } };
  /**
   * Forwarded verbatim to vLLM / OpenAI-compatible endpoints that support
   * chat-template kwargs (e.g. `{ enable_thinking: false }` on Qwen3).
   */
  chat_template_kwargs?: Record<string, unknown>;
  /**
   * Per-request override of construction-time enableThinking.
   * When set, wins over the client's construction config.
   * When undefined, construction config is used.
   */
  enableThinking?: boolean;
  /**
   * llama.cpp extension: ask the server to keep this request's prompt in its
   * KV/prompt cache for prefix reuse. Ignored by other providers.
   */
  cache_prompt?: boolean;
  /**
   * llama.cpp extension: pin the request to a specific server slot. Used by
   * the prompt warmer so a warmed prefix can be slot-saved. Ignored by other
   * providers.
   */
  id_slot?: number;
  /**
   * llama.cpp (TurboQuant fork) extension: logical context identity. The
   * server binds the key to the slot that processed it and routes later
   * requests with the same key back to that slot, so a background-warmed
   * prefix is found deterministically instead of relying on LRU/similarity
   * slot selection. Ignored by other providers.
   */
  cache_key?: string;
}

/**
 * llama.cpp per-request timing block, returned on OpenAI-compatible
 * responses. `cache_n` is the number of prompt tokens served from the KV /
 * prompt cache — the observable signal that prefix warming worked.
 */
export interface LlamaTimings {
  prompt_n?: number;
  cache_n?: number;
  prompt_ms?: number;
  prompt_per_second?: number;
  predicted_n?: number;
  predicted_ms?: number;
  predicted_per_second?: number;
}

export interface CompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: 'stop' | 'tool_calls' | 'length';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Present on llama.cpp servers; absent elsewhere. */
  timings?: LlamaTimings;
}

export interface StreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: 'stop' | 'tool_calls' | 'length' | null;
  }>;
  /** llama.cpp attaches timings to the final stream chunk. */
  timings?: LlamaTimings;
}

// ============================================================================
// Tool execution
// ============================================================================

export interface ToolExecutionResult {
  success: boolean;
  /** JSON string of tool result. */
  content: string;
  durationMs: number;
}

// ============================================================================
// Mention resolution types
// ============================================================================

export interface ResolvedMention {
  raw: string;                              // the original [[...]] token
  kind: 'material-spec' | 'aliquot' | 'material' | 'labware' | 'equipment' | 'selection';
  id: string;
  label: string;
  resolved?: Record<string, unknown>;       // entity data, if lookup succeeded
  error?: string;                            // if lookup failed
}

export interface ResolveMentionDeps {
  fetchMaterialSpec?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchAliquot?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchMaterial?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchLabware?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchEquipment?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchProtocol?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchGraphComponent?: (id: string) => Promise<Record<string, unknown> | null>;
  searchLabwareByHint?: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
}

// ============================================================================
// Agent request / response
// ============================================================================

export interface AgentRequest {
  /** The user's natural-language instruction. */
  prompt: string;
  /** Recent conversational turns prior to the current prompt. */
  history?: ConversationHistoryMessage[];
  /** Current editor context (from browser). */
  context: EditorContext;
  /** Which UI surface is making the request (determines system prompt). */
  surface?: import('./systemPrompt.js').AiSurface;
  /** Optional tool name filter — when set, only these tools are offered to the LLM. */
  toolFilter?: readonly string[];
  /** Optional callback for streaming intermediate events. */
  onEvent?: (event: AgentEvent) => void;
  /** Optional file attachments to be processed by the pipeline. */
  attachments?: FileAttachment[];
  /** Per-request override to enable thinking mode on the inference client. */
  enableThinking?: boolean;
  /**
   * When true, force the LLM fallback to finish by calling
   * compile_event_graph_draft instead of allowing a plain-text stop.
   */
  forceDraftTool?: boolean;
  /**
   * When true, run only the deterministic portion of the chatbot-compile
   * pipeline: skip the LLM-backed `ai_precompile` pass and never fall through
   * to the LLM agent loop. Required when no LLM is configured.
   */
  deterministicOnly?: boolean;
  /**
   * Answers to structured clarification requests from a previous turn.
   * The orchestrator injects them as grounded context for the next compile.
   */
  clarificationAnswers?: AgentClarificationAnswer[];
}

/**
 * A file attachment to be processed by the extraction pipeline.
 */
export interface FileAttachment {
  name: string;
  mime_type: string;
  content: string | Buffer;
}

export interface ConversationHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProtocolCandidateEvidenceAnchor {
  pageNumber?: number;
  snippet?: string;
  context?: string;
  sectionId?: string;
  stepNumber?: number;
}

export interface ProtocolCandidateItemSummary {
  label: string;
  role?: string;
  normalizedId?: string;
  notes?: string[];
  evidence?: ProtocolCandidateEvidenceAnchor[];
  confidence?: number;
}

export interface ProtocolCandidateStepSummary {
  stepNumber?: number;
  title?: string;
  text: string;
  materials?: string[];
  labware?: string[];
  equipment?: string[];
  notes?: string[];
  evidence?: ProtocolCandidateEvidenceAnchor[];
  confidence?: number;
  uncertainty?: 'ambiguous' | 'inferred' | 'unresolved' | 'table-derived';
}

export interface ProtocolCandidateSummary {
  kind: 'vendor-protocol-candidate';
  title: string;
  scope?: string;
  source?: {
    documentId?: string;
    vendor?: string;
    title?: string;
    url?: string;
    sha256?: string;
  };
  materials?: ProtocolCandidateItemSummary[];
  labware?: ProtocolCandidateItemSummary[];
  equipment?: ProtocolCandidateItemSummary[];
  steps?: ProtocolCandidateStepSummary[];
  diagnostics?: Array<{
    code: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    evidence?: ProtocolCandidateEvidenceAnchor[];
  }>;
}

export interface SourcePdfSummary {
  artifactPath?: string;
  url?: string;
  title?: string;
  vendor?: string;
  sha256?: string;
}

export interface CurrentPreviewDraft {
  events: Array<Record<string, unknown>>;
  labwareRequirements: AgentLabwareRequirement[];
  labwareAdditions: AgentLabwareAddition[];
  ontologyBindings?: DraftOntologyBinding[];
  sourcePrompt?: string;
  sourceSkips?: string[];
}

export interface DraftRevisionEntry {
  prompt: string;
  createdAt: string;
}

export interface DraftRevisionContext {
  currentPreviewDraft: CurrentPreviewDraft;
  revisionHistory?: DraftRevisionEntry[];
}

export type GraphLemurRevisionEntry = DraftRevisionEntry;

export interface GraphLemurContext {
  sourceProtocolCandidate?: ProtocolCandidateSummary;
  sourcePdf?: SourcePdfSummary;
  /** User's implementation notes for adapting the vendor protocol. */
  implementationContext?: string;
  currentPreviewDraft?: CurrentPreviewDraft;
  revisionHistory?: GraphLemurRevisionEntry[];
  revisionMode?: boolean;
}

export interface ActiveDeckScope {
  locked: boolean;
  runId?: string;
  platformId: string;
  variantId: string;
  allowedSurfaces: Array<'slot' | 'lawn'>;
  allowedSlots: string[];
  allowedLabwareIds: string[];
  focusedLabwareId?: string;
}

export interface EditorContext {
  /** Current labware definitions. */
  labwares: LabwareSummary[];
  /** Current event summary — string from frontend, or structured object. */
  eventSummary: string | {
    totalEvents: number;
    recentEvents: EventSummary[];
  };
  /** Currently selected wells — string[] from frontend, or structured object. */
  selectedWells?: string[] | { labwareId: string; wells: string[] };
  /** Explicit source-pane selection from the editor. */
  sourceSelection?: {
    labwareId: string;
    labwareName: string;
    wells: string[];
  };
  /** Explicit target-pane selection from the editor. */
  targetSelection?: {
    labwareId: string;
    labwareName: string;
    wells: string[];
  };
  /** Compact derived well-state snapshot for selected or recently referenced wells. */
  wellStateSnapshot?: Array<{
    labwareId: string;
    labwareName: string;
    wellId: string;
    totalVolume_uL: number;
    materials: Array<{
      label: string;
      volume_uL?: number;
      concentration?: {
        value: number;
        unit: string;
        basis?: string;
      };
      concentrationUnknown?: boolean;
      count?: number;
      materialSpecRefId?: string;
      aliquotRefId?: string;
      materialInstanceRefId?: string;
      vendorProductRefId?: string;
    }>;
    lastEventId?: string;
    eventCount: number;
    harvested: boolean;
  }>;
  /** Active vocabulary pack ID. */
  vocabPackId: string;
  /** Available verbs — string[] from frontend, or VerbSummary[]. */
  availableVerbs: (string | VerbSummary)[];
  /** Structured prompt mentions resolved client-side from slash commands. */
  mentions?: PromptMention[];
  /** Active deck/workflow platform. */
  deckPlatform?: string;
  /** Active deck variant. */
  deckVariant?: string;
  /** Current deck placements. */
  deckPlacements?: DeckPlacementSummary[];
  /** Hard scope for AI/compiler drafting on a run-locked deck layout. */
  activeDeckScope?: ActiveDeckScope;
  /** Whether the editor is in manual pipetting mode. */
  manualPipettingMode?: boolean;
  /** Lab-level material tracking behavior. */
  materialTracking?: {
    mode: 'relaxed' | 'tracked';
    allowAdHocEventInstances: boolean;
  };
  /** Active ghost-preview draft being revised by the current prompt. */
  draftRevision?: DraftRevisionContext;
  /** The run this event graph is attached to (if any). */
  runId?: string;
  /** The event graph record ID (if saved). */
  eventGraphId?: string;
  /** GraphLemur protocol-source and iterative-preview revision context. */
  graphLemur?: GraphLemurContext;
  /**
   * Protocol-planning step context: the current step + user-highlighted
   * subsection, so the AI adapts/ghosts THAT step (past steps dimmed).
   */
  protocolStepContext?: {
    stepId: string;
    stepLabel: string;
    highlightedSection: string;
    selectedText?: string;
  };
}

export interface LabwareSummary {
  labwareId: string;
  labwareType: string;
  name: string;
  /** Grid addressing — may be a structured object or flat rows/columns. */
  addressing?: {
    type?: 'grid' | 'linear' | 'single';
    rows?: string[] | number;
    columns?: string[] | number;
  };
  rows?: number;
  columns?: number;
}

export interface DeckPlacementSummary {
  slotId: string;
  labwareId?: string;
  moduleId?: string;
}

export interface PromptMention {
  type: 'material' | 'labware' | 'selection';
  entityKind?: 'material' | 'material-spec' | 'aliquot';
  selectionKind?: 'source' | 'target';
  id?: string;
  label: string;
  labwareId?: string;
  wells?: string[];
}

export interface EventSummary {
  eventId: string;
  event_type: string;
  verb: string;
  targetWells?: string[];
  materialLabel?: string;
}

export interface VerbSummary {
  verb: string;
  eventKind: 'primitive' | 'macro';
  description?: string;
}

export interface AgentClarificationOption {
  id: string;
  label: string;
  snippet?: string;
  source?: string;
  score?: number;
  ref?: Record<string, unknown>;
}

export type AgentClarificationKind =
  | 'material'
  | 'aliquot'
  | 'labware'
  | 'equipment'
  | 'vendor-product'
  | 'ontology'
  | 'parameter'
  | 'well-selection'
  | 'sequence'
  | 'general';

export type AgentClarificationMenuProvider = '/m' | '/l' | '/e' | 'choice';

export interface AgentClarification {
  id?: string;
  prompt: string;
  entityType: string;
  options: AgentClarificationOption[];
  menuProvider?: AgentClarificationMenuProvider;
  query?: string;
  roleId?: string;
  slot?: string;
  snippet?: string;
  allowCreateLocal?: boolean;
}

export interface AgentClarificationRequest {
  id: string;
  kind: AgentClarificationKind;
  prompt: string;
  entityType?: string;
  menuProvider: AgentClarificationMenuProvider;
  query?: string;
  roleId?: string;
  slot?: string;
  snippet?: string;
  sourceSpan?: { start?: number; end?: number };
  options: AgentClarificationOption[];
  allowCreateLocal?: boolean;
}

export interface AgentClarificationAnswer {
  requestId: string;
  optionId?: string;
  label?: string;
  value?: string;
  mentionToken?: string;
  ref?: Record<string, unknown>;
}


export interface AgentLabwareRequirement {
  classCurie: string;
  handle?: string;
  reason?: string;
  deckSlot?: string;
  constraints?: string[];
  specificity?: 'generic' | 'constrained' | 'concrete';
  tubeVolumeClass?: '1.5ml' | '2ml' | '5ml' | '15ml' | '50ml';
  rows?: number;
  columns?: number;
}

export interface AgentLabwareAddition {
  recordId: string;
  reason?: string;
  deckSlot?: string;
}

export interface AgentResult {
  /** Whether the agent completed successfully. */
  success: boolean;
  /** The proposed events to preview in the editor. */
  events?: PlateEventProposal[];
  /** Human-readable notes from the agent. */
  notes?: string[];
  /** Ontology terms resolved but not yet in the local library. */
  unresolvedRefs?: OntologyRefProposal[];
  /** Error message if the agent failed. */
  error?: string;
  /** If the agent needs more information from the user. */
  clarificationNeeded?: string;
  /** Structured clarification request with options. */
  clarification?: AgentClarification;
  /** Structured clarification requests for menu-backed follow-up. */
  clarificationRequests?: AgentClarificationRequest[];
  /** Proposed concrete labware additions to apply before events. */
  labwareAdditions?: AgentLabwareAddition[];
  /** Proposed generic/constrained labware requirements to ghost before concrete binding. */
  labwareRequirements?: AgentLabwareRequirement[];
  /** Token usage for observability. */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    turns: number;
    toolCalls: number;
  };
  /** Suggested follow-up compile jobs from the pipeline (spec-039). */
  downstreamQueue?: Array<{ kind: string; description?: string; params?: Record<string, unknown> }>;
  /** Deterministic execution scaling handoff for bench/robot lowering. */
  executionScalePlan?: ExecutionScalePlan;
  /** Appliance active-control jobs derived from instrument run files. */
  instrumentApplianceJobs?: InstrumentApplianceJob[];
  /** Ontology terms bound during draft compile; draftOnly entries materialize on human accept. */
  ontologyBindings?: DraftOntologyBinding[];
  /** Semantic interpretation of the parsed prompt — operations, materials, parameters. */
  interpretation?: {
    operations: Array<{
      type: string
      target?: string
      material?: string
      parameters?: Record<string, unknown>
      resolved: boolean
    }>
  };
  /** Proposed event-graph changes for the Changes panel review. */
  changes?: Array<{
    op: 'add' | 'modify' | 'remove'
    description: string
    eventId?: string
  }>;
  /** Prompt-level resolution assurance (RESOLVE/CONFIRM + structured blockers). */
  assurance?: AssuranceResult;
}

/**
 * A grounded material reference on an agent suggestion. Either an existing
 * CURIE (ontology term or `local:` record, from the resolve() spine) or a
 * request to mint a new local term. There is no free-text option — the agent
 * cannot name a material without grounding it.
 */
export interface GroundedMaterial {
  /** Which slot this fills on the event (e.g. "source", "target", "reagent"). */
  slot?: string;
  /** Composition role for add-material mixtures, e.g. cells, buffer_component, additive. */
  role?: string;
  /** Optional component concentration/contribution, e.g. fetal bovine serum at 10%. */
  concentration?: { value: number; unit: string; basis?: string };
  /** Optional absolute count for cell/material additions, e.g. 10,000 cells. */
  count?: number;
  ref: { curie: string } | { mint: { label: string; domain?: string } };
}

export interface PlateEventProposal {
  eventId: string;
  event_type: string;
  verb: string;
  vocabPackId: string;
  details: Record<string, unknown>;
  /**
   * CURIE-typed material references for this event (Phase 2 / #8). Populated
   * when the agent finalizes via the `submit_suggestion` tool. Additive: the
   * compiler still reads `details`; these are a validated grounding signal.
   */
  materials?: GroundedMaterial[];
  t_offset?: string;
  notes?: string;
  provenance: {
    actor: 'ai-agent';
    timestamp: string;
    method: 'automated';
    actionGroupId: string;
  };
}

export interface OntologyRefProposal {
  ref: {
    kind: 'ontology';
    id: string;
    namespace: string;
    label: string;
    uri?: string;
  };
  suggestedType?: string;
  usedInEvents: string[];
}

export interface DraftOntologyBinding {
  curie: string;
  recordId: string;
  minted: boolean;
  via: 'class-ref' | 'name';
  label: string;
  lifecycleId?: 'lab-vocabulary-control';
  state?: 'proposed' | 'in_review' | 'active' | 'rejected' | 'deprecated';
  requiresReview?: boolean;
  draftOnly?: boolean;
}

// ============================================================================
// Agent streaming events
// ============================================================================

export interface AgentProtocolExtractedEvent {
  type: 'protocol_extracted'
  candidate: {
    title: string
    scope?: string
    materials?: Array<{ label: string; role?: string; normalizedId?: string; notes?: string[]; confidence?: number }>
    labware?: Array<{ label: string; role?: string }>
    equipment?: Array<{ label: string }>
    steps?: Array<{ stepNumber?: number; title?: string; text: string; materials?: string[]; labware?: string[]; equipment?: string[]; notes?: string[]; uncertainty?: string; confidence?: number }>
    diagnostics?: Array<{ code: string; severity: string; message: string }>
  }
  sourcePdf?: { artifactPath?: string; url?: string; title?: string; vendor?: string; sha256?: string }
}

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'tool_call'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; success: boolean; durationMs: number }
  | { type: 'thinking'; content: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'draft'; events: PlateEventProposal[] }
  | { type: 'done'; result: AgentResult }
  | { type: 'error'; message: string }
  | { type: 'pipeline_diagnostics'; outcome: import('../compiler/pipeline/CompileContracts.js').CompileOutcome; diagnostics: Array<{ pass_id: string; code: string; severity: 'info' | 'warning' | 'error'; message: string }> }
  | AgentProtocolExtractedEvent;

// ============================================================================
// Inference client interface
// ============================================================================

export interface InferenceClient {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  completeStream(request: CompletionRequest): AsyncIterable<StreamChunk>;
}

// ============================================================================
// Agent orchestrator interface
// ============================================================================

export interface AgentOrchestrator {
  run(request: AgentRequest): Promise<AgentResult>;
  /**
   * Render the stable, cacheable request prefix ([system, ...history] plus
   * the template-rendered tool definitions) for a (surface, context) pair —
   * the same render path run() uses. Consumed by the background prompt
   * warmer; optional so test doubles stay minimal.
   */
  buildPrefixRequest?(args: {
    context: EditorContext;
    surface?: import('./systemPrompt.js').AiSurface;
    history?: ConversationHistoryMessage[];
    forceDraftTool?: boolean;
    toolFilter?: readonly string[];
  }): Pick<CompletionRequest, 'messages' | 'tools' | 'tool_choice'>;
}

// ============================================================================
// Tool bridge interface
// ============================================================================

export interface ToolBridge {
  /** Get OpenAI-format tool definitions for the allowed tools. */
  getToolDefinitions(): ToolDefinition[];
  /** Execute a tool call by name. */
  executeTool(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult>;
}

// ============================================================================
// Agent instrumentation / summary types
// ============================================================================

export interface TurnStats {
  turn: number;
  durationMs: number;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
  tools: Array<{ name: string; durationMs: number; success: boolean }>;
}

export interface AgentSummary {
  traceId: string;
  surface: string;
  model: string;
  success: boolean;
  error?: string;
  elapsedMs: number;
  turns: TurnStats[];
  totals: {
    turns: number;
    toolCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  resolvedMentions: number;
  bypass?: 'compiler' | null;
}
