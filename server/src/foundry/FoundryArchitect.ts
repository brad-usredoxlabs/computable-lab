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
    implementationBudget?: {
      targetChangedFiles: number;
      maxChangedFiles: number;
      targetChangedLines: number;
      maxChangedLines: number;
      requireFocusedFixture: boolean;
    };
    coderModelProfile?: {
      model: string;
      guidance: string;
    };
    contextHints?: string[];
    doNotTouch?: string[];
    sourceArtifacts?: Record<string, string | undefined>;
    failureEvidence?: Record<string, unknown>;
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
    assumptions: join(root, 'assumptions', protocol, `${variant}.yaml`),
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function eventThresholdForVariant(variant: FoundryVariant): number {
  return variant === 'manual_tubes' ? 3 : 5;
}

function fixSpecDefaults(paths: Record<string, string | undefined>, evidence: Record<string, unknown>) {
  return {
    implementationBudget: {
      targetChangedFiles: 1,
      maxChangedFiles: 3,
      targetChangedLines: 80,
      maxChangedLines: 220,
      requireFocusedFixture: true,
    },
    coderModelProfile: {
      model: 'Qwen/Qwen3.6-35B-A3B-FP8',
      guidance: 'This coder is capable but works best with narrow ownership, concrete evidence, and one observable behavior change per patch.',
    },
    doNotTouch: [
      'Do not rewrite the pipeline end to end.',
      'Do not create real material-instance, aliquot, or physical inventory records from vendor PDF evidence.',
      'Do not add JSON records data; computable-lab data records must be YAML.',
    ],
    sourceArtifacts: paths,
    failureEvidence: evidence,
  };
}

function stringifyEvidence(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (typeof entry === 'string' && entry.length > 500) return `${entry.slice(0, 500)}...`;
    return entry;
  }).toLowerCase();
}

type EventCoverageFamily = 'centrifuge' | 'wash' | 'incubate' | 'transfer' | 'readout' | 'serial_dilution' | 'general';

function eventCoverageFamily(input: {
  compiler: Record<string, unknown>;
  eventGraph: Record<string, unknown>;
  executionScale: Record<string, unknown>;
}): EventCoverageFamily {
  const evidence = stringifyEvidence({
    diagnostics: input.compiler['diagnostics'],
    gaps: input.compiler['gaps'],
    terminalArtifacts: input.compiler['terminalArtifacts'],
    eventGraph: input.eventGraph,
    blockers: input.executionScale['blockers'],
  });
  if (/\b(centrifuge|spin|pellet|supernatant|rpm|rcf|g-force)\b/.test(evidence)) return 'centrifuge';
  if (/\b(wash|rinse|aspirat|remove supernatant|decant)\b/.test(evidence)) return 'wash';
  if (/\b(incubat|room temperature|37 ?c|heat block|thermomixer|overnight)\b/.test(evidence)) return 'incubate';
  if (/\b(serial dilution|dilution series|standard curve|two[- ]fold|ten[- ]fold)\b/.test(evidence)) return 'serial_dilution';
  if (/\b(absorbance|fluorescence|luminescence|readout|plate reader|spectro|450 ?nm|590 ?nm)\b/.test(evidence)) return 'readout';
  if (/\b(add|transfer|pipet|dispense|aliquot|mix|resuspend)\b/.test(evidence)) return 'transfer';
  return 'general';
}

function eventCoverageSpecDetails(input: {
  family: EventCoverageFamily;
  eventCount: number;
  minUsefulEvents: number;
  isEmpty: boolean;
  variant: FoundryVariant;
}) {
  const commonAcceptance = [
    `This protocol variant compiles to at least ${input.minUsefulEvents} event graph events or emits a specific missing-verb diagnostic naming the unsupported ${input.family.replace('_', ' ')} action.`,
    'The patch handles this one concrete action family only.',
    'A focused regression demonstrates the new event(s) from the supplied protocol artifact.',
  ];
  const commonHints = [
    'Do not try to solve every biology verb in one patch.',
    'Use diagnostics and gaps to pick the single concrete action from this protocol.',
    'Keep provenance/material-instance boundaries intact when adding event lowering.',
  ];
  const details = {
    centrifuge: {
      label: 'centrifuge/spin',
      ownedFiles: [
        'server/src/compiler/biology/verbs/centrifugeVerbs.ts',
        'server/src/compiler/biology/BiologyVerbExpander.test.ts',
      ],
      hints: ['Prefer extending centrifuge/spin lowering instead of broad simple-verb dispatch.'],
    },
    wash: {
      label: 'wash/aspirate',
      ownedFiles: [
        'server/src/compiler/biology/verbs/simpleVerbs.ts',
        'server/src/compiler/biology/BiologyVerbExpander.test.ts',
      ],
      hints: ['Add one wash/aspirate/remove-supernatant mapping with explicit volume/container evidence.'],
    },
    incubate: {
      label: 'incubation',
      ownedFiles: [
        'server/src/compiler/biology/verbs/simpleVerbs.ts',
        'server/src/compiler/biology/BiologyVerbExpander.test.ts',
      ],
      hints: ['Map one incubation/time/temperature phrase into the existing event vocabulary.'],
    },
    transfer: {
      label: 'transfer/add/mix',
      ownedFiles: [
        'server/src/compiler/biology/verbs/simpleVerbs.ts',
        'server/src/compiler/biology/BiologyVerbExpander.test.ts',
      ],
      hints: ['Map one add, transfer, dispense, or mix phrase; do not rewrite the full extraction contract here.'],
    },
    readout: {
      label: 'instrument readout',
      ownedFiles: [
        'server/src/compiler/biology/verbs/simpleVerbs.ts',
        'server/src/compiler/biology/BiologyVerbExpander.test.ts',
        'schema/registry/readout-definitions',
      ],
      hints: ['Represent one absorbance/fluorescence/plate-reader readout without inventing instrument inventory.'],
    },
    serial_dilution: {
      label: 'serial dilution',
      ownedFiles: [
        'server/src/compiler/biology/verbs/simpleVerbs.ts',
        'server/src/compiler/biology/BiologyVerbExpander.test.ts',
      ],
      hints: ['Represent one standard-curve or serial-dilution primitive; leave plate layout optimization to scaling passes.'],
    },
    general: {
      label: 'protocol action',
      ownedFiles: [
        'server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts',
        'server/src/compiler/biology',
        'schema/registry/compile-pipelines/chatbot-compile.yaml',
      ],
      hints: ['Only use this general lane when diagnostics do not identify a more specific biology action family.'],
    },
  }[input.family];
  return {
    id: input.isEmpty ? `fix-event-graph-empty-${input.family}` : `fix-event-graph-coverage-${input.family}`,
    class: `compiler_event_coverage_${input.family}`,
    title: input.isEmpty
      ? `Lower ${details.label} protocol actions into event graph primitives`
      : `Expand tiny event graphs with ${details.label} actions`,
    rationale: `Compiler produced ${input.eventCount} events for a ${input.variant} protocol; this is below the Foundry usefulness threshold of ${input.minUsefulEvents}. The strongest evidence points at ${details.label} coverage.`,
    ownedFiles: details.ownedFiles,
    acceptance: commonAcceptance,
    contextHints: [...commonHints, ...details.hints],
  };
}

function hasMaterialCatalogOrSpecGap(input: {
  compiler: Record<string, unknown>;
  executionScale: Record<string, unknown>;
  materialContext: Record<string, unknown>;
}): boolean {
  const evidence = stringifyEvidence({
    diagnostics: input.compiler['diagnostics'],
    gaps: input.compiler['gaps'],
    terminalArtifacts: input.compiler['terminalArtifacts'],
    blockers: input.executionScale['blockers'],
    materialContext: input.materialContext,
  });
  const materialSignals = [
    'could not materialize',
    'mint_materials',
    'kind material not handled',
    'unresolvedrefs',
    'unresolved refs',
    'material_ref',
    'material-spec',
    'formulation',
    'vendor-product',
    'catalog',
    'certificate of analysis',
    ' coa',
    'reagent',
    'buffer',
    'antibody',
    'enzyme',
    'media',
    'serum',
    'lysis',
  ];
  const physicalInventoryOnlySignals = [
    'material-instance',
    'aliquot',
    'lot number',
    'physical inventory',
    'source tube',
  ];
  return materialSignals.some((signal) => evidence.includes(signal))
    && !physicalInventoryOnlySignals.every((signal) => evidence.includes(signal));
}

function deterministicVerdict(input: {
  options: FoundryArchitectOptions;
  compiler: Record<string, unknown>;
  eventGraph: Record<string, unknown>;
  executionScale: Record<string, unknown>;
  browserReport: Record<string, unknown>;
  materialContext: Record<string, unknown>;
}): ArchitectVerdict {
  const codes = diagnosticCodes(input.compiler);
  const outcome = typeof input.compiler['outcome'] === 'string' ? input.compiler['outcome'] : 'unknown';
  const eventCount = typeof input.compiler['eventCount'] === 'number' ? input.compiler['eventCount'] : 0;
  const paths = artifactPaths(input.options);
  const blockers = asArray(input.executionScale['blockers']);
  const gaps = asArray(input.compiler['gaps']);
  const extractorRepairExhaustedCount = typeof input.compiler['extractorRepairExhaustedCount'] === 'number'
    ? input.compiler['extractorRepairExhaustedCount']
    : 0;
  const browserStatus = typeof input.browserReport['status'] === 'string' ? input.browserReport['status'] : 'blocked';
  const minUsefulEvents = eventThresholdForVariant(input.options.variant);
  const failureClasses = new Set<string>();
  if (extractorRepairExhaustedCount > 0 || codes.includes('extractor_repair_exhausted') || codes.includes('extractor_empty_candidates') || codes.includes('extractor_empty_choices')) {
    failureClasses.add('extractor_yield');
  }
  if (eventCount === 0) failureClasses.add('event_graph_empty');
  if (eventCount > 0 && eventCount < minUsefulEvents) failureClasses.add('event_graph_tiny');
  if (blockers.length > 0 || outcome !== 'complete') failureClasses.add('compiler_gap');
  if (hasMaterialCatalogOrSpecGap({
    compiler: input.compiler,
    executionScale: input.executionScale,
    materialContext: input.materialContext,
  })) {
    failureClasses.add('material_catalog_or_spec_gap');
  }
  if (browserStatus !== 'pass') failureClasses.add('browser_review');
  if (input.options.variant === 'robot_deck' && blockers.length > 0) failureClasses.add('robot_deck_binding');
  const evidence = {
    outcome,
    eventCount,
    minUsefulEvents,
    diagnosticCodes: codes,
    extractorRepairExhaustedCount,
    blockerCount: blockers.length,
    gapCount: gaps.length,
    browserStatus,
  };

  const recommendedFixes: ArchitectVerdict['recommendedFixes'] = [];
  if (failureClasses.has('extractor_yield')) {
    recommendedFixes.push({
      id: 'fix-extractor-contract',
      class: 'extractor_prompt_contract',
      title: 'Make the tagger return structured candidates for protocol steps',
      rationale: 'Non-empty protocol text produced zero extractor candidates; downstream compiler is operating without structured extraction evidence.',
      ownedFiles: [
        'server/src/extract/OpenAICompatibleExtractor.ts',
        'server/src/extract/runChunkedExtractionService.ts',
        'schema/registry/prompt-templates/chatbot-compile.tagger.system.yaml',
      ],
      acceptance: [
        'For this protocol artifact, at least one chunk yields a candidate event, candidate labware, mint material, directive, unresolved reference, or downstream compile job.',
        'Zero-candidate chunks preserve raw model response and a classified reason in diagnostics.',
        'A focused extractor fixture or Foundry regression covers the failing protocol text slice.',
      ],
      contextHints: [
        'Start with the tagger prompt/response contract before changing broad compiler behavior.',
        'Prefer accepting existing useful shapes such as priorLabwareRefs, directives, mintMaterials, and downstreamCompileJobs instead of only candidateEvents.',
      ],
      ...fixSpecDefaults(paths, evidence),
    });
  }
  if (failureClasses.has('event_graph_tiny') || failureClasses.has('event_graph_empty')) {
    const coverageDetails = eventCoverageSpecDetails({
      family: eventCoverageFamily({
        compiler: input.compiler,
        eventGraph: input.eventGraph,
        executionScale: input.executionScale,
      }),
      eventCount,
      minUsefulEvents,
      isEmpty: failureClasses.has('event_graph_empty'),
      variant: input.options.variant,
    });
    recommendedFixes.push({
      id: coverageDetails.id,
      class: coverageDetails.class,
      title: coverageDetails.title,
      rationale: coverageDetails.rationale,
      ownedFiles: coverageDetails.ownedFiles,
      acceptance: coverageDetails.acceptance,
      contextHints: coverageDetails.contextHints,
      ...fixSpecDefaults(paths, evidence),
    });
  }
  if (failureClasses.has('material_catalog_or_spec_gap')) {
    recommendedFixes.push({
      id: 'fix-material-catalog-spec-gap',
      class: 'material_catalog_or_spec_gap',
      title: 'Resolve protocol materials as catalog/spec data without inventing inventory',
      rationale: 'Compiler evidence points at unresolved reagents, buffers, formulations, vendor products, or material tags that should be represented as reusable YAML data or material resolver behavior.',
      ownedFiles: [
        'records/material',
        'records/seed/materials',
        'records/seed/labware-definition',
        'schema/lab/material.schema.yaml',
        'schema/lab/material-spec.schema.yaml',
        'schema/lab/vendor-product.schema.yaml',
        'server/src/compiler/material',
        'server/src/materials',
      ],
      acceptance: [
        'Adds or improves only material, material-spec, vendor-product, or canonical labware-definition/catalog data needed by the source protocol.',
        'Routes containers, tubes, plates, racks, reservoirs, tips, and other physical holders to labware-definition YAML, not material YAML.',
        'Does not create material-instance, aliquot, material-lot, physical inventory, source-tube, or run-specific records from vendor PDF evidence.',
        'Uses ontology refs only when a CURIE/IRI is present in local records or source artifacts; otherwise marks the material as vendor/provenance-backed with an ontology backfill need.',
        'Compiler diagnostics for the protocol show fewer unresolved material/catalog/spec failures, or the patch adds a focused regression documenting the remaining blocker.',
      ],
      contextHints: [
        'Everything that can be data should be YAML data in records/ or schema registry files.',
        'A vendor PDF can justify material, material-spec/formulation, vendor-product, and labware definition/product facts.',
        'A vendor PDF cannot prove that this lab has a tube, aliquot, lot, prepared source, or sample provenance.',
        'Material records describe substances/reagents/concepts such as antibodies, buffers, substrates, and stop solutions. They must not describe plates, tubes, racks, reservoirs, or tips.',
        'Labware definitions must use the canonical records/seed/labware-definition/*.yaml location with $schema, kind, recordId, type: labware_definition, id, display_name, topology/capacity/render_hints as appropriate.',
        'The unattended coder does not have a live OLS/ChEBI lookup tool in this patch lane; do not invent ontology identifiers.',
        'Prefer one reagent family or one vendor kit component family per patch.',
      ],
      ...fixSpecDefaults(paths, evidence),
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
        'records/seed/labware-definition',
        'server/src/foundry',
      ],
      acceptance: [
        'Browser review report status is pass.',
        'Screenshot shows expected labware and event sequence.',
      ],
      contextHints: [
        'Prefer adding or mapping one missing labware icon/geometry at a time.',
        'Tube protocols should render in generic 24x1.5ml, 15ml, or 50ml rack geometry when possible.',
        'New or repaired labware records must use canonical records/seed/labware-definition/*.yaml files, not the legacy records/seed/labware-definitions directory.',
        'Canonical labware-definition records include $schema, kind: labware-definition, recordId, type: labware_definition, id, display_name, topology/capacity/render_hints as appropriate.',
      ],
      ...fixSpecDefaults(paths, evidence),
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
        'server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts',
        'server/src/compiler/pipeline/passes/ExecutionScalePlanPass.test.ts',
        'server/src/registry/ExecutionScaleProfileRegistry.ts',
        'server/src/registry/ExecutionScaleProfileRegistry.test.ts',
        'schema/registry/execution-scale-profiles',
        'schema/workflow/execution-scale-profile.schema.yaml',
        'schema/workflow/execution-scale-plan.schema.yaml',
        'records/seed/platforms',
        'records/seed/labware-definition',
      ],
      acceptance: [
        'Robot-deck verdict distinguishes true missing user input from missing platform data.',
        'ASSIST PLUS defaults are applied only when valid for the protocol.',
      ],
      contextHints: [
        'Patch one platform binding gap at a time.',
        'Prefer YAML execution-scale profile, platform, tool, or labware-definition data when the behavior can be data.',
        'If a repeated blocker is caused by a bad default in an execution-scale profile, patch the profile instead of adding workaround labware.',
        'ASSIST PLUS reagent defaults should use a single shared reservoir/trough unless the protocol or run context explicitly requests a 2-well reservoir.',
      ],
      ...fixSpecDefaults(paths, evidence),
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
        content: [
          'You are the Protocol Foundry architect. Summarize actionable compiler improvements in concise prose.',
          'These notes will feed a Qwen/Qwen3.6-35B-A3B-FP8 coder. It is strong, but specs must be granular, context-rich, and limited to one observable behavior change.',
          'Prefer patch guidance that names source artifacts, exact failure evidence, owned files, a focused fixture, and a small acceptance test.',
          'Do not emit chain-of-thought.',
        ].join('\n'),
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
    materialContext: asRecord(materialContextRaw),
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
      ...(fix.implementationBudget ? { implementationBudget: fix.implementationBudget } : {}),
      ...(fix.coderModelProfile ? { coderModelProfile: fix.coderModelProfile } : {}),
      ...(fix.contextHints ? { contextHints: fix.contextHints } : {}),
      ...(fix.doNotTouch ? { doNotTouch: fix.doNotTouch } : {}),
      ...(fix.sourceArtifacts ? { sourceArtifacts: fix.sourceArtifacts } : {}),
      ...(fix.failureEvidence ? { failureEvidence: fix.failureEvidence } : {}),
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
