/**
 * Types for the AI agent orchestrator.
 *
 * These types define the inference protocol (OpenAI-compatible),
 * agent request/response shapes, and streaming event types.
 */

// ============================================================================
// OpenAI-compatible inference types
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
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
}

export interface StreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: 'stop' | 'tool_calls' | 'length' | null;
  }>;
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
// Agent request / response
// ============================================================================

export interface AgentRequest {
  /** The user's natural-language instruction. */
  prompt: string;
  /** Current editor context (from browser). */
  context: EditorContext;
  /** Optional callback for streaming intermediate events. */
  onEvent?: (event: AgentEvent) => void;
}

export interface EditorContext {
  /** Current labware definitions. */
  labwares: LabwareSummary[];
  /** Current event count and recent events. */
  eventSummary: {
    totalEvents: number;
    recentEvents: EventSummary[];
  };
  /** Currently selected wells, if any. */
  selectedWells?: { labwareId: string; wells: string[] };
  /** Active vocabulary pack ID. */
  vocabPackId: string;
  /** Available verbs from the active vocab pack. */
  availableVerbs: VerbSummary[];
  /** The run this event graph is attached to (if any). */
  runId?: string;
  /** The event graph record ID (if saved). */
  eventGraphId?: string;
}

export interface LabwareSummary {
  labwareId: string;
  labwareType: string;
  name: string;
  addressing: {
    type: 'grid' | 'linear' | 'single';
    rows?: string[];
    columns?: string[];
  };
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
  /** Token usage for observability. */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    turns: number;
    toolCalls: number;
  };
}

export interface PlateEventProposal {
  eventId: string;
  event_type: string;
  verb: string;
  vocabPackId: string;
  details: Record<string, unknown>;
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

// ============================================================================
// Agent streaming events
// ============================================================================

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; success: boolean; durationMs: number }
  | { type: 'thinking'; content: string }
  | { type: 'draft'; events: PlateEventProposal[] }
  | { type: 'done'; result: AgentResult }
  | { type: 'error'; message: string };

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
