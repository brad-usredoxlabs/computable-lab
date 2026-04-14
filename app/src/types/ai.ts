/**
 * AI domain types for chat, streaming, and agent results.
 */

import type { PlateEvent } from './events'
import type { OntologyRef } from './ref'

export interface PromptMention {
  type: 'material' | 'labware' | 'selection' | 'protocol'
  entityKind?: 'material' | 'material-spec' | 'aliquot' | 'protocol' | 'graph-component'
  selectionKind?: 'source' | 'target'
  id?: string
  label: string
  labwareId?: string
  wells?: string[]
}

// =============================================================================
// SSE Stream Events (from POST /api/ai/draft-events/stream)
// =============================================================================

export interface AiStatusEvent {
  type: 'status'
  message: string
}

export interface AiToolCallEvent {
  type: 'tool_call'
  toolName: string
  args?: Record<string, unknown>
}

export interface AiToolResultEvent {
  type: 'tool_result'
  toolName: string
  result?: unknown
}

export interface AiThinkingEvent {
  type: 'thinking'
  text: string
}

export interface AiTextDeltaEvent {
  type: 'text_delta'
  delta: string
}

export interface AiDraftEvent {
  type: 'draft'
  events: PlateEvent[]
  notes?: string[]
}

export interface AiDoneEvent {
  type: 'done'
  result: AiAgentResult
}

export interface AiErrorEvent {
  type: 'error'
  message: string
  code?: string
}

export type AiStreamEvent =
  | AiStatusEvent
  | AiToolCallEvent
  | AiToolResultEvent
  | AiThinkingEvent
  | AiTextDeltaEvent
  | AiDraftEvent
  | AiDoneEvent
  | AiErrorEvent

// =============================================================================
// Agent Result (final output from AI)
// =============================================================================

export interface OntologyRefProposal {
  ref: OntologyRef
  suggestedType?: string
  usedInEvents: string[]
}

export interface AiClarificationOption {
  id: string
  label: string
  snippet?: string
}

export interface AiClarification {
  prompt: string
  entityType: string
  options: AiClarificationOption[]
}

export interface AiLabwareAddition {
  recordId: string
  reason?: string
}

export interface AiAgentResult {
  success: boolean
  events: PlateEvent[]
  notes: string[]
  unresolvedRefs?: OntologyRefProposal[]
  clarificationNeeded?: string
  clarification?: AiClarification
  error?: string
  labwareAdditions?: AiLabwareAddition[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

// =============================================================================
// Chat Messages
// =============================================================================

export interface ChatMessageAttachment {
  name: string
  size: number
  type: string
  previewUrl?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  /** Accumulated stream events for assistant messages */
  streamEvents?: AiStreamEvent[]
  /** Proposed events from the AI (on done) */
  events?: PlateEvent[]
  /** Token usage info */
  usage?: AiAgentResult['usage']
  /** Whether this message is still streaming */
  isStreaming?: boolean
  /** File attachments on user messages */
  attachments?: ChatMessageAttachment[]
  /** Structured clarification (numbered options) from the AI */
  clarification?: AiClarification
  /** Proposed labware additions from the AI */
  labwareAdditions?: AiLabwareAddition[]
}

export interface AiConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// =============================================================================
// Request Context (sent to the AI)
// =============================================================================

export interface AiLabwareSummary {
  labwareId: string
  labwareType: string
  name: string
  rows?: number
  columns?: number
}

export interface AiWellSelection {
  labwareId: string
  labwareName: string
  wells: string[]
}

export interface AiWellMaterialSummary {
  label: string
  volume_uL?: number
  concentration?: {
    value: number
    unit: string
    basis?: string
  }
  concentrationUnknown?: boolean
  count?: number
  materialSpecRefId?: string
  aliquotRefId?: string
  materialInstanceRefId?: string
  vendorProductRefId?: string
}

export interface AiWellStateSummary {
  labwareId: string
  labwareName: string
  wellId: string
  totalVolume_uL: number
  materials: AiWellMaterialSummary[]
  lastEventId?: string
  eventCount: number
  harvested: boolean
}

export interface AiRequestContext {
  labwares: AiLabwareSummary[]
  eventSummary: string
  vocabPackId: string
  availableVerbs: string[]
  selectedWells?: string[]
  sourceSelection?: AiWellSelection
  targetSelection?: AiWellSelection
  wellStateSnapshot?: AiWellStateSummary[]
  mentions?: PromptMention[]
  deckPlatform?: string
  deckVariant?: string
  deckPlacements?: Array<{
    slotId: string
    labwareId?: string
    moduleId?: string
  }>
  manualPipettingMode?: boolean
  materialTracking?: {
    mode: 'relaxed' | 'tracked'
    allowAdHocEventInstances: boolean
  }
}

// =============================================================================
// Health Status (from GET /api/health)
// =============================================================================

export interface AiHealthStatus {
  available: boolean
  inferenceUrl?: string
  model?: string
  provider?: string
  error?: string
}

// =============================================================================
// Knowledge Extraction Result (from POST /api/ai/extract-knowledge)
// =============================================================================

export interface KnowledgeExtractionResult {
  success: boolean
  claims: Array<Record<string, unknown>>
  assertions: Array<Record<string, unknown>>
  evidence: Array<Record<string, unknown>>
  unresolvedRefs?: OntologyRefProposal[]
  notes: string[]
  error?: string
  clarificationNeeded?: string
  usage?: AiAgentResult['usage']
}
