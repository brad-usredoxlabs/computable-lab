/**
 * Tests for EventsEmitPass.
 *
 * Covers:
 * - Single-step single-sample (1 event)
 * - Multi-step single-phase (events sorted by step order, ordinals 1, 2, 3)
 * - Multi-sample fan-out (96 events from one step, same semanticKey)
 * - Semantic-key uniqueness across multi-step (distinct keys)
 * - Verb-definition missing (warning diagnostic, event without semanticKey)
 */

import { describe, it, expect } from 'vitest';
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

// ---------------------------------------------------------------------------
// Test 1: Single-step single-sample → 1 event with semanticKey
// ---------------------------------------------------------------------------

describe('EventsEmitPass', () => {
  it('single-step single-sample emits 1 event with semanticKey populated', async () => {
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

    const pass = createEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
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
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['project_local_expanded_protocol', { expandedProtocol }],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventGraphRef: string; eventCount: number };
    expect(output.eventCount).toBe(1);

    // Verify the record was created
    expect(createdRecords.length).toBe(1);
    const envelope = createdRecords[0]!.envelope;
    expect(envelope.recordId).toMatch(/^EVG-/);
    expect(envelope.payload.kind).toBe('event-graph');
    expect(envelope.payload.events.length).toBe(1);

    const event = envelope.payload.events[0];
    expect(event.semanticKey).toBeDefined();
    expect(typeof event.semanticKey).toBe('string');
    expect(event.semanticKey).toMatch(/^EVT-/);
    expect(event.semanticKeyComponents).toBeDefined();
    expect(event.semanticKeyComponents.verb).toBe('transfer');
    expect(event.semanticKeyComponents.phaseId).toBe('prep');
    expect(event.semanticKeyComponents.ordinal).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Multi-step single-phase same verb → ordinals 1, 2, 3
  // ---------------------------------------------------------------------------

  it('multi-step single-phase emits events sorted by step order with ordinals 1, 2, 3', async () => {
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

    const pass = createEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
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
        },
        {
          stepId: 'step-2',
          kind: 'transfer',
          phaseId: 'prep',
          source: 'reservoir-A',
          target: 'plate-1',
        },
        {
          stepId: 'step-3',
          kind: 'transfer',
          phaseId: 'prep',
          source: 'reservoir-A',
          target: 'plate-1',
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['project_local_expanded_protocol', { expandedProtocol }],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventCount: number };
    expect(output.eventCount).toBe(3);

    const envelope = createdRecords[0]!.envelope;
    const events = envelope.payload.events;

    // semanticKey includes ordinal, so keys differ for different ordinals
    const keys = events.map((e: Record<string, unknown>) => e.semanticKey);
    expect(new Set(keys).size).toBe(3); // distinct keys due to different ordinals

    // But ordinals should be 1, 2, 3
    const ordinals = events.map(
      (e: Record<string, unknown>) => e.semanticKeyComponents?.ordinal,
    );
    expect(ordinals).toEqual([1, 2, 3]);

    // Steps should be in order
    const stepIds = events.map((e: Record<string, unknown>) => e.stepId);
    expect(stepIds).toEqual(['step-1', 'step-2', 'step-3']);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Multi-sample fan-out → 96 events, all same semanticKey
  // ---------------------------------------------------------------------------

  it('multi-sample fan-out emits 96 events with identical semanticKey', async () => {
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

    const pass = createEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
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
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 96,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['project_local_expanded_protocol', { expandedProtocol }],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventCount: number };
    expect(output.eventCount).toBe(96);

    const envelope = createdRecords[0]!.envelope;
    const events = envelope.payload.events;

    // All events should share the same semanticKey (sample is parameter, not identity)
    const keys = events.map((e: Record<string, unknown>) => e.semanticKey);
    expect(new Set(keys).size).toBe(1);

    // All should have the same ordinal
    const ordinals = events.map(
      (e: Record<string, unknown>) => e.semanticKeyComponents?.ordinal,
    );
    expect(ordinals.every((o) => o === 1)).toBe(true);

    // Sample indices should be 0..95
    const sampleIndices = events.map(
      (e: Record<string, unknown>) => e.sampleIndex,
    );
    expect(sampleIndices).toEqual(
      Array.from({ length: 96 }, (_, i) => i),
    );
  });

  // ---------------------------------------------------------------------------
  // Test 4: Semantic-key uniqueness across multi-step with different identity
  // ---------------------------------------------------------------------------

  it('emits distinct semantic keys for distinct identity tuples', async () => {
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

    const pass = createEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
    });

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 's1',
          kind: 'transfer',
          phaseId: 'prep',
          source: 'reservoir-A',
          target: 'plate-1',
        },
        {
          stepId: 's2',
          kind: 'transfer',
          phaseId: 'prep',
          source: 'reservoir-B',
          target: 'plate-1',
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['project_local_expanded_protocol', { expandedProtocol }],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventCount: number };
    expect(output.eventCount).toBe(2);

    const envelope = createdRecords[0]!.envelope;
    const events = envelope.payload.events;
    const keys = events.map((e: Record<string, unknown>) => e.semanticKey);

    // Keys should be distinct because identity tuples differ (source differs)
    expect(new Set(keys).size).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Verb-definition missing → warning diagnostic, event without semanticKey
  // ---------------------------------------------------------------------------

  it('missing verb-definition emits warning diagnostic and event without semanticKey', async () => {
    const createdRecords: Array<{ envelope: Record<string, unknown>; message: string }> = [];
    const recordStore = makeMockRecordStore(createdRecords);

    // No verb definitions at all
    const loadVerbDef = async (_canonical: string) => null;

    const pass = createEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
    });

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'unknown_verb',
          phaseId: 'prep',
          source: 'reservoir-A',
          target: 'plate-1',
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['project_local_expanded_protocol', { expandedProtocol }],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventCount: number };
    expect(output.eventCount).toBe(1);

    // Should have a warning diagnostic
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]!.severity).toBe('warning');
    expect(result.diagnostics![0]!.code).toBe('missing_verb_definition');

    // Event should still be emitted but without semanticKey
    const envelope = createdRecords[0]!.envelope;
    const events = envelope.payload.events;
    expect(events.length).toBe(1);
    expect(events[0]!.semanticKey).toBeUndefined();
    expect(events[0]!.stepId).toBe('step-1');
  });

  // ---------------------------------------------------------------------------
  // Test 6: Missing expanded protocol → ok:false
  // ---------------------------------------------------------------------------

  it('missing expanded protocol returns ok:false', async () => {
    const recordStore = makeMockRecordStore();
    const loadVerbDef = async () => null;

    const pass = createEventsEmitPass({
      recordStore,
      loadVerbDefinition: loadVerbDef,
    });

    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'events_emit', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics![0]!.code).toBe('missing_expanded_protocol');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Multi-plate fan-out
  // ---------------------------------------------------------------------------

  it('multi-plate fan-out emits events for each plate', async () => {
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

    const pass = createEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
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
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 2,
      resolvedPlateCount: 3,
    };

    const outputs = new Map<string, unknown>([
      ['project_local_expanded_protocol', { expandedProtocol }],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'events_emit', state });

    expect(result.ok).toBe(true);
    const output = result.output as { eventCount: number };
    // 1 step × 2 samples × 3 plates = 6 events
    expect(output.eventCount).toBe(6);

    const envelope = createdRecords[0]!.envelope;
    const events = envelope.payload.events;

    // All events share the same semanticKey (same step identity and ordinal)
    const keys = events.map((e: Record<string, unknown>) => e.semanticKey);
    expect(new Set(keys).size).toBe(1);

    // Labwares should have 3 entries
    expect(envelope.payload.labwares.length).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Custom recordIdPrefix
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

    const pass = createEventsEmitPass({
      recordStore,
      buildSemanticKey,
      derivations,
      loadVerbDefinition: loadVerbDef,
      recordIdPrefix: 'CUSTOM-',
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
        },
      ],
      phases: [{ id: 'prep', label: 'Prep', ordinal: 1 }],
      resolvedSampleCount: 1,
      resolvedPlateCount: 1,
    };

    const outputs = new Map<string, unknown>([
      ['project_local_expanded_protocol', { expandedProtocol }],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'events_emit', state });

    expect(result.ok).toBe(true);
    const envelope = createdRecords[0]!.envelope;
    expect(envelope.recordId).toMatch(/^CUSTOM-/);
  });

  // ---------------------------------------------------------------------------
  // Test 9: Pass exports id and family
  // ---------------------------------------------------------------------------

  it('exports pass with id events_emit and family project', async () => {
    const recordStore = makeMockRecordStore();
    const loadVerbDef = async () => null;

    const pass = createEventsEmitPass({
      recordStore,
      loadVerbDefinition: loadVerbDef,
    });

    expect(pass.id).toBe('events_emit');
    expect(pass.family).toBe('project');
  });
});
