/**
 * AI domain types for chat, streaming, and agent results.
 */

import type { PlateEvent } from './events'
import type { OntologyRef } from './ref'

export interface PromptMention {
  type: 'material' | 'labware' | 'selection' | 'protocol'
  entityKind?: 'material' | 'material-spec' | 'material-instance' | 'aliquot' | 'vendor-product' | 'protocol' | 'graph-component'
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

export interface AiPipelineDiagnostic {
  pass_id: string
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export interface AiPipelineDiagnosticsEvent {
  type: 'pipeline_diagnostics'
  outcome: 'complete' | 'gap' | 'error'
  diagnostics: AiPipelineDiagnostic[]
}

export type AiStreamEvent =
  | AiStatusEvent
  | AiToolCallEvent
  | AiToolResultEvent
  | AiThinkingEvent
  | AiTextDeltaEvent
  | AiDraftEvent
  | AiPipelineDiagnosticsEvent
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
  source?: string
  score?: number
  ref?: Record<string, unknown>
}

export type AiClarificationKind =
  | 'material'
  | 'aliquot'
  | 'labware'
  | 'vendor-product'
  | 'ontology'
  | 'parameter'
  | 'well-selection'
  | 'sequence'
  | 'general'

export type AiClarificationMenuProvider = '/m' | '/l' | 'choice'

export interface AiClarification {
  id?: string
  prompt: string
  entityType: string
  options: AiClarificationOption[]
  menuProvider?: AiClarificationMenuProvider
  query?: string
  roleId?: string
  slot?: string
  snippet?: string
  allowCreateLocal?: boolean
}

export interface AiClarificationRequest {
  id: string
  kind: AiClarificationKind
  prompt: string
  entityType?: string
  menuProvider: AiClarificationMenuProvider
  query?: string
  roleId?: string
  slot?: string
  snippet?: string
  sourceSpan?: { start?: number; end?: number }
  options: AiClarificationOption[]
  allowCreateLocal?: boolean
}

export interface AiClarificationAnswer {
  requestId: string
  optionId?: string
  label?: string
  value?: string
  mentionToken?: string
  ref?: Record<string, unknown>
}


export interface AiLabwareRequirement {
  classCurie: string
  handle?: string
  reason?: string
  deckSlot?: string
  constraints?: string[]
  specificity?: 'generic' | 'constrained' | 'concrete'
  tubeVolumeClass?: '1.5ml' | '2ml' | '5ml' | '15ml' | '50ml'
  rows?: number
  columns?: number
}

export interface AiLabwareAddition {
  recordId: string
  reason?: string
  deckSlot?: string
}

export type ExecutionScaleLevel =
  | 'manual_tubes'
  | 'bench_plate_multichannel'
  | 'robot_deck'

export type ExecutionScalePlanStatus = 'ready' | 'blocked'

export type ExecutionScaleLabwareKind =
  | 'tube'
  | 'tube_rack'
  | '2_well_reservoir'
  | '8_well_reservoir'
  | '12_well_reservoir'
  | '96_well_plate'
  | '384_well_plate'

export interface ExecutionScalePlan {
  kind: 'execution-scale-plan'
  recordId: string
  sourceRef?: Record<string, unknown>
  profileRef?: string
  sourceLevel: ExecutionScaleLevel
  targetLevel: ExecutionScaleLevel
  status: ExecutionScalePlanStatus
  sampleLayout?: {
    labwareRole: string
    labwareKind: Extract<ExecutionScaleLabwareKind, 'tube_rack' | '96_well_plate' | '384_well_plate'>
    labwareDefinition?: string
    sampleCount?: number
    wellGroups: Array<{ groupId: string; wells: string[] }>
  }
  reagentLayout: Array<{
    materialRole: string
    sourceLabwareRole: string
    sourceLabwareKind: Extract<ExecutionScaleLabwareKind, 'tube' | '2_well_reservoir' | '8_well_reservoir' | '12_well_reservoir'>
    sourceLabwareDefinition?: string
    sourceWells: string[]
    reason: string
  }>
  pipettingStrategy?: {
    pipetteMode: 'single_channel' | 'multi_channel_parallel'
    channels: 1 | 8 | 12
    laneStrategy: 'sequential_lanes' | 'parallel_lanes'
    channelization: 'single_channel' | 'multi_channel_prefer' | 'multi_channel_force'
    batching: 'none' | 'group_by_source' | 'group_by_destination' | 'multi_dispense_prefer'
  }
  deckBinding?: {
    platform: 'manual' | 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex'
    requiredLabwareDefinitions: string[]
    requiredTools: string[]
  }
  assumptions: string[]
  blockers: Array<{ code: string; message: string; requiredInput?: string }>
}

export interface InstrumentRunFileWell {
  well: string
  channelMap?: Record<string, string>
  sample?: string
  target?: string
}

export interface InstrumentRunFile {
  instrument: string
  wells: InstrumentRunFileWell[]
  runParameters?: Record<string, unknown>
  analysisRules?: unknown[]
}

export interface InstrumentApplianceJob {
  kind: 'instrument-appliance-job'
  jobId: string
  adapterId: 'molecular_devices_gemini'
  operation: 'active_read'
  instrument: string
  request: {
    adapterId: 'molecular_devices_gemini'
    instrumentRef?: Record<string, unknown>
    outputPath?: string
    parameters: {
      simulate?: boolean
      mode?: 'fluorescence' | 'absorbance' | 'luminescence'
      wavelengthNm?: number
      integrationMs?: number
    }
  }
  sourceRunFile: InstrumentRunFile
  executionReadiness?: InstrumentExecutionReadiness
}

export interface InstrumentExecutionReadinessBlocker {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface InstrumentExecutionReadiness {
  jobId: string
  status: 'ready' | 'blocked'
  executionMode?: 'simulate' | 'live'
  requiresConfirmation: boolean
  blockers: InstrumentExecutionReadinessBlocker[]
}

export interface InstrumentApplianceJobExecutionResult {
  success: boolean
  jobId?: string
  measurementId?: string
  logId?: string
  rawDataPath?: string
  applianceExecutionRecordPath?: string
}

export interface DraftOntologyBinding {
  curie: string
  recordId: string
  minted: boolean
  via: 'class-ref' | 'name'
  label: string
  lifecycleId?: 'lab-vocabulary-control'
  state?: 'proposed' | 'in_review' | 'active' | 'rejected' | 'deprecated'
  requiresReview?: boolean
  draftOnly?: boolean
}

export interface AiAgentResult {
  success: boolean
  events: PlateEvent[]
  notes: string[]
  unresolvedRefs?: OntologyRefProposal[]
  clarificationNeeded?: string
  clarification?: AiClarification
  clarificationRequests?: AiClarificationRequest[]
  error?: string
  labwareAdditions?: AiLabwareAddition[]
  labwareRequirements?: AiLabwareRequirement[]
  executionScalePlan?: ExecutionScalePlan
  instrumentApplianceJobs?: InstrumentApplianceJob[]
  ontologyBindings?: DraftOntologyBinding[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    turns?: number
    toolCalls?: number
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
  /** Typed clarification cards that can be answered with menu-backed refs. */
  clarificationRequests?: AiClarificationRequest[]
  /** Proposed concrete labware additions from the AI */
  labwareAdditions?: AiLabwareAddition[]
  /** Proposed generic/constrained labware requirements from the AI */
  labwareRequirements?: AiLabwareRequirement[]
  /** Deterministic execution scaling handoff from the compiler */
  executionScalePlan?: ExecutionScalePlan
  /** Appliance active-control jobs emitted by the compiler */
  instrumentApplianceJobs?: InstrumentApplianceJob[]
  /** True when this assistant message is a doc-discussion answer (prose only, no events) eligible for "Apply to graph". */
  docDiscussion?: boolean
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

export interface AiProtocolCandidateEvidenceAnchor {
  pageNumber?: number
  snippet?: string
  context?: string
  sectionId?: string
  stepNumber?: number
}

export interface AiProtocolCandidateItemSummary {
  label: string
  role?: string
  normalizedId?: string
  notes?: string[]
  evidence?: AiProtocolCandidateEvidenceAnchor[]
  confidence?: number
}

export interface AiProtocolCandidateStepSummary {
  stepNumber?: number
  title?: string
  text: string
  materials?: string[]
  labware?: string[]
  equipment?: string[]
  notes?: string[]
  evidence?: AiProtocolCandidateEvidenceAnchor[]
  confidence?: number
  uncertainty?: 'ambiguous' | 'inferred' | 'unresolved' | 'table-derived'
}

export interface AiProtocolCandidateSummary {
  kind: 'vendor-protocol-candidate'
  title: string
  scope?: string
  source?: {
    documentId?: string
    vendor?: string
    title?: string
    url?: string
    sha256?: string
  }
  materials?: AiProtocolCandidateItemSummary[]
  labware?: AiProtocolCandidateItemSummary[]
  equipment?: AiProtocolCandidateItemSummary[]
  steps?: AiProtocolCandidateStepSummary[]
  diagnostics?: Array<{
    code: string
    severity: 'info' | 'warning' | 'error'
    message: string
    evidence?: AiProtocolCandidateEvidenceAnchor[]
  }>
}

export interface AiSourcePdfSummary {
  artifactPath?: string
  url?: string
  title?: string
  vendor?: string
  sha256?: string
}

export interface AiCurrentPreviewDraft {
  events: PlateEvent[]
  labwareRequirements: AiLabwareRequirement[]
  labwareAdditions: AiLabwareAddition[]
  ontologyBindings?: DraftOntologyBinding[]
  sourcePrompt?: string
  sourceSkips?: string[]
}

export interface AiDraftRevisionEntry {
  prompt: string
  createdAt: string
}

export interface AiDraftRevisionContext {
  currentPreviewDraft: AiCurrentPreviewDraft
  revisionHistory?: AiDraftRevisionEntry[]
}

export type AiGraphLemurRevisionEntry = AiDraftRevisionEntry

export interface AiGraphLemurContext {
  sourceProtocolCandidate?: AiProtocolCandidateSummary
  sourcePdf?: AiSourcePdfSummary
  currentPreviewDraft?: AiCurrentPreviewDraft
  revisionHistory?: AiGraphLemurRevisionEntry[]
  revisionMode?: boolean
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
  /** Active ghost-preview draft being revised by the current prompt. */
  draftRevision?: AiDraftRevisionContext
  /** GraphLemur protocol-source and iterative-preview revision context. */
  graphLemur?: AiGraphLemurContext
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
