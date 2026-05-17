import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  asRecord,
  nowIso,
  readYamlFile,
  writeYamlFile,
  type FoundryLedger,
  type FoundryVariantLedger,
} from './FoundryArtifacts.js';
import { FOUNDRY_VARIANTS, type FoundryVariant } from './ProtocolFoundryCompileRunner.js';

export interface FoundryArtifactRef {
  path: string;
  exists: boolean;
  status?: string;
  missingReason?: string;
}

export interface FoundryVariantManifest {
  kind: 'protocol-foundry-variant-manifest';
  protocolId: string;
  variant: FoundryVariant;
  generated_at: string;
  status: string;
  metrics: FoundryVariantLedger['metrics'];
  artifacts: Record<string, FoundryArtifactRef | FoundryArtifactRef[] | undefined>;
  missingArtifacts: Array<{ key: string; reason: string }>;
  humanReview: {
    status: string;
    reviewPath?: string;
    queuedSpecPath?: string;
    livePatchSpecPath?: string;
    knowledgeLayerPaths?: unknown;
  };
  nextActions: string[];
}

export interface FoundryManifestIndex {
  kind: 'protocol-foundry-manifest-index';
  generated_at: string;
  artifactRoot: string;
  protocolCount: number;
  variantCount: number;
  manifests: Array<{
    protocolId: string;
    variant: FoundryVariant;
    status: string;
    path: string;
    missingArtifactCount: number;
    humanReviewStatus: string;
  }>;
}

export interface FoundryOperationalStatus {
  kind: 'protocol-foundry-operational-status';
  generated_at: string;
  artifactRoot: string;
  protocolCount: number;
  variantCount: number;
  loop: FoundryLoopRuntimeStatus;
  counts: {
    collected: number;
    extractedText: number;
    compiled: number;
    architectReviewed: number;
    awaitingHumanReview: number;
    reviewing: number;
    queued: number;
    patching: number;
    implemented: number;
    rejected: number;
    failed: number;
  };
  latestErrors: Array<{
    protocolId: string;
    variant: FoundryVariant;
    category: string;
    message: string;
    artifact?: string;
  }>;
  nextTasks: Array<{ protocolId: string; variant: FoundryVariant; stage: string }>;
}

export interface FoundryLoopRuntimeRecord {
  kind: 'protocol-foundry-loop-runtime';
  artifactRoot: string;
  repoRoot: string;
  pid: number;
  startedAt: string;
  updatedAt: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  args: string[];
  command: string;
  logPath?: string;
  completedAt?: string;
  error?: string;
}

export interface FoundryLoopRuntimeStatus {
  metadataPath: string;
  running: boolean;
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'missing' | 'stale';
  pid?: number;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  logPath?: string;
  command?: string;
  error?: string;
}

function rel(root: string, path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith(root) ? relative(root, path) : path;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function loopRuntimePath(root: string): string {
  return join(root, 'manifests', 'loop-runtime.yaml');
}

function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? (err as { code?: unknown }).code : undefined;
    return code === 'EPERM';
  }
}

export async function writeFoundryLoopRuntimeStart(input: {
  artifactRoot: string;
  repoRoot: string;
  args: string[];
  logPath?: string;
}): Promise<FoundryLoopRuntimeRecord> {
  const now = nowIso();
  const record: FoundryLoopRuntimeRecord = {
    kind: 'protocol-foundry-loop-runtime',
    artifactRoot: input.artifactRoot,
    repoRoot: input.repoRoot,
    pid: process.pid,
    startedAt: now,
    updatedAt: now,
    status: 'running',
    args: input.args,
    command: ['protocolFoundryLoop.ts', ...input.args].join(' '),
    ...(input.logPath ? { logPath: input.logPath } : {}),
  };
  await writeYamlFile(loopRuntimePath(input.artifactRoot), record);
  return record;
}

export async function writeFoundryLoopRuntimeStop(
  artifactRoot: string,
  status: 'completed' | 'failed' | 'stopped',
  error?: string,
): Promise<void> {
  const path = loopRuntimePath(artifactRoot);
  const existing = asRecord(await readYamlFile(path));
  const completedAt = nowIso();
  await writeYamlFile(path, {
    kind: 'protocol-foundry-loop-runtime',
    ...existing,
    artifactRoot,
    pid: typeof existing['pid'] === 'number' ? existing['pid'] : process.pid,
    status,
    updatedAt: completedAt,
    completedAt,
    ...(error ? { error } : {}),
  });
}

export async function readFoundryLoopRuntimeStatus(artifactRoot: string): Promise<FoundryLoopRuntimeStatus> {
  const path = loopRuntimePath(artifactRoot);
  const metadataPath = rel(artifactRoot, path) ?? path;
  const record = asRecord(await readYamlFile(path));
  if (Object.keys(record).length === 0) {
    return {
      metadataPath,
      running: false,
      status: 'missing',
    };
  }
  const pid = typeof record['pid'] === 'number' ? record['pid'] : Number(record['pid']);
  const running = isProcessRunning(pid);
  const recordedStatus = firstString(record['status']);
  const status: FoundryLoopRuntimeStatus['status'] = running
    ? 'running'
    : recordedStatus === 'completed' || recordedStatus === 'failed' || recordedStatus === 'stopped'
      ? recordedStatus
      : 'stale';
  const startedAt = firstString(record['startedAt']);
  const updatedAt = firstString(record['updatedAt']);
  const completedAt = firstString(record['completedAt']);
  const logPath = firstString(record['logPath']);
  const command = firstString(record['command']);
  const error = firstString(record['error']);
  return {
    metadataPath,
    running,
    status,
    ...(Number.isInteger(pid) ? { pid } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(logPath ? { logPath } : {}),
    ...(command ? { command } : {}),
    ...(error ? { error } : {}),
  };
}

async function artifactStatus(path: string | undefined): Promise<string | undefined> {
  if (!path || !existsSync(path)) return undefined;
  if (!/\.ya?ml$/i.test(path)) return 'present';
  const data = asRecord(await readYamlFile(path));
  const status = data['status'];
  if (typeof status === 'string') return status;
  const outcome = data['outcome'];
  if (typeof outcome === 'string') return outcome;
  const accepted = data['accepted'];
  if (typeof accepted === 'boolean') return accepted ? 'accepted' : 'gap';
  return 'present';
}

async function ref(root: string, path: string | undefined, missingReason: string): Promise<FoundryArtifactRef | undefined> {
  if (!path) return undefined;
  const exists = existsSync(path);
  const item: FoundryArtifactRef = {
    path: rel(root, path) ?? path,
    exists,
  };
  if (exists) {
    const status = await artifactStatus(path);
    if (status) item.status = status;
  } else {
    item.missingReason = missingReason;
  }
  return item;
}

function reviewPath(root: string, protocolId: string, variant: FoundryVariant): string {
  return join(root, 'human-review', protocolId, variant, 'review.yaml');
}

function pdfPath(root: string, protocolId: string): string {
  return join(root, 'pdfs', `${protocolId}.pdf`);
}

function pdfSidecarPath(root: string, protocolId: string): string {
  return join(root, 'pdfs', `${protocolId}.pdf.procurement.yaml`);
}

function textPath(root: string, protocolId: string): string {
  return join(root, 'text', `${protocolId}.txt`);
}

function humanReviewStatus(review: Record<string, unknown>): string {
  const status = review['status'];
  return typeof status === 'string' ? status : 'unreviewed';
}

function missing(entries: Record<string, FoundryArtifactRef | FoundryArtifactRef[] | undefined>): Array<{ key: string; reason: string }> {
  const out: Array<{ key: string; reason: string }> = [];
  for (const [key, value] of Object.entries(entries)) {
    if (!value) {
      out.push({ key, reason: 'artifact reference not present in ledger or convention' });
      continue;
    }
    const refs = Array.isArray(value) ? value : [value];
    if (refs.length === 0) out.push({ key, reason: 'artifact list is empty' });
    for (const item of refs) {
      if (!item.exists) out.push({ key, reason: item.missingReason ?? 'artifact file missing' });
    }
  }
  return out;
}

function nextActions(input: {
  variant: FoundryVariantLedger;
  reviewStatus: string;
  missingArtifacts: Array<{ key: string; reason: string }>;
}): string[] {
  const actions: string[] = [];
  const artifactKeys = new Set(input.missingArtifacts.map((item) => item.key));
  if (artifactKeys.has('extractedText') || artifactKeys.has('segment')) actions.push('Run or repair PDF extraction/pre-compile artifacts.');
  if (artifactKeys.has('compiler') || artifactKeys.has('eventGraph')) actions.push('Run compiler/rerun for this protocol variant.');
  if (artifactKeys.has('architectVerdict')) actions.push('Run architect review to produce a focused patch spec.');
  if (input.reviewStatus === 'unreviewed' && input.variant.artifacts.architectVerdict) actions.push('Open in Protocol IDE Foundry inbox for human/AI review.');
  if (input.reviewStatus === 'queued') actions.push('Run Foundry coder/critic loop for queued reviewed spec.');
  if (input.reviewStatus === 'rejected') actions.push('No action unless a human reopens this review.');
  if (input.variant.artifacts.patchFailure) actions.push('Inspect patch failure and decide whether to revise or reject.');
  return actions.length > 0 ? actions : ['No immediate action inferred.'];
}

export async function buildFoundryVariantManifest(
  ledger: FoundryLedger,
  protocolId: string,
  variantName: FoundryVariant,
): Promise<FoundryVariantManifest> {
  const root = ledger.artifact_root;
  const protocol = ledger.protocol_status[protocolId];
  if (!protocol) throw new Error(`unknown protocol ${protocolId}`);
  const variant = protocol.variants[variantName];
  if (!variant) throw new Error(`unknown variant ${variantName} for ${protocolId}`);
  const review = asRecord(await readYamlFile(reviewPath(root, protocolId, variantName)));
  const patchSpecs = await Promise.all((variant.artifacts.patchSpecs ?? []).map((path) => ref(root, path, 'patch spec file missing')));
  const artifacts: FoundryVariantManifest['artifacts'] = {
    pdf: await ref(root, pdfPath(root, protocolId), 'source PDF not found'),
    pdfMetadata: await ref(root, pdfSidecarPath(root, protocolId), 'PDF provenance sidecar not found'),
    extractedText: await ref(root, textPath(root, protocolId), 'extracted text not found'),
    segment: await ref(root, protocol.segmentPath, 'segment YAML not found'),
    materialContext: await ref(root, protocol.materialContextPath, 'material context YAML not found'),
    compiler: await ref(root, variant.artifacts.compiler, 'compiler output not found'),
    eventGraph: await ref(root, variant.artifacts.eventGraph, 'event graph not found'),
    executionScale: await ref(root, variant.artifacts.executionScale, 'execution scale plan not found'),
    browserReport: await ref(root, variant.artifacts.browserReport, 'browser review report not found'),
    architectVerdict: await ref(root, variant.artifacts.architectVerdict, 'architect verdict not found'),
    patchSpecs: patchSpecs.filter((item): item is FoundryArtifactRef => Boolean(item)),
    adoptionDecision: await ref(root, variant.artifacts.adoptionDecision, 'patch adoption decision not found'),
    coderPatch: await ref(root, variant.artifacts.coderPatch, 'coder patch result not found'),
    criticReport: await ref(root, variant.artifacts.criticReport, 'critic report not found'),
    rerunReport: await ref(root, variant.artifacts.rerunReport, 'rerun report not found'),
  };
  const missingArtifacts = missing(artifacts);
  const reviewStatus = humanReviewStatus(review);
  const humanReview: FoundryVariantManifest['humanReview'] = { status: reviewStatus };
  const humanReviewPath = rel(root, reviewPath(root, protocolId, variantName));
  if (humanReviewPath) humanReview.reviewPath = humanReviewPath;
  if (typeof review['latestReviewedSpecPath'] === 'string') {
    const queuedSpecPath = rel(root, review['latestReviewedSpecPath']);
    if (queuedSpecPath) humanReview.queuedSpecPath = queuedSpecPath;
  }
  if (typeof review['livePatchSpecPath'] === 'string') {
    const livePatchSpecPath = rel(root, review['livePatchSpecPath']);
    if (livePatchSpecPath) humanReview.livePatchSpecPath = livePatchSpecPath;
  }
  if (review['knowledgeLayerPaths'] !== undefined) humanReview.knowledgeLayerPaths = review['knowledgeLayerPaths'];
  return {
    kind: 'protocol-foundry-variant-manifest',
    protocolId,
    variant: variantName,
    generated_at: nowIso(),
    status: variant.status,
    metrics: variant.metrics,
    artifacts,
    missingArtifacts,
    humanReview,
    nextActions: nextActions({ variant, reviewStatus, missingArtifacts }),
  };
}

export async function writeFoundryManifests(ledger: FoundryLedger): Promise<FoundryManifestIndex> {
  const root = ledger.artifact_root;
  const manifests: FoundryManifestIndex['manifests'] = [];
  for (const protocolId of ledger.protocols) {
    for (const variant of FOUNDRY_VARIANTS) {
      const manifest = await buildFoundryVariantManifest(ledger, protocolId, variant);
      const path = join(root, 'manifests', protocolId, `${variant}.yaml`);
      await writeYamlFile(path, manifest);
      manifests.push({
        protocolId,
        variant,
        status: manifest.status,
        path: rel(root, path) ?? path,
        missingArtifactCount: manifest.missingArtifacts.length,
        humanReviewStatus: manifest.humanReview.status,
      });
    }
  }
  const index: FoundryManifestIndex = {
    kind: 'protocol-foundry-manifest-index',
    generated_at: nowIso(),
    artifactRoot: root,
    protocolCount: ledger.protocols.length,
    variantCount: manifests.length,
    manifests,
  };
  await writeYamlFile(join(root, 'manifests', 'index.yaml'), index);
  return index;
}

export async function loadFoundryVariantManifest(
  artifactRoot: string,
  protocolId: string,
  variant: FoundryVariant,
): Promise<FoundryVariantManifest | undefined> {
  return readYamlFile<FoundryVariantManifest>(join(artifactRoot, 'manifests', protocolId, `${variant}.yaml`));
}

function addError(
  errors: FoundryOperationalStatus['latestErrors'],
  protocolId: string,
  variant: FoundryVariant,
  category: string,
  message: string | undefined,
  artifact?: string,
): void {
  if (!message) return;
  errors.push({ protocolId, variant, category, message, ...(artifact ? { artifact } : {}) });
}

export async function buildFoundryOperationalStatus(
  ledger: FoundryLedger,
  nextTasks: Array<{ protocolId: string; variant: FoundryVariant; stage: string }> = [],
): Promise<FoundryOperationalStatus> {
  const counts: FoundryOperationalStatus['counts'] = {
    collected: 0,
    extractedText: 0,
    compiled: 0,
    architectReviewed: 0,
    awaitingHumanReview: 0,
    reviewing: 0,
    queued: 0,
    patching: 0,
    implemented: 0,
    rejected: 0,
    failed: 0,
  };
  const latestErrors: FoundryOperationalStatus['latestErrors'] = [];
  for (const protocolId of ledger.protocols) {
    if (existsSync(pdfPath(ledger.artifact_root, protocolId))) counts.collected += 1;
    if (existsSync(textPath(ledger.artifact_root, protocolId))) counts.extractedText += 1;
    for (const variantName of FOUNDRY_VARIANTS) {
      const item = ledger.protocol_status[protocolId]?.variants[variantName];
      if (!item) continue;
      if (item.artifacts.compiler) counts.compiled += 1;
      if (item.artifacts.architectVerdict) counts.architectReviewed += 1;
      if (item.status === 'running') counts.patching += 1;
      if (item.status === 'failed' || item.status === 'blocked' || item.status === 'stalled') counts.failed += 1;
      if (item.artifacts.criticReport || item.artifacts.rerunReport || item.status === 'accepted' || item.status === 'completed') counts.implemented += 1;
      const review = asRecord(await readYamlFile(reviewPath(ledger.artifact_root, protocolId, variantName)));
      const reviewStatus = humanReviewStatus(review);
      if (reviewStatus === 'unreviewed' && item.artifacts.architectVerdict) counts.awaitingHumanReview += 1;
      if (reviewStatus === 'reviewing') counts.reviewing += 1;
      if (reviewStatus === 'queued') counts.queued += 1;
      if (reviewStatus === 'rejected') counts.rejected += 1;
      if (item.failureReason) addError(latestErrors, protocolId, variantName, 'variant_failure', item.failureReason);
      const compiler = asRecord(await readYamlFile(item.artifacts.compiler ?? ''));
      const diagnostics = Array.isArray(compiler['diagnostics']) ? compiler['diagnostics'] : [];
      for (const diag of diagnostics.slice(-3)) {
        const record = asRecord(diag);
        const code = typeof record['code'] === 'string' ? record['code'] : 'compiler_diagnostic';
        const message = typeof record['message'] === 'string' ? record['message'] : code;
        addError(latestErrors, protocolId, variantName, code, message, rel(ledger.artifact_root, item.artifacts.compiler));
      }
    }
  }
  return {
    kind: 'protocol-foundry-operational-status',
    generated_at: nowIso(),
    artifactRoot: ledger.artifact_root,
    protocolCount: ledger.protocols.length,
    variantCount: ledger.protocols.length * FOUNDRY_VARIANTS.length,
    loop: await readFoundryLoopRuntimeStatus(ledger.artifact_root),
    counts,
    latestErrors: latestErrors.slice(-50),
    nextTasks,
  };
}

export async function writeFoundryOperationalStatus(
  ledger: FoundryLedger,
  nextTasks: Array<{ protocolId: string; variant: FoundryVariant; stage: string }> = [],
): Promise<FoundryOperationalStatus> {
  const status = await buildFoundryOperationalStatus(ledger, nextTasks);
  await writeYamlFile(join(ledger.artifact_root, 'manifests', 'status.yaml'), status);
  return status;
}
