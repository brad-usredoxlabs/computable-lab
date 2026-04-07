export interface OntologyMatch {
  id: string;
  label: string;
  namespace: string;
  ontology: string;
  uri?: string | undefined;
  description?: string | undefined;
  synonyms?: string[] | undefined;
  matchType: 'exact' | 'normalized' | 'search';
  score: number;
}

type FetchLike = typeof fetch;

const OLS4_BASE = 'https://www.ebi.ac.uk/ols4/api/search';
const OLS4_TIMEOUT_MS = 8_000;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function rankMatch(args: {
  query: string;
  ontologyIndex: number;
  doc: Record<string, unknown>;
}): OntologyMatch {
  const query = normalize(args.query);
  const label = typeof args.doc.label === 'string' ? args.doc.label : '';
  const normalizedLabel = normalize(label);
  const oboId = typeof args.doc.obo_id === 'string' ? args.doc.obo_id : '';
  const ontology = String(args.doc.ontology_name ?? args.doc.ontology_prefix ?? '').toLowerCase();
  const namespace = oboId.includes(':')
    ? oboId.split(':')[0]!.toUpperCase()
    : String(args.doc.ontology_prefix ?? ontology).toUpperCase();
  const description = Array.isArray(args.doc.description)
    ? (typeof args.doc.description[0] === 'string' ? args.doc.description[0] : undefined)
    : (typeof args.doc.description === 'string' ? args.doc.description : undefined);
  const synonyms = Array.isArray(args.doc.synonym)
    ? args.doc.synonym.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : Array.isArray(args.doc.synonyms)
      ? args.doc.synonyms.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined;
  const exact = normalizedLabel === query || normalize(oboId) === query;
  const score = exact
    ? 1 - args.ontologyIndex * 0.01
    : Math.max(0.4, 0.85 - args.ontologyIndex * 0.05 - Math.min(Math.abs(normalizedLabel.length - query.length) / 100, 0.2));

  return {
    id: oboId || String(args.doc.iri ?? ''),
    label: label || oboId || 'Ontology term',
    namespace,
    ontology,
    ...(typeof args.doc.iri === 'string' && args.doc.iri ? { uri: args.doc.iri } : {}),
    ...(description ? { description } : {}),
    ...(synonyms && synonyms.length > 0 ? { synonyms: synonyms.slice(0, 12) } : {}),
    matchType: exact ? 'exact' : normalizedLabel.includes(query) || query.includes(normalizedLabel) ? 'normalized' : 'search',
    score,
  };
}

export class OntologyMatchService {
  private readonly cache = new Map<string, OntologyMatch[]>();

  constructor(private readonly fetchFn: FetchLike = globalThis.fetch as FetchLike) {}

  async findMatches(name: string, ontologyPreferences: string[]): Promise<OntologyMatch[]> {
    const query = name.trim();
    if (query.length < 2 || ontologyPreferences.length === 0) return [];
    const normalizedPreferences = ontologyPreferences
      .map((value) => value.trim().toLowerCase())
      .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
    if (normalizedPreferences.length === 0) return [];

    const cacheKey = `${normalize(query)}::${normalizedPreferences.join(',')}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const exactResults = await this.search(query, normalizedPreferences, true);
    if (exactResults.length > 0) {
      this.cache.set(cacheKey, exactResults);
      return exactResults;
    }

    const broadResults = await this.search(query, normalizedPreferences, false);
    this.cache.set(cacheKey, broadResults);
    return broadResults;
  }

  private async search(query: string, ontologyPreferences: string[], exact: boolean): Promise<OntologyMatch[]> {
    const params = new URLSearchParams({
      q: query,
      rows: '12',
      format: 'json',
      ontology: ontologyPreferences.join(','),
    });
    if (exact) params.set('exact', 'true');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLS4_TIMEOUT_MS);
    try {
      const response = await this.fetchFn(`${OLS4_BASE}?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) return [];
      const json = await response.json() as {
        response?: {
          docs?: Array<Record<string, unknown>>;
        };
      };
      const docs = json.response?.docs ?? [];
      const ranked = docs
        .map((doc) => rankMatch({
          query,
          ontologyIndex: Math.max(0, ontologyPreferences.indexOf(String(doc.ontology_name ?? doc.ontology_prefix ?? '').toLowerCase())),
          doc,
        }))
        .filter((match) => match.id)
        .sort((left, right) => right.score - left.score)
        .filter((match, index, list) => list.findIndex((candidate) => candidate.id === match.id) === index)
        .slice(0, 5);
      return ranked;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}
