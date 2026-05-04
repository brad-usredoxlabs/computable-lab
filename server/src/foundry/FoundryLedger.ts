import { existsSync, readFileSync } from 'node:fs';
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

async function compilerMetrics(compilerArtifact: string | undefined): Promise<{
  eventCount?: number;
  blockerCount?: number;
  diagnosticCount?: number;
  extractorRepairExhaustedCount?: number;
  outcome?: string;
}> {
  if (!compilerArtifact || !existsSync(compilerArtifact)) return {};
  const parsed = asRecord(await readYamlFile(compilerArtifact));
  const diagnostics = Array.isArray(parsed['diagnostics']) ? parsed['diagnostics'] : [];
  return {
    ...(typeof parsed['eventCount'] === 'number' ? { eventCount: parsed['eventCount'] } : {}),
    diagnosticCount: diagnostics.length,
    extractorRepairExhaustedCount: diagnostics.filter((diag) => asRecord(diag)['code'] === 'extractor_repair_exhausted').length,
    ...(typeof parsed['outcome'] === 'string' ? { outcome: parsed['outcome'] } : {}),
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
  const status: FoundryWorkStatus =
    rerunReport ? 'completed' :
    coderPatchStatus === 'applied' || coderPatchStatus === 'skipped' ? 'accepted' :
    coderPatchStatus === 'needs-human' ? 'blocked' :
    coderPatch ? 'gap' :
    adoption ? 'accepted' :
    architectVerdict ? 'gap' :
    browserReport ? 'completed' :
    compiler && eventGraph && executionScale ? (metrics.outcome === 'complete' ? 'completed' : 'gap') :
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
      if (item.artifacts.eventGraph && !item.artifacts.browserReport) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'browser_review' });
      } else if (item.artifacts.compiler && item.artifacts.eventGraph && !item.artifacts.architectVerdict) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'architect_review' });
      } else if (item.artifacts.architectVerdict && !existsSync(adoptionPath)) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'patch_adoption' });
      } else if (existsSync(adoptionPath) && hasPatchSpecs && !coderPatchTerminal) {
        tasks.push({ protocolId: protocol.protocolId, variant, stage: 'coder_patch' });
      } else if (existsSync(adoptionPath) && (!hasPatchSpecs || coderPatchTerminal) && !existsSync(rerunPath)) {
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
