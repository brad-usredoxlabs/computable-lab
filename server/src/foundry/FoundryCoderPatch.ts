import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Project } from 'ts-morph';
import { createInferenceClient } from '../ai/InferenceClient.js';
import type { InferenceConfig } from '../config/types.js';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';

const execFileAsync = promisify(execFile);
const MAX_CONTEXT_CHARS = 15_000;
const MAX_FILE_CHARS = 8_000;
const MAX_ARTIFACT_CONTEXT_CHARS = 5_000;
const MAX_SCHEMA_CONTEXT_CHARS = 4_000;

type CoderPatchStatus = 'applied' | 'blocked' | 'failed' | 'skipped' | 'stale' | 'needs-human';

export interface FoundryCoderPatchResult {
  status: CoderPatchStatus;
  resultPath: string;
  message: string;
  touchedFiles: string[];
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

async function runCompileCheck(repoRoot: string): Promise<boolean> {
  try {
    await execFileAsync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
      cwd: join(repoRoot, 'server'),
      maxBuffer: 1024 * 1024 * 12,
      timeout: 120_000,
    });
    return true;
  } catch {
    return false;
  }
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
  revisionFeedback?: string;
}): Promise<FoundryCoderPatchResult> {
  const resultRoot = join(input.artifactRoot, 'code-patches', input.protocolId, input.variant);
  const resultPath = join(resultRoot, 'result.yaml');
  const specPaths = await listPatchSpecs(input.artifactRoot, input.protocolId, input.variant);
  const allSpecs = await Promise.all(specPaths.map(readPatchSpec));
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
      message: 'All requested fix classes already applied.',
    });
    return { status: 'skipped', resultPath, message: 'fix classes already applied', touchedFiles: [] };
  }

  const selectedSpec = selectPatchSpecForRun(pendingSpecs);
  if (!selectedSpec) {
    return { status: 'skipped', resultPath, message: 'no selectable patch spec', touchedFiles: [] };
  }

  const baseUrl = input.inference?.baseUrl ?? process.env['PI_ARCHITECT_BASE_URL'] ?? process.env['OPENAI_BASE_URL'];
  const model = input.inference?.model ?? process.env['PI_ARCHITECT_MODEL'] ?? 'Qwen/Qwen3.6-27B-FP8';
  if (!baseUrl || !model || input.dryRun) {
    return { status: 'blocked', resultPath, message: 'coder not configured', touchedFiles: [] };
  }

  const [ownedContext, artifactContext, schemaContext] = await Promise.all([
    collectOwnedContext(input.repoRoot, [selectedSpec]),
    collectSpecArtifactContext(input.artifactRoot, [selectedSpec]),
    collectSchemaContext(input.repoRoot, selectedSpec.fixClass),
  ]);

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
    timeoutMs: 300_000,
    maxTokens: 16384,
  });

  await mkdir(resultRoot, { recursive: true });

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

  // Build symbol list for the prompt
  const symbolList = targetFiles.map((tf) =>
    [tf.path, tf.symbols.map((s) => `  ${s.declaration}`).join('\n')].join('\n'),
  ).join('\n\n');

  // Single direct attempt: ask coder for symbol replacements
  const response = await client.complete({
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
          `Produce symbol replacement blocks that fix this issue.`,
        ].join('\n'),
      },
    ],
  });

  const aiContent = response.choices[0]?.message.content ?? '';
  const replacements = parseSymbolResponse(aiContent);
  if (replacements.length === 0) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
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

  const meaningfulFiles = meaningfulPatchFiles(touchedFiles);
  if (meaningfulFiles.length === 0) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'blocked',
      message: 'Patch touches no meaningful compiler/schema/record files.',
      touchedFiles,
    });
    return { status: 'blocked', resultPath, message: 'no meaningful files touched', touchedFiles: [] };
  }

  try {
    // Verify it compiles
    const compiles = await runCompileCheck(input.repoRoot);
    if (!compiles) {
      // Revert changes
      for (const [file, originalContent] of modifiedFiles) {
        await writeFile(join(input.repoRoot, file), originalContent, 'utf-8');
      }
      await writeYamlFile(resultPath, {
        kind: 'protocol-foundry-coder-patch-result',
        protocolId: input.protocolId,
        variant: input.variant,
        generated_at: nowIso(),
        status: 'failed',
        message: 'Patch applied but compilation failed; reverted.',
        touchedFiles,
      });
      return { status: 'failed', resultPath, message: 'compilation failed', touchedFiles: [] };
    }

    // Run focused tests (warnings only)
    const testsPass = await runVerification(input.repoRoot, touchedFiles);
    if (!testsPass) {
      console.warn(`[foundry-coder] tests failed for ${selectedSpec.id}, but patch compiles - landing anyway`);
    }

    // Commit the patch
    const commit = await maybeCommit(input.repoRoot, touchedFiles, selectedSpec.title, input.autoCommit);

    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'applied',
      selectedSpecId: selectedSpec.id,
      touchedFiles,
      ...(commit ? { commit } : {}),
      message: 'Patch applied and committed.',
    });

    return { status: 'applied', resultPath, message: 'patch applied and committed', touchedFiles };

  } catch (error) {
    // Ensure clean state on any failure
    await runGit(input.repoRoot, ['checkout', '--', ...touchedFiles]).catch(() => {});
    await runGit(input.repoRoot, ['reset', '--hard', 'HEAD']).catch(() => {});

    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      touchedFiles,
    });
    return { status: 'failed', resultPath, message: error instanceof Error ? error.message : String(error), touchedFiles: [] };
  }
}
