/**
 * Utilities for working with ResolveCandidate output from the resolve() spine.
 *
 * Converts the ranked candidates returned by POST /api/resolve into formats
 * consumed by the existing UI components (ontology picker chips, combobox
 * dropdown items, etc.).
 */

import type { ResolveCandidate } from './client'

/**
 * Ref format used by OntologyPicker and MultiOntologyRefList chips.
 * Matches OLSResultRef from olsClient.ts so existing chip rendering works.
 */
export interface ResolveRef {
  kind: 'ontology'
  id: string
  namespace: string
  label: string
  uri: string
}

/**
 * Convert a ResolveCandidate to the chip/ref format used by the ontology
 * pickers. Existing components expect OLSResultRef with id/namespace/label/uri.
 */
export function resolveCandidateToRef(candidate: ResolveCandidate): ResolveRef {
  return {
    kind: 'ontology',
    id: candidate.curie,
    namespace: candidate.namespace,
    label: candidate.label,
    uri: candidate.uri ?? `https://identifiers.org/${encodeURIComponent(candidate.curie)}`,
  }
}

/**
 * Check if a candidate comes from a local source (tier 1-2).
 */
export function isLocalCandidate(candidate: ResolveCandidate): boolean {
  return candidate.tier <= 2
}

/**
 * Get a human-readable source label for a candidate.
 */
export function sourceLabel(candidate: ResolveCandidate): string {
  switch (candidate.source) {
    case 'local-record':
      return 'Local record'
    case 'oak':
      return 'Local OAK'
    case 'ols4':
      return 'OLS'
    case 'vendor':
      return 'Vendor'
    case 'mint':
      return 'New term'
    default:
      return candidate.source
  }
}

/**
 * Get a tier badge label for display.
 */
export function tierBadge(candidate: ResolveCandidate): { label: string; variant: 'local' | 'remote' | 'new' } {
  if (candidate.source === 'mint') {
    return { label: 'New', variant: 'new' }
  }
  if (candidate.tier <= 2) {
    return { label: 'Local', variant: 'local' }
  }
  return { label: 'Remote', variant: 'remote' }
}

/**
 * @deprecated Use ResolveRef instead. Re-exported here for backward compatibility.
 */
export type OLSResultRef = ResolveRef
