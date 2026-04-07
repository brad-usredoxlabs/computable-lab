/**
 * Collection types - first-class groupings of subjects.
 */

import type { Ref } from './ref.js';
import type { Equivalence } from './equivalence.js';

/**
 * Type of collection.
 */
export type CollectionType =
  | 'technical_replicate'   // Same sample measured multiple times
  | 'biological_replicate'  // Independent biological samples
  | 'tubeset'               // Group of tubes
  | 'cage_group'            // Animals in same cage
  | 'cohort'                // Study cohort
  | 'trial_arm'             // Clinical trial arm
  | 'pool'                  // Pooled sample
  | 'batch'                 // Processing batch
  | 'set'                   // Generic grouping
  | 'custom';               // User-defined type

/**
 * A first-class grouping of subjects.
 * Collections can be used anywhere a subject ref is accepted.
 */
export interface Collection {
  /** Stable collection identifier (e.g., COL-000001) */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Type of collection */
  collectionType?: CollectionType;
  
  /** Detailed description */
  description?: string;
  
  /** References to member subjects (individuals or other collections) */
  members: Ref[];
  
  /** Optional equivalence declaration */
  equivalence?: Equivalence;
  
  /** Tags for categorization */
  tags?: string[];
  
  /** Additional notes */
  notes?: string;
}

/**
 * Generate a unique collection ID.
 */
export function generateCollectionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `COL-${timestamp}-${random}`;
}

/**
 * Check if a ref points to a collection.
 */
export function isCollectionRef(ref: Ref): boolean {
  if (ref.kind === 'record') {
    return ref.type === 'collection' || ref.type === 'Collection';
  }
  return false;
}
