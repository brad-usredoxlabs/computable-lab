/**
 * Tier 3 — remote EBI OLS4 ontology search.
 *
 * Best-effort / online-only. Mirrors the normalization in the legacy
 * OntologyHandlers (which now delegates here). On an offline appliance this
 * tier simply yields nothing; the local tiers carry resolution.
 */

import type { ProviderHit, ResolveProvider } from '../types.js';

const OLS4_BASE = 'https://www.ebi.ac.uk/ols4/api/search';

interface Ols4Response {
  response?: {
    numFound?: number;
    docs?: Array<Record<string, unknown>>;
  };
}

/**
 * Fetch + normalize OLS4 search results into provider hits.
 * `ontologies` optionally restricts to OLS ontology keys (comma-joined).
 */
export async function searchOls4(
  term: string,
  limit: number,
  signal: AbortSignal,
  ontologies?: string[],
): Promise<ProviderHit[]> {
  const params = new URLSearchParams({ q: term, rows: String(limit), format: 'json' });
  if (ontologies && ontologies.length > 0) {
    params.set('ontology', ontologies.join(','));
  }

  const res = await fetch(`${OLS4_BASE}?${params.toString()}`, { signal });
  if (!res.ok) return [];

  const json = (await res.json()) as Ols4Response;
  const docs = json.response?.docs ?? [];

  return docs.map((doc): ProviderHit => {
    const oboId = String(doc.obo_id ?? '');
    const iri = String(doc.iri ?? '');
    const ontKey = String(doc.ontology_name ?? doc.ontology_prefix ?? '').toLowerCase();
    const curie = oboId || iri;
    return {
      curie,
      label: String(doc.label ?? ''),
      namespace: curie.includes(':') ? (curie.split(':')[0] ?? ontKey) : ontKey,
      level: 'concept',
      ...(iri ? { uri: iri } : {}),
    };
  });
}

/** Build the tier-3 OLS4 provider. */
export function createOls4Provider(ontologies?: string[]): ResolveProvider {
  return (term, limit, signal) => searchOls4(term, limit, signal, ontologies);
}
