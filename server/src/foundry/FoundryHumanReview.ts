import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import YAML from 'yaml';
import {
  asRecord,
  nowIso,
  readYamlFile,
  slugify,
  writeYamlFile,
  type FoundryVariantLedger,
} from './FoundryArtifacts.js';
import { loadOrCreateFoundryLedger } from './FoundryLedger.js';
import { FOUNDRY_VARIANTS, runProtocolFoundryCompile, type FoundryVariant } from './ProtocolFoundryCompileRunner.js';
import { runFoundryCoderPatch, type FoundryCoderPatchResult } from './FoundryCoderPatch.js';
import type { ConversationHistoryMessage } from '../ai/types.js';

type FixClassification =
  | 'data-only'
  | 'registry'
  | 'schema'
  | 'prompt'
  | 'compiler'
  | 'visualization'
  | 'harness'
  | 'mixed'
  | 'unknown';

export interface FoundryReviewSummary {
  protocolId: string;
  variant: FoundryVariant;
  status: 'unreviewed' | 'reviewing' | 'queued' | 'rejected' | 'implemented' | 'failed' | 'blocked';
  title?: string;
  vendor?: string;
  eventCount?: number;
  architectVerdict?: string;
  patchSpecCount: number;
  fixClassification: FixClassification;
  updatedAt?: string;
  lastInnerLoopAt?: string;
  artifacts: Record<string, string | string[] | undefined>;
}

export interface FoundryReviewContext {
  kind: 'protocol-foundry-review-context';
  protocolId: string;
  variant: FoundryVariant;
  generatedAt: string;
  status: FoundryReviewSummary['status'];
  semanticContract: {
    dataFirst: string;
    ontologyAware: string;
    knowledgeLayer: string;
  };
  source: {
    title?: string;
    vendor?: string;
    pdf?: string;
    procurement?: unknown;
    extractedText?: string;
    extractedTextPath?: string;
    pageImages: string[];
  };
  artifacts: {
    segment?: unknown;
    materialContext?: unknown;
    compiler?: unknown;
    eventGraph?: unknown;
    executionScale?: unknown;
    browserReview?: unknown;
    architectVerdict?: unknown;
    patchSpecs: unknown[];
    adoptionDecision?: unknown;
    humanReview?: unknown;
  };
  artifactRefs: Record<string, string | string[] | undefined>;
  semantic: {
    eventSemanticKeys: string[];
    graphAnchors: string[];
    materialLayerDecisions: string[];
    ontologyRefs: string[];
    ontologyBackfillNeeds: string[];
    fixClassification: FixClassification;
  };
  knowledgeLayer: {
    contextRefs: unknown[];
    claimRefs: unknown[];
    assertionRefs: unknown[];
    evidenceRefs: unknown[];
  };
}

export interface FoundryReviewChatResponse {
  success: true;
  text: string;
  reviewContext: FoundryReviewContext;
}

export interface FoundryReviewEventGraphResponse {
  success: true;
  events: unknown[];
  labwares: unknown[];
  deckPlacements: unknown[];
}

export interface FoundryReviewedSpecResponse {
  success: true;
  status: 'queued' | 'blocked';
  queueItem?: unknown;
  queuePath?: string;
  markdownPath?: string;
  patchSpecPath?: string;
  adoptionPath?: string;
  reviewPath: string;
}

export interface FoundryRunnerQueuePolicy {
  kind: 'protocol-foundry-runner-queue-policy';
  durableReviewBundle: 'ralph-queue';
  executableQueue: 'patch-specs';
  adoptionGate: 'adoption';
  schedulerStage: 'coder_patch';
  decision: string;
  rationale: string[];
}

export interface FoundryReviewImplementationSyncResult {
  success: true;
  updated: boolean;
  status: FoundryReviewSummary['status'];
  reviewPath: string;
  queuePath?: string;
  implementation: Record<string, unknown>;
}

export const FOUNDRY_REJECTION_REASON_CLASSES = [
  'redundant',
  'out_of_scope',
  'evidence_insufficient',
  'bad_event_graph',
  'other',
] as const;

export type FoundryRejectionReasonClass = (typeof FOUNDRY_REJECTION_REASON_CLASSES)[number];

export function isFoundryRejectionReasonClass(value: unknown): value is FoundryRejectionReasonClass {
  return typeof value === 'string'
    && (FOUNDRY_REJECTION_REASON_CLASSES as readonly string[]).includes(value);
}

export interface FoundryRejectResponse {
  success: true;
  status: 'rejected';
  reviewPath: string;
  rejectedAt: string;
  reason: string;
  reasonClass: FoundryRejectionReasonClass;
}

export interface FoundryReopenResponse {
  success: true;
  status: 'reviewing';
  reviewPath: string;
  reopenedAt: string;
  reason: string;
}

export interface FoundryInnerLoopDiffEntry {
  key: string;
  eventId?: string;
  semanticKey?: string;
  eventType?: string;
  before?: unknown;
  after?: unknown;
}

export interface FoundryInnerLoopTrace {
  kind: 'protocol-foundry-review-inner-loop-trace';
  id: string;
  protocolId: string;
  variant: FoundryVariant;
  generatedAt: string;
  prompt: string;
  draftSpec: {
    id: string;
    draftPath: string;
    title: string;
    fixClass: string;
  };
  coder?: {
    status: string;
    message?: string;
    touchedFiles?: string[];
    resultPath?: string;
  };
  recompile?: {
    outcome: string;
    eventCount?: number;
    eventGraphPath?: string;
    beforeEventGraphPath?: string;
  };
  diff?: {
    added: FoundryInnerLoopDiffEntry[];
    removed: FoundryInnerLoopDiffEntry[];
    changed: FoundryInnerLoopDiffEntry[];
  };
  durationMs?: number;
  status: 'completed' | 'failed';
  criticInvoked?: boolean;
  promotedAt?: string;
  error?: string;
}

export interface FoundryInnerLoopResponse {
  success: true;
  trace: FoundryInnerLoopTrace;
  tracePath: string;
}

export interface FoundryDraftPromoteResponse {
  success: true;
  status: 'queued';
  queuePath: string;
  patchSpecPath: string;
  adoptionPath: string;
  reviewPath: string;
}

interface ChatConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

interface StructuredReviewedSpec {
  id: string;
  title: string;
  fixClass: string;
  rationale: string;
  ownedFiles: string[];
  acceptance: string[];
  dataFirstDisposition: string;
  semanticLayer: string;
  evidenceCitations: string[];
  graphAnchors: string[];
  ontologyBackfillNeeds: string[];
  tests: string[];
  expectedArtifactDelta: string[];
  rawModelSpec: Record<string, unknown>;
  rawText: string;
}

interface KnowledgeLayerBundle {
  contextRef: Record<string, unknown>;
  claimRef: Record<string, unknown>;
  assertionRef: Record<string, unknown>;
  evidenceRef: Record<string, unknown>;
  paths: Record<string, string>;
}

const DEFAULT_REVIEW_BASE_URL = 'http://thunderbeast:8000/v1';
const DEFAULT_REVIEW_MODEL = 'Qwen/Qwen3.6-27B-FP8';
const MAX_TEXT_CHARS = 48_000;
const MAX_YAML_CHARS = 64_000;

function normalizeVariant(value: string): FoundryVariant | undefined {
  return (FOUNDRY_VARIANTS as readonly string[]).includes(value) ? value as FoundryVariant : undefined;
}

function rel(root: string, path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith(root) ? relative(root, path) : path;
}

async function readTextBounded(path: string | undefined, maxChars = MAX_TEXT_CHARS): Promise<string | undefined> {
  if (!path || !existsSync(path)) return undefined;
  const text = await readFile(path, 'utf-8');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]` : text;
}

async function readYamlBounded(path: string | undefined): Promise<unknown | undefined> {
  const text = await readTextBounded(path, MAX_YAML_CHARS);
  if (!text) return undefined;
  try {
    return YAML.parse(text);
  } catch {
    return { kind: 'unparsed-yaml-artifact', path, text };
  }
}

async function listFilesIfExists(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(dir, entry.name))
    .sort();
}

function extractStrings(value: unknown, predicate: (key: string, val: unknown) => boolean): string[] {
  const out = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = asRecord(node);
    for (const [key, val] of Object.entries(record)) {
      if (predicate(key, val) && typeof val === 'string' && val.trim()) out.add(val.trim());
      visit(val);
    }
  };
  visit(value);
  return [...out].sort();
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function artifactRecord(entries: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  return Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined),
  );
}

function classifyFix(...values: unknown[]): FixClassification {
  const text = values.map((value) => YAML.stringify(value ?? '')).join('\n').toLowerCase();
  if (/\bdata[-_ ]only\b/.test(text)) return 'data-only';
  if (/\bregistry\b/.test(text)) return 'registry';
  if (/\bschema\b/.test(text)) return 'schema';
  if (/\bprompt\b/.test(text)) return 'prompt';
  if (/\bvisualization|browser[_ -]visualization|renderer|ui\b/.test(text)) return 'visualization';
  if (/\bharness|fixture|test\b/.test(text)) return 'harness';
  if (/\bcompiler|precompiler|pre-compiler|pass|typescript|code\b/.test(text)) return 'compiler';
  return 'unknown';
}

function reviewPath(artifactRoot: string, protocolId: string, variant: FoundryVariant): string {
  return join(artifactRoot, 'human-review', protocolId, variant, 'review.yaml');
}

function reviewedSpecDir(artifactRoot: string, protocolId: string, variant: FoundryVariant): string {
  return join(artifactRoot, 'ralph-queue', `foundry-${protocolId}-${variant}`);
}

function livePatchSpecDir(artifactRoot: string, protocolId: string, variant: FoundryVariant): string {
  return join(artifactRoot, 'patch-specs', protocolId, variant);
}

function adoptionPath(artifactRoot: string, protocolId: string, variant: FoundryVariant): string {
  return join(artifactRoot, 'adoption', protocolId, variant, 'adoption.yaml');
}

function knowledgeLayerDir(artifactRoot: string, protocolId: string, variant: FoundryVariant): string {
  return join(artifactRoot, 'knowledge-layer', protocolId, variant);
}

function innerLoopDir(artifactRoot: string, protocolId: string, variant: FoundryVariant): string {
  return join(artifactRoot, 'human-review', protocolId, variant, 'inner-loop');
}

function innerLoopDraftDir(artifactRoot: string, protocolId: string, variant: FoundryVariant): string {
  return join(innerLoopDir(artifactRoot, protocolId, variant), 'drafts');
}

function innerLoopTraceId(protocolId: string, variant: FoundryVariant): string {
  return `TRC-${slugify(protocolId)}-${variant}-${Date.now().toString(36)}`;
}

function innerLoopDraftId(protocolId: string, variant: FoundryVariant): string {
  return `foundry-draft-${slugify(protocolId)}-${variant}-${Date.now().toString(36)}`;
}

function queueSpecId(protocolId: string, variant: FoundryVariant): string {
  return `foundry-${slugify(protocolId)}-${variant}-${Date.now().toString(36)}`;
}

function stableReviewId(prefix: string, protocolId: string, variant: FoundryVariant): string {
  return `${prefix}-FDRY-${slugify(protocolId).toUpperCase()}-${variant.toUpperCase()}`;
}

function statusFromReview(review: Record<string, unknown>, item: FoundryVariantLedger): FoundryReviewSummary['status'] {
  if (item.artifacts.rerunReport && item.status === 'completed') return 'implemented';
  if (item.artifacts.patchFailure || (item.artifacts.rerunReport && item.status === 'gap')) return 'failed';
  if (item.artifacts.criticReport && item.status === 'completed') return 'implemented';
  const status = review['status'];
  if (status === 'implemented' || status === 'failed') return status;
  if (status === 'queued' || status === 'rejected' || status === 'reviewing' || status === 'blocked') return status;
  if (item.artifacts.criticReport || item.artifacts.rerunReport) return 'implemented';
  if (item.status === 'failed' || item.status === 'stalled') return 'failed';
  if (item.status === 'blocked') return 'blocked';
  return 'unreviewed';
}

function buildSemanticContract() {
  return {
    dataFirst: 'Everything durable that can be data should be data: prefer YAML/schema/registry/fixture records over hard-coded compiler logic when both can solve the problem.',
    ontologyAware: 'Preserve protocol semantics and use ontology/local refs when evidence supports them; otherwise record an ontology-backfill need instead of inventing identifiers.',
    knowledgeLayer: 'Review conclusions should map to context, claim, assertion, and evidence records with source citations and graph anchors.',
  };
}

function buildRunnerQueuePolicy(): FoundryRunnerQueuePolicy {
  return {
    kind: 'protocol-foundry-runner-queue-policy',
    durableReviewBundle: 'ralph-queue',
    executableQueue: 'patch-specs',
    adoptionGate: 'adoption',
    schedulerStage: 'coder_patch',
    decision: 'Keep ralph-queue as the durable human/AI review bundle. Use patch-specs plus an accepted adoption decision as the executable Foundry coder/critic queue.',
    rationale: [
      'ralph-queue preserves the reviewed spec, markdown, transcript-derived intent, and knowledge-layer provenance.',
      'patch-specs is already scanned by the Foundry ledger and exposes coder_patch tasks without another scheduler path.',
      'The adoption decision is the explicit gate that makes a reviewed spec runnable by the coder/critic loop.',
    ],
  };
}

function patchArtifactPaths(artifactRoot: string, protocolId: string, variant: FoundryVariant): {
  coderPatchPath: string;
  criticReportPath: string;
  flatCriticReportPath: string;
  rerunReportPath: string;
  patchFailurePath: string;
} {
  return {
    coderPatchPath: join(artifactRoot, 'code-patches', protocolId, variant, 'result.yaml'),
    criticReportPath: join(artifactRoot, 'patch-critic', protocolId, variant, 'report.yaml'),
    flatCriticReportPath: join(artifactRoot, 'patch-critic', `${protocolId}-${variant}.yaml`),
    rerunReportPath: join(artifactRoot, 'rerun', protocolId, variant, 'rerun.yaml'),
    patchFailurePath: join(artifactRoot, 'patch-failures', `${protocolId}-${variant}.yaml`),
  };
}

async function readArtifactRecord(path: string): Promise<Record<string, unknown>> {
  return asRecord(await readYamlFile(path));
}

function implementationStatus(input: {
  coderPatch: Record<string, unknown>;
  critic: Record<string, unknown>;
  rerun: Record<string, unknown>;
  patchFailureExists: boolean;
}): { reviewStatus: FoundryReviewSummary['status']; implementationStatus: string; terminal: boolean } {
  const coderStatus = firstString(input.coderPatch['status']);
  const criticVerdict = firstString(input.critic['verdict']);
  const rerunOutcome = firstString(input.rerun['outcome']);
  if (input.patchFailureExists || criticVerdict === 'block') {
    return { reviewStatus: 'failed', implementationStatus: 'failed', terminal: true };
  }
  if (rerunOutcome === 'complete') {
    return { reviewStatus: 'implemented', implementationStatus: 'implemented', terminal: true };
  }
  if (rerunOutcome && rerunOutcome !== 'complete') {
    return { reviewStatus: 'failed', implementationStatus: 'rerun_gap', terminal: true };
  }
  if (criticVerdict === 'pass') {
    return { reviewStatus: 'queued', implementationStatus: 'critic_passed', terminal: false };
  }
  if (criticVerdict === 'revision') {
    return { reviewStatus: 'queued', implementationStatus: 'revision_requested', terminal: false };
  }
  if (coderStatus === 'applied') {
    return { reviewStatus: 'queued', implementationStatus: 'patch_applied', terminal: false };
  }
  if (coderStatus === 'failed' || coderStatus === 'needs-human' || coderStatus === 'skipped') {
    return { reviewStatus: 'failed', implementationStatus: coderStatus, terminal: true };
  }
  return { reviewStatus: 'queued', implementationStatus: 'queued', terminal: false };
}

async function updateReviewedSpecQueue(input: {
  queuePath: string | undefined;
  status: FoundryReviewSummary['status'];
  implementation: Record<string, unknown>;
}): Promise<void> {
  if (!input.queuePath || !existsSync(input.queuePath)) return;
  const queueItem = asRecord(await readYamlFile(input.queuePath));
  await writeYamlFile(input.queuePath, {
    ...queueItem,
    status: input.status,
    implementation: input.implementation,
    updatedAt: nowIso(),
  });
  const indexPath = join(dirname(input.queuePath), 'index.yaml');
  if (!existsSync(indexPath)) return;
  const index = asRecord(await readYamlFile(indexPath));
  const specs = Array.isArray(index['specs']) ? index['specs'] : [];
  await writeYamlFile(indexPath, {
    ...index,
    updatedAt: nowIso(),
    implementation: input.implementation,
    specs: specs.map((entry) => {
      const spec = asRecord(entry);
      return spec['path'] === input.queuePath
        ? { ...spec, status: input.status, implementation: input.implementation }
        : spec;
    }),
  });
}

export async function syncFoundryReviewImplementationStatus(input: {
  artifactRoot: string;
  protocolId: string;
  variant: string;
  workspaceRoot?: string;
}): Promise<FoundryReviewImplementationSyncResult> {
  const variant = normalizeVariant(input.variant);
  if (!variant) throw new Error(`Unknown Foundry variant '${input.variant}'`);
  const reviewFile = reviewPath(input.artifactRoot, input.protocolId, variant);
  const review = asRecord(await readYamlFile(reviewFile));
  const existingStatus = firstString(review['status']);
  if (existingStatus === 'rejected' || existingStatus === 'reviewing' || Object.keys(review).length === 0) {
    return {
      success: true,
      updated: false,
      status: existingStatus === 'rejected' ? 'rejected' : existingStatus === 'reviewing' ? 'reviewing' : 'unreviewed',
      reviewPath: reviewFile,
      implementation: {},
    };
  }
  const paths = patchArtifactPaths(input.artifactRoot, input.protocolId, variant);
  const criticPath = existsSync(paths.criticReportPath) ? paths.criticReportPath : paths.flatCriticReportPath;
  const [coderPatch, critic, rerun] = await Promise.all([
    readArtifactRecord(paths.coderPatchPath),
    readArtifactRecord(criticPath),
    readArtifactRecord(paths.rerunReportPath),
  ]);
  const derived = implementationStatus({
    coderPatch,
    critic,
    rerun,
    patchFailureExists: existsSync(paths.patchFailurePath),
  });
  if (derived.implementationStatus === 'queued' && existingStatus !== 'implemented' && existingStatus !== 'failed') {
    return {
      success: true,
      updated: false,
      status: existingStatus === 'queued' ? 'queued' : 'unreviewed',
      reviewPath: reviewFile,
      implementation: {},
    };
  }
  const workspaceRoot = input.workspaceRoot ?? input.artifactRoot;
  const implementation: Record<string, unknown> = {
    status: derived.implementationStatus,
    terminal: derived.terminal,
    updatedAt: nowIso(),
    artifacts: artifactRecord({
      coderPatch: rel(workspaceRoot, existsSync(paths.coderPatchPath) ? paths.coderPatchPath : undefined),
      criticReport: rel(workspaceRoot, existsSync(criticPath) ? criticPath : undefined),
      rerunReport: rel(workspaceRoot, existsSync(paths.rerunReportPath) ? paths.rerunReportPath : undefined),
      patchFailure: rel(workspaceRoot, existsSync(paths.patchFailurePath) ? paths.patchFailurePath : undefined),
    }),
  };
  const queuePath = firstString(review['latestReviewedSpecPath']);
  await updateReviewedSpecQueue({
    queuePath,
    status: derived.reviewStatus,
    implementation,
  });
  await writeYamlFile(reviewFile, {
    kind: 'protocol-foundry-human-review',
    protocolId: input.protocolId,
    variant,
    createdAt: firstString(review['createdAt']) ?? nowIso(),
    ...review,
    status: derived.reviewStatus,
    ...(derived.reviewStatus === 'implemented' ? { implementedAt: nowIso() } : {}),
    ...(derived.reviewStatus === 'failed' ? { failedAt: nowIso() } : {}),
    implementation,
    updatedAt: nowIso(),
    semanticContract: buildSemanticContract(),
  });
  return {
    success: true,
    updated: true,
    status: derived.reviewStatus,
    reviewPath: reviewFile,
    ...(queuePath ? { queuePath } : {}),
    implementation,
  };
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:ya?ml|json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function parseModelSpec(text: string): Record<string, unknown> {
  try {
    const parsed = YAML.parse(stripFences(text));
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function firstStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const direct = asStringArray(value);
    if (direct.length > 0) return direct;
    const record = asRecord(value);
    const nested = asStringArray(record['files'] ?? record['paths'] ?? record['items']);
    if (nested.length > 0) return nested;
  }
  return [];
}

function reviewedFixClass(parsed: Record<string, unknown>, context: FoundryReviewContext): string {
  const explicit = firstString(parsed['fixClass'], parsed['fix_class'], parsed['class'], parsed['fixType'], parsed['fix_type']);
  if (explicit) return explicit;
  if (context.semantic.fixClassification === 'data-only') return 'material_catalog_or_spec_gap';
  if (context.semantic.fixClassification === 'registry') return 'labware_alias_or_resolver_gap';
  if (context.semantic.fixClassification === 'schema') return 'material_catalog_or_spec_gap';
  if (context.semantic.fixClassification === 'visualization') return 'browser_or_labware_rendering';
  if (context.semantic.fixClassification === 'harness') return 'foundry_runtime_wiring_gap';
  if (context.semantic.fixClassification === 'prompt') return 'extractor_prompt_contract';
  return 'event_graph_coverage';
}

function reviewedOwnedFiles(parsed: Record<string, unknown>, context: FoundryReviewContext): string[] {
  const owned = firstStringArray(
    parsed['ownedFiles'],
    parsed['owned_files'],
    parsed['writeSet'],
    parsed['write_set'],
    parsed['files'],
  );
  if (owned.length > 0) return owned;
  if (context.semantic.fixClassification === 'data-only' || context.semantic.fixClassification === 'registry') {
    return ['records', 'schema'];
  }
  if (context.semantic.fixClassification === 'visualization') {
    return ['app/src/protocol-ide', 'app/src/graph'];
  }
  return ['server/src/compiler', 'server/src/foundry'];
}

function reviewedAcceptance(parsed: Record<string, unknown>, context: FoundryReviewContext): string[] {
  const acceptance = firstStringArray(parsed['acceptance'], parsed['acceptanceCriteria'], parsed['acceptance_criteria'], parsed['tests']);
  if (acceptance.length > 0) return acceptance;
  return [
    `Focused fixture for ${context.protocolId}/${context.variant} demonstrates the reviewed behavior.`,
    'The compiler/pre-compiler emits durable semantic data rather than burying facts in code when a data representation is sufficient.',
    'The event graph, compiler output, and evidence refs preserve source protocol semantics.',
  ];
}

function reviewedTests(parsed: Record<string, unknown>): string[] {
  return firstStringArray(parsed['tests'], parsed['verification'], parsed['testPlan'], parsed['test_plan']);
}

function expectedArtifactDelta(parsed: Record<string, unknown>): string[] {
  return firstStringArray(parsed['expectedArtifactDelta'], parsed['expected_artifact_delta'], parsed['artifactDelta'], parsed['artifact_delta']);
}

function dataFirstDisposition(parsed: Record<string, unknown>, context: FoundryReviewContext): string {
  return firstString(
    parsed['dataFirstDisposition'],
    parsed['data_first_disposition'],
    parsed['dataFirst'],
    parsed['data_first'],
  ) ?? (
    context.semantic.fixClassification === 'compiler'
      ? 'Code may be required, but first confirm the durable semantics cannot be represented as YAML/schema/registry/fixture data.'
      : 'Prefer durable YAML/schema/registry/fixture data over compiler code for this fix.'
  );
}

function eventDiffKey(event: Record<string, unknown>): string | undefined {
  const semanticKey = typeof event['semanticKey'] === 'string' ? event['semanticKey'] : undefined;
  if (semanticKey) return `sk:${semanticKey}`;
  const eventId = typeof event['eventId'] === 'string' ? event['eventId'] : undefined;
  if (eventId) return `id:${eventId}`;
  return undefined;
}

function indexEventsByKey(events: unknown[]): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const record = event as Record<string, unknown>;
    const key = eventDiffKey(record);
    if (key) index.set(key, record);
  }
  return index;
}

function buildDiffEntry(key: string, record: Record<string, unknown>): FoundryInnerLoopDiffEntry {
  const entry: FoundryInnerLoopDiffEntry = { key };
  if (typeof record['eventId'] === 'string') entry.eventId = record['eventId'];
  if (typeof record['semanticKey'] === 'string') entry.semanticKey = record['semanticKey'];
  if (typeof record['event_type'] === 'string') entry.eventType = record['event_type'];
  return entry;
}

function diffEventGraphs(
  beforeEvents: unknown[],
  afterEvents: unknown[],
): { added: FoundryInnerLoopDiffEntry[]; removed: FoundryInnerLoopDiffEntry[]; changed: FoundryInnerLoopDiffEntry[] } {
  const before = indexEventsByKey(beforeEvents);
  const after = indexEventsByKey(afterEvents);
  const added: FoundryInnerLoopDiffEntry[] = [];
  const removed: FoundryInnerLoopDiffEntry[] = [];
  const changed: FoundryInnerLoopDiffEntry[] = [];
  for (const [key, record] of after) {
    if (!before.has(key)) {
      added.push(buildDiffEntry(key, record));
    } else {
      const priorRecord = before.get(key)!;
      if (JSON.stringify(priorRecord) !== JSON.stringify(record)) {
        const entry = buildDiffEntry(key, record);
        entry.before = priorRecord;
        entry.after = record;
        changed.push(entry);
      }
    }
  }
  for (const [key, record] of before) {
    if (!after.has(key)) removed.push(buildDiffEntry(key, record));
  }
  return { added, removed, changed };
}

function eventsFromEventGraphYaml(raw: unknown): unknown[] {
  const rootRecord = asRecord(raw);
  const eventGraphRecord = asRecord(rootRecord['eventGraph']);
  const events = eventGraphRecord['events'];
  if (Array.isArray(events)) return events;
  const rootEvents = rootRecord['events'];
  return Array.isArray(rootEvents) ? rootEvents : [];
}

function normalizeReviewedSpec(input: {
  id: string;
  modelText: string;
  context: FoundryReviewContext;
}): StructuredReviewedSpec {
  const parsed = parseModelSpec(input.modelText);
  const fixClass = reviewedFixClass(parsed, input.context);
  const title = firstString(parsed['title'], parsed['summary']) ?? `Human-reviewed Foundry spec for ${input.context.protocolId}/${input.context.variant}`;
  const rationale = firstString(parsed['rationale'], parsed['why'], parsed['problem']) ?? input.modelText.slice(0, 4000);
  return {
    id: input.id,
    title,
    fixClass,
    rationale,
    ownedFiles: reviewedOwnedFiles(parsed, input.context),
    acceptance: reviewedAcceptance(parsed, input.context),
    dataFirstDisposition: dataFirstDisposition(parsed, input.context),
    semanticLayer: firstString(parsed['semanticLayer'], parsed['semantic_layer']) ?? input.context.semantic.fixClassification,
    evidenceCitations: firstStringArray(parsed['evidenceCitations'], parsed['evidence_citations'], parsed['evidence']),
    graphAnchors: firstStringArray(parsed['graphAnchors'], parsed['graph_anchors'], parsed['anchors']),
    ontologyBackfillNeeds: firstStringArray(parsed['ontologyBackfillNeeds'], parsed['ontology_backfill_needs']),
    tests: reviewedTests(parsed),
    expectedArtifactDelta: expectedArtifactDelta(parsed),
    rawModelSpec: parsed,
    rawText: input.modelText,
  };
}

function artifactSourceRefs(context: FoundryReviewContext): Array<Record<string, unknown>> {
  const refs: Array<Record<string, unknown>> = [];
  for (const [key, value] of Object.entries(context.artifactRefs)) {
    if (typeof value === 'string') refs.push({ type: 'file', ref: { kind: 'record', id: value, type: key } });
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') refs.push({ type: 'file', ref: { kind: 'record', id: entry, type: key } });
      }
    }
  }
  return refs.slice(0, 24);
}

async function writeKnowledgeLayerBundle(input: {
  artifactRoot: string;
  workspaceRoot: string;
  context: FoundryReviewContext;
  reviewedSpec: StructuredReviewedSpec;
  queuePath: string;
  patchSpecPath?: string;
}): Promise<KnowledgeLayerBundle> {
  const dir = knowledgeLayerDir(input.artifactRoot, input.context.protocolId, input.context.variant);
  const contextId = stableReviewId('CTX', input.context.protocolId, input.context.variant);
  const claimId = stableReviewId('CLM', input.context.protocolId, input.context.variant);
  const assertionId = stableReviewId('ASN', input.context.protocolId, input.context.variant);
  const evidenceId = stableReviewId('EVD', input.context.protocolId, input.context.variant);
  const generatedAt = nowIso();
  const paths = {
    context: join(dir, `${contextId}.yaml`),
    claim: join(dir, `${claimId}.yaml`),
    assertion: join(dir, `${assertionId}.yaml`),
    evidence: join(dir, `${evidenceId}.yaml`),
    index: join(dir, 'index.yaml'),
  };
  const contextRef = { kind: 'record', id: contextId, type: 'context', path: rel(input.workspaceRoot, paths.context) };
  const claimRef = { kind: 'record', id: claimId, type: 'claim', path: rel(input.workspaceRoot, paths.claim) };
  const assertionRef = { kind: 'record', id: assertionId, type: 'assertion', path: rel(input.workspaceRoot, paths.assertion) };
  const evidenceRef = { kind: 'record', id: evidenceId, type: 'evidence', path: rel(input.workspaceRoot, paths.evidence) };
  await writeYamlFile(paths.context, {
    $schema: 'https://computable-lab.com/schema/computable-lab/context.schema.yaml',
    kind: 'context',
    id: contextId,
    title: `Foundry review context for ${input.context.protocolId}/${input.context.variant}`,
    subject_ref: { kind: 'record', id: input.context.protocolId, type: 'protocol' },
    event_graph_ref: input.context.artifactRefs.eventGraph
      ? { kind: 'record', id: String(input.context.artifactRefs.eventGraph), type: 'event_graph' }
      : undefined,
    completeness: 'partial',
    missing: input.context.semantic.ontologyBackfillNeeds,
    properties: {
      protocolId: input.context.protocolId,
      variant: input.context.variant,
      fixClassification: input.context.semantic.fixClassification,
      artifactRefs: input.context.artifactRefs,
      semanticContract: input.context.semanticContract,
    },
    createdAt: generatedAt,
    createdBy: 'protocol-foundry-human-review',
  });
  await writeYamlFile(paths.claim, {
    $schema: 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml',
    kind: 'claim',
    id: claimId,
    title: input.reviewedSpec.title,
    statement: input.reviewedSpec.rationale,
    subject: { kind: 'record', id: input.context.protocolId, type: 'protocol' },
    predicate: { kind: 'ontology', namespace: 'computable-lab', id: 'requires-foundry-improvement', label: 'requires Foundry improvement' },
    object: { kind: 'record', id: input.reviewedSpec.id, type: 'protocol-foundry-patch-spec' },
    status: 'active',
    keywords: ['protocol-foundry', input.context.variant, input.reviewedSpec.fixClass],
    createdAt: generatedAt,
    createdBy: 'protocol-foundry-human-review',
  });
  await writeYamlFile(paths.assertion, {
    $schema: 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml',
    kind: 'assertion',
    id: assertionId,
    title: `Reviewed Foundry assertion for ${input.context.protocolId}/${input.context.variant}`,
    claim_ref: claimRef,
    statement: `Human/AI review queued ${input.reviewedSpec.id}: ${input.reviewedSpec.title}`,
    scope: 'single_context',
    context_refs: [contextRef],
    confidence: 3,
    evidence_refs: [evidenceRef],
    outcome: {
      measure: 'compiler_improvement_need',
      direction: 'unknown',
      layer: 'event_derived',
    },
    status: 'active',
    createdAt: generatedAt,
    createdBy: 'protocol-foundry-human-review',
  });
  await writeYamlFile(paths.evidence, {
    $schema: 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml',
    kind: 'evidence',
    id: evidenceId,
    title: `Foundry review evidence for ${input.context.protocolId}/${input.context.variant}`,
    supports: [assertionRef],
    sources: [
      ...artifactSourceRefs(input.context),
      { type: 'file', ref: { kind: 'record', id: rel(input.workspaceRoot, input.queuePath) ?? input.queuePath, type: 'reviewed_spec' } },
      ...(input.patchSpecPath ? [{ type: 'file', ref: { kind: 'record', id: rel(input.workspaceRoot, input.patchSpecPath) ?? input.patchSpecPath, type: 'patch_spec' } }] : []),
    ],
    quality: {
      humanReviewed: true,
      dataFirstDisposition: input.reviewedSpec.dataFirstDisposition,
      graphAnchors: input.reviewedSpec.graphAnchors.length > 0 ? input.reviewedSpec.graphAnchors : input.context.semantic.graphAnchors,
      evidenceCitations: input.reviewedSpec.evidenceCitations,
      exactContextOnly: true,
    },
    status: 'active',
    createdAt: generatedAt,
    createdBy: 'protocol-foundry-human-review',
  });
  await writeYamlFile(paths.index, {
    kind: 'protocol-foundry-knowledge-layer-index',
    protocolId: input.context.protocolId,
    variant: input.context.variant,
    updatedAt: generatedAt,
    refs: { contextRef, claimRef, assertionRef, evidenceRef },
    paths: Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, rel(input.workspaceRoot, path) ?? path])),
  });
  return {
    contextRef,
    claimRef,
    assertionRef,
    evidenceRef,
    paths: Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, rel(input.workspaceRoot, path) ?? path])),
  };
}

function rejectionKnowledgeId(prefix: string, protocolId: string, variant: FoundryVariant): string {
  return `${prefix}-FDRY-RJC-${slugify(protocolId).toUpperCase()}-${variant.toUpperCase()}-${Date.now().toString(36)}`;
}

function innerLoopAssertionId(protocolId: string, variant: FoundryVariant, traceShortHash: string): string {
  return `ASN-FDRY-INNERLOOP-${slugify(protocolId).toUpperCase()}-${variant.toUpperCase()}-${traceShortHash}`;
}

interface RejectionKnowledgeRecords {
  claimRef: Record<string, unknown>;
  evidenceRef: Record<string, unknown>;
  claimPath: string;
  evidencePath: string;
}

async function writeRejectionKnowledgeRecords(input: {
  artifactRoot: string;
  workspaceRoot: string;
  context: FoundryReviewContext;
  reason: string;
  reasonClass?: string;
  rejectedAt: string;
}): Promise<RejectionKnowledgeRecords> {
  const dir = knowledgeLayerDir(input.artifactRoot, input.context.protocolId, input.context.variant);
  const claimId = rejectionKnowledgeId('CLM', input.context.protocolId, input.context.variant);
  const evidenceId = rejectionKnowledgeId('EVD', input.context.protocolId, input.context.variant);
  const claimPath = join(dir, `${claimId}.yaml`);
  const evidencePath = join(dir, `${evidenceId}.yaml`);
  const claimRef = { kind: 'record', id: claimId, type: 'claim', path: rel(input.workspaceRoot, claimPath) };
  const evidenceRef = { kind: 'record', id: evidenceId, type: 'evidence', path: rel(input.workspaceRoot, evidencePath) };
  await writeYamlFile(claimPath, {
    $schema: 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml',
    kind: 'claim',
    id: claimId,
    title: `Foundry review rejection: ${input.context.protocolId}/${input.context.variant}`,
    statement: input.reason,
    subject: { kind: 'record', id: input.context.protocolId, type: 'protocol' },
    predicate: {
      kind: 'ontology',
      namespace: 'computable-lab',
      id: 'rejects-foundry-improvement',
      label: 'rejects Foundry improvement',
    },
    object: { kind: 'record', id: `${input.context.protocolId}:${input.context.variant}`, type: 'protocol-foundry-review' },
    status: 'active',
    keywords: ['protocol-foundry', input.context.variant, 'rejection', input.reasonClass ?? 'other'],
    createdAt: input.rejectedAt,
    createdBy: 'protocol-foundry-human-review',
  });
  await writeYamlFile(evidencePath, {
    $schema: 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml',
    kind: 'evidence',
    id: evidenceId,
    title: `Foundry rejection evidence for ${input.context.protocolId}/${input.context.variant}`,
    supports: [claimRef],
    sources: artifactSourceRefs(input.context),
    quality: {
      humanReviewed: true,
      rejection: true,
      rejectionReason: input.reason,
      ...(input.reasonClass ? { rejectionReasonClass: input.reasonClass } : {}),
      exactContextOnly: true,
    },
    status: 'active',
    createdAt: input.rejectedAt,
    createdBy: 'protocol-foundry-human-review',
  });
  const indexPath = join(dir, 'rejections-index.yaml');
  const existing = asRecord(await readYamlFile(indexPath));
  const rejections = Array.isArray(existing['rejections']) ? [...existing['rejections'] as unknown[]] : [];
  rejections.unshift({
    rejectedAt: input.rejectedAt,
    reason: input.reason,
    ...(input.reasonClass ? { reasonClass: input.reasonClass } : {}),
    claimRef,
    evidenceRef,
  });
  await writeYamlFile(indexPath, {
    kind: 'protocol-foundry-rejection-knowledge-index',
    protocolId: input.context.protocolId,
    variant: input.context.variant,
    updatedAt: input.rejectedAt,
    rejections,
  });
  return { claimRef, evidenceRef, claimPath, evidencePath };
}

interface InnerLoopAssertionRecord {
  assertionRef: Record<string, unknown>;
  assertionPath: string;
}

async function writeInnerLoopAssertion(input: {
  artifactRoot: string;
  workspaceRoot: string;
  context: FoundryReviewContext;
  trace: FoundryInnerLoopTrace;
  tracePath: string;
}): Promise<InnerLoopAssertionRecord> {
  const dir = knowledgeLayerDir(input.artifactRoot, input.context.protocolId, input.context.variant);
  // Last 8 chars of trace id make the assertion id stable + sortable per trace.
  const shortHash = input.trace.id.slice(-8);
  const assertionId = innerLoopAssertionId(input.context.protocolId, input.context.variant, shortHash);
  const assertionPath = join(dir, `${assertionId}.yaml`);
  const assertionRef = { kind: 'record', id: assertionId, type: 'assertion', path: rel(input.workspaceRoot, assertionPath) };
  const traceRef = { kind: 'record', id: input.trace.id, type: 'protocol-foundry-review-inner-loop-trace', path: rel(input.workspaceRoot, input.tracePath) };
  const existingClaimRef = Array.isArray(input.context.knowledgeLayer.claimRefs) && input.context.knowledgeLayer.claimRefs.length > 0
    ? input.context.knowledgeLayer.claimRefs[0]
    : null;
  const existingContextRef = Array.isArray(input.context.knowledgeLayer.contextRefs) && input.context.knowledgeLayer.contextRefs.length > 0
    ? input.context.knowledgeLayer.contextRefs[0]
    : null;
  const diff = input.trace.diff;
  const addedCount = diff?.added.length ?? 0;
  const removedCount = diff?.removed.length ?? 0;
  const changedCount = diff?.changed.length ?? 0;
  const direction = addedCount > 0
    ? 'improved'
    : removedCount > 0
      ? 'worse'
      : changedCount > 0
        ? 'changed'
        : 'unchanged';
  const confidence = input.trace.status === 'failed' ? 1 : addedCount > 0 ? 4 : changedCount > 0 ? 3 : 2;
  await writeYamlFile(assertionPath, {
    $schema: 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml',
    kind: 'assertion',
    id: assertionId,
    title: `Inner-loop assertion for trace ${input.trace.id}`,
    ...(existingClaimRef ? { claim_ref: existingClaimRef } : {}),
    statement: [
      `Human ran inner loop with prompt: "${input.trace.prompt.slice(0, 200)}"`,
      `status=${input.trace.status}`,
      input.trace.coder?.status ? `coder=${input.trace.coder.status}` : null,
      input.trace.recompile?.outcome ? `recompile=${input.trace.recompile.outcome}` : null,
      diff ? `diff=+${addedCount}/-${removedCount}/~${changedCount}` : null,
    ].filter(Boolean).join('; '),
    scope: 'single_context',
    ...(existingContextRef ? { context_refs: [existingContextRef] } : {}),
    confidence,
    evidence_refs: [traceRef],
    outcome: {
      measure: 'inner_loop_outcome',
      direction,
      layer: 'event_derived',
    },
    status: 'active',
    keywords: ['protocol-foundry', input.context.variant, 'inner-loop', input.trace.status],
    createdAt: input.trace.generatedAt,
    createdBy: 'protocol-foundry-human-review',
    properties: {
      traceId: input.trace.id,
      draftSpecId: input.trace.draftSpec.id,
      draftSpecPath: rel(input.workspaceRoot, input.trace.draftSpec.draftPath) ?? input.trace.draftSpec.draftPath,
      criticInvoked: Boolean(input.trace.criticInvoked),
    },
  });
  const indexPath = join(dir, 'inner-loop-assertions-index.yaml');
  const existing = asRecord(await readYamlFile(indexPath));
  const assertions = Array.isArray(existing['assertions']) ? [...existing['assertions'] as unknown[]] : [];
  assertions.unshift({
    traceId: input.trace.id,
    assertionRef,
    status: input.trace.status,
    generatedAt: input.trace.generatedAt,
    direction,
  });
  await writeYamlFile(indexPath, {
    kind: 'protocol-foundry-inner-loop-assertion-index',
    protocolId: input.context.protocolId,
    variant: input.context.variant,
    updatedAt: input.trace.generatedAt,
    assertions,
  });
  return { assertionRef, assertionPath };
}

async function writeLiveFoundryPatchSpec(input: {
  artifactRoot: string;
  workspaceRoot: string;
  id: string;
  reviewedSpec: StructuredReviewedSpec;
  context: FoundryReviewContext;
  queuePath: string;
  markdownPath: string;
  humanInstruction: string;
  knowledgeLayer: KnowledgeLayerBundle;
  runnerQueuePolicy: FoundryRunnerQueuePolicy;
}): Promise<{ patchSpecPath: string; adoptionPath: string }> {
  const patchDir = livePatchSpecDir(input.artifactRoot, input.context.protocolId, input.context.variant);
  const patchSpecPath = join(patchDir, `${input.id}.yaml`);
  const adoption = adoptionPath(input.artifactRoot, input.context.protocolId, input.context.variant);
  const { reviewedSpec } = input;
  const { fixClass, title, rationale, ownedFiles, acceptance } = reviewedSpec;
  const coderModel = fixClass.includes('compiler') || fixClass.includes('runtime') || fixClass.includes('precompiler') || fixClass.includes('event_graph')
    ? 'Qwen/Qwen3.6-27B-FP8'
    : 'Kbenkhaled/Qwen3.5-35B-A3B-NVFP4';
  await writeYamlFile(patchSpecPath, {
    kind: 'protocol-foundry-patch-spec',
    id: input.id,
    source: 'human-reviewed-foundry-spec',
    generated_at: nowIso(),
    protocolId: input.context.protocolId,
    variant: input.context.variant,
    fixClass,
    title,
    rationale,
    ownedFiles,
    acceptance,
    implementationBudget: {
      targetChangedFiles: Math.min(Math.max(ownedFiles.length, 1), 2),
      maxChangedFiles: Math.max(3, Math.min(ownedFiles.length + 1, 5)),
      targetChangedLines: 120,
      maxChangedLines: 320,
      requireFocusedFixture: true,
    },
    coderModelProfile: {
      model: coderModel,
      guidance: 'Human-reviewed, narrow, evidence-backed spec. Preserve data-first and ontology-aware semantics.',
    },
    doNotTouch: [
      'Do not rewrite the whole compiler/pre-compiler pipeline.',
      'Do not create physical inventory instances from vendor PDF evidence unless the spec explicitly calls for it.',
      'Prefer YAML/schema/registry/fixture records over code when durable data can represent the change.',
    ],
    sourceArtifacts: {
      ...input.context.artifactRefs,
      reviewedSpecQueueItem: rel(input.workspaceRoot, input.queuePath),
      reviewedSpecMarkdown: rel(input.workspaceRoot, input.markdownPath),
      humanReview: input.context.artifactRefs.humanReview,
    },
    runnerQueuePolicy: input.runnerQueuePolicy,
    semanticContract: input.context.semanticContract,
    semantic: input.context.semantic,
    knowledgeLayer: {
      contextRefs: [input.knowledgeLayer.contextRef],
      claimRefs: [input.knowledgeLayer.claimRef],
      assertionRefs: [input.knowledgeLayer.assertionRef],
      evidenceRefs: [input.knowledgeLayer.evidenceRef],
      paths: input.knowledgeLayer.paths,
    },
    humanInstruction: input.humanInstruction,
    reviewedSpec,
    reviewedSpecText: reviewedSpec.rawText,
  });
  await writeYamlFile(join(patchDir, 'index.yaml'), {
    kind: 'protocol-foundry-patch-spec-index',
    protocolId: input.context.protocolId,
    variant: input.context.variant,
    updated_at: nowIso(),
    source: 'human-reviewed-foundry-specs',
    runnerQueuePolicy: input.runnerQueuePolicy,
  });
  await writeYamlFile(adoption, {
    kind: 'protocol-foundry-adoption-decision',
    protocolId: input.context.protocolId,
    variant: input.context.variant,
    generated_at: nowIso(),
    status: 'accepted',
    applyPatches: true,
    source: 'human-reviewed-foundry-spec',
    runnerQueuePolicy: input.runnerQueuePolicy,
    patchSpecs: [{
      id: input.id,
      path: patchSpecPath,
      fixClass,
      title,
    }],
    message: 'Human-reviewed spec accepted and made available to the Foundry coder/critic loop.',
  });
  return { patchSpecPath, adoptionPath: adoption };
}

export class FoundryHumanReviewService {
  constructor(
    private options: {
      artifactRoot: string;
      workspaceRoot: string;
      chatConfig?: Partial<ChatConfig>;
    },
  ) {}

  async listReviews(): Promise<{ success: true; reviews: FoundryReviewSummary[] }> {
    const ledger = await loadOrCreateFoundryLedger(this.options.artifactRoot);
    const reviews: FoundryReviewSummary[] = [];
    for (const protocolId of ledger.protocols) {
      const protocol = ledger.protocol_status[protocolId];
      if (!protocol) continue;
      for (const variant of FOUNDRY_VARIANTS) {
        const item = protocol.variants[variant];
        if (!item) continue;
        if (!item.artifacts.architectVerdict && !item.artifacts.patchSpecs?.length && !item.artifacts.eventGraph) continue;
        const humanReview = asRecord(await readYamlFile(reviewPath(this.options.artifactRoot, protocolId, variant)));
        const architectVerdict = asRecord(await readYamlFile(item.artifacts.architectVerdict ?? ''));
        const title = firstString(architectVerdict['title'], architectVerdict['protocolTitle'], protocolId);
        const vendor = firstString(architectVerdict['vendor']);
        const architectVerdictText = firstString(architectVerdict['verdict'], architectVerdict['outcome']);
        const updatedAt = firstString(humanReview['updatedAt'], humanReview['queuedAt'], humanReview['rejectedAt'], ledger.updated_at);
        const lastInnerLoopAt = firstString(humanReview['lastInnerLoopAt']);
        const summary: FoundryReviewSummary = {
          protocolId,
          variant,
          status: statusFromReview(humanReview, item),
          ...(title ? { title } : {}),
          ...(vendor ? { vendor } : {}),
          ...(item.metrics.eventCount !== undefined ? { eventCount: item.metrics.eventCount } : {}),
          ...(architectVerdictText ? { architectVerdict: architectVerdictText } : {}),
          patchSpecCount: item.artifacts.patchSpecs?.length ?? 0,
          fixClassification: classifyFix(architectVerdict, humanReview),
          ...(updatedAt ? { updatedAt } : {}),
          ...(lastInnerLoopAt ? { lastInnerLoopAt } : {}),
          artifacts: artifactRecord({
            compiler: rel(this.options.workspaceRoot, item.artifacts.compiler),
            eventGraph: rel(this.options.workspaceRoot, item.artifacts.eventGraph),
            browserReport: rel(this.options.workspaceRoot, item.artifacts.browserReport),
            architectVerdict: rel(this.options.workspaceRoot, item.artifacts.architectVerdict),
            patchSpecs: item.artifacts.patchSpecs?.map((path: string) => rel(this.options.workspaceRoot, path) ?? path),
            humanReview: rel(this.options.workspaceRoot, reviewPath(this.options.artifactRoot, protocolId, variant)),
          }),
        };
        reviews.push(summary);
      }
    }
    reviews.sort((a, b) => `${a.status}:${a.protocolId}:${a.variant}`.localeCompare(`${b.status}:${b.protocolId}:${b.variant}`));
    return { success: true, reviews };
  }

  async getReviewContext(protocolId: string, variantInput: string): Promise<{ success: true; context: FoundryReviewContext }> {
    const variant = normalizeVariant(variantInput);
    if (!variant) throw new Error(`Unknown Foundry variant '${variantInput}'`);
    const ledger = await loadOrCreateFoundryLedger(this.options.artifactRoot);
    const protocol = ledger.protocol_status[protocolId];
    if (!protocol) throw new Error(`Unknown Foundry protocol '${protocolId}'`);
    const item = protocol.variants[variant];
    if (!item) throw new Error(`Unknown Foundry variant '${variant}' for protocol '${protocolId}'`);

    const humanReviewPath = reviewPath(this.options.artifactRoot, protocolId, variant);
    const patchSpecPaths = item.artifacts.patchSpecs ?? [];
    const [
      procurement,
      segment,
      materialContext,
      compiler,
      eventGraph,
      executionScale,
      browserReview,
      architectVerdict,
      adoptionDecision,
      humanReview,
      extractedText,
      patchSpecs,
    ] = await Promise.all([
      readYamlBounded(join(this.options.artifactRoot, 'pdfs', `${protocolId}.pdf.procurement.yaml`)),
      readYamlBounded(protocol.segmentPath),
      readYamlBounded(protocol.materialContextPath),
      readYamlBounded(item.artifacts.compiler),
      readYamlBounded(item.artifacts.eventGraph),
      readYamlBounded(item.artifacts.executionScale),
      readYamlBounded(item.artifacts.browserReport),
      readYamlBounded(item.artifacts.architectVerdict),
      readYamlBounded(item.artifacts.adoptionDecision),
      readYamlBounded(humanReviewPath),
      readTextBounded(join(this.options.artifactRoot, 'text', `${protocolId}.txt`)),
      Promise.all(patchSpecPaths.map((path) => readYamlBounded(path))),
    ]);
    const pageImages = [
      ...(await listFilesIfExists(join(this.options.artifactRoot, 'page-images', protocolId))),
      ...(await listFilesIfExists(join(this.options.artifactRoot, 'browser-review', protocolId, variant))),
    ].filter((path) => /\.(png|jpe?g|webp)$/i.test(path));

    const reviewRecord = asRecord(humanReview);
    const sourceTitle = firstString(asRecord(procurement)['title'], asRecord(architectVerdict)['title'], protocolId);
    const sourceVendor = firstString(asRecord(procurement)['source_domain'], asRecord(procurement)['vendor'], asRecord(architectVerdict)['vendor']);
    const sourcePdf = rel(this.options.workspaceRoot, join(this.options.artifactRoot, 'pdfs', `${protocolId}.pdf`));
    const extractedTextPath = rel(this.options.workspaceRoot, join(this.options.artifactRoot, 'text', `${protocolId}.txt`));
    const source: FoundryReviewContext['source'] = {
      ...(sourceTitle ? { title: sourceTitle } : {}),
      ...(sourceVendor ? { vendor: sourceVendor } : {}),
      ...(sourcePdf ? { pdf: sourcePdf } : {}),
      ...(procurement !== undefined ? { procurement } : {}),
      ...(extractedText !== undefined ? { extractedText } : {}),
      ...(extractedTextPath ? { extractedTextPath } : {}),
      pageImages: pageImages.map((path: string) => rel(this.options.workspaceRoot, path) ?? path),
    };
    const context: FoundryReviewContext = {
      kind: 'protocol-foundry-review-context',
      protocolId,
      variant,
      generatedAt: nowIso(),
      status: statusFromReview(reviewRecord, item),
      semanticContract: buildSemanticContract(),
      source,
      artifacts: {
        segment,
        materialContext,
        compiler,
        eventGraph,
        executionScale,
        browserReview,
        architectVerdict,
        patchSpecs: patchSpecs.filter((spec: unknown): spec is unknown => spec !== undefined),
        adoptionDecision,
        humanReview,
      },
      artifactRefs: {
        segment: rel(this.options.workspaceRoot, protocol.segmentPath),
        materialContext: rel(this.options.workspaceRoot, protocol.materialContextPath),
        compiler: rel(this.options.workspaceRoot, item.artifacts.compiler),
        eventGraph: rel(this.options.workspaceRoot, item.artifacts.eventGraph),
        executionScale: rel(this.options.workspaceRoot, item.artifacts.executionScale),
        browserReview: rel(this.options.workspaceRoot, item.artifacts.browserReport),
        architectVerdict: rel(this.options.workspaceRoot, item.artifacts.architectVerdict),
        patchSpecs: patchSpecPaths.map((path: string) => rel(this.options.workspaceRoot, path) ?? path),
        adoptionDecision: rel(this.options.workspaceRoot, item.artifacts.adoptionDecision),
        humanReview: rel(this.options.workspaceRoot, humanReviewPath),
      },
      semantic: {
        eventSemanticKeys: extractStrings(eventGraph, (key) => key === 'semanticKey'),
        graphAnchors: extractStrings(eventGraph, (key) => /eventId|nodeId|graphAnchor|semanticKey/.test(key)),
        materialLayerDecisions: extractStrings(materialContext, (key, val) => key === 'layer' && typeof val === 'string'),
        ontologyRefs: extractStrings(materialContext, (key, val) => /ontology|curie|iri|uri|namespace/.test(key) && typeof val === 'string'),
        ontologyBackfillNeeds: extractStrings([materialContext, architectVerdict, humanReview], (key, val) => /ontology.*backfill|backfill/.test(key) && typeof val === 'string'),
        fixClassification: classifyFix(architectVerdict, patchSpecs, humanReview),
      },
      knowledgeLayer: {
        contextRefs: Array.isArray(reviewRecord['contextRefs']) ? reviewRecord['contextRefs'] : [],
        claimRefs: Array.isArray(reviewRecord['claimRefs']) ? reviewRecord['claimRefs'] : [],
        assertionRefs: Array.isArray(reviewRecord['assertionRefs']) ? reviewRecord['assertionRefs'] : [],
        evidenceRefs: Array.isArray(reviewRecord['evidenceRefs']) ? reviewRecord['evidenceRefs'] : [],
      },
    };
    return { success: true, context };
  }

  async getReviewEventGraph(
    protocolId: string,
    variantInput: string,
  ): Promise<FoundryReviewEventGraphResponse> {
    const variant = normalizeVariant(variantInput);
    if (!variant) throw new Error(`Unknown Foundry variant '${variantInput}'`);
    const ledger = await loadOrCreateFoundryLedger(this.options.artifactRoot);
    const protocol = ledger.protocol_status[protocolId];
    if (!protocol) throw new Error(`Unknown Foundry protocol '${protocolId}'`);
    const item = protocol.variants[variant];
    if (!item) throw new Error(`Unknown Foundry variant '${variant}' for protocol '${protocolId}'`);
    const eventGraphPath = item.artifacts.eventGraph;
    if (!eventGraphPath) {
      return { success: true, events: [], labwares: [], deckPlacements: [] };
    }
    const raw = await readYamlBounded(eventGraphPath);
    const rootRecord = asRecord(raw);
    const eventGraphRecord = asRecord(rootRecord['eventGraph']);
    const terminalArtifacts = asRecord(rootRecord['terminalArtifacts']);
    const labStateDelta = asRecord(terminalArtifacts['labStateDelta']);
    const snapshotAfter = asRecord(labStateDelta['snapshotAfter']);
    const events = Array.isArray(eventGraphRecord['events']) ? eventGraphRecord['events'] : [];
    const labwares = Array.isArray(eventGraphRecord['labwares']) ? eventGraphRecord['labwares'] : [];
    const deckPlacements = Array.isArray(snapshotAfter['deck']) ? snapshotAfter['deck'] : [];
    return { success: true, events, labwares, deckPlacements };
  }

  async appendChatTurn(input: {
    protocolId: string;
    variant: string;
    prompt: string;
    history?: ConversationHistoryMessage[];
  }): Promise<FoundryReviewChatResponse> {
    const { context } = await this.getReviewContext(input.protocolId, input.variant);
    const text = await this.callReviewModel(input.prompt, context, input.history ?? []);
    const existingTranscript = asRecord(context.artifacts.humanReview)['chatTranscript'];
    await this.updateHumanReview(context.protocolId, context.variant, {
      status: 'reviewing',
      updatedAt: nowIso(),
      latestChatSummary: text.slice(0, 4000),
      chatTranscript: [
        ...(Array.isArray(existingTranscript) ? existingTranscript : []),
        { role: 'user', content: input.prompt, at: nowIso() },
        { role: 'assistant', content: text, at: nowIso() },
      ],
    });
    return { success: true, text, reviewContext: context };
  }

  async synthesizeSpec(input: {
    protocolId: string;
    variant: string;
    humanInstruction?: string;
  }): Promise<FoundryReviewedSpecResponse> {
    const { context } = await this.getReviewContext(input.protocolId, input.variant);
    const instruction = input.humanInstruction?.trim() || 'Use the latest human/AI review conversation to produce the next narrow implementable spec.';
    const prompt = [
      'Create exactly one reviewed Protocol Foundry implementation spec as YAML.',
      'Preserve the data-first rule: if YAML/schema/registry/fixture data can solve it, choose that over code.',
      'If code is required, explain why data/config is insufficient.',
      'The spec must be narrow enough for one local coder session and must include evidence citations, graph anchors, semantic layer classification, write set, tests, and expected artifact delta.',
      'Use these top-level keys: title, fixClass, rationale, ownedFiles, acceptance, dataFirstDisposition, semanticLayer, evidenceCitations, graphAnchors, ontologyBackfillNeeds, tests, expectedArtifactDelta.',
      'Do not include recommendations for unrelated protocols or variants.',
      '',
      `Human final instruction: ${instruction}`,
    ].join('\n');
    const modelText = await this.callReviewModel(prompt, context, []);
    const id = queueSpecId(context.protocolId, context.variant);
    const reviewedSpec = normalizeReviewedSpec({ id, modelText, context });
    const queueDir = reviewedSpecDir(this.options.artifactRoot, context.protocolId, context.variant);
    const queuePath = join(queueDir, `${id}.yaml`);
    const markdownPath = join(queueDir, `${id}.md`);
    const runnerQueuePolicy = buildRunnerQueuePolicy();
    const knowledgeLayer = await writeKnowledgeLayerBundle({
      artifactRoot: this.options.artifactRoot,
      workspaceRoot: this.options.workspaceRoot,
      context,
      reviewedSpec,
      queuePath,
    });
    const queueItem = {
      kind: 'protocol-foundry-reviewed-spec',
      id,
      status: 'queued',
      generatedAt: nowIso(),
      protocolId: context.protocolId,
      variant: context.variant,
      source: {
        reviewManifest: rel(this.options.workspaceRoot, reviewPath(this.options.artifactRoot, context.protocolId, context.variant)),
        artifactRefs: context.artifactRefs,
      },
      semanticContract: context.semanticContract,
      semantic: context.semantic,
      knowledgeLayer: {
        contextRefs: [knowledgeLayer.contextRef],
        claimRefs: [knowledgeLayer.claimRef],
        assertionRefs: [knowledgeLayer.assertionRef],
        evidenceRefs: [knowledgeLayer.evidenceRef],
        paths: knowledgeLayer.paths,
      },
      humanInstruction: instruction,
      reviewedSpec,
      reviewedSpecText: modelText,
      routing: {
        queue: runnerQueuePolicy.executableQueue,
        defaultCoderLane: context.semantic.fixClassification === 'compiler' || context.semantic.fixClassification === 'mixed' ? 'senior' : 'fast',
      },
      runnerQueuePolicy,
    };
    await writeYamlFile(queuePath, queueItem);
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, `# ${id}\n\n${modelText}\n`, 'utf-8');
    await writeYamlFile(join(queueDir, 'index.yaml'), {
      kind: 'protocol-foundry-reviewed-spec-bundle',
      protocolId: context.protocolId,
      variant: context.variant,
      updatedAt: nowIso(),
      specs: [{ id, path: queuePath, markdownPath, status: 'queued' }],
      runnerQueuePolicy,
    });
    const liveHandoff = await writeLiveFoundryPatchSpec({
      artifactRoot: this.options.artifactRoot,
      workspaceRoot: this.options.workspaceRoot,
      id,
      reviewedSpec,
      context,
      queuePath,
      markdownPath,
      humanInstruction: instruction,
      knowledgeLayer,
      runnerQueuePolicy,
    });
    const finalKnowledgeLayer = await writeKnowledgeLayerBundle({
      artifactRoot: this.options.artifactRoot,
      workspaceRoot: this.options.workspaceRoot,
      context,
      reviewedSpec,
      queuePath,
      patchSpecPath: liveHandoff.patchSpecPath,
    });
    const updated = await this.updateHumanReview(context.protocolId, context.variant, {
      status: 'queued',
      queuedAt: nowIso(),
      latestReviewedSpec: queueItem,
      latestReviewedSpecPath: queuePath,
      latestReviewedSpecMarkdownPath: markdownPath,
      livePatchSpecPath: liveHandoff.patchSpecPath,
      liveAdoptionPath: liveHandoff.adoptionPath,
      runnerQueuePolicy,
      contextRefs: [finalKnowledgeLayer.contextRef],
      claimRefs: [finalKnowledgeLayer.claimRef],
      assertionRefs: [finalKnowledgeLayer.assertionRef],
      evidenceRefs: [finalKnowledgeLayer.evidenceRef],
      knowledgeLayerPaths: finalKnowledgeLayer.paths,
    });
    return {
      success: true,
      status: 'queued',
      queueItem,
      queuePath,
      markdownPath,
      patchSpecPath: liveHandoff.patchSpecPath,
      adoptionPath: liveHandoff.adoptionPath,
      reviewPath: updated,
    };
  }

  /**
   * Generate a draft patch spec for the inner loop without writing to the
   * executable queue. The draft lives under `human-review/.../inner-loop/drafts/`
   * so the executable Foundry queue stays clean until the human submits.
   */
  async synthesizeDraftSpec(input: {
    protocolId: string;
    variant: string;
    humanInstruction: string;
  }): Promise<{ draftId: string; draftPath: string; reviewedSpec: StructuredReviewedSpec; modelText: string }> {
    const { context } = await this.getReviewContext(input.protocolId, input.variant);
    const instruction = input.humanInstruction.trim();
    if (!instruction) throw new Error('humanInstruction is required for inner-loop draft synthesis');
    const prompt = [
      'Create exactly one DRAFT Protocol Foundry implementation spec as YAML for the inner-loop iteration.',
      'Preserve the data-first rule: if YAML/schema/registry/fixture data can solve it, choose that over code.',
      'If code is required, explain why data/config is insufficient.',
      'The spec must be narrow enough for one local coder session and must include evidence citations, graph anchors, semantic layer classification, write set, tests, and expected artifact delta.',
      'Use these top-level keys: title, fixClass, rationale, ownedFiles, acceptance, dataFirstDisposition, semanticLayer, evidenceCitations, graphAnchors, ontologyBackfillNeeds, tests, expectedArtifactDelta.',
      'Do not include recommendations for unrelated protocols or variants.',
      '',
      `Human inner-loop prompt: ${instruction}`,
    ].join('\n');
    const modelText = await this.callReviewModel(prompt, context, []);
    const draftId = innerLoopDraftId(context.protocolId, context.variant);
    const reviewedSpec = normalizeReviewedSpec({ id: draftId, modelText, context });
    const dir = innerLoopDraftDir(this.options.artifactRoot, context.protocolId, context.variant);
    await mkdir(dir, { recursive: true });
    const draftPath = join(dir, `${draftId}.yaml`);
    await writeYamlFile(draftPath, {
      kind: 'protocol-foundry-patch-spec',
      id: draftId,
      source: 'human-reviewed-foundry-spec-draft',
      generated_at: nowIso(),
      protocolId: context.protocolId,
      variant: context.variant,
      fixClass: reviewedSpec.fixClass,
      title: reviewedSpec.title,
      rationale: reviewedSpec.rationale,
      ownedFiles: reviewedSpec.ownedFiles,
      acceptance: reviewedSpec.acceptance,
      dataFirstDisposition: reviewedSpec.dataFirstDisposition,
      semanticLayer: reviewedSpec.semanticLayer,
      evidenceCitations: reviewedSpec.evidenceCitations,
      graphAnchors: reviewedSpec.graphAnchors,
      ontologyBackfillNeeds: reviewedSpec.ontologyBackfillNeeds,
      tests: reviewedSpec.tests,
      expectedArtifactDelta: reviewedSpec.expectedArtifactDelta,
      humanInstruction: instruction,
      reviewedSpec,
      reviewedSpecText: modelText,
      draft: true,
    });
    await this.updateHumanReview(context.protocolId, context.variant, {
      status: 'reviewing',
      latestDraftSpec: {
        id: draftId,
        draftPath,
        title: reviewedSpec.title,
        fixClass: reviewedSpec.fixClass,
        generatedAt: nowIso(),
        humanInstruction: instruction,
      },
    });
    return { draftId, draftPath, reviewedSpec, modelText };
  }

  /**
   * Promote a previously generated inner-loop draft to the executable Foundry
   * queue. Mirrors the write side of `synthesizeSpec` (queue, patch-specs,
   * adoption, knowledge layer, human-review status) without re-invoking the
   * review model.
   */
  async promoteDraftSpec(input: {
    protocolId: string;
    variant: string;
    draftId: string;
  }): Promise<FoundryDraftPromoteResponse> {
    const { context } = await this.getReviewContext(input.protocolId, input.variant);
    const draftPath = join(
      innerLoopDraftDir(this.options.artifactRoot, context.protocolId, context.variant),
      `${input.draftId}.yaml`,
    );
    if (!existsSync(draftPath)) throw new Error(`Draft spec not found at ${draftPath}`);
    const draftRecord = asRecord(await readYamlFile(draftPath));
    const reviewedSpecRaw = asRecord(draftRecord['reviewedSpec']);
    const modelText = typeof draftRecord['reviewedSpecText'] === 'string' ? draftRecord['reviewedSpecText'] : '';
    const humanInstruction = typeof draftRecord['humanInstruction'] === 'string' ? draftRecord['humanInstruction'] : '';
    const id = queueSpecId(context.protocolId, context.variant);
    const reviewedSpec: StructuredReviewedSpec = {
      id,
      title: firstString(reviewedSpecRaw['title']) ?? `Promoted Foundry draft ${input.draftId}`,
      fixClass: firstString(reviewedSpecRaw['fixClass']) ?? 'unknown',
      rationale: firstString(reviewedSpecRaw['rationale']) ?? '',
      ownedFiles: Array.isArray(reviewedSpecRaw['ownedFiles']) ? (reviewedSpecRaw['ownedFiles'] as string[]) : [],
      acceptance: Array.isArray(reviewedSpecRaw['acceptance']) ? (reviewedSpecRaw['acceptance'] as string[]) : [],
      dataFirstDisposition: firstString(reviewedSpecRaw['dataFirstDisposition']) ?? '',
      semanticLayer: firstString(reviewedSpecRaw['semanticLayer']) ?? '',
      evidenceCitations: Array.isArray(reviewedSpecRaw['evidenceCitations']) ? (reviewedSpecRaw['evidenceCitations'] as string[]) : [],
      graphAnchors: Array.isArray(reviewedSpecRaw['graphAnchors']) ? (reviewedSpecRaw['graphAnchors'] as string[]) : [],
      ontologyBackfillNeeds: Array.isArray(reviewedSpecRaw['ontologyBackfillNeeds']) ? (reviewedSpecRaw['ontologyBackfillNeeds'] as string[]) : [],
      tests: Array.isArray(reviewedSpecRaw['tests']) ? (reviewedSpecRaw['tests'] as string[]) : [],
      expectedArtifactDelta: Array.isArray(reviewedSpecRaw['expectedArtifactDelta']) ? (reviewedSpecRaw['expectedArtifactDelta'] as string[]) : [],
      rawModelSpec: reviewedSpecRaw,
      rawText: modelText,
    };
    const queueDir = reviewedSpecDir(this.options.artifactRoot, context.protocolId, context.variant);
    const queuePath = join(queueDir, `${id}.yaml`);
    const markdownPath = join(queueDir, `${id}.md`);
    const runnerQueuePolicy = buildRunnerQueuePolicy();
    const knowledgeLayer = await writeKnowledgeLayerBundle({
      artifactRoot: this.options.artifactRoot,
      workspaceRoot: this.options.workspaceRoot,
      context,
      reviewedSpec,
      queuePath,
    });
    const queueItem = {
      kind: 'protocol-foundry-reviewed-spec',
      id,
      status: 'queued',
      generatedAt: nowIso(),
      protocolId: context.protocolId,
      variant: context.variant,
      source: {
        reviewManifest: rel(this.options.workspaceRoot, reviewPath(this.options.artifactRoot, context.protocolId, context.variant)),
        artifactRefs: context.artifactRefs,
        draftSpecPath: rel(this.options.workspaceRoot, draftPath),
      },
      semanticContract: context.semanticContract,
      semantic: context.semantic,
      knowledgeLayer: {
        contextRefs: [knowledgeLayer.contextRef],
        claimRefs: [knowledgeLayer.claimRef],
        assertionRefs: [knowledgeLayer.assertionRef],
        evidenceRefs: [knowledgeLayer.evidenceRef],
        paths: knowledgeLayer.paths,
      },
      humanInstruction,
      reviewedSpec,
      reviewedSpecText: modelText,
      routing: {
        queue: runnerQueuePolicy.executableQueue,
        defaultCoderLane: context.semantic.fixClassification === 'compiler' || context.semantic.fixClassification === 'mixed' ? 'senior' : 'fast',
      },
      runnerQueuePolicy,
      promotedFromDraft: input.draftId,
    };
    await writeYamlFile(queuePath, queueItem);
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, `# ${id}\n\nPromoted from inner-loop draft ${input.draftId}.\n\n${modelText}\n`, 'utf-8');
    await writeYamlFile(join(queueDir, 'index.yaml'), {
      kind: 'protocol-foundry-reviewed-spec-bundle',
      protocolId: context.protocolId,
      variant: context.variant,
      updatedAt: nowIso(),
      specs: [{ id, path: queuePath, markdownPath, status: 'queued' }],
      runnerQueuePolicy,
    });
    const liveHandoff = await writeLiveFoundryPatchSpec({
      artifactRoot: this.options.artifactRoot,
      workspaceRoot: this.options.workspaceRoot,
      id,
      reviewedSpec,
      context,
      queuePath,
      markdownPath,
      humanInstruction,
      knowledgeLayer,
      runnerQueuePolicy,
    });
    const finalKnowledgeLayer = await writeKnowledgeLayerBundle({
      artifactRoot: this.options.artifactRoot,
      workspaceRoot: this.options.workspaceRoot,
      context,
      reviewedSpec,
      queuePath,
      patchSpecPath: liveHandoff.patchSpecPath,
    });
    const updated = await this.updateHumanReview(context.protocolId, context.variant, {
      status: 'queued',
      queuedAt: nowIso(),
      latestReviewedSpec: queueItem,
      latestReviewedSpecPath: queuePath,
      latestReviewedSpecMarkdownPath: markdownPath,
      livePatchSpecPath: liveHandoff.patchSpecPath,
      liveAdoptionPath: liveHandoff.adoptionPath,
      runnerQueuePolicy,
      contextRefs: [finalKnowledgeLayer.contextRef],
      claimRefs: [finalKnowledgeLayer.claimRef],
      assertionRefs: [finalKnowledgeLayer.assertionRef],
      evidenceRefs: [finalKnowledgeLayer.evidenceRef],
      knowledgeLayerPaths: finalKnowledgeLayer.paths,
      promotedDraftId: input.draftId,
    });
    return {
      success: true,
      status: 'queued',
      queuePath,
      patchSpecPath: liveHandoff.patchSpecPath,
      adoptionPath: liveHandoff.adoptionPath,
      reviewPath: updated,
    };
  }

  /**
   * Tight inner-loop iteration: prompt → draft spec → coder patch →
   * recompile → diff. Writes a durable trace and returns it.
   *
   * Critic is intentionally skipped by default to keep latency tight; pass
   * `options.runCritic=true` to enable it (not implemented yet — recorded on
   * the trace as `criticInvoked` for future wiring).
   */
  async runInnerLoop(input: {
    protocolId: string;
    variant: string;
    prompt: string;
    repoRoot?: string;
    runCritic?: boolean;
    onProgress?: (event: {
      stage: 'snapshotting' | 'synthesizing' | 'applying' | 'recompiling' | 'diffing';
      message?: string;
    }) => void;
  }): Promise<FoundryInnerLoopResponse> {
    const progress = input.onProgress ?? (() => {});
    const startedAt = Date.now();
    const variant = normalizeVariant(input.variant);
    if (!variant) throw new Error(`Unknown Foundry variant '${input.variant}'`);
    const prompt = input.prompt?.trim();
    if (!prompt) throw new Error('prompt is required for inner-loop iteration');
    const protocolId = input.protocolId;
    const traceId = innerLoopTraceId(protocolId, variant);
    const dir = innerLoopDir(this.options.artifactRoot, protocolId, variant);
    await mkdir(dir, { recursive: true });
    const tracePath = join(dir, `${traceId}.yaml`);
    const beforeEventGraphPath = join(dir, `${traceId}.before.yaml`);

    const writeFailureTrace = async (
      message: string,
      partial?: Partial<FoundryInnerLoopTrace>,
    ): Promise<FoundryInnerLoopResponse> => {
      const failed: FoundryInnerLoopTrace = {
        kind: 'protocol-foundry-review-inner-loop-trace',
        id: traceId,
        protocolId,
        variant,
        generatedAt: nowIso(),
        prompt,
        draftSpec: partial?.draftSpec ?? { id: 'unknown', draftPath: '', title: '', fixClass: 'unknown' },
        status: 'failed',
        error: message,
        durationMs: Date.now() - startedAt,
        criticInvoked: Boolean(input.runCritic),
        ...(partial ?? {}),
      };
      await writeYamlFile(tracePath, failed);
      await this.appendInnerLoopIndex(protocolId, variant, failed, tracePath);
      return { success: true, trace: failed, tracePath };
    };

    progress({ stage: 'snapshotting' });
    // Snapshot the prior event-graph YAML so the diff has a stable "before".
    const ledger = await loadOrCreateFoundryLedger(this.options.artifactRoot);
    const protocol = ledger.protocol_status[protocolId];
    if (!protocol) return writeFailureTrace(`Unknown Foundry protocol '${protocolId}'`);
    const item = protocol.variants[variant];
    if (!item || !item.artifacts.eventGraph) {
      return writeFailureTrace('No prior event-graph artifact to diff against.');
    }
    const beforeRaw = await readFile(item.artifacts.eventGraph, 'utf-8');
    await writeFile(beforeEventGraphPath, beforeRaw, 'utf-8');
    const beforeEvents = eventsFromEventGraphYaml(YAML.parse(beforeRaw));

    progress({ stage: 'synthesizing' });
    let draftSpec: FoundryInnerLoopTrace['draftSpec'];
    try {
      const synth = await this.synthesizeDraftSpec({ protocolId, variant, humanInstruction: prompt });
      draftSpec = {
        id: synth.draftId,
        draftPath: synth.draftPath,
        title: synth.reviewedSpec.title,
        fixClass: synth.reviewedSpec.fixClass,
      };
    } catch (err) {
      return writeFailureTrace(`Draft synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    progress({ stage: 'applying' });
    const repoRoot = input.repoRoot ?? this.options.workspaceRoot;
    let coderResult: FoundryCoderPatchResult | undefined;
    try {
      coderResult = await runFoundryCoderPatch({
        artifactRoot: this.options.artifactRoot,
        repoRoot,
        protocolId,
        variant,
        forcedSpecPath: draftSpec.draftPath,
        attempt: 1,
        coderRole: 'junior',
      });
    } catch (err) {
      return writeFailureTrace(
        `Coder run failed: ${err instanceof Error ? err.message : String(err)}`,
        { draftSpec },
      );
    }

    const coder: NonNullable<FoundryInnerLoopTrace['coder']> = {
      status: coderResult.status,
      ...(coderResult.message ? { message: coderResult.message } : {}),
      ...(coderResult.touchedFiles ? { touchedFiles: coderResult.touchedFiles } : {}),
      ...(coderResult.resultPath ? { resultPath: coderResult.resultPath } : {}),
    };

    let recompile: FoundryInnerLoopTrace['recompile'];
    let diff: FoundryInnerLoopTrace['diff'];
    if (coderResult.status === 'applied') {
      progress({ stage: 'recompiling' });
      try {
        const summary = await runProtocolFoundryCompile({
          artifactRoot: this.options.artifactRoot,
          segmentPath: protocol.segmentPath,
          ...(protocol.materialContextPath ? { materialContextPath: protocol.materialContextPath } : {}),
          protocolId,
          variants: [variant],
        });
        const variantSummary = summary.variants[0];
        if (variantSummary) {
          recompile = {
            outcome: variantSummary.outcome,
            eventCount: variantSummary.eventCount,
            eventGraphPath: variantSummary.eventGraphArtifact,
            beforeEventGraphPath,
          };
          const afterRaw = await readFile(variantSummary.eventGraphArtifact, 'utf-8');
          const afterEvents = eventsFromEventGraphYaml(YAML.parse(afterRaw));
          progress({ stage: 'diffing' });
          diff = diffEventGraphs(beforeEvents, afterEvents);
        }
      } catch (err) {
        return writeFailureTrace(
          `Recompile failed: ${err instanceof Error ? err.message : String(err)}`,
          { draftSpec, coder },
        );
      }
    }

    const trace: FoundryInnerLoopTrace = {
      kind: 'protocol-foundry-review-inner-loop-trace',
      id: traceId,
      protocolId,
      variant,
      generatedAt: nowIso(),
      prompt,
      draftSpec,
      coder,
      ...(recompile ? { recompile } : {}),
      ...(diff ? { diff } : {}),
      durationMs: Date.now() - startedAt,
      status: 'completed',
      criticInvoked: Boolean(input.runCritic),
    };
    await writeYamlFile(tracePath, trace);
    await this.appendInnerLoopIndex(protocolId, variant, trace, tracePath);
    let assertionRef: Record<string, unknown> | undefined;
    try {
      const { context } = await this.getReviewContext(protocolId, variant);
      const written = await writeInnerLoopAssertion({
        artifactRoot: this.options.artifactRoot,
        workspaceRoot: this.options.workspaceRoot,
        context,
        trace,
        tracePath,
      });
      assertionRef = written.assertionRef;
    } catch {
      // Best-effort knowledge layer; failure should not block the trace write.
    }
    await this.updateHumanReview(protocolId, variant, {
      lastInnerLoopAt: trace.generatedAt,
      lastInnerLoopTraceId: traceId,
      lastInnerLoopTracePath: rel(this.options.workspaceRoot, tracePath),
      ...(assertionRef ? { lastInnerLoopAssertionRef: assertionRef } : {}),
    });
    return { success: true, trace, tracePath };
  }

  private async appendInnerLoopIndex(
    protocolId: string,
    variant: FoundryVariant,
    trace: FoundryInnerLoopTrace,
    tracePath: string,
  ): Promise<void> {
    const dir = innerLoopDir(this.options.artifactRoot, protocolId, variant);
    const indexPath = join(dir, 'index.yaml');
    const existing = asRecord(await readYamlFile(indexPath));
    const traces = Array.isArray(existing['traces']) ? [...existing['traces'] as unknown[]] : [];
    traces.unshift({
      id: trace.id,
      path: rel(this.options.workspaceRoot, tracePath),
      status: trace.status,
      generatedAt: trace.generatedAt,
      ...(trace.draftSpec.id ? { draftId: trace.draftSpec.id } : {}),
      ...(trace.coder?.status ? { coderStatus: trace.coder.status } : {}),
      ...(trace.recompile?.outcome ? { recompileOutcome: trace.recompile.outcome } : {}),
    });
    await writeYamlFile(indexPath, {
      kind: 'protocol-foundry-review-inner-loop-index',
      protocolId,
      variant,
      updatedAt: nowIso(),
      traces,
    });
  }

  async reject(input: {
    protocolId: string;
    variant: string;
    reason?: string;
    reasonClass?: FoundryRejectionReasonClass;
  }): Promise<FoundryRejectResponse> {
    const variant = normalizeVariant(input.variant);
    if (!variant) throw new Error(`Unknown Foundry variant '${input.variant}'`);
    const reason = input.reason?.trim() || 'Rejected by human reviewer';
    const reasonClass: FoundryRejectionReasonClass = input.reasonClass ?? 'other';
    const rejectedAt = nowIso();
    let knowledgeRefs: RejectionKnowledgeRecords | undefined;
    try {
      const { context } = await this.getReviewContext(input.protocolId, variant);
      knowledgeRefs = await writeRejectionKnowledgeRecords({
        artifactRoot: this.options.artifactRoot,
        workspaceRoot: this.options.workspaceRoot,
        context,
        reason,
        reasonClass,
        rejectedAt,
      });
    } catch {
      // Best-effort knowledge layer: a missing review context should not
      // block the rejection from persisting.
    }
    const path = await this.updateHumanReview(input.protocolId, variant, {
      status: 'rejected',
      rejectedAt,
      rejection: {
        reason,
        reasonClass,
        dataFirstDisposition: 'No queue item should be generated for this protocol/variant unless reopened.',
        ...(knowledgeRefs
          ? {
              knowledgeLayer: {
                claimRef: knowledgeRefs.claimRef,
                evidenceRef: knowledgeRefs.evidenceRef,
              },
            }
          : {}),
      },
    });
    return { success: true, status: 'rejected', reviewPath: path, rejectedAt, reason, reasonClass };
  }

  async reopen(input: { protocolId: string; variant: string; reason?: string }): Promise<FoundryReopenResponse> {
    const variant = normalizeVariant(input.variant);
    if (!variant) throw new Error(`Unknown Foundry variant '${input.variant}'`);
    const reason = input.reason?.trim() || 'Reopened by human reviewer';
    const reopenedAt = nowIso();
    const existing = asRecord(await readYamlFile(reviewPath(this.options.artifactRoot, input.protocolId, variant)));
    const previousStatus = firstString(existing['status']) ?? 'unknown';
    const existingHistory = Array.isArray(existing['reopenHistory'])
      ? existing['reopenHistory']
      : [];
    const path = await this.updateHumanReview(input.protocolId, variant, {
      status: 'reviewing',
      reopenedAt,
      reopen: {
        reason,
        previousStatus,
        dataFirstDisposition: 'Keep the earlier rejection as audit data while returning this protocol/variant to human review.',
      },
      reopenHistory: [
        ...existingHistory,
        {
          reopenedAt,
          reason,
          previousStatus,
        },
      ],
    });
    return { success: true, status: 'reviewing', reviewPath: path, reopenedAt, reason };
  }

  private async updateHumanReview(protocolId: string, variant: FoundryVariant, patch: Record<string, unknown>): Promise<string> {
    const path = reviewPath(this.options.artifactRoot, protocolId, variant);
    const existing = asRecord(await readYamlFile(path));
    await writeYamlFile(path, {
      kind: 'protocol-foundry-human-review',
      protocolId,
      variant,
      createdAt: firstString(existing['createdAt']) ?? nowIso(),
      ...existing,
      ...patch,
      updatedAt: nowIso(),
      semanticContract: buildSemanticContract(),
    });
    return path;
  }

  private chatConfig(): ChatConfig {
    return {
      baseUrl: this.options.chatConfig?.baseUrl
        ?? process.env['FOUNDRY_REVIEW_BASE_URL']
        ?? process.env['PI_ARCHITECT_BASE_URL']
        ?? DEFAULT_REVIEW_BASE_URL,
      model: this.options.chatConfig?.model
        ?? process.env['FOUNDRY_REVIEW_MODEL']
        ?? process.env['PI_ARCHITECT_MODEL']
        ?? DEFAULT_REVIEW_MODEL,
      ...(this.options.chatConfig?.apiKey ? { apiKey: this.options.chatConfig.apiKey } : {}),
      temperature: this.options.chatConfig?.temperature ?? 0.2,
      maxTokens: this.options.chatConfig?.maxTokens ?? 4096,
    };
  }

  private async callReviewModel(
    prompt: string,
    context: FoundryReviewContext,
    history: ConversationHistoryMessage[],
  ): Promise<string> {
    const config = this.chatConfig();
    const system = [
      'You are the computable-lab Protocol Foundry human-review agent.',
      'Review exactly one protocol PDF/variant. Do not use or infer context from other protocols.',
      'Compare source evidence, material/labware context, compiler artifacts, event graph, browser evidence, and architect specs.',
      'Everything that can be data should be data: prefer YAML/schema/registry/fixture changes over hard-coded compiler logic when possible.',
      'Preserve semantics: be ontology-aware, distinguish material/material-spec/vendor-product/instances/aliquots/labware definitions/labware instances, and cite evidence.',
      'When asked for a spec, produce one narrow implementable spec with evidence citations, graph anchors, data-first assessment, write set, tests, and expected artifact delta.',
    ].join('\n');
    const messages = [
      { role: 'system', content: system },
      ...history.map((message) => ({ role: message.role, content: message.content })),
      {
        role: 'user',
        content: [
          prompt,
          '',
          'Exact review context YAML:',
          YAML.stringify(context),
        ].join('\n'),
      },
    ];
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Foundry review model failed (${response.status}): ${text || response.statusText}`);
    }
    const data = asRecord(await response.json());
    const choice = asRecord((Array.isArray(data['choices']) ? data['choices'] : [])[0]);
    const message = asRecord(choice['message']);
    return firstString(message['content'], message['reasoning'], message['reasoning_content']) ?? '';
  }
}
