/**
 * OntologyHandlers — HTTP handler for ontology search.
 *
 * Answers on ONE surface from two providers: the in-house `local-obo` rows of
 * config/ontology-sources.yaml (parsed OBO snapshots) and the remote EBI OLS4
 * index. Local hits are additive and concatenated first; OLS4 keeps its
 * request shape, timeout and error text unchanged.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ApiError } from '../types.js';
import { searchLocalObo } from '../../resolve/providers/localObo.js';
import type { LocalOboSearchReport } from '../../resolve/providers/localObo.js';
import type { ProviderHit } from '../../resolve/types.js';

/**
 * Normalised ontology search result returned to the client.
 */
export interface OntologySearchResult {
  id: string;          // CURIE, e.g. "CHEBI:16236"
  label: string;
  namespace: string;   // ontology prefix, e.g. "chebi"
  uri: string;         // full IRI
  ontology: string;    // source ontology key
  description: string;
}

export interface OntologySearchResponse {
  results: OntologySearchResult[];
  total: number;
  /** Named per-source load failures; absent when every source loaded. */
  errors?: string[];
}

const OLS4_BASE = 'https://www.ebi.ac.uk/ols4/api/search';
const OLS4_TIMEOUT_MS = 8_000;

type Ols4Outcome =
  | { ok: true; results: OntologySearchResult[]; total: number }
  | { ok: false; status: number; body: ApiError };

/** One OLS4 query, normalised; resolves to an outcome rather than throwing. */
async function fetchOls4(q: string, ontologies: string, limit: number): Promise<Ols4Outcome> {
  const params = new URLSearchParams({ q, rows: String(limit), format: 'json' });
  if (ontologies) {
    params.set('ontology', ontologies);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLS4_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLS4_BASE}?${params.toString()}`, { signal: controller.signal });

    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        body: { error: 'BAD_GATEWAY', message: `OLS4 returned HTTP ${res.status}` },
      };
    }

    const json = (await res.json()) as {
      response?: {
        numFound?: number;
        docs?: Array<Record<string, unknown>>;
      };
    };

    const docs = json.response?.docs ?? [];
    const total = json.response?.numFound ?? docs.length;

    const results: OntologySearchResult[] = docs.map((doc) => {
      const oboId = String(doc.obo_id ?? '');
      const iri = String(doc.iri ?? '');
      const ontKey = String(doc.ontology_name ?? doc.ontology_prefix ?? '').toLowerCase();

      return {
        id: oboId || iri,
        label: String(doc.label ?? ''),
        namespace: ontKey,
        uri: iri,
        ontology: ontKey,
        description: String(
          Array.isArray(doc.description) ? doc.description[0] ?? '' : doc.description ?? '',
        ),
      };
    });

    return { ok: true, results, total };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, status: 504, body: { error: 'GATEWAY_TIMEOUT', message: 'OLS4 search timed out.' } };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 502,
      body: { error: 'BAD_GATEWAY', message: `OLS4 search failed: ${message}` },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Map an in-house provider hit onto the shared result shape. */
function localToResult(hit: ProviderHit): OntologySearchResult {
  const namespace = hit.namespace ?? '';
  return {
    id: hit.curie,
    label: hit.label,
    namespace,
    uri: hit.uri ?? '',
    ontology: namespace.toLowerCase(),
    description: hit.definition ?? '',
  };
}

/**
 * Create ontology handlers (no dependencies required).
 */
export function createOntologyHandlers() {
  return {
    /**
     * GET /ontology/search?q=...&ontologies=...&limit=...
     */
    async searchOntology(
      request: FastifyRequest<{
        Querystring: {
          q?: string;
          ontologies?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<OntologySearchResponse | ApiError> {
      const q = (request.query.q || '').trim();

      if (q.length < 2) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'Query parameter "q" must be at least 2 characters.',
        };
      }

      const ontologies = (request.query.ontologies || '').trim();
      const limit = Math.min(Math.max(Number(request.query.limit) || 10, 1), 50);
      const localOntologies = ontologies
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

      // Both providers run concurrently; a local registry read failure is
      // reported, never allowed to reject the pair and empty the result set.
      const [local, remote] = await Promise.all([
        searchLocalObo(q, limit, { ontologies: localOntologies }).catch(
          (err: unknown): LocalOboSearchReport => ({
            hits: [],
            sources: [],
            failures: [
              { source: 'local-obo', error: err instanceof Error ? err.message : String(err) },
            ],
          }),
        ),
        fetchOls4(q, ontologies, limit),
      ]);

      const localResults = local.hits.map(localToResult);
      const errors = local.failures.map(
        (f) => `local-obo source "${f.source}" failed to load: ${f.error}`,
      );

      if (!remote.ok) {
        if (localResults.length === 0) {
          reply.status(remote.status);
          return {
            ...remote.body,
            ...(errors.length > 0 ? { details: { sourceErrors: errors } } : {}),
          };
        }
        errors.push(remote.body.message);
        return {
          results: localResults,
          total: localResults.length,
          ...(errors.length > 0 ? { errors } : {}),
        };
      }

      const results = [...localResults, ...remote.results].slice(0, limit);
      return {
        results,
        total: remote.total + localResults.length,
        ...(errors.length > 0 ? { errors } : {}),
      };
    },
  };
}

export type OntologyHandlers = ReturnType<typeof createOntologyHandlers>;
