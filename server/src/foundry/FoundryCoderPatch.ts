import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
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

type CoderPatchStatus = 'applied' | 'blocked' | 'failed' | 'skipped' | 'needs-human';

export interface FoundryCoderPatchResult {
  status: CoderPatchStatus;
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

interface CoderResponse {
  attempt: number;
  strategy: string;
  content: string;
  parsed?: Record<string, unknown>;
  diff?: string;
  summary?: string;
}

interface AttemptResult {
  attempt: number;
  strategy: string;
  status: 'blocked' | 'failed' | 'applied';
  phase: string;
  message: string;
  diffPath?: string;
  touchedFiles: string[];
  verification?: Array<{
    command: string;
    status: 'pass' | 'fail';
    stdout?: string;
    stderr?: string;
  }>;
  commit?: string;
  pushed?: boolean;
  summary?: string;
  rawResponse?: string;
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
  const stats = await stat(start);
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

function dataFormatViolations(touchedFiles: string[]): string[] {
  return touchedFiles.filter((file) => file.startsWith('records/') && !/\.(ya?ml)$/i.test(file));
}

async function findDirectoryTouchedFiles(repoRoot: string, touchedFiles: string[]): Promise<string[]> {
  const directories: string[] = [];
  for (const file of touchedFiles) {
    const fullPath = join(repoRoot, file);
    if (!existsSync(fullPath)) continue;
    const stats = await stat(fullPath);
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

async function existingAppliedSpecIds(artifactRoot: string): Promise<Set<string>> {
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
        for (const specId of asStringArray(result['sourceSpecIds'])) applied.add(specId);
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

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown';
}

function groupByFixClass(specs: PatchSpec[]): Map<string, PatchSpec[]> {
  const grouped = new Map<string, PatchSpec[]>();
  for (const spec of specs) {
    grouped.set(spec.fixClass, [...(grouped.get(spec.fixClass) ?? []), spec]);
  }
  return grouped;
}

function selectFixClass(specs: PatchSpec[]): { fixClass: string; specs: PatchSpec[] } {
  const grouped = groupByFixClass(specs);
  const fixClass = Array.from(grouped.keys()).sort()[0] ?? 'unknown';
  return { fixClass, specs: grouped.get(fixClass) ?? [] };
}

function attemptScore(attempt: AttemptResult): number {
  let score = 0;
  if (attempt.touchedFiles.length > 0) score += 20;
  if (attempt.diffPath) score += 20;
  if (attempt.phase === 'verification') score += 30;
  if (attempt.phase === 'git-apply-check') score += 10;
  if (attempt.status === 'failed') score += 10;
  return score;
}

async function writeAttempt(tournamentDir: string, result: AttemptResult): Promise<void> {
  await writeYamlFile(join(tournamentDir, `attempt-${result.attempt}.yaml`), {
    kind: 'protocol-foundry-coder-patch-attempt',
    generated_at: nowIso(),
    ...result,
  });
}

async function requestCoderPatch(input: {
  attempt: number;
  strategy: string;
  client: ReturnType<typeof createInferenceClient>;
  model: string;
  protocolId: string;
  variant: FoundryVariant;
  fixClass: string;
  specs: PatchSpec[];
  ownedFiles: string[];
  context: string;
  priorDiff?: string;
  priorFailure?: string;
}): Promise<CoderResponse> {
  const response = await input.client.complete({
    model: input.model,
    temperature: 0.15,
    max_tokens: 8192,
    messages: [
      {
        role: 'system',
        content: [
          'You are the Protocol Foundry coder. Produce one minimal git unified diff for exactly one compiler/precompiler fix class.',
          'Return only JSON with keys: summary, unifiedDiff.',
          'Do not modify files outside ownedFiles. Do not include markdown.',
          'Use exact file paths and context from the supplied repository context.',
          'Avoid whitespace-only edits. Do not invent unrelated refactors.',
          'If an ownedFiles entry is a directory, patch a specific existing file under it; never patch the directory path itself.',
          'Data files under records/ must be YAML. Do not create JSON files for records data.',
          'The unifiedDiff must be directly accepted by git apply.',
          'Prefer small, testable changes over broad refactors.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          protocolId: input.protocolId,
          variant: input.variant,
          fixClass: input.fixClass,
          strategy: input.strategy,
          patchSpecs: input.specs.map((spec) => spec.raw),
          ownedFiles: input.ownedFiles,
          context: input.context,
          ...(input.priorDiff ? { priorDiff: input.priorDiff } : {}),
          ...(input.priorFailure ? { priorFailure: input.priorFailure } : {}),
        }),
      },
    ],
  });
  const content = response.choices[0]?.message.content ?? '';
  const parsed = extractJsonObject(content);
  const diff = typeof parsed?.['unifiedDiff'] === 'string'
    ? parsed['unifiedDiff']
    : extractUnifiedDiff(content);
  return {
    attempt: input.attempt,
    strategy: input.strategy,
    content,
    ...(parsed ? { parsed } : {}),
    ...(diff ? { diff } : {}),
    ...(typeof parsed?.['summary'] === 'string' ? { summary: parsed['summary'] } : {}),
  };
}

async function evaluateCandidate(input: {
  response: CoderResponse;
  repoRoot: string;
  tournamentDir: string;
  ownedFiles: string[];
  fixClass: string;
  title: string;
  autoCommit?: boolean;
  autoPush?: boolean;
}): Promise<AttemptResult> {
  const rawResponse = input.response.content.slice(0, 4000);
  if (!input.response.diff || (!input.response.diff.includes('diff --git ') && !input.response.diff.includes('--- a/'))) {
    const result: AttemptResult = {
      attempt: input.response.attempt,
      strategy: input.response.strategy,
      status: 'blocked',
      phase: 'parse',
      message: 'Coder response did not contain a git unified diff.',
      touchedFiles: [],
      rawResponse,
      ...(input.response.summary ? { summary: input.response.summary } : {}),
    };
    await writeAttempt(input.tournamentDir, result);
    return result;
  }

  const diffPath = join(input.tournamentDir, `attempt-${input.response.attempt}.diff`);
  await mkdir(dirname(diffPath), { recursive: true });
  await writeFile(diffPath, input.response.diff, 'utf-8');

  const touchedFiles = parseTouchedFiles(input.response.diff);
  const disallowed = touchedFiles.filter((file) => !pathIsAllowed(file, input.ownedFiles));
  const directories = await findDirectoryTouchedFiles(input.repoRoot, touchedFiles);
  const dataFormatErrors = dataFormatViolations(touchedFiles);
  if (touchedFiles.length === 0 || disallowed.length > 0 || directories.length > 0 || dataFormatErrors.length > 0) {
    const result: AttemptResult = {
      attempt: input.response.attempt,
      strategy: input.response.strategy,
      status: 'blocked',
      phase: 'path-guard',
      message: directories.length > 0
        ? `Coder patch attempted to patch directory paths instead of files: ${directories.join(', ')}`
        : dataFormatErrors.length > 0
          ? `Coder patch attempted to write non-YAML records data: ${dataFormatErrors.join(', ')}`
          : `Coder patch touched files outside architect-owned paths: ${disallowed.join(', ')}`,
      diffPath,
      touchedFiles,
      rawResponse,
      ...(input.response.summary ? { summary: input.response.summary } : {}),
    };
    await writeAttempt(input.tournamentDir, result);
    return result;
  }

  let applied = false;
  try {
    await assertTouchedFilesClean(input.repoRoot, touchedFiles);
    await runGit(input.repoRoot, gitApplyArgs(diffPath, 'check'));
    await runGit(input.repoRoot, gitApplyArgs(diffPath, 'apply'));
    applied = true;
    const verification = await runVerification(input.repoRoot, touchedFiles);
    const verificationPassed = verification.every((item) => item.status === 'pass');
    if (!verificationPassed) {
      await runGit(input.repoRoot, gitApplyArgs(diffPath, 'reverse')).catch(() => ({ stdout: '', stderr: '' }));
      applied = false;
      const result: AttemptResult = {
        attempt: input.response.attempt,
        strategy: input.response.strategy,
        status: 'failed',
        phase: 'verification',
        message: 'Patch applied but verification failed; patch was reversed.',
        diffPath,
        touchedFiles,
        verification,
        rawResponse,
        ...(input.response.summary ? { summary: input.response.summary } : {}),
      };
      await writeAttempt(input.tournamentDir, result);
      return result;
    }
    const commit = await maybeCommit(
      input.repoRoot,
      touchedFiles,
      `${input.fixClass}: ${input.title}`,
      input.autoCommit,
      input.autoPush,
    );
    const result: AttemptResult = {
      attempt: input.response.attempt,
      strategy: input.response.strategy,
      status: 'applied',
      phase: 'verification',
      message: 'Coder patch applied and verified.',
      diffPath,
      touchedFiles,
      verification,
      ...commit,
      rawResponse,
      ...(input.response.summary ? { summary: input.response.summary } : {}),
    };
    await writeAttempt(input.tournamentDir, result);
    return result;
  } catch (error) {
    if (applied) await runGit(input.repoRoot, gitApplyArgs(diffPath, 'reverse')).catch(() => ({ stdout: '', stderr: '' }));
    const result: AttemptResult = {
      attempt: input.response.attempt,
      strategy: input.response.strategy,
      status: 'blocked',
      phase: 'git-apply-check',
      message: error instanceof Error ? error.message : String(error),
      diffPath,
      touchedFiles,
      rawResponse,
      ...(input.response.summary ? { summary: input.response.summary } : {}),
    };
    await writeAttempt(input.tournamentDir, result);
    return result;
  }
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
  const resultRoot = join(input.artifactRoot, 'code-patches', input.protocolId, input.variant);
  const resultPath = join(resultRoot, 'result.yaml');
  const specPaths = await listPatchSpecs(input.artifactRoot, input.protocolId, input.variant);
  const allSpecs = await Promise.all(specPaths.map(readPatchSpec));
  const allFixClasses = Array.from(new Set(allSpecs.map((spec) => spec.fixClass)));
  const alreadyAppliedSpecIds = await existingAppliedSpecIds(input.artifactRoot);
  const pendingSpecs = allSpecs.filter((spec) => !alreadyAppliedSpecIds.has(spec.id));

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

  if (pendingSpecs.length === 0) {
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
  const { fixClass, specs } = selectFixClass(pendingSpecs);
  const fixClasses = [fixClass];
  const tournamentDir = join(resultRoot, sanitizeSegment(fixClass));

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
    temperature: input.inference?.temperature ?? 0.15,
    timeoutMs: input.inference?.timeoutMs ?? 600_000,
    maxTokens: input.inference?.maxTokens ?? 8192,
    enableThinking: input.inference?.enableThinking ?? false,
  });
  await mkdir(tournamentDir, { recursive: true });

  const strategies = [
    'minimal direct patch: make the smallest implementation change that satisfies the acceptance criteria',
    'data/schema first: prefer YAML/data/schema extension if that can satisfy the fix without broad code changes',
    'diagnostics and testability: improve the narrow failure path with explicit diagnostics and focused behavior',
  ];

  const responses = await Promise.all(strategies.map((strategy, index) =>
    requestCoderPatch({
      attempt: index + 1,
      strategy,
      client,
      model,
      protocolId: input.protocolId,
      variant: input.variant,
      fixClass,
      specs,
      ownedFiles,
      context,
    }),
  ));

  const attempts: AttemptResult[] = [];
  for (const response of responses.sort((a, b) => (a.diff?.length ?? Number.POSITIVE_INFINITY) - (b.diff?.length ?? Number.POSITIVE_INFINITY))) {
    const attempt = await evaluateCandidate({
      response,
      repoRoot: input.repoRoot,
      tournamentDir,
      ownedFiles,
      fixClass,
      title: specs[0]?.title ?? input.protocolId,
      ...(input.autoCommit !== undefined ? { autoCommit: input.autoCommit } : {}),
      ...(input.autoPush !== undefined ? { autoPush: input.autoPush } : {}),
    });
    attempts.push(attempt);
    if (attempt.status === 'applied') {
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        status: 'applied',
        fixClasses,
        sourceSpecIds: specs.map((spec) => spec.id),
        tournamentDir,
        winningAttempt: attempt.attempt,
        attempts,
        touchedFiles: attempt.touchedFiles,
        diffPath: attempt.diffPath,
        verification: attempt.verification,
        ...(attempt.commit ? { commit: attempt.commit } : {}),
        ...(attempt.pushed !== undefined ? { pushed: attempt.pushed } : {}),
        ...(attempt.summary ? { summary: attempt.summary } : {}),
        message: 'Patch tournament produced an applied and verified patch.',
      });
      return { status: 'applied', resultPath, message: 'patch tournament applied a verified patch', touchedFiles: attempt.touchedFiles };
    }
  }

  const best = attempts.sort((a, b) => attemptScore(b) - attemptScore(a))[0];
  if (best?.diffPath) {
    const priorDiff = await readFile(best.diffPath, 'utf-8').catch(() => undefined);
    const repairResponse = await requestCoderPatch({
      attempt: 4,
      strategy: 'repair: fix the best failed candidate using the exact failure message; keep the patch narrower than the original',
      client,
      model,
      protocolId: input.protocolId,
      variant: input.variant,
      fixClass,
      specs,
      ownedFiles,
      context,
      ...(priorDiff ? { priorDiff } : {}),
      priorFailure: `${best.phase}: ${best.message}`,
    });
    const repair = await evaluateCandidate({
      response: repairResponse,
      repoRoot: input.repoRoot,
      tournamentDir,
      ownedFiles,
      fixClass,
      title: specs[0]?.title ?? input.protocolId,
      ...(input.autoCommit !== undefined ? { autoCommit: input.autoCommit } : {}),
      ...(input.autoPush !== undefined ? { autoPush: input.autoPush } : {}),
    });
    attempts.push(repair);
    if (repair.status === 'applied') {
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        status: 'applied',
        fixClasses,
        sourceSpecIds: specs.map((spec) => spec.id),
        tournamentDir,
        winningAttempt: repair.attempt,
        attempts,
        touchedFiles: repair.touchedFiles,
        diffPath: repair.diffPath,
        verification: repair.verification,
        ...(repair.commit ? { commit: repair.commit } : {}),
        ...(repair.pushed !== undefined ? { pushed: repair.pushed } : {}),
        ...(repair.summary ? { summary: repair.summary } : {}),
        message: 'Repair round produced an applied and verified patch.',
      });
      return { status: 'applied', resultPath, message: 'repair round applied a verified patch', touchedFiles: repair.touchedFiles };
    }
  }

  await writeYamlFile(resultPath, {
    kind: 'protocol-foundry-coder-patch-result',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    status: 'needs-human',
    fixClasses,
    tournamentDir,
    attempts,
    bestFailure: best ? `${best.phase}: ${best.message}` : 'no viable patch attempts',
    message: 'Patch tournament could not produce a verified patch for this single fix class.',
  });
  return {
    status: 'needs-human',
    resultPath,
    message: 'patch tournament needs human review',
    touchedFiles: [],
  };
}
