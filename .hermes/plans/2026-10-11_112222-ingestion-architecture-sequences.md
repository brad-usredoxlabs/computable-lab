# Plan: Ingestion architecture — sequences as a first-class ingestion, query routing to the right NCBI database, pill contrast fix

Plan file: `.hermes/plans/2026-10-11_112222-ingestion-architecture-sequences.md`
Repo: `/mnt/vast/home/brad/git/computable-lab` (npm workspaces: `server/` Fastify, `app/` React+Vite)

## Goal

Make `/ingestion/` find what a biologist means: searching "16S F Prausnitzi" must surface the canonical 16S rRNA reference (NR_028961) the way NCBI's own site does — via a new top-level **Sequences** ingestion tab backed by a real NCBI Nucleotide search — and fix the unreadable light-grey-on-light-grey source pills.

## The three complaints, mapped to root causes (verified live on 2026-10-11)

1. **"16S F Prausnitzi" returns dnaJ garbage.**
   The Literature tab defaults to the `pubmed` pill; the garbage appears when the user picks the **NCBI Gene** pill. `ncbi_gene_search` (`server/src/mcp/tools/ncbiTools.ts:219`) queries Entrez `db=gene`, where "16S F Prausnitzii" matches E. coli `dnaJ` (gene 944753) — verified live:
   `curl -s "http://localhost:3001/api/biosource/ncbi_gene/search?q=16S%20F%20Prausnitzi&limit=5"` → top hit `dnaJ`, and `organism` renders as the literal string `[object Object]` (a second bug: `doc.organism?.valueOf()` at `ncbiTools.ts:263`).
   **There is no nucleotide/nuccore search tool anywhere in the codebase.** What NCBI's site does for that query is search `db=nuccore`; verified live:
   `esearch db=nuccore term=16S[Title] AND prausnitzii[Title] AND refseq[filter]` → count 1, id `265678656` → esummary: **NR_028961, "Faecalibacterium prausnitzii strain ATCC 27768 16S ribosomal RNA, partial sequence", 1462 bp, sourcedb=refseq**. That is the "special box" NCBI shows. The certainty NCBI displays is mostly *choosing the right database*; our code never offers it.
2. **Sequences live under Literature.** `app/src/ingestion/IngestionPage.tsx` tabs are `vendor-pdf | literature | oligo-orders`; sequence *import* is only reachable as `SequenceImport orderOnly` under "Primer / probe orders" (accession-only, no search). There is no sequence *search* surface at all.
3. **Pill contrast.** `app/src/knowledge/literature/SourceSelector.tsx` hardcodes `background: white; color: var(--pill-color)` with light pill colors (`#1971c2` PubMed, `#364fc7` NCBI Gene). The app's **default theme is dark** (`app/src/shared/styles/tokens.css`, `.cl-app` block: `--cl-bg: #0e1116`), so the white pills are light boxes with mid-blue text on a dark UI — the "light grey on light grey" complaint. The component uses zero design tokens.

## Current context / assumptions

- Bio-source search flow: `LiteratureExplorer` → `useBioSourceSearch` (`app/src/knowledge/hooks/useBioSourceSearch.ts`) → `searchBioSource()` (`app/src/shared/api/biosourceClient.ts`) → `GET /api/biosource/:source/search?q=&limit=` → `createBiosourceHandlers` (`server/src/api/handlers/BiosourceHandlers.ts`) calls a `ToolRegistry` tool by name from `SOURCE_MAP` (lines 22–30). Tools are dual-registered (MCP + ToolRegistry) via `dualRegister` (`server/src/mcp/tools/dualRegister.ts`); anything registered is automatically callable by the AI chat panel through the ToolBridge.
- Sequence records already have a full backend: `POST /api/sequences/actions {operation:'save_sequence', sequence:{label,residues,alphabet,topology}}` (`server/src/sequences/sequenceRoutes.ts:32`, `SequenceService.ts:70`). Alphabet values used by this workspace are `iupac_dna` / `iupac_rna` / `protein` (see `server/src/sequences/sequenceSources.ts`), NOT `dna`/`rna` — do not copy `ncbiTools.ts:28` `inferAlphabet`, which emits `dna`/`rna`.
- Exa MCP exists (`server/src/mcp/tools/exaTools.ts`, config under `integrations.exa` in `config.yaml`) and is already reachable from the AI panel as `web_search_exa`.
- Dev instances: main frontend :5174 proxies `/api` → backend :3001. Restart only the exact PID if needed (never blanket pkill).
- Playwright: always `npx playwright test <file> --project=chromium` from `app/` (bare runs fail on the missing firefox binary).
- NCBI E-utilities without an API key are limited to ~3 req/s; live probes returned HTTP 429 once. Tests must mock `fetch`; only one e2e spec may hit NCBI live.
- Verified taxonomy fact used below: `esearch db=taxonomy term="Faecalibacterium prausnitzii"` → taxid **853**.

## Architecture / proposed approach

Add a deterministic NCBI **Nucleotide/Protein search tool** (`ncbi_nucleotide_search` / `ncbi_protein_search`, with organism-abbreviation resolution via the Entrez taxonomy database and a `canonicalOnly` RefSeq filter) and expose it through the existing `/api/biosource/:source/search` proxy. Mount it in a new top-level **Sequences** tab on `/ingestion/` that renders the top RefSeq hit as a pinned "Canonical RefSeq" card (our version of NCBI's certainty box) with an **Import as sequence record** button wired to the existing `save_sequence` action. Fix the pills by replacing hardcoded colors with the app's design tokens. Query *routing* stays explicit (the user picks the tab/pill); an optional AI tool (`ncbi_sequence_ask`, Exa-assisted) covers the fuzzy case later.

---

## Phase 0 — Baseline

**Task 0.1.** Confirm the stack is up and capture the broken behavior as evidence.

```bash
cd /mnt/vast/home/brad/git/computable-lab
curl -s "http://localhost:3001/api/biosource/ncbi_gene/search?q=16S%20F%20Prausnitzi&limit=3" | head -c 400
```
Expected: JSON whose first result has `"symbol":"dnaJ"` (and `"organism":"[object Object]"`). If :3001 is down, restart the exact backend PID (find it with `ss -tlnp | grep 3001`) — never a blanket pkill.

```bash
cd app && npm run test:unit 2>/dev/null | tail -5   # or: npx vitest run  (from app/)
```
Expected: existing suites pass (baseline green before any change).

---

## Phase 1 — Backend: NCBI Nucleotide/Protein search tool (TDD)

**Task 1.1 — Write the failing test.** Create `server/src/mcp/tools/NcbiNucleotideTools.test.ts` (pattern copied from `server/src/mcp/tools/ExaTools.test.ts`, which stubs `fetch` and pulls the tool out of a `ToolRegistry`):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { registerNcbiTools } from './ncbiTools.js';

afterEach(() => vi.restoreAllMocks());

function stubNcbi() {
  const calls: { url: string; term: string }[] = [];
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url);
    const term = new URL(u).searchParams.get('term') ?? '';
    calls.push({ url: u, term });
    if (u.includes('db=taxonomy')) {
      return new Response(JSON.stringify({ esearchresult: { count: '1', idlist: ['853'] } }), { status: 200 });
    }
    if (u.includes('esearch.fcgi')) {
      return new Response(JSON.stringify({ esearchresult: { count: '1', idlist: ['265678656'] } }), { status: 200 });
    }
    if (u.includes('esummary.fcgi')) {
      return new Response(JSON.stringify({ result: { uids: ['265678656'], '265678656': {
        caption: 'NR_028961', title: 'Faecalibacterium prausnitzii strain ATCC 27768 16S ribosomal RNA, partial sequence',
        taxid: 853, slen: 1462, sourcedb: 'refseq', biomol: 'rRNA',
      } } }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });
  vi.stubGlobal('fetch', fetchMock as typeof fetch);
  return calls;
}

function registryWithNcbi() {
  const registry = new ToolRegistry();
  registerNcbiTools(new McpServer({ name: 'test', version: '0.0.0' }), registry);
  return registry;
}

const parse = async (result: Awaited<ReturnType<typeof handlerOf>>): any =>
  JSON.parse(result.content.map((c: any) => ('text' in c ? c.text : '')).join('\n'));
const handlerOf = (name: string) => {
  const tool = registryWithNcbi().get(name);
  if (!tool) throw new Error(`${name} not registered`);
  return tool.handler({ query: '16S F prausnitzii' } as never, {} as never);
};

describe('ncbi_nucleotide_search', () => {
  it('resolves organism abbreviations via taxonomy and searches nuccore with [Organism]', async () => {
    const calls = stubNcbi();
    const tool = registryWithNcbi().get('ncbi_nucleotide_search');
    expect(tool).toBeDefined();
    const data = await parse(await tool!.handler({ query: '16S F prausnitzii' } as never, {} as never));
    // Taxonomy resolution ran first and produced taxid 853
    expect(calls.some((c) => c.url.includes('db=taxonomy') && c.term === 'F prausnitzii')).toBe(true);
    // The nuccore term is field-qualified with the resolved organism
    expect(calls.some((c) => c.url.includes('db=nuccore') && c.term.includes('[Organism:exp] AND 853'))).toBe(true);
    expect(data.results[0].accession).toBe('NR_028961');
    expect(data.results[0].canonical).toBe(true);
    expect(data.results[0].organism).toBe('Faecalibacterium prausnitzii');
  });

  it('canonicalOnly adds the refseq filter', async () => {
    const calls = stubNcbi();
    const tool = registryWithNcbi().get('ncbi_nucleotide_search');
    await tool!.handler({ query: '16S F prausnitzii', canonicalOnly: true } as never, {} as never);
    expect(calls.some((c) => c.url.includes('db=nuccore') && c.term.includes('refseq[filter]'))).toBe(true);
  });
});
```

Run it and confirm it fails:

```bash
cd /mnt/vast/home/brad/git/computable-lab && npm run test:run -w server -- NcbiNucleotideTools
```
Expected: FAIL — `ncbi_nucleotide_search not registered`.

**Task 1.2 — Implement the tool.** In `server/src/mcp/tools/ncbiTools.ts`, insert the following block immediately **after the closing `);` of the `ncbi_gene_search` registration (line 283)** and before the `ncbi_sequence_fetch` comment. It reuses the file's existing `esearch`/`esummary`/`withTimeout`/`jsonResult`/`errorResult` helpers:

```ts
  // ── ncbi_nucleotide_search / ncbi_protein_search ───────────────
  // The nuccore/protein databases are what NCBI's own site searches when a
  // user types "16S F prausnitzii". The gene db answers that query with
  // dnaJ; the nucleotide db answers it with NR_028961.
  const BINOMIAL = /\b([A-Z][a-z]{2,})\s+([a-z]{2,})\b/;
  const ABBREV_BINOMIAL = /\b([A-Z])\.?\s+([a-z]{2,})\b/;

  /** Resolve "F prausnitzii" → "Faecalibacterium prausnitzii" via the Entrez taxonomy db. */
  async function resolveOrganism(query: string, signal: AbortSignal): Promise<string | null> {
    const full = query.match(BINOMIAL);
    if (full) return full[0];
    const abbrev = query.match(ABBREV_BINOMIAL);
    if (!abbrev) return null;
    const res = await esearch({ db: 'taxonomy', term: abbrev[0], retmax: '1' }, signal);
    if (!res.ok) return null;
    const json = (await res.json()) as { esearchresult?: { idlist?: string[] } };
    const taxid = json.esearchresult?.idlist?.[0];
    if (!taxid) return null;
    const sumRes = await esummary({ db: 'taxonomy', id: taxid }, signal);
    if (!sumRes.ok) return null;
    const sumJson = (await sumRes.json()) as { result?: Record<string, { scientificname?: string }> };
    return sumJson.result?.[taxid]?.scientificname ?? null;
  }

  interface NuccoreDoc {
    caption?: string; title?: string; organism?: string; taxid?: number;
    slen?: number; sourcedb?: string; biomol?: string;
  }

  function registerSequenceSearch(
    server: McpServer,
    registry: ToolRegistry | undefined,
    db: 'nuccore' | 'protein',
  ): void {
    const toolName = db === 'nuccore' ? 'ncbi_nucleotide_search' : 'ncbi_protein_search';
    dualRegister(server, registry,
      toolName,
      db === 'nuccore'
        ? 'Search NCBI Nucleotide (nuccore) for sequences: 16S rRNA genes, RefSeq records, GenBank entries. Returns accessions, titles, organisms, lengths, and a canonical flag for curated RefSeq hits. This is the right database for "find the 16S gene of organism X" queries — NOT the gene database.'
        : 'Search NCBI Protein for protein sequences. Returns accessions, titles, organisms, and lengths.',
      {
        query: z.string().describe('Sequence search query (e.g., "16S F prausnitzii"). Organism abbreviations are resolved via the taxonomy database automatically.'),
        organism: z.string().optional().describe('Explicit organism filter (binomial or taxid); overrides auto-resolution.'),
        canonicalOnly: z.boolean().optional().describe('Restrict to curated RefSeq records (refseq[filter]) — the "canonical" hits.'),
        limit: z.number().optional().describe('Maximum results (default 10, max 50)'),
      },
      async (args) => {
        const { signal, cleanup } = withTimeout();
        try {
          const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
          const organism = args.organism ?? await resolveOrganism(args.query, signal);
          const titleWords = args.query
            .split(/\s+/)
            .filter((w) => w.length > 2 && !/^[A-Z]\.?$/.test(w))
            .map((w) => `${w}[Title]`)
            .join(' AND ');
          const parts: string[] = [];
          if (organism) {
            parts.push(/^\d+$/.test(organism) ? `${organism}[Taxonomy ID]` : `"${organism}"[Organism:exp]`);
          }
          if (titleWords) parts.push(titleWords);
          if (args.canonicalOnly === true) parts.push('refseq[filter]');
          if (parts.length === 0) parts.push(args.query);

          const searchRes = await esearch({ db, term: parts.join(' AND '), retmax: String(limit) }, signal);
          if (!searchRes.ok) return errorResult(`${toolName} failed: HTTP ${searchRes.status}`);
          const searchJson = (await searchRes.json()) as {
            esearchresult?: { idlist?: string[]; count?: string };
          };
          const ids = searchJson.esearchresult?.idlist ?? [];
          if (ids.length === 0) return jsonResult({ results: [], total: 0, queryTranslation: searchJson.esearchresult?.querytranslation ?? null });

          const sumRes = await esummary({ db, id: ids.join(','), retmode: 'json' }, signal);
          if (!sumRes.ok) return errorResult(`${toolName} summary failed: HTTP ${sumRes.status}`);
          const sumJson = (await sumRes.json()) as { result?: Record<string, NuccoreDoc & { uid?: string }> };
          const resultMap = sumJson.result ?? {};

          const results = ids.map((uid) => {
            const doc = resultMap[uid] ?? {};
            const accession = String(doc.caption ?? uid);
            return {
              accession,
              uid,
              title: String(doc.title ?? ''),
              organism: String(doc.organism ?? ''),
              taxId: doc.taxid ?? null,
              length: doc.slen ?? null,
              biomol: String(doc.biomol ?? ''),
              sourcedb: String(doc.sourcedb ?? ''),
              // NCBI's own certainty signal: curated RefSeq records first.
              canonical: doc.sourcedb === 'refseq',
              url: `https://www.ncbi.nlm.nih.gov/${db === 'nuccore' ? 'nuccore' : 'protein'}/${accession}`,
            };
          });
          results.sort((a, b) => Number(b.canonical) - Number(a.canonical));
          return jsonResult({
            results,
            total: Number(searchJson.esearchresult?.count ?? results.length),
            organismResolved: organism ?? null,
            queryTranslation: searchJson.esearchresult?.querytranslation ?? null,
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return errorResult(`${toolName} timed out`);
          }
          return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          cleanup();
        }
      },
    );
  }

  registerSequenceSearch(server, registry, 'nuccore');
  registerSequenceSearch(server, registry, 'protein');
```

Re-run the test:

```bash
npm run test:run -w server -- NcbiNucleotideTools
```
Expected: PASS (2 tests). Then `npm run typecheck -w server` → clean.

**Task 1.3 — Commit.**
```bash
git add server/src/mcp/tools/ncbiTools.ts server/src/mcp/tools/NcbiNucleotideTools.test.ts
git commit -m "feat(sequences): ncbi_nucleotide_search/ncbi_protein_search MCP tools with taxonomy resolution and RefSeq canonical flag"
```

**Task 1.4 — Expose through the biosource proxy.** In `server/src/api/handlers/BiosourceHandlers.ts`:

(a) Add to `SOURCE_MAP` (after the `ncbi_gene` line 29):
```ts
  ncbi_nucleotide: { searchTool: 'ncbi_nucleotide_search' },
  ncbi_protein:    { searchTool: 'ncbi_protein_search' },
```

(b) In `search()`, widen the querystring type on the interface (line 40) to `{ q?: string; limit?: string; organism?: string; canonicalOnly?: string }` and, right after the `limit` block (lines 81–85), add:
```ts
        if (typeof request.query.organism === 'string' && request.query.organism.trim()) {
          args.organism = request.query.organism.trim();
        }
        if (request.query.canonicalOnly === 'true') {
          args.canonicalOnly = true;
        }
```

**Task 1.5 — Test the proxy passthrough (TDD).** Create `server/src/api/handlers/BiosourceHandlers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { createBiosourceHandlers } from './BiosourceHandlers.js';

function fakeFastify(query: Record<string, string>) {
  const reply = { status: (code: number) => { reply.code = code; return reply; }, code: 200 };
  const request = { params: { source: 'ncbi_nucleotide' }, query, log: { error: () => {} } };
  return { request, reply } as never;
}

describe('biosource proxy', () => {
  it('routes ncbi_nucleotide to the search tool and passes organism/canonicalOnly', async () => {
    const registry = new ToolRegistry();
    let seen: Record<string, unknown> = {};
    registry.register({
      name: 'ncbi_nucleotide_search',
      description: 'fake',
      inputSchema: {},
      handler: async (args) => { seen = args; return { content: [{ type: 'text', text: JSON.stringify({ results: [] }) }] }; },
    });
    const handlers = createBiosourceHandlers(registry);
    const { request, reply } = fakeFastify({ q: '16S F prausnitzii', canonicalOnly: 'true' });
    const body = await handlers.search(request as never, reply as never);
    expect(reply.code).toBe(200);
    expect(seen.query).toBe('16S F prausnitzii');
    expect(seen.canonicalOnly).toBe(true);
    expect(body).toEqual({ results: [] });
  });
});
```

Run → expect FAIL before Task 1.4's edits land (write this test first if you reorder), PASS after. Verify end-to-end against the live dev backend:

```bash
# restart the :3001 backend (exact PID from `ss -tlnp | grep 3001`) so tsx picks up the new tool, then:
curl -s "http://localhost:3001/api/biosource/ncbi_nucleotide/search?q=16S%20F%20Prausnitzi&canonicalOnly=true" | head -c 600
```
Expected: JSON with `"accession":"NR_028961"`, `"canonical":true`, `"organism":"Faecalibacterium prausnitzii"`. (If NCBI returns HTTP 429, wait ~5s and retry — unauthenticated E-utilities are rate-limited.)

Commit:
```bash
git add server/src/api/handlers/BiosourceHandlers.ts server/src/api/handlers/BiosourceHandlers.test.ts
git commit -m "feat(api): expose ncbi_nucleotide/ncbi_protein through /api/biosource proxy with organism + canonicalOnly passthrough"
```

---

## Phase 2 — Frontend: the Sequences ingestion tab

**Task 2.1 — Client types + normalizer.** In `app/src/types/biosource.ts`:
- Add `'ncbi_nucleotide' | 'ncbi_protein'` to the `BioSourceId` union (line 12, after `'ncbi_gene'`).
- Add to `BioSourceResult` (after `badges`): `canonical?: boolean`.

In `app/src/shared/api/biosourceClient.ts`:
- Extend the `searchBioSource` signature (line 13) to:
```ts
export async function searchBioSource(
  source: BioSourceId,
  query: string,
  limit = 10,
  filters?: { organism?: string; canonicalOnly?: boolean },
): Promise<{ results: BioSourceResult[]; total: number; raw: unknown }> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  if (filters?.organism) params.set('organism', filters.organism)
  if (filters?.canonicalOnly) params.set('canonicalOnly', 'true')
```
(the rest of the function is unchanged).
- Add to the `switch` in `normalizeBioSourceResults` (before `default`):
```ts
    case 'ncbi_nucleotide':
    case 'ncbi_protein':
      return normalizeNuccore(raw)
```
- Add the normalizer (place next to `normalizeNcbiGene`, ~line 211):
```ts
function normalizeNuccore(raw: unknown): BioSourceResult[] {
  const results = getArray(raw, 'results')
  return results.map((r: unknown) => {
    const item = r as Record<string, unknown>
    const accession = str(item.accession)
    const length = typeof item.length === 'number' ? `${item.length} bp` : ''
    return {
      source: 'ncbi_nucleotide' as const,
      sourceId: accession,
      title: str(item.title),
      subtitle: [str(item.organism), length].filter(Boolean).join(' — '),
      url: str(item.url) || undefined,
      canonical: item.canonical === true,
      badges: accession
        ? [{ label: accession, color: item.canonical === true ? '#3fb950' : '#8a93a0' }]
        : [],
      raw: item,
    }
  })
}
```

**Task 2.2 — Failing tab test.** In `app/src/ingestion/IngestionPage.test.tsx`, add a mock near the top (with the other `vi.mock` calls):
```tsx
vi.mock('../sequences/SequenceSearch', () => ({
  SequenceSearch: () => <div data-testid="sequence-search">sequence-search</div>,
}))
```
and a test inside the `describe`:
```tsx
  it('renders the Sequences tab and switches to it', async () => {
    renderAt('/ingestion/sequences')
    expect(screen.getByTestId('ingestion-body-sequences')).toBeDefined()
    expect(await screen.findByTestId('sequence-search')).toBeDefined()
  })
```
Run: `cd app && npx vitest run src/ingestion/IngestionPage.test.tsx` → expect FAIL (`ingestion-body-sequences` not found).

**Task 2.3 — Mount the tab.** In `app/src/ingestion/IngestionPage.tsx`:
- Add the lazy import next to the `LiteratureExplorer` lazy import (line 22):
```ts
const SequenceSearch = lazy(async () =>
  import('../sequences/SequenceSearch').then((m) => ({ default: m.SequenceSearch })),
)
```
- Change the tab union (line 26) and `TABS` (lines 28–32) to:
```ts
type IngestionTab = 'vendor-pdf' | 'literature' | 'sequences' | 'oligo-orders'

const TABS: { id: IngestionTab; label: string }[] = [
  { id: 'vendor-pdf', label: 'Vendor PDFs' },
  { id: 'literature', label: 'Literature' },
  { id: 'sequences', label: 'Sequences' },
  { id: 'oligo-orders', label: 'Primer / probe orders' },
]
```
- In the body (line 72), extend the ternary chain:
```tsx
{active === 'oligo-orders' ? <SequenceImport orderOnly /> : active === 'sequences' ? (
  <Suspense fallback={<p className="ingestion-page__loading">Loading sequences…</p>}>
    <SequenceSearch initialQuery={new URLSearchParams(window.location.search).get('q') ?? ''} />
  </Suspense>
) : active === 'vendor-pdf' ? (
```

Re-run the test file → PASS. `npm run typecheck -w app` → clean (SequenceSearch doesn't exist yet — create it in Task 2.4 before typechecking; if you hit the missing-module error, that is the RED state, proceed).

**Task 2.4 — The SequenceSearch surface.** Create `app/src/sequences/SequenceSearch.tsx`:

```tsx
/**
 * SequenceSearch — sequence-first ingestion surface.
 *
 * Searches NCBI Nucleotide/Protein directly (the database NCBI's own site
 * uses for "16S F prausnitzii") and pins the top curated RefSeq hit in a
 * canonical card — our version of NCBI's certainty box. Import writes a
 * sequence record via the existing save_sequence action.
 */
import { useState } from 'react'
import { searchBioSource } from '../shared/api/biosourceClient'
import { sequenceApi } from './api'
import type { BioSourceResult } from '../types/biosource'

type Db = 'ncbi_nucleotide' | 'ncbi_protein'

export function SequenceSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const [db, setDb] = useState<Db>('ncbi_nucleotide')
  const [query, setQuery] = useState(initialQuery)
  const [submitted, setSubmitted] = useState(initialQuery ? initialQuery : '')
  const [organism, setOrganism] = useState('')
  const [canonicalOnly, setCanonicalOnly] = useState(false)
  const [results, setResults] = useState<BioSourceResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [imported, setImported] = useState<Record<string, string>>({})

  async function search() {
    if (submitted.trim().length < 2) return
    setBusy(true); setError(''); setMessage('')
    try {
      const resp = await searchBioSource(db, submitted, 10, {
        ...(organism.trim() ? { organism: organism.trim() } : {}),
        ...(canonicalOnly ? { canonicalOnly: true } : {}),
      })
      setResults(resp.results)
    } catch (e) { setError((e as Error).message); setResults([]) }
    finally { setBusy(false) }
  }

  async function importResult(r: BioSourceResult) {
    setBusy(true); setError('')
    try {
      const detail = await fetch(`/api/biosource/${db}/fetch?id=${encodeURIComponent(r.sourceId)}`).then((res) => res.json())
      const fasta = String(detail.sequence ?? '')
      const residues = fasta.split('\n').filter((line: string) => !line.startsWith('>')).join('').replace(/\s/g, '')
      if (!residues) throw new Error('No sequence residues returned for this accession.')
      const saved = await sequenceApi('/actions', { operation: 'save_sequence', sequence: {
        label: `${r.sourceId} — ${r.title}`,
        residues,
        alphabet: db === 'ncbi_protein' ? 'protein' : (detail.db === 'nuccore' && /U/i.test(residues) ? 'iupac_rna' : 'iupac_dna'),
        topology: 'linear',
        source: { accession: r.sourceId, url: r.url ?? '', retrievedAt: new Date().toISOString() },
      } })
      setImported((prev) => ({ ...prev, [r.sourceId]: saved.recordId }))
      setMessage(`Imported ${r.sourceId} as ${saved.recordId}.`)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const canonical = results.find((r) => r.canonical)
  const rest = results.filter((r) => r !== canonical)

  return <div className="sequence-search" data-testid="sequence-search">
    <div className="sequence-search__controls">
      <label>Database
        <select value={db} onChange={(e) => setDb(e.target.value as Db)}>
          <option value="ncbi_nucleotide">NCBI Nucleotide</option>
          <option value="ncbi_protein">NCBI Protein</option>
        </select>
      </label>
      <input aria-label="Sequence query" placeholder="e.g. 16S F prausnitzii" value={query} onChange={(e) => setQuery(e.target.value)} />
      <input aria-label="Organism filter" placeholder="Organism (optional)" value={organism} onChange={(e) => setOrganism(e.target.value)} />
      <label><input type="checkbox" checked={canonicalOnly} onChange={(e) => setCanonicalOnly(e.target.checked)} />Canonical RefSeq only</label>
      <button disabled={busy || submitted.trim().length < 2} onClick={() => void search()}>Search</button>
    </div>
    {busy && <p role="status">Searching NCBI…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {canonical && <fieldset className="sequence-search__canonical" data-testid="sequence-canonical">
      <legend>Canonical RefSeq hit</legend>
      <strong>{canonical.sourceId}</strong> — {canonical.title}
      <p>{canonical.subtitle}</p>
      {imported[canonical.sourceId]
        ? <p>Imported: {imported[canonical.sourceId]}</p>
        : <button disabled={busy} onClick={() => void importResult(canonical)}>Import as sequence record</button>}
    </fieldset>}
    {rest.map((r) => <fieldset key={r.sourceId}>
      <legend>{r.sourceId} — {r.title}</legend>
      <p>{r.subtitle}</p>
      {imported[r.sourceId]
        ? <p>Imported: {imported[r.sourceId]}</p>
        : <button disabled={busy} onClick={() => void importResult(r)}>Import as sequence record</button>}
    </fieldset>)}
    {!busy && submitted && results.length === 0 && !error && <p>No NCBI results for "{submitted}".</p>}
  </div>
}
```

Note the alphabet values (`iupac_dna`/`iupac_rna`/`protein`) — they match `server/src/sequences/sequenceSources.ts`, not `ncbiTools.ts`'s `dna`/`rna`. Do not "fix" them.

**Task 2.5 — Canonical-card CSS.** Append to `app/src/sequences/SequencesPage.css`:
```css
.sequence-search__controls { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
.sequence-search__canonical { border: 1.5px solid var(--cl-success, #3fb950); border-radius: 8px; padding: 0.75rem 1rem; background: var(--cl-success-soft, rgba(63,185,80,0.15)); margin-bottom: 0.75rem; }
.sequence-search__canonical legend { font-weight: 600; color: var(--cl-success, #3fb950); padding: 0 0.4rem; }
```

**Task 2.6 — Verify + commit.**
```bash
cd app && npx vitest run src/ingestion/IngestionPage.test.tsx   # PASS
npm run typecheck -w app                                        # clean
```
```bash
git add app/src/sequences/SequenceSearch.tsx app/src/sequences/SequencesPage.css app/src/ingestion/IngestionPage.tsx app/src/ingestion/IngestionPage.test.tsx app/src/types/biosource.ts app/src/shared/api/biosourceClient.ts
git commit -m "feat(ingestion): Sequences tab with NCBI nucleotide search, canonical RefSeq card, import to sequence records"
```

---

## Phase 3 — Pill contrast fix (the light-grey-on-light-grey defect)

**Task 3.1 — Tokenize the pills.** Replace the `<style>` block contents in `app/src/knowledge/literature/SourceSelector.tsx` (lines 31–60) with:

```css
        .source-selector {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .source-pill {
          padding: 0.375rem 0.75rem;
          border-radius: 9999px;
          border: 1.5px solid color-mix(in srgb, var(--pill-color) 70%, var(--cl-border, #d0d7de));
          background: color-mix(in srgb, var(--pill-color) 14%, var(--cl-bg, #ffffff));
          /* Unselected text must read against BOTH themes: nudge the source
             hue toward the active text color so light hues never sit on a
             light fill (the old white-bg + #364fc7-on-dark failure). */
          color: color-mix(in srgb, var(--pill-color) 65%, var(--cl-text, #1f2328));
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          white-space: nowrap;
        }
        .source-pill:hover {
          background: color-mix(in srgb, var(--pill-color) 26%, var(--cl-bg, #ffffff));
        }
        .source-pill--active {
          background: var(--pill-color);
          color: var(--cl-on-accent, #0e1116);
          border-color: var(--pill-color);
          font-weight: 600;
        }
```

Why this is correct: `--cl-*` tokens come from `app/src/shared/styles/tokens.css` and invert with `data-theme`; `color-mix` keeps the hue identity of each source while guaranteeing text/fill separation in both palettes; the active pill gets the theme's `--cl-on-accent` ink.

**Task 3.2 — Fix the unreadable LiteratureExplorer title.** In `app/src/knowledge/LiteratureExplorer.tsx` the inline `<style>` hardcodes light-theme colors that are invisible on the default dark theme. Replace exactly:
- `.lit-explorer__title { ... color: #212529; }` → `color: var(--cl-text, #212529);`
- `.lit-explorer__input { ... border: 1px solid #dee2e6; }` → `border: 1px solid var(--cl-border, #dee2e6);` and add `background: var(--cl-bg-elev, #ffffff); color: var(--cl-text, #1f2328);`
- `.lit-explorer__loading { color: #868e96; }` → `color: var(--cl-text-dim, #868e96);`

**Task 3.3 — Browser verification (mandatory per SOP rule 12).** With the dev stack up (:5174 → :3001):

```bash
cd app && npx playwright test --project=chromium -g "source pills" ingestion-pills.spec.ts || true
```
(No such spec exists yet — Task 3.4 creates it.)

**Task 3.4 — Contrast e2e.** Create `app/e2e/ingestion-pills.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

/** The Literature tab source pills must be legible in the default (dark) theme:
 *  unselected pill text must not be near-identical to the pill fill. */
test('source pills have readable unselected contrast', async ({ page }) => {
  await page.goto('/ingestion/literature')
  const gene = page.locator('.source-pill', { hasText: 'NCBI Gene' })
  await expect(gene).toBeVisible({ timeout: 15000 })
  const styles = await gene.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { color: cs.color, background: cs.backgroundColor }
  })
  // Parse rgb() strings and require a minimum channel-distance contrast.
  const rgb = (s: string) => (s.match(/\d+/g) ?? ['0', '0', '0']).map(Number)
  const [r1, g1, b1] = rgb(styles.color)
  const [r2, g2, b2] = rgb(styles.background)
  const distance = Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2))
  expect(distance).toBeGreaterThan(60)
  await page.screenshot({ path: 'tmp/ingestion-pills.png', fullPage: false })
})
```

Run: `cd app && npx playwright test ingestion-pills --project=chromium` → PASS. Also take a manual look at `app/tmp/ingestion-pills.png` (or use the `cl-browser-reviewer` receipt flow) to confirm the pills read cleanly on the dark shell.

Commit:
```bash
git add app/src/knowledge/literature/SourceSelector.tsx app/src/knowledge/LiteratureExplorer.tsx app/e2e/ingestion-pills.spec.ts
git commit -m "fix(ingestion): source pills and literature explorer use design tokens — readable contrast in dark theme"
```

---

## Phase 4 — End-to-end proof of the headline scenario

**Task 4.1 — Live e2e.** Create `app/e2e/ingestion-sequences.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

/** Headline scenario: "16S F Prausnitzi" in the Sequences tab must surface the
 *  canonical Faecalibacterium prausnitzii 16S RefSeq (NR_028961), pinned in
 *  the canonical card — not dnaJ garbage. Hits live NCBI (rate-limit aware). */
test('16S F prausnitzii surfaces the canonical RefSeq 16S record', async ({ page }) => {
  await page.goto('/ingestion/sequences')
  await page.getByLabel('Sequence query').fill('16S F Prausnitzi')
  await page.getByRole('button', { name: 'Search' }).click()
  const canonical = page.getByTestId('sequence-canonical')
  await expect(canonical).toBeVisible({ timeout: 30000 })
  await expect(canonical).toContainText('NR_028961')
  await expect(canonical).toContainText('16S ribosomal RNA')
  await expect(page.locator('fieldset')).not.toContainText('dnaJ')
})
```

Run: `cd app && npx playwright test ingestion-sequences --project=chromium` → PASS. If NCBI 429s, wait 10s and rerun once; if it persists, note it and rely on the mocked unit tests + the curl check from Task 1.5 as evidence.

Commit:
```bash
git add app/e2e/ingestion-sequences.spec.ts
git commit -m "test(e2e): 16S F prausnitzii headline scenario — canonical RefSeq card in Sequences tab"
```

---

## Phase 5 — Optional: AI-assisted query resolution (the "IDK how we get from here to there" case)

Only if Phase 1–4 are merged and green. Add `ncbi_sequence_ask` to `server/src/mcp/tools/ncbiTools.ts` (same `dualRegister` pattern): args `{ question: string }`; handler (1) calls the registered `web_search_exa` tool from the same `ToolRegistry` with the question, (2) extracts a binomial organism from the top result titles with the `BINOMIAL` regex above, (3) runs the `ncbi_nucleotide_search` term-building logic with `canonicalOnly: true`, (4) returns `{ organism, suggestedQuery, results }` plus the Exa evidence URLs. Because tools are dual-registered, the AI chat panel on `/ingestion/sequences` can call it with no extra wiring; the AI panel's `surfaceContext` already flows through `useAiChat`. TDD: stub `fetch` for both the Exa endpoint and eutils (pattern: `ExaTools.test.ts`), assert the tool composes both. Commit separately.

## Phase 6 — Optional cleanup (separate decision, do NOT bundle)

Split the Literature tab's pills by role: add `group: 'literature' | 'database'` to `BioSourceConfig` (`app/src/types/biosource.ts`), give `LiteratureExplorer` a `sourceGroup` prop defaulting to `'literature'`, filter `BIO_SOURCES` in `SourceSelector`, and mount a second instance with `sourceGroup="database"` as a "Databases" ingestion tab (UniProt/PDB/ChEBI/Reactome/NCBI Gene). This removes the "sequences/genes/proteins under Literature" confusion completely but touches the extraction flow — decide with Brad first (open question below).

---

## Tests / validation summary (the gate)

| Check | Command | Expected |
|---|---|---|
| Server unit | `npm run test:run -w server` | all green incl. `NcbiNucleotideTools.test.ts`, `BiosourceHandlers.test.ts` |
| Server types | `npm run typecheck -w server` | clean |
| App unit | `cd app && npx vitest run src/ingestion/IngestionPage.test.tsx` | green incl. Sequences tab test |
| App types | `npm run typecheck -w app` | clean |
| Live API | `curl -s "http://localhost:3001/api/biosource/ncbi_nucleotide/search?q=16S%20F%20Prausnitzi&canonicalOnly=true"` | contains `"NR_028961"`, `"canonical":true` |
| Contrast e2e | `cd app && npx playwright test ingestion-pills --project=chromium` | green + `app/tmp/ingestion-pills.png` visually checked |
| Headline e2e | `cd app && npx playwright test ingestion-sequences --project=chromium` | green, canonical card shows NR_028961 |

TDD order per code task: write test → run (RED) → implement → run (GREEN) → commit. One commit per task with the exact `git add` paths listed (never `-A`).

## Risks, tradeoffs, open questions

- **NCBI rate limits (429).** Unauthenticated E-utilities ≈ 3 req/s; a live probe already 429'd once. All unit tests mock `fetch`; only one e2e hits NCBI live. Consider adding `toolkit` param / an NCBI API key in config later (data file, not hardcoded).
- **Taxonomy resolution latency.** "F prausnitzii" resolution costs 2 extra E-utils calls (~0.5s). Acceptable; skipped when the user types a full binomial or an explicit organism filter.
- **`canonicalOnly` is RefSeq, not "the one true 16S".** RefSeq 16S entries are partial (~1462 bp). The card says "Canonical RefSeq hit", not "the canonical 16S" — honest labeling.
- **Import path.** Phase 2 imports via `save_sequence` (plain sequence record). It does not create revision pins/oligo specs; that's the Sequences workspace's job. If Brad wants import → collection/pin semantics, that's a follow-up.
- **Alphabet trap.** `ncbiTools.ts` `inferAlphabet` emits `dna`/`rna` while the sequences workspace uses `iupac_dna`/`iupac_rna`/`protein`. Phase 2 deliberately uses the workspace values; changing `ncbiTools.ts`'s values is out of scope and could break `buildSequenceRecord` consumers.
- **Literature tab keeps its 7 pills for now.** UniProt/PDB/ChEBI/Reactome/NCBI Gene remain reachable under Literature (they're accession-fetch sources for `SequenceImport` too). Phase 6 is the real split — flagged as an open question rather than decided here.
- **Open question for Brad:** should the Literature tab's NCBI Gene pill be removed entirely (gene search stays AI-only), and should "Databases" become its own top-level tab (Phase 6)? The plan ships the Sequences tab first and leaves this as a separate call.
- **Do not touch:** the vendor-PDF workflow, `/sequences` workspace internals, `LiteratureExplorer`'s extraction pipeline.

## Acceptance criteria (maps to the three complaints)

1. `/ingestion/sequences` exists as a top-level tab; searching "16S F Prausnitzi" there shows a pinned Canonical RefSeq card with NR_028961 and an Import button that creates a real sequence record. (e2e + curl evidence)
2. Sequences are no longer only findable "under literature"; the Sequences tab is its own ingestion surface.
3. Source pills on `/ingestion/literature` are legible in the default dark theme — verified by the contrast e2e and a screenshot receipt.
