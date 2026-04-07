/**
 * Public exports for the AI agent orchestrator.
 */

export type {
  ChatMessage,
  ToolCall,
  ToolDefinition,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ToolExecutionResult,
  AgentRequest,
  EditorContext,
  LabwareSummary,
  EventSummary,
  VerbSummary,
  AgentResult,
  PlateEventProposal,
  OntologyRefProposal,
  AgentEvent,
  InferenceClient,
  AgentOrchestrator,
  ToolBridge,
} from './types.js';

export { ToolRegistry } from './ToolRegistry.js';
export { createInferenceClient, testInferenceEndpoint, listInferenceModels } from './InferenceClient.js';
export { createToolBridge, AGENT_ALLOWED_TOOLS, DOMAIN_TOOL_SUBSETS } from './ToolBridge.js';
export type { DraftDomain } from './ToolBridge.js';
export { createAgentOrchestrator } from './AgentOrchestrator.js';
export { buildSystemPrompt, buildSurfaceAwarePrompt } from './systemPrompt.js';
export { RunContextAssembler } from './RunContextAssembler.js';
