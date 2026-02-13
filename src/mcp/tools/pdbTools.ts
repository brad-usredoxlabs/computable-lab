/**
 * MCP tools for RCSB Protein Data Bank: structure search and entry retrieval.
 *
 * Uses the RCSB PDB REST API: https://data.rcsb.org/
 * Search API: https://search.rcsb.org/
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonResult, errorResult } from '../helpers.js';

const PDB_DATA_BASE = 'https://data.rcsb.org/rest/v1';
const PDB_SEARCH_BASE = 'https://search.rcsb.org/rcsbsearch/v2';
const TIMEOUT_MS = 15_000;

function withTimeout(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

export function registerPdbTools(server: McpServer): void {
  // ── pdb_search ─────────────────────────────────────────────────
  server.tool(
    'pdb_search',
    'Search RCSB Protein Data Bank for macromolecular structures. Supports text queries for molecule names, authors, organisms, etc.',
    {
      query: z.string().describe('Search query (e.g., "insulin receptor", "hemoglobin Homo sapiens")'),
      limit: z.number().optional().describe('Maximum results (default 10, max 25)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);

        const searchBody = {
          query: {
            type: 'terminal',
            service: 'full_text',
            parameters: { value: args.query },
          },
          return_type: 'entry',
          request_options: {
            paginate: { start: 0, rows: limit },
            results_content_type: ['experimental'],
            sort: [{ sort_by: 'score', direction: 'desc' }],
          },
        };

        const res = await fetch(`${PDB_SEARCH_BASE}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchBody),
          signal,
        });

        if (!res.ok) {
          if (res.status === 204) return jsonResult({ results: [], total: 0 });
          return errorResult(`PDB search failed: HTTP ${res.status}`);
        }

        const json = (await res.json()) as {
          total_count?: number;
          result_set?: Array<{ identifier?: string; score?: number }>;
        };

        const ids = (json.result_set ?? []).map((r) => String(r.identifier ?? ''));
        if (ids.length === 0) {
          return jsonResult({ results: [], total: json.total_count ?? 0 });
        }

        // Fetch summaries for each PDB ID
        const summaries = await Promise.all(
          ids.map(async (pdbId) => {
            try {
              const entryRes = await fetch(`${PDB_DATA_BASE}/core/entry/${pdbId}`, { signal });
              if (!entryRes.ok) return { pdbId, title: '', method: '', resolution: null, organism: '', releaseDate: '' };
              const entry = (await entryRes.json()) as Record<string, unknown>;

              const struct = entry.struct as Record<string, unknown> | undefined;
              const exptl = Array.isArray(entry.exptl) ? (entry.exptl as Array<Record<string, unknown>>) : [];
              const refine = Array.isArray(entry.refine) ? (entry.refine as Array<Record<string, unknown>>) : [];
              const rcsb = entry.rcsb_entry_info as Record<string, unknown> | undefined;

              return {
                pdbId,
                title: String(struct?.title ?? ''),
                method: String(exptl[0]?.method ?? ''),
                resolution: refine[0]?.ls_d_res_high ?? rcsb?.resolution_combined?.[0 as keyof typeof rcsb.resolution_combined] ?? null,
                releaseDate: String(entry.rcsb_accession_info ? (entry.rcsb_accession_info as Record<string, unknown>).initial_release_date ?? '' : ''),
                url: `https://www.rcsb.org/structure/${pdbId}`,
              };
            } catch {
              return { pdbId, title: '(fetch error)', url: `https://www.rcsb.org/structure/${pdbId}` };
            }
          })
        );

        return jsonResult({ results: summaries, total: json.total_count ?? summaries.length });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('PDB search timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── pdb_fetch ──────────────────────────────────────────────────
  server.tool(
    'pdb_fetch',
    'Fetch detailed information about a PDB structure entry including title, method, resolution, polymer entities, and ligands.',
    {
      pdbId: z.string().describe('PDB ID (e.g., "1IGT", "4HHB", "6VXX")'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const pdbId = args.pdbId.toUpperCase();

        // Fetch core entry
        const entryRes = await fetch(`${PDB_DATA_BASE}/core/entry/${pdbId}`, { signal });
        if (!entryRes.ok) {
          if (entryRes.status === 404) return errorResult(`PDB entry not found: ${pdbId}`);
          return errorResult(`PDB fetch failed: HTTP ${entryRes.status}`);
        }
        const entry = (await entryRes.json()) as Record<string, unknown>;

        const struct = entry.struct as Record<string, unknown> | undefined;
        const exptl = Array.isArray(entry.exptl) ? (entry.exptl as Array<Record<string, unknown>>) : [];
        const refine = Array.isArray(entry.refine) ? (entry.refine as Array<Record<string, unknown>>) : [];
        const citation = Array.isArray(entry.citation) ? (entry.citation as Array<Record<string, unknown>>) : [];
        const primaryCitation = citation.find((c) => c.id === 'primary') ?? citation[0];

        // Fetch polymer entities
        const entitiesRes = await fetch(`${PDB_DATA_BASE}/core/polymer_entity/${pdbId}`, { signal });
        let entities: Array<Record<string, unknown>> = [];
        if (entitiesRes.ok) {
          const entityData = await entitiesRes.json();
          entities = Array.isArray(entityData) ? entityData : [];
        }

        const polymerEntities = entities.map((e) => {
          const entityPoly = e.entity_poly as Record<string, unknown> | undefined;
          const rcsbEntity = e.rcsb_polymer_entity as Record<string, unknown> | undefined;
          const srcOrg = Array.isArray(e.rcsb_entity_source_organism)
            ? (e.rcsb_entity_source_organism as Array<Record<string, unknown>>)
            : [];

          return {
            entityId: e.rcsb_id,
            description: String(rcsbEntity?.pdbx_description ?? ''),
            type: String(entityPoly?.type ?? ''),
            organism: String(srcOrg[0]?.ncbi_scientific_name ?? ''),
            length: entityPoly?.rcsb_sample_sequence_length ?? null,
          };
        });

        // Fetch ligands/nonpolymer entities
        const ligandRes = await fetch(`${PDB_DATA_BASE}/core/nonpolymer_entity/${pdbId}`, { signal });
        let ligands: Array<Record<string, unknown>> = [];
        if (ligandRes.ok) {
          const ligandData = await ligandRes.json();
          ligands = Array.isArray(ligandData) ? ligandData : [];
        }

        const nonpolymerEntities = ligands.map((l) => {
          const rcsbNp = l.rcsb_nonpolymer_entity as Record<string, unknown> | undefined;
          const compId = l.pdbx_entity_nonpoly as Record<string, unknown> | undefined;
          return {
            entityId: l.rcsb_id,
            description: String(rcsbNp?.pdbx_description ?? ''),
            compId: String(compId?.comp_id ?? ''),
          };
        });

        return jsonResult({
          pdbId,
          title: String(struct?.title ?? ''),
          method: String(exptl[0]?.method ?? ''),
          resolution: refine[0]?.ls_d_res_high ?? null,
          releaseDate: String(entry.rcsb_accession_info ? (entry.rcsb_accession_info as Record<string, unknown>).initial_release_date ?? '' : ''),
          primaryCitation: primaryCitation ? {
            title: String(primaryCitation.title ?? ''),
            journal: String(primaryCitation.journal_abbrev ?? ''),
            year: primaryCitation.year,
            doi: String(primaryCitation.pdbx_database_id_doi ?? ''),
          } : null,
          polymerEntities,
          ligands: nonpolymerEntities,
          url: `https://www.rcsb.org/structure/${pdbId}`,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('PDB fetch timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );
}
