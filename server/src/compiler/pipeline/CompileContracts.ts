/**
 * CompileContracts - Canonical type contracts for the chatbot-compile pipeline.
 *
 * This module defines the core request/result contracts that downstream
 * specs build on.  It is intentionally minimal in this spec; later specs
 * extend these types with richer fields.
 */

import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { PassDiagnostic } from './types.js';

// ---------------------------------------------------------------------------
// LabStateSnapshot — re-exported from the canonical state module
// ---------------------------------------------------------------------------

import type { LabStateSnapshot } from '../state/LabState.js';
export type { LabStateSnapshot };

// ---------------------------------------------------------------------------
// ConversationHistoryMessage
// ---------------------------------------------------------------------------

export interface ConversationHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// CompileRequest
// ---------------------------------------------------------------------------

export interface CompileRequest {
  prompt: string;
  attachments?: ReadonlyArray<{
    filename: string;
    mimeType: string;
    content: string | Uint8Array;
  }>;
  history?: ReadonlyArray<ConversationHistoryMessage>;
  conversationId?: string;
  priorLabState?: LabStateSnapshot;
}

// ---------------------------------------------------------------------------
// Gap
// ---------------------------------------------------------------------------

/**
 * Minimal Gap shape.  Later specs extend with richer kinds
 * (validation findings, unresolvable references, compound-class
 * ambiguities, etc.).  For now, string message + kind tag is
 * enough to carry forward.
 */
export interface Gap {
  kind: 'unresolved_ref' | 'clarification' | 'other';
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// CompileOutcome
// ---------------------------------------------------------------------------

export type CompileOutcome = 'complete' | 'gap' | 'error';

// ---------------------------------------------------------------------------
// TerminalArtifacts
// ---------------------------------------------------------------------------

/**
 * A reference that was successfully resolved against a registry.
 */
export interface ResolvedReference {
  kind: string;
  label: string;
  resolvedId: string;
  resolvedName?: string;
}

/**
 * A labware reference that was resolved against a prior lab-state snapshot.
 */
export interface ResolvedLabwareRef {
  hint: string;
  matched: { instanceId: string; labwareType: string };
}

/**
 * Delta produced by the lab_state pass: the events applied and the
 * resulting snapshot.
 */
export interface LabStateDelta {
  events: PlateEventPrimitive[];
  snapshotAfter: LabStateSnapshot;
}

/**
 * Minimal TerminalArtifacts.  Phase K (spec-040) extends this with
 * directives, resourceManifest, deckLayoutPlan, instrumentRunFiles,
 * analysisRules, labStateDelta, downstreamQueue, validationReport,
 * unresolvedGaps.  Do NOT add those fields here.
 */
export interface DeckLayoutPlan {
  pinned: Array<{ slot: string; labwareHint: string }>;
  unassigned: string[];   // labware hints without deckSlot (yet)
}

export interface TerminalArtifacts {
  events: PlateEventPrimitive[];
  gaps: Gap[];
  resolvedRefs?: ResolvedReference[];
  labStateDelta?: LabStateDelta;
  deckLayoutPlan?: DeckLayoutPlan;   // NEW - stub from spec-012
  resolvedLabwareRefs?: ResolvedLabwareRef[];   // NEW - spec-014
}

// ---------------------------------------------------------------------------
// CompileResult
// ---------------------------------------------------------------------------

export interface CompileResult {
  terminalArtifacts: TerminalArtifacts;
  outcome: CompileOutcome;
  diagnostics: PassDiagnostic[];
}
