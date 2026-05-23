import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildLexicalIndex,
  makeRetrieveTool,
  queryLexicalIndex,
  resolveRetrievalConfig,
  RetrievalSidecar,
  type RetrievalConfig,
} from './RetrievalIndex.js';

const execFileAsync = promisify(execFile);

// The end-to-end index/query test needs python3 + the agent-workbench
// retrieval package. Skip (don't fail) when they aren't available, so CI
// without the optional dependency stays green.
async function probeWorkbench(): Promise<RetrievalConfig | null> {
  const workbenchRoot = process.env['AGENT_WORKBENCH_ROOT'] ?? join(process.env['HOME'] ?? '', 'git', 'agent-workbench');
  if (!existsSync(join(workbenchRoot, 'retrieval', 'service.py'))) return null;
  const python = process.env['FIXIT_RETRIEVAL_PYTHON'] ?? 'python3';
  try {
    await execFileAsync(python, ['--version']);
  } catch {
    return null;
  }
  return { workbenchRoot, python };
}

describe('RetrievalIndex (lexical, end-to-end)', () => {
  let config: RetrievalConfig | null = null;
  let repo = '';
  let stateDir = '';

  beforeAll(async () => {
    config = await probeWorkbench();
    if (!config) return;
    repo = await mkdtemp(join(tmpdir(), 'retrieval-repo-'));
    stateDir = await mkdtemp(join(tmpdir(), 'retrieval-state-'));
    await mkdir(join(repo, 'src'), { recursive: true });
    await writeFile(
      join(repo, 'src', 'deck.ts'),
      'export function planDeckLayout(cands: L[]) {\n'
      + '  // produces deckLayoutPlan.pinned from candidate labwares\n'
      + '  const pinned = cands.map((c) => ({ slot: c.deckSlot, labwareHint: c.hint }))\n'
      + '  return { pinned }\n}\n',
      'utf-8',
    );
    await writeFile(join(repo, 'src', 'unrelated.ts'), 'export const x = 42\n', 'utf-8');
    await execFileAsync('git', ['init', '-q'], { cwd: repo });
    await execFileAsync('git', ['add', '-A'], { cwd: repo });
    await execFileAsync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo });
  });

  afterAll(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
    if (stateDir) await rm(stateDir, { recursive: true, force: true });
  });

  it('builds a lexical index and surfaces the relevant chunk by concept query', async () => {
    if (!config) {
      console.warn('[RetrievalIndex.test] skipped: agent-workbench/python3 not available');
      return;
    }
    const indexDir = await buildLexicalIndex(config, repo, stateDir);
    expect(indexDir).toBeTruthy();
    expect(existsSync(join(indexDir!, 'index.manifest.json'))).toBe(true);

    const hits = await queryLexicalIndex(config, indexDir!, 'where is deckLayoutPlan pinned produced', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.relativePath === 'src/deck.ts')).toBe(true);
    // Lexical retrieval ranks the deck file above the unrelated one.
    expect(hits[0]!.relativePath).toBe('src/deck.ts');
  });

  it('reuses an existing index instead of rebuilding', async () => {
    if (!config) return;
    const first = await buildLexicalIndex(config, repo, stateDir);
    const second = await buildLexicalIndex(config, repo, stateDir);
    expect(second).toBe(first);
  });
});

// Tier-2 (CUDA reranker) needs the workbench .venv python + the cached
// reranker model. Skip otherwise so CI without a GPU stays green.
function probeTier2(): RetrievalConfig | null {
  const workbenchRoot = process.env['AGENT_WORKBENCH_ROOT'] ?? join(process.env['HOME'] ?? '', 'git', 'agent-workbench');
  const venvPython = join(workbenchRoot, '.venv', 'bin', 'python');
  const rerankModel = 'BAAI/bge-reranker-v2-m3';
  const cached = join(process.env['HOME'] ?? '', '.cache', 'huggingface', 'hub', 'models--BAAI--bge-reranker-v2-m3');
  if (!existsSync(join(workbenchRoot, 'retrieval', 'service.py'))) return null;
  if (!existsSync(venvPython)) return null;
  if (!existsSync(cached)) return null;
  return { workbenchRoot, python: venvPython, rerankModel, useGpu: true, rerankDevice: 'auto' };
}

describe('RetrievalSidecar (CUDA reranker, end-to-end)', () => {
  let config: RetrievalConfig | null = null;
  let repo = '';
  let stateDir = '';
  let indexDir: string | null = null;
  let sidecar: RetrievalSidecar | null = null;

  beforeAll(async () => {
    config = probeTier2();
    if (!config) return;
    repo = await mkdtemp(join(tmpdir(), 'sidecar-repo-'));
    stateDir = await mkdtemp(join(tmpdir(), 'sidecar-state-'));
    await mkdir(join(repo, 'src'), { recursive: true });
    await writeFile(
      join(repo, 'src', 'deck.ts'),
      'export function planDeckLayout(cands) {\n'
      + '  const pinned = cands.map((c) => ({ slot: c.deckSlot, labwareHint: c.hint }))\n'
      + '  return { pinned }\n}\n',
      'utf-8',
    );
    await writeFile(join(repo, 'src', 'noise.ts'), 'export const greeting = "hello world"\n', 'utf-8');
    await execFileAsync('git', ['init', '-q'], { cwd: repo });
    await execFileAsync('git', ['add', '-A'], { cwd: repo });
    await execFileAsync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo });
    indexDir = await buildLexicalIndex(config, repo, stateDir);
  }, 60_000);

  afterAll(async () => {
    sidecar?.dispose();
    if (repo) await rm(repo, { recursive: true, force: true });
    if (stateDir) await rm(stateDir, { recursive: true, force: true });
  });

  it('warms once and reranks queries from the same process', async () => {
    if (!config || !indexDir) {
      console.warn('[RetrievalIndex.test] Tier-2 skipped: venv/model not available');
      return;
    }
    sidecar = new RetrievalSidecar(config, indexDir);
    const started = await sidecar.start();
    expect(started).toBe(true);

    const first = await sidecar.query('where is deckLayoutPlan pinned produced', 5);
    expect(first.length).toBeGreaterThan(0);
    expect(first[0]!.relativePath).toBe('src/deck.ts');

    // Second query reuses the warm model (no reload) — should be quick.
    const t0 = Date.now();
    const second = await sidecar.query('deck slot pinned labware hint', 5);
    expect(second.length).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(10_000);
  }, 120_000);
});

describe('resolveRetrievalConfig', () => {
  it('returns null when AGENT_WORKBENCH_ROOT is unset', () => {
    const prev = process.env['AGENT_WORKBENCH_ROOT'];
    delete process.env['AGENT_WORKBENCH_ROOT'];
    try {
      expect(resolveRetrievalConfig()).toBeNull();
    } finally {
      if (prev !== undefined) process.env['AGENT_WORKBENCH_ROOT'] = prev;
    }
  });

  it('returns null when explicitly disabled via FIXIT_RETRIEVAL=0', () => {
    const prevRoot = process.env['AGENT_WORKBENCH_ROOT'];
    const prevFlag = process.env['FIXIT_RETRIEVAL'];
    process.env['AGENT_WORKBENCH_ROOT'] = '/some/path';
    process.env['FIXIT_RETRIEVAL'] = '0';
    try {
      expect(resolveRetrievalConfig()).toBeNull();
    } finally {
      if (prevRoot !== undefined) process.env['AGENT_WORKBENCH_ROOT'] = prevRoot;
      else delete process.env['AGENT_WORKBENCH_ROOT'];
      if (prevFlag !== undefined) process.env['FIXIT_RETRIEVAL'] = prevFlag;
      else delete process.env['FIXIT_RETRIEVAL'];
    }
  });

  it('picks up the Tier-2 rerank model + GPU flag from the environment', () => {
    const workbenchRoot = process.env['AGENT_WORKBENCH_ROOT'] ?? join(process.env['HOME'] ?? '', 'git', 'agent-workbench');
    if (!existsSync(join(workbenchRoot, 'retrieval', 'service.py'))) {
      console.warn('[RetrievalIndex.test] Tier-2 config check skipped: workbench missing');
      return;
    }
    const prev = { ...process.env };
    process.env['AGENT_WORKBENCH_ROOT'] = workbenchRoot;
    process.env['FIXIT_RETRIEVAL_RERANK_MODEL'] = 'BAAI/bge-reranker-v2-m3';
    process.env['FIXIT_RETRIEVAL_USE_GPU'] = '1';
    delete process.env['FIXIT_RETRIEVAL'];
    try {
      const config = resolveRetrievalConfig();
      expect(config?.rerankModel).toBe('BAAI/bge-reranker-v2-m3');
      expect(config?.useGpu).toBe(true);
    } finally {
      for (const k of ['AGENT_WORKBENCH_ROOT', 'FIXIT_RETRIEVAL_RERANK_MODEL', 'FIXIT_RETRIEVAL_USE_GPU', 'FIXIT_RETRIEVAL']) {
        if (prev[k] !== undefined) process.env[k] = prev[k];
        else delete process.env[k];
      }
    }
  });
});

describe('makeRetrieveTool', () => {
  const config: RetrievalConfig = { workbenchRoot: '/x', python: 'python3' };

  it('exposes a retrieve tool with the expected schema', () => {
    const tool = makeRetrieveTool(config, '/index');
    expect(tool.definition.function.name).toBe('retrieve');
    expect(tool.definition.function.parameters.required).toContain('query');
  });

  it('rejects an empty query without shelling out', async () => {
    const tool = makeRetrieveTool(config, '/index');
    const result = await tool.handler({ query: '   ' });
    expect(result.ok).toBe(false);
    expect(result.content).toContain('query is required');
  });
});
