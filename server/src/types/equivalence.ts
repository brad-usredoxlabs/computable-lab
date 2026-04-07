/**
 * Equivalence types - declares that collection members have equivalent event histories.
 */

import type { Ref } from './ref.js';

/**
 * What aspect is asserted to be equivalent.
 */
export type EquivalenceBasis =
  | 'event_graph'          // members' event graphs are equivalent
  | 'context'              // members' resulting contexts are equivalent
  | 'treatment_assignment' // members share same assignment, graphs may vary
  | 'custom';              // user-defined

/**
 * Scope of the equivalence assertion.
 */
export type EquivalenceScope =
  | 'member'  // equivalence applies to each member individually (typical)
  | 'group';  // equivalence describes the collection as a whole (pooled)

/**
 * Abstraction level for equivalence comparison.
 */
export type EquivalenceAbstraction =
  | 'strict'     // identical after canonicalization
  | 'normalized' // equivalent after ignoring irrelevant differences
  | 'semantic';  // equivalent under ontology meaning (future)

/**
 * Allowable deviations from strict equivalence.
 */
export interface EquivalenceTolerance {
  timing?: { value: number; unit: string };
  volume?: { value: number; unit: string };
  [key: string]: { value: number; unit: string } | undefined;
}

/**
 * Equivalence declaration for collection members.
 */
export interface Equivalence {
  /** Required: what aspect is equivalent */
  basis: EquivalenceBasis;
  
  /** Scope of equivalence (default: member) */
  scope?: EquivalenceScope;
  
  /** Abstraction level (default: normalized) */
  abstraction?: EquivalenceAbstraction;
  
  /** Template used to establish equivalence */
  template_ref?: Ref;
  
  /** Per-member event graph instances */
  event_graph_refs?: Ref[];
  
  /** Per-member context instances */
  context_refs?: Ref[];
  
  /** Allowable deviations */
  tolerance?: EquivalenceTolerance;
  
  /** Free-form notes */
  notes?: string;
}
