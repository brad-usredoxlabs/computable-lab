import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { createInterface, type Interface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { FoundryToolAgentTool } from './FoundryToolAgent.js';

const execFileAsync = promisify(execFile);

const RETRIEVAL_TIMEOUT_MS = 180_000;
const MAX_BUFFER = 32 * 1024 * 1024;

// Seeded repo config for agent-workbench's indexer. Empty `retrieval` would
// fall back to defaults whose only node_modules exclude is top-level — in a
// monorepo that lets nested app/server node_modules in (182K junk chunks).
// These excludes scope the index to real source.
const REPO_CONFIG_YAML = [
  'retrieval:',
  '  exclude:',
  '    - "**/node_modules/**"',
  '    - "node_modules/**"',
  '    - "**/dist/**"',
  '    - "dist/**"',
  '    - "**/build/**"',
  '    - "**/coverage/**"',
  '    - "**/.git/**"',
  '    - ".git/**"',
  '    - "**/.vite/**"',
  '    - "**/artifacts/**"',
  '    - "artifacts/**"',
  '',
].join('\n');

export interface RetrievalConfig {
  /** agent-workbench repo root; also the PYTHONPATH for the retrieval package. */
  workbenchRoot: string;
  /** python interpreter to run the retrieval service with. */
  python: string;
  /**
   * Neural reranker model (e.g. BAAI/bge-reranker-v2-m3). When set, queries
   * run through a persistent GPU sidecar that reranks lexical candidates with
   * a cross-encoder. When unset, retrieval is lexical-only (subprocess/call).
   */
  rerankModel?: string;
  /** Pass USE_GPU=true to the retrieval runtime so the reranker uses CUDA. */
  useGpu?: boolean;
  /** RERANK_DEVICE for the runtime (e.g. 'auto', 'cuda', 'cpu'). */
  rerankDevice?: string;
}

export interface RetrievalHit {
  relativePath: string;
  startLine: number;
  endLine: number;
  symbol?: string;
  score: number;
  text: string;
}

/**
 * Resolve retrieval config from the environment. Returns null (feature off)
 * when `AGENT_WORKBENCH_ROOT` is unset, the retrieval package is missing, or
 * `FIXIT_RETRIEVAL=0`. The Fix-it coder degrades to read/grep when disabled.
 */
export function resolveRetrievalConfig(): RetrievalConfig | null {
  if (process.env['FIXIT_RETRIEVAL'] === '0') return null;
  const workbenchRoot = process.env['AGENT_WORKBENCH_ROOT'];
  if (!workbenchRoot) return null;
  if (!existsSync(join(workbenchRoot, 'retrieval', 'service.py'))) return null;
  // Default to the workbench's own venv — it has pyyaml (the system python may
  // not) and, for Tier-2, CUDA torch + sentence-transformers. Override with
  // FIXIT_RETRIEVAL_PYTHON.
  const venvPython = join(workbenchRoot, '.venv', 'bin', 'python');
  const python = process.env['FIXIT_RETRIEVAL_PYTHON']
    ?? (existsSync(venvPython) ? venvPython : 'python3');
  const rerankModel = process.env['FIXIT_RETRIEVAL_RERANK_MODEL']?.trim();
  return {
    workbenchRoot,
    python,
    ...(rerankModel ? { rerankModel } : {}),
    useGpu: process.env['FIXIT_RETRIEVAL_USE_GPU'] !== '0',
    rerankDevice: process.env['FIXIT_RETRIEVAL_RERANK_DEVICE'] ?? 'auto',
  };
}

// Base env for the retrieval package. EMBED_MODEL is always blank (candidate
// retrieval stays lexical — no embedding index, no per-query embed load); the
// reranker, if any, is the only GPU consumer. PYTHONPATH points at the package.
function baseEnv(config: RetrievalConfig, includeRerank: boolean): NodeJS.ProcessEnv {
  const existing = process.env['PYTHONPATH'];
  return {
    ...process.env,
    PYTHONPATH: existing ? `${config.workbenchRoot}:${existing}` : config.workbenchRoot,
    EMBED_MODEL: '',
    RERANK_MODEL: includeRerank && config.rerankModel ? config.rerankModel : '',
    USE_GPU: includeRerank && config.useGpu ? 'true' : 'false',
    RERANK_DEVICE: config.rerankDevice ?? 'auto',
  };
}

// Indexing never needs the reranker (it only chunks + computes TF-IDF).
function lexicalEnv(config: RetrievalConfig): NodeJS.ProcessEnv {
  return baseEnv(config, false);
}

function indexesRootFor(stateDir: string): string {
  return join(stateDir, 'state', 'indexes');
}

async function existingIndexDir(stateDir: string): Promise<string | null> {
  const root = indexesRootFor(stateDir);
  if (!existsSync(root)) return null;
  const entries = await readdir(root).catch(() => [] as string[]);
  for (const entry of entries) {
    const dir = join(root, entry);
    if (existsSync(join(dir, 'index.manifest.json'))) return dir;
  }
  return null;
}

/**
 * Build (or reuse) a lexical index of `repoRoot` under `stateDir`. Returns the
 * index directory, or null if indexing failed — callers degrade gracefully.
 * Reuses an existing index unless `forceRebuild` is set, so the junior and
 * senior coders on the same worktree share one build.
 */
export async function buildLexicalIndex(
  config: RetrievalConfig,
  repoRoot: string,
  stateDir: string,
  forceRebuild = false,
): Promise<string | null> {
  try {
    if (!forceRebuild) {
      const existing = await existingIndexDir(stateDir);
      if (existing) return existing;
    }
    await mkdir(join(stateDir, 'config', 'repos'), { recursive: true });
    await writeFile(join(stateDir, 'config', 'repos', 'default.yaml'), REPO_CONFIG_YAML, 'utf-8');
    await execFileAsync(
      config.python,
      ['-m', 'retrieval.service', 'index', '--repo', repoRoot, '--workbench-root', stateDir],
      { env: lexicalEnv(config), timeout: RETRIEVAL_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
    );
    return await existingIndexDir(stateDir);
  } catch {
    return null;
  }
}

interface RawQueryResult {
  relative_path?: string;
  start_line?: number;
  end_line?: number;
  symbol?: string | null;
  rerank_score?: number;
  text?: string;
}

function mapHits(raw: RawQueryResult[]): RetrievalHit[] {
  return raw.map((r) => ({
    relativePath: r.relative_path ?? '?',
    startLine: r.start_line ?? 0,
    endLine: r.end_line ?? 0,
    ...(r.symbol ? { symbol: r.symbol } : {}),
    score: r.rerank_score ?? 0,
    text: r.text ?? '',
  }));
}

// One-shot lexical query via the CLI (Tier-1; no rerank model). Each call is a
// fresh process — cheap (~0.5s) because nothing heavy loads.
export async function queryLexicalIndex(
  config: RetrievalConfig,
  indexDir: string,
  query: string,
  topK: number,
): Promise<RetrievalHit[]> {
  const { stdout } = await execFileAsync(
    config.python,
    ['-m', 'retrieval.service', 'query', '--index-dir', indexDir, '--query', query, '--top-k', String(topK)],
    { env: lexicalEnv(config), timeout: RETRIEVAL_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
  );
  const parsed = JSON.parse(stdout) as { results?: RawQueryResult[] };
  return mapHits(parsed.results ?? []);
}

function formatHits(hits: RetrievalHit[]): string {
  return hits
    .map((hit, i) => {
      const sym = hit.symbol ? ` (${hit.symbol})` : '';
      let snippet = hit.text.trim();
      if (snippet.length > 600) snippet = `${snippet.slice(0, 600)}…`;
      return `[${i + 1}] ${hit.relativePath}:${hit.startLine}-${hit.endLine}${sym}\n${snippet}`;
    })
    .join('\n\n');
}

const RETRIEVE_TOOL_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'retrieve',
    description:
      'Search the repository for code by concept or symbol (e.g. "the pass that emits '
      + 'deckLayoutPlan.pinned"). Returns the most relevant code chunks with their file '
      + 'path and line range. Use this to LOCATE code before reading or paging large files.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language or code query' },
        top_k: { type: 'number', description: 'How many results to return (default 6, max 15)' },
      },
      required: ['query'],
    },
  },
};

function buildRetrieveTool(run: (query: string, topK: number) => Promise<RetrievalHit[]>): FoundryToolAgentTool {
  return {
    definition: RETRIEVE_TOOL_DEFINITION,
    handler: async (args) => {
      const started = Date.now();
      const query = typeof args['query'] === 'string' ? args['query'].trim() : '';
      if (!query) {
        return { ok: false, content: 'error: query is required', durationMs: Date.now() - started };
      }
      const rawTopK = typeof args['top_k'] === 'number' ? Math.floor(args['top_k']) : 6;
      const topK = Math.max(1, Math.min(rawTopK, 15));
      try {
        const hits = await run(query, topK);
        const content = hits.length === 0 ? '(no matches)' : formatHits(hits);
        return { ok: true, content, durationMs: Date.now() - started };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `retrieve error: ${message}`, durationMs: Date.now() - started };
      }
    },
  };
}

/**
 * A lexical `retrieve` tool (Tier-1): each call spawns a fresh CLI query.
 */
export function makeRetrieveTool(config: RetrievalConfig, indexDir: string): FoundryToolAgentTool {
  return buildRetrieveTool((query, topK) => queryLexicalIndex(config, indexDir, query, topK));
}

/**
 * Persistent GPU retrieval sidecar (Tier-2). Spawns one Python process that
 * loads the index and warms the neural reranker once, then answers queries
 * over stdin/stdout — so the 2GB+ cross-encoder is not reloaded per call.
 * Queries are serialized (the tool agent calls retrieve one at a time).
 */
export class RetrievalSidecar {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: Interface | null = null;
  private pending: Array<(line: string) => void> = [];
  private chain: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(private readonly config: RetrievalConfig, private readonly indexDir: string) {}

  /** Spawn + warm the sidecar. Returns false (caller degrades) on any failure. */
  async start(timeoutMs = 120_000): Promise<boolean> {
    if (!this.config.rerankModel) return false;
    let script: string;
    try {
      script = fileURLToPath(new URL('./retrieval_sidecar.py', import.meta.url));
    } catch {
      return false;
    }
    if (!existsSync(script)) return false;
    try {
      this.proc = spawn(this.config.python, [script, '--index-dir', this.indexDir], {
        env: baseEnv(this.config, true),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      return false;
    }
    this.proc.stderr.on('data', () => { /* swallow torch / HF progress chatter */ });
    this.rl = createInterface({ input: this.proc.stdout });

    const ready = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const onReadyLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let parsed: { ready?: boolean } | null = null;
        try { parsed = JSON.parse(trimmed) as { ready?: boolean }; } catch { return; }
        if (parsed && 'ready' in parsed) {
          this.rl?.off('line', onReadyLine);
          // All subsequent lines are query responses, correlated FIFO.
          this.rl?.on('line', (l) => {
            const resolver = this.pending.shift();
            if (resolver) resolver(l);
          });
          finish(parsed.ready === true);
        }
      };
      this.rl!.on('line', onReadyLine);
      this.proc!.on('exit', () => finish(false));
      this.proc!.on('error', () => finish(false));
      setTimeout(() => finish(false), timeoutMs);
    });

    if (!ready) {
      this.dispose();
      return false;
    }
    return true;
  }

  query(query: string, topK: number, timeoutMs = 30_000): Promise<RetrievalHit[]> {
    const run = this.chain.then(() => this.queryOnce(query, topK, timeoutMs));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private queryOnce(query: string, topK: number, timeoutMs: number): Promise<RetrievalHit[]> {
    if (this.closed || !this.proc?.stdin.writable) {
      return Promise.reject(new Error('retrieval sidecar not running'));
    }
    return new Promise<RetrievalHit[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        // A late, out-of-band response would desync FIFO correlation, so a
        // timeout is fatal to the sidecar — kill it and degrade to read/grep.
        this.dispose();
        reject(new Error('retrieval sidecar query timed out'));
      }, timeoutMs);
      this.pending.push((line: string) => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(line) as { results?: RawQueryResult[]; error?: string };
          if (parsed.error) reject(new Error(parsed.error));
          else resolve(mapHits(parsed.results ?? []));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      this.proc!.stdin.write(`${JSON.stringify({ query, top_k: topK })}\n`);
    });
  }

  dispose(): void {
    this.closed = true;
    try { this.rl?.close(); } catch { /* */ }
    try { this.proc?.stdin.end(); } catch { /* */ }
    try { this.proc?.kill(); } catch { /* */ }
    this.proc = null;
    this.rl = null;
    this.pending = [];
  }
}

/** A `retrieve` tool backed by a warm GPU sidecar (Tier-2). */
export function makeRetrieveToolFromSidecar(sidecar: RetrievalSidecar): FoundryToolAgentTool {
  return buildRetrieveTool((query, topK) => sidecar.query(query, topK));
}
