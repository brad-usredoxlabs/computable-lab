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
export { createToolBridge, AGENT_ALLOWED_TOOLS } from './ToolBridge.js';
export { createAgentOrchestrator } from './AgentOrchestrator.js';
export { buildSystemPrompt } from './systemPrompt.js';
