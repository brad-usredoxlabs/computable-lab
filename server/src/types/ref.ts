/**
 * Ref type definitions for computable-lab.
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

// ============================================================================
// Validation helpers
// ============================================================================

/**
 * Validation result
 */
export interface RefValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate a ref object
 */
export function validateRef(ref: unknown): RefValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  if (!ref || typeof ref !== 'object') {
    return { valid: false, errors: ['Ref must be an object'], warnings: [] }
  }
  
  const r = ref as Record<string, unknown>
  
  // Check kind
  if (!r.kind) {
    errors.push('Ref must have a kind field')
    return { valid: false, errors, warnings }
  }
  
  if (r.kind !== 'record' && r.kind !== 'ontology') {
    errors.push(`Invalid kind: ${r.kind}. Must be 'record' or 'ontology'`)
    return { valid: false, errors, warnings }
  }
  
  // Check id
  if (!r.id || typeof r.id !== 'string') {
    errors.push('Ref must have an id (string)')
  }
  
  // Kind-specific validation
  if (r.kind === 'ontology') {
    if (!r.namespace || typeof r.namespace !== 'string') {
      errors.push('Ontology ref must have a namespace')
    }
    if (!r.label || typeof r.label !== 'string') {
      errors.push('Ontology ref must have a label')
    }
  } else if (r.kind === 'record') {
    if (!r.type || typeof r.type !== 'string') {
      errors.push('Record ref must have a type')
    }
    if (!r.label) {
      warnings.push('Record ref should have a label for better UX')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Assert that a value is a valid Ref (throws if invalid)
 */
export function assertRef(ref: unknown): asserts ref is Ref {
  const result = validateRef(ref)
  if (!result.valid) {
    throw new Error(`Invalid ref: ${result.errors.join(', ')}`)
  }
}

// ============================================================================
// Display helpers
// ============================================================================

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

/**
 * Get external URL for an ontology ref (OLS, UniProt, etc.)
 */
export function getOntologyRefUrl(ref: OntologyRef): string | null {
  if (ref.uri) {
    return ref.uri
  }
  
  // Generate URL based on namespace
  const namespace = ref.namespace.toLowerCase()
  
  // OLS-compatible ontologies
  const olsOntologies = ['cl', 'chebi', 'go', 'uberon', 'obi', 'uo', 'ncbitaxon']
  if (olsOntologies.includes(namespace)) {
    const iri = encodeURIComponent(`http://purl.obolibrary.org/obo/${ref.id.replace(':', '_')}`)
    return `https://www.ebi.ac.uk/ols4/ontologies/${namespace}/classes/${iri}`
  }
  
  // UniProt
  if (namespace === 'uniprot') {
    const localId = ref.id.includes(':') ? ref.id.split(':')[1] : ref.id
    return `https://www.uniprot.org/uniprotkb/${localId}`
  }
  
  // Reactome
  if (namespace === 'reactome') {
    const localId = ref.id.includes(':') ? ref.id.split(':')[1] : ref.id
    return `https://reactome.org/content/detail/${localId}`
  }
  
  return null
}
