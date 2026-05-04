import { existsSync, readFileSync, statSync } from 'node:fs';
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
  return status === 'applied' || status === 'skipped' || status === 'needs-human';
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
  const coderPatchStatus = coderPatchResultStatus(coderPatch);
  const rerunReport = fileIfExists(join(artifactRoot, 'rerun', protocolId, variant, 'rerun.yaml'));
  const previousPatchSpecs = previous.artifacts.patchSpecs?.filter((path) => existsSync(path)) ?? [];
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
  const status: FoundryWorkStatus =
    foundryComplete ? 'completed' :
    rerunReport && metrics.foundryComplete !== 1 ? 'gap' :
    coderPatchStatus === 'applied' || coderPatchStatus === 'skipped' ? 'accepted' :
    coderPatchStatus === 'needs-human' ? 'blocked' :
    coderPatch ? 'gap' :
    adoption ? (accepted === true ? 'accepted' : 'gap') :
    architectVerdict ? (accepted === true ? 'accepted' : 'gap') :
    browserReport ? 'completed' :
    compiler && eventGraph && executionScale ? (metrics.foundryComplete === 1 ? 'completed' : 'gap') :
    previous.status === 'running' ? 'running' :
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
      ...(previousPatchSpecs.length > 0 ? { patchSpecs: previousPatchSpecs } : {}),
      ...(coderPatch ? { coderPatch } : {}),
      ...(rerunReport ? { rerunReport } : {}),
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
        : variantStatuses.some((status) => status === 'completed' || status === 'gap')
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
      const adoptionPath = join(ledger.artifact_root, 'adoption', protocol.protocolId, variant, 'adoption.yaml');
      const coderPatchPath = join(ledger.artifact_root, 'code-patches', protocol.protocolId, variant, 'result.yaml');
      const coderPatchTerminal = coderPatchIsTerminal(coderPatchPath);
      const hasPatchSpecs = Boolean(item.artifacts.patchSpecs && item.artifacts.patchSpecs.length > 0);
      const rerunPath = join(ledger.artifact_root, 'rerun', protocol.protocolId, variant, 'rerun.yaml');
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
      if (item.artifacts.eventGraph && (!item.artifacts.browserReport || browserStale)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'browser_review' });
      } else if (item.artifacts.compiler && item.artifacts.eventGraph && (!item.artifacts.architectVerdict || architectStale)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'architect_review' });
      } else if (item.artifacts.architectVerdict && (!existsSync(adoptionPath) || adoptionStale)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'patch_adoption' });
      } else if (existsSync(adoptionPath) && hasPatchSpecs && (!coderPatchTerminal || coderPatchStale)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'coder_patch' });
      } else if (existsSync(adoptionPath) && (!hasPatchSpecs || coderPatchTerminal) && (!existsSync(rerunPath) || rerunStale)) {
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
