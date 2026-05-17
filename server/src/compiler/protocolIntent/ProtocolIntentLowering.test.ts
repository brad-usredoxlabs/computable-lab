import { describe, expect, it } from 'vitest';
import type { PipelineState } from '../pipeline/types.js';
import type { ProtocolIntent } from './ProtocolIntent.js';
import {
  createLowerProtocolIntentPass,
  lowerProtocolIntent,
  lowerProtocolIntentDirectives,
  lowerProtocolIntentLabwareCandidates,
  lowerProtocolIntentOperations,
  type ProtocolIntentLoweringOutput,
} from './ProtocolIntentLowering.js';

function protocolIntent(patch: Partial<ProtocolIntent>): ProtocolIntent {
  return {
    kind: 'protocol_intent',
    version: '0.1.0',
    intentId: 'intent-1',
    sourcePrompt: 'test protocol',
    steps: [],
    resources: {
      labwareInstances: [],
      materialDefinitions: [],
      materialFormulations: [],
      materialAliquots: [],
      pipettes: [],
      tips: [],
      waste: [],
    },
    operations: [],
    patterns: [],
    assumptions: [],
    unresolved: [],
    ...patch,
    resources: {
      labwareInstances: patch.resources?.labwareInstances ?? [],
      materialDefinitions: patch.resources?.materialDefinitions ?? [],
      materialFormulations: patch.resources?.materialFormulations ?? [],
      materialAliquots: patch.resources?.materialAliquots ?? [],
      pipettes: patch.resources?.pipettes ?? [],
      tips: patch.resources?.tips ?? [],
      waste: patch.resources?.waste ?? [],
    },
  };
}

describe('ProtocolIntentLowering', () => {
  it('lowers labware, tips, and waste resources into candidate labware placements', () => {
    const intent = protocolIntent({
      resources: {
        labwareInstances: [
          { id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D', role: 'target' },
        ],
        tips: [
          { id: 'tips_C', label: '50 uL tips', deckSlot: 'C' },
        ],
        waste: [
          { id: 'waste_A', label: 'liquid waste', deckSlot: 'A' },
        ],
        materialDefinitions: [],
        materialFormulations: [],
        materialAliquots: [],
        pipettes: [],
      },
    });

    expect(lowerProtocolIntentLabwareCandidates(intent)).toEqual([
      {
        hint: '96 well plate',
        reason: 'ProtocolIntent target labware resource plate_D',
        deckSlot: 'D',
      },
      {
        hint: '50 uL tips',
        reason: 'ProtocolIntent tip resource tips_C',
        deckSlot: 'C',
      },
      {
        hint: 'liquid waste',
        reason: 'ProtocolIntent waste resource waste_A',
        deckSlot: 'A',
      },
    ]);
  });

  it('lowers supported ProtocolIntent state operations into directives', () => {
    const intent = protocolIntent({
      resources: {
        labwareInstances: [],
        materialDefinitions: [],
        materialFormulations: [],
        materialAliquots: [],
        pipettes: [{ id: 'p50', label: 'p50Multi', mount: 'left' }],
        tips: [],
        waste: [],
      },
      operations: [
        { id: 'op-orient', kind: 'reorient_labware', labware: 'plate_D', params: { orientation: 'portrait' } },
        { id: 'op-mount', kind: 'set_active_pipette', pipette: 'p50' },
        { id: 'op-swap', kind: 'swap_pipette', params: { from: 'right', to: 'p1000Single' } },
      ],
    });

    expect(lowerProtocolIntentDirectives(intent)).toEqual([
      {
        kind: 'reorient_labware',
        params: { labwareInstanceId: 'plate_D', orientation: 'portrait', protocolIntentOperationId: 'op-orient' },
      },
      {
        kind: 'mount_pipette',
        params: { mountSide: 'left', pipetteType: 'p50Multi', protocolIntentOperationId: 'op-mount' },
      },
      {
        kind: 'swap_pipette',
        params: { from: 'right', to: 'p1000Single', protocolIntentOperationId: 'op-swap' },
      },
    ]);
  });

  it('lowers material aliquots and simple operations into primitive events', () => {
    const intent = protocolIntent({
      resources: {
        labwareInstances: [],
        materialDefinitions: [
          { id: 'cells', label: 'cells', kind: 'cell_line' },
          { id: 'media', label: 'media', kind: 'media' },
        ],
        materialFormulations: [],
        materialAliquots: [
          { id: 'aliquot-media', labware: 'reservoir_C', well: '1', materialRef: 'media', volumeUl: 5000 },
        ],
        pipettes: [],
        tips: [],
        waste: [],
      },
      operations: [
        { id: 'op-load', kind: 'load_material', labware: 'plate_D', targetWells: ['A1'], materialRef: 'cells', volumeUl: 50 },
        {
          id: 'op-transfer',
          kind: 'transfer',
          sourceLabware: 'reservoir_C',
          sourceWell: '1',
          targetLabware: 'plate_D',
          targetWells: ['A1', 'A2'],
          materialRef: 'media',
          volumeUl: 100,
        },
        { id: 'op-mix', kind: 'pipette_mix', labware: 'plate_D', targetWells: ['A1'], cycles: 5, volumeUl: 80 },
        { id: 'op-incubate', kind: 'incubate', labware: 'plate_D', temperatureC: 37, co2Percent: 5, durationSeconds: 3600 },
      ],
    });

    const events = lowerProtocolIntentOperations(intent);

    expect(events.map((event) => event.event_type)).toEqual([
      'add_material',
      'add_material',
      'transfer',
      'transfer',
      'mix',
      'incubate',
    ]);
    expect(events[0]!.details).toMatchObject({
      labwareInstanceId: 'reservoir_C',
      well: '1',
      protocolIntentAliquotId: 'aliquot-media',
      material: { materialId: 'media', kind: 'media', volumeUl: 5000 },
    });
    expect(events[1]!.details).toMatchObject({
      labwareInstanceId: 'plate_D',
      well: 'A1',
      protocolIntentOperationId: 'op-load',
      material: { materialId: 'cells', kind: 'cell_line', volumeUl: 50 },
    });
    expect(events[2]!.details).toMatchObject({
      source_labware: 'reservoir_C',
      destination_labware: 'plate_D',
      source_well: '1',
      well: 'A1',
      protocolIntentOperationId: 'op-transfer',
    });
    expect(events[4]!.details).toMatchObject({
      labware: 'plate_D',
      well: 'A1',
      cycles: 5,
      volumeUl: 80,
    });
    expect(events[5]!.details).toMatchObject({
      labware: 'plate_D',
      temperatureC: 37,
      co2Percent: 5,
      durationSeconds: 3600,
    });
  });

  it('lowerProtocolIntent returns the combined Phase 6 compiler handoff', () => {
    const intent = protocolIntent({
      resources: {
        labwareInstances: [
          { id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D' },
        ],
        materialDefinitions: [],
        materialFormulations: [],
        materialAliquots: [],
        pipettes: [],
        tips: [],
        waste: [],
      },
      operations: [
        { id: 'op-orient', kind: 'reorient_labware', labware: 'plate_D', params: { orientation: 'portrait' } },
      ],
    });

    expect(lowerProtocolIntent(intent)).toMatchObject({
      candidateLabwares: [{ hint: '96 well plate', deckSlot: 'D' }],
      directives: [{ kind: 'reorient_labware' }],
      events: [],
    });
  });

  it('pass emits empty output when ai_precompile has no ProtocolIntent', () => {
    const pass = createLowerProtocolIntentPass();
    const state: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([['ai_precompile', {}]]),
      diagnostics: [],
    };

    const result = pass.run({ pass_id: 'lower_protocol_intent', state }) as {
      ok: boolean;
      output: ProtocolIntentLoweringOutput;
    };

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ events: [], candidateLabwares: [], directives: [] });
  });

  it('pass with state-plan blockers emits labware candidates but suppresses operation lowering', () => {
    const pass = createLowerProtocolIntentPass();
    const intent = protocolIntent({
      resources: {
        labwareInstances: [
          { id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D' },
        ],
        materialDefinitions: [{ id: 'cells', label: 'cells', kind: 'cell_line' }],
        materialFormulations: [],
        materialAliquots: [],
        pipettes: [],
        tips: [],
        waste: [],
      },
      operations: [
        { id: 'op-load', kind: 'load_material', labware: 'plate_D', targetWells: ['A1'], materialRef: 'cells' },
      ],
    });
    const state: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { protocolIntent: intent }],
        ['protocol_intent_state_plan', {
          protocolIntentStatePlan: {
            kind: 'protocol-intent-state-plan',
            source: 'protocolIntent',
            status: 'blocked',
            intentId: 'intent-1',
            finalState: {
              labware: {},
              materials: {},
              formulations: {},
              pipettes: {},
              tips: {},
              waste: {},
              active: { pendingAspirates: [] },
              assumptions: [],
              unresolved: [],
            },
            transitions: [],
            blockers: [{ code: 'missing_material', message: 'material is unresolved' }],
            patternsPendingExpansion: [],
          },
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({ pass_id: 'lower_protocol_intent', state }) as {
      ok: boolean;
      output: ProtocolIntentLoweringOutput;
      diagnostics?: Array<{ code: string }>;
    };

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      events: [],
      directives: [],
      candidateLabwares: [
        {
          hint: '96 well plate',
          reason: 'ProtocolIntent labware resource plate_D',
          deckSlot: 'D',
        },
      ],
    });
    expect(result.diagnostics?.[0]?.code).toBe('protocol_intent_state_blocker');
  });

  it('pass with validation blockers suppresses operation lowering before event graph emission', () => {
    const pass = createLowerProtocolIntentPass();
    const intent = protocolIntent({
      resources: {
        labwareInstances: [
          { id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D' },
        ],
        materialDefinitions: [{ id: 'cells', label: 'cells', kind: 'cell_line' }],
        materialFormulations: [],
        materialAliquots: [],
        pipettes: [],
        tips: [],
        waste: [],
      },
      operations: [
        { id: 'op-load', kind: 'load_material', labware: 'plate_D', targetWells: ['A1'], materialRef: 'cells' },
      ],
    });
    const state: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { protocolIntent: intent }],
        ['validate_protocol_intent', {
          status: 'blocked',
          findings: [],
          blockers: [
            {
              severity: 'error',
              code: 'dangling_material_reference',
              message: 'material is missing',
              path: 'operations.0.materialRef',
              blocksLowering: true,
            },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({ pass_id: 'lower_protocol_intent', state }) as {
      ok: boolean;
      output: ProtocolIntentLoweringOutput;
      diagnostics?: Array<{ code: string; details?: Record<string, unknown> }>;
    };

    expect(result.ok).toBe(true);
    expect(result.output.events).toEqual([]);
    expect(result.output.directives).toEqual([]);
    expect(result.output.candidateLabwares).toEqual([
      expect.objectContaining({ hint: '96 well plate', deckSlot: 'D' }),
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'protocol_intent_validation_blocker',
        details: expect.objectContaining({ code: 'dangling_material_reference' }),
      }),
    ]);
  });
});
