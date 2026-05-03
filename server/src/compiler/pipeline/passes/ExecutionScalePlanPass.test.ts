import { describe, expect, it } from 'vitest';
import { createDeriveExecutionScalePlanPass, type DeriveExecutionScalePlanOutput } from './ChatbotCompilePasses.js';
import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';
import type { PipelineState } from '../types.js';

function makeState(inputPrompt: string, events: PlateEventPrimitive[]): PipelineState {
  return {
    input: { prompt: inputPrompt },
    context: {},
    meta: {},
    diagnostics: [],
    outputs: new Map<string, unknown>([
      ['compute_volumes', { events }],
      ['compute_resources', {
        resourceManifest: {
          tipRacks: [],
          reservoirLoads: [],
          consumables: [],
        },
      }],
    ]),
  };
}

describe('derive_execution_scale_plan pass', () => {
  it('derives a ready bench multichannel plan from plate and reservoir cues', async () => {
    const pass = createDeriveExecutionScalePlanPass();
    const events: PlateEventPrimitive[] = [
      {
        eventId: 'evt-transfer-1',
        event_type: 'transfer',
        labwareId: 'lbw-def-generic-96-well-plate',
        details: {
          source_labware: 'lbw-def-generic-12-well-reservoir',
          source_well: 'A1',
          destination_labware: 'lbw-def-generic-96-well-plate',
          wells: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'],
          volume: { value: 10, unit: 'uL' },
        },
      },
    ];

    const result = await pass.run({
      pass_id: pass.id,
      state: makeState(
        'Scale the tube protocol to a 96-well plate with a 12-well reservoir and an 8-channel pipette.',
        events,
      ),
    });
    const output = result.output as DeriveExecutionScalePlanOutput;

    expect(output.executionScalePlan).toMatchObject({
      kind: 'execution-scale-plan',
      recordId: 'execution-scale-plan/bench_plate_multichannel',
      sourceLevel: 'manual_tubes',
      targetLevel: 'bench_plate_multichannel',
      profileRef: 'execution-scale-profile/bench-96-multichannel',
      status: 'ready',
      sampleLayout: {
        labwareKind: '96_well_plate',
        labwareDefinition: 'lbw-def-generic-96-well-plate',
        sampleCount: 8,
      },
      pipettingStrategy: {
        pipetteMode: 'multi_channel_parallel',
        channels: 8,
      },
    });
    expect(output.executionScalePlan?.reagentLayout[0]).toMatchObject({
      sourceLabwareKind: '12_well_reservoir',
      sourceLabwareDefinition: 'lbw-def-generic-12-well-reservoir',
      sourceWells: ['A1'],
    });
  });

  it('blocks robot deck plans that need missing two-well reservoir definitions', async () => {
    const pass = createDeriveExecutionScalePlanPass();
    const result = await pass.run({
      pass_id: pass.id,
      state: makeState(
        'Run 96 samples on ASSIST PLUS with 2-well reagent reservoirs, a 96-well plate, and an 8-channel pipette.',
        [],
      ),
    });
    const output = result.output as DeriveExecutionScalePlanOutput;

    expect(output.executionScalePlan?.targetLevel).toBe('robot_deck');
    expect(output.executionScalePlan?.recordId).toBe('execution-scale-plan/robot_deck');
    expect(output.executionScalePlan?.profileRef).toBe('execution-scale-profile/robot-assist-plus-96');
    expect(output.executionScalePlan?.deckBinding?.platform).toBe('integra_assist');
    expect(output.executionScalePlan?.status).toBe('blocked');
    expect(output.executionScalePlan?.blockers).toContainEqual(
      expect.objectContaining({ code: 'missing_2_well_reservoir_definition' }),
    );
  });
});
