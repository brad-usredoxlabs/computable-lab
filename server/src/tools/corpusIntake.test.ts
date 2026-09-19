/**
 * corpusIntake runner tests — every network/LLM/ingest edge is stubbed.
 * The default ingestFn (dynamic import of ProtocolIntakeService) is never
 * loaded here: tests always inject ingestFn.
 */
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCorpusIntake, readSearchResults, type CorpusIntakeRunnerDeps } from './corpusIntake.js';
import type { ResolvedExaConfig } from '../integrations/exa.js';
import type { FoundryPdfCollectionReport } from '../foundry/FoundryPdfCollector.js';

const CONFIG: ResolvedExaConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://api.exa.ai',
  defaultSearchType: 'auto',
  defaultContentMode: 'highlights',
  defaultMaxCharacters: 4000,
  timeoutMs: 20_000,
};

async function withWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'corpus-intake-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function topicsFixture(dir: string, body = `
version: 1
search:
  category: research paper
  numResults: 3
  includeDomains: []
  contentMode: highlights
topics:
  - id: alpha
    query: "alpha protocol manual PDF"
  - id: beta
    query: "beta protocol manual PDF"
`): Promise<string> {
  const path = join(dir, 'topics.yaml');
  await mkdir(join(dir), { recursive: true });
  await writeFile(path, body, 'utf-8');
  return path;
}

function collectionReport(overrides: Partial<FoundryPdfCollectionReport> = {}): FoundryPdfCollectionReport {
  return {
    kind: 'protocol-foundry-pdf-collection-report',
    generated_at: '2026-09-18T00:00:00.000Z',
    artifactRoot: '/tmp/artifacts/foundry',
    targetCount: 4,
    found: 3,
    counts: { downloaded: 1, skippedDuplicate: 1, failed: 1 },
    records: [
      { vendor: 'v1.example.com', title: 'Kit A manual', sourceUrl: 'https://v1.example.com/a.pdf', searchQuery: 'q', status: 'downloaded', pdfPath: '/tmp/artifacts/foundry/pdfs/a.pdf' },
      { vendor: 'v2.example.com', title: 'Kit B manual', sourceUrl: 'https://v2.example.com/b.pdf', searchQuery: 'q', status: 'skipped_duplicate', pdfPath: '/tmp/artifacts/foundry/pdfs/b.pdf' },
      { vendor: 'v3.example.com', title: 'broken', sourceUrl: 'https://v3.example.com/c', searchQuery: 'q', status: 'failed', message: 'HTML not PDF' },
    ],
    ...overrides,
  };
}

describe('readSearchResults', () => {
  it('accepts the Hermes-style web key and the raw results key', () => {
    expect(readSearchResults({ web: [{ title: 'A', url: 'https://x.test/a.pdf' }] })).toEqual([
      { title: 'A', url: 'https://x.test/a.pdf' },
    ]);
    expect(readSearchResults({ results: [{ url: 'https://x.test/b' }] })).toEqual([
      { title: 'b', url: 'https://x.test/b' },
    ]);
  });

  it('skips junk: non-http urls, missing urls, non-objects', () => {
    expect(readSearchResults({ web: [{ url: 'ftp://x.test/a' }, { title: 'no url' }, 'junk', null] })).toEqual([]);
    expect(readSearchResults(null)).toEqual([]);
    expect(readSearchResults('nope')).toEqual([]);
  });
});

describe('runCorpusIntake', () => {
  it('maps search results to collection candidates per topic', async () => {
    await withWorkspace(async (dir) => {
      const topicsPath = await topicsFixture(dir);
      const searchFn = vi.fn(async (_c: ResolvedExaConfig, query: string) => ({
        web: [
          { title: `Hit for ${query}`, url: `https://v.test/${encodeURIComponent(query)}.pdf` },
          { title: 'second', url: 'https://v.test/second.pdf' },
          { title: 'third', url: 'https://v.test/third.pdf' },
          { title: 'fourth over cap', url: 'https://v.test/fourth.pdf' },
        ],
      }));
      const collectFn = vi.fn(async () => collectionReport());
      const ingestFn = vi.fn(async () => ({
        documentId: 'doc-a', treeRecordId: 'PDT-doc-a', proposalRecordIds: ['SGP-doc-a-b0-s0'], eventGraphRecordIds: ['EVG-1'], diagnostics: [],
      }));
      const result = await runCorpusIntake({
        workspaceRoot: dir, topicsPath, searchFn, collectFn, ingestFn,
        resolveConfigFn: () => CONFIG,
      } as unknown as CorpusIntakeRunnerDeps);

      expect(result.searchedTopics).toBe(2);
      // numResults cap from topics.yaml (3): topic alpha contributes 3,
      // topic beta 1 (its 2nd/3rd urls dedupe against alpha's run-wide set).
      const call = collectFn.mock.calls[0]![0] as { candidates: Array<Record<string, unknown>> };
      expect(call.candidates).toHaveLength(4);
      expect(call.candidates[0]).toMatchObject({ vendor: 'v.test', searchQuery: 'alpha protocol manual PDF' });
      expect(result.ok).toBe(true);
      // The default fixture carries one 'downloaded' and one
      // 'skipped_duplicate' (with pdfPath): both are offered to intake so
      // nightly converges; 'failed' is crawl noise only.
      expect(result.ingested).toBe(2);
      expect(result.proposals).toBe(2);
      expect(ingestFn).toHaveBeenCalledTimes(2);
      expect(ingestFn.mock.calls[0]![0]).toMatchObject({ artifactPath: '/tmp/artifacts/foundry/pdfs/a.pdf', vendor: 'v1.example.com' });
      expect(ingestFn.mock.calls[1]![0]).toMatchObject({ artifactPath: '/tmp/artifacts/foundry/pdfs/b.pdf', vendor: 'v2.example.com' });

      // Run report written with totals.
      const run = JSON.parse(await readFile(join(dir, 'artifacts', 'foundry', 'intake', 'latest-run.json'), 'utf-8'));
      expect(run.collected.downloaded).toBe(1);
      expect(run.ok).toBe(true);
    });
  });

  it('dry-run never ingests', async () => {
    await withWorkspace(async (dir) => {
      const topicsPath = await topicsFixture(dir, `
version: 1
search: { category: research paper, numResults: 1, includeDomains: [], contentMode: highlights }
topics:
  - id: alpha
    query: "alpha PDF"
`);
      const ingestFn = vi.fn();
      const result = await runCorpusIntake({
        workspaceRoot: dir,
        topicsPath,
        searchFn: async () => ({ web: [{ title: 'A', url: 'https://v.test/a.pdf' }] }),
        collectFn: async () => collectionReport(),
        ingestFn,
        resolveConfigFn: () => CONFIG,
        dryRun: true,
      } as unknown as CorpusIntakeRunnerDeps);
      expect(ingestFn).not.toHaveBeenCalled();
      expect(result.ingested).toBe(0);
      expect(result.dryRun).toBe(true);
    });
  });

  it('fails loud without an Exa key — never a synthetic corpus', async () => {
    await withWorkspace(async (dir) => {
      const topicsPath = await topicsFixture(dir);
      const result = await runCorpusIntake({
        workspaceRoot: dir,
        topicsPath,
        searchFn: async () => { throw new Error('must not search'); },
        collectFn: async () => collectionReport(),
        ingestFn: async () => ({ documentId: '', treeRecordId: '', proposalRecordIds: [], eventGraphRecordIds: [], diagnostics: [] }),
        resolveConfigFn: () => null,
      } as unknown as CorpusIntakeRunnerDeps);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('EXA_NOT_CONFIGURED');
    });
  });

  it('default config resolver reads integrations.exa from <workspace>/config.yaml', async () => {
    await withWorkspace(async (dir) => {
      const topicsPath = await topicsFixture(dir);
      await writeFile(
        join(dir, 'config.yaml'),
        [
          'integrations:',
          '  exa:',
          '    enabled: true',
          '    apiKey: file-key-123',
          '    defaultSearchType: auto',
        ].join('\n'),
        'utf8',
      );
      const searchFn = vi.fn(async () => ({ web: [] }));
      const result = await runCorpusIntake({
        workspaceRoot: dir,
        topicsPath,
        searchFn,
        collectFn: async () => collectionReport({ found: 0, counts: { downloaded: 0, skippedDuplicate: 0, failed: 0 }, records: [] }),
        ingestFn: async () => ({ documentId: '', treeRecordId: '', proposalRecordIds: [], eventGraphRecordIds: [], diagnostics: [] }),
        // NOTE: no resolveConfigFn — exercises the default loader path.
      } as unknown as CorpusIntakeRunnerDeps);
      expect(result.ok).toBe(true);
      expect(searchFn).toHaveBeenCalled();
      expect(searchFn.mock.calls[0]![0]).toMatchObject({ apiKey: 'file-key-123' });
    });
  });

  it('throws on an empty topics file', async () => {
    await withWorkspace(async (dir) => {
      const topicsPath = await topicsFixture(dir, 'version: 1\ntopics: []\n');
      await expect(runCorpusIntake({
        workspaceRoot: dir,
        topicsPath,
        searchFn: async () => ({}),
        collectFn: async () => collectionReport(),
        ingestFn: async () => ({ documentId: '', treeRecordId: '', proposalRecordIds: [], eventGraphRecordIds: [], diagnostics: [] }),
        resolveConfigFn: () => CONFIG,
      } as unknown as CorpusIntakeRunnerDeps)).rejects.toThrow(/no topics/);
    });
  });

  it('dedupes urls repeated across topics', async () => {
    await withWorkspace(async (dir) => {
      const topicsPath = await topicsFixture(dir);
      const collectFn = vi.fn(async () => collectionReport({ counts: { downloaded: 0, skippedDuplicate: 2, failed: 0 }, records: [], found: 0 }));
      await runCorpusIntake({
        workspaceRoot: dir,
        topicsPath,
        searchFn: async () => ({ web: [{ title: 'same', url: 'https://v.test/same.pdf' }] }),
        collectFn,
        ingestFn: async () => ({ documentId: '', treeRecordId: '', proposalRecordIds: [], eventGraphRecordIds: [], diagnostics: [] }),
        resolveConfigFn: () => CONFIG,
      } as unknown as CorpusIntakeRunnerDeps);
      const call = collectFn.mock.calls[0]![0] as { candidates: Array<Record<string, unknown>> };
      expect(call.candidates).toHaveLength(1);
    });
  });

  it('re-offers previously-downloaded PDFs (skipped_duplicate) to intake so nightly converges', async () => {
    await withWorkspace(async (dir) => {
      const topicsPath = await topicsFixture(dir, `
version: 1
search:
  numResults: 3
topics:
  - id: dna-kits
    query: dna purification kit protocol pdf
`);
      // Nightly run #1 downloaded a.pdf; run #2 sees it as skipped_duplicate
      // with its artifact path — intake must still be offered (the service
      // dedupes tree/proposal records itself), or an interrupted run never
      // converges.
      const ingestFn = vi.fn(async () => ({
        documentId: 'DOC-A',
        treeRecordId: 'PDT-DOC-A',
        proposalRecordIds: ['SGP-DOC-A-b0-s0'],
        eventGraphRecordIds: [],
        diagnostics: [{ severity: 'info', code: 'tree_exists', message: 'reusing' }],
      }));
      const result = await runCorpusIntake({
        workspaceRoot: dir,
        topicsPath,
        searchFn: async () => ({ web: [{ title: 'A kit', url: 'https://v.test/a.pdf' }] }),
        collectFn: async () => collectionReport({
          found: 1,
          counts: { downloaded: 0, skippedDuplicate: 1, failed: 0 },
          records: [{
            title: 'A kit',
            url: 'https://v.test/a.pdf',
            vendor: 'v.test',
            status: 'skipped_duplicate',
            pdfPath: join(dir, 'artifacts', 'foundry', 'pdfs', 'a.pdf'),
          }],
        }),
        ingestFn,
        resolveConfigFn: () => CONFIG,
      } as unknown as CorpusIntakeRunnerDeps);
      expect(ingestFn).toHaveBeenCalledTimes(1);
      expect(result.proposals).toBe(1);
      const pdfRow = result.perPdf.find((p) => p.title === 'A kit');
      expect(pdfRow?.status).toBe('ingested');
    });
  });

  it('records per-pdf ingest failures without aborting the run', async () => {
    await withWorkspace(async (dir) => {
      const topicsPath = await topicsFixture(dir, `
version: 1
search: { category: research paper, numResults: 1, includeDomains: [], contentMode: highlights }
topics:
  - id: alpha
    query: "alpha PDF"
`);
      const result = await runCorpusIntake({
        workspaceRoot: dir,
        topicsPath,
        searchFn: async () => ({ web: [{ title: 'A', url: 'https://v.test/a.pdf' }] }),
        collectFn: async () => collectionReport(),
        ingestFn: async () => { throw new Error('extract blew up'); },
        resolveConfigFn: () => CONFIG,
      } as unknown as CorpusIntakeRunnerDeps);
      expect(result.ok).toBe(false);
      expect(result.perPdf[0]).toMatchObject({ status: 'failed', error: 'extract blew up' });
    });
  });
});
