import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import YAML from 'yaml';
import { getLabwareDefinitionRegistry, type LabwareDefinitionRecord } from '../registry/LabwareDefinitionRegistry.js';
import { createLabwareLookup } from '../ai/compiler/labwareLookup.js';
import { createInferenceClient } from '../ai/InferenceClient.js';
import { runChatbotCompile, type RunChatbotCompileResult } from '../ai/runChatbotCompile.js';
import type { InferenceConfig } from '../config/types.js';
import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
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
  foundryTestAssumptions: FoundryTestAssumptionProfile;
  browserReview: {
    routeTemplate: '/labware-editor?id=<eventGraphRecordId>';
    importRequired: true;
  };
}

interface FoundrySyntheticAnswer {
  questionClass: string;
  answer: string | number | boolean | Record<string, unknown> | string[];
  rationale: string;
}

interface FoundryTestAssumptionProfile {
  kind: 'protocol-foundry-test-assumption-profile';
  protocolId: string;
  variant: FoundryVariant;
  mode: 'deterministic_test_assumptions';
  acceptanceLevel: 'test_compile_only';
  selectionPolicy: {
    multipleChoice: 'first_valid_option';
    freeTextClarification: 'match_question_to_profile_else_first_valid_option';
    randomization: 'disabled';
  };
  syntheticAnswers: FoundrySyntheticAnswer[];
  provenance: {
    syntheticInputs: true;
    createsMaterialInstances: false;
    createsPhysicalInventory: false;
    note: string;
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

function foundryTestAssumptionProfile(protocolId: string, variant: FoundryVariant): FoundryTestAssumptionProfile {
  const sampleLayout = variant === 'manual_tubes'
    ? {
        sampleCount: 8,
        sourceLabware: 'generic_24x1_5ml_tube_rack',
        sourcePositions: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2'],
      }
    : {
        sampleCount: 8,
        sourceLabware: 'generic_96_well_plate',
        sourcePositions: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'],
      };
  return {
    kind: 'protocol-foundry-test-assumption-profile',
    protocolId,
    variant,
    mode: 'deterministic_test_assumptions',
    acceptanceLevel: 'test_compile_only',
    selectionPolicy: {
      multipleChoice: 'first_valid_option',
      freeTextClarification: 'match_question_to_profile_else_first_valid_option',
      randomization: 'disabled',
    },
    syntheticAnswers: [
      {
        questionClass: 'multiple_choice',
        answer: 'Select the first biologically valid option. If options are lettered, choose A only when A is valid.',
        rationale: 'Determinism makes regression comparisons meaningful across Foundry runs.',
      },
      {
        questionClass: 'sample_count_and_layout',
        answer: sampleLayout,
        rationale: 'Eight samples exercise single-channel, multichannel, and first-column plate logic without requiring a full 96-sample run.',
      },
      {
        questionClass: 'sample_provenance',
        answer: {
          provenanceId: `SYNTHETIC-FOUNDRY-SAMPLE-SET-${protocolId}`,
          description: 'Synthetic Foundry test samples for compiler stress testing only.',
        },
        rationale: 'Unblocks event graph generation while preserving that no real sample provenance was supplied.',
      },
      {
        questionClass: 'lot_or_physical_inventory',
        answer: {
          lot: 'SYNTHETIC-LOT-FOUNDRY-TEST',
          sourceTube: 'SYNTHETIC-SOURCE-TUBE-1',
        },
        rationale: 'Provides deterministic test handles but must not be promoted to real material-instance records.',
      },
      {
        questionClass: 'missing_coa_or_vendor_default',
        answer: 'Use the explicit value printed in the vendor protocol when present; otherwise use a synthetic COA placeholder and continue with a warning.',
        rationale: 'Foundry improvement mode should expose compiler and renderer gaps instead of stopping on missing lot-specific COA data.',
      },
      {
        questionClass: 'manual_labware',
        answer: {
          tubeRack: 'generic_24x1_5ml_tube_rack',
          conical15mlRack: 'generic_6x15ml_tube_rack',
          conical50mlRack: 'generic_4x50ml_tube_rack',
        },
        rationale: 'Tube-heavy protocols need concrete rack geometry for browser review.',
      },
      {
        questionClass: 'bench_plate_labware',
        answer: {
          plate: 'generic_96_well_plate',
          reservoir: 'generic_12_well_reservoir',
          pipette: '8_channel_multichannel',
          tips: 'generic_96_tip_rack',
        },
        rationale: 'Exercises the manual-to-plate scaling path consistently.',
      },
      {
        questionClass: 'robot_deck_binding',
        answer: {
          platform: 'integra_assist',
          deckProfile: 'assist_plus_default',
          reservoir: 'generic_12_well_reservoir',
          pipette: '8_channel_multichannel',
        },
        rationale: 'Exercises robot deck lowering while making platform assumptions explicit.',
      },
    ],
    provenance: {
      syntheticInputs: true,
      createsMaterialInstances: false,
      createsPhysicalInventory: false,
      note: 'These assumptions are only for Foundry compiler stress testing. They are not scientific truth and must not be accepted as real run context.',
    },
  };
}

function buildPrompt(input: {
  protocolId: string;
  variant: FoundryVariant;
  protocolText: string;
  materialContext?: Record<string, unknown>;
  assumptions: FoundryTestAssumptionProfile;
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
    '- Foundry test mode is enabled. If you would normally ask the user for clarification, use the deterministic Foundry test assumptions below instead of stopping.',
    '- Treat these assumptions as test compile inputs only. Mark them as assumptions/provenance in outputs; do not promote them to real inventory or real material-instance records.',
    '- If a clarification presents options, choose the first biologically valid option. Do not use random choices.',
    '- If execution scaling lacks sample count, labware definition, pipette capability, or platform binding, use the matching Foundry test assumption below before emitting a blocker.',
    '',
    'Foundry deterministic test assumptions YAML:',
    YAML.stringify(input.assumptions),
    '',
    'Material/labware context YAML:',
    input.materialContext ? YAML.stringify(input.materialContext) : '(none provided)',
    '',
    'Protocol text:',
    input.protocolText,
  ].join('\n');
}

const PROTOCOL_ACTION_ALIASES: Array<[RegExp, string]> = [
  [/\b(add|combine|dispense|pipette|transfer|load)\b/i, 'transfer'],
  [/\b(mix|vortex|resuspend)\b/i, 'mix'],
  [/\b(incubate|culture)\b/i, 'incubate'],
  [/\b(wash|rinse)\b/i, 'wash'],
  [/\b(centrifuge|spin)\b/i, 'spin'],
  [/\b(pellet)\b/i, 'pellet'],
  [/\b(elute)\b/i, 'elute'],
  [/\b(read|measure|quantify|image|scan)\b/i, 'read'],
  [/\b(seed|plate)\b/i, 'seed'],
  [/\b(dilute|prepare)\b/i, 'prepare'],
  [/\b(run)\b/i, 'run_protocol'],
];

function protocolActionVerb(text: string): string | null {
  for (const [pattern, verb] of PROTOCOL_ACTION_ALIASES) {
    if (pattern.test(text)) return verb;
  }
  return null;
}

function isFoundryPromptBoilerplate(line: string): boolean {
  return /^(- |rules:|protocol foundry compile target:|execution variant:|foundry deterministic test assumptions yaml:|material\/labware context yaml:|protocol text:)/i.test(line.trim());
}

export function extractPresegmentedFoundryCandidates(text: string): Array<{
  target_kind: string;
  draft: Record<string, unknown>;
  confidence: number;
}> {
  const candidates: Array<{
    target_kind: string;
    draft: Record<string, unknown>;
    confidence: number;
  }> = [];
  const lines = text
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12 && !isFoundryPromptBoilerplate(line));

  for (const line of lines) {
    const verb = protocolActionVerb(line);
    if (!verb) continue;
    candidates.push({
      target_kind: 'protocol-action',
      draft: {
        phrase: line.slice(0, 500),
        verb,
        section: 'protocol_steps',
        source: 'foundry_presegmented_text',
      },
      confidence: 0.62,
    });
    if (candidates.length >= 80) break;
  }

  return candidates;
}

function presegmentedExtractionService(): ExtractionRunnerService {
  return {
    async run(args: RunExtractionServiceArgs) {
      const candidates = extractPresegmentedFoundryCandidates(args.text);
      if (candidates.length > 0) {
        return {
          candidates,
          diagnostics: [{
            severity: 'info',
            code: 'foundry_presegmented_candidates',
            message: `Protocol Foundry supplied ${candidates.length} deterministic candidates from presegmented text.`,
          }],
        };
      }
      return {
        candidates: [],
        diagnostics: [{
          severity: 'info',
          code: 'foundry_presegmented_no_actionable_candidates',
          message: 'Protocol Foundry supplied presegmented text, but this chunk had no deterministic protocol-action evidence.',
        }],
      };
    },
  } as unknown as ExtractionRunnerService;
}

function nullLlmClient(variant?: FoundryVariant): LlmClient {
  // When the LLM is unavailable (dry-run / no inference config), fall back to
  // deterministic labware hints from the Foundry test assumption profile so that
  // the resolve_labware pass is not skipped and existing canonical labware
  // definitions are resolved through the alias map.
  const variantLabwareHints: Record<FoundryVariant, string[]> = {
    manual_tubes: ['generic_24x1_5ml_tube_rack'],
    bench_plate_multichannel: ['generic_96_well_plate', 'generic_12_well_reservoir'],
    robot_deck: ['generic_96_well_plate', 'generic_12_well_reservoir'],
  };
  const hints = variant ? (variantLabwareHints[variant] ?? []) : [];
  return {
    async complete() {
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              tags: [],
              candidateEvents: [],
              candidateLabwares: hints.map((hint) => ({ hint, reason: 'deterministic_foundry_assumption' })),
              unresolvedRefs: [],
            }),
          },
        }],
      };
    },
  };
}

function createLlmClient(options: ProtocolFoundryCompileOptions, variant?: FoundryVariant): LlmClient {
  return createInferenceClient({
    ...(options.inference ?? {}),
    variant,
  });
}
function labwareDefinitionEnvelope(record: LabwareDefinitionRecord): RecordEnvelope<Record<string, unknown>> {
  return {
    recordId: record.recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
    payload: {
      ...record,
      name: record.display_name,
      aliases: [
        record.id,
        record.display_name,
        ...(record.platform_aliases?.map((alias) => alias.alias) ?? []),
        ...(record.compatibility_tags ?? []),
      ],
    },
  };
}

export function createFoundryLabwareLookup(): (hint: string) => Promise<Array<{ recordId: string; title: string }>> {
  // Foundry stress tests mostly use deterministic assumption aliases such as
  // generic_96_well_plate. The main app backs this helper with RecordStore; the
  // Foundry CLI can exercise the same resolver with read-only registry records.
  const foundryLabwareStore = {
    list: async () => getLabwareDefinitionRegistry().list().map(labwareDefinitionEnvelope),
  };
  return createLabwareLookup(foundryLabwareStore as unknown as RecordStore);
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
  if (kind === '1_well_reservoir') return 'reservoir_1';
  if (kind === '12_well_reservoir') return 'reservoir_12';
  if (kind === '8_well_reservoir') return 'reservoir_8';
  if (kind === '2_well_reservoir') return 'reservoir_2';
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

function extractorRepairExhaustedCount(result: RunChatbotCompileResult): number {
  return result.diagnostics.filter((diagnostic) => asRecord(diagnostic)['code'] === 'extractor_repair_exhausted').length;
}

function foundryOutcome(result: RunChatbotCompileResult, events: PlateEventPrimitive[]): 'complete' | 'gap' | 'error' {
  if (result.outcome === 'error') return 'error';
  if (events.length === 0) return 'gap';
  if (blockedBy(result) > 0) return 'gap';
  if (extractorRepairExhaustedCount(result) > 0) return 'gap';
  return result.outcome === 'complete' ? 'complete' : 'gap';
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
  variant: FoundryVariant;
}) {
  const { options, variant } = input;
  const labwareLookup = createFoundryLabwareLookup();

  return runChatbotCompile({
    prompt: buildPrompt({ input: options.segmentPath, variant }),
    inference: options.inference,
    recordStore: options.recordStore,
    labwareLookup,
    variant,
  });
}

export async function runProtocolFoundryCompile(options: ProtocolFoundryCompileOptions): Promise<ProtocolFoundryCompileSummary> {
  const variants = options.variants ?? FOUNDRY_VARIANTS;
  const protocolId = options.protocolId ?? slugify(options.segmentPath);
  const artifactRoot = options.artifactRoot;

  const variantResults = await Promise.all(
    variants.map(async (variant) => {
      const llmClient = createLlmClient(options, variant);
      const labwareLookup = createFoundryLabwareLookup();

      const result = await runChatbotCompile({
        prompt: buildPrompt({ input: options.segmentPath, variant }),
        llmClient,
        labwareLookup,
        variant,
        dryRun: options.dryRun,
      });

      const labwares = buildLabwares(result.events, undefined, variant);
      const events = normalizeEvents(result.events, labwares);
      const outcome = foundryOutcome(result, events);

      if (!options.dryRun) {
        await mkdir(artifactRoot, { recursive: true });
        await writeYaml(join(artifactRoot, `event-graph-${variant}.yaml`), result.eventGraph);
        await writeYaml(join(artifactRoot, `execution-scale-${variant}.yaml`), result.executionScale);
        await writeYaml(join(artifactRoot, `compiler-${variant}.yaml`), result.compilerOutput);
      }

      return {
        variant,
        outcome,
        eventGraphArtifact: join(artifactRoot, `event-graph-${variant}.yaml`),
        executionScaleArtifact: join(artifactRoot, `execution-scale-${variant}.yaml`),
        compilerArtifact: join(artifactRoot, `compiler-${variant}.yaml`),
        eventCount: events.length,
        blockerCount: blockedBy(result),
      };
    })
  );

  return {
    kind: 'protocol-foundry-compile-summary',
    protocolId,
    artifactRoot,
    variants: variantResults,
  };
}
