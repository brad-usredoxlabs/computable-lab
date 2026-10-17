/**
 * ISEQ-1 RED — ncbi_nucleotide_search / ncbi_protein_search contract
 * (spec §5a/§5d, canonical spec 2026-10-13_iseq-1-ncbi-sequences-tab-spec.md).
 *
 * Harness shape mirrors ExaTools.test.ts exactly: vi.stubGlobal('fetch', ...),
 * fresh ToolRegistry + McpServer, register, registry.get(name), parse
 * result.content[0].text. NO unit test hits eutils.
 *
 * Stub shapes are the composer's + this coder's first-hand live eutils rows
 * (keyless probes at dispatch): nuccore esummary organism is a plain string;
 * gene esummary organism is the dict {scientificname, commonname, taxid}.
 *
 * Arms:
 *  (1) nuccore two-pass pin: verbatim typo query "16S F Prausnitzi" —
 *      NO taxonomy call (OQ1: any taxonomy esearch = defect), wildcard title
 *      terms (Prausnitzi*[Title]), a refseq-filtered pass AND a general pass,
 *      canonical hit pinned first (NR_028961).
 *  (2) canonicalOnly=true: exactly ONE esearch, term carries refseq[filter].
 *  (3) protein arm registered and searches db=protein.
 *  (4) empty results: idlist [] -> {results: [], total: 0}, not an error.
 *  (5) explicit organism arg: taxid digits -> [Taxonomy ID], name -> [Organism:exp].
 *  (6) refseq-pass failure (HTTP 429) must NOT fail the call — general pass alone.
 *  (7) gene organism-object (§2): dict organism renders scientificname, never
 *      "[object Object]" (RED against the verbatim String(doc.organism?.valueOf()) bug).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { registerNcbiTools } from './ncbiTools.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- live-verified stub rows (field names verbatim from eutils JSON) ----

const REFSEQ_UID = '265678656';
const GENERAL_UID = '3379869005';

const nuccoreRefseqRow = {
  uid: REFSEQ_UID,
  caption: 'NR_028961',
  is_part_of: '',
  title: 'Faecalibacterium prausnitzii strain ATCC 27768 16S ribosomal RNA, partial sequence',
  extra: 'gi|265678656|ref|NR_028961.1|',
  gi: 265678656,
  createdate: '2001-10-01',
  updatedate: '2019-03-12',
  taxid: 853,
  slen: 1462,
  biomol: 'rRNA',
  moltype: 'rna',
  topology: 'linear',
  sourcedb: 'refseq',
  organism: 'Faecalibacterium prausnitzii',
  strain: 'ATCC 27768',
  accessionversion: 'NR_028961.1',
};

const nuccoreGeneralRow = {
  uid: GENERAL_UID,
  caption: 'PZ868245',
  is_part_of: '',
  title: 'Faecalibacterium prausnitzii strain TS M3092 16S ribosomal RNA gene, partial sequence',
  extra: 'gi|3379869005|gb|PZ868245.1|',
  gi: 3379869005,
  createdate: '2026-08-27',
  updatedate: '2026-08-27',
  taxid: 853,
  slen: 192,
  biomol: 'genomic',
  moltype: 'dna',
  topology: 'linear',
  sourcedb: 'insd',
  organism: 'Faecalibacterium prausnitzii',
  strain: 'TS M3092',
  accessionversion: 'PZ868245.1',
};

function esearchJson(idlist: string[], count: string) {
  return { esearchresult: { count, retmax: String(idlist.length), retstart: 0, idlist, translationset: [], translationstack: [] } };
}

function esummaryJson(rows: Array<Record<string, unknown>>) {
  return { result: { uids: rows.map((r) => String(r.uid)), ...Object.fromEntries(rows.map((r) => [String(r.uid), r])) } };
}

type StubCall = { url: URL; init?: RequestInit };

function stubFetch(handler: (call: StubCall) => { ok: boolean; status?: number; json?: unknown; text?: string }) {
  const calls: StubCall[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const call = { url, init };
    calls.push(call);
    const canned = handler(call);
    if (canned.json !== undefined) {
      return { ok: canned.ok, status: canned.status ?? 200, json: async () => canned.json } as unknown as Response;
    }
    return { ok: canned.ok, status: canned.status ?? 200, text: async () => canned.text ?? '' } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock as typeof fetch);
  return calls;
}

function register() {
  const registry = new ToolRegistry();
  const mcp = new McpServer({ name: 'test', version: '0.0.0' });
  registerNcbiTools(mcp, registry);
  return registry;
}

async function runTool(registry: ToolRegistry, name: string, args: Record<string, unknown>) {
  const tool = registry.get(name);
  expect(tool).toBeDefined();
  const result = await tool!.handler(args);
  const text = result.content[0];
  expect(text.type).toBe('text');
  return { body: JSON.parse(text.text), isError: result.isError === true };
}

const esearchCalls = (calls: StubCall[]) => calls.filter((c) => c.url.pathname.endsWith('/esearch.fcgi'));
const esummaryCalls = (calls: StubCall[]) => calls.filter((c) => c.url.pathname.endsWith('/esummary.fcgi'));

describe('ncbi_nucleotide_search (nuccore arm)', () => {
  it('two-pass RefSeq pin for the verbatim typo query "16S F Prausnitzi" — wildcard title terms, no taxonomy call', async () => {
    const calls = stubFetch((call) => {
      if (call.url.pathname.endsWith('/esummary.fcgi')) {
        const ids = (call.url.searchParams.get('id') ?? '').split(',');
        return { ok: true, json: esummaryJson([nuccoreRefseqRow, nuccoreGeneralRow].filter((r) => ids.includes(r.uid))) };
      }
      const db = call.url.searchParams.get('db');
      const term = call.url.searchParams.get('term') ?? '';
      if (db === 'taxonomy') return { ok: true, json: esearchJson([], '0') };
      if (db !== 'nuccore') return { ok: false, status: 400 };
      if (term.includes('refseq[filter]')) return { ok: true, json: esearchJson([REFSEQ_UID], '1') };
      return { ok: true, json: esearchJson([GENERAL_UID], '822') };
    });

    const registry = register();
    const { body, isError } = await runTool(registry, 'ncbi_nucleotide_search', { query: '16S F Prausnitzi' });

    expect(isError).toBe(false);

    // OQ1 (binding): NO taxonomy esearch call — any taxonomy call is a defect.
    expect(calls.some((c) => c.url.searchParams.get('db') === 'taxonomy')).toBe(false);

    const searches = esearchCalls(calls);
    // Two passes: a refseq-filtered pass AND a general pass, both on db=nuccore.
    expect(searches.filter((c) => (c.url.searchParams.get('term') ?? '').includes('refseq[filter]'))).toHaveLength(1);
    expect(searches.filter((c) => !(c.url.searchParams.get('term') ?? '').includes('refseq[filter]'))).toHaveLength(1);
    for (const c of searches) expect(c.url.searchParams.get('db')).toBe('nuccore');

    // Wildcard title terms (§3.2: the typo must survive via spelling correction).
    const generalTerm = searches.find((c) => !(c.url.searchParams.get('term') ?? '').includes('refseq[filter]'))!.url.searchParams.get('term')!;
    expect(generalTerm).toContain('Prausnitzi*[Title]');
    expect(generalTerm).toContain('16S*[Title]');
    // "F" (<=2 chars / abbreviation-shaped) carries no signal and is dropped.
    expect(generalTerm).not.toContain('F[Title]');
    expect(generalTerm).not.toContain(' F *[Title]');

    // Canonical hit pinned first.
    expect(body.results[0].accession).toBe('NR_028961');
    expect(body.results[0].canonical).toBe(true);
    expect(body.results[0].organism).toBe('Faecalibacterium prausnitzii');
    expect(body.results[0].length).toBe(1462);
    expect(body.results[0].uid).toBe(REFSEQ_UID);
    expect(body.results[0].biomol).toBe('rRNA');
    expect(body.results[0].sourcedb).toBe('refseq');
    // General (non-canonical) hits stay visible below the pin.
    expect(body.results[1].accession).toBe('PZ868245');
    expect(body.results[1].canonical).toBe(false);
    // total comes from the general pass count (§5a).
    expect(body.total).toBe(822);

    // One esummary call for the union of uids.
    const summaries = esummaryCalls(calls);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.url.searchParams.get('id')).toContain(REFSEQ_UID);
    expect(summaries[0]!.url.searchParams.get('id')).toContain(GENERAL_UID);
  });

  it('canonicalOnly=true issues exactly ONE esearch and its term carries refseq[filter]', async () => {
    const calls = stubFetch((call) => {
      if (call.url.pathname.endsWith('/esummary.fcgi')) return { ok: true, json: esummaryJson([nuccoreRefseqRow]) };
      const term = call.url.searchParams.get('term') ?? '';
      if (term.includes('refseq[filter]')) return { ok: true, json: esearchJson([REFSEQ_UID], '1') };
      return { ok: true, json: esearchJson([GENERAL_UID], '822') };
    });

    const registry = register();
    const { body, isError } = await runTool(registry, 'ncbi_nucleotide_search', { query: '16S F Prausnitzi', canonicalOnly: true });

    expect(isError).toBe(false);
    const searches = esearchCalls(calls);
    expect(searches).toHaveLength(1);
    expect(searches[0]!.url.searchParams.get('term')).toContain('refseq[filter]');
    expect(body.results).toHaveLength(1);
    expect(body.results[0].accession).toBe('NR_028961');
    expect(body.results[0].canonical).toBe(true);
    expect(body.total).toBe(1);
  });

  it('explicit organism arg: all-digits -> [Taxonomy ID], name -> [Organism:exp]; no taxonomy round-trip', async () => {
    const taxidCalls = stubFetch(() => ({ ok: true, json: esearchJson([REFSEQ_UID], '1') }));
    const registry1 = register();
    await runTool(registry1, 'ncbi_nucleotide_search', { query: '16S ribosomal', organism: '853' });
    const taxidTerm = esearchCalls(taxidCalls)[0]!.url.searchParams.get('term')!;
    expect(taxidTerm).toContain('853[Taxonomy ID]');
    expect(taxidCalls.some((c) => c.url.searchParams.get('db') === 'taxonomy')).toBe(false);

    const nameCalls = stubFetch(() => ({ ok: true, json: esearchJson([REFSEQ_UID], '1') }));
    const registry2 = register();
    await runTool(registry2, 'ncbi_nucleotide_search', { query: '16S ribosomal', organism: 'Faecalibacterium prausnitzii' });
    const nameTerm = esearchCalls(nameCalls)[0]!.url.searchParams.get('term')!;
    expect(nameTerm).toContain('"Faecalibacterium prausnitzii"[Organism:exp]');
    expect(nameCalls.some((c) => c.url.searchParams.get('db') === 'taxonomy')).toBe(false);
  });

  it('empty results: idlist [] -> {results: [], total: 0}, HTTP-safe (no error)', async () => {
    stubFetch((call) => {
      const term = call.url.searchParams.get('term') ?? '';
      if (term.includes('refseq[filter]')) return { ok: true, json: esearchJson([], '0') };
      return { ok: true, json: esearchJson([], '0') };
    });

    const registry = register();
    const { body, isError } = await runTool(registry, 'ncbi_nucleotide_search', { query: 'zzzqqq nonexistent' });
    expect(isError).toBe(false);
    expect(body.results).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('a 429 on the refseq pass must not fail the whole call — falls back to the general pass alone', async () => {
    stubFetch((call) => {
      if (call.url.pathname.endsWith('/esummary.fcgi')) {
        const ids = (call.url.searchParams.get('id') ?? '').split(',');
        return { ok: true, json: esummaryJson([nuccoreGeneralRow].filter((r) => ids.includes(r.uid))) };
      }
      const term = call.url.searchParams.get('term') ?? '';
      if (term.includes('refseq[filter]')) return { ok: false, status: 429 };
      return { ok: true, json: esearchJson([GENERAL_UID], '822') };
    });

    const registry = register();
    const { body, isError } = await runTool(registry, 'ncbi_nucleotide_search', { query: '16S F Prausnitzi' });
    expect(isError).toBe(false);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].accession).toBe('PZ868245');
    expect(body.results[0].canonical).toBe(false);
    expect(body.total).toBe(822);
  });
});

describe('ncbi_protein_search (protein arm)', () => {
  it('is registered and its esearch goes to db=protein', async () => {
    // Live-verified protein esummary row (keyless probe: esummary.fcgi?db=protein&id=119703343):
    // caption EAX15370, organism plain string, slen 394, biomol peptide, sourcedb insd.
    const proteinRow = {
      uid: '119703343',
      caption: 'EAX15370',
      title: 'lipid carrier protein or keto acyl-CoA thiolase ltp3 [Mycobacterium tuberculosis F11]',
      extra: 'gi|119703343|gb|EAX15370.1||gnl|WGS:AAIX|TBFT_03514',
      gi: 119703343,
      taxid: 336982,
      slen: 394,
      biomol: 'peptide',
      moltype: 'aa',
      sourcedb: 'insd',
      organism: 'Mycobacterium tuberculosis F11',
      accessionversion: 'EAX15370.1',
    };
    const calls = stubFetch((call) => {
      if (call.url.pathname.endsWith('/esummary.fcgi')) {
        const ids = (call.url.searchParams.get('id') ?? '').split(',');
        return { ok: true, json: esummaryJson([proteinRow].filter((r) => ids.includes(r.uid))) };
      }
      const term = call.url.searchParams.get('term') ?? '';
      if (term.includes('refseq[filter]')) {
        return { ok: true, json: esearchJson(['119703343'], '1') };
      }
      return { ok: true, json: esearchJson(['119703343'], '40') };
    });

    const registry = register();
    expect(registry.get('ncbi_protein_search')).toBeDefined();

    const { body, isError } = await runTool(registry, 'ncbi_protein_search', { query: 'insulin' });
    expect(isError).toBe(false);
    const searches = esearchCalls(calls);
    expect(searches.length).toBeGreaterThanOrEqual(1);
    for (const c of searches) expect(c.url.searchParams.get('db')).toBe('protein');
    expect(body.results[0].accession).toBe('EAX15370');
    expect(body.results[0].organism).toBe('Mycobacterium tuberculosis F11');
    expect(body.results[0].length).toBe(394);
    // sourcedb insd -> NOT canonical (the pin flag comes from esummary, not the db).
    expect(body.results[0].canonical).toBe(false);
    expect(body.total).toBe(40);
  });
});

describe('ncbi_gene_search organism object fix (spec §2)', () => {
  it('renders the scientificname from the gene esummary dict — never "[object Object]"', async () => {
    stubFetch((call) => {
      const db = call.url.searchParams.get('db');
      if (db === 'gene' && call.url.pathname.endsWith('/esearch.fcgi')) {
        return { ok: true, json: esearchJson(['1956'], '1') };
      }
      if (db === 'gene' && call.url.pathname.endsWith('/esummary.fcgi')) {
        // Live shape (verified: esummary.fcgi?db=gene&id=1956): organism is an OBJECT.
        return {
          ok: true,
          json: esummaryJson([{
            uid: '1956',
            name: 'EGFR',
            description: 'epidermal growth factor receptor',
            organism: { scientificname: 'Homo sapiens', commonname: 'human', taxid: 9606 },
            chromosome: '7',
            maplocation: '7p11.2',
            summary: 'The protein encoded by this gene is a transmembrane glycoprotein...',
            otheraliases: 'ERBB, ERBB1, ERRP, HER1',
          }]),
        };
      }
      return { ok: false, status: 400 };
    });

    const registry = register();
    const { body } = await runTool(registry, 'ncbi_gene_search', { query: 'EGFR', limit: 1 });
    expect(body.results[0].organism).toBe('Homo sapiens');
    expect(body.results[0].organism).not.toBe('[object Object]');
  });
});
