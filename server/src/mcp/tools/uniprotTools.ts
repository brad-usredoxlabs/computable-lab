/**
 * MCP tools for UniProt: protein search and entry retrieval.
 *
 * Uses the UniProt REST API (2022+): https://rest.uniprot.org/
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

const UNIPROT_BASE = 'https://rest.uniprot.org';
const TIMEOUT_MS = 15_000;

function withTimeout(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

export function registerUniprotTools(server: McpServer, registry?: ToolRegistry): void {
  // ── uniprot_search ─────────────────────────────────────────────
  dualRegister(server, registry,
    'uniprot_search',
    'Search UniProt for proteins by name, gene, organism, or keyword. Returns accessions, protein names, gene names, organisms, and functions.',
    {
      query: z.string().describe('UniProt query (e.g., "IL6 AND organism_id:9606", "insulin receptor")'),
      reviewed: z.boolean().optional().describe('If true, restrict to Swiss-Prot (reviewed) entries only'),
      limit: z.number().optional().describe('Maximum results (default 10, max 25)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
        let query = args.query;
        if (args.reviewed === true) {
          query += ' AND reviewed:true';
        }

        const params = new URLSearchParams({
          query,
          size: String(limit),
          format: 'json',
          fields: 'accession,id,protein_name,gene_names,organism_name,organism_id,length,cc_function,go_id,xref_pdb',
        });

        const res = await fetch(`${UNIPROT_BASE}/uniprotkb/search?${params}`, { signal });
        if (!res.ok) return errorResult(`UniProt search failed: HTTP ${res.status}`);

        const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
        const entries = json.results ?? [];

        const results = entries.map((entry) => {
          const proteinName = entry.proteinDescription as Record<string, unknown> | undefined;
          const recommendedName = proteinName?.recommendedName as Record<string, unknown> | undefined;
          const fullName = recommendedName?.fullName as { value?: string } | undefined;

          const genes = Array.isArray(entry.genes) ? (entry.genes as Array<Record<string, unknown>>) : [];
          const primaryGene = genes[0]?.geneName as { value?: string } | undefined;

          const organism = entry.organism as Record<string, unknown> | undefined;

          const comments = Array.isArray(entry.comments) ? (entry.comments as Array<Record<string, unknown>>) : [];
          const functionComment = comments.find((c) => c.commentType === 'FUNCTION');
          const functionTexts = Array.isArray(functionComment?.texts)
            ? (functionComment!.texts as Array<{ value?: string }>).map((t) => t.value ?? '').join(' ')
            : '';

          return {
            accession: String(entry.primaryAccession ?? ''),
            entryId: String(entry.uniProtkbId ?? ''),
            proteinName: fullName?.value ?? '',
            geneName: primaryGene?.value ?? '',
            organism: String(organism?.scientificName ?? ''),
            taxId: organism?.taxonId ?? null,
            length: entry.sequence ? (entry.sequence as Record<string, unknown>).length : null,
            function: functionTexts || null,
            url: `https://www.uniprot.org/uniprotkb/${entry.primaryAccession}/entry`,
          };
        });

        return jsonResult({ results, total: results.length });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('UniProt search timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── uniprot_fetch ──────────────────────────────────────────────
  dualRegister(server, registry,
    'uniprot_fetch',
    'Fetch a UniProt protein entry by accession. Returns full protein details including function, GO terms, cross-references, and sequence. With asRecord=true, returns a sequence.schema.yaml-compliant payload ready for record_create.',
    {
      accession: z.string().describe('UniProt accession (e.g., "P05231", "Q9Y6K9")'),
      includeSequence: z.boolean().optional().describe('Include amino acid sequence (default false, forced true when asRecord=true)'),
      asRecord: z.boolean().optional().describe('If true, return a sequence.schema.yaml-compliant payload for record_create'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const res = await fetch(`${UNIPROT_BASE}/uniprotkb/${args.accession}.json`, { signal });
        if (!res.ok) {
          if (res.status === 404) return errorResult(`UniProt entry not found: ${args.accession}`);
          return errorResult(`UniProt fetch failed: HTTP ${res.status}`);
        }

        const entry = (await res.json()) as Record<string, unknown>;

        // Extract protein name
        const proteinDesc = entry.proteinDescription as Record<string, unknown> | undefined;
        const recName = proteinDesc?.recommendedName as Record<string, unknown> | undefined;
        const fullName = recName?.fullName as { value?: string } | undefined;

        // Extract genes
        const genes = Array.isArray(entry.genes) ? (entry.genes as Array<Record<string, unknown>>) : [];
        const geneNames = genes.map((g) => {
          const primary = g.geneName as { value?: string } | undefined;
          return primary?.value ?? '';
        }).filter(Boolean);

        // Extract organism
        const organism = entry.organism as Record<string, unknown> | undefined;

        // Extract function
        const comments = Array.isArray(entry.comments) ? (entry.comments as Array<Record<string, unknown>>) : [];
        const functionComment = comments.find((c) => c.commentType === 'FUNCTION');
        const functionText = Array.isArray(functionComment?.texts)
          ? (functionComment!.texts as Array<{ value?: string }>).map((t) => t.value ?? '').join(' ')
          : '';

        // Extract subcellular location
        const locComment = comments.find((c) => c.commentType === 'SUBCELLULAR LOCATION');
        const locations = locComment?.subcellularLocations as Array<{ location?: { value?: string } }> | undefined;
        const subcellularLocations = locations?.map((l) => l.location?.value ?? '').filter(Boolean) ?? [];

        // Extract GO terms from cross-references
        const dbRefs = Array.isArray(entry.uniProtKBCrossReferences)
          ? (entry.uniProtKBCrossReferences as Array<Record<string, unknown>>)
          : [];
        const goTerms = dbRefs
          .filter((r) => r.database === 'GO')
          .map((r) => {
            const props = Array.isArray(r.properties) ? (r.properties as Array<{ key?: string; value?: string }>) : [];
            const term = props.find((p) => p.key === 'GoTerm')?.value ?? '';
            return { id: String(r.id ?? ''), term };
          });

        // Extract PDB cross-references
        const pdbRefs = dbRefs
          .filter((r) => r.database === 'PDB')
          .map((r) => String(r.id ?? ''));

        // Sequence
        const seq = entry.sequence as Record<string, unknown> | undefined;
        const residues = seq ? String(seq.value ?? '') : '';
        const seqLength = seq?.length as number | undefined;

        // ── asRecord mode: return sequence.schema.yaml payload ──
        if (args.asRecord === true) {
          if (!residues) {
            return errorResult(`No sequence available for ${args.accession}`);
          }

          const proteinName = fullName?.value ?? args.accession;
          const organismName = String(organism?.scientificName ?? '');
          const description = [proteinName, organismName, functionText].filter(Boolean).join(' — ');

          const record: Record<string, unknown> = {
            kind: 'sequence',
            id: `SEQ-${args.accession}`,
            label: geneNames.length > 0 ? `${geneNames[0]}_${organismName.split(' ').map(w => w[0]).join('')}` : proteinName,
            description: description.slice(0, 500),
            alphabet: 'protein',
            residues,
            length: seqLength ?? residues.length,
            identifiers: [
              {
                system: 'uniprot',
                value: args.accession,
                url: `https://www.uniprot.org/uniprotkb/${args.accession}/entry`,
              },
            ],
          };

          // Add PDB cross-refs as additional identifiers
          if (pdbRefs.length > 0) {
            (record.identifiers as Array<Record<string, unknown>>).push(
              ...pdbRefs.slice(0, 5).map((pdb) => ({
                system: 'pdb',
                value: pdb,
                url: `https://www.rcsb.org/structure/${pdb}`,
              }))
            );
          }

          return jsonResult({
            record,
            schemaId: 'bio/sequence',
            _hint: 'Pass record as payload and schemaId to record_create',
          });
        }

        // ── Standard mode: return full UniProt entry details ──
        const result: Record<string, unknown> = {
          accession: String(entry.primaryAccession ?? ''),
          entryId: String(entry.uniProtkbId ?? ''),
          proteinName: fullName?.value ?? '',
          geneNames,
          organism: String(organism?.scientificName ?? ''),
          taxId: organism?.taxonId ?? null,
          function: functionText || null,
          subcellularLocations,
          goTerms: goTerms.slice(0, 30),
          pdbStructures: pdbRefs,
          sequenceLength: seqLength ?? null,
          url: `https://www.uniprot.org/uniprotkb/${args.accession}/entry`,
        };

        if (args.includeSequence === true && residues) {
          result.sequence = residues;
        }

        return jsonResult(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('UniProt fetch timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );
}
