/**
 * MCP tools for Europe PMC: literature search with better linking,
 * open access status, citations, and full-text availability.
 *
 * API: https://europepmc.org/RestfulWebService
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

const EPMC_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const TIMEOUT_MS = 15_000;

function withTimeout(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

export function registerEuropmcTools(server: McpServer, registry?: ToolRegistry): void {
  // ── europepmc_search ───────────────────────────────────────────
  dualRegister(server, registry,
    'europepmc_search',
    'Search Europe PMC for biomedical and life science literature. Better linking and open access detection than PubMed alone. Supports advanced queries with field tags.',
    {
      query: z.string().describe('Search query (supports Europe PMC syntax: AUTH:, TITLE:, JOURNAL:, boolean operators)'),
      openAccess: z.boolean().optional().describe('If true, restrict to open access articles only'),
      source: z.string().optional().describe('Source database filter: MED (PubMed), PMC, PPR (preprints), etc.'),
      limit: z.number().optional().describe('Maximum results (default 10, max 25)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
        let query = args.query;
        if (args.openAccess === true) {
          query += ' AND OPEN_ACCESS:y';
        }

        const params = new URLSearchParams({
          query,
          format: 'json',
          pageSize: String(limit),
          resultType: 'core',
        });
        if (args.source) {
          params.set('synonym', 'TRUE');
        }

        const res = await fetch(`${EPMC_BASE}/search?${params}`, { signal });
        if (!res.ok) return errorResult(`Europe PMC search failed: HTTP ${res.status}`);

        const json = (await res.json()) as {
          hitCount?: number;
          resultList?: { result?: Array<Record<string, unknown>> };
        };

        const articles = json.resultList?.result ?? [];
        const results = articles.map((article) => {
          const isOpenAccess = String(article.isOpenAccess ?? '') === 'Y';
          const inPMC = Boolean(article.pmcid);

          return {
            id: String(article.id ?? ''),
            source: String(article.source ?? ''),
            pmid: String(article.pmid ?? ''),
            pmcid: String(article.pmcid ?? ''),
            doi: String(article.doi ?? ''),
            title: String(article.title ?? ''),
            authorString: String(article.authorString ?? ''),
            journal: String(article.journalTitle ?? ''),
            pubYear: String(article.pubYear ?? ''),
            isOpenAccess,
            inPMC,
            citedByCount: article.citedByCount ?? 0,
            abstract: String(article.abstractText ?? '').slice(0, 500),
            url: article.pmcid
              ? `https://europepmc.org/article/PMC/${article.pmcid}`
              : article.pmid
                ? `https://europepmc.org/article/MED/${article.pmid}`
                : `https://europepmc.org/search?query=${encodeURIComponent(String(article.doi ?? ''))}`,
            fullTextUrl: inPMC
              ? `https://europepmc.org/article/PMC/${article.pmcid}`
              : null,
          };
        });

        return jsonResult({ results, total: json.hitCount ?? results.length });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('Europe PMC search timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── europepmc_citations ────────────────────────────────────────
  dualRegister(server, registry,
    'europepmc_citations',
    'Get articles that cite a given article (forward citation lookup). Useful for finding follow-up work and impact.',
    {
      pmid: z.string().optional().describe('PubMed ID of the source article'),
      pmcid: z.string().optional().describe('PMC ID of the source article (e.g., "PMC1234567")'),
      doi: z.string().optional().describe('DOI of the source article'),
      limit: z.number().optional().describe('Maximum citing articles (default 10, max 25)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        // Determine source and id
        let source: string;
        let id: string;
        if (args.pmid) {
          source = 'MED';
          id = args.pmid;
        } else if (args.pmcid) {
          source = 'PMC';
          id = args.pmcid.replace(/^PMC/i, '');
        } else if (args.doi) {
          // Use DOI search to find the PMID first
          const searchRes = await fetch(
            `${EPMC_BASE}/search?query=DOI:${encodeURIComponent(args.doi)}&format=json&pageSize=1`,
            { signal }
          );
          if (!searchRes.ok) return errorResult(`Europe PMC lookup failed: HTTP ${searchRes.status}`);
          const searchJson = (await searchRes.json()) as {
            resultList?: { result?: Array<{ id?: string; source?: string }> };
          };
          const first = searchJson.resultList?.result?.[0];
          if (!first) return errorResult(`No article found for DOI: ${args.doi}`);
          source = first.source ?? 'MED';
          id = first.id ?? '';
        } else {
          return errorResult('Provide at least one of: pmid, pmcid, or doi');
        }

        const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
        const res = await fetch(
          `${EPMC_BASE}/${source}/${id}/citations?format=json&pageSize=${limit}`,
          { signal }
        );
        if (!res.ok) return errorResult(`Europe PMC citations failed: HTTP ${res.status}`);

        const json = (await res.json()) as {
          hitCount?: number;
          citationList?: { citation?: Array<Record<string, unknown>> };
        };

        const citations = (json.citationList?.citation ?? []).map((c) => ({
          id: String(c.id ?? ''),
          source: String(c.source ?? ''),
          title: String(c.title ?? ''),
          authorString: String(c.authorString ?? ''),
          journal: String(c.journalAbbreviation ?? ''),
          pubYear: String(c.pubYear ?? ''),
          doi: String(c.doi ?? ''),
        }));

        return jsonResult({ sourceId: id, sourceDb: source, citations, total: json.hitCount ?? citations.length });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('Europe PMC citations timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );

  // ── europepmc_references ───────────────────────────────────────
  dualRegister(server, registry,
    'europepmc_references',
    'Get the reference list (bibliography) of a given article. Useful for discovering foundational papers and related work.',
    {
      pmid: z.string().optional().describe('PubMed ID of the article'),
      pmcid: z.string().optional().describe('PMC ID of the article'),
      limit: z.number().optional().describe('Maximum references (default 25, max 50)'),
    },
    async (args) => {
      const { signal, cleanup } = withTimeout();
      try {
        let source: string;
        let id: string;
        if (args.pmid) {
          source = 'MED';
          id = args.pmid;
        } else if (args.pmcid) {
          source = 'PMC';
          id = args.pmcid.replace(/^PMC/i, '');
        } else {
          return errorResult('Provide at least one of: pmid or pmcid');
        }

        const limit = Math.min(Math.max(args.limit ?? 25, 1), 50);
        const res = await fetch(
          `${EPMC_BASE}/${source}/${id}/references?format=json&pageSize=${limit}`,
          { signal }
        );
        if (!res.ok) return errorResult(`Europe PMC references failed: HTTP ${res.status}`);

        const json = (await res.json()) as {
          hitCount?: number;
          referenceList?: { reference?: Array<Record<string, unknown>> };
        };

        const references = (json.referenceList?.reference ?? []).map((r) => ({
          id: String(r.id ?? ''),
          source: String(r.source ?? ''),
          title: String(r.title ?? ''),
          authorString: String(r.authorString ?? ''),
          journal: String(r.journalAbbreviation ?? ''),
          pubYear: String(r.pubYear ?? ''),
          doi: String(r.doi ?? ''),
        }));

        return jsonResult({ sourceId: id, sourceDb: source, references, total: json.hitCount ?? references.length });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return errorResult('Europe PMC references timed out');
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        cleanup();
      }
    }
  );
}
