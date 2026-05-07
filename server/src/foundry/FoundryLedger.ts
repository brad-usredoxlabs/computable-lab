import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import {
  asRecord,
  discoverProtocolInputs,
  emptyProtocolLedger,
  emptyVariantLedger,
  ledgerPath,
  nowIso,
  readYamlFile,
  type FoundryLedger,
  type FoundryProtocolInput,
  type FoundryProtocolLedger,
  type FoundryVariantLedger,
  type FoundryWorkStage,
  type FoundryWorkStatus,
  writeYamlFile,
} from './FoundryArtifacts.js';
import { FOUNDRY_VARIANTS, type FoundryVariant } from './ProtocolFoundryCompileRunner.js';

const DEFAULT_RUNNING_STALE_MS = 15 * 60 * 1000;
const DEFAULT_VARIANT_MAX_ATTEMPTS = 24;

export interface FoundryReadyTask {
  protocolId: string;
  variant: FoundryVariant;
  stage: FoundryWorkStage;
}

export interface MarkFoundryTaskInput {
  protocolId: string;
  variant: FoundryVariant;
  stage: FoundryWorkStage;
  status: FoundryWorkStatus;
  message?: string;
  artifacts?: Record<string, string | string[] | undefined>;
  metrics?: Record<string, number | undefined>;
}

function normalizeVariant(value: string): FoundryVariant | undefined {
  return (FOUNDRY_VARIANTS as readonly string[]).includes(value) ? value as FoundryVariant : undefined;
}

function protocolFromRaw(raw: Record<string, unknown>, input: FoundryProtocolInput): FoundryProtocolLedger {
  const protocol = emptyProtocolLedger(input);
  const status = raw['status'];
  if (typeof status === 'string') protocol.status = status as FoundryWorkStatus;
  const rawVariants = asRecord(raw['variants']);
  for (const variant of FOUNDRY_VARIANTS) {
    const current = asRecord(rawVariants[variant]);
    protocol.variants[variant] = {
      ...emptyVariantLedger(variant),
      ...current,
      variant,
      artifacts: { ...emptyVariantLedger(variant).artifacts, ...asRecord(current['artifacts']) },
      metrics: { ...emptyVariantLedger(variant).metrics, ...asRecord(current['metrics']) },
    } as FoundryVariantLedger;
  }
  return protocol;
}

async function loadExistingLedger(path: string): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {};
  const parsed = await readYamlFile<unknown>(path);
  return asRecord(parsed);
}

export async function loadOrCreateFoundryLedger(artifactRoot: string): Promise<FoundryLedger> {
  const path = ledgerPath(artifactRoot);
  const existing = await loadExistingLedger(path);
  const inputs = await discoverProtocolInputs(artifactRoot);
  const existingProtocolStatus = asRecord(existing['protocol_status']);
  const protocolStatus: Record<string, FoundryProtocolLedger> = {};

  for (const input of inputs) {
    protocolStatus[input.protocolId] = protocolFromRaw(asRecord(existingProtocolStatus[input.protocolId]), input);
  }

  const generatedAt = typeof existing['generated_at'] === 'string' ? existing['generated_at'] : nowIso();
  return {
    kind: 'protocol-foundry-stage-ledger',
    generated_at: generatedAt,
    updated_at: nowIso(),
    artifact_root: artifactRoot,
    protocols: inputs.map((input) => input.protocolId),
    protocol_status: protocolStatus,
    ...(Array.isArray(existing['stages']) ? { stages: existing['stages'] } : {}),
    ...(Array.isArray(existing['rules']) ? { rules: existing['rules'] } : {}),
  };
}

export async function saveFoundryLedger(ledger: FoundryLedger): Promise<void> {
  ledger.updated_at = nowIso();
  await writeYamlFile(ledgerPath(ledger.artifact_root), ledger);
}

function fileIfExists(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

function coderPatchResultStatus(path: string | undefined): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  try {
    const result = asRecord(YAML.parse(readFileSync(path, 'utf-8')));
    return typeof result['status'] === 'string' ? result['status'] : undefined;
  } catch {
    return undefined;
  }
}

function coderPatchIsTerminal(path: string | undefined): boolean {
  const status = coderPatchResultStatus(path);
  return status === 'applied' || status === 'needs-human';
}

function coderPatchNeedsArchitectRefresh(path: string | undefined): boolean {
  const status = coderPatchResultStatus(path);
  return status === 'needs-human' || status === 'failed';
}

function coderPatchNeedsRefresh(path: string | undefined): boolean {
  return coderPatchResultStatus(path) === 'stale';
}

function coderPatchIsSkipped(path: string | undefined): boolean {
  return coderPatchResultStatus(path) === 'skipped';
}

function adoptionStatus(path: string | undefined): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  try {
    const result = asRecord(YAML.parse(readFileSync(path, 'utf-8')));
    return typeof result['status'] === 'string' ? result['status'] : undefined;
  } catch {
    return undefined;
  }
}

function criticVerdict(path: string | undefined): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  try {
    const result = asRecord(YAML.parse(readFileSync(path, 'utf-8')));
    return typeof result['verdict'] === 'string' ? result['verdict'] : undefined;
  } catch {
    return undefined;
  }
}

function patchSpecPaths(artifactRoot: string, protocolId: string, variant: FoundryVariant): string[] {
  const dir = join(artifactRoot, 'patch-specs', protocolId, variant);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((file: string) => file.endsWith('.yaml') && file !== 'index.yaml')
      .sort()
      .map((file: string) => join(dir, file));
  } catch {
    return [];
  }
}

function variantMaxAttempts(): number {
  const parsed = Number(process.env['FOUNDRY_VARIANT_MAX_ATTEMPTS'] ?? DEFAULT_VARIANT_MAX_ATTEMPTS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_VARIANT_MAX_ATTEMPTS;
}

function stallReportPath(artifactRoot: string, protocolId: string, variant: FoundryVariant): string {
  return join(artifactRoot, 'stalled', protocolId, variant, 'stall.yaml');
}

async function writeStallReport(input: {
  artifactRoot: string;
  protocolId: string;
  variant: FoundryVariant;
  item: FoundryVariantLedger;
  maxAttempts: number;
}): Promise<string> {
  const path = stallReportPath(input.artifactRoot, input.protocolId, input.variant);
  if (existsSync(path)) return path;
  await writeYamlFile(path, {
    kind: 'protocol-foundry-stall-report',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    status: 'stalled',
    reason: `Variant reached ${input.item.attempt} attempts without reaching foundryComplete.`,
    maxAttempts: input.maxAttempts,
    attempt: input.item.attempt,
    metrics: input.item.metrics,
    artifacts: input.item.artifacts,
    nextAction: 'Move to the next variant/protocol; revisit after broader compiler improvements land.',
  });
  return path;
}

function shouldStallVariant(item: FoundryVariantLedger, maxAttempts: number): boolean {
  if (item.metrics.foundryComplete === 1) return false;
  if (item.status === 'completed' || item.status === 'accepted' || item.status === 'blocked' || item.status === 'stalled') return false;
  if (item.attempt < maxAttempts) return false;
  return Boolean(item.artifacts.rerunReport || item.artifacts.coderPatch || item.artifacts.adoptionDecision);
}

function artifactMtime(path: string | undefined): number {
  if (!path || !existsSync(path)) return 0;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function artifactNewerThan(path: string | undefined, otherPath: string | undefined): boolean {
  return artifactMtime(path) > artifactMtime(otherPath);
}

function runningStale(previous: FoundryVariantLedger): boolean {
  if (previous.status !== 'running') return false;
  if (!previous.startedAt) return true;
  const startedAt = Date.parse(previous.startedAt);
  if (!Number.isFinite(startedAt)) return true;
  const staleMs = Number(process.env['FOUNDRY_RUNNING_STALE_MS'] ?? DEFAULT_RUNNING_STALE_MS);
  return Date.now() - startedAt > staleMs;
}

async function architectAccepted(verdictArtifact: string | undefined): Promise<boolean | undefined> {
  if (!verdictArtifact || !existsSync(verdictArtifact)) return undefined;
  const parsed = asRecord(await readYamlFile(verdictArtifact));
  return typeof parsed['accepted'] === 'boolean' ? parsed['accepted'] : undefined;
}

async function compilerMetrics(compilerArtifact: string | undefined): Promise<{
  eventCount?: number;
  blockerCount?: number;
  diagnosticCount?: number;
  extractorRepairExhaustedCount?: number;
  outcome?: string;
  foundryComplete?: number;
}> {
  if (!compilerArtifact || !existsSync(compilerArtifact)) return {};
  const parsed = asRecord(await readYamlFile(compilerArtifact));
  const diagnostics = Array.isArray(parsed['diagnostics']) ? parsed['diagnostics'] : [];
  const eventCount = typeof parsed['eventCount'] === 'number' ? parsed['eventCount'] : undefined;
  const extractorRepairExhaustedCount = diagnostics.filter((diag) => asRecord(diag)['code'] === 'extractor_repair_exhausted').length;
  const outcome = typeof parsed['outcome'] === 'string' ? parsed['outcome'] : undefined;
  const foundryComplete = outcome === 'complete' && (eventCount ?? 0) > 0 && extractorRepairExhaustedCount === 0;
  return {
    ...(eventCount !== undefined ? { eventCount } : {}),
    diagnosticCount: diagnostics.length,
    extractorRepairExhaustedCount,
    ...(outcome ? { outcome } : {}),
    foundryComplete: foundryComplete ? 1 : 0,
  };
}

async function scanVariantArtifacts(
  artifactRoot: string,
  protocolId: string,
  variant: FoundryVariant,
  previous: FoundryVariantLedger,
): Promise<FoundryVariantLedger> {
  const compiler = fileIfExists(join(artifactRoot, 'compiler', protocolId, `${variant}.yaml`));
  const eventGraph = fileIfExists(join(artifactRoot, 'event-graphs', protocolId, `${variant}.yaml`));
  const executionScale = fileIfExists(join(artifactRoot, 'execution-scale', protocolId, `${variant}.yaml`));
  const browserReport = fileIfExists(join(artifactRoot, 'browser-review', protocolId, variant, 'report.yaml'));
  const architectVerdict = fileIfExists(join(artifactRoot, 'architect', protocolId, variant, 'verdict.yaml'));
  const adoption = fileIfExists(join(artifactRoot, 'adoption', protocolId, variant, 'adoption.yaml'));
  const coderPatch = fileIfExists(join(artifactRoot, 'code-patches', protocolId, variant, 'result.yaml'));
  const patchReport = fileIfExists(join(artifactRoot, 'patch-reports', `${protocolId}-${variant}.yaml`));
  const coderPatchStatus = coderPatchResultStatus(coderPatch);
  const criticReport = fileIfExists(join(artifactRoot, 'critic-reports', protocolId, variant, 'report.yaml'))
    ?? fileIfExists(join(artifactRoot, 'critic-reports', `${protocolId}-${variant}.yaml`));
  const patchFailure = fileIfExists(join(artifactRoot, 'patch-failures', `${protocolId}-${variant}.yaml`));
  const rerunReport = fileIfExists(join(artifactRoot, 'rerun', protocolId, variant, 'rerun.yaml'));
  let stallReport = fileIfExists(stallReportPath(artifactRoot, protocolId, variant));
  const currentPatchSpecs = patchSpecPaths(artifactRoot, protocolId, variant);
  const metrics = await compilerMetrics(compiler);
  const accepted = await architectAccepted(architectVerdict);
  const browserStale = eventGraph ? artifactNewerThan(eventGraph, browserReport) : false;
  const architectStale = Boolean(
    architectVerdict && (
      artifactNewerThan(compiler, architectVerdict) ||
      artifactNewerThan(eventGraph, architectVerdict) ||
      artifactNewerThan(browserReport, architectVerdict)
    ),
  );
  const rerunStale = Boolean(coderPatch && artifactNewerThan(coderPatch, rerunReport));
  const foundryComplete = metrics.foundryComplete === 1 && accepted === true && !browserStale && !architectStale && !rerunStale;
  const previousWithArtifacts: FoundryVariantLedger = {
    ...previous,
    artifacts: {
      ...previous.artifacts,
      ...(compiler ? { compiler } : {}),
      ...(eventGraph ? { eventGraph } : {}),
      ...(executionScale ? { executionScale } : {}),
      ...(browserReport ? { browserReport } : {}),
      ...(architectVerdict ? { architectVerdict } : {}),
      ...(currentPatchSpecs.length > 0 ? { patchSpecs: currentPatchSpecs } : {}),
      ...(adoption ? { adoptionDecision: adoption } : {}),
      ...(coderPatch ? { coderPatch } : {}),
      ...(patchReport ? { patchReport } : {}),
      ...(criticReport ? { criticReport } : {}),
      ...(patchFailure ? { patchFailure } : {}),
      ...(rerunReport ? { rerunReport } : {}),
      ...(stallReport ? { stallReport } : {}),
    },
    metrics: {
      ...previous.metrics,
      ...metrics,
    },
  };
  if (!stallReport && shouldStallVariant(previousWithArtifacts, variantMaxAttempts())) {
    stallReport = await writeStallReport({
      artifactRoot,
      protocolId,
      variant,
      item: previousWithArtifacts,
      maxAttempts: variantMaxAttempts(),
    });
  }
  const status: FoundryWorkStatus =
    foundryComplete ? 'completed' :
    stallReport ? 'stalled' :
    patchFailure ? 'blocked' :
    rerunReport && metrics.foundryComplete !== 1 ? 'gap' :
    coderPatchStatus === 'applied' ? 'accepted' :
    coderPatchStatus === 'skipped' || coderPatchStatus === 'needs-human' ? 'blocked' :
    coderPatch ? 'gap' :
    adoption ? (adoptionStatus(adoption) === 'skipped' ? 'blocked' : accepted === true ? 'accepted' : 'gap') :
    architectVerdict ? (accepted === true ? 'accepted' : 'gap') :
    browserReport ? 'completed' :
    compiler && eventGraph && executionScale ? (metrics.foundryComplete === 1 ? 'completed' : 'gap') :
    previous.status === 'running' && !runningStale(previous) ? 'running' :
    'pending';

  return {
    ...previous,
    status,
    artifacts: {
      ...(compiler ? { compiler } : {}),
      ...(eventGraph ? { eventGraph } : {}),
      ...(executionScale ? { executionScale } : {}),
      ...(browserReport ? { browserReport } : {}),
      ...(architectVerdict ? { architectVerdict } : {}),
      ...(currentPatchSpecs.length > 0 ? { patchSpecs: currentPatchSpecs } : {}),
      ...(adoption ? { adoptionDecision: adoption } : {}),
      ...(coderPatch ? { coderPatch } : {}),
      ...(patchReport ? { patchReport } : {}),
      ...(criticReport ? { criticReport } : {}),
      ...(patchFailure ? { patchFailure } : {}),
      ...(rerunReport ? { rerunReport } : {}),
      ...(stallReport ? { stallReport } : {}),
    },
    metrics: {
      ...previous.metrics,
      ...metrics,
    },
  };
}

export async function scanFoundryLedger(artifactRoot: string): Promise<FoundryLedger> {
  const ledger = await loadOrCreateFoundryLedger(artifactRoot);
  for (const protocol of Object.values(ledger.protocol_status)) {
    for (const variant of FOUNDRY_VARIANTS) {
      protocol.variants[variant] = await scanVariantArtifacts(
        artifactRoot,
        protocol.protocolId,
        variant,
        protocol.variants[variant],
      );
    }
    const variantStatuses = Object.values(protocol.variants).map((variant) => variant.status);
    protocol.status = variantStatuses.every((status) => status === 'accepted' || status === 'completed')
      ? 'completed'
      : variantStatuses.some((status) => status === 'failed' || status === 'blocked')
        ? 'blocked'
        : variantStatuses.every((status) => status === 'stalled')
          ? 'stalled'
        : variantStatuses.some((status) => status === 'completed' || status === 'gap' || status === 'stalled')
          ? 'gap'
          : 'pending';
  }
  await saveFoundryLedger(ledger);
  return ledger;
}

export function readyTasks(ledger: FoundryLedger): FoundryReadyTask[] {
  const tasks: FoundryReadyTask[] = [];
  for (const protocol of Object.values(ledger.protocol_status)) {
    const hasAnyCompiler = Object.values(protocol.variants).some((variant) => variant.artifacts.compiler);
    if (!hasAnyCompiler) {
      tasks.push({ protocolId: protocol.protocolId, variant: 'manual_tubes', stage: 'compile' });
      continue;
    }

    for (const variant of FOUNDRY_VARIANTS) {
      const item = protocol.variants[variant];
      if (item.status === 'stalled' || item.artifacts.stallReport) continue;
      const adoptionPath = join(ledger.artifact_root, 'adoption', protocol.protocolId, variant, 'adoption.yaml');
      const coderPatchPath = join(ledger.artifact_root, 'code-patches', protocol.protocolId, variant, 'result.yaml');
      const criticReportPath = join(ledger.artifact_root, 'critic-reports', protocol.protocolId, variant, 'report.yaml');
      const flatCriticReportPath = join(ledger.artifact_root, 'critic-reports', `${protocol.protocolId}-${variant}.yaml`);
      const patchFailurePath = join(ledger.artifact_root, 'patch-failures', `${protocol.protocolId}-${variant}.yaml`);
      const escalationPath = join(ledger.artifact_root, 'patch-escalations', `${protocol.protocolId}-${variant}.yaml`);
      const coderPatchTerminal = coderPatchIsTerminal(coderPatchPath);
      const coderPatchSkipped = coderPatchIsSkipped(coderPatchPath);
      const hasPatchSpecs = patchSpecPaths(ledger.artifact_root, protocol.protocolId, variant).length > 0;
      const rerunPath = join(ledger.artifact_root, 'rerun', protocol.protocolId, variant, 'rerun.yaml');
      const assumptionsPath = join(ledger.artifact_root, 'assumptions', protocol.protocolId, `${variant}.yaml`);
      const browserStale = item.artifacts.eventGraph
        ? artifactNewerThan(item.artifacts.eventGraph, item.artifacts.browserReport)
        : false;
      const architectStale = Boolean(
        item.artifacts.architectVerdict && (
          artifactNewerThan(item.artifacts.compiler, item.artifacts.architectVerdict) ||
          artifactNewerThan(item.artifacts.eventGraph, item.artifacts.architectVerdict) ||
          artifactNewerThan(item.artifacts.browserReport, item.artifacts.architectVerdict)
        ),
      );
      const adoptionStale = artifactNewerThan(item.artifacts.architectVerdict, adoptionPath);
      const coderPatchStale = artifactNewerThan(adoptionPath, coderPatchPath);
      const rerunStale = artifactNewerThan(coderPatchPath, rerunPath);
      const criticPath = existsSync(criticReportPath) ? criticReportPath : flatCriticReportPath;
      const criticPassed = criticVerdict(criticPath) === 'pass';
      const criticFailed = criticVerdict(criticPath) === 'fail';
      const coderPatchAsksArchitect = (coderPatchNeedsArchitectRefresh(coderPatchPath) || coderPatchNeedsRefresh(coderPatchPath) || criticFailed)
        && artifactNewerThan(coderPatchPath, item.artifacts.architectVerdict);
      if (!item.artifacts.compiler) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'rerun' });
      } else if (!item.artifacts.eventGraph || !item.artifacts.executionScale) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'rerun' });
      } else if (item.artifacts.compiler && !existsSync(assumptionsPath)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'rerun' });
      } else if (item.artifacts.eventGraph && (!item.artifacts.browserReport || browserStale)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'browser_review' });
      } else if (item.artifacts.compiler && item.artifacts.eventGraph && (!item.artifacts.architectVerdict || architectStale || coderPatchAsksArchitect)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'architect_review' });
      } else if (existsSync(patchFailurePath)) {
        continue;
      } else if (existsSync(escalationPath)) {
        // Escalation retry: allow one more coder_patch attempt with senior worker
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'coder_patch' });
      } else if (item.artifacts.architectVerdict && (!existsSync(adoptionPath) || adoptionStale)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'patch_adoption' });
      } else if (existsSync(adoptionPath) && hasPatchSpecs && !coderPatchSkipped && (!coderPatchTerminal || coderPatchStale)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'coder_patch' });
      } else if (existsSync(adoptionPath) && (!hasPatchSpecs || coderPatchSkipped)) {
        continue;
      } else if (existsSync(adoptionPath) && coderPatchTerminal && (!existsSync(criticPath) || artifactNewerThan(coderPatchPath, criticPath))) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'patch_critic' });
      } else if (existsSync(adoptionPath) && coderPatchTerminal && criticPassed && (!existsSync(rerunPath) || rerunStale)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'rerun' });
      }
    }
  }
  return tasks;
}

export function markFoundryTask(ledger: FoundryLedger, input: MarkFoundryTaskInput): FoundryLedger {
  const protocol = ledger.protocol_status[input.protocolId];
  if (!protocol) throw new Error(`unknown protocol "${input.protocolId}"`);
  const variant = normalizeVariant(input.variant);
  if (!variant) throw new Error(`unknown variant "${input.variant}"`);
  const item = protocol.variants[variant];
  item.status = input.status;
  item.attempt += input.status === 'running' ? 1 : 0;
  if (input.status === 'running') {
    item.startedAt = nowIso();
  } else {
    item.completedAt = nowIso();
  }
  if (input.message) item.failureReason = input.message;
  if (input.artifacts) {
    item.artifacts = { ...item.artifacts, ...input.artifacts };
  }
  if (input.metrics) {
    item.metrics = { ...item.metrics, ...input.metrics };
  }
  return ledger;
}
