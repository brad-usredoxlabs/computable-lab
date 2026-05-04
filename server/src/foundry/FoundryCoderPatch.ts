import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInferenceClient } from '../ai/InferenceClient.js';
import type { InferenceConfig } from '../config/types.js';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';

const execFileAsync = promisify(execFile);
const MAX_CONTEXT_CHARS = 60_000;
const MAX_FILE_CHARS = 16_000;

export interface FoundryCoderPatchResult {
  status: 'applied' | 'blocked' | 'failed' | 'skipped';
  resultPath: string;
  message: string;
  touchedFiles: string[];
}

interface PatchSpec {
  id: string;
  fixClass: string;
  title: string;
  rationale: string;
  ownedFiles: string[];
  acceptance: string[];
  raw: Record<string, unknown>;
  path: string;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function listPatchSpecs(root: string, protocolId: string, variant: FoundryVariant): Promise<string[]> {
  const dir = join(root, 'patch-specs', protocolId, variant);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((file) => file.endsWith('.yaml') && file !== 'index.yaml')
    .sort()
    .map((file) => join(dir, file));
}

async function readPatchSpec(path: string): Promise<PatchSpec> {
  const raw = asRecord(await readYamlFile(path));
  return {
    id: typeof raw['id'] === 'string' ? raw['id'] : relative(dirname(path), path),
    fixClass: typeof raw['fixClass'] === 'string'
      ? raw['fixClass']
      : typeof raw['class'] === 'string'
        ? raw['class']
        : 'unknown',
    title: typeof raw['title'] === 'string' ? raw['title'] : 'Untitled Foundry fix',
    rationale: typeof raw['rationale'] === 'string' ? raw['rationale'] : '',
    ownedFiles: asStringArray(raw['ownedFiles']),
    acceptance: asStringArray(raw['acceptance']),
    raw,
    path,
  };
}

async function walkFiles(root: string, start: string, limit: number): Promise<string[]> {
  if (limit <= 0 || !existsSync(start)) return [];
  const stats = await import('node:fs/promises').then((fs) => fs.stat(start));
  if (stats.isFile()) return [start];
  if (!stats.isDirectory()) return [];
  const entries = await readdir(start, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (files.length >= limit) break;
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const fullPath = join(start, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, fullPath, limit - files.length));
    } else if (entry.isFile() && /\.(ts|tsx|js|cjs|mjs|yaml|yml|md)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files.slice(0, limit);
}

async function collectOwnedContext(repoRoot: string, specs: PatchSpec[]): Promise<string> {
  const owned = Array.from(new Set(specs.flatMap((spec) => spec.ownedFiles))).slice(0, 12);
  const files: string[] = [];
  for (const ownedPath of owned) {
    const fullPath = join(repoRoot, ownedPath);
    files.push(...await walkFiles(repoRoot, fullPath, 8));
  }
  const uniqueFiles = Array.from(new Set(files)).slice(0, 24);
  const chunks: string[] = [];
  for (const file of uniqueFiles) {
    const rel = relative(repoRoot, file);
    const content = (await readFile(file, 'utf-8')).slice(0, MAX_FILE_CHARS);
    chunks.push(`--- ${rel}\n${content}`);
    if (chunks.join('\n\n').length > MAX_CONTEXT_CHARS) break;
  }
  return chunks.join('\n\n').slice(0, MAX_CONTEXT_CHARS);
}

function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [fenced, text].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) continue;
    try {
      return asRecord(JSON.parse(candidate.slice(start, end + 1)));
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}

function extractUnifiedDiff(text: string): string | undefined {
  const fenced = text.match(/```(?:diff|patch)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [fenced, text].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const gitIndex = candidate.indexOf('diff --git ');
    if (gitIndex !== -1) return candidate.slice(gitIndex).trimEnd() + '\n';
    const unifiedIndex = candidate.indexOf('--- a/');
    if (unifiedIndex !== -1 && candidate.includes('\n+++ b/')) {
      return candidate.slice(unifiedIndex).trimEnd() + '\n';
    }
  }
  return undefined;
}

function parseTouchedFiles(diff: string): string[] {
  const files = new Set<string>();
  let previousOldFile: string | undefined;
  for (const line of diff.split('\n')) {
    const gitMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (gitMatch) {
      files.add(gitMatch[1]!);
      files.add(gitMatch[2]!);
      previousOldFile = undefined;
      continue;
    }
    const oldMatch = line.match(/^--- a\/(.+)$/);
    if (oldMatch) {
      previousOldFile = oldMatch[1]!;
      files.add(previousOldFile);
      continue;
    }
    const newMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (newMatch) {
      files.add(newMatch[1]!);
      if (previousOldFile) files.add(previousOldFile);
      previousOldFile = undefined;
    }
  }
  return Array.from(files).filter((file) => file !== '/dev/null').sort();
}

function pathIsAllowed(path: string, ownedFiles: string[]): boolean {
  if (path.startsWith('/') || path.includes('..')) return false;
  return ownedFiles.some((owned) => path === owned || path.startsWith(`${owned.replace(/\/+$/, '')}/`));
}

async function findDirectoryTouchedFiles(repoRoot: string, touchedFiles: string[]): Promise<string[]> {
  const directories: string[] = [];
  for (const file of touchedFiles) {
    const fullPath = join(repoRoot, file);
    if (!existsSync(fullPath)) continue;
    const stats = await import('node:fs/promises').then((fs) => fs.stat(fullPath));
    if (stats.isDirectory()) directories.push(file);
  }
  return directories;
}

async function runGit(repoRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync('git', args, { cwd: repoRoot, maxBuffer: 1024 * 1024 * 12 });
  return { stdout: result.stdout, stderr: result.stderr };
}

function gitApplyArgs(diffPath: string, mode: 'check' | 'apply' | 'reverse'): string[] {
  if (mode === 'check') return ['apply', '--check', '--recount', diffPath];
  if (mode === 'reverse') return ['apply', '-R', '--recount', diffPath];
  return ['apply', '--recount', diffPath];
}

async function assertTouchedFilesClean(repoRoot: string, touchedFiles: string[]): Promise<void> {
  if (touchedFiles.length === 0) return;
  const result = await runGit(repoRoot, ['status', '--porcelain', '--', ...touchedFiles]);
  if (result.stdout.trim()) {
    throw new Error(`refusing to patch files with pre-existing changes:\n${result.stdout.trim()}`);
  }
}

function defaultVerificationArgs(touchedFiles: string[]): string[][] {
  const tests = new Set<string>();
  if (touchedFiles.some((file) => file.startsWith('server/src/extract/'))) {
    tests.add('src/extract/OpenAICompatibleExtractor.test.ts');
    tests.add('src/extract/runChunkedExtractionService.test.ts');
  }
  if (touchedFiles.some((file) => file.startsWith('server/src/ai/'))) {
    tests.add('src/ai/InferenceClient.config.test.ts');
  }
  if (touchedFiles.some((file) => file.startsWith('server/src/foundry/'))) {
    tests.add('src/foundry/FoundryLedger.test.ts');
  }
  if (tests.size === 0) tests.add('src/foundry/FoundryLedger.test.ts');
  return [['npm', 'test', '--', '--run', ...Array.from(tests)]];
}

async function runVerification(repoRoot: string, touchedFiles: string[]): Promise<Array<{
  command: string;
  status: 'pass' | 'fail';
  stdout?: string;
  stderr?: string;
}>> {
  const results = [];
  for (const args of defaultVerificationArgs(touchedFiles)) {
    const [command, ...rest] = args;
    try {
      const result = await execFileAsync(command!, rest, {
        cwd: join(repoRoot, 'server'),
        maxBuffer: 1024 * 1024 * 12,
      });
      results.push({
        command: args.join(' '),
        status: 'pass' as const,
        ...(result.stdout ? { stdout: result.stdout.slice(-4000) } : {}),
        ...(result.stderr ? { stderr: result.stderr.slice(-4000) } : {}),
      });
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      results.push({
        command: args.join(' '),
        status: 'fail' as const,
        ...(err.stdout ? { stdout: err.stdout.slice(-4000) } : {}),
        stderr: (err.stderr ?? err.message ?? String(error)).slice(-4000),
      });
    }
  }
  return results;
}

async function existingAppliedFixClasses(artifactRoot: string): Promise<Set<string>> {
  const root = join(artifactRoot, 'code-patches');
  const applied = new Set<string>();
  async function visit(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      if (entry.isFile() && entry.name === 'result.yaml') {
        const result = asRecord(await readYamlFile(fullPath));
        if (result['status'] !== 'applied') continue;
        for (const fixClass of asStringArray(result['fixClasses'])) applied.add(fixClass);
      }
    }
  }
  await visit(root);
  return applied;
}

async function maybeCommit(repoRoot: string, touchedFiles: string[], title: string, autoCommit?: boolean, autoPush?: boolean): Promise<{
  commit?: string;
  pushed?: boolean;
}> {
  if (!autoCommit) return {};
  await runGit(repoRoot, ['add', '--', ...touchedFiles]);
  await runGit(repoRoot, ['commit', '-m', `Foundry coder patch: ${title.slice(0, 60)}`]);
  const commit = (await runGit(repoRoot, ['rev-parse', 'HEAD'])).stdout.trim();
  if (autoPush) {
    const branch = (await runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
    await runGit(repoRoot, ['push', 'origin', branch]);
    return { commit, pushed: true };
  }
  return { commit, pushed: false };
}

export async function runFoundryCoderPatch(input: {
  artifactRoot: string;
  repoRoot: string;
  protocolId: string;
  variant: FoundryVariant;
  inference?: Partial<InferenceConfig>;
  dryRun?: boolean;
  autoCommit?: boolean;
  autoPush?: boolean;
}): Promise<FoundryCoderPatchResult> {
  const resultPath = join(input.artifactRoot, 'code-patches', input.protocolId, input.variant, 'result.yaml');
  const diffPath = join(input.artifactRoot, 'code-patches', input.protocolId, input.variant, 'proposed.diff');
  const specPaths = await listPatchSpecs(input.artifactRoot, input.protocolId, input.variant);
  const allSpecs = await Promise.all(specPaths.map(readPatchSpec));
  const allFixClasses = Array.from(new Set(allSpecs.map((spec) => spec.fixClass)));
  const alreadyApplied = await existingAppliedFixClasses(input.artifactRoot);
  const specs = allSpecs.filter((spec) => !alreadyApplied.has(spec.fixClass));
  const fixClasses = Array.from(new Set(specs.map((spec) => spec.fixClass)));

  if (allSpecs.length === 0) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'skipped',
      message: 'No patch specs available.',
    });
    return { status: 'skipped', resultPath, message: 'no patch specs', touchedFiles: [] };
  }

  if (specs.length === 0) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'skipped',
      fixClasses: allFixClasses,
      message: 'All requested fix classes already have an applied code patch.',
    });
    return { status: 'skipped', resultPath, message: 'fix classes already applied', touchedFiles: [] };
  }

  const baseUrl = input.inference?.baseUrl ?? process.env['PI_WORKER_BASE_URL'] ?? process.env['OPENAI_BASE_URL'];
  const model = input.inference?.model ?? process.env['PI_WORKER_MODEL'] ?? process.env['OPENAI_MODEL'];
  if (!baseUrl || !model || input.dryRun) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'blocked',
      fixClasses,
      message: 'Coder endpoint/model not configured or dry-run mode is enabled.',
    });
    return { status: 'blocked', resultPath, message: 'coder not configured', touchedFiles: [] };
  }

  const ownedFiles = Array.from(new Set(specs.flatMap((spec) => spec.ownedFiles)));
  const context = await collectOwnedContext(input.repoRoot, specs);
  const client = createInferenceClient({
    baseUrl,
    model,
    temperature: input.inference?.temperature ?? 0.1,
    timeoutMs: input.inference?.timeoutMs ?? 600_000,
    maxTokens: input.inference?.maxTokens ?? 8192,
    enableThinking: input.inference?.enableThinking ?? false,
  });
  const response = await client.complete({
    model,
    temperature: 0.1,
    max_tokens: 8192,
    messages: [
      {
        role: 'system',
        content: [
          'You are the Protocol Foundry coder. Produce one minimal git unified diff that implements the provided compiler/precompiler patch specs.',
          'Return only JSON with keys: summary, unifiedDiff.',
          'Do not modify files outside ownedFiles. Do not include markdown.',
          'Use exact file paths and context from the supplied repository context.',
          'Avoid whitespace-only edits. Do not invent unrelated refactors.',
          'If an ownedFiles entry is a directory, patch a specific existing file under it; never patch the directory path itself.',
          'The unifiedDiff must be directly accepted by git apply.',
          'Prefer small, testable changes over broad refactors.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          protocolId: input.protocolId,
          variant: input.variant,
          patchSpecs: specs.map((spec) => spec.raw),
          ownedFiles,
          context,
        }),
      },
    ],
  });
  const content = response.choices[0]?.message.content ?? '';
  const parsed = extractJsonObject(content);
  const diff = typeof parsed?.['unifiedDiff'] === 'string'
    ? parsed['unifiedDiff']
    : extractUnifiedDiff(content);
  if (!diff || (!diff.includes('diff --git ') && !diff.includes('--- a/'))) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'blocked',
      fixClasses,
      rawResponse: content.slice(0, 4000),
      message: 'Coder response did not contain a git unified diff.',
    });
    return { status: 'blocked', resultPath, message: 'missing unified diff', touchedFiles: [] };
  }

  const touchedFiles = parseTouchedFiles(diff);
  const disallowed = touchedFiles.filter((file) => !pathIsAllowed(file, ownedFiles));
  const directories = await findDirectoryTouchedFiles(input.repoRoot, touchedFiles);
  if (touchedFiles.length === 0 || disallowed.length > 0 || directories.length > 0) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'blocked',
      fixClasses,
      touchedFiles,
      disallowed,
      directories,
      message: directories.length > 0
        ? 'Coder patch attempted to patch directory paths instead of files.'
        : 'Coder patch touched files outside architect-owned paths.',
    });
    return {
      status: 'blocked',
      resultPath,
      message: directories.length > 0 ? 'directory paths in patch' : 'disallowed touched files',
      touchedFiles,
    };
  }

  await mkdir(dirname(diffPath), { recursive: true });
  await writeFile(diffPath, diff, 'utf-8');

  try {
    await assertTouchedFilesClean(input.repoRoot, touchedFiles);
    await runGit(input.repoRoot, gitApplyArgs(diffPath, 'check'));
    await runGit(input.repoRoot, gitApplyArgs(diffPath, 'apply'));
    const verification = await runVerification(input.repoRoot, touchedFiles);
    const verificationPassed = verification.every((item) => item.status === 'pass');
    if (!verificationPassed) {
      await runGit(input.repoRoot, gitApplyArgs(diffPath, 'reverse')).catch(() => ({ stdout: '', stderr: '' }));
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        status: 'failed',
        fixClasses,
        touchedFiles,
        diffPath,
        verification,
        message: 'Patch applied but verification failed; patch was reversed.',
      });
      return { status: 'failed', resultPath, message: 'verification failed; patch reversed', touchedFiles };
    }
    const commit = await maybeCommit(input.repoRoot, touchedFiles, specs[0]?.title ?? input.protocolId, input.autoCommit, input.autoPush);
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'applied',
      fixClasses,
      touchedFiles,
      diffPath,
      verification,
      ...commit,
      summary: typeof parsed?.['summary'] === 'string' ? parsed['summary'] : undefined,
      message: 'Coder patch applied and verified.',
    });
    return { status: 'applied', resultPath, message: 'coder patch applied', touchedFiles };
  } catch (error) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'blocked',
      fixClasses,
      touchedFiles,
      diffPath,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      status: 'blocked',
      resultPath,
      message: error instanceof Error ? error.message : String(error),
      touchedFiles,
    };
  }
}
