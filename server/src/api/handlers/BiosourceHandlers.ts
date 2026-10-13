/**
 * REST proxy handlers for bio-source search & fetch.
 *
 * These thin handlers call ToolRegistry tools directly, avoiding
 * AI inference costs for deterministic search/fetch operations.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';

// ============================================================================
// Source → tool mapping
// ============================================================================

interface SourceMapping {
  searchTool: string;
  fetchTool?: string;
  /** Name of the fetch argument that receives the source ID. */
  fetchIdArg?: string;
  /**
   * Extra fetch arguments declared as DATA in the map (never special-cased in
   * the fetch branch). Needed because the fetch tool's db vocabulary differs
   * from the search tool's internal Entrez db: ncbi_sequence_fetch takes
   * 'nucleotide' | 'protein' while the search runs on 'nuccore' | 'protein'.
   */
  fetchArgs?: Record<string, string>;
}

const SOURCE_MAP: Record<string, SourceMapping> = {
  pubmed:     { searchTool: 'pubmed_search',     fetchTool: 'pubmed_fetch',     fetchIdArg: 'pmid' },
  europepmc:  { searchTool: 'europepmc_search' },
  uniprot:    { searchTool: 'uniprot_search',    fetchTool: 'uniprot_fetch',    fetchIdArg: 'accession' },
  pdb:        { searchTool: 'pdb_search',        fetchTool: 'pdb_fetch',        fetchIdArg: 'pdbId' },
  chebi:      { searchTool: 'chebi_search',      fetchTool: 'chebi_fetch',      fetchIdArg: 'chebiId' },
  reactome:   { searchTool: 'reactome_search',   fetchTool: 'reactome_pathway', fetchIdArg: 'stId' },
  ncbi_gene:  { searchTool: 'ncbi_gene_search' },
  ncbi_nucleotide: { searchTool: 'ncbi_nucleotide_search', fetchTool: 'ncbi_sequence_fetch', fetchIdArg: 'accession', fetchArgs: { db: 'nucleotide' } },
  ncbi_protein:    { searchTool: 'ncbi_protein_search',    fetchTool: 'ncbi_sequence_fetch', fetchIdArg: 'accession', fetchArgs: { db: 'protein' } },
};

const VALID_SOURCES = Object.keys(SOURCE_MAP);

// ============================================================================
// Handler interface
// ============================================================================

export interface BiosourceHandlers {
  search(
    request: FastifyRequest<{ Params: { source: string }; Querystring: { q?: string; limit?: string; organism?: string; canonicalOnly?: string } }>,
    reply: FastifyReply,
  ): Promise<unknown>;

  fetch(
    request: FastifyRequest<{ Params: { source: string }; Querystring: { id?: string } }>,
    reply: FastifyReply,
  ): Promise<unknown>;
}

// ============================================================================
// Factory
// ============================================================================

export function createBiosourceHandlers(toolRegistry: ToolRegistry): BiosourceHandlers {
  return {
    async search(request, reply) {
      const { source } = request.params;
      const { q, limit, organism, canonicalOnly } = request.query;

      if (!q || typeof q !== 'string' || q.trim().length === 0) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'q (query) is required' };
      }

      const mapping = SOURCE_MAP[source];
      if (!mapping) {
        reply.status(400);
        return {
          error: 'INVALID_SOURCE',
          message: `Unknown source "${source}". Valid: ${VALID_SOURCES.join(', ')}`,
        };
      }

      const entry = toolRegistry.get(mapping.searchTool);
      if (!entry) {
        reply.status(503);
        return { error: 'TOOL_UNAVAILABLE', message: `Tool ${mapping.searchTool} is not registered` };
      }

      try {
        const args: Record<string, unknown> = { query: q };
        if (limit) {
          const n = parseInt(limit, 10);
          if (!Number.isNaN(n) && n > 0) args.limit = n;
        }
        // exactOptionalPropertyTypes: keys are ABSENT when not supplied, never undefined.
        if (typeof organism === 'string' && organism.trim().length > 0) {
          args.organism = organism.trim();
        }
        if (canonicalOnly === 'true') {
          args.canonicalOnly = true;
        }

        const result = await entry.handler(args);
        const text = result.content
          .map((c) => ('text' in c ? c.text : ''))
          .join('\n');

        if (result.isError) {
          reply.status(502);
          return { error: 'UPSTREAM_ERROR', message: text };
        }

        // Try to return parsed JSON; fall back to raw text wrapper
        try {
          return JSON.parse(text);
        } catch {
          return { raw: text };
        }
      } catch (err) {
        request.log.error(err, `Biosource search failed: ${source}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async fetch(request, reply) {
      const { source } = request.params;
      const { id } = request.query;

      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'id is required' };
      }

      const mapping = SOURCE_MAP[source];
      if (!mapping) {
        reply.status(400);
        return {
          error: 'INVALID_SOURCE',
          message: `Unknown source "${source}". Valid: ${VALID_SOURCES.join(', ')}`,
        };
      }

      if (!mapping.fetchTool) {
        reply.status(400);
        return {
          error: 'FETCH_NOT_SUPPORTED',
          message: `Source "${source}" does not support fetch (search-only)`,
        };
      }

      const entry = toolRegistry.get(mapping.fetchTool);
      if (!entry) {
        reply.status(503);
        return { error: 'TOOL_UNAVAILABLE', message: `Tool ${mapping.fetchTool} is not registered` };
      }

      try {
        // fetchArgs are data declared in SOURCE_MAP (e.g. {db:'nucleotide'}) —
        // the fetch branch must not special-case a source's db in TypeScript.
        const args: Record<string, unknown> = { ...(mapping.fetchArgs ?? {}) };
        args[mapping.fetchIdArg!] = id;

        const result = await entry.handler(args);
        const text = result.content
          .map((c) => ('text' in c ? c.text : ''))
          .join('\n');

        if (result.isError) {
          reply.status(502);
          return { error: 'UPSTREAM_ERROR', message: text };
        }

        try {
          return JSON.parse(text);
        } catch {
          return { raw: text };
        }
      } catch (err) {
        request.log.error(err, `Biosource fetch failed: ${source}/${id}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
