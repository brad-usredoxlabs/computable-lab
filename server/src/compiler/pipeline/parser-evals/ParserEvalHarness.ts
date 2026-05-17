import { createDeterministicPrecompilePass } from '../passes/DeterministicPrecompilePass.js';
import type { DeterministicPrecompileDeps } from '../passes/DeterministicPrecompilePass.js';
import {
  createDeterministicPlanConsolidationPass,
  createEmitInstrumentApplianceJobsPass,
  createEmitInstrumentRunFilesPass,
  createEvaluateInstrumentExecutionReadinessPass,
  createExpandBiologyVerbsPass,
} from '../passes/ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import type { ProtocolIntent } from '../../protocolIntent/ProtocolIntent.js';
import {
  createProtocolIntentStatePlanPass,
  type ProtocolIntentStatePlannerOutput,
} from '../../protocolIntent/ProtocolIntentStatePlanner.js';
import {
  createValidateProtocolIntentPass,
  type ProtocolIntentValidationOutput,
} from '../../protocolIntent/ProtocolIntentValidation.js';
import {
  createLowerProtocolIntentPass,
  type ProtocolIntentLoweringOutput,
} from '../../protocolIntent/ProtocolIntentLowering.js';
import {
  createExpandProtocolIntentPatternsPass,
  type ProtocolIntentPatternExpansionOutput,
} from '../../protocolIntent/ProtocolIntentPatternExpanders.js';

import '../../artifacts/GeminiEmEmitter.js';

export interface ParserEvalRegistry {
  verbs?: Record<string, string>;
  labware?: Record<string, string>;
  materials?: Record<string, string>;
}

export interface ParserEvalAssertion {
  path: string;
  equals?: unknown;
  length?: number;
  min?: number;
  contains?: unknown;
  containsPartial?: Record<string, unknown>;
}

export interface ParserEvalCase {
  id: string;
  prompt: string;
  aiPrecompile?: Record<string, unknown>;
  registry?: ParserEvalRegistry;
  assertions: ParserEvalAssertion[];
  expectedFailureSnippets?: string[];
}

export interface ParserEvalSummary {
  deterministic: {
    deterministicCompleteness?: number;
    residualCount: number;
    candidateEvents: Array<Record<string, unknown>>;
    actionFrames: Array<Record<string, unknown>>;
  };
  protocolPlan?: Record<string, unknown>;
  protocolIntent?: ProtocolIntent;
  protocolIntentStatePlan?: Record<string, unknown>;
  protocolIntentValidation?: Record<string, unknown>;
  protocolIntentLowering?: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  instrumentRunFiles: Array<Record<string, unknown>>;
  instrumentApplianceJobs: Array<Record<string, unknown>>;
  instrumentExecutionReadiness: Array<Record<string, unknown>>;
}

export interface ParserEvalResult {
  id: string;
  prompt: string;
  summary: ParserEvalSummary;
  failures: string[];
}

function makeState(prompt: string, outputs = new Map<string, unknown>()): PipelineState {
  return {
    input: { prompt },
    context: {},
    meta: {},
    outputs,
    diagnostics: [],
  };
}

function makeDeps(registry: ParserEvalRegistry = {}): DeterministicPrecompileDeps {
  const verbs: Record<string, string> = {
    add: 'add_material',
    read: 'read',
    transfer: 'transfer',
    ...(registry.verbs ?? {}),
  };
  return {
    verbActionMapRegistry: {
      findVerbForToken: (token: string) => {
        const verb = verbs[token.toLowerCase()];
        return verb ? { verb, source: 'canonical' as const } : undefined;
      },
    },
    labwareDefinitionRegistry: {
      findByName: (name: string) => {
        const recordId = registry.labware?.[name.toLowerCase()];
        return recordId ? { recordId } : undefined;
      },
    },
    compoundClassRegistry: {
      findByName: (name: string) => {
        const recordId = registry.materials?.[name.toLowerCase()];
        return recordId ? { recordId } : undefined;
      },
    },
    ontologyTermRegistry: { searchLabel: () => [] },
    labwareInstanceLookup: async () => [],
  };
}

function getPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number.parseInt(segment, 10)];
    }
    if (typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function deepPartialMatch(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(expected as Record<string, unknown>).every(([key, expectedValue]) => (
      deepPartialMatch((actual as Record<string, unknown>)[key], expectedValue)
    ));
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((expectedValue, index) => deepPartialMatch(actual[index], expectedValue));
  }
  return Object.is(actual, expected);
}

function formatValue(value: unknown): string {
  return JSON.stringify(value);
}

function evaluateAssertion(summary: ParserEvalSummary, assertion: ParserEvalAssertion): string | undefined {
  const actual = getPath(summary, assertion.path);
  if ('equals' in assertion && !deepPartialMatch(actual, assertion.equals)) {
    return `${assertion.path}: expected ${formatValue(assertion.equals)}, got ${formatValue(actual)}`;
  }
  if (assertion.length !== undefined) {
    if (!Array.isArray(actual) || actual.length !== assertion.length) {
      return `${assertion.path}: expected length ${assertion.length}, got ${Array.isArray(actual) ? actual.length : 'non-array'}`;
    }
  }
  if (assertion.min !== undefined) {
    if (typeof actual !== 'number' || actual < assertion.min) {
      return `${assertion.path}: expected number >= ${assertion.min}, got ${formatValue(actual)}`;
    }
  }
  if ('contains' in assertion) {
    if (!Array.isArray(actual) || !actual.some((entry) => deepPartialMatch(entry, assertion.contains))) {
      return `${assertion.path}: expected array to contain ${formatValue(assertion.contains)}, got ${formatValue(actual)}`;
    }
  }
  if (assertion.containsPartial) {
    if (!Array.isArray(actual) || !actual.some((entry) => deepPartialMatch(entry, assertion.containsPartial))) {
      return `${assertion.path}: expected array to contain partial ${formatValue(assertion.containsPartial)}, got ${formatValue(actual)}`;
    }
  }
  return undefined;
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function cloneRecords(value: unknown): Array<Record<string, unknown>> {
  return records(value).map((entry) => structuredClone(entry) as Record<string, unknown>);
}

function cloneRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? structuredClone(value) as Record<string, unknown>
    : undefined;
}

export async function runParserEvalCase(testCase: ParserEvalCase): Promise<ParserEvalResult> {
  const deterministic = createDeterministicPrecompilePass(makeDeps(testCase.registry));
  const deterministicResult = await deterministic.run({
    pass_id: 'deterministic_precompile',
    state: makeState(testCase.prompt),
  });
  const deterministicOutput = deterministicResult.output as {
    deterministicCompleteness?: number;
    residualClauses?: unknown[];
    candidateEvents?: Array<Record<string, unknown>>;
    compileIr?: { actionFrames?: Array<Record<string, unknown>> };
  };
  const deterministicSummary = {
    residualCount: deterministicOutput.residualClauses?.length ?? 0,
    candidateEvents: cloneRecords(deterministicOutput.candidateEvents),
    actionFrames: cloneRecords(deterministicOutput.compileIr?.actionFrames),
    ...(deterministicOutput.deterministicCompleteness !== undefined
      ? { deterministicCompleteness: deterministicOutput.deterministicCompleteness }
      : {}),
  };

  const consolidate = createDeterministicPlanConsolidationPass();
  const consolidateResult = await consolidate.run({
    pass_id: 'deterministic_plan_consolidation',
    state: makeState(testCase.prompt, new Map<string, unknown>([
      ['deterministic_precompile', deterministicResult.output],
    ])),
  });
  const consolidateOutput = consolidateResult.output as {
    candidateEvents?: Array<Record<string, unknown>>;
    protocolPlan?: Record<string, unknown>;
  };
  const protocolPlanSummary = cloneRecord(consolidateOutput.protocolPlan);
  const baseAiPrecompile = consolidateResult.secondaryOutputs?.ai_precompile as Record<string, unknown> | undefined;
  const aiPrecompile = {
    ...(baseAiPrecompile ?? {
      candidateEvents: consolidateOutput.candidateEvents ?? deterministicOutput.candidateEvents ?? [],
      candidateLabwares: [],
      unresolvedRefs: [],
    }),
    ...(testCase.aiPrecompile ?? {}),
  };
  const aiPrecompileRecord = aiPrecompile as { protocolIntent?: ProtocolIntent };

  const protocolIntentStatePlan = createProtocolIntentStatePlanPass();
  const protocolIntentStatePlanResult = await protocolIntentStatePlan.run({
    pass_id: 'protocol_intent_state_plan',
    state: makeState(testCase.prompt, new Map<string, unknown>([['ai_precompile', aiPrecompile]])),
  });
  const protocolIntentStatePlanOutput = protocolIntentStatePlanResult.output as ProtocolIntentStatePlannerOutput;

  const validateProtocolIntent = createValidateProtocolIntentPass();
  const validateProtocolIntentResult = await validateProtocolIntent.run({
    pass_id: 'validate_protocol_intent',
    state: makeState(testCase.prompt, new Map<string, unknown>([['ai_precompile', aiPrecompile]])),
  });
  const protocolIntentValidationOutput = validateProtocolIntentResult.output as ProtocolIntentValidationOutput;

  const lowerProtocolIntent = createLowerProtocolIntentPass();
  const lowerProtocolIntentResult = await lowerProtocolIntent.run({
    pass_id: 'lower_protocol_intent',
    state: makeState(testCase.prompt, new Map<string, unknown>([
      ['ai_precompile', aiPrecompile],
      ['protocol_intent_state_plan', protocolIntentStatePlanOutput],
      ['validate_protocol_intent', protocolIntentValidationOutput],
    ])),
  });
  const protocolIntentLoweringOutput = lowerProtocolIntentResult.output as ProtocolIntentLoweringOutput;

  const expandProtocolIntentPatterns = createExpandProtocolIntentPatternsPass();
  const expandProtocolIntentPatternsResult = await expandProtocolIntentPatterns.run({
    pass_id: 'expand_protocol_intent_patterns',
    state: makeState(testCase.prompt, new Map<string, unknown>([
      ['protocol_intent_state_plan', protocolIntentStatePlanOutput],
      ['validate_protocol_intent', protocolIntentValidationOutput],
    ])),
  });
  const protocolIntentPatternOutput = expandProtocolIntentPatternsResult.output as ProtocolIntentPatternExpansionOutput;

  const expand = createExpandBiologyVerbsPass();
  const expandResult = await expand.run({
    pass_id: 'expand_biology_verbs',
    state: makeState(testCase.prompt, new Map<string, unknown>([['ai_precompile', aiPrecompile]])),
  });
  const expanded = expandResult.output as { events?: Array<Record<string, unknown>> };
  const allEvents = [
    ...records(protocolIntentLoweringOutput.events),
    ...records(protocolIntentPatternOutput.events),
    ...records(expanded.events),
  ];

  const emitRunFiles = createEmitInstrumentRunFilesPass();
  const emitRunFilesResult = await emitRunFiles.run({
    pass_id: 'emit_instrument_run_files',
    state: makeState(testCase.prompt, new Map<string, unknown>([
      ['resolve_roles', { events: allEvents }],
      ['resolve_references', { resolvedRefs: [] }],
    ])),
  });
  const runFilesOutput = emitRunFilesResult.output as { instrumentRunFiles?: Array<Record<string, unknown>> };

  const emitApplianceJobs = createEmitInstrumentApplianceJobsPass();
  const emitApplianceJobsResult = await emitApplianceJobs.run({
    pass_id: 'emit_instrument_appliance_jobs',
    state: makeState(testCase.prompt, new Map<string, unknown>([
      ['emit_instrument_run_files', runFilesOutput],
    ])),
  });
  const applianceJobsOutput = emitApplianceJobsResult.output as { instrumentApplianceJobs?: Array<Record<string, unknown>> };

  const readiness = createEvaluateInstrumentExecutionReadinessPass();
  const readinessResult = await readiness.run({
    pass_id: 'evaluate_instrument_execution_readiness',
    state: makeState(testCase.prompt, new Map<string, unknown>([
      ['emit_instrument_appliance_jobs', applianceJobsOutput],
    ])),
  });
  const readinessOutput = readinessResult.output as {
    instrumentApplianceJobs?: Array<Record<string, unknown>>;
    instrumentExecutionReadiness?: Array<Record<string, unknown>>;
  };

  const summary: ParserEvalSummary = {
    deterministic: deterministicSummary,
    ...(protocolPlanSummary ? { protocolPlan: protocolPlanSummary } : {}),
    ...(aiPrecompileRecord.protocolIntent ? { protocolIntent: aiPrecompileRecord.protocolIntent } : {}),
    ...(protocolIntentStatePlanOutput.protocolIntentStatePlan
      ? { protocolIntentStatePlan: protocolIntentStatePlanOutput.protocolIntentStatePlan as unknown as Record<string, unknown> }
      : {}),
    ...(aiPrecompileRecord.protocolIntent ? { protocolIntentValidation: protocolIntentValidationOutput as unknown as Record<string, unknown> } : {}),
    ...(aiPrecompileRecord.protocolIntent ? { protocolIntentLowering: protocolIntentLoweringOutput as unknown as Record<string, unknown> } : {}),
    events: allEvents,
    instrumentRunFiles: records(runFilesOutput.instrumentRunFiles),
    instrumentApplianceJobs: records(readinessOutput.instrumentApplianceJobs ?? applianceJobsOutput.instrumentApplianceJobs),
    instrumentExecutionReadiness: records(readinessOutput.instrumentExecutionReadiness),
  };
  const failures = testCase.assertions
    .map((assertion) => evaluateAssertion(summary, assertion))
    .filter((failure): failure is string => typeof failure === 'string');

  return {
    id: testCase.id,
    prompt: testCase.prompt,
    summary,
    failures,
  };
}

export async function runParserEvalSuite(testCases: ParserEvalCase[]): Promise<ParserEvalResult[]> {
  const results: ParserEvalResult[] = [];
  for (const testCase of testCases) {
    results.push(await runParserEvalCase(testCase));
  }
  return results;
}
