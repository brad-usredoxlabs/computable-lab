/**
 * MCP tools for NCBI E-utilities: PubMed literature search, Gene info,
 * nucleotide/protein sequence fetch.
 *
 * Endpoints: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/
 * All requests use JSON where possible; FASTA for sequences.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TIMEOUT_MS = 15_000;

/** Parse FASTA text → raw residues (strips header lines and whitespace). */
function parseFastaResidues(fasta: string): string {
  return fasta
    .split('\n')
    .filter((line) => !line.startsWith('>'))
    .join('')
    .replace(/\s/g, '');
}

/** Map NCBI db + accession prefix to a sequence.schema.yaml alphabet value. */
function inferAlphabet(db: 'nucleotide' | 'protein', residues: string): string {
  if (db === 'protein') return 'protein';
  // If residues contain U (uracil) it's RNA
  if (/U/i.test(residues)) return 'rna';
  return 'dna';
}

/** Build a sequence.schema.yaml-compliant payload from NCBI data. */
function buildSequenceRecord(opts: {
  accession: string;
  db: 'nucleotide' | 'protein';
  fasta: string;
  title: string;
  organism: string;
  length: unknown;
}): Record<string, unknown> {
  const residues = parseFastaResidues(opts.fasta);
  const alphabet = inferAlphabet(opts.db, residues);
  const system = opts.accession.startsWith('NM_') || opts.accession.startsWith('NR_') || opts.accession.startsWith('NC_')
    ? 'refseq'
    : opts.accession.startsWith('NP_') || opts.accession.startsWith('XP_') || opts.accession.startsWith('YP_')
      ? 'refseq'
      : 'genbank';

  const record: Record<string, unknown> = {
    kind: 'sequence',
    id: `SEQ-${opts.accession}`,
    label: opts.title || opts.accession,
    alphabet,
    residues,
    length: residues.length,
    identifiers: [
      {
        system,
        value: opts.accession,
        url: `https://www.ncbi.nlm.nih.gov/${opts.db}/${opts.accession}`,
      },
    ],
  };

  if (opts.organism) {
    record.description = `${opts.organism} — ${opts.title}`;
  }

  return record;
}

async function efetch(params: Record<string, string>, signal: AbortSignal): Promise<Response> {
  const qs = new URLSearchParams(params);
  return fetch(`${EUTILS_BASE}/efetch.fcgi?${qs}`, { signal });
}

async function esearch(params: Record<string, string>, signal: AbortSignal): Promise<Response> {
  const qs = new URLSearchParams({ ...params, retmode: 'json' });
  return fetch(`${EUTILS_BASE}/esearch.fcgi?${qs}`, { signal });
}

async function esummary(params: Record<string, string>, signal: AbortSignal): Promise<Response> {
  const qs = new URLSearchParams({ ...params, retmode: 'json' });
  return fetch(`${EUTILS_BASE}/esummary.fcgi?${qs}`, { signal });
}

function withTimeout(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

// ── sequence search term-building (spec §5a) ─────────────────────────
// Title words longer than 2 chars and not abbreviation-shaped become
// `word*[Title]` — the wildcard is what lets Entrez spelling correction
// rescue the typo "Prausnitzi" (live-verified: unqualified exact terms are
// phrasesnotfound). NO taxonomy round-trip: taxonomy esearch does not match
// one-letter genus abbreviations at all (OQ1 adjudication — any taxonomy
// call in this handler is a defect). Explicit organism arg only.

const ABBREVIATION_SHAPE = /^[A-Z]\.?$/;

function sequenceTitleTerm(query: string): string {
  return query
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !ABBREVIATION_SHAPE.test(word))
    .map((word) => `${word}*[Title]`)
    .join(' AND ');
}

function organismClause(organism: string): string {
  const trimmed = organism.trim();
  if (/^\d+$/.test(trimmed)) return `${trimmed}[Taxonomy ID]`;
  return `"${trimmed}"[Organism:exp]`;
}

async function esearchIds(
  db: 'nuccore' | 'protein',
  term: string,
  retmax: number,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; ids: string[]; count: number; translationset: unknown[] }> {
  const res = await esearch({ db, term, retmax: String(retmax) }, signal);
  if (!res.ok) {
    return { ok: false, status: res.status, ids: [], count: 0, translationset: [] };
  }
  const json = (await res.json()) as {
    esearchresult?: { idlist?: string[]; count?: string; translationset?: unknown[] };
  };
  return {
    ok: true,
    status: res.status,
    ids: json.esearchresult?.idlist ?? [],
    count: Number(json.esearchresult?.count ?? 0),
    translationset: json.esearchresult?.translationset ?? [],
  };
}

/**
 * Shared registration for ncbi_nucleotide_search (db=nuccore) and
 * ncbi_protein_search (db=protein). Two-pass design (OQ2 adjudication):
 * a refseq-filtered pass whose hits are pinned canonical-first, plus the
 * general pass so GenBank hits stay visible; `canonicalOnly=true` runs the
 * refseq pass only. A failure on the pin pass (e.g. keyless 429) falls back
 * gracefully to the general pass alone.
 */
function registerSequenceSearch(server: McpServer, registry: ToolRegistry | undefined, db: 'nuccore' | 'protein'): void {
  const name = db === 'nuccore' ? 'ncbi_nucleotide_search' : 'ncbi_protein_search';
  const label = db === 'nuccore' ? 'NCBI Nucleotide' : 'NCBI Protein';

  dualRegister(server, registry,
    name,
    `Search NCBI ${label} (Entrez db "${db}") for sequence records. Canonical RefSeq hits are pinned first via a refseq-filtered pass; title terms are wildcarded for spelling tolerance. Returns accessions, titles, organisms, lengths, and canonical flags.`,
    {
      query: z.string().describe('Search query (plain words; each becomes a wildcarded [Title] term)'),
      organism: z.string().optional().describe('Organism filter: taxid (all digits) or scientific name'),
      canonicalOnly: z.boolean().optional().describe('If true, search RefSeq records only (single refseq-filtered pass)'),
      limit: z.number().optional().describe('Maximum results (default 10, max 50)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
        let term = sequenceTitleTerm(args.query);
        if (!term) {
          return jsonResult({ results: [], total: 0, queryTranslation: [] });
        }
        if (args.organism) {
          term += ` AND ${organismClause(args.organism)}`;
        }

        const canonicalOnly = args.canonicalOnly === true;

        // Pass 1: refseq-filtered pin pass. A failure here must NOT fail the
        // whole call — the general pass alone is the graceful fallback.
        let canonicalIds: string[] = [];
        if (!canonicalOnly) {
          try {
            const refseqPass = await esearchIds(db, `${term} AND refseq[filter]`, Math.min(limit, 10), signal);
            canonicalIds = refseqPass.ids;
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            canonicalIds = [];
          }
        }

        // Pass 2: general pass (in canonicalOnly mode this IS the refseq pass).
        const generalPass = await esearchIds(db, canonicalOnly ? `${term} AND refseq[filter]` : term, limit, signal);
        if (!generalPass.ok) {
          return errorResult(`${label} search failed: HTTP ${generalPass.status}`);
        }

        const ordered: string[] = [];
        const seen = new Set<string>();
        for (const uid of [...canonicalIds, ...generalPass.ids]) {
          if (!seen.has(uid)) {
            seen.add(uid);
            ordered.push(uid);
          }
        }

        if (ordered.length === 0) {
          return jsonResult({ results: [], total: generalPass.count, queryTranslation: generalPass.translationset });
        }

        const sumRes = await esummary({ db, id: ordered.join(',') }, signal);
        if (!sumRes.ok) {
          return errorResult(`${label} summary failed: HTTP ${sumRes.status}`);
        }
        const sumJson = (await sumRes.json()) as { result?: Record<string, Record<string, unknown>> };
        const resultMap = sumJson.result ?? {};

        const rows = ordered.map((uid) => {
          const doc = resultMap[uid] ?? {};
          const accession = String(doc.caption ?? uid);
          return {
            accession,
            uid,
            title: String(doc.title ?? ''),
            // nuccore/protein esummary organism is a plain string (live-verified).
            organism: String(doc.organism ?? ''),
            taxId: doc.taxid ?? null,
            length: doc.slen ?? null,
            biomol: String(doc.biomol ?? ''),
            sourcedb: String(doc.sourcedb ?? ''),
            canonical: doc.sourcedb === 'refseq',
            url: `https://www.ncbi.nlm.nih.gov/${db}/${accession}`,
          };
        });

        // Canonical hits first, then general order (stable partition), cap to limit.
        const results = [...rows.filter((r) => r.canonical), ...rows.filter((r) => !r.canonical)].slice(0, limit);

        return jsonResult({ results, total: generalPass.count, queryTranslation: generalPass.translationset });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult(`${label} search timed out`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );
}

export function registerNcbiTools(server: McpServer, registry?: ToolRegistry): void {
  // Sequence search tools (spec §5a): shared helper, one registration per db.
  registerSequenceSearch(server, registry, 'nuccore');
  registerSequenceSearch(server, registry, 'protein');

  // ── pubmed_search ──────────────────────────────────────────────
  dualRegister(server, registry,
    'pubmed_search',
    'Search PubMed for biomedical literature. Returns article summaries with PMIDs, titles, authors, journals, and DOIs.',
    {
      query: z.string().describe('PubMed search query (supports MeSH terms, boolean operators, field tags like [Author])'),
      limit: z.number().optional().describe('Maximum results (default 10, max 50)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);

        // Step 1: esearch to get PMIDs
        const searchRes = await esearch({ db: 'pubmed', term: args.query, retmax: String(limit) }, signal);
        if (!searchRes.ok) return errorResult(`PubMed search failed: HTTP ${searchRes.status}`);

        const searchJson = (await searchRes.json()) as {
          esearchresult?: { idlist?: string[]; count?: string };
        };
        const ids = searchJson.esearchresult?.idlist ?? [];
        const totalCount = searchJson.esearchresult?.count ?? '0';

        if (ids.length === 0) {
          return jsonResult({ results: [], total: Number(totalCount) });
        }

        // Step 2: esummary to get article details
        const sumRes = await esummary({ db: 'pubmed', id: ids.join(',') }, signal);
        if (!sumRes.ok) return errorResult(`PubMed summary failed: HTTP ${sumRes.status}`);

        const sumJson = (await sumRes.json()) as {
          result?: Record<string, Record<string, unknown>>;
        };
        const resultMap = sumJson.result ?? {};

        const results = ids.map((pmid) => {
          const doc = resultMap[pmid] ?? {};
          const authors = Array.isArray(doc.authors)
            ? (doc.authors as Array<{ name?: string }>).map((a) => a.name ?? '').filter(Boolean)
            : [];
          const articleIds = Array.isArray(doc.articleids) ? (doc.articleids as Array<{ idtype?: string; value?: string }>) : [];
          const doi = articleIds.find((a) => a.idtype === 'doi')?.value ?? null;

          return {
            pmid,
            title: String(doc.title ?? ''),
            authors,
            journal: String(doc.fulljournalname ?? doc.source ?? ''),
            pubDate: String(doc.pubdate ?? ''),
            doi,
            url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          };
        });

        return jsonResult({ results, total: Number(totalCount) });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('PubMed search timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── pubmed_fetch ───────────────────────────────────────────────
  dualRegister(server, registry,
    'pubmed_fetch',
    'Fetch PubMed article abstract and metadata by PMID.',
    {
      pmid: z.string().describe('PubMed ID (e.g., "34567890")'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const res = await efetch({ db: 'pubmed', id: args.pmid, rettype: 'abstract', retmode: 'xml' }, signal);
        if (!res.ok) return errorResult(`PubMed fetch failed: HTTP ${res.status}`);
        const xml = await res.text();

        // Also get structured summary
        const sumRes = await esummary({ db: 'pubmed', id: args.pmid }, signal);
        let summary: Record<string, unknown> = {};
        if (sumRes.ok) {
          const sumJson = (await sumRes.json()) as { result?: Record<string, Record<string, unknown>> };
          summary = sumJson.result?.[args.pmid] ?? {};
        }

        const authors = Array.isArray(summary.authors)
          ? (summary.authors as Array<{ name?: string }>).map((a) => a.name ?? '').filter(Boolean)
          : [];
        const articleIds = Array.isArray(summary.articleids) ? (summary.articleids as Array<{ idtype?: string; value?: string }>) : [];
        const doi = articleIds.find((a) => a.idtype === 'doi')?.value ?? null;

        // Extract abstract text from XML (simple regex — XML parsing is overkill here)
        const abstractMatch = xml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
        const abstractText = abstractMatch
          ? abstractMatch.map((m) => m.replace(/<[^>]+>/g, '').trim()).join('\n\n')
          : '(No abstract available)';

        return jsonResult({
          pmid: args.pmid,
          title: String(summary.title ?? ''),
          authors,
          journal: String(summary.fulljournalname ?? summary.source ?? ''),
          pubDate: String(summary.pubdate ?? ''),
          doi,
          abstract: abstractText,
          url: `https://pubmed.ncbi.nlm.nih.gov/${args.pmid}/`,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('PubMed fetch timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── ncbi_gene_search ──────────────────────────────────────────
  dualRegister(server, registry,
    'ncbi_gene_search',
    'Search NCBI Gene database for gene information. Returns gene IDs, symbols, names, organisms, and summaries.',
    {
      query: z.string().describe('Gene search query (gene symbol, name, or keyword)'),
      organism: z.string().optional().describe('Organism filter (e.g., "Homo sapiens", "9606" for taxid)'),
      limit: z.number().optional().describe('Maximum results (default 10, max 20)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 20);
        let term = args.query;
        if (args.organism) {
          term += `[Orgn] AND ${args.organism}`;
        }

        const searchRes = await esearch({ db: 'gene', term, retmax: String(limit) }, signal);
        if (!searchRes.ok) return errorResult(`NCBI Gene search failed: HTTP ${searchRes.status}`);

        const searchJson = (await searchRes.json()) as {
          esearchresult?: { idlist?: string[]; count?: string };
        };
        const ids = searchJson.esearchresult?.idlist ?? [];

        if (ids.length === 0) {
          return jsonResult({ results: [], total: 0 });
        }

        const sumRes = await esummary({ db: 'gene', id: ids.join(',') }, signal);
        if (!sumRes.ok) return errorResult(`NCBI Gene summary failed: HTTP ${sumRes.status}`);

        const sumJson = (await sumRes.json()) as {
          result?: Record<string, Record<string, unknown>>;
        };
        const resultMap = sumJson.result ?? {};

        const results = ids.map((geneId) => {
          const doc = resultMap[geneId] ?? {};
          return {
            geneId,
            symbol: String(doc.name ?? ''),
            fullName: String(doc.description ?? ''),
            organism: doc.organism && typeof doc.organism === 'object'
              ? String((doc.organism as { scientificname?: unknown }).scientificname ?? '')
              : String(doc.organism ?? ''),
            taxId: doc.taxid,
            summary: String(doc.summary ?? ''),
            aliases: doc.otheraliases ? String(doc.otheraliases).split(',').map((s: string) => s.trim()) : [],
            chromosome: String(doc.chromosome ?? ''),
            mapLocation: String(doc.maplocation ?? ''),
            url: `https://www.ncbi.nlm.nih.gov/gene/${geneId}`,
          };
        });

        return jsonResult({ results, total: Number(searchJson.esearchresult?.count ?? results.length) });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('NCBI Gene search timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── ncbi_sequence_fetch ────────────────────────────────────────
  dualRegister(server, registry,
    'ncbi_sequence_fetch',
    'Fetch a nucleotide or protein sequence from NCBI by accession. Returns FASTA sequence and metadata. With asRecord=true, returns a sequence.schema.yaml-compliant payload ready for record_create.',
    {
      accession: z.string().describe('NCBI accession (e.g., "NM_000600.5", "NP_000591.1", "NC_000001.11")'),
      db: z.enum(['nucleotide', 'protein']).describe('NCBI database: "nucleotide" or "protein"'),
      format: z.enum(['fasta', 'genbank']).optional().describe('Return format (default "fasta"). Ignored when asRecord=true.'),
      asRecord: z.boolean().optional().describe('If true, return a sequence.schema.yaml-compliant payload for record_create'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        // Always fetch FASTA for record mode; respect format otherwise
        const rettype = args.asRecord === true ? 'fasta' : (args.format === 'genbank' ? 'gb' : 'fasta');
        const res = await efetch(
          { db: args.db, id: args.accession, rettype, retmode: 'text' },
          signal
        );
        if (!res.ok) return errorResult(`NCBI sequence fetch failed: HTTP ${res.status}`);

        const text = await res.text();
        if (!text.trim()) {
          return errorResult(`No sequence found for accession: ${args.accession}`);
        }

        // Fetch summary for metadata
        const sumRes = await esummary({ db: args.db, id: args.accession }, signal);
        let meta: Record<string, unknown> = {};
        if (sumRes.ok) {
          const sumJson = (await sumRes.json()) as {
            result?: Record<string, Record<string, unknown>>;
          };
          const uids = Object.keys(sumJson.result ?? {}).filter((k) => k !== 'uids');
          if (uids.length > 0) {
            meta = sumJson.result?.[uids[0]!] ?? {};
          }
        }

        const title = String(meta.title ?? '');
        const organism = String(meta.organism ?? '');

        if (args.asRecord === true) {
          const record = buildSequenceRecord({
            accession: args.accession,
            db: args.db,
            fasta: text,
            title,
            organism,
            length: meta.slen ?? meta.length ?? null,
          });
          return jsonResult({
            record,
            schemaId: 'bio/sequence',
            _hint: 'Pass record as payload and schemaId to record_create',
          });
        }

        return jsonResult({
          accession: args.accession,
          db: args.db,
          title,
          organism,
          length: meta.slen ?? meta.length ?? null,
          sequence: text,
          url: `https://www.ncbi.nlm.nih.gov/${args.db}/${args.accession}`,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('NCBI sequence fetch timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );
}
