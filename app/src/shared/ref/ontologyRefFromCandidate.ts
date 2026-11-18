import type { OntologyRef } from './RefBadge'
import type { ResolveCandidate } from '../api/client'

/**
 * The ONE candidate→ref mapper (SECOND-AUTHORITY, L2-P1-CREATE-DOOR-1 u3anchor):
 * both create surfaces (materials, labware) import this instead of shaping the
 * same term two ways. `uri` is ABSENT when the candidate carries no IRI —
 * never `undefined` (exactOptionalPropertyTypes; the schema declares `uri`
 * present only when the source carries one).
 */
export function ontologyRefFromCandidate(c: ResolveCandidate): OntologyRef {
  return {
    kind: 'ontology', id: c.curie, namespace: c.namespace, label: c.label,
    ...(c.uri ? { uri: c.uri } : {}),
  }
}
