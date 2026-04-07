/**
 * OLS (Ontology Lookup Service) API client.
 * 
 * Provides search functionality for OBO ontologies via the EBI OLS4 API.
 */

/**
 * OLS4 API base URL
 */
const OLS_BASE = 'https://www.ebi.ac.uk/ols4/api'

/**
 * Search result from OLS
 */
export interface OLSSearchResult {
  /** OBO ID / CURIE (e.g., "CL:0000182") */
  obo_id: string
  /** Human-readable label */
  label: string
  /** Full IRI (e.g., "http://purl.obolibrary.org/obo/CL_0000182") */
  iri: string
  /** Ontology name (e.g., "cl") */
  ontology_name: string
  /** Description(s) if available */
  description?: string[]
  /** Synonyms if available */
  synonyms?: string[]
  /** Ontology prefix (e.g., "CL") */
  ontology_prefix?: string
  /** Is defining ontology */
  is_defining_ontology?: boolean
}

/**
 * OLS search API response structure
 */
interface OLSSearchResponse {
  response: {
    docs: OLSSearchResult[]
    numFound: number
    start: number
  }
}

/**
 * Options for OLS search
 */
export interface OLSSearchOptions {
  /** Search query string */
  query: string
  /** Ontology names to search (e.g., ['cl', 'chebi']) */
  ontologies?: string[]
  /** Maximum results to return (default: 10) */
  rows?: number
  /** Search specific fields */
  queryFields?: string
  /** Filter by type (e.g., 'class') */
  type?: string
  /** Include obsolete terms */
  obsoletes?: boolean
  /** Exact match only */
  exact?: boolean
}

async function requestOLS(opts: OLSSearchOptions): Promise<OLSSearchResult[]> {
  const params = new URLSearchParams({
    q: opts.query,
    rows: String(opts.rows ?? 10),
  })
  
  if (opts.ontologies?.length) {
    params.set('ontology', opts.ontologies.join(','))
  }
  
  if (opts.queryFields) {
    params.set('queryFields', opts.queryFields)
  }
  
  if (opts.type) {
    params.set('type', opts.type)
  }
  
  if (opts.obsoletes !== undefined) {
    params.set('obsoletes', String(opts.obsoletes))
  }
  
  if (opts.exact) {
    params.set('exact', 'true')
  }
  
  const url = `${OLS_BASE}/search?${params}`
  
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`OLS search failed: ${res.status} ${res.statusText}`)
  }
  
  const data: OLSSearchResponse = await res.json()
  return data.response.docs
}

/**
 * Search OLS for ontology terms.
 * 
 * @example
 * const results = await searchOLS({
 *   query: 'hepatocyte',
 *   ontologies: ['cl'],
 *   rows: 10
 * })
 */
export async function searchOLS(opts: OLSSearchOptions): Promise<OLSSearchResult[]> {
  const direct = await requestOLS(opts)
  if (direct.length > 0) return direct

  const trimmed = opts.query.trim()
  if (
    trimmed.length >= 3 &&
    !opts.exact &&
    !trimmed.includes('*')
  ) {
    return requestOLS({
      ...opts,
      query: `${trimmed}*`,
    })
  }

  return direct
}

/**
 * Look up a specific term by IRI
 */
export async function lookupOLSTerm(iri: string): Promise<OLSSearchResult | null> {
  const params = new URLSearchParams({
    iri: iri,
  })
  
  const url = `${OLS_BASE}/terms?${params}`
  
  try {
    const res = await fetch(url)
    if (!res.ok) {
      return null
    }
    
    const data = await res.json()
    if (data._embedded?.terms?.length > 0) {
      const term = data._embedded.terms[0]
      return {
        obo_id: term.obo_id,
        label: term.label,
        iri: term.iri,
        ontology_name: term.ontology_name,
        description: term.description,
        synonyms: term.synonyms,
      }
    }
  } catch {
    // Term not found
  }
  
  return null
}

/**
 * Result item for ref conversion
 */
export interface OLSResultRef {
  kind: 'ontology'
  id: string
  namespace: string
  label: string
  uri: string
}

/**
 * Convert an OLS search result to a Ref object.
 */
export function olsResultToRef(result: OLSSearchResult): OLSResultRef {
  // Parse namespace from obo_id (e.g., "CL:0000182" -> "CL")
  let namespace: string
  
  if (result.obo_id && result.obo_id.includes(':')) {
    namespace = result.obo_id.split(':')[0]
  } else if (result.ontology_prefix) {
    namespace = result.ontology_prefix
  } else {
    namespace = result.ontology_name.toUpperCase()
  }
  
  return {
    kind: 'ontology',
    id: result.obo_id || result.iri,
    namespace,
    label: result.label,
    uri: result.iri,
  }
}

/**
 * Build external URL for viewing an ontology term
 */
export function getOLSTermUrl(result: OLSSearchResult): string {
  const iri = encodeURIComponent(result.iri)
  return `https://www.ebi.ac.uk/ols4/ontologies/${result.ontology_name}/classes/${iri}`
}
