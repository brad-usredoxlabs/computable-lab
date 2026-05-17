import { describe, expect, it } from 'vitest';
import {
  createProtocolIntentStatePlanPass,
  planProtocolIntentState,
} from './ProtocolIntentStatePlanner.js';
import {
  createEmptyProtocolIntent,
  type ProtocolIntent,
} from './ProtocolIntent.js';

function fireIntent(): ProtocolIntent {
  const intent = createEmptyProtocolIntent({
    intentId: 'fire-assay-state',
    steps: [
      { id: 'step-1', index: 1, text: 'Place plate and reservoir.' },
      { id: 'step-4', index: 4, text: 'Rotate and swap pipette.' },
      { id: 'step-7', index: 7, text: 'Perform serial dilution.' },
      { id: 'step-8', index: 8, text: 'Incubate.' },
    ],
  });

  intent.resources.labwareInstances.push(
    {
      id: 'plate_D',
      labwareHint: '96 well TC-coated plate',
      deckSlot: 'D',
      initialOrientation: 'landscape',
      role: 'target',
    },
    {
      id: 'reservoir_C',
      labwareHint: '12-well SBS format reservoir',
      deckSlot: 'C',
      initialOrientation: 'landscape',
      role: 'source',
    },
  );
  intent.resources.materialDefinitions.push(
    { id: 'dmem', label: 'DMEM', kind: 'media' },
    { id: 'clofibrate', label: 'clofibrate', kind: 'compound' },
    { id: 'resazurin', label: 'resazurin', kind: 'dye' },
  );
  intent.resources.materialFormulations.push({
    id: 'dmem_1x_glucose_2x_bcaa',
    label: 'DMEM 1X glucose, 2X BCAA',
    components: [
      { materialRef: 'dmem', label: 'DMEM', role: 'base' },
      { materialRef: 'glucose', label: 'glucose', concentration: { raw: '1X', fold: 1 } },
      { materialRef: 'bcaa', label: 'BCAA', concentration: { raw: '2X', fold: 2 } },
    ],
  });
  intent.resources.materialAliquots.push(
    {
      id: 'reservoir_C_well_2',
      labware: 'reservoir_C',
      well: '2',
      formulation: 'dmem_1x_glucose_2x_bcaa',
      volumeUl: 4000,
    },
    {
      id: 'reservoir_C_well_7',
      labware: 'reservoir_C',
      well: '7',
      materialRef: 'clofibrate',
      volumeUl: 100,
      concentration: { raw: '1mM', value: 1, unit: 'mM' },
    },
  );
  intent.resources.pipettes.push(
    {
      id: 'pipette_8ch_300ul',
      label: '8-channel 300uL pipette',
      channels: 8,
      maxVolumeUl: 300,
    },
    {
      id: 'pipette_12ch_125ul',
      label: '12-channel adjustable-spacing 125uL pipette',
      channels: 12,
      maxVolumeUl: 125,
      adjustableSpacing: true,
    },
  );
  intent.resources.tips.push(
    { id: 'tips_300ul_landscape', label: '300uL tips', volumeUl: 300, orientation: 'landscape' },
    { id: 'tips_125ul_portrait', label: '125uL tips', volumeUl: 125, orientation: 'portrait' },
  );
  intent.resources.waste.push({ id: 'default_waste', label: 'trash/waste' });
  intent.operations.push(
    { id: 'op-reorient-plate', kind: 'reorient_labware', stepId: 'step-4', labware: 'plate_D', params: { orientation: 'portrait' } },
    { id: 'op-reorient-reservoir', kind: 'reorient_labware', stepId: 'step-4', labware: 'reservoir_C', params: { orientation: 'portrait' } },
    { id: 'op-swap-pipette', kind: 'swap_pipette', stepId: 'step-4', pipette: 'pipette_12ch_125ul' },
    { id: 'op-replace-tips', kind: 'replace_tips', stepId: 'step-4', tipResource: 'tips_125ul_portrait' },
    { id: 'op-collapse', kind: 'set_tip_spacing', stepId: 'step-5', pipette: 'pipette_12ch_125ul', spacingMm: 4.5 },
    { id: 'op-aspirate-clofibrate', kind: 'aspirate', stepId: 'step-6', sourceLabware: 'reservoir_C', sourceWell: '7', materialRef: 'clofibrate', volumeUl: 5 },
    { id: 'op-expand', kind: 'set_tip_spacing', stepId: 'step-7', spacingMm: 9 },
    { id: 'op-dispense-clofibrate', kind: 'dispense', stepId: 'step-7', targetLabware: 'plate_D', targetWells: ['A1'], volumeUl: 5 },
    { id: 'op-mix-row-one', kind: 'pipette_mix', stepId: 'step-7', labware: 'plate_D', targetWells: ['A1'], volumeUl: 125, cycles: 5 },
    { id: 'op-eject-tips', kind: 'eject_tips', stepId: 'step-7', waste: 'default_waste' },
    { id: 'op-incubate', kind: 'incubate', stepId: 'step-8', labware: 'plate_D', temperatureC: 37, co2Percent: 5, durationSeconds: 7200 },
  );
  intent.patterns.push({
    id: 'pattern-serial-dilution',
    kind: 'serial_dilution',
    stepId: 'step-7',
    sourceLabware: 'reservoir_C',
    targetLabware: 'plate_D',
    ratio: '4:1',
    direction: 'down_rows',
    params: { transferVolumeUl: 25 },
  });
  intent.assumptions.push({
    id: 'assumption-same-volume',
    message: 'wells 1-6 inherit 4 mL unless changed',
  });

  return intent;
}

describe('ProtocolIntentStatePlanner', () => {
  it('folds FIRE resources and operations into deterministic protocol state', () => {
    const plan = planProtocolIntentState(fireIntent());

    expect(plan.status).toBe('ready');
    expect(plan.finalState.labware.plate_D).toMatchObject({
      deckSlot: 'D',
      orientation: 'portrait',
      incubation: {
        temperatureC: 37,
        co2Percent: 5,
        durationSeconds: 7200,
      },
    });
    expect(plan.finalState.labware.reservoir_C.contents['2']).toContainEqual(expect.objectContaining({
      formulation: 'dmem_1x_glucose_2x_bcaa',
      volumeUl: 4000,
    }));
    expect(plan.finalState.labware.plate_D.contents.A1).toContainEqual(expect.objectContaining({
      materialRef: 'clofibrate',
      volumeUl: 5,
    }));
    expect(plan.finalState.pipettes.pipette_12ch_125ul).toMatchObject({
      activeTipSpacingMm: 9,
    });
    expect(plan.finalState.tips.tips_125ul_portrait.loaded).toBe(false);
    expect(plan.finalState.active.pendingAspirates).toEqual([]);
    expect(plan.patternsPendingExpansion).toContainEqual(expect.objectContaining({
      kind: 'serial_dilution',
      ratio: '4:1',
    }));
    expect(plan.finalState.assumptions).toContain('wells 1-6 inherit 4 mL unless changed');
    expect(plan.transitions).toHaveLength(11);
  });

  it('emits blockers when stateful operations reference missing resources', () => {
    const intent = createEmptyProtocolIntent({ intentId: 'blocked-state' });
    intent.operations.push({
      id: 'op-reorient-missing',
      kind: 'reorient_labware',
      labware: 'plate_D',
      params: { orientation: 'portrait' },
    });
    intent.operations.push({
      id: 'op-spacing-missing',
      kind: 'set_tip_spacing',
      spacingMm: 4.5,
    });

    const plan = planProtocolIntentState(intent);

    expect(plan.status).toBe('blocked');
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: 'unknown_labware',
      operationId: 'op-reorient-missing',
    }));
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: 'unknown_pipette',
      operationId: 'op-spacing-missing',
    }));
  });

  it('provides a pipeline pass output when ai_precompile carries protocolIntent', () => {
    const pass = createProtocolIntentStatePlanPass();
    const result = pass.run({
      pass_id: 'protocol_intent_state_plan',
      state: {
        input: { prompt: '' },
        context: {},
        meta: {},
        outputs: new Map([['ai_precompile', { protocolIntent: fireIntent() }]]),
        diagnostics: [],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      protocolIntentStatePlan: {
        kind: 'protocol-intent-state-plan',
        status: 'ready',
      },
    });
  });
});
