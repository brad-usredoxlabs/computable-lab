/**
 * Tests for PlannedRunEventsEmitPass.
 *
 * Covers:
 * - Single-step single-sample concrete: 1 transfer step, 1 sample, both source and dest bound
 * - Semantic-key parity with abstract (spec-024): same step compiled both ways
 * - Multi-sample fanout preserves key: 1 step, 96 samples, bound
 * - Unbound role gracefully degrades: step references a role with no binding
 */

import { describe, it, expect } from 'vitest';
import { createPlannedRunEventsEmitPass } from './PlannedRunEventsEmitPass.js';
import { createEventsEmitPass } from './EventsEmitPass.js';
import { buildSemanticKey } from '../../../protocol/SemanticKeyBuilder.js';
import { derivations } from '../../../protocol/derivations/index.js';
import type { PipelineState } from '../types.js';
import type { RecordStore } from '../../../store/types.js';
import type { VerbDefinitionLite } from '../../../protocol/SemanticKeyBuilder.js';

// ---------------------------------------------------------------------------
// Helpers / Mocks
// ---------------------------------------------------------------------------

function makeMockRecordStore(
  createdRecords: Array<{ envelope: Record<string, unknown>; message: string }> = [],
): RecordStore {
  return {
    get: async () => null,
    getByPath: async () => null,
    getWithValidation: async () => ({ success: false, error: 'not implemented' }),
    list: async () => [],
    create: async (options) => {
      createdRecords.push({ envelope: options.envelope, message: options.message ?? '' });
      return { success: true, envelope: options.envelope };
    },
    update: async () => ({ success: false, error: 'not implemented' }),
    delete: async () => ({ success: false, error: 'not implemented' }),
    validate: async () => ({ valid: true, errors: [] }),
    lint: async () => ({ ok: true, errors: [] }),
    exists: async () => true,
  } as unknown as RecordStore;
}

function makeMockState(
  input: Record<string, unknown> = {},
  outputs: Map<string, unknown> = new Map(),
): PipelineState {
  return {
    input,
    context: {},
    meta: {},
    outputs,
    diagnostics: [],
  };
}

/**
 * Create a verb definition for a given kind with semanticInputs.
 */
function makeVerbDefinition(
  canonical: string,
  semanticInputs: VerbDefinitionLite['semanticInputs'] = [],
): VerbDefinitionLite {
  return { canonical, semanticInputs };
}

/**
 * Build a mock loadVerbDefinition that returns definitions for known kinds.
 */
function makeLoadVerbDefinition(
  definitions: Record<string, VerbDefinitionLite>,
): (canonical: string) => Promise<VerbDefinitionLite | null> {
  return async (canonical: string) => definitions[canonical] ?? null;
}

/**
 * Build a per-step context entry for a given sample index and well.
 */
function makeSampleContext(
  sampleIndex: number,
  wellId: string,
  volume_uL?: number,
): Record<string, unknown> {
  return { sampleIndex, wellId, volume_uL };
}

/**
 * Build a per-step context for a step with multiple samples.
 */
function makePerStepContext(
  stepId: string,
  sampleContexts: Record<string, unknown>[],
): Record<string, unknown> {
  return { stepId, sampleContexts };
}

/**
 * Build a RunPlanCompileResult for testing.
 */
function makeRunPlanCompileResult(
  perStepContexts: Record<string, unknown>[],
  bindings: {
    materialResolutions: Record<string, unknown>;
    labwareResolutions: Record<string, unknown>;
  },
): Record<string, unknown> {
  return {
    status: 'ready',
    diagnostics: [],
    perStepContexts,
    bindings,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Single-step single-sample concrete → event with labwareInstanceId AND role
// ---------------------------------------------------------------------------

describe('PlannedRunEventsEmitPass', () => {
  it('single-step single-sample concrete emits event with labwareInstanceId AND role on source/target', async () => {
    const createdRecords: Array<{ envelope: Record<string, unknown>; message: string }> = [];
    const recordStore = makeMockRecordStore(createdRecords);

    const verbDef = makeVerbDefinition('transfer', [
      {
        name: 'source',
        derivedFrom: { input: 'source', fn: 'passthrough' },
        required: true,
      },
      {
        name: 'target',
        derivedFrom: { input: 'target', fn: 'passthrough' },
        required: true,
      },
    ]);

    const loadVerbDef = makeLoadVerbDefinition({ transfer: verbDef });

    // Labware resolutions: role name → resolved labware instance
    const labwareResolutions = {
      reservoir: {
        recordId: 'LBI-reservoir-2026-04-26-A',
        kind: 'reservoir_12',
        name: 'Reservoir A',
      },
      plate: {
        recordId: 'LBI-deepwell-2026-04-26-A',
        kind: '96-well-deepwell-plate',
        name: 'Deepwell Plate A',
      },
    };

    const perStepContexts = [
      makePerStepContext('step-1', [
        makeSampleContext(0, 'A1', 200),
      ]),
    ];

    const runPlanResult = makeRunPlanCompileResult(perStepContexts, {
      materialResolutions: {},
      labwareResolutions,
    });

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'transfer',
          phaseId: 'prep',
          source: 'reservoir',
          target: 'plate',
          volume_uL: 200,
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['resolve_local_protocol', { expandedProtocol }],
      ['project_result', { runPlanCompileResult: runPlanResult }],
    ]);

    const state = makeMockState({}, outputs);
    const pass = createPlannedRunEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
    });

    const result = await pass.run({ pass_id: 'planned_run_events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventGraphRef: string; eventCount: number };
    expect(output.eventCount).toBe(1);

    // Verify the record was created
    expect(createdRecords.length).toBe(1);
    const envelope = createdRecords[0]!.envelope;
    expect(envelope.recordId).toMatch(/^EVG-PLR-/);
    expect(envelope.payload.kind).toBe('event-graph');
    expect(envelope.payload.events.length).toBe(1);

    const event = envelope.payload.events[0];

    // Assert concrete labware-instance refs present
    expect(event.source).toBeDefined();
    expect((event.source as Record<string, unknown>).labwareInstanceId).toBe('LBI-reservoir-2026-04-26-A');
    expect((event.source as Record<string, unknown>).role).toBe('reservoir');

    expect(event.target).toBeDefined();
    expect((event.target as Record<string, unknown>).labwareInstanceId).toBe('LBI-deepwell-2026-04-26-A');
    expect((event.target as Record<string, unknown>).role).toBe('plate');

    // Assert semanticKey populated
    expect(event.semanticKey).toBeDefined();
    expect(typeof event.semanticKey).toBe('string');
    expect(event.semanticKey).toMatch(/^EVT-/);
    expect(event.semanticKeyComponents).toBeDefined();
    expect(event.semanticKeyComponents.verb).toBe('transfer');
    expect(event.semanticKeyComponents.phaseId).toBe('prep');
    expect(event.semanticKeyComponents.ordinal).toBe(1);

    // Assert step parameters preserved
    expect(event.kind).toBe('transfer');
    expect(event.stepId).toBe('step-1');
    expect(event.sampleIndex).toBe(0);
    expect(event.wellId).toBe('A1');
    expect(event.volume_uL).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Semantic-key parity with abstract (spec-024)
  // ---------------------------------------------------------------------------

  it('produces matching semanticKey to spec-024 abstract events', async () => {
    const createdRecords: Array<{ envelope: Record<string, unknown>; message: string }> = [];
    const recordStore = makeMockRecordStore(createdRecords);

    const verbDef = makeVerbDefinition('transfer', [
      {
        name: 'source',
        derivedFrom: { input: 'source', fn: 'passthrough' },
        required: true,
      },
      {
        name: 'target',
        derivedFrom: { input: 'target', fn: 'passthrough' },
        required: true,
      },
    ]);

    const loadVerbDef = makeLoadVerbDefinition({ transfer: verbDef });

    // Labware resolutions (same role names as abstract)
    const labwareResolutions = {
      'reservoir-A': {
        recordId: 'LBI-reservoir-A',
        kind: 'reservoir_12',
        name: 'Reservoir A',
      },
      'plate-1': {
        recordId: 'LBI-plate-1',
        kind: '96-well-plate',
        name: 'Plate 1',
      },
    };

    const perStepContexts = [
      makePerStepContext('step-1', [
        makeSampleContext(0, 'A1', 200),
      ]),
    ];

    const runPlanResult = makeRunPlanCompileResult(perStepContexts, {
      materialResolutions: {},
      labwareResolutions,
    });

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'transfer',
          phaseId: 'prep',
          source: 'reservoir-A',
          target: 'plate-1',
          volume_uL: 200,
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    // --- Run spec-024 abstract pass ---
    const abstractOutputs = new Map<string, unknown>([
      ['project_local_expanded_protocol', { expandedProtocol }],
    ]);
    const abstractState = makeMockState({}, abstractOutputs);
    const abstractPass = createEventsEmitPass({
      recordStore: makeMockRecordStore(),
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
    });
    const abstractResult = await abstractPass.run({ pass_id: 'events_emit', state: abstractState });

    expect(abstractResult.ok).toBe(true);
    const abstractRecords: Array<{ envelope: Record<string, unknown>; message: string }> = [];
    const abstractRecordStore = makeMockRecordStore(abstractRecords);
    const abstractPass2 = createEventsEmitPass({
      recordStore: abstractRecordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
    });
    const abstractState2 = makeMockState({}, abstractOutputs);
    await abstractPass2.run({ pass_id: 'events_emit', state: abstractState2 });

    const abstractEvents = abstractRecords[0]!.envelope.payload.events;

    // --- Run concrete pass ---
    const concreteOutputs = new Map<string, unknown>([
      ['resolve_local_protocol', { expandedProtocol }],
      ['project_result', { runPlanCompileResult: runPlanResult }],
    ]);
    const concreteState = makeMockState({}, concreteOutputs);
    const concretePass = createPlannedRunEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
    });
    const concreteResult = await concretePass.run({ pass_id: 'planned_run_events_emit', state: concreteState });

    expect(concreteResult.ok).toBe(true);
    const concreteEvents = createdRecords[0]!.envelope.payload.events;

    // Assert parity: same semanticKey on corresponding events
    expect(concreteEvents.length).toBe(abstractEvents.length);
    for (let i = 0; i < abstractEvents.length; i++) {
      expect(concreteEvents[i].semanticKey).toBe(abstractEvents[i].semanticKey);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3: Multi-sample fanout preserves key
  // ---------------------------------------------------------------------------

  it('multi-sample fanout (96 samples) preserves identical semanticKey', async () => {
    const createdRecords: Array<{ envelope: Record<string, unknown>; message: string }> = [];
    const recordStore = makeMockRecordStore(createdRecords);

    const verbDef = makeVerbDefinition('transfer', [
      {
        name: 'source',
        derivedFrom: { input: 'source', fn: 'passthrough' },
        required: true,
      },
      {
        name: 'target',
        derivedFrom: { input: 'target', fn: 'passthrough' },
        required: true,
      },
    ]);

    const loadVerbDef = makeLoadVerbDefinition({ transfer: verbDef });

    const labwareResolutions = {
      reservoir: {
        recordId: 'LBI-reservoir-2026-04-26-A',
        kind: 'reservoir_12',
        name: 'Reservoir A',
      },
      plate: {
        recordId: 'LBI-deepwell-2026-04-26-A',
        kind: '96-well-deepwell-plate',
        name: 'Deepwell Plate A',
      },
    };

    // Generate 96 sample contexts
    const sampleContexts: Record<string, unknown>[] = [];
    for (let i = 0; i < 96; i++) {
      const row = String.fromCharCode(65 + Math.floor(i / 12));
      const col = (i % 12) + 1;
      sampleContexts.push(makeSampleContext(i, `${row}${col}`, 200));
    }

    const perStepContexts = [
      makePerStepContext('step-1', sampleContexts),
    ];

    const runPlanResult = makeRunPlanCompileResult(perStepContexts, {
      materialResolutions: {},
      labwareResolutions,
    });

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'transfer',
          phaseId: 'prep',
          source: 'reservoir',
          target: 'plate',
          volume_uL: 200,
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 96,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['resolve_local_protocol', { expandedProtocol }],
      ['project_result', { runPlanCompileResult: runPlanResult }],
    ]);

    const state = makeMockState({}, outputs);
    const pass = createPlannedRunEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
    });

    const result = await pass.run({ pass_id: 'planned_run_events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventCount: number };
    expect(output.eventCount).toBe(96);

    const envelope = createdRecords[0]!.envelope;
    const events = envelope.payload.events;

    // All events should share the same semanticKey
    const keys = events.map((e: Record<string, unknown>) => e.semanticKey);
    expect(new Set(keys).size).toBe(1);

    // All should have the same ordinal
    const ordinals = events.map(
      (e: Record<string, unknown>) => e.semanticKeyComponents?.ordinal,
    );
    expect(ordinals.every((o) => o === 1)).toBe(true);

    // All should have wellId populated
    const wellIds = events.map((e: Record<string, unknown>) => e.wellId);
    expect(wellIds.every((w) => w !== undefined && w.length > 0)).toBe(true);

    // All should have labwareInstanceId AND role on source/target
    for (const event of events) {
      expect((event.source as Record<string, unknown>).labwareInstanceId).toBeDefined();
      expect((event.source as Record<string, unknown>).role).toBe('reservoir');
      expect((event.target as Record<string, unknown>).labwareInstanceId).toBeDefined();
      expect((event.target as Record<string, unknown>).role).toBe('plate');
    }
  });

  // ---------------------------------------------------------------------------
  // Test 4: Unbound role gracefully degrades
  // ---------------------------------------------------------------------------

  it('unbound role emits event with role string only and warning diagnostic', async () => {
    const createdRecords: Array<{ envelope: Record<string, unknown>; message: string }> = [];
    const recordStore = makeMockRecordStore(createdRecords);

    const verbDef = makeVerbDefinition('transfer', [
      {
        name: 'source',
        derivedFrom: { input: 'source', fn: 'passthrough' },
        required: true,
      },
      {
        name: 'target',
        derivedFrom: { input: 'target', fn: 'passthrough' },
        required: true,
      },
    ]);

    const loadVerbDef = makeLoadVerbDefinition({ transfer: verbDef });

    // Only plate is bound; reservoir is NOT bound
    const labwareResolutions = {
      plate: {
        recordId: 'LBI-deepwell-2026-04-26-A',
        kind: '96-well-deepwell-plate',
        name: 'Deepwell Plate A',
      },
    };

    const perStepContexts = [
      makePerStepContext('step-1', [
        makeSampleContext(0, 'A1', 200),
      ]),
    ];

    const runPlanResult = makeRunPlanCompileResult(perStepContexts, {
      materialResolutions: {},
      labwareResolutions,
    });

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'transfer',
          phaseId: 'prep',
          source: 'reservoir', // unbound role
          target: 'plate',
          volume_uL: 200,
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['resolve_local_protocol', { expandedProtocol }],
      ['project_result', { runPlanCompileResult: runPlanResult }],
    ]);

    const state = makeMockState({}, outputs);
    const pass = createPlannedRunEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
    });

    const result = await pass.run({ pass_id: 'planned_run_events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventCount: number };
    expect(output.eventCount).toBe(1);

    // Should have a warning diagnostic for unbound role
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBeGreaterThanOrEqual(1);

    const envelope = createdRecords[0]!.envelope;
    const events = envelope.payload.events;
    expect(events.length).toBe(1);

    const event = events[0];

    // Source should have role string only (no labwareInstanceId)
    expect(event.source).toBeDefined();
    expect((event.source as Record<string, unknown>).role).toBe('reservoir');
    // labwareInstanceId should be absent for unbound role
    expect((event.source as Record<string, unknown>).labwareInstanceId).toBeUndefined();

    // Target should have both labwareInstanceId AND role (bound)
    expect(event.target).toBeDefined();
    expect((event.target as Record<string, unknown>).labwareInstanceId).toBe('LBI-deepwell-2026-04-26-A');
    expect((event.target as Record<string, unknown>).role).toBe('plate');

    // semanticKey should still be computed using the role string
    expect(event.semanticKey).toBeDefined();
    expect(typeof event.semanticKey).toBe('string');
    expect(event.semanticKey).toMatch(/^EVT-/);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Pass exports id and family
  // ---------------------------------------------------------------------------

  it('exports pass with id planned_run_events_emit and family project', async () => {
    const recordStore = makeMockRecordStore();
    const loadVerbDef = async () => null;

    const pass = createPlannedRunEventsEmitPass({
      recordStore,
      loadVerbDefinition: loadVerbDef,
    });

    expect(pass.id).toBe('planned_run_events_emit');
    expect(pass.family).toBe('project');
  });

  // ---------------------------------------------------------------------------
  // Test 6: Missing project_result → ok:false
  // ---------------------------------------------------------------------------

  it('missing project_result returns ok:false', async () => {
    const recordStore = makeMockRecordStore();
    const loadVerbDef = async () => null;

    const pass = createPlannedRunEventsEmitPass({
      recordStore,
      loadVerbDefinition: loadVerbDef,
    });

    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'planned_run_events_emit', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics![0]!.code).toBe('missing_project_result');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Custom recordIdPrefix
  // ---------------------------------------------------------------------------

  it('uses custom recordIdPrefix when provided', async () => {
    const createdRecords: Array<{ envelope: Record<string, unknown>; message: string }> = [];
    const recordStore = makeMockRecordStore(createdRecords);

    const verbDef = makeVerbDefinition('transfer', [
      {
        name: 'source',
        derivedFrom: { input: 'source', fn: 'passthrough' },
        required: true,
      },
      {
        name: 'target',
        derivedFrom: { input: 'target', fn: 'passthrough' },
        required: true,
      },
    ]);

    const loadVerbDef = makeLoadVerbDefinition({ transfer: verbDef });

    const labwareResolutions = {
      reservoir: {
        recordId: 'LBI-reservoir-A',
        kind: 'reservoir_12',
        name: 'Reservoir A',
      },
      plate: {
        recordId: 'LBI-plate-A',
        kind: '96-well-plate',
        name: 'Plate A',
      },
    };

    const perStepContexts = [
      makePerStepContext('step-1', [
        makeSampleContext(0, 'A1', 200),
      ]),
    ];

    const runPlanResult = makeRunPlanCompileResult(perStepContexts, {
      materialResolutions: {},
      labwareResolutions,
    });

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'transfer',
          phaseId: 'prep',
          source: 'reservoir',
          target: 'plate',
          volume_uL: 200,
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['resolve_local_protocol', { expandedProtocol }],
      ['project_result', { runPlanCompileResult: runPlanResult }],
    ]);

    const state = makeMockState({}, outputs);
    const pass = createPlannedRunEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
      recordIdPrefix: 'CUSTOM-',
    });

    const result = await pass.run({ pass_id: 'planned_run_events_emit', state });

    expect(result.ok).toBe(true);
    const envelope = createdRecords[0]!.envelope;
    expect(envelope.recordId).toMatch(/^CUSTOM-/);
  });

  // ---------------------------------------------------------------------------
  // Test 8: add_material step with material binding
  // ---------------------------------------------------------------------------

  it('add_material step emits event with material binding and role', async () => {
    const createdRecords: Array<{ envelope: Record<string, unknown>; message: string }> = [];
    const recordStore = makeMockRecordStore(createdRecords);

    const verbDef = makeVerbDefinition('add_material', [
      {
        name: 'target',
        derivedFrom: { input: 'target', fn: 'passthrough' },
        required: true,
      },
      {
        name: 'material',
        derivedFrom: { input: 'material', fn: 'substance_id' },
        required: true,
      },
    ]);

    const loadVerbDef = makeLoadVerbDefinition({ add_material: verbDef });

    const labwareResolutions = {
      plate: {
        recordId: 'LBI-plate-A',
        kind: '96-well-plate',
        name: 'Plate A',
      },
    };

    const materialResolutions = {
      buffer: {
        recordId: 'MAT-buffer-2026-04-26',
        kind: 'material',
        name: 'Buffer Solution',
      },
    };

    const perStepContexts = [
      makePerStepContext('step-1', [
        makeSampleContext(0, 'A1', 100),
      ]),
    ];

    const runPlanResult = makeRunPlanCompileResult(perStepContexts, {
      materialResolutions,
      labwareResolutions,
    });

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'add_material',
          phaseId: 'prep',
          target: 'plate',
          material: 'buffer',
          volume_uL: 100,
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['resolve_local_protocol', { expandedProtocol }],
      ['project_result', { runPlanCompileResult: runPlanResult }],
    ]);

    const state = makeMockState({}, outputs);
    const pass = createPlannedRunEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
    });

    const result = await pass.run({ pass_id: 'planned_run_events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventCount: number };
    expect(output.eventCount).toBe(1);

    const envelope = createdRecords[0]!.envelope;
    const events = envelope.payload.events;
    expect(events.length).toBe(1);

    const event = events[0];

    // Target should have labwareInstanceId AND role
    expect(event.target).toBeDefined();
    expect((event.target as Record<string, unknown>).labwareInstanceId).toBe('LBI-plate-A');
    expect((event.target as Record<string, unknown>).role).toBe('plate');

    // Material should have materialInstanceRef AND role
    expect(event.material).toBeDefined();
    expect((event.material as Record<string, unknown>).materialInstanceRef).toBe('MAT-buffer-2026-04-26');
    expect((event.material as Record<string, unknown>).role).toBe('buffer');

    // semanticKey should be populated
    expect(event.semanticKey).toBeDefined();
    expect(typeof event.semanticKey).toBe('string');
    expect(event.semanticKey).toMatch(/^EVT-/);
  });
});
