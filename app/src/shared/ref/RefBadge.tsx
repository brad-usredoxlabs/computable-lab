/**
 * RefBadge - Display component for Ref values.
 * 
 * Shows a pill/badge with the ref label and CURIE, with optional
 * external link for ontology refs.
 */

/**
 * Ref types (duplicated from computable-lab to avoid cross-package deps)
 */
export interface OntologyRef {
  kind: 'ontology'
  id: string
  namespace: string
  label: string
  uri?: string
}

export interface RecordRef {
  kind: 'record'
  id: string
  type: string
  label?: string
}

export type Ref = OntologyRef | RecordRef

/**
 * RefBadge props
 */
export interface RefBadgeProps {
  /** The ref to display */
  value: Ref
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Show remove button */
  onRemove?: () => void
  /** Click handler */
  onClick?: () => void
  /** Whether the badge is selected */
  selected?: boolean
  /** Show external link for ontology refs */
  showExternalLink?: boolean
}

/**
 * Get external URL for an ontology ref
 */
function getOntologyUrl(ref: OntologyRef): string | null {
  if (ref.uri) {
    // For OBO ontologies, link to OLS
    if (ref.uri.includes('purl.obolibrary.org')) {
      const iri = encodeURIComponent(ref.uri)
      return `https://www.ebi.ac.uk/ols4/ontologies/${ref.namespace.toLowerCase()}/classes/${iri}`
    }
    return ref.uri
  }
  
  // Generate URL based on namespace
  const namespace = ref.namespace.toLowerCase()
  
  // OLS-compatible ontologies
  const olsOntologies = ['cl', 'chebi', 'go', 'uberon', 'obi', 'uo', 'ncbitaxon', 'mondo']
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

/**
 * SVG icon components
 */
function BeakerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 002 2h8a2 2 0 002-2V3" />
      <path d="M6 14h12" />
    </svg>
  )
}

function DatabaseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0018 0V5" />
      <path d="M3 12a9 3 0 0018 0" />
    </svg>
  )
}

function ExternalLinkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

/**
 * Get icon for ref type
 */
function RefIcon({ refValue, size }: { refValue: Ref; size?: number }) {
  if (refValue.kind === 'ontology') {
    return <BeakerIcon size={size} />
  }
  return <DatabaseIcon size={size} />
}

/** Known ontology namespaces — refs with these get purple styling. */
const KNOWN_NAMESPACES = new Set([
  'CHEBI', 'UniProt', 'GO', 'DOID', 'RO', 'PMID', 'PDB',
  'REACTOME', 'NCBIGene', 'MONDO', 'CL', 'UBERON', 'OBI',
  'UO', 'NCBITaxon', 'HP', 'DOI', 'EFO',
])

/**
 * RefBadge component
 */
export function RefBadge({
  value,
  size = 'md',
  onRemove,
  onClick,
  selected = false,
  showExternalLink = true,
}: RefBadgeProps) {
  const isOntology = value.kind === 'ontology'
  const externalUrl = isOntology ? getOntologyUrl(value as OntologyRef) : null

  // Size classes
  const sizeClasses = {
    sm: 'px-1 py-px text-[11px]',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  }

  // Icon size (in pixels)
  const iconSizePx = {
    sm: 10,
    md: 16,
    lg: 20,
  }

  // Label max-width
  const labelMaxW = {
    sm: 'max-w-[80px]',
    md: 'max-w-[200px]',
    lg: 'max-w-[200px]',
  }

  // Color classes: ontology refs get purple (known namespace) or amber (unknown),
  // record refs stay blue
  const colorClasses = isOntology
    ? KNOWN_NAMESPACES.has((value as OntologyRef).namespace)
      ? 'bg-purple-100 text-purple-800 border-purple-200'
      : 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-blue-100 text-blue-800 border-blue-200'

  const selectedClasses = selected
    ? 'ring-2 ring-offset-1 ring-blue-500'
    : ''

  const label = value.label || value.id
  const curie = value.kind === 'ontology'
    ? (value.id.includes(':') ? value.id : `${(value as OntologyRef).namespace}:${value.id}`)
    : `${(value as RecordRef).type}:${value.id}`

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full border
        ${sizeClasses[size]}
        ${colorClasses}
        ${selectedClasses}
        ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
      `}
      onClick={onClick}
      title={`${label} (${curie})`}
    >
      <RefIcon refValue={value} size={iconSizePx[size]} />
      
      <span className={`font-medium truncate ${labelMaxW[size]}`}>
        {label}
      </span>

      {size !== 'sm' && (
        <span className="opacity-60 font-mono text-xs">
          {curie}
        </span>
      )}
      
      {showExternalLink && externalUrl && (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-0.5 hover:text-purple-600"
          onClick={(e) => e.stopPropagation()}
          title="View in ontology browser"
        >
          <ExternalLinkIcon size={iconSizePx[size]} />
        </a>
      )}
      
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 hover:text-red-600"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="Remove"
        >
          <span className="sr-only">Remove</span>
          <svg width={iconSizePx[size]} height={iconSizePx[size]} viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </span>
  )
}

export default RefBadge
