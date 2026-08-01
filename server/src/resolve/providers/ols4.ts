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
    const definition = firstText(doc.description) ?? firstText(doc.definition);
    // Use the primary label, but also check related_synonyms for lexical
    // matching. OLS4 often indexes synonyms that are closer to the user's
    // search term than the canonical label (e.g. "MatLyLu cell" is a synonym
    // of "Mat-Ly-Lu Cell" in BTO). If a synonym is a closer match to the
    // search term, use it as the label so hasLexicalSupport passes.
    const primaryLabel = String(doc.label ?? '');
    const synonyms = Array.isArray(doc.related_synonyms)
      ? (doc.related_synonyms as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    const label = pickBestLabel(primaryLabel, synonyms, term);
    return {
      curie,
      label,
      namespace: curie.includes(':') ? (curie.split(':')[0] ?? ontKey) : ontKey,
      level: 'concept',
      ...(iri ? { uri: iri } : {}),
      ...(definition ? { definition } : {}),
    };
  });
}

/** OLS4 serves description/definition as either a string or a string array. */
function firstText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === 'string' && v.trim());
    if (typeof first === 'string') return first.trim();
  }
  return undefined;
}

/**
 * Pick the best label for lexical matching. If a synonym is a closer match
 * to the search term than the canonical label (e.g. the synonym matches
 * exactly or as a prefix), use the synonym so hasLexicalSupport passes.
 * Otherwise return the canonical label.
 */
function pickBestLabel(primary: string, synonyms: string[], term: string): string {
  if (!primary) return synonyms[0] ?? '';
  if (synonyms.length === 0) return primary;
  const t = term.trim().toLowerCase();
  // If the primary label already matches well, keep it
  const primaryLower = primary.toLowerCase();
  if (primaryLower === t || primaryLower.startsWith(t) || primaryLower.includes(t)) {
    return primary;
  }
  // Check if any synonym is a closer match
  for (const syn of synonyms) {
    const synLower = syn.toLowerCase();
    if (synLower === t || synLower.startsWith(t) || t.startsWith(synLower)) {
      return syn;
    }
  }
  return primary;
}

/** Build the tier-3 OLS4 provider. */
export function createOls4Provider(ontologies?: string[]): ResolveProvider {
  return (term, limit, signal) => searchOls4(term, limit, signal, ontologies);
}
