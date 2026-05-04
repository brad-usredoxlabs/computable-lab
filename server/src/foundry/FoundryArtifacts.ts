import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import YAML from 'yaml';
import { FOUNDRY_VARIANTS, type FoundryVariant } from './ProtocolFoundryCompileRunner.js';

export type FoundryWorkStage =
  | 'compile'
  | 'browser_review'
  | 'architect_review'
  | 'patch_adoption'
  | 'patch_specs'
  | 'rerun';

export type FoundryWorkStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'accepted'
  | 'gap'
  | 'blocked'
  | 'failed'
  | 'skipped';

export interface FoundryVariantLedger {
  variant: FoundryVariant;
  status: FoundryWorkStatus;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  compile?: FoundryStageRecord;
  browserReview?: FoundryStageRecord;
  architectReview?: FoundryStageRecord;
  patchSpecs?: FoundryStageRecord;
  rerun?: FoundryStageRecord;
  artifacts: {
    compiler?: string;
    eventGraph?: string;
    executionScale?: string;
    browserReport?: string;
    architectVerdict?: string;
    patchSpecs?: string[];
  };
  metrics: {
    eventCount?: number;
    blockerCount?: number;
    diagnosticCount?: number;
    extractorRepairExhaustedCount?: number;
    qualityScore?: number;
    coverageEstimate?: number;
  };
  failureReason?: string;
}

export interface FoundryProtocolLedger {
  protocolId: string;
  segmentPath: string;
  materialContextPath?: string;
  status: FoundryWorkStatus;
  variants: Record<FoundryVariant, FoundryVariantLedger>;
}

export interface FoundryStageRecord {
  status: FoundryWorkStatus;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  artifactPaths?: string[];
  message?: string;
}

export interface FoundryLedger {
  kind: 'protocol-foundry-stage-ledger';
  generated_at: string;
  updated_at: string;
  artifact_root: string;
  protocols: string[];
  protocol_status: Record<string, FoundryProtocolLedger>;
  stages?: unknown[];
  rules?: unknown[];
}

export interface FoundryProtocolInput {
  protocolId: string;
  segmentPath: string;
  materialContextPath?: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'protocol';
}

export function ledgerPath(artifactRoot: string): string {
  return join(artifactRoot, 'queues', 'stage-ledger.yaml');
}

export async function readYamlFile<T = unknown>(path: string): Promise<T> {
  return YAML.parse(await readFile(path, 'utf-8')) as T;
}

export async function writeYamlFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, YAML.stringify(value), 'utf-8');
}

export async function listYamlFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .sort()
    .map((file) => join(dir, file));
}

export async function discoverProtocolInputs(artifactRoot: string): Promise<FoundryProtocolInput[]> {
  const segmentPaths = await listYamlFiles(join(artifactRoot, 'segments'));
  const inputs: FoundryProtocolInput[] = [];
  for (const segmentPath of segmentPaths) {
    const protocolId = slugify(basename(segmentPath).replace(/\.(ya?ml)$/i, ''));
    const materialContextPath = join(artifactRoot, 'material-context', `${protocolId}.yaml`);
    inputs.push({
      protocolId,
      segmentPath,
      ...(existsSync(materialContextPath) ? { materialContextPath } : {}),
    });
  }
  return inputs;
}

export function emptyVariantLedger(variant: FoundryVariant): FoundryVariantLedger {
  return {
    variant,
    status: 'pending',
    attempt: 0,
    artifacts: {},
    metrics: {},
  };
}

export function emptyProtocolLedger(input: FoundryProtocolInput): FoundryProtocolLedger {
  return {
    protocolId: input.protocolId,
    segmentPath: input.segmentPath,
    ...(input.materialContextPath ? { materialContextPath: input.materialContextPath } : {}),
    status: 'pending',
    variants: Object.fromEntries(
      FOUNDRY_VARIANTS.map((variant) => [variant, emptyVariantLedger(variant)]),
    ) as Record<FoundryVariant, FoundryVariantLedger>,
  };
}

export function stageRecord(status: FoundryWorkStatus, message?: string): FoundryStageRecord {
  return {
    status,
    attempts: 1,
    ...(status === 'running' ? { startedAt: nowIso() } : { completedAt: nowIso() }),
    ...(message ? { message } : {}),
  };
}
