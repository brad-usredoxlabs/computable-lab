import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInferenceClient } from '../ai/InferenceClient.js';
import type { InferenceConfig } from '../config/types.js';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';

export interface FoundryArchitectOptions {
  artifactRoot: string;
  protocolId: string;
  variant: FoundryVariant;
  inference?: Partial<InferenceConfig>;
  dryRun?: boolean;
}

export interface ArchitectVerdict {
  kind: 'protocol-foundry-architect-verdict';
  protocolId: string;
  variant: FoundryVariant;
  generated_at: string;
  accepted: boolean;
  qualityScore: number;
  coverageEstimate: number;
  failureClasses: string[];
  missingVerbs: string[];
  missingLabware: string[];
  missingMaterials: string[];
  badEvents: string[];
  badScalingAssumptions: string[];
  recommendedFixes: Array<{
    id: string;
    class: string;
    title: string;
    rationale: string;
    ownedFiles: string[];
    acceptance: string[];
  }>;
  sourceArtifacts: Record<string, string | undefined>;
  architectNotes: string;
}

function artifactPaths(options: FoundryArchitectOptions): Record<string, string | undefined> {
  const root = options.artifactRoot;
  const protocol = options.protocolId;
  const variant = options.variant;
  return {
    compiler: join(root, 'compiler', protocol, `${variant}.yaml`),
    eventGraph: join(root, 'event-graphs', protocol, `${variant}.yaml`),
    executionScale: join(root, 'execution-scale', protocol, `${variant}.yaml`),
    browserReport: join(root, 'browser-review', protocol, variant, 'report.yaml'),
    segment: join(root, 'segments', `${protocol}.yaml`),
    materialContext: join(root, 'material-context', `${protocol}.yaml`),
    text: join(root, 'text', `${protocol}.txt`),
  };
}

async function readIfExists(path: string | undefined): Promise<unknown> {
  if (!path || !existsSync(path)) return undefined;
  if (path.endsWith('.txt')) return await import('node:fs/promises').then((fs) => fs.readFile(path, 'utf-8'));
  return readYamlFile(path);
}

function diagnosticCodes(compiler: Record<string, unknown>): string[] {
  const diagnostics = Array.isArray(compiler['diagnostics']) ? compiler['diagnostics'] : [];
  return diagnostics
    .map((diag) => asRecord(diag)['code'])
    .filter((code): code is string => typeof code === 'string');
}

function deterministicVerdict(input: {
  options: FoundryArchitectOptions;
  compiler: Record<string, unknown>;
  eventGraph: Record<string, unknown>;
  executionScale: Record<string, unknown>;
  browserReport: Record<string, unknown>;
}): ArchitectVerdict {
  const codes = diagnosticCodes(input.compiler);
  const outcome = typeof input.compiler['outcome'] === 'string' ? input.compiler['outcome'] : 'unknown';
  const eventCount = typeof input.compiler['eventCount'] === 'number' ? input.compiler['eventCount'] : 0;
  const blockers = Array.isArray(input.executionScale['blockers']) ? input.executionScale['blockers'] : [];
  const browserStatus = typeof input.browserReport['status'] === 'string' ? input.browserReport['status'] : 'blocked';
  const failureClasses = new Set<string>();
  if (codes.includes('extractor_repair_exhausted') || codes.includes('extractor_empty_candidates') || codes.includes('extractor_empty_choices')) {
    failureClasses.add('extractor_yield');
  }
  if (eventCount === 0) failureClasses.add('event_graph_empty');
  if (blockers.length > 0 || outcome !== 'complete') failureClasses.add('compiler_gap');
  if (browserStatus !== 'pass') failureClasses.add('browser_review');
  if (input.options.variant === 'robot_deck' && blockers.length > 0) failureClasses.add('robot_deck_binding');

  const recommendedFixes: ArchitectVerdict['recommendedFixes'] = [];
  if (failureClasses.has('extractor_yield')) {
    recommendedFixes.push({
      id: 'fix-extractor-yield',
      class: 'extractor_prompt_or_parser',
      title: 'Improve protocol extraction candidate yield',
      rationale: 'Non-empty protocol text produced zero extractor candidates; downstream compiler is operating without structured extraction evidence.',
      ownedFiles: [
        'server/src/extract/OpenAICompatibleExtractor.ts',
        'server/src/extract/runChunkedExtractionService.ts',
        'schema/registry/prompt-templates/chatbot-compile.tagger.system.md',
      ],
      acceptance: [
        'Extraction diagnostics include raw response and parsed failure class.',
        'A focused fixture for this protocol yields at least one candidate or a classified non-protocol reason.',
      ],
    });
  }
  if (failureClasses.has('browser_review')) {
    recommendedFixes.push({
      id: 'fix-browser-rendering',
      class: 'browser_or_labware_rendering',
      title: 'Make event graph render and play in labware-editor',
      rationale: 'Protocol variants cannot be accepted until browser review passes with screenshot evidence.',
      ownedFiles: [
        'client/src',
        'records/seed/labware-definitions',
        'server/src/foundry',
      ],
      acceptance: [
        'Browser review report status is pass.',
        'Screenshot shows expected labware and event sequence.',
      ],
    });
  }
  if (failureClasses.has('robot_deck_binding')) {
    recommendedFixes.push({
      id: 'fix-robot-deck-binding',
      class: 'execution_scaling',
      title: 'Add robot deck defaults or explicit blocker handling',
      rationale: 'Robot-deck variants are repeatedly blocked by missing deck profile, pipette mount, or reservoir binding.',
      ownedFiles: [
        'server/src/compiler/pipeline/CompileContracts.ts',
        'server/src/execution',
        'records/seed/platforms',
      ],
      acceptance: [
        'Robot-deck verdict distinguishes true missing user input from missing platform data.',
        'ASSIST PLUS defaults are applied only when valid for the protocol.',
      ],
    });
  }

  const qualityScore = Math.max(0, Math.min(1,
    0.25 +
    (eventCount > 0 ? 0.25 : 0) +
    (blockers.length === 0 ? 0.2 : 0) +
    (browserStatus === 'pass' ? 0.2 : 0) +
    (!failureClasses.has('extractor_yield') ? 0.1 : 0),
  ));

  return {
    kind: 'protocol-foundry-architect-verdict',
    protocolId: input.options.protocolId,
    variant: input.options.variant,
    generated_at: nowIso(),
    accepted: failureClasses.size === 0,
    qualityScore,
    coverageEstimate: eventCount > 0 ? Math.max(0.1, Math.min(1, eventCount / 20)) : 0,
    failureClasses: Array.from(failureClasses),
    missingVerbs: [],
    missingLabware: [],
    missingMaterials: [],
    badEvents: [],
    badScalingAssumptions: blockers.map((blocker) => String(asRecord(blocker)['message'] ?? asRecord(blocker)['code'] ?? 'execution blocker')),
    recommendedFixes,
    sourceArtifacts: artifactPaths(input.options),
    architectNotes: recommendedFixes.length === 0
      ? 'Deterministic architect gate found no actionable failures.'
      : 'Deterministic architect gate generated patch specs from compiler, scaling, extractor, and browser evidence.',
  };
}

async function llmArchitectNotes(options: FoundryArchitectOptions, context: unknown): Promise<string | undefined> {
  const baseUrl = options.inference?.baseUrl ?? process.env['PI_ARCHITECT_BASE_URL'] ?? process.env['OPENAI_BASE_URL'];
  const model = options.inference?.model ?? process.env['PI_ARCHITECT_MODEL'] ?? process.env['OPENAI_MODEL'];
  if (!baseUrl || !model || options.dryRun) return undefined;
  const client = createInferenceClient({
    baseUrl,
    model,
    temperature: options.inference?.temperature ?? 0.1,
    timeoutMs: options.inference?.timeoutMs ?? 600_000,
    maxTokens: options.inference?.maxTokens ?? 2048,
    enableThinking: options.inference?.enableThinking ?? false,
  });
  const response = await client.complete({
    model,
    temperature: 0.1,
    max_tokens: 2048,
    messages: [
      {
        role: 'system',
        content: 'You are the Protocol Foundry architect. Summarize actionable compiler improvements in concise prose. Do not emit chain-of-thought.',
      },
      {
        role: 'user',
        content: JSON.stringify(context).slice(0, 80_000),
      },
    ],
  });
  const content = response.choices[0]?.message.content;
  return typeof content === 'string' && content.trim() ? content.trim() : undefined;
}

export async function runFoundryArchitectReview(options: FoundryArchitectOptions): Promise<ArchitectVerdict> {
  const paths = artifactPaths(options);
  const [compilerRaw, eventGraphRaw, executionScaleRaw, browserReportRaw, segmentRaw, materialContextRaw, textRaw] = await Promise.all([
    readIfExists(paths.compiler),
    readIfExists(paths.eventGraph),
    readIfExists(paths.executionScale),
    readIfExists(paths.browserReport),
    readIfExists(paths.segment),
    readIfExists(paths.materialContext),
    readIfExists(paths.text),
  ]);
  const verdict = deterministicVerdict({
    options,
    compiler: asRecord(compilerRaw),
    eventGraph: asRecord(eventGraphRaw),
    executionScale: asRecord(executionScaleRaw),
    browserReport: asRecord(browserReportRaw),
  });

  const notes = await llmArchitectNotes(options, {
    verdict,
    compiler: compilerRaw,
    eventGraph: eventGraphRaw,
    executionScale: executionScaleRaw,
    browserReport: browserReportRaw,
    segment: segmentRaw,
    materialContext: materialContextRaw,
    text: typeof textRaw === 'string' ? textRaw.slice(0, 40_000) : undefined,
  }).catch((error: unknown) => `Architect LLM note generation failed: ${error instanceof Error ? error.message : String(error)}`);
  if (notes) verdict.architectNotes = notes;

  const verdictPath = join(options.artifactRoot, 'architect', options.protocolId, options.variant, 'verdict.yaml');
  await writeYamlFile(verdictPath, verdict);
  await writePatchSpecs(options.artifactRoot, verdict);
  return verdict;
}

async function writePatchSpecs(artifactRoot: string, verdict: ArchitectVerdict): Promise<void> {
  const specPaths: string[] = [];
  for (const fix of verdict.recommendedFixes) {
    const path = join(artifactRoot, 'patch-specs', verdict.protocolId, verdict.variant, `${fix.id}.yaml`);
    await writeYamlFile(path, {
      kind: 'protocol-foundry-patch-spec',
      id: `${verdict.protocolId}/${verdict.variant}/${fix.id}`,
      protocolId: verdict.protocolId,
      variant: verdict.variant,
      fixClass: fix.class,
      title: fix.title,
      rationale: fix.rationale,
      ownedFiles: fix.ownedFiles,
      acceptance: fix.acceptance,
      sourceVerdict: join(artifactRoot, 'architect', verdict.protocolId, verdict.variant, 'verdict.yaml'),
    });
    specPaths.push(path);
  }
  await writeYamlFile(join(artifactRoot, 'patch-specs', verdict.protocolId, verdict.variant, 'index.yaml'), {
    kind: 'protocol-foundry-patch-spec-index',
    protocolId: verdict.protocolId,
    variant: verdict.variant,
    patchSpecs: specPaths,
  });
}
