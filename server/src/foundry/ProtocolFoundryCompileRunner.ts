import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import YAML from 'yaml';
import { createInferenceClient } from '../ai/InferenceClient.js';
import { runChatbotCompile, type RunChatbotCompileResult } from '../ai/runChatbotCompile.js';
import type { InferenceConfig } from '../config/types.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../extract/ExtractionRunnerService.js';
import type { LlmClient } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { PlateEventPrimitive } from '../compiler/biology/BiologyVerbExpander.js';
import type {
  ExecutionScaleLabwareKind,
  ExecutionScaleLevel,
  ExecutionScalePlan,
} from '../compiler/pipeline/CompileContracts.js';

export const FOUNDRY_VARIANTS = [
  'manual_tubes',
  'bench_plate_multichannel',
  'robot_deck',
] as const;

export type FoundryVariant = typeof FOUNDRY_VARIANTS[number];

export interface ProtocolFoundryCompileOptions {
  artifactRoot: string;
  segmentPath: string;
  materialContextPath?: string;
  protocolId?: string;
  variants?: FoundryVariant[];
  inference?: Partial<InferenceConfig>;
  dryRun?: boolean;
}

export interface ProtocolFoundryCompileSummary {
  kind: 'protocol-foundry-compile-summary';
  protocolId: string;
  artifactRoot: string;
  variants: Array<{
    variant: FoundryVariant;
    outcome: string;
    eventGraphArtifact: string;
    executionScaleArtifact: string;
    compilerArtifact: string;
    eventCount: number;
    blockerCount: number;
  }>;
}

interface FoundryEventGraphProposal {
  kind: 'protocol-event-graph-proposal';
  recordId: string;
  protocolId: string;
  variant: FoundryVariant;
  targetLevel: ExecutionScaleLevel;
  status: 'ready' | 'blocked';
  sourceRefs: {
    segment: string;
    materialContext?: string;
  };
  eventGraph: {
    id: string;
    name: string;
    description: string;
    status: 'draft';
    protocolId: string;
    events: PlateEventPrimitive[];
    labwares: Array<Record<string, unknown>>;
    tags: string[];
  };
  terminalArtifacts: RunChatbotCompileResult['terminalArtifacts'];
  diagnostics: RunChatbotCompileResult['diagnostics'];
  browserReview: {
    routeTemplate: '/labware-editor?id=<eventGraphRecordId>';
    importRequired: true;
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'protocol';
}

function inferProtocolId(segmentPath: string, parsed: Record<string, unknown>): string {
  const candidates = [
    parsed['protocolId'],
    parsed['protocol_id'],
    parsed['recordId'],
    parsed['id'],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return slugify(candidate);
  }
  return slugify(basename(segmentPath).replace(/\.(ya?ml|txt|md)$/i, ''));
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item));
  const record = asRecord(value);
  const direct: string[] = [];
  for (const key of ['protocol_text', 'protocolText', 'text', 'content', 'body', 'raw_text', 'rawText']) {
    const entry = record[key];
    if (typeof entry === 'string' && entry.trim()) direct.push(entry.trim());
  }
  for (const key of ['segments', 'steps', 'sections']) {
    if (Array.isArray(record[key])) direct.push(...record[key].flatMap((item) => collectText(item)));
  }
  return direct;
}

function extractProtocolText(segment: Record<string, unknown>): string {
  const chunks = collectText(segment);
  if (chunks.length > 0) return chunks.join('\n\n');
  return YAML.stringify(segment);
}

function variantInstruction(variant: FoundryVariant): string {
  if (variant === 'manual_tubes') {
    return 'Preserve the source protocol as manual tube/tube-rack work with single-channel pipetting unless the source explicitly says otherwise.';
  }
  if (variant === 'bench_plate_multichannel') {
    return 'Scale the manual protocol to a 96-well plate, 12-well reagent reservoir, and 8-channel multichannel pipette while preserving biological intent.';
  }
  return 'Bind the plate/multichannel plan to a robot deck. Prefer ASSIST PLUS when the source or run asks for ASSIST PLUS; otherwise use an available robot-deck profile and report blockers.';
}

function buildPrompt(input: {
  protocolId: string;
  variant: FoundryVariant;
  protocolText: string;
  materialContext?: Record<string, unknown>;
}): string {
  return [
    `Protocol Foundry compile target: ${input.protocolId}`,
    `Execution variant: ${input.variant}`,
    variantInstruction(input.variant),
    '',
    'Rules:',
    '- Produce reviewable event graph semantics; do not invent physical inventory.',
    '- A vendor PDF may justify material, material-spec, or vendor-product records.',
    '- Do not create material-instance, aliquot, or physical labware-instance records unless the provided run context has a lot, tube, prepared source, sample provenance, or operator decision.',
    '- If execution scaling lacks sample count, labware definition, pipette capability, or platform binding, emit blockers instead of guessing.',
    '',
    'Material/labware context YAML:',
    input.materialContext ? YAML.stringify(input.materialContext) : '(none provided)',
    '',
    'Protocol text:',
    input.protocolText,
  ].join('\n');
}

function nullExtractionService(): ExtractionRunnerService {
  return {
    async run(_args: RunExtractionServiceArgs) {
      return {
        candidates: [],
        diagnostics: [{
          severity: 'info',
          code: 'FOUNDRY_EXTRACTION_PRESEGMENTED',
          message: 'Protocol Foundry supplied presegmented text; extraction runner skipped freetext candidate creation.',
        }],
      };
    },
  } as unknown as ExtractionRunnerService;
}

function nullLlmClient(): LlmClient {
  return {
    async complete() {
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              tags: [],
              candidateEvents: [],
              candidateLabwares: [],
              unresolvedRefs: [],
            }),
          },
        }],
      };
    },
  };
}

function createLlmClient(options: ProtocolFoundryCompileOptions): LlmClient {
  const baseUrl = options.inference?.baseUrl ?? process.env['PI_WORKER_BASE_URL'] ?? process.env['OPENAI_BASE_URL'];
  const model = options.inference?.model ?? process.env['PI_WORKER_MODEL'] ?? process.env['OPENAI_MODEL'];
  if (!baseUrl || !model || options.dryRun) return nullLlmClient();
  const apiKey = options.inference?.apiKey ?? process.env['OPENAI_API_KEY'];
  return createInferenceClient({
    baseUrl,
    model,
    ...(apiKey ? { apiKey } : {}),
    temperature: options.inference?.temperature ?? 0.1,
    timeoutMs: options.inference?.timeoutMs ?? 180_000,
    maxTokens: options.inference?.maxTokens ?? 4096,
    enableThinking: options.inference?.enableThinking ?? false,
  });
}

function valueFromDetails(details: Record<string, unknown>, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const value = details[key];
    if (typeof value === 'string' && value.trim()) values.push(value.trim());
  }
  return values;
}

function labwareTypeForKind(kind: ExecutionScaleLabwareKind | undefined, fallback: string): string {
  if (kind === 'tube_rack') return 'tubeset_24';
  if (kind === '384_well_plate') return 'plate_384';
  if (kind === '96_well_plate') return 'plate_96';
  if (kind === '12_well_reservoir') return 'reservoir_12';
  if (kind === '8_well_reservoir') return 'reservoir_8';
  if (kind === '2_well_reservoir') return 'reservoir_12';
  if (kind === 'tube') return 'tube';
  return fallback;
}

function inferLabwareType(labwareId: string, plan: ExecutionScalePlan | undefined, variant: FoundryVariant): string {
  const lower = labwareId.toLowerCase();
  const matchingReagent = plan?.reagentLayout.find((role) => role.sourceLabwareRole === labwareId);
  if (matchingReagent) return labwareTypeForKind(matchingReagent.sourceLabwareKind, 'reservoir_12');
  if (plan?.sampleLayout?.labwareRole === labwareId) return labwareTypeForKind(plan.sampleLayout.labwareKind, 'plate_96');
  if (lower.includes('reservoir')) return labwareTypeForKind(plan?.reagentLayout[0]?.sourceLabwareKind, 'reservoir_12');
  if (lower.includes('tube')) return 'tubeset_24';
  if (lower.includes('384')) return 'plate_384';
  if (lower.includes('plate') || lower.includes('well')) return labwareTypeForKind(plan?.sampleLayout?.labwareKind, 'plate_96');
  return variant === 'manual_tubes' ? 'tubeset_24' : labwareTypeForKind(plan?.sampleLayout?.labwareKind, 'plate_96');
}

function collectLabwareIds(events: PlateEventPrimitive[], plan: ExecutionScalePlan | undefined): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (typeof event.labwareId === 'string' && event.labwareId.trim()) ids.add(event.labwareId.trim());
    const details = asRecord(event.details);
    for (const id of valueFromDetails(details, [
      'labwareId',
      'labware_id',
      'source_labware',
      'destination_labware',
      'sourceLabware',
      'destinationLabware',
      'container',
      'plate',
      'rack',
      'reservoir',
    ])) {
      ids.add(id);
    }
    for (const key of ['from', 'to', 'target', 'source', 'destination']) {
      const nested = asRecord(details[key]);
      for (const id of valueFromDetails(nested, ['labware', 'labwareId', 'labware_id', 'container'])) ids.add(id);
    }
  }

  if (plan?.sampleLayout) ids.add(plan.sampleLayout.labwareRole);
  for (const reagent of plan?.reagentLayout ?? []) ids.add(reagent.sourceLabwareRole);
  return Array.from(ids);
}

function buildLabwares(events: PlateEventPrimitive[], plan: ExecutionScalePlan | undefined, variant: FoundryVariant): Array<Record<string, unknown>> {
  const labwareIds = collectLabwareIds(events, plan);
  if (labwareIds.length === 0) {
    labwareIds.push(variant === 'manual_tubes' ? 'sample_tube_rack' : 'sample_plate');
  }
  return labwareIds.map((labwareId) => ({
    labwareId,
    labwareType: inferLabwareType(labwareId, plan, variant),
    name: labwareId.replace(/[_-]+/g, ' '),
  }));
}

function normalizeEvents(events: PlateEventPrimitive[], labwares: Array<Record<string, unknown>>): PlateEventPrimitive[] {
  if (events.length === 0) return [];
  const fallbackLabwareId = typeof labwares[0]?.['labwareId'] === 'string' ? labwares[0]['labwareId'] as string : 'sample_plate';
  return events.map((event, index) => ({
    ...event,
    eventId: event.eventId || `evt_${index + 1}`,
    labwareId: event.labwareId ?? fallbackLabwareId,
  }));
}

function blockedBy(result: RunChatbotCompileResult): number {
  return result.terminalArtifacts.executionScalePlan?.blockers.length ?? 0;
}

async function writeYaml(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, YAML.stringify(value), 'utf-8');
}

async function readYamlFile(path: string): Promise<Record<string, unknown>> {
  const parsed = YAML.parse(await readFile(path, 'utf-8'));
  return asRecord(parsed);
}

async function runVariant(input: {
  options: ProtocolFoundryCompileOptions;
  protocolId: string;
  variant: FoundryVariant;
  protocolText: string;
  segmentPath: string;
  materialContextPath?: string;
  materialContext?: Record<string, unknown>;
  llmClient: LlmClient;
}): Promise<ProtocolFoundryCompileSummary['variants'][number]> {
  const prompt = buildPrompt({
    protocolId: input.protocolId,
    variant: input.variant,
    protocolText: input.protocolText,
    ...(input.materialContext ? { materialContext: input.materialContext } : {}),
  });
  const model = input.options.inference?.model ?? process.env['PI_WORKER_MODEL'] ?? process.env['OPENAI_MODEL'];
  const result = await runChatbotCompile({
    prompt,
    deps: {
      extractionService: nullExtractionService(),
      llmClient: input.llmClient,
      searchLabwareByHint: async () => [],
    },
    ...(model ? { model } : {}),
  });

  const plan = result.terminalArtifacts.executionScalePlan;
  const labwares = buildLabwares(result.events, plan, input.variant);
  const events = normalizeEvents(result.events, labwares);
  const graphId = `EVG-FOUNDRY-${slugify(input.protocolId)}-${input.variant}`;
  const status = result.outcome === 'error' || blockedBy(result) > 0 ? 'blocked' : 'ready';
  const targetLevel = plan?.targetLevel ?? input.variant;
  const graphArtifact = join(input.options.artifactRoot, 'event-graphs', input.protocolId, `${input.variant}.yaml`);
  const scaleArtifact = join(input.options.artifactRoot, 'execution-scale', input.protocolId, `${input.variant}.yaml`);
  const compilerArtifact = join(input.options.artifactRoot, 'compiler', input.protocolId, `${input.variant}.yaml`);

  const proposal: FoundryEventGraphProposal = {
    kind: 'protocol-event-graph-proposal',
    recordId: `protocol-event-graph-proposal/${input.protocolId}/${input.variant}`,
    protocolId: input.protocolId,
    variant: input.variant,
    targetLevel,
    status,
    sourceRefs: {
      segment: input.segmentPath,
      ...(input.materialContextPath ? { materialContext: input.materialContextPath } : {}),
    },
    eventGraph: {
      id: graphId,
      name: `Foundry ${input.protocolId} ${input.variant}`,
      description: `Protocol Foundry preview graph for ${input.protocolId} (${input.variant}).`,
      status: 'draft',
      protocolId: input.protocolId,
      events,
      labwares,
      tags: ['protocol-foundry', input.variant],
    },
    terminalArtifacts: {
      ...result.terminalArtifacts,
      events,
    },
    diagnostics: result.diagnostics,
    browserReview: {
      routeTemplate: '/labware-editor?id=<eventGraphRecordId>',
      importRequired: true,
    },
  };

  await writeYaml(graphArtifact, proposal);
  await writeYaml(scaleArtifact, plan ?? {
    kind: 'execution-scale-plan',
    recordId: `execution-scale-plan/${input.variant}`,
    sourceLevel: 'manual_tubes',
    targetLevel,
    status: 'blocked',
    reagentLayout: [],
    assumptions: [],
    blockers: [{
      code: 'compile_produced_no_execution_scale_plan',
      message: 'chatbot-compile did not emit terminalArtifacts.executionScalePlan for this variant.',
      requiredInput: 'compiler diagnostics',
    }],
  });
  await writeYaml(compilerArtifact, {
    kind: 'protocol-foundry-compiler-result',
    protocolId: input.protocolId,
    variant: input.variant,
    outcome: result.outcome,
    eventCount: events.length,
    diagnostics: result.diagnostics,
    gaps: result.terminalArtifacts.gaps,
    terminalArtifactsRef: graphArtifact,
  });

  return {
    variant: input.variant,
    outcome: result.outcome,
    eventGraphArtifact: graphArtifact,
    executionScaleArtifact: scaleArtifact,
    compilerArtifact,
    eventCount: events.length,
    blockerCount: blockedBy(result),
  };
}

export async function runProtocolFoundryCompile(options: ProtocolFoundryCompileOptions): Promise<ProtocolFoundryCompileSummary> {
  const segment = await readYamlFile(options.segmentPath);
  const materialContext = options.materialContextPath ? await readYamlFile(options.materialContextPath) : undefined;
  const protocolId = options.protocolId ? slugify(options.protocolId) : inferProtocolId(options.segmentPath, segment);
  const protocolText = extractProtocolText(segment);
  const llmClient = createLlmClient(options);
  const variants = options.variants && options.variants.length > 0 ? options.variants : [...FOUNDRY_VARIANTS];
  const summary: ProtocolFoundryCompileSummary = {
    kind: 'protocol-foundry-compile-summary',
    protocolId,
    artifactRoot: options.artifactRoot,
    variants: [],
  };

  for (const variant of variants) {
    summary.variants.push(await runVariant({
      options,
      protocolId,
      variant,
      protocolText,
      segmentPath: options.segmentPath,
      ...(options.materialContextPath ? { materialContextPath: options.materialContextPath } : {}),
      ...(materialContext ? { materialContext } : {}),
      llmClient,
    }));
  }

  await writeYaml(join(options.artifactRoot, 'compiler', protocolId, 'summary.yaml'), summary);
  return summary;
}
