/**
 * OntologyHandlers — HTTP handler for proxying OLS4 ontology search.
 *
 * Provides a single GET endpoint that forwards queries to the EBI OLS4 API,
 * normalises the response into a compact CURIE-based format, and maps
 * upstream errors to appropriate HTTP status codes.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ApiError } from '../types.js';

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
}

const OLS4_BASE = 'https://www.ebi.ac.uk/ols4/api/search';
const OLS4_TIMEOUT_MS = 8_000;

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

      const params = new URLSearchParams({
        q,
        rows: String(limit),
        format: 'json',
      });
      if (ontologies) {
        params.set('ontology', ontologies);
      }

      const url = `${OLS4_BASE}?${params.toString()}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OLS4_TIMEOUT_MS);

      try {
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          reply.status(502);
          return {
            error: 'BAD_GATEWAY',
            message: `OLS4 returned HTTP ${res.status}`,
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

        return { results, total };
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          reply.status(504);
          return {
            error: 'GATEWAY_TIMEOUT',
            message: 'OLS4 search timed out.',
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        reply.status(502);
        return {
          error: 'BAD_GATEWAY',
          message: `OLS4 search failed: ${message}`,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type OntologyHandlers = ReturnType<typeof createOntologyHandlers>;
