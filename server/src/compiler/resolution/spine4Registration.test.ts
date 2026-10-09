/**
 * SPINE-4 — registration + barrier acceptance (criteria verbatim from the task
 * list):
 *   - scientist-intent-pipeline.resolution-pass-order
 *   - resolved-bindings
 *   - clarification-barrier
 *   - declarative missing-address/quantity
 *
 * Both non-vacuous proofs are required by the spec (§4.3):
 *   PROOF A — spy-wrapped REAL pass factories registered into a test-built
 *     registry: callCount === 0 for every downstream stage after a bar.
 *   PROOF B — the real compile's onPassEvent trace: resolve_nouns' own
 *     started/finished pair IS present, NO pass_started for any consumer/graph
 *     stage, and pass_statuses carry 'skipped' + 'dependency resolve_nouns was
 *     failed' (PipelineRunner.ts:288).
 * A no-op stub pass would make both proofs vacuous; every spy delegates to the
 * real `.run`.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadPipeline } from '../pipeline/PipelineLoader.js';
import { runPipeline, type PassProgressEvent } from '../pipeline/PipelineRunner.js';
import { PassRegistry } from '../pipeline/PassRegistry.js';
import type { Pass, PassResult, PassRunArgs } from '../pipeline/types.js';
import {
  createProtocolIntentStatePlanPass,
} from '../protocolIntent/ProtocolIntentStatePlanner.js';
import {
  createValidateProtocolIntentPass,
} from '../protocolIntent/ProtocolIntentValidation.js';
import {
  createLowerProtocolIntentPass,
} from '../protocolIntent/ProtocolIntentLowering.js';
import { createExpandProtocolIntentPatternsPass } from '../protocolIntent/ProtocolIntentPatternExpanders.js';
import {
  createExpandBiologyVerbsPass,
  createApplyDirectivesPass,
  createLabwareResolvePass,
  createResolveReferencesPass,
  createResolveRolesPass,
  createComputeVolumesPass,
  createComputeResourcesPass,
  createPlanDeckLayoutPass,
  createLabStatePass,
  createValidatePass,
  createEmitInstrumentRunFilesPass,
} from '../pipeline/passes/ChatbotCompilePasses.js';
import '../biology/verbs/simpleVerbs.js';
import '../biology/verbs/compoundVerbs.js';
import '../biology/verbs/centrifugeVerbs.js';
import { getProtocolSpecRegistry } from '../../registry/ProtocolSpecRegistry.js';
import { getAssaySpecRegistry } from '../../registry/AssaySpecRegistry.js';
import { getStampPatternRegistry } from '../../registry/StampPatternRegistry.js';
import { getCompoundClassRegistry } from '../../registry/CompoundClassRegistry.js';
import { getOntologyTermRegistry } from '../../registry/OntologyTermRegistry.js';
import { emptyLabState } from '../state/LabState.js';
import { normalizeScientistIntent } from '../scientistIntent/normalizeScientistIntent.js';
import { parseScientistIntent } from '../scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../scientistIntent/compileScientistIntent.js';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import type { ProviderHit } from '../../resolve/types.js';
import { createResolveNounsPass, type ResolveNounsOutput } from './resolveNounsPass.js';
import type { BoundNoun } from './types.js';

const FIXTURES = 'src/compiler/resolution/fixtures';
const PIPELINE_PATH = join(
  process.cwd(), 'schema', 'registry', 'compile-pipelines', 'scientist-intent-compile.yaml',
);
const shippedVocab = () => loadScientistIntentVocabulary();
const fixtureVocab = (dir: string) =>
  loadScientistIntentVocabulary({ path: join(process.cwd(), FIXTURES, dir, 'scientist-intent-vocabulary.yaml') });

/** Every stage the bar must keep un-invoked (spec §2.2 downstream list). */
const DOWNSTREAM_STAGES = [
  'lower_protocol_intent',
  'expand_protocol_intent_patterns',
  'expand_biology_verbs',
  'apply_directives',
  'resolve_labware',
  'resolve_references',
  'resolve_roles',
  'compute_volumes',
  'compute_resources',
  'plan_deck_layout',
  'lab_state',
  'emit_instrument_run_files',
  'validate',
] as const;

/** Noun consumers that must declare the resolve_nouns edge (spec §3). */
const NOUN_CONSUMERS = [
  'lower_protocol_intent',
  'expand_protocol_intent_patterns',
  'expand_biology_verbs',
  'resolve_labware',
  'resolve_references',
  'resolve_roles',
] as const;

// ---------------------------------------------------------------------------
// Test plumbing
// ---------------------------------------------------------------------------

/** A spine whose tier-0 hits are keyed by the queried label (EngineSpineLike
 *  is structural — this is the same seam nounResolution.test.ts uses). */
function spineFor(bindings: Record<string, Array<[string, string]>>) {
  return createResolveSpine({
    termProvider: async (term): Promise<ProviderHit[]> =>
      (bindings[term] ?? []).map(([curie, label]) => ({
        curie,
        label,
        namespace: 'local',
        level: 'unknown' as const,
      })),
  });
}

interface Spy {
  pass: Pass;
  calls: number;
}

/** Recording decorator over the REAL factory output — delegates to real .run. */
function spyPass(pass: Pass, record: Map<string, Spy>): Spy {
  const entry: Spy = {
    calls: 0,
    pass: {
      id: pass.id,
      family: pass.family,
      run(args: PassRunArgs): Promise<PassResult> | PassResult {
        entry.calls += 1;
        return pass.run(args);
      },
    },
  };
  record.set(pass.id, entry);
  return entry;
}

/**
 * A registry mirroring compileScientistIntent's buildRegistry, with every
 * consumer/graph pass spy-wrapped (PROOF A harness). Same real factories.
 */
function buildSpiedRegistry(
  intent: ReturnType<typeof parseScientistIntent>,
  opts: {
    spine: ReturnType<typeof spineFor>;
    vocabulary?: ReturnType<typeof shippedVocab>;
    searchLabwareByHint?: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
    /** Separate spy for resolve_labware's OWN legacy dep (resolved-bindings). */
    labwareSearch?: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
  },
): { registry: PassRegistry; spies: Map<string, Spy> } {
  const normalized = normalizeScientistIntent(intent);
  const registry = new PassRegistry();
  const spies = new Map<string, Spy>();

  registry.register({
    id: 'ai_precompile',
    family: 'parse' as const,
    run: () => ({ ok: true, output: normalized }),
  });
  registry.register(createResolveNounsPass({
    intent,
    vocabulary: opts.vocabulary ?? shippedVocab(),
    spine: opts.spine,
    ...(opts.searchLabwareByHint ? { searchLabwareByHint: opts.searchLabwareByHint } : {}),
  }));

  const factories: Pass[] = [
    createProtocolIntentStatePlanPass(),
    createValidateProtocolIntentPass(),
    createLowerProtocolIntentPass(),
    createExpandProtocolIntentPatternsPass(),
    createExpandBiologyVerbsPass(),
    createApplyDirectivesPass(),
    createLabwareResolvePass({ searchLabwareByHint: opts.labwareSearch ?? opts.searchLabwareByHint ?? (async () => []) }),
    createResolveReferencesPass({
      protocolRegistry: getProtocolSpecRegistry(),
      assayRegistry: getAssaySpecRegistry(),
      stampPatternRegistry: getStampPatternRegistry(),
      compoundClassRegistry: getCompoundClassRegistry(),
      ontologyTermRegistry: getOntologyTermRegistry(),
    }),
    createResolveRolesPass(),
    createComputeVolumesPass(),
    createComputeResourcesPass(),
    createPlanDeckLayoutPass(),
    createLabStatePass(),
    createEmitInstrumentRunFilesPass(),
    createValidatePass(),
  ];
  for (const factory of factories) {
    // The SPY (not the raw factory) is what the registry sees — PROOF A must
    // observe the real invocations, and the spy delegates to the real `.run`.
    const entry = spyPass(factory, spies);
    registry.register(entry.pass);
  }

  return { registry, spies };
}

function pipelineInput() {
  return {
    prompt: '',
    attachments: [],
    mentions: [],
    editorLabwares: [],
    labState: emptyLabState(),
  };
}

// ---------------------------------------------------------------------------
// Criterion 1 — scientist-intent-pipeline.resolution-pass-order
// ---------------------------------------------------------------------------

describe('scientist-intent-pipeline.resolution-pass-order', () => {
  it('the declared pipeline carries resolve_nouns as the 17th pass, family disambiguate', () => {
    const spec = loadPipeline(PIPELINE_PATH);
    expect(spec.passes.length).toBe(17);

    const resolveNouns = spec.passes.find((p) => p.id === 'resolve_nouns');
    expect(resolveNouns).toBeDefined();
    expect(resolveNouns!.family).toBe('disambiguate');
    expect(resolveNouns!.depends_on).toEqual(['ai_precompile']);
  });

  it('EVERY noun consumer declares the resolve_nouns edge (a forgotten edge = the whole criterion)', () => {
    const spec = loadPipeline(PIPELINE_PATH);
    for (const consumer of NOUN_CONSUMERS) {
      const pass = spec.passes.find((p) => p.id === consumer);
      expect(pass, `consumer ${consumer} missing`).toBeDefined();
      expect(pass!.depends_on ?? [], `${consumer} lacks the resolve_nouns edge`).toContain('resolve_nouns');
    }
    // apply_directives is reached transitively through lower_protocol_intent only.
    const applyDirectives = spec.passes.find((p) => p.id === 'apply_directives')!;
    expect(applyDirectives.depends_on).toEqual(['lower_protocol_intent']);
    expect(applyDirectives.depends_on).not.toContain('resolve_nouns');
  });

  it('resolve_nouns is topologically ahead of every noun consumer in the Kahn order', () => {
    const spec = loadPipeline(PIPELINE_PATH);
    const order = topologicalOrder(spec);
    const nounsIndex = order.indexOf('resolve_nouns');
    expect(nounsIndex).toBeGreaterThan(-1);
    for (const consumer of NOUN_CONSUMERS) {
      expect(order.indexOf(consumer), `${consumer} runs before resolve_nouns`).toBeGreaterThan(nounsIndex);
    }
  });

  it('the RUNTIME trace matches the declared order (Kahn determinism, real compile)', async () => {
    const doc = parseScientistIntent(`
intentId: order-check
actions:
  - { action: incubate, labware: plate }
`);
    const events: PassProgressEvent[] = [];
    const result = await compileScientistIntent(doc, {
      spine: spineFor({ plate: [['local:LAB-plate', '96-well plate']] }),
      onPassEvent: (e) => events.push(e),
    });
    expect(result.outcome).toBe('complete');

    const started = events.filter((e) => e.type === 'pass_started').map((e) => e.pass_id);
    const nounsIndex = started.indexOf('resolve_nouns');
    expect(nounsIndex).toBeGreaterThan(-1);
    for (const consumer of NOUN_CONSUMERS) {
      expect(started.indexOf(consumer)).toBeGreaterThan(nounsIndex);
    }
    // resolve_nouns is a REAL executed pass: started AND finished pair present.
    expect(events.some((e) => e.type === 'pass_finished' && e.pass_id === 'resolve_nouns')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Criterion 2 — resolved-bindings
// ---------------------------------------------------------------------------

describe('resolved-bindings', () => {
  it('bound labels reach resolve_labware.resolvedLabwares with ZERO searchLabwareByHint calls (no second noun lookup)', async () => {
    const doc = parseScientistIntent(`
intentId: bound-run
actions:
  - { action: transfer, source: standards, target: fresh_plate, volumeUl: 20 }
`);
    // Two DISTINCT spies: the engine's authoritative lookup (resolve_nouns'
    // labware-hint adapter) and the legacy re-interpretation lookup
    // (resolve_labware's own dep). The criterion forbids the SECOND one.
    const engineCalls: string[] = [];
    const legacyCalls: string[] = [];
    const engineSearch = async (hint: string) => {
      engineCalls.push(hint);
      return [{ recordId: `ENG-${hint}`, title: `Engine ${hint}` }];
    };
    const legacySearch = async (hint: string) => {
      legacyCalls.push(hint);
      return [{ recordId: `LAB-${hint}`, title: hint }];
    };

    const { registry, spies } = buildSpiedRegistry(doc, {
      spine: spineFor({}),
      searchLabwareByHint: engineSearch,
      labwareSearch: legacySearch,
    });

    const run = await runPipeline(loadPipeline(PIPELINE_PATH), registry, pipelineInput());
    expect(run.ok).toBe(true);

    // The engine did the ONE authoritative lookup (hint_search strategy over the
    // declared hintEligible contracts) and bound both labels.
    expect(engineCalls.sort()).toEqual(['fresh_plate', 'standards']);

    const labwareOut = run.outputs.get('resolve_labware') as {
      resolvedLabwares: Array<{ hint: string; recordId: string; title?: string }>;
      labwareAdditions: unknown[];
    };
    expect(labwareOut.resolvedLabwares).toEqual([
      { hint: 'standards', recordId: 'ENG-standards', title: 'Engine standards' },
      { hint: 'fresh_plate', recordId: 'ENG-fresh_plate', title: 'Engine fresh_plate' },
    ]);
    expect(labwareOut.labwareAdditions).toEqual([]);

    // THE criterion: resolve_labware performed NO second noun lookup.
    expect(legacyCalls).toEqual([]);
  });

  it('slot-absent legacy path is byte-identical: without the resolve_nouns slot the hint search still runs and mints additions', async () => {
    // The chatbot-shaped harness: same factories, NO resolve_nouns pass.
    const doc = parseScientistIntent(`
intentId: legacy-run
actions:
  - { action: transfer, source: mystery_source, target: mystery_target }
`);
    const normalized = normalizeScientistIntent(doc);
    const registry = new PassRegistry();
    registry.register({ id: 'ai_precompile', family: 'parse', run: () => ({ ok: true, output: normalized }) });
    registry.register(createProtocolIntentStatePlanPass());
    registry.register(createValidateProtocolIntentPass());
    registry.register(createLowerProtocolIntentPass());
    registry.register(createLabwareResolvePass({ searchLabwareByHint: async () => [] }));

    const run = await runPipeline(
      {
        pipelineId: 'legacy',
        entrypoint: 'scientist-intent-compile',
        passes: [
          { id: 'ai_precompile', family: 'parse' },
          { id: 'protocol_intent_state_plan', family: 'expand', depends_on: ['ai_precompile'] },
          { id: 'validate_protocol_intent', family: 'validate', depends_on: ['ai_precompile'] },
          { id: 'lower_protocol_intent', family: 'expand', depends_on: ['protocol_intent_state_plan', 'validate_protocol_intent'] },
          { id: 'resolve_labware', family: 'disambiguate', depends_on: ['lower_protocol_intent'] },
        ],
      },
      registry,
      pipelineInput(),
    );
    const out = run.outputs.get('resolve_labware') as { labwareAdditions: Array<Record<string, unknown>> };
    expect(out.labwareAdditions.map((a) => a.recordId).sort()).toEqual(['mystery_source', 'mystery_target']);
  });

  it('resolve_roles consumes engine wells for a declared-address role instead of the unknown-role pass-through', async () => {
    // A role defaultRoleResolver does NOT know (legacy: passthrough, zero
    // expansion). With an engine address binding, the wells are authoritative.
    const rolesPass = createResolveRolesPass();
    const event = {
      eventId: 'evt-1',
      event_type: 'transfer' as const,
      details: { role: 'sample_col_7' },
    };
    const legacyState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map<string, unknown>([['expand_biology_verbs', { events: [event] }]]),
      diagnostics: [],
    };
    const legacy = await rolesPass.run({ pass_id: 'resolve_roles', state: legacyState });
    expect((legacy.output as { events: unknown[] }).events).toEqual([event]); // passthrough

    const boundState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map<string, unknown>([
        ['expand_biology_verbs', { events: [event] }],
        ['resolve_nouns', {
          bindings: [],
          resolvedByLabel: {
            sample_col_7: {
              verb: 'transfer',
              argument: 'sourceWells',
              label: 'sample_col_7',
              recordId: 'sample_col_7',
              addresses: ['A1', 'A2'],
            },
          },
          clarifications: [],
          failures: [],
          blocked: false,
        } satisfies ResolveNounsOutput],
      ]),
      diagnostics: [],
    };
    const bound = await createResolveRolesPass().run({ pass_id: 'resolve_roles', state: boundState });
    const events = (bound.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> }).events;
    expect(events.map((e) => e.details.well)).toEqual(['A1', 'A2']);
    expect(events.map((e) => e.details.role)).toEqual([undefined, undefined]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 — clarification-barrier
// ---------------------------------------------------------------------------

describe('clarification-barrier', () => {
  const badDoc = () => parseScientistIntent(`
intentId: one-bad-arg
actions:
  - { action: transfer, source: standards, target: fresh_plate, volumeUl: 20 }
  - { action: incubate, labware: plate, duration: 10 min }
  - { action: spin, labware: plate, rpm: 3000 }
  - { action: wash, source: mystery_reagent, target: plate, cycles: 3 }
`);
  const goodSpine = () => spineFor({
    standards: [['local:LAB-standard-plate', 'Standard Plate']],
    fresh_plate: [['local:LAB-fresh-plate', 'Fresh 96-well plate']],
    plate: [['local:LAB-plate', '96-well plate']],
  });

  it('ONE bad argument among valid actions: structured clarifications out, ZERO artifact-bearing slots', async () => {
    const events: PassProgressEvent[] = [];
    const result = await compileScientistIntent(badDoc(), {
      spine: goodSpine(),
      searchLabwareByHint: async () => [],
      onPassEvent: (e) => events.push(e),
    });

    // Bar outcome (OQ1 ruling (a)) — NOT 'complete', NOT 'error'.
    expect(result.outcome).toBe('needs-clarification');

    // SPINE-1 clarification shape incl. actionLocation.
    expect(result.clarifications.length).toBeGreaterThan(0);
    const bad = result.clarifications.find((c) => c.label === 'mystery_reagent');
    expect(bad).toBeDefined();
    expect(bad!.reason).toBe('unknown-noun');
    expect(bad!.actionLocation).toEqual({
      actionIndex: 3,
      action: 'wash',
      argument: 'source',
    });

    // Zero-artifact: key ABSENCE asserted via Object.keys (exactOptionalPropertyTypes).
    const keys = Object.keys(result.terminalArtifacts);
    for (const slot of [
      'deckLayoutPlan', 'resourceManifest', 'instrumentRunFiles',
      'labStateDelta', 'labwareAdditions', 'resolvedRefs', 'validationReport',
    ]) {
      expect(keys, `slot ${slot} must be ABSENT on a bar`).not.toContain(slot);
    }
    expect(result.terminalArtifacts.events).toEqual([]);
    expect(result.terminalArtifacts.directives).toEqual([]);
    expect(result.terminalArtifacts.gaps).toEqual([]);

    // PROOF B (trace): resolve_nouns really executed; NO downstream pass_started.
    const started = events.filter((e) => e.type === 'pass_started').map((e) => e.pass_id);
    expect(started).toContain('resolve_nouns');
    expect(events.some((e) => e.type === 'pass_finished' && e.pass_id === 'resolve_nouns')).toBe(true);
    for (const stage of DOWNSTREAM_STAGES) {
      expect(started, `${stage} ran after the bar`).not.toContain(stage);
    }
  });

  it('PROOF A: spy-wrapped REAL factories record callCount === 0 for every downstream stage', async () => {
    const { registry, spies } = buildSpiedRegistry(badDoc(), { spine: goodSpine(), searchLabwareByHint: async () => [] });
    const run = await runPipeline(loadPipeline(PIPELINE_PATH), registry, pipelineInput());

    expect(run.ok).toBe(false);
    for (const stage of DOWNSTREAM_STAGES) {
      expect(spies.get(stage)!.calls, `${stage} was invoked`).toBe(0);
    }
    // The bar itself is a real executed pass (not a silent gap).
    expect(run.pass_statuses.find((s) => s.pass_id === 'resolve_nouns')!.status).toBe('failed');
  });

  it('PROOF B: every consumer carries status skipped with the exact runner reason; direct consumers name resolve_nouns, transitive stages chain through a skipped dep back to it', async () => {
    const { registry } = buildSpiedRegistry(badDoc(), { spine: goodSpine(), searchLabwareByHint: async () => [] });
    const run = await runPipeline(loadPipeline(PIPELINE_PATH), registry, pipelineInput());

    const spec = loadPipeline(PIPELINE_PATH);
    const statusOf = new Map(run.pass_statuses.map((s) => [s.pass_id, s]));

    // Direct consumers whose declared deps ahead of resolve_nouns all ran ok:
    // the runner's reason is EXACTLY 'dependency resolve_nouns was failed'
    // (PipelineRunner.ts:288).
    const direct = ['lower_protocol_intent', 'expand_protocol_intent_patterns', 'expand_biology_verbs', 'resolve_references'];
    for (const stage of direct) {
      const status = statusOf.get(stage)!;
      expect(status.status).toBe('skipped');
      expect(status.reason).toBe('dependency resolve_nouns was failed');
    }

    // Every other downstream stage: status 'skipped', and the dep its reason
    // names is itself skipped/failed — walking the chain always terminates at
    // resolve_nouns' 'failed'. (The runner names the FIRST failed/skipped dep
    // in the stage's declared depends_on order.)
    for (const stage of DOWNSTREAM_STAGES) {
      const status = statusOf.get(stage)!;
      expect(status, `${stage} missing from pass_statuses`).toBeDefined();
      expect(status.status).toBe('skipped');

      let current: { status: string; reason?: string } = status;
      let currentId: string = stage;
      const chain: string[] = [];
      for (let hop = 0; hop < DOWNSTREAM_STAGES.length + 2; hop++) {
        const match = /^dependency (\S+) was (failed|skipped)$/.exec(current.reason ?? '');
        expect(match, `${stage} reason not in runner form: ${current.reason}`).not.toBeNull();
        const depId = match![1]!;
        chain.push(depId);
        if (depId === 'resolve_nouns') {
          expect(match![2]).toBe('failed');
          expect(statusOf.get('resolve_nouns')!.status).toBe('failed');
          break;
        }
        const depStatus = statusOf.get(depId)!;
        expect(depStatus, `${stage} names unknown dep ${depId}`).toBeDefined();
        expect(depStatus.status).toBe('skipped');
        // The named dep must be one of the CURRENT pass's DECLARED dependencies.
        const declared = spec.passes.find((p) => p.id === currentId)!.depends_on ?? [];
        expect(declared, `${currentId} reason names undeclared dep ${depId}`).toContain(depId);
        current = depStatus;
        currentId = depId;
      }
      expect(chain, `${stage} chain never reaches resolve_nouns`).toContain('resolve_nouns');
    }
  });

  it('the lookup-error arm bars too, with reason resolution-lookup-failed intact (SPINE-3 codes pass through unchanged)', async () => {
    const throwingSpine = { resolve: async () => { throw new Error('spine down'); } };
    const result = await compileScientistIntent(badDoc(), { spine: throwingSpine });

    expect(result.outcome).toBe('needs-clarification');
    const reasons = result.clarifications.map((c) => c.reason);
    expect(reasons).toContain('resolution-lookup-failed');
    // Lookup failure and unknown-noun stay distinguishable in the payload.
    expect(reasons).not.toContain('unknown-noun');
    expect(result.terminalArtifacts.events).toEqual([]);
    expect(Object.keys(result.terminalArtifacts)).not.toContain('instrumentRunFiles');
  });

  it("a bar is NOT an 'error': the compile outcome distinguishes \"the scientist must answer\" from \"the machinery broke\"", async () => {
    const result = await compileScientistIntent(badDoc(), { spine: goodSpine() });
    expect(result.outcome).not.toBe('error');
    expect(result.outcome).not.toBe('gap');
    expect(result.outcome).not.toBe('complete');
    // The error-severity diagnostic is still present for observability.
    expect(result.diagnostics.some((d) => d.severity === 'error' && d.code === 'unresolved_arguments')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — declarative missing-address/quantity (fixture COPY flips only)
// ---------------------------------------------------------------------------

describe('declarative missing-address/quantity', () => {
  it('a fixture flip of required:true on an ADDRESS arg (transfer.sourceWells) bars with zero graph passes executed', async () => {
    const doc = parseScientistIntent(`
intentId: missing-address
actions:
  - { action: transfer, source: standards, target: fresh_plate, volumeUl: 20 }
`);
    const { registry, spies } = buildSpiedRegistry(doc, {
      spine: spineFor({
        standards: [['local:LAB-standard-plate', 'Standard Plate']],
        fresh_plate: [['local:LAB-fresh-plate', 'Fresh 96-well plate']],
      }),
      vocabulary: fixtureVocab('vocab-required-flip'),
    });
    const run = await runPipeline(loadPipeline(PIPELINE_PATH), registry, pipelineInput());

    expect(run.ok).toBe(false);
    for (const stage of DOWNSTREAM_STAGES) expect(spies.get(stage)!.calls).toBe(0);

    const clarifications = (run.diagnostics.find((d) => d.code === 'unresolved_arguments')!.details!['clarifications'] ?? []) as Array<{ reason: string; actionLocation?: { argument?: string } }>;
    expect(clarifications.map((c) => c.actionLocation?.argument)).toEqual(['sourceWells']);
    expect(clarifications[0]!.reason).toBe('missing-required-argument');
  });

  it('the same flip on a QUANTITY arg on a DIFFERENT verb (spin.rpm) bars independently', async () => {
    const doc = parseScientistIntent(`
intentId: missing-quantity
actions:
  - { action: spin, labware: plate }
`);
    const result = await compileScientistIntent(doc, {
      spine: spineFor({ plate: [['local:LAB-plate', '96-well plate']] }),
      vocabulary: fixtureVocab('vocab-required-flip'),
    });
    expect(result.outcome).toBe('needs-clarification');
    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0]!.reason).toBe('missing-required-argument');
    expect(result.clarifications[0]!.actionLocation).toEqual({
      actionIndex: 0, action: 'spin', argument: 'rpm',
    });
    expect(result.terminalArtifacts.events).toEqual([]);
  });

  it('the SAME documents compile clean against the SHIPPED vocabulary (the flip is data, not code)', async () => {
    const doc = parseScientistIntent(`
intentId: shipped-clean
actions:
  - { action: transfer, source: standards, target: fresh_plate, volumeUl: 20 }
  - { action: spin, labware: plate }
`);
    const result = await compileScientistIntent(doc, {
      spine: spineFor({
        standards: [['local:LAB-standard-plate', 'Standard Plate']],
        fresh_plate: [['local:LAB-fresh-plate', 'Fresh 96-well plate']],
        plate: [['local:LAB-plate', '96-well plate']],
      }),
    });
    expect(result.outcome).toBe('complete');
    expect(result.clarifications).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolve_references fate-of-unresolved_symbol (spec §2.2 item 4 caveat —
// read the WHOLE switch before editing, pinned here, not assumed):
// normalizeScientistIntent only ever emits kind:'unresolved_symbol'
// (normalizeScientistIntent.ts:200). The switch arms are protocol/assay/
// pattern/compound-class; unresolved_symbol falls to the DEFAULT arm =>
// unresolvableRefs with 'kind unresolved_symbol not handled by
// resolve_references'. After SPINE-4: a label the engine bound resolves from
// the slot WITHOUT fuzzy matching; a label the engine left unresolved bars
// upstream so this pass is skipped entirely (PROOF B). Slot absent (chatbot
// pipeline) => the default arm runs byte-identically.
// ---------------------------------------------------------------------------

describe('resolve_references.fate-of-unresolved_symbol', () => {
  const refsPass = () => createResolveReferencesPass({
    protocolRegistry: getProtocolSpecRegistry(),
    assayRegistry: getAssaySpecRegistry(),
    stampPatternRegistry: getStampPatternRegistry(),
    compoundClassRegistry: getCompoundClassRegistry(),
    ontologyTermRegistry: getOntologyTermRegistry(),
  });
  const refState = (slot?: ResolveNounsOutput) => ({
    input: { labState: emptyLabState() },
    context: {},
    meta: {},
    outputs: new Map<string, unknown>([
      ['ai_precompile', { unresolvedRefs: [{ kind: 'unresolved_symbol', label: 'standards', reason: 'model hedge' }] }],
      ...(slot ? [['resolve_nouns', slot]] : []),
    ]),
    diagnostics: [],
  });

  it('slot absent (legacy/chatbot): unresolved_symbol falls to the default arm — unresolvable, byte-identical today', async () => {
    const out = await refsPass().run({ pass_id: 'resolve_references', state: refState() });
    const { resolvedRefs, unresolvableRefs } = out.output as {
      resolvedRefs: Array<Record<string, unknown>>;
      unresolvableRefs: Array<{ kind: string; reason: string }>;
    };
    expect(resolvedRefs).toEqual([]);
    expect(unresolvableRefs).toEqual([
      { kind: 'unresolved_symbol', label: 'standards', reason: 'kind unresolved_symbol not handled by resolve_references' },
    ]);
    expect(unresolvableRefs[0]!.reason).toBe('kind unresolved_symbol not handled by resolve_references');
  });

  it('slot present: a bound label resolves from the authoritative slot (resolvedId = binding recordId), NO fuzzy re-match', async () => {
    const slot: ResolveNounsOutput = {
      bindings: [],
      resolvedByLabel: {
        standards: { verb: 'transfer', argument: 'source', label: 'standards', recordId: 'LAB-standard-plate', resolvedLabel: 'Standard Plate' },
      },
      clarifications: [],
      failures: [],
      blocked: false,
    };
    const out = await refsPass().run({ pass_id: 'resolve_references', state: refState(slot) });
    const { resolvedRefs, unresolvableRefs } = out.output as {
      resolvedRefs: Array<{ kind: string; label: string; resolvedId: string; resolvedName: string }>;
      unresolvableRefs: unknown[];
    };
    expect(unresolvableRefs).toEqual([]);
    expect(resolvedRefs).toEqual([{
      kind: 'unresolved_symbol',
      label: 'standards',
      resolvedId: 'LAB-standard-plate',
      resolvedName: 'Standard Plate',
    }]);
  });

  it('end-to-end: a model hedge the engine bound is DROPPED from the bar and resolve_references resolves it from the slot (run.ok, no unresolvable)', async () => {
    const doc = parseScientistIntent(`
intentId: hedge-bound
actions:
  - { action: transfer, source: standards, target: fresh_plate, volumeUl: 20 }
unresolved:
  - { label: standards, reason: "model hedge" }
`);
    const { registry } = buildSpiedRegistry(doc, {
      spine: spineFor({
        standards: [['local:LAB-standard-plate', 'Standard Plate']],
        fresh_plate: [['local:LAB-fresh-plate', 'Fresh 96-well plate']],
      }),
    });
    const run = await runPipeline(loadPipeline(PIPELINE_PATH), registry, pipelineInput());
    expect(run.ok).toBe(true);
    const refsOut = run.outputs.get('resolve_references') as {
      resolvedRefs: Array<{ label: string; resolvedId: string }>;
      unresolvableRefs: unknown[];
    };
    expect(refsOut.unresolvableRefs).toEqual([]);
    expect(refsOut.resolvedRefs.find((r) => r.label === 'standards')?.resolvedId).toBe('LAB-standard-plate');
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Kahn order over the loaded spec (mirrors PipelineRunner's sort for position asserts). */
function topologicalOrder(spec: ReturnType<typeof loadPipeline>): string[] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const p of spec.passes) {
    inDegree.set(p.id, 0);
    if (!dependents.has(p.id)) dependents.set(p.id, []);
  }
  for (const p of spec.passes) {
    for (const dep of p.depends_on ?? []) {
      dependents.get(dep)?.push(p.id);
      inDegree.set(p.id, (inDegree.get(p.id) ?? 0) + 1);
    }
  }
  const queue = spec.passes.filter((p) => (inDegree.get(p.id) ?? 0) === 0).map((p) => p.id);
  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const dependent of dependents.get(current) ?? []) {
      const next = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  return sorted;
}

// Keep BoundNoun referenced for the typed slot fixtures above.
export type _Spine4Binding = BoundNoun;
