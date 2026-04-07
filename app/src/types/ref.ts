/**
 * Ref type definitions (copied from computable-lab for semantic-eln).
 * 
 * A Ref can be:
 * - A record ref: references an internal computable-lab record
 * - An ontology ref: references an external ontology term (ChEBI, CL, GO, etc.)
 */

/**
 * Discriminator for ref types
 */
export type RefKind = 'record' | 'ontology'

/**
 * Base interface for all refs
 */
export interface RefBase {
  kind: RefKind
  id: string
  label?: string
}

/**
 * Reference to an internal computable-lab record
 */
export interface RecordRef extends RefBase {
  kind: 'record'
  /** Record ID (e.g., "STU-000123") */
  id: string
  /** Record type (e.g., "material", "study", "event_graph") */
  type: string
  /** Optional display label */
  label?: string
}

/**
 * Reference to an external ontology term
 */
export interface OntologyRef extends RefBase {
  kind: 'ontology'
  /** CURIE (e.g., "CL:0000182", "CHEBI:16236") */
  id: string
  /** Ontology namespace/prefix (e.g., "CL", "ChEBI", "GO", "UniProt") */
  namespace: string
  /** Human-readable label (required for ontology refs) */
  label: string
  /** Full IRI (optional but recommended) */
  uri?: string
}

/**
 * A reference to either an internal record or an external ontology term
 */
export type Ref = RecordRef | OntologyRef

/**
 * Type guard to check if a ref is a record ref
 */
export function isRecordRef(ref: Ref): ref is RecordRef {
  return ref.kind === 'record'
}

/**
 * Type guard to check if a ref is an ontology ref
 */
export function isOntologyRef(ref: Ref): ref is OntologyRef {
  return ref.kind === 'ontology'
}

// ============================================================================
// Constructor helpers
// ============================================================================

/**
 * Create a record ref
 */
export function createRecordRef(opts: {
  id: string
  type: string
  label?: string
}): RecordRef {
  const ref: RecordRef = {
    kind: 'record',
    id: opts.id,
    type: opts.type,
  }
  if (opts.label !== undefined) {
    ref.label = opts.label
  }
  return ref
}

/**
 * Create an ontology ref
 */
export function createOntologyRef(opts: {
  id: string
  namespace: string
  label: string
  uri?: string
}): OntologyRef {
  const ref: OntologyRef = {
    kind: 'ontology',
    id: opts.id,
    namespace: opts.namespace,
    label: opts.label,
  }
  if (opts.uri !== undefined) {
    ref.uri = opts.uri
  }
  return ref
}

/**
 * Create an ontology ref from a CURIE string
 * @example createOntologyRefFromCurie("CL:0000182", "hepatocyte")
 */
export function createOntologyRefFromCurie(
  curie: string,
  label: string,
  uri?: string
): OntologyRef {
  const colonIndex = curie.indexOf(':')
  if (colonIndex === -1) {
    throw new Error(`Invalid CURIE format: ${curie}`)
  }
  
  const namespace = curie.substring(0, colonIndex)
  
  const ref: OntologyRef = {
    kind: 'ontology',
    id: curie,
    namespace,
    label,
  }
  if (uri !== undefined) {
    ref.uri = uri
  }
  return ref
}

/**
 * Get display text for a ref
 */
export function getRefDisplayText(ref: Ref): string {
  return ref.label || ref.id
}

/**
 * Get the CURIE or ID for display in a badge/pill
 */
export function getRefBadgeText(ref: Ref): string {
  if (isOntologyRef(ref)) {
    return ref.id // Already a CURIE like "CL:0000182"
  }
  return `${ref.type}:${ref.id}`
}
