#!/usr/bin/env node
/**
 * corpusIntake — nightly vendor-protocol corpus crawl.
 *
 * Exa literature/kit search -> byte-validated dedupe download
 * (FoundryPdfCollector) -> per new PDF: decision tree + deterministic
 * subgraph proposals (ProtocolIntakeService). Topics are DATA
 * (config/corpus-intake/topics.yaml); the runner hardcodes none.
 *
 * Without an Exa key the run fails loud (EXA_NOT_CONFIGURED) — the system
 * never fakes a corpus. ProtocolIntakeService is loaded via dynamic import
 * inside the default ingest adapter only, keeping this module graph light
 * for tests (which always inject ingestFn).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readYamlFile } from '../foundry/FoundryArtifacts.js';
import { loadConfig } from '../config/loader.js';
import {
  collectFoundryPdfs,
  type FoundryPdfCollectionCandidate,
  type FoundryPdfCollectionReport,
} from '../foundry/FoundryPdfCollector.js';
import { exaSearch, resolveExaConfig, type ResolvedExaConfig } from '../integrations/exa.js';
// Type-only import: erased at compile time, so the test module graph never
// loads the intake service (its runtime load stays lazy in defaultIngestFn).
import type { IngestPdfResult } from '../protocol-intake/ProtocolIntakeService.js';

interface TopicsFile {
  version?: number;
  search: {
    category?: string;
    numResults?: number;
    includeDomains?: string[];
    contentMode?: 'highlights' | 'text' | 'summary';
  };
  topics: Array<{ id: string; query: string }>;
}

export interface CorpusIntakeRunnerDeps {
  workspaceRoot: string;
  topicsPath: string;
  searchFn?: (config: ResolvedExaConfig, query: string, search: NonNullable<TopicsFile['search']>) => Promise<unknown>;
  collectFn?: (options: { artifactRoot: string; candidates: FoundryPdfCollectionCandidate[]; targetCount?: number }) => Promise<FoundryPdfCollectionReport>;
  ingestFn?: (args: { artifactPath: string; vendor: string; maxProposals?: number }) => Promise<IngestPdfResult>;
  resolveConfigFn?: () => ResolvedExaConfig | null | Promise<ResolvedExaConfig | null>;
  perTopic?: number;
  maxProposals?: number;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface CorpusIntakeRunResult {
  ok: boolean;
  reason?: string;
  dryRun?: boolean;
  searchedTopics: number;
  collected: { downloaded: number; skippedDuplicate: number; failed: number };
  ingested: number;
  proposals: number;
  perPdf: Array<{ title: string; status: string; documentId?: string; proposalCount?: number; error?: string }>;
}

/** Accepts Hermes-style {web:[...]} or raw Exa {results:[...]} shapes. */
export function readSearchResults(raw: unknown): Array<{ title: string; url: string }> {
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  const list = Array.isArray(record['web'])
    ? record['web']
    : Array.isArray(record['results'])
      ? record['results']
      : [];
  const out: Array<{ title: string; url: string }> = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const url = (item as Record<string, unknown>)['url'];
    if (typeof url !== 'string') continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    const title = (item as Record<string, unknown>)['title'];
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
    out.push({ title: typeof title === 'string' && title.trim() ? title.trim() : lastSegment ?? parsed.hostname, url });
  }
  return out;
}

function readArg(name: string, args: string[]): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function usage(): string {
  return [
    'Usage: npm run corpus:intake -w server -- [--topics <yaml>] [options]',
    '',
    'Options:',
    '  --topics <yaml>        Topics data file. Default <workspace>/config/corpus-intake/topics.yaml',
    '  --workspace-root <dir> Default $APP_BASE_PATH (or repo root from server/).',
    '  --per-topic <n>        Results per topic (overrides topics.yaml search.numResults).',
    '  --max-proposals <n>    Cap on branch bindings per document. Default 12.',
    '  --dry-run              Search + collect only; no intake.',
    '',
    'Exit codes: 0 ok, 1 run failures, 2 EXA_NOT_CONFIGURED.',
  ].join('\n');
}

export async function runCorpusIntake(deps: CorpusIntakeRunnerDeps): Promise<CorpusIntakeRunResult> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const workspaceRoot = resolve(deps.workspaceRoot);

  const topicsRaw = await readYamlFile<unknown>(resolve(deps.topicsPath));
  const topicsFile = (topicsRaw ?? {}) as Partial<TopicsFile>;
  const topics = Array.isArray(topicsFile.topics) ? topicsFile.topics.filter((t) => t && t.query) : [];
  if (topics.length === 0) {
    throw new Error(`topics file has no topics: ${deps.topicsPath}`);
  }
  const search = topicsFile.search ?? {};

  const config = await (deps.resolveConfigFn ??
    (async () => {
      // Same config surface the server uses: <workspace>/config.yaml
      // (integrations.exa.apiKey), with the EXA_API_KEY env fallback
      // inside resolveExaConfig.
      const app = await loadConfig({ configPath: join(workspaceRoot, 'config.yaml') });
      return resolveExaConfig(app);
    }))();
  if (!config) {
    return {
      ok: false,
      reason: 'EXA_NOT_CONFIGURED — set EXA_API_KEY or integrations.exa.apiKey (no synthetic corpus)',
      searchedTopics: 0,
      collected: { downloaded: 0, skippedDuplicate: 0, failed: 0 },
      ingested: 0,
      proposals: 0,
      perPdf: [],
    };
  }

  const searchFn = deps.searchFn
    ?? ((cfg: ResolvedExaConfig, query: string, s: NonNullable<TopicsFile['search']>) =>
      exaSearch(cfg, {
        query,
        ...(s.category ? { category: s.category as 'research paper' } : {}),
        ...(s.includeDomains?.length ? { includeDomains: s.includeDomains } : {}),
        ...(typeof s.numResults === 'number' ? { numResults: s.numResults } : {}),
        ...(s.contentMode ? { contentMode: s.contentMode } : {}),
      }));
  const collectFn = deps.collectFn ?? collectFoundryPdfs;

  const perTopic = deps.perTopic ?? (typeof search.numResults === 'number' ? search.numResults : 5);

  // Search all topics, dedupe by url across the run.
  const candidates: FoundryPdfCollectionCandidate[] = [];
  const seenUrls = new Set<string>();
  for (const topic of topics) {
    log(`searching topic ${topic.id}: ${topic.query}`);
    const raw = await searchFn(config, topic.query, search);
    for (const result of readSearchResults(raw).slice(0, perTopic)) {
      const key = result.url.toLowerCase();
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      candidates.push({
        vendor: new URL(result.url).hostname,
        title: result.title,
        sourceUrl: result.url,
        searchQuery: topic.query,
      });
    }
  }

  // Resolve the ingest runtime BEFORE collecting: in embedded-git mode the
  // app relocates its workspace root into the lab-data worktree, and PDF
  // bytes must be collected under THAT root (the extractor enforces the
  // artifact boundary relative to ctx.workspaceRoot). Injected ingestFn
  // (tests, embedders) keeps the caller's root — no app boot.
  let effectiveRoot = workspaceRoot;
  let ingestFn = deps.ingestFn;
  if (!ingestFn) {
    const runtime = await resolveIntakeRuntime(workspaceRoot);
    ingestFn = runtime.ingestFn;
    effectiveRoot = runtime.workspaceRoot;
    if (effectiveRoot !== workspaceRoot) {
      log(`app relocated workspace root -> ${effectiveRoot} (artifacts + records collected there)`);
    }
  }

  const artifactRoot = join(effectiveRoot, 'artifacts', 'foundry');
  const report = await collectFn({
    artifactRoot,
    candidates,
    targetCount: candidates.length,
  });

  const perPdf: CorpusIntakeRunResult['perPdf'] = [];
  let ingested = 0;
  let proposals = 0;
  let anyFailed = false;

  if (deps.dryRun) {
    for (const record of report.records) {
      if (record.status === 'downloaded') {
        perPdf.push({ title: record.title, status: 'dry_run_would_ingest' });
      }
    }
  } else {
    for (const record of report.records) {
      // 'skipped_duplicate' means the bytes are already in the artifact
      // store from a previous crawl — still offer them to intake so nightly
      // converges an interrupted run (the intake service dedupes tree and
      // proposal records itself: 'tree_exists' / 'proposal_exists').
      const ingestable = record.status === 'downloaded' || record.status === 'skipped_duplicate';
      if (!ingestable) {
        // Download-level failures (HTML-instead-of-PDF, 403s) are normal
        // crawl noise: recorded, but they do not fail the run. Only intake
        // (tree/proposal) errors do.
        perPdf.push({
          title: record.title,
          status: record.status,
          ...(record.message ? { error: record.message } : {}),
        });
        continue;
      }
      if (!record.pdfPath) {
        perPdf.push({ title: record.title, status: 'skipped_no_path' });
        continue;
      }
      try {
        const ingest = await ingestFn({
          artifactPath: record.pdfPath,
          vendor: record.vendor,
          ...(typeof deps.maxProposals === 'number' ? { maxProposals: deps.maxProposals } : {}),
        });
        ingested += 1;
        proposals += ingest.proposalRecordIds.length;
        perPdf.push({
          title: record.title,
          status: 'ingested',
          documentId: ingest.documentId,
          proposalCount: ingest.proposalRecordIds.length,
        });
        for (const diagnostic of ingest.diagnostics) {
          if (diagnostic.severity === 'error') {
            anyFailed = true;
            log(`  error ${ingest.documentId}: ${diagnostic.code} ${diagnostic.message}`);
          }
        }
      } catch (err) {
        anyFailed = true;
        const message = err instanceof Error ? err.message : String(err);
        perPdf.push({ title: record.title, status: 'failed', error: message });
        log(`  ingest failed for ${record.title}: ${message}`);
      }
    }
  }

  const runResult: CorpusIntakeRunResult = {
    ok: !anyFailed,
    ...(deps.dryRun ? { dryRun: true } : {}),
    searchedTopics: topics.length,
    collected: { ...report.counts },
    ingested,
    proposals,
    perPdf,
  };

  const reportPath = join(effectiveRoot, 'artifacts', 'foundry', 'intake', 'latest-run.json');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...runResult }, null, 2)}\n`, 'utf-8');

  for (const pdf of perPdf) {
    log(`${pdf.status}\t${pdf.title}${pdf.proposalCount ? ` -> ${pdf.proposalCount} proposals` : ''}${pdf.error ? ` (${pdf.error})` : ''}`);
  }
  log(`total: searched=${topics.length} downloaded=${report.counts.downloaded} skipped=${report.counts.skippedDuplicate} failed=${report.counts.failed} ingested=${ingested} proposals=${proposals}`);
  return runResult;
}

/**
 * Default ingest runtime for the CLI: boots a real AppContext (schemas +
 * validator + store) the same way mcp-stdio.ts does and returns BOTH the
 * ingest edge and the workspace root the app actually resolved.
 *
 * Why the root is returned: in embedded-git mode (the default repo config)
 * the app relocates its workspaceRoot into the lab-data worktree
 * (~/.computable-lab/worktrees/main). Artifacts — records, PDFs, the run
 * report — all belong beside the records, NOT beside the code repo: the
 * review UI resolves artifactPath relative to ctx.workspaceRoot. Collection
 * therefore uses the relocated root, so paths satisfy the extractor's
 * 'artifactPath must be inside <root>/artifacts/foundry/pdfs' boundary by
 * construction. The boundary itself is enforced by the candidate extractor
 * (single authority — never duplicated here).
 *
 * Dynamic imports keep all of this out of the test module graph.
 */
export interface IntakeRuntime {
  workspaceRoot: string;
  ingestFn: NonNullable<CorpusIntakeRunnerDeps['ingestFn']>;
}

export async function resolveIntakeRuntime(
  workspaceRoot: string,
  deps?: {
    appBooter?: (base: string) => Promise<{ workspaceRoot: string; store: unknown; validator: unknown; extractionRunner?: unknown }>;
  },
): Promise<IntakeRuntime> {
  const booter =
    deps?.appBooter ??
    (async (base: string) => {
      const { initializeApp } = await import('../server.js');
      const ctx = await initializeApp(base);
      return { workspaceRoot: ctx.workspaceRoot, store: ctx.store, validator: ctx.validator, extractionRunner: ctx.extractionRunner };
    });
  const ctx = await booter(workspaceRoot);
  const root = typeof ctx.workspaceRoot === 'string' && ctx.workspaceRoot.length > 0 ? ctx.workspaceRoot : workspaceRoot;
  const { ProtocolIntakeService } = await import('../protocol-intake/ProtocolIntakeService.js');
  // Compile edge: same construction the review API (ProtocolIntakeHandlers)
  // uses, so nightly drafts are AI-compiled whenever the extractor profile
  // is configured. Dynamic imports here keep the module graph free of
  // server.js at load time (the default booter loads it on demand anyway).
  let compileRunner: ConstructorParameters<typeof ProtocolIntakeService>[0]['compileRunner'];
  if (ctx.extractionRunner) {
    const { runChatbotCompile } = await import('../ai/runChatbotCompile.js');
    const { createLabwareLookup } = await import('../ai/compiler/labwareLookup.js');
    const store = ctx.store as never;
    const extractionService = ctx.extractionRunner as never;
    const searchLabwareByHint = createLabwareLookup(store);
    compileRunner = ({ prompt, deterministicOnly }) =>
      runChatbotCompile({
        prompt,
        deterministicOnly,
        deps: { extractionService, llmClient: null, searchLabwareByHint, store },
      });
  }
  const service = new ProtocolIntakeService({
    workspaceRoot: root,
    store: ctx.store as never,
    ...(ctx.validator ? { validator: ctx.validator as never } : {}),
    ...(compileRunner ? { compileRunner } : {}),
  });
  return { workspaceRoot: root, ingestFn: (args) => service.ingestDocument(args) };
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return 0;
  }
  const cwd = process.cwd();
  const workspaceRoot = resolve(
    readArg('--workspace-root', args)
      ?? process.env.APP_BASE_PATH
      ?? (cwd.endsWith('server') || cwd.endsWith('server/') ? resolve(cwd, '..') : cwd),
  );
  const topicsPath = resolve(readArg('--topics', args) ?? join(workspaceRoot, 'config', 'corpus-intake', 'topics.yaml'));
  const perTopic = readArg('--per-topic', args);
  const maxProposals = readArg('--max-proposals', args);

  const result = await runCorpusIntake({
    workspaceRoot,
    topicsPath,
    ...(perTopic ? { perTopic: Number.parseInt(perTopic, 10) } : {}),
    ...(maxProposals ? { maxProposals: Number.parseInt(maxProposals, 10) } : {}),
    ...(args.includes('--dry-run') ? { dryRun: true } : {}),
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.ok) return 0;
  if (result.reason?.startsWith('EXA_NOT_CONFIGURED')) return 2;
  return 1;
}

// CLI entry guard: tests import runCorpusIntake without triggering main().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
