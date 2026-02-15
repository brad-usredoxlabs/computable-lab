/**
 * MCP tools for Reactome: pathway search, pathway detail, and reaction retrieval.
 *
 * Uses the Reactome Content Service API: https://reactome.org/ContentService/
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

const REACTOME_BASE = 'https://reactome.org/ContentService';
const TIMEOUT_MS = 15_000;

function withTimeout(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

export function registerReactomeTools(server: McpServer, registry?: ToolRegistry): void {
  // ── reactome_search ────────────────────────────────────────────
  dualRegister(server, registry,
    'reactome_search',
    'Search Reactome for pathways, reactions, and biological processes. Returns stable identifiers, names, species, and summaries.',
    {
      query: z.string().describe('Search query (e.g., "apoptosis", "insulin signaling", "IL-6")'),
      species: z.string().optional().describe('Filter by species (e.g., "Homo sapiens", default: all)'),
      types: z.string().optional().describe('Comma-separated types to search: Pathway, Reaction, Complex, Protein (default: all)'),
      limit: z.number().optional().describe('Maximum results (default 10, max 25)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);

        const params = new URLSearchParams({
          query: args.query,
          cluster: 'true',
        });
        if (args.species) params.set('species', args.species);
        if (args.types) {
          for (const t of args.types.split(',')) {
            params.append('types', t.trim());
          }
        }

        const res = await fetch(`${REACTOME_BASE}/search/query?${params}`, {
          headers: { Accept: 'application/json' },
          signal,
        });

        if (!res.ok) return errorResult(`Reactome search failed: HTTP ${res.status}`);

        const json = (await res.json()) as {
          results?: Array<{
            typeName?: string;
            entries?: Array<Record<string, unknown>>;
          }>;
          found?: number;
        };

        const allEntries: Array<Record<string, unknown>> = [];
        for (const group of json.results ?? []) {
          for (const entry of group.entries ?? []) {
            allEntries.push({
              ...entry,
              typeName: group.typeName,
            });
          }
        }

        const results = allEntries.slice(0, limit).map((entry) => ({
          stId: String(entry.stId ?? ''),
          name: String(entry.name ?? ''),
          type: String(entry.typeName ?? entry.exactType ?? ''),
          species: String(entry.species ?? ''),
          summation: String(entry.summation ?? ''),
          compartment: entry.compartmentNames ?? [],
          url: `https://reactome.org/content/detail/${entry.stId}`,
        }));

        return jsonResult({ results, total: json.found ?? results.length });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('Reactome search timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── reactome_pathway ───────────────────────────────────────────
  dualRegister(server, registry,
    'reactome_pathway',
    'Fetch details of a Reactome pathway including sub-events (reactions/sub-pathways), participants, and literature references.',
    {
      stId: z.string().describe('Reactome stable identifier (e.g., "R-HSA-449147" for Signaling by Interleukins)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        // Fetch pathway detail
        const res = await fetch(`${REACTOME_BASE}/data/query/${args.stId}`, {
          headers: { Accept: 'application/json' },
          signal,
        });
        if (!res.ok) {
          if (res.status === 404) return errorResult(`Reactome entry not found: ${args.stId}`);
          return errorResult(`Reactome fetch failed: HTTP ${res.status}`);
        }

        const pathway = (await res.json()) as Record<string, unknown>;

        // Extract sub-events (contained pathways/reactions)
        const hasEvent = Array.isArray(pathway.hasEvent) ? (pathway.hasEvent as Array<Record<string, unknown>>) : [];
        const subEvents = hasEvent.map((e) => ({
          stId: String(e.stId ?? ''),
          name: String(e.displayName ?? ''),
          type: String(e.schemaClass ?? ''),
        }));

        // Extract literature references
        const litRefs = Array.isArray(pathway.literatureReference) ? (pathway.literatureReference as Array<Record<string, unknown>>) : [];
        const references = litRefs.map((ref) => ({
          title: String(ref.title ?? ''),
          pubmedId: ref.pubMedIdentifier ?? null,
          journal: String(ref.journal ?? ''),
          year: ref.year ?? null,
        }));

        // Extract summation
        const summations = Array.isArray(pathway.summation) ? (pathway.summation as Array<Record<string, unknown>>) : [];
        const summaryText = summations.map((s) => String(s.text ?? '')).join('\n\n');

        // Extract species
        const speciesList = Array.isArray(pathway.species) ? (pathway.species as Array<Record<string, unknown>>) : [];
        const species = speciesList.map((s) => String(s.displayName ?? '')).filter(Boolean);

        // Extract compartments
        const compartments = Array.isArray(pathway.compartment) ? (pathway.compartment as Array<Record<string, unknown>>) : [];
        const compartmentNames = compartments.map((c) => String(c.displayName ?? '')).filter(Boolean);

        return jsonResult({
          stId: String(pathway.stId ?? args.stId),
          name: String(pathway.displayName ?? ''),
          type: String(pathway.schemaClass ?? ''),
          species,
          compartments: compartmentNames,
          summation: summaryText || null,
          subEvents,
          references: references.slice(0, 20),
          url: `https://reactome.org/content/detail/${args.stId}`,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('Reactome pathway fetch timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── reactome_participants ──────────────────────────────────────
  dualRegister(server, registry,
    'reactome_participants',
    'Get physical entity participants of a Reactome event (pathway or reaction). Returns inputs, outputs, catalysts, and regulators.',
    {
      stId: z.string().describe('Reactome stable identifier for an event (e.g., "R-HSA-449147")'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const res = await fetch(`${REACTOME_BASE}/data/participants/${args.stId}`, {
          headers: { Accept: 'application/json' },
          signal,
        });
        if (!res.ok) {
          if (res.status === 404) return errorResult(`Reactome entry not found: ${args.stId}`);
          return errorResult(`Reactome participants fetch failed: HTTP ${res.status}`);
        }

        const data = (await res.json()) as Array<Record<string, unknown>>;

        const participants = data.map((p) => {
          const entities = Array.isArray(p.refEntities) ? (p.refEntities as Array<Record<string, unknown>>) : [];
          return {
            peStId: String(p.peStId ?? ''),
            displayName: String(p.displayName ?? ''),
            type: String(p.schemaClass ?? ''),
            refEntities: entities.map((e) => ({
              dbId: e.dbId,
              name: String(e.displayName ?? ''),
              identifier: String(e.identifier ?? ''),
              database: String(e.databaseName ?? ''),
              url: String(e.url ?? ''),
            })),
          };
        });

        return jsonResult({ stId: args.stId, participants });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('Reactome participants fetch timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );
}
