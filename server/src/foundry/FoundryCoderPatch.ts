import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Project } from 'ts-morph';
import { createInferenceClient } from '../ai/InferenceClient.js';
import type { CompletionRequest } from '../ai/types.js';
import type { InferenceConfig } from '../config/types.js';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import { runFoundryToolAgent } from './FoundryToolAgent.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';

const execFileAsync = promisify(execFile);
const MAX_CONTEXT_CHARS = 6_000;
const MAX_FILE_CHARS = 3_000;
const MAX_ARTIFACT_CONTEXT_CHARS = 3_000;
const MAX_SCHEMA_CONTEXT_CHARS = 3_000;
export const TOOL_AGENT_MAX_TURNS = 120;

type CoderPatchStatus = 'applied' | 'blocked' | 'failed' | 'skipped' | 'stale' | 'needs-human';

export interface FoundryCoderPatchResult {
  status: CoderPatchStatus;
  resultPath: string;
  message: string;
  touchedFiles: string[];
}

export type FoundryCoderRole = 'junior' | 'senior';
export type FoundryCoderEngine = 'symbol-patch' | 'tool-agent';

export interface FoundryCoderPatchProgressEvent {
  source: 'coder';
  phase: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PatchSpec {
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

// ─── Symbol replacement infrastructure (via ts-morph) ───

interface SymbolBlock {
  name: string;
  start: number;    // 0-indexed line
  end: number;      // exclusive end line
  declaration: string;
  kind: string;
}

interface SymbolReplacement {
  op: 'replace' | 'add';
  targetName: string | undefined;
  content: string;
}

// Convert char position to 0-indexed line number
function charToLine(content: string, charPos: number): number {
  let line = 0;
  for (let i = 0; i < charPos && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function firstLineOf(text: string): string {
  return text.split('\n')[0]!;
}

/** Parse a TypeScript file with ts-morph and extract all symbol boundaries */
function findSymbolBlocks(content: string): SymbolBlock[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: { skipLibCheck: true } });
  const source = project.createSourceFile('/tmp/symbols.ts', content, { overwrite: true });
  const blocks: SymbolBlock[] = [];

  // Functions
  for (const func of source.getFunctions()) {
    const name = func.getName() || '<anonymous>';
    blocks.push({
      name,
      start: charToLine(content, func.getStart()),
      end: charToLine(content, func.getEnd()),
      declaration: firstLineOf(func.getText()),
      kind: 'function',
    });
  }

  // Interfaces
  for (const iface of source.getInterfaces()) {
    blocks.push({
      name: iface.getName(),
      start: charToLine(content, iface.getStart()),
      end: charToLine(content, iface.getEnd()),
      declaration: firstLineOf(iface.getText()),
      kind: 'interface',
    });
  }

  // Type aliases
  for (const alias of source.getTypeAliases()) {
    blocks.push({
      name: alias.getName(),
      start: charToLine(content, alias.getStart()),
      end: charToLine(content, alias.getEnd()),
      declaration: firstLineOf(alias.getText()),
      kind: 'type',
    });
  }

  // Classes
  for (const cls of source.getClasses()) {
    blocks.push({
      name: cls.getName() || '<anonymous>',
      start: charToLine(content, cls.getStart()),
      end: charToLine(content, cls.getEnd()),
      declaration: firstLineOf(cls.getText()),
      kind: 'class',
    });
  }

  // Enums
  for (const enumDecl of source.getEnums()) {
    blocks.push({
      name: enumDecl.getName(),
      start: charToLine(content, enumDecl.getStart()),
      end: charToLine(content, enumDecl.getEnd()),
      declaration: firstLineOf(enumDecl.getText()),
      kind: 'enum',
    });
  }

  return blocks.sort((a, b) => a.start - b.start);
}

/** Apply symbol-level replacements to source content */
function applySymbolReplacements(
  content: string,
  replacements: SymbolReplacement[],
): string {
  const blocks = findSymbolBlocks(content);
  let lines = content.split('\n');

  interface EditOp {
    start: number;
    end: number;
    insert: string;
  }
  const ops: EditOp[] = [];

  for (const repl of replacements) {
    if (repl.op === 'replace' && repl.targetName) {
      const block = blocks.find((b) => b.name === repl.targetName);
      if (block) {
        ops.push({ start: block.start, end: block.end + 1, insert: repl.content });
      }
    } else if (repl.op === 'add') {
      let insertAt = lines.length;
      while (insertAt > 0 && lines[insertAt - 1]!.trim() === '') insertAt--;
      ops.push({ start: insertAt, end: insertAt, insert: repl.content });
    }
  }

  // Apply bottom-up so earlier positions remain valid
  ops.sort((a, b) => b.start - a.start);
  for (const op of ops) {
    const insertLines = op.insert.split('\n');
    const before = lines.slice(0, op.start);
    const after = lines.slice(op.end);
    lines = [...before, ...insertLines, ...after];
  }

  return lines.join('\n');
}

/** Parse LLM response for symbol replacement blocks */
function parseSymbolResponse(text: string): SymbolReplacement[] {
  const replacements: SymbolReplacement[] = [];
  // Consume the closing @@ of the header delimiter explicitly so group 3
  // does NOT capture a stray @@ prefix that would break TypeScript syntax.
  //   @@replace funcName@@\n  <body>  \n@@end@@
  //   @@add@@\n               <body>  \n@@end@@
  const pattern = /@@(replace|add)\s*([^@\n]*)@@\s*([\s\S]*?)@@end@@/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const op = match[1]!.toLowerCase() as 'replace' | 'add';
    const targetName = match[2]!.trim() || undefined;
    const content = match[3]!.trim();
    if (content) {
      replacements.push({ op, targetName, content });
    }
  }
  return replacements;
}

async function listPatchSpecs(root: string, protocolId: string, variant: FoundryVariant): Promise<string[]> {
  const dir = join(root, 'patch-specs', protocolId, variant);
  if (!existsSync(dir)) return [];
  const files = await import('node:fs/promises').then((fs) => fs.readdir(dir));
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
  const entries = await import('node:fs/promises').then((fs) => fs.readdir(start, { withFileTypes: true }));
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

async function collectSpecArtifactContext(artifactRoot: string, specs: PatchSpec[]): Promise<string> {
  const artifactRootResolved = resolve(artifactRoot);
  const candidates: string[] = [];
  for (const spec of specs) {
    const sourceArtifacts = asRecord(spec.raw['sourceArtifacts']);
    for (const value of Object.values(sourceArtifacts)) {
      if (typeof value === 'string' && value.trim()) candidates.push(value.trim());
    }
  }

  const chunks: string[] = [];
  for (const candidate of Array.from(new Set(candidates))) {
    const fullPath = resolve(candidate);
    if (!fullPath.startsWith(`${artifactRootResolved}/`) && fullPath !== artifactRootResolved) continue;
    if (!existsSync(fullPath)) continue;
    const stats = await import('node:fs/promises').then((fs) => fs.stat(fullPath));
    if (!stats.isFile()) continue;
    if (!/\.(ya?ml|txt|md)$/i.test(fullPath)) continue;
    const rel = relative(artifactRootResolved, fullPath);
    const content = (await readFile(fullPath, 'utf-8')).slice(0, 3_000);
    chunks.push(`--- artifact:${rel}\n${content}`);
    if (chunks.join('\n\n').length > MAX_ARTIFACT_CONTEXT_CHARS) break;
  }
  return chunks.join('\n\n').slice(0, MAX_ARTIFACT_CONTEXT_CHARS);
}

async function collectSchemaContext(repoRoot: string, fixClass: string): Promise<string> {
  const schemaPaths = new Set<string>();
  const add = (paths: string[]) => paths.forEach((path) => schemaPaths.add(path));

  if (fixClass === 'material_catalog_or_spec_gap') {
    add([
      'schema/lab/material.schema.yaml',
      'schema/lab/material-spec.schema.yaml',
      'schema/lab/vendor-product.schema.yaml',
    ]);
  }
  if (fixClass === 'browser_or_labware_rendering' || fixClass === 'execution_scaling' || fixClass === 'labware_alias_or_resolver_gap') {
    add([
      'schema/workflow/labware-definition.schema.yaml',
      'schema/lab/labware.schema.yaml',
    ]);
  }

  if (schemaPaths.size === 0) return '(no schema bundle for this fix class)';

  const chunks: string[] = [];
  for (const schemaPath of schemaPaths) {
    const fullPath = join(repoRoot, schemaPath);
    if (!existsSync(fullPath)) continue;
    const content = (await readFile(fullPath, 'utf-8')).slice(0, MAX_FILE_CHARS);
    chunks.push(`--- schema:${schemaPath}\n${content}`);
    if (chunks.join('\n\n').length > MAX_SCHEMA_CONTEXT_CHARS) break;
  }
  return chunks.join('\n\n').slice(0, MAX_SCHEMA_CONTEXT_CHARS);
}

export function extractUnifiedDiff(text: string): string | undefined {
  // Strategy 1: Try fenced code blocks (most reliable for LLM output)
  const fenced = text.match(/```(?:diff)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    const diff = fenced[1];
    if (diff.includes('diff --git ') || (diff.includes('--- a/') && diff.includes('+++ b/') && diff.includes('@@ '))) {
      return stripLeadingWhitespace(diff.trimEnd()) + '\n';
    }
  }

  // Strategy 2: Look for diff --git headers (including those at end of text)
  const diffMatch = text.match(/(diff --git .+?)(?=\ndiff --git |\n```|\n\n[A-Z]|\nSummary|\n{2,}|$)/s);
  if (diffMatch && diffMatch[1]) {
    return diffMatch[1].trimEnd() + '\n';
  }

  // Strategy 3: Fallback - find lines that start with --- a/ or --- /dev/null
  // Must include +++ b/ and @@ to be considered a valid diff
  const lines = text.split('\n');
  const firstDiffLine = lines.findIndex((l) => /^\s*--- (a\/|\/)\S/.test(l));
  if (firstDiffLine >= 0) {
    const diffLines: string[] = [];
    for (let i = firstDiffLine; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (/^(## |### |#### |##### |###### |####### )/.test(trimmed)) break;
      if (trimmed === '' && i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1]!.trim();
        if (!/^(--- |\+\+\+ |\+|@@ |diff |$)/.test(nextTrimmed)) break;
      }
      diffLines.push(lines[i]!);
    }
    const candidate = diffLines.join('\n');
    if ((candidate.includes('--- a/') || candidate.includes('--- /dev/null'))
        && (candidate.includes('+++ b/') || candidate.includes('+++ /dev/null'))
        && candidate.includes('@@ ')) {
      return stripLeadingWhitespace(candidate.trimEnd()) + '\n';
    }
  }

  return undefined;
}

// Strip common leading whitespace from LLM-indented diff output
function stripLeadingWhitespace(text: string): string {
  const normalized = text.replace(/\t/g, '  ');
  const lines = normalized.split('\n');
  let commonWs = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const match = line.match(/^(\s*)/);
    const wsLen = match ? match[1]!.length : 0;
    if (wsLen < commonWs) commonWs = wsLen;
  }
  if (commonWs > 0 && commonWs <= 4) {
    return lines.map((line) => line.slice(commonWs)).join('\n');
  }
  return lines.map((line) => line.replace(/^\s+/, '')).join('\n');
}

function isMeaningfulPatchFile(path: string): boolean {
  return path.startsWith('server/src/')
    || path.startsWith('client/src/')
    || path.startsWith('schema/')
    || path.startsWith('records/')
    || path.startsWith('scripts/');
}

export function meaningfulPatchFiles(touchedFiles: string[]): string[] {
  return touchedFiles.filter(isMeaningfulPatchFile).sort();
}

async function runGit(repoRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync('git', args, { cwd: repoRoot, maxBuffer: 1024 * 1024 * 12 });
  return { stdout: result.stdout, stderr: result.stderr };
}

// Direct file patching bypasses git apply entirely; no clean-check needed

function defaultVerificationArgs(touchedFiles: string[]): string[][] {
  const tests = new Set<string>();
  for (const file of touchedFiles) {
    if (file.startsWith('server/src/') && /\.test\.(ts|tsx)$/.test(file)) {
      tests.add(file.replace(/^server\//, ''));
    }
  }
  if (touchedFiles.some((file) => file.startsWith('server/src/compiler/'))) {
    tests.add('src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts');
  }
  if (tests.size === 0) tests.add('src/foundry/FoundryLedger.test.ts');
  return [['npm', 'test', '--', '--run', ...Array.from(tests)]];
}

async function snapshotOwnedFiles(repoRoot: string, spec: PatchSpec): Promise<Map<string, string | null>> {
  const snapshot = new Map<string, string | null>();
  for (const ownedPath of Array.from(new Set(spec.ownedFiles))) {
    const fullPath = join(repoRoot, ownedPath);
    const files = await walkFiles(repoRoot, fullPath, 24);
    if (files.length === 0 && !existsSync(fullPath)) {
      snapshot.set(ownedPath, null);
      continue;
    }
    for (const file of files.length > 0 ? files : [fullPath]) {
      const rel = relative(repoRoot, file);
      try {
        snapshot.set(rel, await readFile(file, 'utf-8'));
      } catch {
        snapshot.set(rel, null);
      }
    }
  }
  return snapshot;
}

async function changedOwnedFiles(repoRoot: string, before: Map<string, string | null>): Promise<string[]> {
  const changed: string[] = [];
  for (const [rel, original] of before) {
    const fullPath = join(repoRoot, rel);
    let current: string | null = null;
    try {
      current = await readFile(fullPath, 'utf-8');
    } catch {
      current = null;
    }
    if (current !== original) changed.push(rel);
  }
  return changed.sort();
}

async function restoreSnapshot(repoRoot: string, before: Map<string, string | null>, files: string[]): Promise<void> {
  for (const file of files) {
    if (!before.has(file)) continue;
    const original = before.get(file);
    if (original === undefined) {
      continue;
    }
    if (original === null) {
      await unlink(join(repoRoot, file)).catch(() => undefined);
    } else {
      await writeFile(join(repoRoot, file), original, 'utf-8');
    }
  }
}

async function runVerification(repoRoot: string, touchedFiles: string[]): Promise<boolean> {
  for (const args of defaultVerificationArgs(touchedFiles)) {
    const [command, ...rest] = args;
    try {
      await execFileAsync(command!, rest, {
        cwd: join(repoRoot, 'server'),
        maxBuffer: 1024 * 1024 * 12,
        timeout: 60_000,
      });
    } catch {
      // Tests failed - but we still try to land the patch if it compiles
      return false;
    }
  }
  return true;
}

function toolAgentPrompt(input: {
  selectedSpec: PatchSpec;
  context: string;
  revisionFeedback?: string;
}): string {
  const tests = asStringArray(input.selectedSpec.raw['tests']);
  return [
    `## Patch Spec`,
    `ID: ${input.selectedSpec.id}`,
    `Title: ${input.selectedSpec.title}`,
    `Fix class: ${input.selectedSpec.fixClass}`,
    ``,
    `Rationale:`,
    input.selectedSpec.rationale || '(none)',
    ``,
    `Acceptance criteria:`,
    input.selectedSpec.acceptance.length
      ? input.selectedSpec.acceptance.map((item) => `- ${item}`).join('\n')
      : '(none)',
    ``,
    `Owned files:`,
    input.selectedSpec.ownedFiles.length
      ? input.selectedSpec.ownedFiles.map((item) => `- ${item}`).join('\n')
      : '(none)',
    ``,
    `Verification commands:`,
    tests.length ? tests.map((item) => `- ${item}`).join('\n') : '(none declared)',
    ``,
    `Relevant context:`,
    input.context.slice(0, 12_000),
    ...(input.revisionFeedback
      ? [
          ``,
          `## Critic Revision Feedback`,
          input.revisionFeedback,
        ]
      : []),
    ``,
    `Instructions:`,
    `- Use tools to inspect and edit the repository.`,
    `- Keep edits within the owned files unless a directly necessary adjacent test/fixture change is required.`,
    `- Run the declared verification command when one is provided.`,
    `- Do not claim completion until the acceptance criteria are satisfied or you have made the narrowest possible fix and run verification.`,
  ].join('\n');
}

async function existingAppliedSpecIds(artifactRoot: string): Promise<Set<string>> {
  const root = join(artifactRoot, 'code-patches');
  const applied = new Set<string>();
  async function visit(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    const entries = await import('node:fs/promises').then((fs) => fs.readdir(dir, { withFileTypes: true }));
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

async function maybeCommit(repoRoot: string, touchedFiles: string[], title: string, autoCommit?: boolean): Promise<string | undefined> {
  if (!autoCommit) return undefined;
  await runGit(repoRoot, ['add', '--', ...touchedFiles]);
  await runGit(repoRoot, ['commit', '-m', `Foundry coder patch: ${title.slice(0, 60)}`]);
  return (await runGit(repoRoot, ['rev-parse', 'HEAD'])).stdout.trim();
}

function fixClassPriorityRank(fixClass: string): number {
  const priority = [
    'foundry_runtime_wiring_gap',
    'precompiler_reference_shape_gap',
    'extractor_prompt_contract',
    'event_graph_coverage',
    'execution_scaling',
    'labware_alias_or_resolver_gap',
    'material_catalog_or_spec_gap',
    'browser_or_labware_rendering',
  ];
  const index = priority.indexOf(fixClass);
  return index === -1 ? priority.length : index;
}

export function selectPatchSpecIdForRun(specs: Array<{ id: string; fixClass: string }>): string | undefined {
  const [selected] = [...specs].sort((a, b) =>
    fixClassPriorityRank(a.fixClass) - fixClassPriorityRank(b.fixClass)
    || a.id.localeCompare(b.id),
  );
  return selected?.id;
}

function selectPatchSpecForRun(specs: PatchSpec[]): PatchSpec | undefined {
  const selectedId = selectPatchSpecIdForRun(specs);
  return selectedId ? specs.find((spec) => spec.id === selectedId) : undefined;
}

export async function runFoundryCoderPatch(input: {
  artifactRoot: string;
  repoRoot: string;
  workbenchRoot?: string;
  protocolId: string;
  variant: FoundryVariant;
  appBase?: string;
  apiBase?: string;
  inference?: Partial<InferenceConfig>;
  dryRun?: boolean;
  autoCommit?: boolean;
  autoPush?: boolean;
  attempt?: number;
  coderRole?: FoundryCoderRole;
  coderEngine?: FoundryCoderEngine;
  workerInference?: Partial<InferenceConfig>;
  revisionFeedback?: string;
  onProgress?: (event: FoundryCoderPatchProgressEvent) => void | Promise<void>;
  /**
   * When set, the coder uses this exact patch-spec YAML instead of scanning
   * the executable queue. The already-applied filter is also bypassed so the
   * inner loop can re-apply a draft spec freely.
   */
  forcedSpecPath?: string;
}): Promise<FoundryCoderPatchResult> {
  const progress = async (
    event: Omit<FoundryCoderPatchProgressEvent, 'source'>,
  ) => {
    await input.onProgress?.({ source: 'coder', ...event });
  };
  const resultRoot = join(input.artifactRoot, 'code-patches', input.protocolId, input.variant);
  const resultPath = join(resultRoot, 'result.yaml');
  let allSpecs: PatchSpec[];
  let pendingSpecs: PatchSpec[];
  if (input.forcedSpecPath) {
    const forced = await readPatchSpec(input.forcedSpecPath);
    allSpecs = [forced];
    pendingSpecs = [forced];
  } else {
    const specPaths = await listPatchSpecs(input.artifactRoot, input.protocolId, input.variant);
    allSpecs = await Promise.all(specPaths.map(readPatchSpec));
    const alreadyAppliedSpecIds = await existingAppliedSpecIds(input.artifactRoot);
    pendingSpecs = allSpecs.filter((spec) => !alreadyAppliedSpecIds.has(spec.id));
  }

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
      message: 'All requested fix classes already applied.',
    });
    return { status: 'skipped', resultPath, message: 'fix classes already applied', touchedFiles: [] };
  }

  const selectedSpec = selectPatchSpecForRun(pendingSpecs);
  if (!selectedSpec) {
    return { status: 'skipped', resultPath, message: 'no selectable patch spec', touchedFiles: [] };
  }
  await progress({
    phase: 'selected_spec',
    message: `Selected patch spec ${selectedSpec.id}`,
    details: { specId: selectedSpec.id, title: selectedSpec.title, fixClass: selectedSpec.fixClass },
  });

  // ── Ralph coder routing ──
  // Attempt 1 should normally run against the junior worker. Revision attempts
  // are explicitly escalated by the runner/supervisor to the senior endpoint.
  const specModelProfile = typeof selectedSpec.raw['coderModelProfile'] === 'object'
    && selectedSpec.raw['coderModelProfile'] !== null
      ? selectedSpec.raw['coderModelProfile'] as Record<string, unknown>
      : null;
  const specRecommendedModel = typeof specModelProfile?.['model'] === 'string' ? specModelProfile['model'] : undefined;

  const archBaseUrl = input.inference?.baseUrl ?? process.env['PI_ARCHITECT_BASE_URL'] ?? process.env['OPENAI_BASE_URL'] ?? 'http://thunderbeast:8000/v1';
  const seniorCoderModel = input.inference?.model ?? process.env['PI_ARCHITECT_MODEL'] ?? process.env['OPENAI_MODEL'] ?? specRecommendedModel ?? 'Qwen/Qwen3.6-27B-FP8';
  const workerBaseUrl = input.workerInference?.baseUrl ?? process.env['PI_WORKER_BASE_URL'] ?? 'http://thunderbeast:8001/v1';
  const speedyCoderModel = input.workerInference?.model ?? process.env['PI_WORKER_MODEL'] ?? 'Qwen/Qwen3.6-35B-A3B-FP8';
  const coderRole: FoundryCoderRole = input.coderRole ?? (specRecommendedModel?.includes('27B') ? 'senior' : 'junior');
  const coderEngine: FoundryCoderEngine = input.coderEngine ?? 'symbol-patch';

  let baseUrl: string, model: string, timeoutMs: number;
  if (coderRole === 'senior') {
    baseUrl = archBaseUrl;
    model = seniorCoderModel;
    timeoutMs = 1200_000;
  } else {
    baseUrl = workerBaseUrl;
    model = speedyCoderModel;
    timeoutMs = 300_000;
  }

  if (!baseUrl || !model || input.dryRun) {
    return { status: 'blocked', resultPath, message: 'coder not configured', touchedFiles: [] };
  }
  console.log(`[foundry-coder] routing: role=${coderRole}, engine=${coderEngine}, attempt=${input.attempt ?? 1}, model=${model}, endpoint=${baseUrl}, timeout=${timeoutMs / 1000}s`);
  await progress({
    phase: 'routing',
    message: `Running ${coderRole} ${coderEngine} coder attempt ${input.attempt ?? 1}`,
    details: { coderRole, coderEngine, attempt: input.attempt ?? 1, model, endpoint: baseUrl },
  });
  const coderRunMetadata = {
    attempt: input.attempt ?? 1,
    coderRole,
    coderEngine,
    endpoint: baseUrl,
    model,
  };

  const [ownedContext, artifactContext, schemaContext] = await Promise.all([
    collectOwnedContext(input.repoRoot, [selectedSpec]),
    collectSpecArtifactContext(input.artifactRoot, [selectedSpec]),
    collectSchemaContext(input.repoRoot, selectedSpec.fixClass),
  ]);
  await progress({
    phase: 'context_ready',
    message: 'Collected owned-file, artifact, and schema context',
    details: {
      ownedContextBytes: ownedContext.length,
      artifactContextBytes: artifactContext.length,
      schemaContextBytes: schemaContext.length,
    },
  });

  const context = [
    'Repository context:',
    ownedContext || '(no owned-file context found)',
    '',
    'Relevant schema context:',
    schemaContext || '(no schema context found)',
    '',
    'Source artifact context:',
    artifactContext || '(no source artifact context found)',
  ].join('\n');

  const client = createInferenceClient({
    baseUrl,
    model,
    temperature: 0.1,
    timeoutMs,
    maxTokens: 16384,
  });

  await mkdir(resultRoot, { recursive: true });

  if (coderEngine === 'tool-agent') {
    const before = await snapshotOwnedFiles(input.repoRoot, selectedSpec);
    const tracePath = join(resultRoot, `tool-agent-${coderRole}-attempt-${input.attempt ?? 1}.jsonl`);
    await progress({
      phase: 'tool_agent_started',
      message: 'Starting tool-agent coder',
      details: { tracePath },
    });
    const agentResult = await runFoundryToolAgent({
      client,
      model,
      workdir: input.repoRoot,
      systemPrompt: [
        'You are the Protocol Foundry coder.',
        'Fix the compiler issue described by the patch spec.',
        'Use tools to inspect, edit, and verify the repository.',
        'Do not include private chain-of-thought in your final answer.',
      ].join('\n'),
      prompt: toolAgentPrompt({
        selectedSpec,
        context,
        ...(input.revisionFeedback ? { revisionFeedback: input.revisionFeedback } : {}),
      }),
      tracePath,
      maxTurns: TOOL_AGENT_MAX_TURNS,
      maxTokens: 16_384,
      temperature: 0.1,
      onProgress: async (event) => {
        await progress({
          phase: event.phase,
          message: event.message,
          ...(event.details ? { details: event.details } : {}),
        });
      },
    });

    if (agentResult.status !== 'complete') {
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        ...coderRunMetadata,
        status: agentResult.status === 'failed' ? 'failed' : 'needs-human',
        selectedSpecId: selectedSpec.id,
        message: `Tool agent did not complete: ${agentResult.status}`,
        tracePath,
        finalText: agentResult.finalText.slice(0, 4000),
      });
      return {
        status: agentResult.status === 'failed' ? 'failed' : 'needs-human',
        resultPath,
        message: `tool agent did not complete: ${agentResult.status}`,
        touchedFiles: [],
      };
    }

    const touchedFiles = await changedOwnedFiles(input.repoRoot, before);
    await progress({
      phase: 'files_written',
      message: `Tool agent changed ${touchedFiles.length} owned file(s)`,
      details: { touchedFiles },
    });

    const meaningfulFiles = meaningfulPatchFiles(touchedFiles);
    if (meaningfulFiles.length === 0) {
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        ...coderRunMetadata,
        status: 'blocked',
        selectedSpecId: selectedSpec.id,
        message: 'Tool agent completed but changed no meaningful compiler/schema/record files.',
        touchedFiles,
        tracePath,
        finalText: agentResult.finalText.slice(0, 4000),
      });
      return { status: 'blocked', resultPath, message: 'no meaningful files touched', touchedFiles: [] };
    }

    try {
      let tscOutput = '';
      await progress({ phase: 'typecheck_started', message: 'Running TypeScript check for touched files' });
      try {
        const result = await execFileAsync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
          cwd: join(input.repoRoot, 'server'),
          maxBuffer: 1024 * 1024 * 12,
          timeout: 120_000,
        });
        tscOutput = result.stdout + result.stderr;
      } catch (err: any) {
        tscOutput = (err.stdout || '') + (err.stderr || '');
      }

      const touchedBases = touchedFiles.map((f) => f.startsWith('src/') ? f.slice(4) : f);
      const relevantErrors = tscOutput.split('\n').filter((line) => {
        if (!line.includes(' error TS')) return false;
        return touchedBases.some((t) => line.includes(t));
      });

      if (relevantErrors.length > 0) {
        await progress({
          phase: 'typecheck_failed',
          message: `Typecheck found ${relevantErrors.length} error(s) in touched files`,
          details: { errorCount: relevantErrors.length },
        });
        await restoreSnapshot(input.repoRoot, before, touchedFiles);
        await writeYamlFile(resultPath, {
          kind: 'protocol-foundry-coder-patch-result',
          protocolId: input.protocolId,
          variant: input.variant,
          generated_at: nowIso(),
          ...coderRunMetadata,
          status: 'failed',
          selectedSpecId: selectedSpec.id,
          message: 'Tool agent patch failed TypeScript check; reverted.',
          touchedFiles,
          tracePath,
          tscOutput: relevantErrors.join('\n').slice(0, 4000),
          finalText: agentResult.finalText.slice(0, 4000),
        });
        return { status: 'failed', resultPath, message: 'compilation failed', touchedFiles: [] };
      }

      await progress({ phase: 'typecheck_passed', message: 'Typecheck passed for touched files' });
      await progress({ phase: 'tests_started', message: 'Running focused verification tests' });
      const testsPass = await runVerification(input.repoRoot, touchedFiles);
      if (!testsPass) {
        await progress({ phase: 'tests_failed', message: 'Focused verification tests failed; reverting patch' });
        await restoreSnapshot(input.repoRoot, before, touchedFiles);
        await writeYamlFile(resultPath, {
          kind: 'protocol-foundry-coder-patch-result',
          protocolId: input.protocolId,
          variant: input.variant,
          generated_at: nowIso(),
          ...coderRunMetadata,
          status: 'failed',
          selectedSpecId: selectedSpec.id,
          message: 'Tool agent patch failed verification tests; reverted.',
          touchedFiles,
          tracePath,
          finalText: agentResult.finalText.slice(0, 4000),
        });
        return { status: 'failed', resultPath, message: 'tests failed', touchedFiles: [] };
      }

      await progress({ phase: 'tests_passed', message: 'Focused verification tests passed' });
      const commit = await maybeCommit(input.repoRoot, touchedFiles, selectedSpec.title, input.autoCommit);
      const message = commit ? 'Patch applied and committed.' : 'Patch applied.';
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        ...coderRunMetadata,
        status: 'applied',
        selectedSpecId: selectedSpec.id,
        touchedFiles,
        ...(commit ? { commit } : {}),
        message,
        tracePath,
        finalText: agentResult.finalText.slice(0, 4000),
      });
      await progress({
        phase: 'result',
        message: `Tool-agent patch applied to ${touchedFiles.length} file(s)`,
        details: { status: 'applied', touchedFiles },
      });
      return { status: 'applied', resultPath, message, touchedFiles };
    } catch (error) {
      await restoreSnapshot(input.repoRoot, before, touchedFiles).catch(() => undefined);
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        ...coderRunMetadata,
        status: 'failed',
        selectedSpecId: selectedSpec.id,
        message: error instanceof Error ? error.message : String(error),
        touchedFiles,
        tracePath,
      });
      return { status: 'failed', resultPath, message: error instanceof Error ? error.message : String(error), touchedFiles: [] };
    }
  }

  // Collect the full target file(s) for symbol replacement
  const owned = Array.from(new Set(selectedSpec.ownedFiles)).slice(0, 6);
  const targetFiles: { path: string; fullPath: string; content: string; symbols: SymbolBlock[] }[] = [];
  for (const ownedPath of owned) {
    const dirPath = join(input.repoRoot, ownedPath);
    const files = await walkFiles(input.repoRoot, dirPath, 4);
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;
      try {
        const fileContent = await readFile(file, 'utf-8');
        const symbols = findSymbolBlocks(fileContent);
        targetFiles.push({
          path: relative(input.repoRoot, file),
          fullPath: file,
          content: fileContent,
          symbols,
        });
      } catch {
        // skip unreadable files
      }
    }
  }
  await progress({
    phase: 'targets_ready',
    message: `Found ${targetFiles.length} candidate target file(s)`,
    details: { targetFiles: targetFiles.map((f) => f.path) },
  });

  // Build symbol list for the prompt
  const symbolList = targetFiles.map((tf) =>
    [tf.path, tf.symbols.map((s) => `  ${s.declaration}`).join('\n')].join('\n'),
  ).join('\n\n');

  // Single direct attempt: ask coder for symbol replacements. Stream the
  // public WORKLOG lines as they arrive, then parse the complete response for
  // symbol replacement blocks exactly as before.
  await progress({ phase: 'llm_started', message: 'Asking coder model for symbol replacements' });
  const completionRequest: CompletionRequest = {
    model,
    temperature: 0.1,
    max_tokens: 16384,
    messages: [
      {
        role: 'system',
        content: [
          'You are the Protocol Foundry coder. Fix the compiler issue described in the patch spec.',
          '',
          'OUTPUT FORMAT — Symbol Replacement Blocks:',
          '',
          'For each change, wrap the replacement in markers:',
          '',
          '  @@replace functionName@@',
          '  [complete replacement code for this function]',
          '  @@end@@',
          '',
          '  @@add@@',
          '  [new code to append at end of file]',
          '  @@end@@',
          '',
          'Rules:',
          '- Emit frequent short public progress notes as lines starting with "WORKLOG:".',
          '- WORKLOG lines should describe observable work only: file choice, hypothesis, patch area, verification step.',
          '- Emit a WORKLOG line before choosing target symbols, before generating replacements, and before verification assumptions.',
          '- Do NOT include private chain-of-thought or hidden reasoning in WORKLOG lines.',
          '- For @@replace: output the COMPLETE function body, including the function declaration line',
          '- For @@add: output new functions/code to append at end of the target file',
          '- Include necessary imports if adding new functions (as @@add@@ blocks)',
          '- Do NOT output unified diffs, git apply output, or partial snippets',
          '- If the fix needs to modify an existing function, use @@replace functionName@@',
          '- If the fix needs new code, use @@add@@',
          '- Be precise: the content between markers is inserted exactly as-is',
          '- One block per function change',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `## Patch Spec`,
          `- Title: ${selectedSpec.title}`,
          `- Rationale: ${selectedSpec.rationale}`,
          `- Fix class: ${selectedSpec.fixClass}`,
          ``,
          `## Target File(s) and Available Symbols`,
          `${symbolList || '(none)'}`,
          ``,
          `## Relevant Artifact Context`,
          `${(context || '').slice(0, 6000)}`,
          ...(input.revisionFeedback ? [`
## CRITIC REVISION FEEDBACK`, input.revisionFeedback] : []),
          ``,
          `Produce concise WORKLOG lines while you work, then symbol replacement blocks that fix this issue.`,
        ].join('\n'),
      },
    ],
  };

  let aiContent = '';
  let reasoningChars = 0;
  let visibleOutputChars = 0;
  let worklogBuffer = '';
  const emittedWorklog = new Set<string>();
  const firstString = (...values: unknown[]): string | undefined => {
    for (const value of values) {
      if (typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
  };
  const snippet = (value: string): string =>
    value.replace(/\s+/g, ' ').trim().slice(0, 240);
  const emitWorklogLines = async (text: string, flush = false): Promise<string> => {
    const lines = text.split('\n');
    const tail = flush ? '' : lines.pop() ?? '';
    const completeLines = flush ? lines : lines;
    for (const line of completeLines) {
      const match = line.match(/^\s*WORKLOG:\s*(.+?)\s*$/i);
      if (!match) continue;
      const note = match[1]!;
      if (emittedWorklog.has(note)) continue;
      emittedWorklog.add(note);
      await progress({
        phase: 'worklog',
        message: note,
      });
    }
    return tail;
  };

  for await (const chunk of client.completeStream(completionRequest)) {
    const rawDelta = chunk.choices?.[0]?.delta as Record<string, unknown> | undefined;
    if (!rawDelta) continue;

    const reasoningDelta = firstString(rawDelta['reasoning'], rawDelta['reasoning_content']);
    if (reasoningDelta) {
      reasoningChars += reasoningDelta.length;
      await progress({
        phase: 'reasoning_activity',
        message: `Model reasoning stream active (+${reasoningDelta.length} chars, ${reasoningChars} total)`,
        details: {
          deltaChars: reasoningDelta.length,
          totalChars: reasoningChars,
          rawReasoning: reasoningDelta,
        },
      });
    }

    let contentDelta = firstString(rawDelta['content']);
    // InferenceClient preserves provider reasoning fields, but may also
    // normalize reasoning into content for older callers. Do not treat that
    // normalized hidden reasoning as patch output.
    if (reasoningDelta && contentDelta === reasoningDelta) {
      contentDelta = undefined;
    }
    if (!contentDelta) continue;

    // Diagnostics on first visible content: report whether reasoning was seen.
    if (visibleOutputChars === 0) {
      await progress({
        phase: 'llm_status',
        message: reasoningChars > 0
          ? `Model streaming — reasoning active (${reasoningChars} chars so far)`
          : 'Model streaming — no reasoning field detected (model may not support it)',
        details: { hasReasoning: reasoningChars > 0, reasoningChars },
      });
    }

    visibleOutputChars += contentDelta.length;
    aiContent += contentDelta;
    const contentSnippet = snippet(contentDelta);
    if (contentSnippet) {
      await progress({
        phase: 'model_output',
        message: contentSnippet,
        details: { deltaChars: contentDelta.length, totalChars: visibleOutputChars },
      });
    }
    worklogBuffer = await emitWorklogLines(worklogBuffer + contentDelta);
  }
  await emitWorklogLines(worklogBuffer, true);
  await progress({
    phase: 'llm_finished',
    message: `Coder model returned ${aiContent.length} visible character(s); reasoning stream produced ${reasoningChars} character(s)`,
    details: { responseChars: aiContent.length, reasoningChars },
  });
  const replacements = parseSymbolResponse(aiContent);
  await progress({
    phase: 'replacements_parsed',
    message: `Parsed ${replacements.length} symbol replacement block(s)`,
    details: { replacementCount: replacements.length },
  });
  if (replacements.length === 0) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      ...coderRunMetadata,
      status: 'needs-human',
      message: 'Coder did not produce any valid symbol replacement blocks.',
      rawResponse: aiContent.slice(0, 4000),
    });
    return { status: 'needs-human', resultPath, message: 'no symbol replacements produced', touchedFiles: [] };
  }

  // Apply symbol replacements directly to target files
  const touchedFiles: string[] = [];
  const modifiedFiles = new Map<string, string>();

  // Track which add ops have been applied so they only land once
  const appliedAddOps = new Set<number>();

  for (const tf of targetFiles) {
    const fileReplacements = replacements.filter((r) => {
      if (r.op === 'replace') {
        return tf.symbols.some((s) => s.name === r.targetName);
      }
      // add ops: only apply to the first file, and only once
      return !appliedAddOps.has(replacements.indexOf(r));
    });
    if (fileReplacements.length === 0) continue;
    // Mark add ops in this file as applied
    fileReplacements.forEach((r) => {
      if (r.op === 'add') {
        appliedAddOps.add(replacements.indexOf(r));
      }
    });

    const newContent = applySymbolReplacements(tf.content, fileReplacements);
    if (newContent !== tf.content) {
      modifiedFiles.set(tf.path, tf.content);
      await writeFile(tf.fullPath, newContent, 'utf-8');
      touchedFiles.push(tf.path);
    }
  }
  await progress({
    phase: 'files_written',
    message: `Wrote ${touchedFiles.length} changed file(s)`,
    details: { touchedFiles },
  });

  const meaningfulFiles = meaningfulPatchFiles(touchedFiles);
  if (meaningfulFiles.length === 0) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      ...coderRunMetadata,
      status: 'blocked',
      message: 'Patch touches no meaningful compiler/schema/record files.',
      touchedFiles,
    });
    return { status: 'blocked', resultPath, message: 'no meaningful files touched', touchedFiles: [] };
  }

  try {
    // Verify it compiles — only check errors in files we actually touched
    let tscOutput = '';
    await progress({ phase: 'typecheck_started', message: 'Running TypeScript check for touched files' });
    try {
      const result = await execFileAsync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
        cwd: join(input.repoRoot, 'server'),
        maxBuffer: 1024 * 1024 * 12,
        timeout: 120_000,
      });
      tscOutput = result.stdout + result.stderr;
    } catch (err: any) {
      tscOutput = (err.stdout || '') + (err.stderr || '');
    }

    // Filter to only errors in touched files - ignore pre-existing errors elsewhere
    const touchedBases = touchedFiles.map((f) => f.startsWith('src/') ? f.slice(4) : f);
    const relevantErrors = tscOutput.split('\n').filter((line) => {
      if (!line.includes(' error TS')) return false;
      return touchedBases.some((t) => line.includes(t));
    });

    if (relevantErrors.length > 0) {
      await progress({
        phase: 'typecheck_failed',
        message: `Typecheck found ${relevantErrors.length} error(s) in touched files`,
        details: { errorCount: relevantErrors.length },
      });
      // Save debug info before reverting
      await writeFile(join(resultRoot, 'debug_tsc_output.txt'), tscOutput.slice(0, 8000), 'utf-8');
      await writeFile(join(resultRoot, 'debug_ai_response.txt'), aiContent.slice(0, 8000), 'utf-8');
      // Revert changes
      for (const [file, originalContent] of modifiedFiles) {
        await writeFile(join(input.repoRoot, file), originalContent, 'utf-8');
      }
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        ...coderRunMetadata,
        status: 'failed',
        message: 'Patch applied but compilation failed; reverted.',
        touchedFiles,
        tscOutput: relevantErrors.join('\n').slice(0, 4000),
        rawResponse: aiContent.slice(0, 4000),
      });
      return { status: 'failed', resultPath, message: 'compilation failed', touchedFiles: [] };
    }

    // Log pre-existing errors as warnings (not blockers)
    if (tscOutput.includes('error TS')) {
      const preExisting = tscOutput.split('\n').filter((l) => l.includes('error TS')).length;
      console.log(`[foundry-coder] compilation ok, ${preExisting} pre-existing error(s) in untouched files ignored`);
    }
    await progress({
      phase: 'typecheck_passed',
      message: 'Typecheck passed for touched files',
    });

    // Run focused tests (blocking)
    await progress({ phase: 'tests_started', message: 'Running focused verification tests' });
    const testsPass = await runVerification(input.repoRoot, touchedFiles);
    if (!testsPass) {
      await progress({ phase: 'tests_failed', message: 'Focused verification tests failed; reverting patch' });
      console.error(`[foundry-coder] tests failed for ${selectedSpec.id}; reverting and skipping patch`);
      // Revert changes
      for (const [file, originalContent] of modifiedFiles) {
        await writeFile(join(input.repoRoot, file), originalContent, 'utf-8');
      }
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        ...coderRunMetadata,
        status: 'failed',
        message: 'Patch applied but verification tests failed; reverted.',
        touchedFiles,
        rawResponse: aiContent.slice(0, 4000),
      });
      return { status: 'failed', resultPath, message: 'tests failed', touchedFiles: [] };
    }
    await progress({ phase: 'tests_passed', message: 'Focused verification tests passed' });

    // Commit the patch
    const commit = await maybeCommit(input.repoRoot, touchedFiles, selectedSpec.title, input.autoCommit);
    const message = commit ? 'Patch applied and committed.' : 'Patch applied.';

    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      ...coderRunMetadata,
      status: 'applied',
      selectedSpecId: selectedSpec.id,
      touchedFiles,
      ...(commit ? { commit } : {}),
      message,
    });
    await progress({
      phase: 'result',
      message: `Coder patch applied to ${touchedFiles.length} file(s)`,
      details: { status: 'applied', touchedFiles },
    });

    return { status: 'applied', resultPath, message, touchedFiles };

  } catch (error) {
    await progress({
      phase: 'result',
      message: `Coder patch failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { status: 'failed' },
    });
    // Ensure clean state on any failure
    await runGit(input.repoRoot, ['checkout', '--', ...touchedFiles]).catch(() => {});
    await runGit(input.repoRoot, ['reset', '--hard', 'HEAD']).catch(() => {});

    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      ...coderRunMetadata,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      touchedFiles,
    });
    return { status: 'failed', resultPath, message: error instanceof Error ? error.message : String(error), touchedFiles: [] };
  }
}
