import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_RESULT_TEXT_CHARS = 1_800;
const MAX_TOTAL_OUTPUT_CHARS = 12_000;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function loadProfileEnv(workbenchRoot: string, profileName: string | undefined): Record<string, string> {
  if (!profileName) return {};
  const profilePath = join(workbenchRoot, 'profiles', `${profileName}.env`);
  if (!existsSync(profilePath)) return {};
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(profilePath, 'utf-8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function retrievalPython(workbenchRoot: string): string {
  const venvPython = join(workbenchRoot, '.venv', 'bin', 'python3');
  return existsSync(venvPython) ? venvPython : 'python3';
}

export async function queryWorkbenchRetrieval(input: {
  repoRoot: string;
  workbenchRoot?: string;
  query: string;
  topK?: number;
  candidateK?: number;
  profileName?: string;
}): Promise<Record<string, unknown>> {
  const workbenchRoot = resolve(input.workbenchRoot ?? process.env['PROTOCOL_FOUNDRY_WORKBENCH_ROOT'] ?? resolve(input.repoRoot, '..', 'agent-workbench'));
  const profileEnv = loadProfileEnv(workbenchRoot, input.profileName);
  const repoId = slugify(basename(resolve(input.repoRoot)));
  const indexDir = join(workbenchRoot, 'state', 'indexes', repoId);
  const manifestPath = join(indexDir, 'index.manifest.json');
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      indexDir,
      error: 'retrieval index is missing',
      hint: `Build it with ${join(workbenchRoot, 'scripts', 'index-repo.sh')} ${input.repoRoot} --profile ${input.profileName ?? 'dgx-spark'}`,
    };
  }

  const args = [
    '-m',
    'retrieval.service',
    'query',
    '--index-dir',
    indexDir,
    '--query',
    input.query,
    '--top-k',
    String(input.topK ?? 6),
    '--candidate-k',
    String(input.candidateK ?? Math.max((input.topK ?? 6) * 3, 18)),
  ];
  if (input.profileName) args.push('--profile-name', input.profileName);

  try {
    const { stdout } = await execFileAsync(retrievalPython(workbenchRoot), args, {
      cwd: workbenchRoot,
      env: {
        ...process.env,
        ...profileEnv,
        PYTHONPATH: `${workbenchRoot}${process.env['PYTHONPATH'] ? `:${process.env['PYTHONPATH']}` : ''}`,
      },
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 8,
    });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const results = Array.isArray(parsed['results']) ? parsed['results'] : [];
    const compactResults = results.map((item) => {
      const result = item as Record<string, unknown>;
      return {
        file_path: result['relative_path'] ?? result['file_path'],
        start_line: result['start_line'],
        end_line: result['end_line'],
        symbol: result['symbol'],
        heading: result['heading'],
        retrieval_score: result['retrieval_score'],
        rerank_score: result['rerank_score'],
        explanation: result['explanation'],
        text: typeof result['text'] === 'string' ? truncateText(result['text'], MAX_RESULT_TEXT_CHARS) : '',
      };
    });
    return {
      ok: true,
      indexDir,
      query: parsed['query'],
      retrieval_mode: parsed['retrieval_mode'],
      result_count: parsed['result_count'],
      results: compactResults,
    };
  } catch (error) {
    return {
      ok: false,
      indexDir,
      error: error instanceof Error ? truncateText(error.message, MAX_TOTAL_OUTPUT_CHARS) : String(error),
    };
  }
}
