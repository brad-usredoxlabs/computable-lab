/**
 * Types for the AI agent orchestrator.
 *
 * These types define the inference protocol (OpenAI-compatible),
 * agent request/response shapes, and streaming event types.
 */

import type { ExecutionScalePlan, InstrumentApplianceJob } from '../compiler/pipeline/CompileContracts.js';
import type { AssuranceResult } from './assurance.js';
import type { DraftTermUse } from './draftTermManifest.js';

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
  kind: 'material-spec' | 'aliquot' | 'material' | 'material-instance' | 'vendor-product' | 'labware' | 'equipment' | 'selection';
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

/** One step of an attached protocol, condensed for the prompt (PROTO-AI-6). */
export interface AttachedProtocolStep {
  stepId: string;
  ordinal: number;
  label: string;
  /** Step kind (base ProtocolStep kinds); absent when the client could not resolve it. */
  kind?: string;
}

/** Declared labware role of an attached protocol (mirror of LabwareRole). */
export interface AttachedProtocolLabwareRole {
  roleId: string;
  description?: string;
  expectedLabwareKinds?: string[];
}

/** Declared instrument role of an attached protocol (mirror of InstrumentRole). */
export interface AttachedProtocolInstrumentRole {
  roleId: string;
  description?: string;
  allowedInstrumentIds?: string[];
}

/**
 * The protocol ATTACHED to the editor (run → plannedRunRef → protocolRef),
 * resolved app-side into a compact ground-truth payload (PROTO-AI-6). When
 * present, the system prompt carries the ATTACHED PROTOCOL context block AND
 * the protocol_edit instruction section; when absent, NEITHER renders.
 * `sha` is the record's current content sha — the staleness anchor for
 * expectedSha at proposal-apply time.
 */
export interface AttachedProtocolContext {
  recordId: string;
  sha?: string;
  steps: AttachedProtocolStep[];
  labwareRoles?: AttachedProtocolLabwareRole[];
  instrumentRoles?: AttachedProtocolInstrumentRole[];
}

export interface ActiveDeckScope {
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
  /**
   * The protocol ATTACHED to this editor chat (resolved app-side). Present →
   * the prompt carries a compact ground-truth context block (identity + steps
   * + declared roles) and the protocol_edit instruction section; absent →
   * neither renders (PROTO-AI-6).
   */
  attachedProtocol?: AttachedProtocolContext;
  /**
   * Plate-setting sections declared on the run's local protocol (labwares /
   * equipment / materials rows: { role, description?, ref? }). Read-only
   * context for step localization: the model binds step role references
   * against these already-declared bindings instead of inventing them.
   */
  localProtocolSetup?: {
    labwares?: Array<Record<string, unknown>>;
    equipment?: Array<Record<string, unknown>>;
    materials?: Array<Record<string, unknown>>;
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
  /**
   * WHO authored this question. `harness` = the system (the material gate, the
   * layer follow-up); `model` = the draft tool. The harness's own cards are
   * authoritative and must never be filtered out by a rule aimed at the model —
   * doing so held the draft AND deleted the question, leaving the biologist with
   * nothing (observed live 2026-09-20: "success=true events=0", no card, no ghost).
   */
  origin?: 'harness' | 'model';
  entityType?: string;
  menuProvider: AgentClarificationMenuProvider;
  query?: string;
  roleId?: string;
  slot?: string;
  snippet?: string;
  sourceSpan?: { start?: number; end?: number };
  options: AgentClarificationOption[];
  allowCreateLocal?: boolean;
  /**
   * Which material LAYER this question is about. The answer's options must be
   * drawn from that layer only — offering a bare concept beside a formulation and
   * an instance (the old flat /m menu) left the biologist guessing which kind of
   * thing they were choosing. Set by the gate, consumed by the picker.
   */
  materialLayer?: 'material' | 'material-spec' | 'material-instance' | 'aliquot' | 'vendor-product';
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

/**
 * Bench equipment requested by the model (plan 2026-09-19_130430, Phase 4).
 * Equipment is NOT labware: no wells, no addressing, never a deck slot.
 * `recordId` (an `EQP-` id) is records-first; `classCurie` is `equipment:<kind>`
 * for a generic kind or an `EQC-` id for a specific evidenced model. `settings`
 * are keyed by the class's `settingsDefinition`.
 */
export type AgentRecordCreationKind = 'equipment' | 'material' | 'labware';

/**
 * A record the draft wants AUTHORED — the add, as opposed to placing something that
 * already exists. One shape for all three kinds: the ACT is the same (the lab does
 * not have this yet; author it, draft-first), only the kind-specific facts differ.
 *
 * Nothing is written on emission. The user reviews the proposal, and Accept is what
 * materializes it — with a records-first duplicate check, because "create" must never
 * quietly become "create a second copy".
 */
export interface AgentRecordCreation {
  kind: AgentRecordCreationKind;
  /** The name as the lab/user says it. */
  name: string;
  handle?: string;
  /** equipment: `equipment:<kind>` for a GENERIC kind — only when the user spoke generically. */
  classKind?: string;
  /** equipment: an `EQC-` class record that already exists locally (records-first). */
  classRecordId?: string;
  /** material: an ontology id when it IS a known chemical/cell line. */
  curie?: string;
  /** material: chemical | cell_line | organism | reagent | other. */
  domain?: string;
  /** labware: plate | deepwell | reservoir | tube | tiprack | rack. */
  labwareType?: string;
  /** labware: the well layout, when it is known. */
  format?: { rows?: number; cols?: number; wellCount?: number };
  /** equipment: values stated by the source, keyed by the class settingsDefinition. */
  settings?: Record<string, unknown>;
  /** Attribution: "user-description" | "exa:<url>" | "record:<id>". */
  source?: string;
  reason?: string;
}

/**
 * Put what was just created (or an existing record) on the bench, in the SAME turn.
 * Explicit on purpose: creating a record and placing it are two decisions, so the
 * placement is asked for by name rather than being a side effect of creating.
 */
export interface AgentAlsoPlace {
  surface?: 'lawn' | 'slot';
  slotId?: string;
}

export interface AgentEquipmentRequirement {
  recordId?: string;
  classCurie?: string;
  handle?: string;
  reason?: string;
  settings?: Record<string, unknown>;
  /** Attribution: user description, Exa search, existing record… */
  source?: string;
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
  /** Bench equipment the draft wants on the bench (never a deck slot). */
  equipmentRequirements?: AgentEquipmentRequirement[];
  /** Records the draft wants CREATED (the add; nothing is written until Accept). */
  recordCreations?: AgentRecordCreation[];
  /** Place the created record on the bench in the same turn (explicit, never implied). */
  alsoPlace?: AgentAlsoPlace;
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
  /**
   * What each term in this draft matched, for the review dialogue's term panel:
   * a local record, an ontology term, a vendor item, or something the lab does not
   * have yet. Classified once, server-side (draftTermManifest) — the client never
   * re-derives it.
   */
  termManifest?: DraftTermUse[];
  /** Deck layout switch requested via agent_intent (intent: deck_layout). The
   *  client applies this to the live editor; nothing is drafted. */
  deckLayout?: { platformId: string; variantId: string };
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
  /** Optional volume to add (media/reagent/solvent additions), e.g. 200 µL. */
  volume?: { value: number; unit: string };
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
