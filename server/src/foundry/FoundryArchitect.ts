import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createInferenceClient } from '../ai/InferenceClient.js';
import type { InferenceConfig } from '../config/types.js';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';
import { completeWithCodebaseTools } from './FoundryCodebaseTools.js';

export interface FoundryArchitectOptions {
  artifactRoot: string;
  repoRoot?: string;
  workbenchRoot?: string;
  protocolId: string;
  variant: FoundryVariant;
  appBase?: string;
  apiBase?: string;
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
    coderPatch: join(root, 'code-patches', protocol, variant, 'result.yaml'),
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
      guidance: 'Narrow ownership, concrete evidence, one behavior change.',
    },
    doNotTouch: [
      'Do not rewrite the pipeline end to end.',
      'Do not create real material-instance, aliquot, or physical inventory records from vendor PDF evidence.',
    ],
    sourceArtifacts: paths,
    failureEvidence: evidence,
  };
}

function compactEvidence(value: unknown, maxChars: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === 'string'
    ? value
    : JSON.stringify(value, (_key, entry) => {
      if (typeof entry === 'string' && entry.length > 800) return `${entry.slice(0, 800)}...`;
      return entry;
    }, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]` : text;
}

function stringifyEvidence(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (typeof entry === 'string' && entry.length > 500) return `${entry.slice(0, 500)}...`;
    return entry;
  }).toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  LLM-DRIVEN ARCHITECT VERDICT (primary)                            */
/* ------------------------------------------------------------------ */

async function llmArchitectVerdict(
  options: FoundryArchitectOptions,
  artifacts: {
    text: string | undefined;
    segment: Record<string, unknown>;
    compiler: Record<string, unknown>;
    eventGraph: Record<string, unknown>;
    executionScale: Record<string, unknown>;
    browserReport: Record<string, unknown>;
    materialContext: Record<string, unknown>;
    coderPatch: Record<string, unknown>;
  },
): Promise<{ verdict: ArchitectVerdict; source: 'llm' | 'fallback' }> {
  const baseUrl = options.inference?.baseUrl ?? process.env['PI_ARCHITECT_BASE_URL'] ?? process.env['OPENAI_BASE_URL'];
  const model = options.inference?.model ?? process.env['PI_ARCHITECT_MODEL'] ?? process.env['OPENAI_MODEL'];
  if (!baseUrl || !model || options.dryRun) {
    console.log('[foundry-architect] LLM verdict skipped (no endpoint/dryRun), using deterministic fallback');
    return { verdict: deterministicVerdict(options, artifacts), source: 'fallback' };
  }

  const paths = artifactPaths(options);
  const eventCount = typeof artifacts.compiler['eventCount'] === 'number' ? artifacts.compiler['eventCount'] : 0;

  const client = createInferenceClient({
    baseUrl,
    model,
    temperature: options.inference?.temperature ?? 0.1,
    timeoutMs: options.inference?.timeoutMs ?? 600_000,
    maxTokens: options.inference?.maxTokens ?? 4096,
    enableThinking: options.inference?.enableThinking ?? false,
  });

  const systemPrompt = [
    `You are the Protocol Foundry Architect.`,
    `Your job: analyze WHY the compiler did (or did not) produce a correct event graph from a vendor PDF protocol,`,
    `then recommend specific patches to fix the compiler/pre-compiler/runtime.`,
    ``,
    `PIPELINE:`,
    `  PDF text -> pre-compiler (extract entities/candidates) -> compiler (lower to event graph) -> execution scale (robot binding)`,
    ``,
    `FAILURE CRITERIA (IF ANY APPLY, YOU MUST RECOMMEND FIXES):`,
    `- eventCount < 3: The compiler produced too few events. This is ALWAYS a failure.`,
    `- outcome == "error" or outcome == "gap": The compiler explicitly reported failure.`,
    `- diagnostics contain warnings about shape mismatch, missing verbs, or unresolved refs.`,
    `- compiler output mentions "ai_precompile_shape_mismatch" or "extractor_repair_exhausted".`,
    `- execution scale has blockers (can't bind to robot deck).`,
    `- candidateEvents is empty but PDF text has clear protocol steps.`,
    `- labware/material references in PDF text are not resolved in the compiler output.`,
    ``,
    `YOU ARE GIVEN:`,
    `1. PDF TEXT — the vendor protocol as extracted text (what SHOULD be compiled)`,
    `2. SEGMENTS — pre-compiler output: candidates, entities, labware hints`,
    `3. COMPILER OUTPUT — diagnostics, gaps, terminal artifacts, outcome, eventCount`,
    `4. EVENT GRAPH — the event graph that was produced (if any)`,
    `5. EXECUTION SCALE — robot binding blockers and scaling plan`,
    `6. MATERIAL CONTEXT — materials catalog/spec evidence`,
    `7. PRIOR CODER PATCH — prior patch attempt result (if any)`,
    ``,
    `YOUR ANALYSIS:`,
    `- Read the PDF text to understand the biological protocol (steps, reagents, labware, volumes)`,
    `- Compare against segments: did the pre-compiler extract the right entities?`,
    `- Compare against compiler output: did the compiler correctly lower extracted entities to events?`,
    `- Identify the ROOT CAUSE: missing verb? bad wiring? malformed data? missing labware? shape mismatch?`,
    `- Recommend SPECIFIC fixes with exact files, symbols, and acceptance criteria`,
    ``,
    `FIX LANE CATEGORIES:`,
    `- compiler_event_coverage — the compiler doesn't know a biology verb (add verb lowering)`,
    `- foundry_runtime_wiring — Foundry harness passes stub/empty deps where the real app uses live data`,
    `- precompiler_reference_shape — malformed pre-compiler output (shape mismatch, bad refs)`,
    `- labware_alias_or_resolver — existing labware record exists but compiler can't find it`,
    `- material_catalog_or_spec — unresolved materials/reagents`,
    `- extractor_prompt_contract — pre-compiler extracts zero candidates from text that has content`,
    `- execution_scaling — robot deck/platform binding failures`,
    `- browser_or_labware_rendering — UI doesn't render the event graph correctly`,
    ``,
    `OUTPUT FORMAT (return ONLY this JSON object, no markdown, no prose):`,
    `{
      "outcome": "gap" or "complete" or "error",
      "failureClasses": ["class1", "class2"],
      "qualityScore": 0.0 to 1.0,
      "recommendedFixes": [
        {
          "id": "fix-slug",
          "class": "fix_lane_category",
          "title": "Short title",
          "rationale": "Why this fix is needed",
          "ownedFiles": ["server/src/path/to/file.ts"],
          "acceptance": ["Criterion 1", "Criterion 2"],
          "implementationBudget": {"targetChangedFiles": 1, "maxChangedFiles": 3, "targetChangedLines": 80, "maxChangedLines": 220},
          "coderModelProfile": {"model": "Qwen/Qwen3.6-35B-A3B-FP8"}
        }
      ]
    }`,
    ``,
    `RULES:`,
    `- If eventCount < 3 or outcome is "gap"/"error", ALWAYS recommend at least 1 fix.`,
    `- Each fix targets ONE observable behavior change.`,
    `- Name EXACT files to change (relative to repo root).`,
    `- Include concrete acceptance criteria.`,
    `- If an existing labware/material record is not being found, the fix is WIRING, not adding records.`,
    `- Use Qwen/Qwen3.6-27B-FP8 for complex cross-file patches, 35B-A3B-FP8 for simple ones.`,
    `- Output ONLY valid JSON (no markdown, no prose outside the JSON).`,
  ].join('\n');

  // Trim PDF text to reduce context size
  const maxPdfChars = 6000;
  const trimmedText = artifacts.text && artifacts.text.length > maxPdfChars
    ? artifacts.text.slice(0, maxPdfChars) + '\n... [truncated]'
    : artifacts.text;

  const userContent = [
    `Protocol: ${options.protocolId}`,
    `Variant: ${options.variant}`,
    ``,
    `=== PDF TEXT ===`,
    trimmedText || '(none)',
    ``,
    `=== PRE-COMPILER SEGMENTS ===`,
    compactEvidence(artifacts.segment, 8_000) || '(none)',
    ``,
    `=== COMPILER OUTPUT ===`,
    compactEvidence(artifacts.compiler, 6_000) || '(none)',
    ``,
    `=== EVENT GRAPH ===`,
    compactEvidence(artifacts.eventGraph, 4_000) || '(none)',
    ``,
    `=== EXECUTION SCALE ===`,
    compactEvidence(artifacts.executionScale, 2_000) || '(none)',
    ``,
    `=== MATERIAL CONTEXT ===`,
    compactEvidence(artifacts.materialContext, 3_000) || '(none)',
    ``,
    `=== PRIOR CODER PATCH ===`,
    compactEvidence(artifacts.coderPatch, 2_000) || '(none)',
  ].join('\n');

  try {
    const response = await completeWithCodebaseTools({
      client,
      ...(options.repoRoot ? { repoRoot: options.repoRoot } : {}),
      ...(options.repoRoot ? {
        browserContext: {
          artifactRoot: options.artifactRoot,
          ...(options.workbenchRoot ? { workbenchRoot: options.workbenchRoot } : {}),
          protocolId: options.protocolId,
          variant: options.variant,
          ...(options.appBase ? { appBase: options.appBase } : {}),
          ...(options.apiBase ? { apiBase: options.apiBase } : {}),
        },
      } : {}),
      maxToolRounds: 5,
      request: {
        model,
        temperature: 0.1,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new Error('LLM returned empty response');
    }

    // Extract JSON from response
    const jsonStr = content.replace(/^```(?:json)?\s*|^\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    const verdict = normalizeLlmVerdict(options, paths, parsed, eventCount);
    console.log(`[foundry-architect] LLM verdict: ${verdict.recommendedFixes.length} fixes, ${verdict.failureClasses.length} failure classes`);
    return { verdict, source: 'llm' };
  } catch (err) {
    console.log(`[foundry-architect] LLM verdict failed: ${err instanceof Error ? err.message : String(err)}, using deterministic fallback`);
    return { verdict: deterministicVerdict(options, artifacts), source: 'fallback' };
  }
}

function normalizeLlmVerdict(
  options: FoundryArchitectOptions,
  paths: Record<string, string | undefined>,
  parsed: Record<string, unknown>,
  eventCount: number,
): ArchitectVerdict {
  const evidence = { eventCount, outcome: parsed.outcome };

  const recommendedFixes: ArchitectVerdict['recommendedFixes'] = (Array.isArray(parsed.recommendedFixes) ? parsed.recommendedFixes : [])
    .map((fix: Record<string, unknown>) => ({
      id: String(fix.id ?? 'unknown-fix'),
      class: String(fix.class ?? 'general'),
      title: String(fix.title ?? 'Unspecified fix'),
      rationale: String(fix.rationale ?? ''),
      ownedFiles: Array.isArray(fix.ownedFiles) ? fix.ownedFiles.filter((f): f is string => typeof f === 'string') : [],
      acceptance: Array.isArray(fix.acceptance) ? fix.acceptance.filter((a): a is string => typeof a === 'string') : [],
      contextHints: Array.isArray(fix.contextHints) ? fix.contextHints.filter((h): h is string => typeof h === 'string') : undefined,
      implementationBudget: typeof fix.implementationBudget === 'object' && fix.implementationBudget !== null ? {
        targetChangedFiles: typeof fix.implementationBudget['targetChangedFiles'] === 'number' ? (fix.implementationBudget as Record<string, number>)['targetChangedFiles'] : 1,
        maxChangedFiles: typeof fix.implementationBudget['maxChangedFiles'] === 'number' ? (fix.implementationBudget as Record<string, number>)['maxChangedFiles'] : 3,
        targetChangedLines: typeof fix.implementationBudget['targetChangedLines'] === 'number' ? (fix.implementationBudget as Record<string, number>)['targetChangedLines'] : 80,
        maxChangedLines: typeof fix.implementationBudget['maxChangedLines'] === 'number' ? (fix.implementationBudget as Record<string, number>)['maxChangedLines'] : 220,
        requireFocusedFixture: typeof fix.implementationBudget['requireFocusedFixture'] === 'boolean' ? (fix.implementationBudget as Record<string, unknown>)['requireFocusedFixture'] as boolean : true,
      } : undefined,
      coderModelProfile: typeof fix.coderModelProfile === 'object' && fix.coderModelProfile !== null ? {
        model: String((fix.coderModelProfile as Record<string, unknown>)['model'] ?? 'Qwen/Qwen3.6-35B-A3B-FP8'),
        guidance: String((fix.coderModelProfile as Record<string, unknown>)['guidance'] ?? 'Narrow ownership, concrete evidence, one behavior change.'),
      } : undefined,
      doNotTouch: Array.isArray(fix.doNotTouch) ? fix.doNotTouch.filter((d): d is string => typeof d === 'string') : undefined,
      sourceArtifacts: paths,
      failureEvidence: evidence,
    }));

  const qualityScore = Math.max(0, Math.min(1,
    typeof parsed.qualityScore === 'number' ? parsed.qualityScore :
    0.25 + (eventCount > 0 ? 0.25 : 0),
  ));

  return {
    kind: 'protocol-foundry-architect-verdict',
    protocolId: options.protocolId,
    variant: options.variant,
    generated_at: nowIso(),
    accepted: Array.isArray(parsed.recommendedFixes) && parsed.recommendedFixes.length === 0,
    qualityScore,
    coverageEstimate: typeof parsed.coverageEstimate === 'number' ? parsed.coverageEstimate :
      eventCount > 0 ? Math.max(0.1, Math.min(1, eventCount / 20)) : 0,
    failureClasses: Array.isArray(parsed.failureClasses) ? parsed.failureClasses.filter((f): f is string => typeof f === 'string') : [],
    missingVerbs: Array.isArray(parsed.missingVerbs) ? parsed.missingVerbs.filter((v): v is string => typeof v === 'string') : [],
    missingLabware: Array.isArray(parsed.missingLabware) ? parsed.missingLabware.filter((l): l is string => typeof l === 'string') : [],
    missingMaterials: Array.isArray(parsed.missingMaterials) ? parsed.missingMaterials.filter((m): m is string => typeof m === 'string') : [],
    badEvents: Array.isArray(parsed.badEvents) ? parsed.badEvents.filter((b): b is string => typeof b === 'string') : [],
    badScalingAssumptions: Array.isArray(parsed.badScalingAssumptions) ? parsed.badScalingAssumptions.filter((b): b is string => typeof b === 'string') : [],
    recommendedFixes,
    sourceArtifacts: paths,
    architectNotes: typeof parsed.architectNotes === 'string' ? parsed.architectNotes :
      `LLM architect analysis: ${recommendedFixes.length} fix recommendations.`,
  };
}

/* ------------------------------------------------------------------ */
/*  DETERMINISTIC VERDICT (fallback)                                  */
/* ------------------------------------------------------------------ */

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
      ownedFiles: ['server/src/compiler/biology/verbs/centrifugeVerbs.ts', 'server/src/compiler/biology/BiologyVerbExpander.test.ts'],
      hints: ['Prefer extending centrifuge/spin lowering instead of broad simple-verb dispatch.'],
    },
    wash: {
      label: 'wash/aspirate',
      ownedFiles: ['server/src/compiler/biology/verbs/simpleVerbs.ts', 'server/src/compiler/biology/BiologyVerbExpander.test.ts'],
      hints: ['Add one wash/aspirate/remove-supernatant mapping with explicit volume/container evidence.'],
    },
    incubate: {
      label: 'incubation',
      ownedFiles: ['server/src/compiler/biology/verbs/simpleVerbs.ts', 'server/src/compiler/biology/BiologyVerbExpander.test.ts'],
      hints: ['Map one incubation/time/temperature phrase into the existing event vocabulary.'],
    },
    transfer: {
      label: 'transfer/add/mix',
      ownedFiles: ['server/src/compiler/biology/verbs/simpleVerbs.ts', 'server/src/compiler/biology/BiologyVerbExpander.test.ts'],
      hints: ['Map one add, transfer, dispense, or mix phrase; do not rewrite the full extraction contract here.'],
    },
    readout: {
      label: 'instrument readout',
      ownedFiles: ['server/src/compiler/biology/verbs/simpleVerbs.ts', 'server/src/compiler/biology/BiologyVerbExpander.test.ts', 'schema/registry/readout-definitions'],
      hints: ['Represent one absorbance/fluorescence/plate-reader readout without inventing instrument inventory.'],
    },
    serial_dilution: {
      label: 'serial dilution',
      ownedFiles: ['server/src/compiler/biology/verbs/simpleVerbs.ts', 'server/src/compiler/biology/BiologyVerbExpander.test.ts'],
      hints: ['Represent one standard-curve or serial-dilution primitive; leave plate layout optimization to scaling passes.'],
    },
    general: {
      label: 'protocol action',
      ownedFiles: ['server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts', 'server/src/compiler/biology', 'schema/registry/compile-pipelines/chatbot-compile.yaml'],
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
    'could not materialize', 'mint_materials', 'kind material not handled',
    'unresolvedrefs', 'unresolved refs', 'material_ref', 'material-spec',
    'formulation', 'vendor-product', 'catalog', 'certificate of analysis',
    ' coa', 'reagent', 'buffer', 'antibody', 'enzyme', 'media', 'serum', 'lysis',
  ];
  const physicalInventoryOnlySignals = [
    'material-instance', 'aliquot', 'lot number', 'physical inventory', 'source tube',
  ];
  return materialSignals.some((signal) => evidence.includes(signal))
    && !physicalInventoryOnlySignals.every((signal) => evidence.includes(signal));
}

function hasLabwareAliasOrResolverGap(input: {
  compiler: Record<string, unknown>;
  executionScale: Record<string, unknown>;
  browserReport: Record<string, unknown>;
}): boolean {
  const evidence = stringifyEvidence({
    diagnostics: input.compiler['diagnostics'],
    gaps: input.compiler['gaps'],
    terminalArtifacts: input.compiler['terminalArtifacts'],
    blockers: input.executionScale['blockers'],
    browserReport: input.browserReport,
  });
  return (
    evidence.includes('no matching labware in prior snapshot')
    || evidence.includes('missing_sample_labware_definition')
    || evidence.includes('labware-definition:')
    || /\bgeneric[_-](?:\d+[_-])?(?:well[_-])?(?:plate|reservoir|tube[_-]rack|rack)\b/.test(evidence)
  ) && /\b(labware|plate|reservoir|tube[_ -]?rack|rack|tiprack|well[_ -]?plate)\b/.test(evidence);
}

function hasFoundryRuntimeWiringGap(input: {
  compiler: Record<string, unknown>;
  executionScale: Record<string, unknown>;
  browserReport: Record<string, unknown>;
}): boolean {
  const evidence = stringifyEvidence({
    diagnostics: input.compiler['diagnostics'],
    gaps: input.compiler['gaps'],
    terminalArtifacts: input.compiler['terminalArtifacts'],
    blockers: input.executionScale['blockers'],
    browserReport: input.browserReport,
  });
  return evidence.includes('no matching labware in prior snapshot')
    || evidence.includes('pass skipped by when')
    || evidence.includes('resolve_labware')
    || evidence.includes('foundry_presegmented');
}

function hasPrecompilerReferenceShapeGap(input: {
  compiler: Record<string, unknown>;
}): boolean {
  const evidence = stringifyEvidence({
    diagnostics: input.compiler['diagnostics'],
    gaps: input.compiler['gaps'],
  });
  return evidence.includes('ai_precompile_shape_mismatch')
    && (
      evidence.includes('kind undefined not handled by resolve_references')
      || evidence.includes('malformed character-index')
      || evidence.includes('character-index object')
      || /"\d+"\s*:\s*"[a-z0-9 _.-]"/.test(evidence)
    )
    || evidence.includes('kind undefined not handled by resolve_references')
    || evidence.includes('undefined (undefined)')
    || /"0"\s*:\s*"[a-z0-9 ]"/.test(evidence);
}

function deterministicVerdict(
  options: FoundryArchitectOptions,
  artifacts: {
    compiler: Record<string, unknown>;
    eventGraph: Record<string, unknown>;
    executionScale: Record<string, unknown>;
    browserReport: Record<string, unknown>;
    materialContext: Record<string, unknown>;
  },
): ArchitectVerdict {
  const { compiler, eventGraph, executionScale, browserReport, materialContext } = artifacts;
  const codes = diagnosticCodes(compiler);
  const outcome = typeof compiler['outcome'] === 'string' ? compiler['outcome'] : 'unknown';
  const eventCount = typeof compiler['eventCount'] === 'number' ? compiler['eventCount'] : 0;
  const paths = artifactPaths(options);
  const blockers = asArray(executionScale['blockers']);
  const gaps = asArray(compiler['gaps']);
  const extractorRepairExhaustedCount = typeof compiler['extractorRepairExhaustedCount'] === 'number'
    ? compiler['extractorRepairExhaustedCount']
    : 0;
  const browserStatus = typeof browserReport['status'] === 'string' ? browserReport['status'] : 'blocked';
  const minUsefulEvents = eventThresholdForVariant(options.variant);
  const failureClasses = new Set<string>();

  if (extractorRepairExhaustedCount > 0 || codes.includes('extractor_repair_exhausted') || codes.includes('extractor_empty_candidates') || codes.includes('extractor_empty_choices')) {
    failureClasses.add('extractor_yield');
  }
  if (eventCount === 0) failureClasses.add('event_graph_empty');
  if (eventCount > 0 && eventCount < minUsefulEvents) failureClasses.add('event_graph_tiny');
  if (blockers.length > 0 || outcome !== 'complete') failureClasses.add('compiler_gap');
  if (hasMaterialCatalogOrSpecGap({ compiler, executionScale, materialContext })) {
    failureClasses.add('material_catalog_or_spec_gap');
  }
  if (hasLabwareAliasOrResolverGap({ compiler, executionScale, browserReport })) {
    failureClasses.add('labware_alias_or_resolver_gap');
  }
  if (hasFoundryRuntimeWiringGap({ compiler, executionScale, browserReport })) {
    failureClasses.add('foundry_runtime_wiring_gap');
  }
  if (hasPrecompilerReferenceShapeGap({ compiler })) {
    failureClasses.add('precompiler_reference_shape_gap');
  }
  if (browserStatus !== 'pass') failureClasses.add('browser_review');
  if (options.variant === 'robot_deck' && blockers.length > 0) failureClasses.add('robot_deck_binding');

  const evidence = {
    outcome, eventCount, minUsefulEvents, diagnosticCodes: codes,
    extractorRepairExhaustedCount, blockerCount: blockers.length, gapCount: gaps.length, browserStatus,
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
      family: eventCoverageFamily({ compiler, eventGraph, executionScale }),
      eventCount, minUsefulEvents,
      isEmpty: failureClasses.has('event_graph_empty'),
      variant: options.variant,
    });
    recommendedFixes.push({ ...coverageDetails, ...fixSpecDefaults(paths, evidence) });
  }
  if (failureClasses.has('foundry_runtime_wiring_gap')) {
    recommendedFixes.push({
      id: 'fix-foundry-runtime-wiring-gap',
      class: 'foundry_runtime_wiring_gap',
      title: 'Wire Foundry compile dependencies to the real compiler runtime',
      rationale: 'Foundry-specific runs are producing compiler gaps that look like missing resolver dependencies or skipped runtime wiring rather than missing protocol records. The architect may patch Foundry harness wiring, dependency injection, and focused Foundry regressions.',
      ownedFiles: [
        'server/src/foundry/ProtocolFoundryCompileRunner.ts',
        'server/src/foundry/ProtocolFoundryCompileRunner.test.ts',
        'server/src/tools/protocolFoundryCompile.ts',
        'server/src/tools/protocolFoundryLoop.ts',
        'server/src/ai/runChatbotCompile.ts',
        'server/src/ai/compiler/labwareLookup.ts',
        'server/src/ai/compiler/labwareLookup.test.ts',
      ],
      acceptance: [
        'Foundry compile runs use the same real lookup/resolver dependencies as the main app when local seed records exist.',
        'Does not hard-code one protocol ID or one vendor PDF.',
        'Adds a focused regression proving a Foundry compile dependency is no longer stubbed or empty when seed data can satisfy it.',
        'Compiler diagnostics for the source protocol lose at least one resolver/wiring gap, or the remaining gap is classified more specifically.',
      ],
      contextHints: [
        'This lane is for the Foundry harness around the compiler, not for adding new biology data records.',
        'A likely failure pattern is a Foundry runner passing an always-empty lookup function where the main app uses a real RecordStore-backed lookup.',
        'Patch dependency wiring before adding YAML. Existing records should be found before new records are minted.',
        'Keep changes local to Foundry runtime wiring unless the regression proves a shared compiler API needs a small extension.',
      ],
      ...fixSpecDefaults(paths, evidence),
    });
  }
  if (failureClasses.has('precompiler_reference_shape_gap')) {
    recommendedFixes.push({
      id: 'fix-precompiler-reference-shape-gap',
      class: 'precompiler_reference_shape_gap',
      title: 'Normalize malformed precompiler unresolved reference shapes',
      rationale: 'Compiler gaps contain malformed unresolved references, undefined kinds, or character-index objects. This is a precompiler/AI-output normalization problem, not permission to add duplicate records.',
      ownedFiles: [
        'server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts',
        'server/src/compiler/pipeline/passes/AiPrecompileShapeMismatch.log.test.ts',
        'server/src/compiler/pipeline/passes/ResolveReferences.test.ts',
        'server/src/compiler/pipeline/passes/DeterministicPrecompilePass.ts',
        'server/src/compiler/pipeline/passes/DeterministicPrecompilePass.test.ts',
        'server/src/compiler/precompile/TaggerOutput.ts',
        'schema/registry/prompt-templates/chatbot-compile.precompile.system.yaml',
      ],
      acceptance: [
        'Malformed unresolved references are normalized into structured refs with label/kind/reason fields or dropped with a diagnostic naming the invalid shape.',
        'Character-index object refs no longer appear in compiler gaps.',
        'The patch includes a focused regression for the malformed shape seen in the source compiler artifact.',
        'Does not add material or labware records to mask malformed precompiler output.',
      ],
      contextHints: [
        'Look for ai_precompile shape mismatch, unresolvedRefs coercion, and resolve_references handling of undefined kind.',
        'This lane should repair contracts and normalization boundaries before resolver/data lanes run.',
        'Prefer preserving raw response diagnostics while converting useful malformed entries into structured references.',
      ],
      ...fixSpecDefaults(paths, evidence),
    });
  }
  if (failureClasses.has('labware_alias_or_resolver_gap')) {
    recommendedFixes.push({
      id: 'fix-labware-alias-resolver-gap',
      class: 'labware_alias_or_resolver_gap',
      title: 'Resolve existing labware definitions through compiler aliases or Foundry lookup wiring',
      rationale: 'Compiler/browser evidence shows labware hints such as generic plates, reservoirs, or tube racks are being treated as missing even though canonical labware-definition records may already exist. This is a resolver, alias, lookup, or Foundry wiring gap rather than permission to recreate labware records.',
      ownedFiles: [
        'server/src/foundry/ProtocolFoundryCompileRunner.ts',
        'server/src/foundry/ProtocolFoundryCompileRunner.test.ts',
        'server/src/ai/compiler/labwareLookup.ts',
        'server/src/ai/compiler/labwareLookup.test.ts',
        'server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts',
        'server/src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts',
        'server/src/compiler/pipeline/passes/ResolvePriorLabwareReferences.test.ts',
        'server/src/compiler/precompile/NounPhraseResolver.ts',
        'server/src/compiler/precompile/NounPhraseResolver.test.ts',
      ],
      acceptance: [
        'Does not create or rewrite labware-definition YAML records for this fix class.',
        'Maps unresolved labware hints such as generic_96_well_plate, generic_24x1_5ml_tube_rack, generic_12_well_reservoir, or equivalent prose to existing canonical labware-definition records when they exist.',
        'Foundry compile runs use real seed labware lookup or deterministic alias resolution instead of an always-empty labware lookup.',
        'Compiler diagnostics for the source protocol no longer report the same labware hint as unresolved, or a focused regression proves the hint resolves to an existing canonical record.',
      ],
      contextHints: [
        'This is the widened architect lane for existing labware capability that is not being found.',
        'The correct patch is usually compiler lookup wiring, an alias normalization map, a resolver fallback, or a focused regression. It is not another attempt to add records/seed/labware-definition/lbw-def-generic-96-well-plate.yaml.',
        'If the file already exists under records/seed/labware-definition, do not add it again. Teach the compiler or Foundry runner to find it.',
        'Prior-labware refs are run-context instances; vendor PDFs and Foundry assumptions can point to a labware definition but must not invent physical labware instances.',
        'Keep the patch narrow: one alias family or one Foundry lookup wiring behavior per patch.',
      ],
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
        'records/material', 'records/seed/materials', 'schema/lab/material.schema.yaml',
        'schema/lab/material-spec.schema.yaml', 'schema/lab/vendor-product.schema.yaml',
        'server/src/compiler/material', 'server/src/materials',
      ],
      acceptance: [
        'Adds or improves only material, material-spec, vendor-product, or material resolver/catalog data needed by the source protocol.',
        'Does not create or modify labware-definition YAML; containers, tubes, plates, racks, reservoirs, tips, and other physical holders must go through a labware-specific fix class.',
        'Does not create material-instance, aliquot, material-lot, physical inventory, source-tube, or run-specific records from vendor PDF evidence.',
        'Uses ontology refs only when a CURIE/IRI is present in local records or source artifacts; otherwise marks the material as vendor/provenance-backed with an ontology backfill need.',
        'Compiler diagnostics for the protocol show fewer unresolved material/catalog/spec failures, or the patch adds a focused regression documenting the remaining blocker.',
      ],
      contextHints: [
        'Everything that can be data should be YAML data in records/ or schema registry files.',
        'A vendor PDF can justify material, material-spec/formulation, vendor-product, and labware definition/product facts.',
        'A vendor PDF cannot prove that this lab has a tube, aliquot, lot, prepared source, or sample provenance.',
        'Material records describe substances/reagents/concepts such as antibodies, buffers, substrates, and stop solutions. They must not describe plates, tubes, racks, reservoirs, or tips.',
        'The unattended coder does not have a live OLS/ChEBI lookup tool in this patch lane; do not invent ontology identifiers.',
        'Prefer one reagent family or one vendor kit component family per patch.',
        'If the unresolved item is a plate, tube rack, reservoir, tip rack, or other existing labware definition that is not being found, use the labware_alias_or_resolver_gap lane instead of adding a new record.',
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
      ownedFiles: ['client/src', 'records/seed/labware-definition', 'server/src/foundry'],
      acceptance: [
        'Browser review report status is pass.',
        'Screenshot shows expected labware and event sequence.',
      ],
      contextHints: [
        'Prefer adding or mapping one missing labware icon/geometry at a time.',
        'If the blocker is that an existing labware-definition record is not being resolved, use the labware_alias_or_resolver_gap lane and patch resolver/lookup wiring instead of creating duplicate labware records.',
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
        'records/seed/platforms', 'records/seed/labware-definition',
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
    protocolId: options.protocolId,
    variant: options.variant,
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
    sourceArtifacts: paths,
    architectNotes: recommendedFixes.length === 0
      ? 'Deterministic architect gate found no actionable failures.'
      : `Deterministic fallback: ${recommendedFixes.length} fix recommendations.`,
  };
}

/* ------------------------------------------------------------------ */
/*  MAIN ENTRY                                                        */
/* ------------------------------------------------------------------ */

export async function runFoundryArchitectReview(options: FoundryArchitectOptions): Promise<ArchitectVerdict> {
  const paths = artifactPaths(options);
  const [
    textRaw, segmentRaw, compilerRaw, eventGraphRaw,
    executionScaleRaw, browserReportRaw, coderPatchRaw,
    materialContextRaw,
  ] = await Promise.all([
    readIfExists(paths.text),
    readIfExists(paths.segment),
    readIfExists(paths.compiler),
    readIfExists(paths.eventGraph),
    readIfExists(paths.executionScale),
    readIfExists(paths.browserReport),
    readIfExists(paths.coderPatch),
    readIfExists(paths.materialContext),
  ]);

  const artifacts = {
    text: typeof textRaw === 'string' ? textRaw : undefined,
    segment: asRecord(segmentRaw),
    compiler: asRecord(compilerRaw),
    eventGraph: asRecord(eventGraphRaw),
    executionScale: asRecord(executionScaleRaw),
    browserReport: asRecord(browserReportRaw),
    materialContext: asRecord(materialContextRaw),
    coderPatch: asRecord(coderPatchRaw),
  };

  // LLM-driven verdict is primary; deterministic is fallback
  const { verdict, source } = await llmArchitectVerdict(options, artifacts);
  console.log(`[foundry-architect] verdict source: ${source}`);

  const verdictPath = join(options.artifactRoot, 'architect', options.protocolId, options.variant, 'verdict.yaml');
  await writeYamlFile(verdictPath, verdict);
  await writePatchSpecs(options.artifactRoot, verdict);
  return verdict;
}

/* ------------------------------------------------------------------ */
/*  PATCH SPEC WRITING                                                */
/* ------------------------------------------------------------------ */

async function writePatchSpecs(artifactRoot: string, verdict: ArchitectVerdict): Promise<void> {
  const specPaths: string[] = [];
  const specDir = join(artifactRoot, 'patch-specs', verdict.protocolId, verdict.variant);
  const expectedSpecFiles = new Set(verdict.recommendedFixes.map((fix) => `${fix.id}.yaml`));

  if (existsSync(specDir)) {
    const existingFiles = await readdir(specDir);
    await Promise.all(existingFiles
      .filter((file) => file.endsWith('.yaml') && file !== 'index.yaml' && !expectedSpecFiles.has(file))
      .map((file) => rm(join(specDir, file), { force: true })));
  }

  for (const fix of verdict.recommendedFixes) {
    const path = join(specDir, `${fix.id}.yaml`);
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
      architectNotes: verdict.architectNotes,
      sourceVerdict: join(artifactRoot, 'architect', verdict.protocolId, verdict.variant, 'verdict.yaml'),
    });
    specPaths.push(path);
  }

  await writeYamlFile(join(specDir, 'index.yaml'), {
    kind: 'protocol-foundry-patch-spec-index',
    protocolId: verdict.protocolId,
    variant: verdict.variant,
    patchSpecs: specPaths,
  });
}
