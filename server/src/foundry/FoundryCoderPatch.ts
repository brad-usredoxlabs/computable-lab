import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { createInferenceClient } from '../ai/InferenceClient.js';
import type { InferenceConfig } from '../config/types.js';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';
import { completeWithWorktreeTools, readWorktreeDiff } from './FoundryWorktreeTools.js';

const execFileAsync = promisify(execFile);
const MAX_CONTEXT_CHARS = 9_000;
const MAX_FILE_CHARS = 7_000;
const MAX_ARTIFACT_CONTEXT_CHARS = 7_000;
const MAX_ARTIFACT_FILE_CHARS = 3_000;
const MAX_SCHEMA_CONTEXT_CHARS = 5_000;
const MAX_LABWARE_CONTEXT_CHARS = 4_000;
const MAX_ANCHOR_CONTEXT_CHARS = 8_000;

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

interface CoderResponse {
  attempt: number;
  strategy: string;
  content: string;
  parsed?: Record<string, unknown>;
  diff?: string;
  diffSource?: 'unifiedDiff' | 'structuredEdits' | 'worktreeTools';
  summary?: string;
}

export interface StructuredEdit {
  path: string;
  search: string;
  replace: string;
  occurrence?: number;
  anchorId?: string;
}

interface IndexedStructuredEdit extends StructuredEdit {
  editIndex: number;
}

interface AttemptResult {
  attempt: number;
  strategy: string;
  status: 'blocked' | 'failed' | 'applied';
  phase: string;
  message: string;
  diffPath?: string;
  diffSource?: CoderResponse['diffSource'];
  touchedFiles: string[];
  verification?: Array<{
    command: string;
    status: 'pass' | 'fail';
    stdout?: string;
    stderr?: string;
  }>;
  corruptedFileRegion?: {
    file: string;
    lines: string;
  }[];
  commit?: string;
  pushed?: boolean;
  summary?: string;
  rawResponse?: string;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function compactUnknown(value: unknown, maxChars: number): unknown {
  if (typeof value === 'string') {
    return value.length > maxChars ? `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]` : value;
  }
  if (!value || typeof value !== 'object') return value;
  const text = JSON.stringify(value, (_key, entry) => {
    if (typeof entry === 'string' && entry.length > 500) return `${entry.slice(0, 500)}...`;
    return entry;
  });
  if (text.length <= maxChars) return value;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function compactPatchSpecForPrompt(spec: PatchSpec): Record<string, unknown> {
  const raw = spec.raw;
  return {
    id: spec.id,
    fixClass: spec.fixClass,
    title: spec.title,
    rationale: spec.rationale,
    ownedFiles: spec.ownedFiles,
    acceptance: spec.acceptance,
    implementationBudget: raw['implementationBudget'],
    coderModelProfile: raw['coderModelProfile'],
    contextHints: Array.isArray(raw['contextHints']) ? raw['contextHints'].slice(0, 8) : raw['contextHints'],
    doNotTouch: raw['doNotTouch'],
    sourceArtifacts: raw['sourceArtifacts'],
    failureEvidence: compactUnknown(raw['failureEvidence'], 2_000),
    architectNotes: compactUnknown(raw['architectNotes'], 2_000),
    sourceVerdict: raw['sourceVerdict'],
  };
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

interface SourceAnchorPattern {
  id: string;
  pattern: RegExp;
  before: number;
  after: number;
}

function sourceAnchorPatternsForFixClass(fixClass: string): SourceAnchorPattern[] {
  const generic: SourceAnchorPattern[] = [
    { id: 'exported-function', pattern: /^export function \w+/, before: 18, after: 80 },
    { id: 'exported-interface', pattern: /^export interface \w+/, before: 12, after: 60 },
    { id: 'exported-const', pattern: /^export const \w+/, before: 12, after: 60 },
  ];

  if (fixClass === 'precompiler_reference_shape_gap') {
    return [
      { id: 'ai-precompile-output-interface', pattern: /^export interface AiPrecompileOutput\b/, before: 16, after: 72 },
      { id: 'ai-precompile-output-schema', pattern: /^function createAiPrecompileOutputSchema\b/, before: 16, after: 96 },
      { id: 'ai-precompile-salvage', pattern: /^function salvageAiPrecompileOutput\b/, before: 16, after: 92 },
      { id: 'ai-precompile-pass', pattern: /^export function createAiPrecompilePass\b/, before: 20, after: 132 },
      { id: 'ai-precompile-shape-mismatch', pattern: /ai_precompile_shape_mismatch/, before: 28, after: 56 },
      { id: 'resolve-references-pass', pattern: /createResolveReferencesPass\b/, before: 24, after: 92 },
      { id: 'deterministic-precompile-pass', pattern: /DeterministicPrecompile|createDeterministicPrecompile/, before: 24, after: 92 },
    ];
  }

  if (fixClass === 'foundry_runtime_wiring_gap') {
    return [
      { id: 'foundry-run-chatbot-compile', pattern: /runChatbotCompile|createChatbotCompile|CompileRunner/, before: 24, after: 96 },
      { id: 'dependency-wiring', pattern: /deps|dependencies|registry\.register|create.*Pass/, before: 18, after: 80 },
      ...generic,
    ];
  }

  if (fixClass === 'execution_scaling') {
    return [
      { id: 'execution-scale-plan', pattern: /executionScale|ExecutionScale|scale.*profile|derive.*scale/i, before: 24, after: 96 },
      { id: 'pipette-capability', pattern: /pipette|multichannel|reservoir|deck/i, before: 18, after: 80 },
      ...generic,
    ];
  }

  if (fixClass === 'labware_alias_or_resolver_gap' || fixClass === 'browser_or_labware_rendering') {
    return [
      { id: 'labware-resolver', pattern: /labware.*resolve|resolve.*labware|labware.*alias/i, before: 24, after: 96 },
      { id: 'labware-rendering', pattern: /render.*labware|labware.*render|geometry|deckSlot/i, before: 18, after: 80 },
      ...generic,
    ];
  }

  if (fixClass === 'material_catalog_or_spec_gap') {
    return [
      { id: 'material-resolver', pattern: /material.*resolve|resolve.*material|vendor.*product|formulation/i, before: 24, after: 96 },
      { id: 'material-schema-use', pattern: /materialSpec|MaterialSpec|vendorProduct|VendorProduct/i, before: 18, after: 80 },
      ...generic,
    ];
  }

  return generic;
}

function lineNumberedSlice(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n');
  const start = Math.max(1, startLine);
  const end = Math.min(lines.length, endLine);
  const width = String(end).length;
  const output: string[] = [];
  for (let line = start; line <= end; line += 1) {
    output.push(`${String(line).padStart(width, '0')} | ${lines[line - 1] ?? ''}`);
  }
  return output.join('\n');
}

function findSourceAnchorRanges(content: string, patterns: SourceAnchorPattern[]): Array<{
  id: string;
  startLine: number;
  endLine: number;
  matchedLine: number;
}> {
  const lines = content.split('\n');
  const ranges: Array<{ id: string; startLine: number; endLine: number; matchedLine: number }> = [];
  const seen = new Set<string>();
  for (const pattern of patterns) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!pattern.pattern.test(lines[index] ?? '')) continue;
      const matchedLine = index + 1;
      const startLine = Math.max(1, matchedLine - pattern.before);
      const endLine = Math.min(lines.length, matchedLine + pattern.after);
      const key = `${pattern.id}:${startLine}:${endLine}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranges.push({ id: pattern.id, startLine, endLine, matchedLine });
    }
  }
  return ranges.sort((a, b) => a.startLine - b.startLine || a.id.localeCompare(b.id));
}

function mergeAnchorRanges(ranges: Array<{
  id: string;
  startLine: number;
  endLine: number;
  matchedLine: number;
}>): Array<{ ids: string[]; startLine: number; endLine: number; matchedLines: number[] }> {
  const merged: Array<{ ids: string[]; startLine: number; endLine: number; matchedLines: number[] }> = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.startLine <= previous.endLine + 8) {
      previous.endLine = Math.max(previous.endLine, range.endLine);
      previous.ids.push(range.id);
      previous.matchedLines.push(range.matchedLine);
    } else {
      merged.push({
        ids: [range.id],
        startLine: range.startLine,
        endLine: range.endLine,
        matchedLines: [range.matchedLine],
      });
    }
  }
  return merged;
}

export async function collectSourceAnchorContext(repoRoot: string, specs: PatchSpec[], fixClass: string): Promise<string> {
  const owned = Array.from(new Set(specs.flatMap((spec) => spec.ownedFiles))).slice(0, 12);
  const files: string[] = [];
  for (const ownedPath of owned) {
    files.push(...await walkFiles(repoRoot, join(repoRoot, ownedPath), 8));
  }
  const patterns = sourceAnchorPatternsForFixClass(fixClass);
  const chunks: string[] = [];
  for (const file of Array.from(new Set(files)).slice(0, 24)) {
    const rel = relative(repoRoot, file);
    const content = await readFile(file, 'utf-8');
    const ranges = mergeAnchorRanges(findSourceAnchorRanges(content, patterns)).slice(0, 8);
    for (const range of ranges) {
      const anchorIds = Array.from(new Set(range.ids)).join(',');
      chunks.push([
        `--- anchor:${anchorIds} file:${rel} lines:${range.startLine}-${range.endLine} matched:${range.matchedLines.join(',')}`,
        lineNumberedSlice(content, range.startLine, range.endLine),
      ].join('\n'));
      if (chunks.join('\n\n').length > MAX_ANCHOR_CONTEXT_CHARS) {
        return chunks.join('\n\n').slice(0, MAX_ANCHOR_CONTEXT_CHARS);
      }
    }
  }
  return chunks.join('\n\n').slice(0, MAX_ANCHOR_CONTEXT_CHARS);
}

async function collectSpecArtifactContext(artifactRoot: string, specs: PatchSpec[]): Promise<string> {
  const artifactRootResolved = resolve(artifactRoot);
  const candidates: string[] = [];
  for (const spec of specs) {
    const sourceArtifacts = asRecord(spec.raw['sourceArtifacts']);
    for (const value of Object.values(sourceArtifacts)) {
      if (typeof value === 'string' && value.trim()) candidates.push(value.trim());
    }
    const sourceVerdict = spec.raw['sourceVerdict'];
    if (typeof sourceVerdict === 'string' && sourceVerdict.trim()) candidates.push(sourceVerdict.trim());
  }

  const chunks: string[] = [];
  for (const candidate of Array.from(new Set(candidates))) {
    const fullPath = resolve(candidate);
    if (!fullPath.startsWith(`${artifactRootResolved}/`) && fullPath !== artifactRootResolved) continue;
    if (!existsSync(fullPath)) continue;
    const stats = await stat(fullPath);
    if (!stats.isFile()) continue;
    if (!/\.(ya?ml|txt|md)$/i.test(fullPath)) continue;
    const rel = relative(artifactRootResolved, fullPath);
    const content = (await readFile(fullPath, 'utf-8')).slice(0, MAX_ARTIFACT_FILE_CHARS);
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
      'schema/lab/material-instance.schema.yaml',
      'schema/lab/aliquot.schema.yaml',
    ]);
  }
  if (fixClass === 'browser_or_labware_rendering' || fixClass === 'execution_scaling' || fixClass === 'labware_alias_or_resolver_gap' || fixClass === 'foundry_runtime_wiring_gap') {
    add([
      'schema/workflow/labware-definition.schema.yaml',
      'schema/lab/labware.schema.yaml',
      'schema/lab/labware-geometry.schema.yaml',
    ]);
  }
  if (fixClass === 'execution_scaling' || fixClass === 'foundry_runtime_wiring_gap') {
    add([
      'schema/workflow/execution-scale-profile.schema.yaml',
      'schema/workflow/execution-scale-plan.schema.yaml',
    ]);
  }
  if (fixClass === 'precompiler_reference_shape_gap' || fixClass === 'foundry_runtime_wiring_gap') {
    add([
      'schema/registry/compile-pipelines/chatbot-compile.yaml',
      'schema/registry/prompt-templates/chatbot-compile.precompile.system.yaml',
      'schema/registry/prompt-templates/chatbot-compile.tagger.system.yaml',
    ]);
  }

  if (schemaPaths.size === 0) return '(no schema bundle for this fix class)';

  const chunks: string[] = [
    [
      'Record policy summary:',
      '- Material records describe substances/reagents/concepts, not containers or physical holders.',
      '- Tubes, plates, racks, reservoirs, tips, and deck-compatible holders belong in labware-definition YAML.',
      '- Vendor PDFs may justify material, material-spec, vendor-product, or labware-definition records.',
      '- Vendor PDFs must not create material-instance, aliquot, material-lot, source-tube, or inventory records.',
      '- New labware definitions must use records/seed/labware-definition/*.yaml, not records/seed/labware-definitions/*.yaml.',
    ].join('\n'),
  ];
  for (const schemaPath of schemaPaths) {
    const fullPath = join(repoRoot, schemaPath);
    if (!existsSync(fullPath)) continue;
    const content = (await readFile(fullPath, 'utf-8')).slice(0, MAX_FILE_CHARS);
    chunks.push(`--- schema:${schemaPath}\n${content}`);
    if (chunks.join('\n\n').length > MAX_SCHEMA_CONTEXT_CHARS) break;
  }
  return chunks.join('\n\n').slice(0, MAX_SCHEMA_CONTEXT_CHARS);
}

function labwareContextApplies(fixClass: string): boolean {
  return fixClass === 'material_catalog_or_spec_gap'
    || fixClass === 'browser_or_labware_rendering'
    || fixClass === 'execution_scaling'
    || fixClass === 'labware_alias_or_resolver_gap'
    || fixClass === 'foundry_runtime_wiring_gap';
}

function stringifySmall(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (typeof entry === 'string' && entry.length > 1000) return `${entry.slice(0, 1000)}...`;
    return entry;
  });
}

function labwareSearchNeedles(specs: PatchSpec[]): string[] {
  const evidence = specs.map((spec) => stringifySmall(spec.raw)).join('\n').toLowerCase();
  const needles = new Set<string>();
  for (const token of [
    '96', '384', '24', '12', '8', '2', '1.5', '2ml', '15ml', '50ml',
    'plate', 'well', 'reservoir', 'trough', 'tube', 'rack', 'tip', 'tiprack',
    'assist', 'integra', 'opentrons', 'generic_96_well_plate',
    'generic_12_well_reservoir', 'generic_24x1_5ml_tube_rack',
  ]) {
    if (evidence.includes(token)) needles.add(token);
  }
  return Array.from(needles);
}

function labwareRecordSummary(path: string, doc: Record<string, unknown>): string {
  const aliases = [
    doc['recordId'],
    doc['id'],
    doc['display_name'],
    ...(Array.isArray(doc['legacy_labware_types']) ? doc['legacy_labware_types'] : []),
    ...(Array.isArray(doc['tags']) ? doc['tags'] : []),
    ...(Array.isArray(doc['platform_aliases'])
      ? doc['platform_aliases']
        .map((entry) => asRecord(entry)['alias'])
        .filter((entry): entry is string => typeof entry === 'string')
      : []),
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  return [
    `path: ${path}`,
    `recordId: ${typeof doc['recordId'] === 'string' ? doc['recordId'] : '(missing)'}`,
    `id: ${typeof doc['id'] === 'string' ? doc['id'] : '(missing)'}`,
    `display_name: ${typeof doc['display_name'] === 'string' ? doc['display_name'] : '(missing)'}`,
    `aliases: ${Array.from(new Set(aliases)).join(', ') || '(none)'}`,
  ].join('\n');
}

async function collectExistingLabwareContext(repoRoot: string, specs: PatchSpec[], fixClass: string): Promise<string> {
  if (!labwareContextApplies(fixClass)) return '(not a labware/material/schema fix class)';
  const dir = join(repoRoot, 'records/seed/labware-definition');
  if (!existsSync(dir)) return '(canonical labware-definition directory not found)';

  const files = (await readdir(dir))
    .filter((file) => /\.ya?ml$/i.test(file))
    .sort()
    .map((file) => join(dir, file));
  const needles = labwareSearchNeedles(specs);
  const summaries: Array<{ score: number; text: string }> = [];

  for (const file of files) {
    const rel = relative(repoRoot, file);
    let docs: Array<Record<string, unknown>> = [];
    try {
      docs = parseYamlDocuments(await readFile(file, 'utf-8'));
    } catch {
      continue;
    }
    for (const doc of docs) {
      if (doc['kind'] !== 'labware-definition') continue;
      const text = labwareRecordSummary(rel, doc);
      const haystack = `${rel}\n${text}`.toLowerCase();
      const score = needles.reduce((sum, needle) => sum + (haystack.includes(needle) ? 1 : 0), 0);
      summaries.push({ score, text });
    }
  }

  const selected = summaries
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))
    .slice(0, 18)
    .map((entry) => entry.text);

  return [
    'Existing canonical labware definitions:',
    'If one of these already satisfies the requested plate/tube/rack/reservoir capability, do not recreate it.',
    'Patch the compiler resolver, alias map, execution-scale mapping, or a focused regression that proves the existing record is used.',
    '',
    selected.join('\n\n') || '(no labware definition summaries found)',
  ].join('\n').slice(0, MAX_LABWARE_CONTEXT_CHARS);
}

function genericRecordSummary(path: string, doc: Record<string, unknown>): string {
  const parts = [
    `path: ${path}`,
    `kind: ${typeof doc['kind'] === 'string' ? doc['kind'] : '(missing)'}`,
    `recordId: ${typeof doc['recordId'] === 'string' ? doc['recordId'] : typeof doc['id'] === 'string' ? doc['id'] : '(missing)'}`,
    `name: ${typeof doc['name'] === 'string' ? doc['name'] : typeof doc['display_name'] === 'string' ? doc['display_name'] : typeof doc['title'] === 'string' ? doc['title'] : '(missing)'}`,
  ];
  const aliases = [
    ...(Array.isArray(doc['aliases']) ? doc['aliases'] : []),
    ...(Array.isArray(doc['tags']) ? doc['tags'] : []),
    ...(Array.isArray(doc['legacy_labware_types']) ? doc['legacy_labware_types'] : []),
  ].filter((entry): entry is string => typeof entry === 'string');
  if (aliases.length > 0) parts.push(`aliases/tags: ${Array.from(new Set(aliases)).join(', ')}`);
  return parts.join('\n');
}

async function collectRecordDirectoryContext(repoRoot: string, directories: string[], specs: PatchSpec[], title: string): Promise<string> {
  const evidence = specs.map((spec) => stringifySmall(spec.raw)).join('\n').toLowerCase();
  const files: string[] = [];
  for (const directory of directories) {
    const fullDir = join(repoRoot, directory);
    if (!existsSync(fullDir)) continue;
    files.push(...await walkFiles(repoRoot, fullDir, 40));
  }
  const summaries: Array<{ score: number; text: string }> = [];
  for (const file of Array.from(new Set(files))) {
    if (!/\.ya?ml$/i.test(file)) continue;
    const rel = relative(repoRoot, file);
    let docs: Array<Record<string, unknown>> = [];
    try {
      docs = parseYamlDocuments(await readFile(file, 'utf-8'));
    } catch {
      continue;
    }
    for (const doc of docs) {
      const text = genericRecordSummary(rel, doc);
      const haystack = `${rel}\n${text}`.toLowerCase();
      const score = evidence.split(/[^a-z0-9_.-]+/).filter((token) => token.length > 2 && haystack.includes(token)).length;
      summaries.push({ score, text });
    }
  }
  const selected = summaries
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))
    .slice(0, 16)
    .map((entry) => entry.text);
  return [`${title}:`, selected.join('\n\n') || '(no matching existing records found)'].join('\n');
}

async function collectExistingRecordContext(repoRoot: string, specs: PatchSpec[], fixClass: string): Promise<string> {
  const sections: string[] = [];
  if (labwareContextApplies(fixClass)) {
    sections.push(await collectExistingLabwareContext(repoRoot, specs, fixClass));
  }
  if (fixClass === 'material_catalog_or_spec_gap' || fixClass === 'foundry_runtime_wiring_gap') {
    sections.push(await collectRecordDirectoryContext(repoRoot, [
      'records/material',
      'records/seed/materials',
      'schema/registry/curated-vendors',
      'schema/registry/compound-classes',
      'schema/registry/ontology-terms',
    ], specs, 'Existing material/vendor/ontology-adjacent records'));
  }
  if (fixClass === 'execution_scaling' || fixClass === 'foundry_runtime_wiring_gap') {
    sections.push(await collectRecordDirectoryContext(repoRoot, [
      'schema/registry/execution-scale-profiles',
      'schema/registry/pipette-capabilities',
      'records/seed/platforms',
    ], specs, 'Existing execution/tool/platform records'));
  }
  if (sections.length === 0) return '(no existing record context for this fix class)';
  return sections.join('\n\n---\n\n').slice(0, MAX_LABWARE_CONTEXT_CHARS);
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

function parseStructuredEdits(value: unknown): StructuredEdit[] {
  if (!Array.isArray(value)) return [];
  const edits: StructuredEdit[] = [];
  for (const item of value) {
    const edit = asRecord(item);
    const path = edit['path'];
    const search = edit['search'];
    const replace = edit['replace'];
    const occurrence = edit['occurrence'];
    const anchorId = edit['anchorId'];
    if (typeof path !== 'string' || typeof search !== 'string' || typeof replace !== 'string') continue;
    if (!path || !search) continue;
    edits.push({
      path,
      search,
      replace,
      ...(typeof occurrence === 'number' && Number.isInteger(occurrence) && occurrence > 0 ? { occurrence } : {}),
      ...(typeof anchorId === 'string' && anchorId.trim() ? { anchorId: anchorId.trim() } : {}),
    });
  }
  return edits;
}

function structuredEditLabel(edit: StructuredEdit | IndexedStructuredEdit): string {
  const indexed = 'editIndex' in edit ? `edit #${edit.editIndex} ` : '';
  const anchor = edit.anchorId ? ` anchor:${edit.anchorId}` : '';
  return `${indexed}${edit.path}${anchor}`;
}

function applyOneStructuredEdit(content: string, edit: StructuredEdit | IndexedStructuredEdit): string {
  const label = structuredEditLabel(edit);
  if (edit.search === edit.replace) throw new Error(`${label}: search and replace are identical`);
  const matches: number[] = [];
  let index = content.indexOf(edit.search);
  while (index !== -1) {
    matches.push(index);
    index = content.indexOf(edit.search, index + edit.search.length);
  }
  if (matches.length === 0) {
    const preview = edit.search.length > 800 ? `${edit.search.slice(0, 800)}...` : edit.search;
    throw new Error(`${label}: search block not found. Repair by copying a smaller 3-10 line search block exactly from the current Exact source anchors. Missing search preview:\n${preview}`);
  }
  const occurrence = edit.occurrence ?? 1;
  if (!edit.occurrence && matches.length > 1) {
    throw new Error(`${label}: search block matched ${matches.length} times; include occurrence to disambiguate`);
  }
  const selectedIndex = matches[occurrence - 1];
  if (selectedIndex === undefined) throw new Error(`${label}: occurrence ${occurrence} not found`);
  return `${content.slice(0, selectedIndex)}${edit.replace}${content.slice(selectedIndex + edit.search.length)}`;
}

async function diffForFile(repoRoot: string, tournamentDir: string, path: string, before: string, after: string): Promise<string> {
  const tempDir = join(tournamentDir, 'structured-edits-tmp', sanitizeSegment(path));
  await mkdir(tempDir, { recursive: true });
  const beforePath = join(tempDir, 'before');
  const afterPath = join(tempDir, 'after');
  await writeFile(beforePath, before, 'utf-8');
  await writeFile(afterPath, after, 'utf-8');
  try {
    const result = await execFileAsync('diff', ['-u', '--label', `a/${path}`, '--label', `b/${path}`, beforePath, afterPath], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 12,
    });
    return `diff --git a/${path} b/${path}\n${result.stdout}`;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    if (err.code === 1 && err.stdout) return `diff --git a/${path} b/${path}\n${err.stdout}`;
    throw new Error(err.stderr || err.message || String(error));
  }
}

export async function structuredEditsToUnifiedDiff(input: {
  repoRoot: string;
  tournamentDir: string;
  edits: StructuredEdit[];
}): Promise<string> {
  if (input.edits.length === 0) throw new Error('structured edits were empty');
  const byPath = new Map<string, IndexedStructuredEdit[]>();
  for (const [index, edit] of input.edits.entries()) {
    if (edit.path.startsWith('/') || edit.path.includes('..')) throw new Error(`${edit.path}: invalid edit path`);
    const indexedEdit: IndexedStructuredEdit = { ...edit, editIndex: index + 1 };
    byPath.set(edit.path, [...(byPath.get(edit.path) ?? []), indexedEdit]);
  }

  const chunks: string[] = [];
  for (const [path, edits] of [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const filePath = join(input.repoRoot, path);
    if (!existsSync(filePath)) throw new Error(`${path}: structured edits only support existing files`);
    const before = await readFile(filePath, 'utf-8');
    let after = before;
    for (const edit of edits) after = applyOneStructuredEdit(after, edit);
    if (after === before) throw new Error(`${path}: structured edits produced no change`);
    chunks.push(await diffForFile(input.repoRoot, input.tournamentDir, path, before, after));
  }
  return chunks.join('\n').trimEnd() + '\n';
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

export function existingFileAdditionViolations(repoRoot: string, diff: string): string[] {
  const violations: string[] = [];
  let currentOldPath: string | undefined;
  let currentNewPath: string | undefined;

  function recordViolation(path: string): void {
    const normalized = path.replace(/^a\//, '').replace(/^b\//, '');
    if (normalized === '/dev/null' || normalized.startsWith('/')) return;
    if (!existsSync(join(repoRoot, normalized))) return;
    violations.push(`${normalized}: patch is written as a new-file/add-from-empty change, but the file already exists. Update the existing record or patch an alias/resolver mapping instead.`);
  }

  for (const line of diff.split('\n')) {
    const gitMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (gitMatch) {
      currentOldPath = gitMatch[1]!;
      currentNewPath = gitMatch[2]!;
      continue;
    }
    const oldMatch = line.match(/^--- (a\/.+|\/dev\/null)$/);
    if (oldMatch) {
      currentOldPath = oldMatch[1]!.replace(/^a\//, '');
      continue;
    }
    const newMatch = line.match(/^\+\+\+ (b\/.+|\/dev\/null)$/);
    if (newMatch) {
      currentNewPath = newMatch[1]!.replace(/^b\//, '');
      continue;
    }
    if (/^new file mode\b/.test(line) && currentNewPath) {
      recordViolation(currentNewPath);
      continue;
    }
    if (/^@@ -0,0 \+\d+(?:,\d+)? @@/.test(line)) {
      if (currentOldPath && currentOldPath !== '/dev/null') recordViolation(currentOldPath);
      else if (currentNewPath) recordViolation(currentNewPath);
    }
  }

  return Array.from(new Set(violations));
}

function pathIsRepositorySafe(path: string): boolean {
  if (path.startsWith('/') || path.includes('\0')) return false;
  const parts = path.split('/').filter(Boolean);
  if (parts.includes('..')) return false;
  return !parts.some((part) =>
    part === '.git'
    || part === 'node_modules'
    || part === 'dist'
    || part === 'coverage'
    || part === '.next'
    || part === '.turbo'
  );
}

function isPackageManagerArtifact(path: string): boolean {
  return /(^|\/)(pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb)$/.test(path);
}

function isMeaningfulPatchFile(path: string): boolean {
  if (isPackageManagerArtifact(path)) return false;
  return path.startsWith('server/src/')
    || path.startsWith('client/src/')
    || path.startsWith('schema/')
    || path.startsWith('records/')
    || path.startsWith('scripts/');
}

export function meaningfulPatchFiles(touchedFiles: string[]): string[] {
  return touchedFiles.filter(isMeaningfulPatchFile).sort();
}

function dataFormatViolations(touchedFiles: string[]): string[] {
  return touchedFiles.filter((file) => file.startsWith('records/') && !/\.(ya?ml)$/i.test(file));
}

function recordPathPolicyViolations(touchedFiles: string[]): string[] {
  return touchedFiles.filter((file) => file.startsWith('records/seed/labware-definitions/'));
}

function parseYamlDocuments(content: string): Array<Record<string, unknown>> {
  return YAML.parseAllDocuments(content)
    .map((document) => document.toJSON())
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value));
}

function recordText(value: Record<string, unknown>): string {
  const parts = [
    value['id'],
    value['recordId'],
    value['name'],
    value['display_name'],
    value['definition'],
    ...(Array.isArray(value['tags']) ? value['tags'] : []),
  ];
  return parts.filter((item): item is string => typeof item === 'string').join(' ').toLowerCase();
}

function isLabwareLikeMaterial(value: Record<string, unknown>): boolean {
  const text = recordText(value);
  return /\b(labware|tube|tubes|microfuge|plate|microtiter|well[- ]?plate|rack|reservoir|tiprack|tip rack|pipette tip|holder|container)\b/.test(text);
}

export async function recordSchemaPolicyViolations(repoRoot: string, touchedFiles: string[]): Promise<string[]> {
  const violations: string[] = [];
  for (const file of touchedFiles) {
    if (!file.startsWith('records/') || !/\.(ya?ml)$/i.test(file)) continue;
    if (file.startsWith('records/seed/labware-definitions/')) {
      violations.push(`${file}: use canonical records/seed/labware-definition/*.yaml for labware definitions`);
      continue;
    }
    const fullPath = join(repoRoot, file);
    if (!existsSync(fullPath)) continue;
    let docs: Array<Record<string, unknown>>;
    try {
      docs = parseYamlDocuments(await readFile(fullPath, 'utf-8'));
    } catch (error) {
      violations.push(`${file}: YAML parse failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (file.startsWith('records/seed/labware-definition/')) {
      if (docs.length !== 1) violations.push(`${file}: labware-definition files must contain exactly one YAML document`);
      for (const doc of docs) {
        if (doc['$schema'] !== 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml') {
          violations.push(`${file}: labware-definition record must declare the labware-definition $schema`);
        }
        if (doc['kind'] !== 'labware-definition') violations.push(`${file}: labware-definition record must use kind: labware-definition`);
        if (doc['type'] !== 'labware_definition') violations.push(`${file}: labware-definition record must use type: labware_definition`);
        for (const key of ['recordId', 'id', 'display_name']) {
          if (typeof doc[key] !== 'string' || !doc[key]) violations.push(`${file}: labware-definition record missing ${key}`);
        }
      }
    }

    if (file.startsWith('records/seed/materials/') || file.startsWith('records/material/')) {
      for (const doc of docs) {
        if (doc['kind'] !== 'material') continue;
        if (doc['$schema'] !== 'https://computable-lab.com/schema/computable-lab/material.schema.yaml') {
          violations.push(`${file}: material record must declare the material $schema`);
        }
        for (const key of ['id', 'recordId', 'name', 'domain']) {
          if (typeof doc[key] !== 'string' || !doc[key]) violations.push(`${file}: material record missing ${key}`);
        }
        if (isLabwareLikeMaterial(doc)) {
          violations.push(`${file}: material record '${String(doc['recordId'] ?? doc['id'] ?? 'unknown')}' looks like labware/container data; use labware-definition YAML instead`);
        }
      }
    }
  }
  return violations;
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

async function staleOwnedFileContext(repoRoot: string, specs: PatchSpec[]): Promise<{
  stale: boolean;
  newestSpecMtime: number;
  changedFiles: string[];
}> {
  const ownedFiles = Array.from(new Set(specs.flatMap((spec) => spec.ownedFiles))).filter(Boolean);
  if (ownedFiles.length === 0) return { stale: false, newestSpecMtime: 0, changedFiles: [] };
  const specStats = await Promise.all(specs.map((spec) => stat(spec.path)));
  const newestSpecMtime = Math.max(...specStats.map((item) => item.mtimeMs));
  const tracked = (await runGit(repoRoot, ['ls-files', '--', ...ownedFiles])).stdout
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
  const changedFiles: string[] = [];
  for (const file of tracked) {
    const stats = await stat(join(repoRoot, file)).catch(() => undefined);
    if (stats && stats.mtimeMs > newestSpecMtime + 1000) changedFiles.push(file);
  }
  return {
    stale: changedFiles.length > 0,
    newestSpecMtime,
    changedFiles: changedFiles.sort().slice(0, 30),
  };
}

function gitApplyArgs(diffPath: string, mode: 'check' | 'apply' | 'reverse', options: { recount?: boolean } = {}): string[] {
  const recount = options.recount ? ['--recount'] : [];
  if (mode === 'check') return ['apply', '--check', ...recount, diffPath];
  if (mode === 'reverse') return ['apply', '-R', ...recount, diffPath];
  return ['apply', ...recount, diffPath];
}

async function assertTouchedFilesClean(repoRoot: string, touchedFiles: string[]): Promise<void> {
  if (touchedFiles.length === 0) return;
  const result = await runGit(repoRoot, ['status', '--porcelain', '--', ...touchedFiles]);
  if (result.stdout.trim()) {
    throw new Error(`refusing to patch files with pre-existing changes:\n${result.stdout.trim()}`);
  }
}

export function defaultVerificationArgs(touchedFiles: string[]): string[][] {
  // Step 1: Fast TypeScript syntax/type check — catches corrupted patches in <1s
  const syntaxCheck = [
    'npx',
    'tsc',
    '--noEmit',
    '--pretty',
    'false',
  ];

  const tests = new Set<string>();
  for (const file of touchedFiles) {
    if (file.startsWith('server/src/') && /\.test\.(ts|tsx)$/.test(file)) {
      tests.add(file.replace(/^server\//, ''));
    }
  }
  if (touchedFiles.some((file) => file.startsWith('server/src/compiler/pipeline/passes/'))) {
    tests.add('src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts');
    tests.add('src/compiler/pipeline/passes/AiPrecompileShapeMismatch.log.test.ts');
  }
  if (touchedFiles.some((file) => file.startsWith('server/src/compiler/biology/'))) {
    tests.add('src/compiler/biology/BiologyVerbExpander.test.ts');
  }
  if (touchedFiles.some((file) => file.startsWith('server/src/extract/'))) {
    tests.add('src/extract/OpenAICompatibleExtractor.test.ts');
    tests.add('src/extract/runChunkedExtractionService.test.ts');
  }
  if (touchedFiles.some((file) => file.startsWith('server/src/ai/'))) {
    tests.add('src/ai/InferenceClient.config.test.ts');
  }
  if (touchedFiles.some((file) => file.startsWith('server/src/foundry/'))) {
    tests.add('src/foundry/FoundryLedger.test.ts');
    tests.add('src/foundry/FoundryCoderPatch.test.ts');
    tests.add('src/foundry/FoundryCodebaseTools.test.ts');
    tests.add('src/foundry/FoundryWorktreeTools.test.ts');
  }
  if (tests.size === 0) tests.add('src/foundry/FoundryLedger.test.ts');
  return [
    syntaxCheck,
    ['npm', 'test', '--', '--run', ...Array.from(tests)],
  ];
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

function fixClassPriorityRank(fixClass: string): number {
  const priority = [
    'foundry_runtime_wiring_gap',
    'precompiler_reference_shape_gap',
    'extractor_prompt_contract',
    'event_graph_coverage',
    'event_graph_empty',
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

function diagnosticsFromCompilerArtifact(compiler: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(compiler['diagnostics'])
    ? compiler['diagnostics'].map(asRecord)
    : [];
}

function diagnosticSearchText(diagnostic: Record<string, unknown>): string {
  return [
    diagnostic['code'],
    diagnostic['pass_id'],
    diagnostic['message'],
    diagnostic['details'] ? YAML.stringify(diagnostic['details']) : undefined,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

function diagnosticShowsRuntimeWiringFailure(diagnostic: Record<string, unknown>): boolean {
  const code = typeof diagnostic['code'] === 'string' ? diagnostic['code'] : '';
  const passId = typeof diagnostic['pass_id'] === 'string' ? diagnostic['pass_id'] : '';
  const text = diagnosticSearchText(diagnostic);
  return (
    (code === 'PASS_EXCEPTION' && passId === 'deterministic_precompile')
    || text.includes('stubbed lookup')
    || text.includes('always-empty lookup')
    || text.includes('empty lookup')
    || (text.includes('cannot read properties of undefined') && text.includes('name'))
    || text.includes('no matching labware in prior snapshot')
  );
}

export function patchSpecSupersededByCompilerArtifact(
  spec: { fixClass: string },
  compiler: Record<string, unknown>,
): string | undefined {
  if (spec.fixClass !== 'foundry_runtime_wiring_gap') return undefined;
  const diagnostics = diagnosticsFromCompilerArtifact(compiler);
  if (diagnostics.length === 0) return undefined;
  if (diagnostics.some(diagnosticShowsRuntimeWiringFailure)) return undefined;
  return 'current compiler diagnostics no longer show Foundry runtime-wiring failure evidence';
}

function pathIsInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
}

function compilerArtifactPathForSpec(artifactRoot: string, spec: PatchSpec): string | undefined {
  const sourceArtifacts = asRecord(spec.raw['sourceArtifacts']);
  const compilerPath = sourceArtifacts['compiler'];
  if (typeof compilerPath !== 'string' || !compilerPath.trim()) return undefined;
  const artifactRootResolved = resolve(artifactRoot);
  const fullPath = resolve(artifactRootResolved, compilerPath);
  return pathIsInside(artifactRootResolved, fullPath) ? fullPath : undefined;
}

async function supersededReasonForSpec(artifactRoot: string, spec: PatchSpec): Promise<string | undefined> {
  const compilerPath = compilerArtifactPathForSpec(artifactRoot, spec);
  if (!compilerPath || !existsSync(compilerPath)) return undefined;
  const compiler = asRecord(await readYamlFile(compilerPath));
  return patchSpecSupersededByCompilerArtifact(spec, compiler);
}

async function partitionSupersededSpecs(artifactRoot: string, specs: PatchSpec[]): Promise<{
  activeSpecs: PatchSpec[];
  supersededSpecs: Array<{ spec: PatchSpec; reason: string }>;
}> {
  const activeSpecs: PatchSpec[] = [];
  const supersededSpecs: Array<{ spec: PatchSpec; reason: string }> = [];
  for (const spec of specs) {
    const reason = await supersededReasonForSpec(artifactRoot, spec);
    if (reason) {
      supersededSpecs.push({ spec, reason });
    } else {
      activeSpecs.push(spec);
    }
  }
  return { activeSpecs, supersededSpecs };
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

async function createAttemptWorktree(repoRoot: string, tournamentDir: string, attempt: number): Promise<string> {
  const worktreeRoot = join(tournamentDir, 'worktrees', `attempt-${attempt}`);
  await runGit(repoRoot, ['worktree', 'remove', '--force', worktreeRoot]).catch(() => ({ stdout: '', stderr: '' }));
  await rm(worktreeRoot, { recursive: true, force: true });
  await mkdir(dirname(worktreeRoot), { recursive: true });
  await runGit(repoRoot, ['worktree', 'add', '--detach', worktreeRoot, 'HEAD']);
  return worktreeRoot;
}

async function removeAttemptWorktree(repoRoot: string, worktreeRoot: string): Promise<void> {
  await runGit(repoRoot, ['worktree', 'remove', '--force', worktreeRoot]).catch(() => ({ stdout: '', stderr: '' }));
  await rm(worktreeRoot, { recursive: true, force: true });
}

async function requestCoderPatch(input: {
  attempt: number;
  strategy: string;
  client: ReturnType<typeof createInferenceClient>;
  model: string;
  repoRoot: string;
  artifactRoot: string;
  tournamentDir: string;
  workbenchRoot?: string;
  protocolId: string;
  variant: FoundryVariant;
  appBase?: string;
  apiBase?: string;
  fixClass: string;
  specs: PatchSpec[];
  ownedFiles: string[];
  context: string;
  priorDiff?: string;
  priorResponse?: string;
  priorFailure?: string;
  priorVerification?: Array<{
    command: string;
    status: 'pass' | 'fail';
    stderr?: string;
  }>;
  corruptedFileRegion?: {
    file: string;
    lines: string;
  }[];
  forceFullFileRewrite?: boolean;
}): Promise<CoderResponse> {
  const worktreeRoot = await createAttemptWorktree(input.repoRoot, input.tournamentDir, input.attempt);
  try {
    const response = await completeWithWorktreeTools({
      client: input.client,
      worktreeRoot,
      repoRoot: input.repoRoot,
      ...(input.workbenchRoot ? { workbenchRoot: input.workbenchRoot } : {}),
      maxToolRounds: Number(process.env['PROTOCOL_FOUNDRY_CODER_TOOL_ROUNDS'] ?? 18),
      request: {
        model: input.model,
        temperature: 0.15,
        max_tokens: 8192,
        messages: [
          {
            role: 'system',
            content: [
              'You are the Protocol Foundry coder. You are not a JSON patch generator. You are a real coding agent in a scratch git worktree.',
              'Use your tools to inspect the repository, edit files directly, run focused tests or type checks when useful, then call worktree_diff.',
              'The architect spec is guidance, not a cage. If the spec points at the wrong file or is too narrow, search the codebase and fix the real compiler/precompiler/foundry problem.',
              'You may modify source, tests, schemas, YAML records, Foundry runtime wiring, compiler passes, precompiler passes, extractor contracts, browser-review wiring, and focused fixtures when the failure evidence justifies it.',
              'You can run the browser review through worktree_run using the supplied browserReviewCommand when playback or rendering evidence matters.',
              'Do not patch generated run artifacts as the fix. Use artifacts as evidence and fix the code/data that produced them.',
              'Keep the change coherent and reviewable. Prefer one real root-cause fix over broad churn, but do not stop just because the needed file is outside ownedFiles.',
              'Project invariants still matter: records data is YAML; vendor PDFs may justify materials, material specs, vendor products, and labware definitions; vendor PDFs must not invent physical material-instances, aliquots, lots, source tubes, or inventory unless run context proves they exist.',
              'Never model plates, tubes, racks, reservoirs, tips, or other containers as material records. Those are labware definitions or resolver/compiler behavior.',
              'If you add or edit YAML records, inspect nearby records and schemas first. Reuse existing records when they already cover the capability.',
              'If you change compiler/precompiler behavior, add or update a focused regression when practical.',
              'Before final answer, call worktree_diff. Return final JSON only with keys like summary, testsRun, remainingConcerns.',
              ...(input.forceFullFileRewrite
                ? ['CRITICAL: You MUST use worktree_write_file to write complete file content. Do NOT use worktree_replace_lines. Read the file with worktree_read first, then write the complete corrected version back with worktree_write_file.']
                : []),
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              protocolId: input.protocolId,
              variant: input.variant,
              fixClass: input.fixClass,
              strategy: input.strategy,
              patchSpecs: input.specs.map(compactPatchSpecForPrompt),
              ownedFilesAreHintsNotLimits: input.ownedFiles,
              context: input.context,
              browserReviewCommand: {
                command: 'node',
                args: [
                  join(input.workbenchRoot ?? resolve(input.repoRoot, '..', 'agent-workbench'), 'scripts', 'protocol_foundry_browser_review.cjs'),
                  '--repo-root',
                  input.repoRoot,
                  '--proposal',
                  join(input.artifactRoot, 'event-graphs', input.protocolId, `${input.variant}.yaml`),
                  '--out',
                  join(input.artifactRoot, 'browser-review', input.protocolId, input.variant),
                  ...(input.apiBase ? ['--api-base', input.apiBase] : []),
                  ...(input.appBase ? ['--app-base', input.appBase] : []),
                ],
              },
              ...(input.priorDiff ? { priorDiff: input.priorDiff } : {}),
              ...(input.priorResponse ? { priorResponse: input.priorResponse } : {}),
              ...(input.priorFailure ? { priorFailure: input.priorFailure } : {}),
              ...(input.priorVerification ? { priorVerification: input.priorVerification } : {}),
              ...(input.corruptedFileRegion ? { corruptedFileRegion: input.corruptedFileRegion } : {}),
            }),
          },
        ],
      },
    });
    const content = response.choices[0]?.message.content ?? '';
    const parsed = extractJsonObject(content);
    const diff = await readWorktreeDiff(worktreeRoot);
    return {
      attempt: input.attempt,
      strategy: input.strategy,
      content,
      ...(parsed ? { parsed } : {}),
      ...(diff.trim() ? { diff, diffSource: 'worktreeTools' as const } : {}),
      ...(typeof parsed?.['summary'] === 'string' ? { summary: parsed['summary'] } : {}),
    };
  } finally {
    await removeAttemptWorktree(input.repoRoot, worktreeRoot);
  }
}

async function evaluateCandidate(input: {
  response: CoderResponse;
  repoRoot: string;
  tournamentDir: string;
  fixClass: string;
  title: string;
  autoCommit?: boolean;
  autoPush?: boolean;
}): Promise<AttemptResult> {
  const rawResponse = input.response.content.slice(0, 4000);
  let responseDiff = input.response.diff;
  let diffSource = input.response.diffSource;
  if (!responseDiff && input.response.parsed) {
    const structuredEdits = parseStructuredEdits(input.response.parsed['edits']);
    if (structuredEdits.length > 0) {
      try {
        responseDiff = await structuredEditsToUnifiedDiff({
          repoRoot: input.repoRoot,
          tournamentDir: input.tournamentDir,
          edits: structuredEdits,
        });
        diffSource = 'structuredEdits';
      } catch (error) {
        const result: AttemptResult = {
          attempt: input.response.attempt,
          strategy: input.response.strategy,
          status: 'blocked',
          phase: 'structured-edit',
          message: error instanceof Error ? error.message : String(error),
          touchedFiles: structuredEdits.map((edit) => edit.path).sort(),
          rawResponse,
          ...(input.response.summary ? { summary: input.response.summary } : {}),
        };
        await writeAttempt(input.tournamentDir, result);
        return result;
      }
    }
  }

  if (!responseDiff || (!responseDiff.includes('diff --git ') && !responseDiff.includes('--- a/'))) {
    const result: AttemptResult = {
      attempt: input.response.attempt,
      strategy: input.response.strategy,
      status: 'blocked',
      phase: 'parse',
      message: 'Coder response did not contain structured edits or a git unified diff.',
      touchedFiles: [],
      rawResponse,
      ...(input.response.summary ? { summary: input.response.summary } : {}),
    };
    await writeAttempt(input.tournamentDir, result);
    return result;
  }

  const diffPath = join(input.tournamentDir, `attempt-${input.response.attempt}.diff`);
  await mkdir(dirname(diffPath), { recursive: true });
  await writeFile(diffPath, responseDiff, 'utf-8');

  const touchedFiles = parseTouchedFiles(responseDiff);
  const unsafePaths = touchedFiles.filter((file) => !pathIsRepositorySafe(file));
  const meaningfulFiles = meaningfulPatchFiles(touchedFiles);
  const directories = await findDirectoryTouchedFiles(input.repoRoot, touchedFiles);
  const dataFormatErrors = dataFormatViolations(touchedFiles);
  const recordPathErrors = recordPathPolicyViolations(touchedFiles);
  const existingFileAdditionErrors = existingFileAdditionViolations(input.repoRoot, responseDiff);
  if (
    touchedFiles.length === 0
    || unsafePaths.length > 0
    || meaningfulFiles.length === 0
    || directories.length > 0
    || dataFormatErrors.length > 0
    || recordPathErrors.length > 0
    || existingFileAdditionErrors.length > 0
  ) {
    const result: AttemptResult = {
      attempt: input.response.attempt,
      strategy: input.response.strategy,
      status: 'blocked',
      phase: 'path-guard',
      message: directories.length > 0
        ? `Coder patch attempted to patch directory paths instead of files: ${directories.join(', ')}`
        : dataFormatErrors.length > 0
          ? `Coder patch attempted to write non-YAML records data: ${dataFormatErrors.join(', ')}`
          : recordPathErrors.length > 0
            ? `Coder patch used legacy/noncanonical record paths: ${recordPathErrors.join(', ')}. Use records/seed/labware-definition/*.yaml for labware definitions.`
            : existingFileAdditionErrors.length > 0
              ? existingFileAdditionErrors.join('\n')
              : unsafePaths.length > 0
                ? `Coder patch touched unsafe repository paths: ${unsafePaths.join(', ')}`
                : `Coder patch touched no meaningful compiler/precompiler/schema/record/test files. Touched files: ${touchedFiles.join(', ')}`,
      diffPath,
      ...(diffSource ? { diffSource } : {}),
      touchedFiles,
      rawResponse,
      ...(input.response.summary ? { summary: input.response.summary } : {}),
    };
    await writeAttempt(input.tournamentDir, result);
    return result;
  }

  let applied = false;
  const recountPatch = diffSource !== 'structuredEdits';
  try {
    await assertTouchedFilesClean(input.repoRoot, touchedFiles);
    await runGit(input.repoRoot, gitApplyArgs(diffPath, 'check', { recount: recountPatch }));
    await runGit(input.repoRoot, gitApplyArgs(diffPath, 'apply', { recount: recountPatch }));
    applied = true;
    const recordPolicyErrors = await recordSchemaPolicyViolations(input.repoRoot, touchedFiles);
    if (recordPolicyErrors.length > 0) {
      await runGit(input.repoRoot, gitApplyArgs(diffPath, 'reverse', { recount: recountPatch })).catch(() => ({ stdout: '', stderr: '' }));
      applied = false;
      const result: AttemptResult = {
        attempt: input.response.attempt,
        strategy: input.response.strategy,
        status: 'blocked',
        phase: 'record-schema-policy',
        message: recordPolicyErrors.join('\n'),
        diffPath,
        ...(diffSource ? { diffSource } : {}),
        touchedFiles,
        rawResponse,
        ...(input.response.summary ? { summary: input.response.summary } : {}),
      };
      await writeAttempt(input.tournamentDir, result);
      return result;
    }
    const verification = await runVerification(input.repoRoot, touchedFiles);
    const verificationPassed = verification.every((item) => item.status === 'pass');
    if (!verificationPassed) {
      // Capture corrupted file content BEFORE reversing the patch
      // so the repair round gets exact evidence of what went wrong
      const corruptedFiles = await Promise.all(
        touchedFiles.map(async (file) => {
          const fullPath = join(input.repoRoot, file);
          if (!existsSync(fullPath)) return { file, lines: '' };
          const content = await readFile(fullPath, 'utf-8').catch(() => '');
          // Return first 120 lines — enough to show corruption without bloating context
          return { file, lines: content.split('\n').slice(0, 120).join('\n') };
        }),
      );

      await runGit(input.repoRoot, gitApplyArgs(diffPath, 'reverse', { recount: recountPatch })).catch(() => ({ stdout: '', stderr: '' }));
      applied = false;
      const result: AttemptResult = {
        attempt: input.response.attempt,
        strategy: input.response.strategy,
        status: 'failed',
        phase: 'verification',
        message: 'Patch applied but verification failed; patch was reversed.',
        diffPath,
        ...(diffSource ? { diffSource } : {}),
        touchedFiles,
        verification,
        corruptedFileRegion: corruptedFiles,
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
      ...(diffSource ? { diffSource } : {}),
      touchedFiles,
      verification,
      ...commit,
      rawResponse,
      ...(input.response.summary ? { summary: input.response.summary } : {}),
    };
    await writeAttempt(input.tournamentDir, result);
    return result;
  } catch (error) {
    if (applied) await runGit(input.repoRoot, gitApplyArgs(diffPath, 'reverse', { recount: recountPatch })).catch(() => ({ stdout: '', stderr: '' }));
    const result: AttemptResult = {
      attempt: input.response.attempt,
      strategy: input.response.strategy,
      status: 'blocked',
      phase: 'git-apply-check',
      message: error instanceof Error ? error.message : String(error),
      diffPath,
      ...(diffSource ? { diffSource } : {}),
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
  workbenchRoot?: string;
  protocolId: string;
  variant: FoundryVariant;
  appBase?: string;
  apiBase?: string;
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

  const { activeSpecs, supersededSpecs } = await partitionSupersededSpecs(input.artifactRoot, pendingSpecs);
  const supersededSpecIds = supersededSpecs.map(({ spec }) => spec.id);
  const supersededFixClasses = Array.from(new Set(supersededSpecs.map(({ spec }) => spec.fixClass)));
  const supersededReasons = Object.fromEntries(supersededSpecs.map(({ spec, reason }) => [spec.id, reason]));

  if (activeSpecs.length === 0) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'skipped',
      fixClasses: allFixClasses,
      supersededSpecIds,
      supersededFixClasses,
      supersededReasons,
      message: 'All remaining patch specs were superseded by current compiler diagnostics.',
    });
    return { status: 'skipped', resultPath, message: 'remaining patch specs superseded', touchedFiles: [] };
  }

  const baseUrl = input.inference?.baseUrl ?? process.env['PI_WORKER_BASE_URL'] ?? process.env['OPENAI_BASE_URL'];
  const model = input.inference?.model ?? process.env['PI_WORKER_MODEL'] ?? process.env['OPENAI_MODEL'];
  const selectedSpec = selectPatchSpecForRun(activeSpecs);
  if (!selectedSpec) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'skipped',
      fixClasses: allFixClasses,
      supersededSpecIds,
      supersededFixClasses,
      supersededReasons,
      message: 'No selectable patch spec is pending.',
    });
    return { status: 'skipped', resultPath, message: 'no selectable patch spec', touchedFiles: [] };
  }

  const specs = [selectedSpec];
  const fixClass = selectedSpec.fixClass;
  const fixClasses = [fixClass];
  const deferredSpecIds = activeSpecs
    .filter((spec) => spec.id !== selectedSpec.id)
    .map((spec) => spec.id);
  const tournamentDir = join(resultRoot, sanitizeSegment(fixClass));
  const staleContext = await staleOwnedFileContext(input.repoRoot, specs);
  if (staleContext.stale) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'stale',
      fixClasses,
      sourceSpecIds: specs.map((spec) => spec.id),
      selectedSpecId: selectedSpec.id,
      deferredSpecIds,
      supersededSpecIds,
      supersededFixClasses,
      supersededReasons,
      staleChangedFiles: staleContext.changedFiles,
      newestSpecMtime: staleContext.newestSpecMtime,
      message: 'Patch specs are stale because tracked owned files changed after spec generation; rerun and refresh architect context before coding.',
    });
    return {
      status: 'stale',
      resultPath,
      message: 'stale patch specs; rerun and refresh architect context',
      touchedFiles: [],
    };
  }

  if (!baseUrl || !model || input.dryRun) {
    await writeYamlFile(resultPath, {
      kind: 'protocol-foundry-coder-patch-result',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'blocked',
      fixClasses,
      selectedSpecId: selectedSpec.id,
      deferredSpecIds,
      supersededSpecIds,
      supersededFixClasses,
      supersededReasons,
      message: 'Coder endpoint/model not configured or dry-run mode is enabled.',
    });
    return { status: 'blocked', resultPath, message: 'coder not configured', touchedFiles: [] };
  }

  const ownedFiles = Array.from(new Set(specs.flatMap((spec) => spec.ownedFiles)));
  const [ownedContext, anchorContext, artifactContext, schemaContext, recordContext] = await Promise.all([
    collectOwnedContext(input.repoRoot, specs),
    collectSourceAnchorContext(input.repoRoot, specs, fixClass),
    collectSpecArtifactContext(input.artifactRoot, specs),
    collectSchemaContext(input.repoRoot, fixClass),
    collectExistingRecordContext(input.repoRoot, specs, fixClass),
  ]);
  const context = [
    'Repository context:',
    ownedContext || '(no owned-file context found)',
    '',
    'Exact source anchors:',
    anchorContext || '(no exact source anchors found)',
    '',
    'Relevant schema context:',
    schemaContext || '(no schema context found)',
    '',
    'Existing lane record context:',
    recordContext || '(no existing record context found)',
    '',
    'Source artifact context:',
    artifactContext || '(no source artifact context found)',
  ].join('\n').slice(0, MAX_CONTEXT_CHARS + MAX_ANCHOR_CONTEXT_CHARS + MAX_SCHEMA_CONTEXT_CHARS + MAX_LABWARE_CONTEXT_CHARS + MAX_ARTIFACT_CONTEXT_CHARS);
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
  const strategyOptions: Array<{ strategy: string; forceFullFileRewrite?: boolean }> = [
    ...strategies.map((s) => ({ strategy: s })),
    {
      strategy: 'full-file-rewrite: read each affected file completely, apply the fix in the full context, and write back the complete corrected file using worktree_write_file',
      forceFullFileRewrite: true,
    },
  ];

  const responses = await Promise.all(strategyOptions.map(({ strategy, forceFullFileRewrite }, index) =>
    requestCoderPatch({
      attempt: index + 1,
      strategy,
      client,
      model,
      repoRoot: input.repoRoot,
      artifactRoot: input.artifactRoot,
      tournamentDir,
      ...(input.workbenchRoot ? { workbenchRoot: input.workbenchRoot } : {}),
      protocolId: input.protocolId,
      variant: input.variant,
      ...(input.appBase ? { appBase: input.appBase } : {}),
      ...(input.apiBase ? { apiBase: input.apiBase } : {}),
      fixClass,
      specs,
      ownedFiles,
      context,
      ...(forceFullFileRewrite ? { forceFullFileRewrite } : {}),
    }),
  ));

  const attempts: AttemptResult[] = [];
  for (const response of responses.sort((a, b) => (a.diff?.length ?? Number.POSITIVE_INFINITY) - (b.diff?.length ?? Number.POSITIVE_INFINITY))) {
    const attempt = await evaluateCandidate({
      response,
      repoRoot: input.repoRoot,
      tournamentDir,
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
        selectedSpecId: selectedSpec.id,
        deferredSpecIds,
        supersededSpecIds,
        supersededFixClasses,
        supersededReasons,
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
  if (best) {
    const priorDiff = best.diffPath ? await readFile(best.diffPath, 'utf-8').catch(() => undefined) : undefined;
    // Detect whether the failure was syntax-related (e.g. tsc --noEmit, esbuild transform)
    const isSyntaxFailure =
      best.phase === 'verification'
      && best.verification?.some((v) =>
        v.status === 'fail'
        && (v.command.includes('tsc') || v.stderr?.includes('Unexpected') || v.stderr?.includes('esbuild') || v.stderr?.includes('SyntaxError')),
      );
    const repairResponse = await requestCoderPatch({
      attempt: 4,
      strategy: isSyntaxFailure
        ? 'repair: the previous attempt had a syntax/type error. Use worktree_write_file to rewrite the affected function or file completely — do NOT use worktree_replace_lines. Read the full file first, fix the corrupted section, write back the complete version.'
        : 'repair: fix the best failed candidate using the exact failure message; keep the patch narrower than the original and copy search blocks exactly from repository context',
      client,
      model,
      repoRoot: input.repoRoot,
      artifactRoot: input.artifactRoot,
      tournamentDir,
      ...(input.workbenchRoot ? { workbenchRoot: input.workbenchRoot } : {}),
      protocolId: input.protocolId,
      variant: input.variant,
      ...(input.appBase ? { appBase: input.appBase } : {}),
      ...(input.apiBase ? { apiBase: input.apiBase } : {}),
      fixClass,
      specs,
      ownedFiles,
      context,
      ...(priorDiff ? { priorDiff } : {}),
      ...(best.rawResponse ? { priorResponse: best.rawResponse } : {}),
      priorFailure: `${best.phase}: ${best.message}`,
      ...(best.verification ? { priorVerification: best.verification } : {}),
      ...(best.corruptedFileRegion ? { corruptedFileRegion: best.corruptedFileRegion } : {}),
      ...(isSyntaxFailure ? { forceFullFileRewrite: true } : {}),
    });
    const repair = await evaluateCandidate({
      response: repairResponse,
      repoRoot: input.repoRoot,
      tournamentDir,
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
        selectedSpecId: selectedSpec.id,
        deferredSpecIds,
        supersededSpecIds,
        supersededFixClasses,
        supersededReasons,
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

  // Classify the failure mode for the escalation packet
  const failureMode = best?.phase === 'verification'
    ? best.verification?.some((v) =>
        v.status === 'fail'
        && (v.command.includes('tsc') || v.stderr?.includes('Unexpected') || v.stderr?.includes('esbuild')),
      )
      ? 'syntax-corruption'
      : 'test-failure'
    : best?.phase === 'git-apply-check'
      ? 'patch-apply-failed'
      : best?.phase === 'path-guard'
        ? 'path-policy-violation'
        : best?.phase === 'parse'
          ? 'parse-blocked'
          : best?.phase ?? 'unknown';

  await writeYamlFile(resultPath, {
    kind: 'protocol-foundry-coder-patch-result',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    status: 'needs-human',
    fixClasses,
    selectedSpecId: selectedSpec.id,
    deferredSpecIds,
    supersededSpecIds,
    supersededFixClasses,
    supersededReasons,
    tournamentDir,
    attempts,
    bestFailure: best ? `${best.phase}: ${best.message}` : 'no viable patch attempts',
    bestFailureMode: failureMode,
    message: 'Patch tournament could not produce a verified patch for this single fix class.',
  });

  // Write escalation packet so the supervisor can retry with a senior worker
  const escalationDir = join(input.artifactRoot, 'patch-escalations');
  const escalationPath = join(escalationDir, `${input.protocolId}-${input.variant}.yaml`);
  await mkdir(escalationDir, { recursive: true });
  await writeYamlFile(escalationPath, {
    kind: 'protocol-foundry-escalation',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    fixClass,
    fixClasses,
    failureMode,
    selectedSpecId: selectedSpec.id,
    bestFailure: best ? `${best.phase}: ${best.message}` : 'no viable patch attempts',
    bestAttemptStrategy: best?.strategy,
    attemptCount: attempts.length,
    recommendation: failureMode === 'syntax-corruption'
      ? 'retry with senior worker (27B+ model) using full-file-rewrite strategy'
      : 'retry with senior worker (27B+ model) with broader context',
    priorVerification: best?.verification,
    corruptedFileRegion: best?.corruptedFileRegion,
  });
  return {
    status: 'needs-human',
    resultPath,
    message: 'patch tournament needs human review',
    touchedFiles: [],
  };
}
