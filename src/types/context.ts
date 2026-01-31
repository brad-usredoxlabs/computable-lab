/**
 * Context types - state of a subject after event graph replay.
 * Generalizes WellContext to any subject type.
 */

import type { Ref } from './ref.js';

/**
 * Quantity with value and unit.
 */
export interface Quantity {
  value: number;
  unit: string;
}

/**
 * Content item in a context (material, reagent, cells, etc.)
 */
export interface ContextContent {
  /** Reference to the material (ontology or record) */
  material_ref?: Ref;
  
  /** Volume */
  volume?: Quantity;
  
  /** Concentration */
  concentration?: Quantity;
  
  /** Mass */
  mass?: Quantity;
  
  /** Count (e.g., cell count) */
  count?: number;
}

/**
 * Context represents the state of a subject after event graph replay.
 * This is a generalization of WellContext to any subject type.
 */
export interface Context {
  /** Stable context identifier (e.g., CTX-000001) */
  id: string;
  
  /** Subject this context describes (individual or collection) */
  subject_ref: Ref;
  
  /** Event graph that produced this context */
  event_graph_ref?: Ref;
  
  /** When context was computed (ISO datetime or offset) */
  timepoint?: string;
  
  /** Materials/reagents/cells in the subject */
  contents?: ContextContent[];
  
  /** Total volume in the subject */
  total_volume?: Quantity;
  
  /** Additional computed properties (temperature, pH, etc.) */
  properties?: Record<string, unknown>;
  
  // Legacy WellContext compatibility fields
  /** @deprecated Use subject_ref instead */
  plate_ref?: Ref;
  
  /** @deprecated Use subject_ref instead */
  well_id?: string;
  
  /** Free-form notes */
  notes?: string;
  
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Generate a unique context ID.
 */
export function generateContextId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `CTX-${timestamp}-${random}`;
}

/**
 * Migrate a legacy WellContext to the new Context format.
 */
export function migrateWellContext(wellContext: {
  id?: string;
  plate_ref?: { id?: string };
  well_id?: string;
  contents?: ContextContent[];
  total_volume?: Quantity;
  properties?: Record<string, unknown>;
  notes?: string;
  tags?: string[];
}): Context {
  const plateId = wellContext.plate_ref?.id || 'PLATE';
  const wellId = wellContext.well_id || 'A1';
  
  const context: Context = {
    id: wellContext.id || generateContextId(),
    subject_ref: {
      kind: 'record',
      type: 'well',
      id: `${plateId}:${wellId}`,
      label: wellId,
    },
  };
  
  // Conditionally add optional properties (exactOptionalPropertyTypes)
  if (wellContext.contents) {
    context.contents = wellContext.contents;
  }
  if (wellContext.total_volume) {
    context.total_volume = wellContext.total_volume;
  }
  if (wellContext.properties) {
    context.properties = wellContext.properties;
  }
  if (wellContext.plate_ref) {
    context.plate_ref = wellContext.plate_ref as Ref;
  }
  if (wellContext.well_id) {
    context.well_id = wellContext.well_id;
  }
  if (wellContext.notes) {
    context.notes = wellContext.notes;
  }
  if (wellContext.tags) {
    context.tags = wellContext.tags;
  }
  
  return context;
}
