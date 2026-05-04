import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  asRecord,
  nowIso,
  readYamlFile,
  type FoundryLedger,
  type FoundryVariantLedger,
  writeYamlFile,
} from './FoundryArtifacts.js';
import { FOUNDRY_VARIANTS } from './ProtocolFoundryCompileRunner.js';

export interface FoundryStageEvent {
  kind: 'protocol-foundry-stage-event';
  timestamp: string;
  stage: string;
  status: 'started' | 'completed' | 'failed' | 'blocked';
  protocolId?: string;
  variant?: string;
  elapsedMs?: number;
  message?: string;
}

export interface ModelEndpointUsage {
  endpoint: string;
  promptTokensTotal?: number;
  generationTokensTotal?: number;
  runningRequests?: number;
  waitingRequests?: number;
  kvCacheUsage?: number;
}

function metricsDir(artifactRoot: string): string {
  return join(artifactRoot, 'metrics');
}

function eventCount(variant: FoundryVariantLedger): number {
  return variant.metrics.eventCount ?? 0;
}

function blockerCount(variant: FoundryVariantLedger): number {
  return variant.metrics.blockerCount ?? 0;
}

function diagnosticCount(variant: FoundryVariantLedger): number {
  return variant.metrics.diagnosticCount ?? 0;
}

function extractorFailureCount(variant: FoundryVariantLedger): number {
  return variant.metrics.extractorRepairExhaustedCount ?? 0;
}

async function browserStatus(path: string | undefined): Promise<string | undefined> {
  if (!path || !existsSync(path)) return undefined;
  const report = asRecord(await readYamlFile(path));
  return typeof report['status'] === 'string' ? report['status'] : undefined;
}

async function verdictAccepted(path: string | undefined): Promise<boolean | undefined> {
  if (!path || !existsSync(path)) return undefined;
  const verdict = asRecord(await readYamlFile(path));
  return typeof verdict['accepted'] === 'boolean' ? verdict['accepted'] : undefined;
}

export async function writeProtocolQualityMetrics(ledger: FoundryLedger): Promise<void> {
  const protocols = [];
  let variantTotal = 0;
  let accepted = 0;
  let complete = 0;
  let gaps = 0;
  let extractorFailures = 0;
  let eventTotal = 0;
  let blockerTotal = 0;

  for (const protocol of Object.values(ledger.protocol_status)) {
    const variants = [];
    for (const variantName of FOUNDRY_VARIANTS) {
      const variant = protocol.variants[variantName];
      const acceptedVerdict = await verdictAccepted(variant.artifacts.architectVerdict);
      const browser = await browserStatus(variant.artifacts.browserReport);
      const variantExtractorFailures = extractorFailureCount(variant);
      const events = eventCount(variant);
      const blockers = blockerCount(variant);
      variantTotal += 1;
      if (acceptedVerdict) accepted += 1;
      if (variant.status === 'completed' || variant.status === 'accepted') complete += 1;
      if (variant.status === 'gap') gaps += 1;
      extractorFailures += variantExtractorFailures;
      eventTotal += events;
      blockerTotal += blockers;
      variants.push({
        variant: variantName,
        status: variant.status,
        accepted: acceptedVerdict ?? false,
        browserStatus: browser ?? 'missing',
        eventCount: events,
        blockerCount: blockers,
        diagnosticCount: diagnosticCount(variant),
        extractorRepairExhaustedCount: variantExtractorFailures,
        qualityScore: variant.metrics.qualityScore ?? null,
        coverageEstimate: variant.metrics.coverageEstimate ?? null,
      });
    }
    protocols.push({
      protocolId: protocol.protocolId,
      status: protocol.status,
      variants,
    });
  }

  await writeYamlFile(join(metricsDir(ledger.artifact_root), 'protocol-quality.yaml'), {
    kind: 'protocol-foundry-protocol-quality',
    generated_at: nowIso(),
    summary: {
      protocolCount: protocols.length,
      variantTotal,
      accepted,
      complete,
      gaps,
      extractorFailures,
      eventTotal,
      blockerTotal,
      acceptedRate: variantTotal > 0 ? accepted / variantTotal : 0,
      completeRate: variantTotal > 0 ? complete / variantTotal : 0,
    },
    protocols,
  });
}

function parseMetricNumber(text: string, name: string): number | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}\\{[^}]*\\}\\s+([0-9.eE+-]+)`));
  return match ? Number(match[1]) : undefined;
}

function endpointMetricsUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '') + '/metrics';
}

export async function fetchModelEndpointUsage(baseUrl: string): Promise<ModelEndpointUsage> {
  const endpoint = endpointMetricsUrl(baseUrl);
  const response = await fetch(endpoint);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`model metrics HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const promptTokensTotal = parseMetricNumber(text, 'vllm:prompt_tokens_total');
  const generationTokensTotal = parseMetricNumber(text, 'vllm:generation_tokens_total');
  const runningRequests = parseMetricNumber(text, 'vllm:num_requests_running');
  const waitingRequests = parseMetricNumber(text, 'vllm:num_requests_waiting');
  const kvCacheUsage = parseMetricNumber(text, 'vllm:kv_cache_usage_perc');
  return {
    endpoint,
    ...(promptTokensTotal !== undefined ? { promptTokensTotal } : {}),
    ...(generationTokensTotal !== undefined ? { generationTokensTotal } : {}),
    ...(runningRequests !== undefined ? { runningRequests } : {}),
    ...(waitingRequests !== undefined ? { waitingRequests } : {}),
    ...(kvCacheUsage !== undefined ? { kvCacheUsage } : {}),
  };
}

export async function writeModelUsageMetrics(input: {
  artifactRoot: string;
  startedAt: string;
  completedAt: string;
  endpoints: Array<{ role: string; baseUrl: string; start?: ModelEndpointUsage; end?: ModelEndpointUsage; error?: string }>;
}): Promise<void> {
  const endpoints = input.endpoints.map((endpoint) => ({
    ...endpoint,
    deltaPromptTokens:
      endpoint.start?.promptTokensTotal !== undefined && endpoint.end?.promptTokensTotal !== undefined
        ? endpoint.end.promptTokensTotal - endpoint.start.promptTokensTotal
        : undefined,
    deltaGenerationTokens:
      endpoint.start?.generationTokensTotal !== undefined && endpoint.end?.generationTokensTotal !== undefined
        ? endpoint.end.generationTokensTotal - endpoint.start.generationTokensTotal
        : undefined,
  }));
  const elapsedSeconds = Math.max(0.001, (Date.parse(input.completedAt) - Date.parse(input.startedAt)) / 1000);
  await writeYamlFile(join(metricsDir(input.artifactRoot), 'model-usage.yaml'), {
    kind: 'protocol-foundry-model-usage',
    generated_at: nowIso(),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    elapsedSeconds,
    endpoints: endpoints.map((endpoint) => ({
      ...endpoint,
      promptTokensPerSecond: endpoint.deltaPromptTokens !== undefined ? endpoint.deltaPromptTokens / elapsedSeconds : undefined,
      generationTokensPerSecond: endpoint.deltaGenerationTokens !== undefined ? endpoint.deltaGenerationTokens / elapsedSeconds : undefined,
    })),
  });
}

export async function writeRunSummaryMetrics(ledger: FoundryLedger): Promise<void> {
  const protocolCount = Object.keys(ledger.protocol_status).length;
  const variants = Object.values(ledger.protocol_status).flatMap((protocol) => Object.values(protocol.variants));
  await writeYamlFile(join(metricsDir(ledger.artifact_root), 'run-summary.yaml'), {
    kind: 'protocol-foundry-run-summary',
    generated_at: nowIso(),
    artifact_root: ledger.artifact_root,
    protocolCount,
    variantCount: variants.length,
    statusCounts: variants.reduce<Record<string, number>>((acc, variant) => {
      acc[variant.status] = (acc[variant.status] ?? 0) + 1;
      return acc;
    }, {}),
  });
}

export async function writeAllFoundryMetrics(ledger: FoundryLedger): Promise<void> {
  await writeProtocolQualityMetrics(ledger);
  await writeRunSummaryMetrics(ledger);
}
