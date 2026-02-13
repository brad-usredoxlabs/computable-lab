/**
 * MCP tool for searching external ontologies via EBI OLS4.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonResult, errorResult } from '../helpers.js';

const OLS4_BASE = 'https://www.ebi.ac.uk/ols4/api/search';
const OLS4_TIMEOUT_MS = 8_000;

export function registerOntologyTools(server: McpServer): void {
  server.tool(
    'ontology_search',
    'Search external ontologies (EBI OLS4) for terms. Returns matching terms with CURIEs, labels, and descriptions.',
    {
      query: z.string().describe('Search query (minimum 2 characters)'),
      ontologies: z.string().optional().describe('Comma-separated ontology prefixes to search (e.g., "chebi,efo")'),
      limit: z.number().optional().describe('Maximum results (default 10, max 50)'),
    },
    async (args) => {
      try {
        if (args.query.trim().length < 2) {
          return errorResult('Query must be at least 2 characters');
        }

        const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
        const params = new URLSearchParams({
          q: args.query,
          rows: String(limit),
          format: 'json',
        });
        if (args.ontologies) {
          params.set('ontology', args.ontologies);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OLS4_TIMEOUT_MS);

        try {
          const res = await fetch(`${OLS4_BASE}?${params.toString()}`, {
            signal: controller.signal,
          });

          if (!res.ok) {
            return errorResult(`OLS4 returned HTTP ${res.status}`);
          }

          const json = (await res.json()) as {
            response?: {
              numFound?: number;
              docs?: Array<Record<string, unknown>>;
            };
          };

          const docs = json.response?.docs ?? [];
          const total = json.response?.numFound ?? docs.length;

          const results = docs.map((doc) => {
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
                Array.isArray(doc.description) ? doc.description[0] ?? '' : doc.description ?? ''
              ),
            };
          });

          return jsonResult({ results, total });
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('OLS4 search timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
