/**
 * MCP tools for small molecule databases: ChEBI and PubChem.
 *
 * ChEBI (EMBL-EBI): https://www.ebi.ac.uk/chebi/
 * PubChem (NCBI): https://pubchem.ncbi.nlm.nih.gov/rest/pug/
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonResult, errorResult } from '../helpers.js';

const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const TIMEOUT_MS = 15_000;

function withTimeout(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

export function registerChemTools(server: McpServer): void {
  // ── chebi_search ───────────────────────────────────────────────
  server.tool(
    'chebi_search',
    'Search ChEBI for small molecules, metabolites, and chemical entities by name or identifier. Returns ChEBI IDs, names, formulas, and InChI keys.',
    {
      query: z.string().describe('Search query (compound name, synonym, or ChEBI ID like "CHEBI:16236")'),
      limit: z.number().optional().describe('Maximum results (default 10, max 25)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);

        // Use the OLS4 API to search ChEBI (more reliable than ChEBI's SOAP API)
        const params = new URLSearchParams({
          q: args.query,
          ontology: 'chebi',
          rows: String(limit),
          format: 'json',
        });

        const res = await fetch(`https://www.ebi.ac.uk/ols4/api/search?${params}`, { signal });
        if (!res.ok) return errorResult(`ChEBI search failed: HTTP ${res.status}`);

        const json = (await res.json()) as {
          response?: { numFound?: number; docs?: Array<Record<string, unknown>> };
        };

        const docs = json.response?.docs ?? [];
        const results = docs.map((doc) => ({
          chebiId: String(doc.obo_id ?? ''),
          name: String(doc.label ?? ''),
          description: String(
            Array.isArray(doc.description) ? doc.description[0] ?? '' : doc.description ?? ''
          ),
          uri: String(doc.iri ?? ''),
          url: doc.obo_id ? `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${doc.obo_id}` : '',
        }));

        return jsonResult({ results, total: json.response?.numFound ?? results.length });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('ChEBI search timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── chebi_fetch ────────────────────────────────────────────────
  server.tool(
    'chebi_fetch',
    'Fetch detailed information about a ChEBI compound by ID, including formula, mass, synonyms, and cross-references.',
    {
      chebiId: z.string().describe('ChEBI ID (e.g., "CHEBI:16236" or just "16236")'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        // Normalize ID
        const numericId = args.chebiId.replace(/^CHEBI:/i, '');
        const chebiId = `CHEBI:${numericId}`;

        // Use ChEBI REST-like endpoint via OLS4 for term details
        const encodedIri = encodeURIComponent(`http://purl.obolibrary.org/obo/CHEBI_${numericId}`);
        const res = await fetch(
          `https://www.ebi.ac.uk/ols4/api/ontologies/chebi/terms/${encodedIri}`,
          { signal }
        );

        if (!res.ok) {
          if (res.status === 404) return errorResult(`ChEBI entry not found: ${chebiId}`);
          return errorResult(`ChEBI fetch failed: HTTP ${res.status}`);
        }

        const term = (await res.json()) as Record<string, unknown>;

        const synonyms = Array.isArray(term.synonyms) ? (term.synonyms as string[]) : [];
        const annotation = term.annotation as Record<string, unknown> | undefined;

        // Extract chemical properties from annotations if available
        const formula = annotation?.formula as string[] | undefined;
        const mass = annotation?.monoisotopicmass as string[] | undefined;
        const inchikey = annotation?.inchikey as string[] | undefined;
        const inchi = annotation?.inchi as string[] | undefined;
        const smiles = annotation?.smiles as string[] | undefined;

        return jsonResult({
          chebiId,
          name: String(term.label ?? ''),
          description: String(
            Array.isArray(term.description) ? term.description[0] ?? '' : term.description ?? ''
          ),
          synonyms: synonyms.slice(0, 20),
          formula: formula?.[0] ?? null,
          monoisotopicMass: mass?.[0] ?? null,
          inchiKey: inchikey?.[0] ?? null,
          inchi: inchi?.[0] ?? null,
          smiles: smiles?.[0] ?? null,
          uri: String(term.iri ?? ''),
          url: `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${chebiId}`,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('ChEBI fetch timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── pubchem_search ─────────────────────────────────────────────
  server.tool(
    'pubchem_search',
    'Search PubChem for compounds by name, SMILES, InChI, or formula. Returns CIDs, names, formulas, molecular weights, and canonical SMILES.',
    {
      query: z.string().describe('Compound name, SMILES, InChI, or molecular formula'),
      searchType: z.enum(['name', 'smiles', 'inchi', 'formula']).optional().describe('Search type (default: "name")'),
      limit: z.number().optional().describe('Maximum results (default 10, max 25)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
        const searchType = args.searchType ?? 'name';

        // Step 1: Search for CIDs
        let searchUrl: string;
        if (searchType === 'name') {
          searchUrl = `${PUBCHEM_BASE}/compound/name/${encodeURIComponent(args.query)}/cids/JSON`;
        } else if (searchType === 'smiles') {
          searchUrl = `${PUBCHEM_BASE}/compound/smiles/${encodeURIComponent(args.query)}/cids/JSON`;
        } else if (searchType === 'inchi') {
          searchUrl = `${PUBCHEM_BASE}/compound/inchi/cids/JSON`;
        } else {
          searchUrl = `${PUBCHEM_BASE}/compound/fastformula/${encodeURIComponent(args.query)}/cids/JSON`;
        }

        let cids: number[];
        if (searchType === 'inchi') {
          // InChI must be POSTed
          const res = await fetch(searchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `inchi=${encodeURIComponent(args.query)}`,
            signal,
          });
          if (!res.ok) {
            if (res.status === 404) return jsonResult({ results: [], total: 0 });
            return errorResult(`PubChem search failed: HTTP ${res.status}`);
          }
          const json = (await res.json()) as { IdentifierList?: { CID?: number[] } };
          cids = (json.IdentifierList?.CID ?? []).slice(0, limit);
        } else {
          const res = await fetch(searchUrl, { signal });
          if (!res.ok) {
            if (res.status === 404) return jsonResult({ results: [], total: 0 });
            return errorResult(`PubChem search failed: HTTP ${res.status}`);
          }
          const json = (await res.json()) as { IdentifierList?: { CID?: number[] } };
          cids = (json.IdentifierList?.CID ?? []).slice(0, limit);
        }

        if (cids.length === 0) {
          return jsonResult({ results: [], total: 0 });
        }

        // Step 2: Get compound properties
        const propsUrl = `${PUBCHEM_BASE}/compound/cid/${cids.join(',')}/property/IUPACName,MolecularFormula,MolecularWeight,CanonicalSMILES,InChIKey/JSON`;
        const propsRes = await fetch(propsUrl, { signal });
        if (!propsRes.ok) return errorResult(`PubChem properties fetch failed: HTTP ${propsRes.status}`);

        const propsJson = (await propsRes.json()) as {
          PropertyTable?: { Properties?: Array<Record<string, unknown>> };
        };
        const props = propsJson.PropertyTable?.Properties ?? [];

        const results = props.map((p) => ({
          cid: p.CID,
          iupacName: String(p.IUPACName ?? ''),
          formula: String(p.MolecularFormula ?? ''),
          molecularWeight: p.MolecularWeight ?? null,
          canonicalSmiles: String(p.CanonicalSMILES ?? ''),
          inchiKey: String(p.InChIKey ?? ''),
          url: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}`,
        }));

        return jsonResult({ results, total: results.length });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('PubChem search timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── pubchem_fetch ──────────────────────────────────────────────
  server.tool(
    'pubchem_fetch',
    'Fetch detailed PubChem compound information by CID, including synonyms, description, and computed properties.',
    {
      cid: z.number().describe('PubChem Compound ID (e.g., 2244 for aspirin)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        // Fetch properties
        const propsUrl = `${PUBCHEM_BASE}/compound/cid/${args.cid}/property/IUPACName,MolecularFormula,MolecularWeight,ExactMass,CanonicalSMILES,IsomericSMILES,InChI,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount/JSON`;
        const propsRes = await fetch(propsUrl, { signal });
        if (!propsRes.ok) {
          if (propsRes.status === 404) return errorResult(`PubChem compound not found: CID ${args.cid}`);
          return errorResult(`PubChem fetch failed: HTTP ${propsRes.status}`);
        }
        const propsJson = (await propsRes.json()) as {
          PropertyTable?: { Properties?: Array<Record<string, unknown>> };
        };
        const props = propsJson.PropertyTable?.Properties?.[0] ?? {};

        // Fetch synonyms
        const synUrl = `${PUBCHEM_BASE}/compound/cid/${args.cid}/synonyms/JSON`;
        const synRes = await fetch(synUrl, { signal });
        let synonyms: string[] = [];
        if (synRes.ok) {
          const synJson = (await synRes.json()) as {
            InformationList?: { Information?: Array<{ Synonym?: string[] }> };
          };
          synonyms = (synJson.InformationList?.Information?.[0]?.Synonym ?? []).slice(0, 20);
        }

        // Fetch description
        const descUrl = `${PUBCHEM_BASE}/compound/cid/${args.cid}/description/JSON`;
        const descRes = await fetch(descUrl, { signal });
        let description = '';
        if (descRes.ok) {
          const descJson = (await descRes.json()) as {
            InformationList?: { Information?: Array<{ Description?: string }> };
          };
          const descs = descJson.InformationList?.Information ?? [];
          description = descs.find((d) => d.Description)?.Description ?? '';
        }

        return jsonResult({
          cid: args.cid,
          iupacName: String(props.IUPACName ?? ''),
          formula: String(props.MolecularFormula ?? ''),
          molecularWeight: props.MolecularWeight ?? null,
          exactMass: props.ExactMass ?? null,
          canonicalSmiles: String(props.CanonicalSMILES ?? ''),
          isomericSmiles: String(props.IsomericSMILES ?? ''),
          inchi: String(props.InChI ?? ''),
          inchiKey: String(props.InChIKey ?? ''),
          xLogP: props.XLogP ?? null,
          tpsa: props.TPSA ?? null,
          hBondDonors: props.HBondDonorCount ?? null,
          hBondAcceptors: props.HBondAcceptorCount ?? null,
          synonyms,
          description,
          url: `https://pubchem.ncbi.nlm.nih.gov/compound/${args.cid}`,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('PubChem fetch timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );
}
