/**
 * Types used by the context engine (compiler-specs/30-context.md §3).
 * The engine consumes EventGraph values and produces Context values.
 */

import type { Context, ContextContent } from '../types/context.js';
import type { Ref } from '../types/ref.js';

export type { Context, ContextContent, Ref };

export interface EventGraphEvent {
  /** Verb name per schema/workflow/event-graph.schema.yaml event_type enum. */
  event_type: string;
  /** ISO-8601 timestamp (optional in v1). */
  timestamp?: string;
  /** Verb-specific details blob. */
  details: Record<string, unknown>;
  /** Optional stable id for the event. */
  id?: string;
}

export interface EventGraph {
  id: string;
  subject_ref?: Ref;
  events: EventGraphEvent[];
}

/**
 * Mutable scratch state used while replaying events.
 */
export interface ContextDraft {
  id: string;
  subject_ref: Ref;
  contents: ContextContent[];
  total_volume?: { value: number; unit: string };
  properties: Record<string, unknown>;
  observed: Record<string, unknown>;
  layer_provenance: {
    event_derived: string[];
    model_derived: string[];
    observed: string[];
  };
  completeness: 'complete' | 'partial';
  missing: string[];
  lineage: Array<{ event_type: string; timestamp?: string }>;
  derivation_versions: Record<string, number>;
}
