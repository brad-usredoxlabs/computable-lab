/**
 * Knowledge types for semantic claims, assertions, and evidence.
 * 
 * These types support the "two speeds, one data model" approach:
 * - Fast semantics: inline authoring during experiment editing
 * - Slow semantics: curation and refinement in knowledge graph view
 */

import type { Ref } from './ref'

/**
 * Direction of change for assertion outcomes
 * Must match assertion.schema.yaml enum exactly
 */
export type DirectionType = 'increased' | 'decreased' | 'no_change' | 'mixed' | 'unknown'

/**
 * Common well role types for assertions
 */
export type WellRoleType = 
  | 'positive_control'
  | 'negative_control'
  | 'vehicle_control'
  | 'blank'
  | 'standard_curve'
  | 'calibrator'
  | 'sample'
  | 'treatment'
  | 'other'

/**
 * Claim - A reusable semantic statement (subject-predicate-object triple).
 * Claims are meaning holders that can be supported by evidence.
 * Uses FAIRCommon mixin from schema
 */
export interface Claim {
  kind: 'claim'
  id: string
  statement: string
  subject: Ref
  predicate: Ref
  object: Ref
  // NO qualifiers field - not in schema
  // FAIRCommon fields (optional):
  title?: string
  description?: string
  keywords?: string[]
  license?: string
  relatedIdentifiers?: string[]
  createdAt?: string  // ISO 8601
  createdBy?: string
  updatedAt?: string  // ISO 8601
  // NO meta field - use RecordEnvelope.meta instead
}

/**
 * Assertion scope - defines the context for an assertion
 * IMPORTANT: additionalProperties: false in schema - only these two fields allowed
 */
export interface AssertionScope {
  control_context?: Ref
  treated_context?: Ref
  // NO other properties allowed!
}

/**
 * Assertion outcome - structured outcome summary
 */
export interface AssertionOutcome {
  measure?: string
  target?: Ref
  direction?: DirectionType
  effect_size?: Record<string, unknown>
}

/**
 * Assertion - A claim evaluated in a specific scope/context, supported by evidence.
 * Assertions are testable and contextual.
 * Uses FAIRCommon mixin from schema
 */
export interface Assertion {
  kind: 'assertion'
  id: string
  claim_ref: Ref
  statement: string
  scope: AssertionScope
  outcome?: AssertionOutcome
  evidence_refs: Ref[]
  // FAIRCommon fields (optional):
  title?: string
  description?: string
  keywords?: string[]
  license?: string
  relatedIdentifiers?: string[]
  createdAt?: string  // ISO 8601
  createdBy?: string
  updatedAt?: string  // ISO 8601
  // NO meta field - use RecordEnvelope.meta instead
}

/**
 * Evidence source types
 */
export type EvidenceSourceType = 'result' | 'context' | 'event' | 'publication' | 'file' | 'event_graph'

/**
 * Evidence source - a specific source supporting an assertion
 */
export interface EvidenceSource {
  type: EvidenceSourceType
  ref: Ref
  snippet?: string
  notes?: string
}

/**
 * Evidence - bundle of sources supporting assertions/claims
 * Uses FAIRCommon mixin from schema
 */
export interface Evidence {
  kind: 'evidence'
  id: string
  supports: Ref[]
  sources: EvidenceSource[]
  quality?: Record<string, unknown>
  // FAIRCommon fields (optional):
  title?: string
  description?: string
  keywords?: string[]
  license?: string
  relatedIdentifiers?: string[]
  createdAt?: string  // ISO 8601
  createdBy?: string
  updatedAt?: string  // ISO 8601
  // NO meta field - use RecordEnvelope.meta instead
}

/**
 * Context - represents the state of a subject (well, plate, etc.) at a point in time
 * NOTE: Context schema does NOT include 'kind' field or FAIRCommon mixin
 * Tags are allowed directly in the record
 */
export interface Context {
  // NO kind field - Context schema doesn't have it!
  id: string
  subject_ref: Ref
  event_graph_ref?: Ref
  timepoint?: string
  contents?: Array<{
    material_ref: Ref
    volume?: { value: number; unit: string }
    concentration?: { value: number; unit: string }
    mass?: { value: number; unit: string }
    count?: number
  }>
  total_volume?: { value: number; unit: string }
  properties?: Record<string, unknown>
  notes?: string
  tags?: string[]  // Allowed in Context schema
  // NO meta field - use RecordEnvelope.meta instead
}

// ============================================================================
// Semantic Intent types for the "stamp" compiler
// ============================================================================

/**
 * Base intent type
 */
interface BaseIntent {
  type: string
  stampInstanceId?: string // For tracking which stamp created this
}

/**
 * Assign well role intent
 */
export interface AssignRoleIntent extends BaseIntent {
  type: 'assign_role'
  wellset: string // e.g., "A1-A3" or "A1,A2,A3"
  labwareId: string
  role: WellRoleType
  instrumentRef: Ref
  channelRef: Ref
  proxyRef?: Ref // e.g., ROS, viability, apoptosis
  // Legacy string fields (deprecated; kept for migration compatibility)
  instrument?: string
  channel?: string
  proxyLabel?: string
  contextRef?: Ref // Optional existing context to update
}

/**
 * Measurement meaning intent - what does a readout channel mean biologically?
 */
export interface MeasurementMeaningIntent extends BaseIntent {
  type: 'measurement_meaning'
  channelRef?: Ref // e.g., "FITC channel" or "Abs450"
  dyeRef?: Ref // Optional: specific dye/reagent
  proxyRef: Ref // What biological proxy does this measure? e.g., "ROS"
  instrument?: string
}

/**
 * Treatment meaning intent - what does a treatment do?
 */
export interface TreatmentMeaningIntent extends BaseIntent {
  type: 'treatment_meaning'
  treatmentRef: Ref // The compound/treatment
  targetRef?: Ref // Optional: molecular target
  effectRef?: Ref // Optional: biological effect/process
}

/**
 * Expected outcome intent - what should happen in this experiment?
 */
export interface ExpectedOutcomeIntent extends BaseIntent {
  type: 'expected_outcome'
  proxyRef: Ref // What are we measuring?
  treatedContext: Ref // Reference to treated wells
  controlContext: Ref // Reference to control wells
  direction: DirectionType // Expected direction of change
  magnitude?: number // Optional: expected fold-change or effect size
}

/**
 * Union of all semantic intent types
 */
export type SemanticIntent =
  | AssignRoleIntent
  | MeasurementMeaningIntent
  | TreatmentMeaningIntent
  | ExpectedOutcomeIntent

// ============================================================================
// Compile result types
// ============================================================================

/**
 * Record envelope for saving to backend (simplified - matches server expectations)
 */
export interface RecordEnvelope {
  record: Claim | Assertion | Evidence | Context
  meta?: {
    status?: 'inbox' | 'filed' | 'archived'
    [key: string]: unknown
  }
}

/**
 * Result of compiling a semantic intent into records
 */
export interface CompileResult {
  claims: RecordEnvelope[]
  assertions: RecordEnvelope[]
  evidence: RecordEnvelope[]
  contexts: RecordEnvelope[]
}

/**
 * Defaults/context for compiling intents
 */
export interface CompileDefaults {
  eventGraphId?: string
  runId?: string
  studyId?: string
  plateId?: string
  creator?: string
  timestamp?: string
}

// ============================================================================
// Helper types for UI
// ============================================================================

/**
 * Stamp card type for UI
 */
export type StampCardType = 'assign_role' | 'measurement_meaning' | 'treatment_meaning' | 'expected_outcome'

/**
 * Stamp card instance (saved state)
 */
export interface StampInstance {
  id: string
  type: StampCardType
  intent: SemanticIntent
  created: string
  modified?: string
}
