import { describe, expect, it } from 'vitest';
import {
  createEmptyProtocolIntent,
  isProtocolIntent,
  normalizeProtocolIntent,
  PROTOCOL_INTENT_KIND,
  PROTOCOL_INTENT_VERSION,
  type ProtocolIntent,
} from './ProtocolIntent.js';

describe('ProtocolIntent IR', () => {
  it('creates an empty intent with stable resource buckets', () => {
    const intent = createEmptyProtocolIntent({
      intentId: 'fire-assay',
      sourcePrompt: 'Place a plate on slot D.',
      steps: [{ id: 'step-1', index: 1, text: 'Place a plate on slot D.' }],
    });

    expect(intent).toMatchObject({
      kind: PROTOCOL_INTENT_KIND,
      version: PROTOCOL_INTENT_VERSION,
      intentId: 'fire-assay',
      sourcePrompt: 'Place a plate on slot D.',
      steps: [{ id: 'step-1', index: 1 }],
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
    });
  });

  it('models the FIRE setup resources without lowering to event graph primitives', () => {
    const intent: ProtocolIntent = createEmptyProtocolIntent({ intentId: 'fire-setup' });
    intent.resources.labwareInstances.push({
      id: 'plate_D',
      labwareHint: '96 well TC-coated plate',
      deckSlot: 'D',
      initialOrientation: 'landscape',
      requirements: {
        wellCount: 96,
        format: 'plate',
        coating: 'TC-coated',
        vendorCandidates: [{ vendor: 'Corning', catalogNumber: 'CLS3997', label: 'Corning CLS3997' }],
      },
      resolutionStatus: 'candidate',
    });
    intent.resources.materialDefinitions.push({
      id: 'hepg2',
      label: 'HepG2',
      kind: 'cell_line',
      resolutionStatus: 'placeholder',
    });
    intent.resources.materialFormulations.push({
      id: 'dmem_1x_glucose_2x_bcaa',
      label: 'DMEM 1X glucose, 2X BCAA',
      components: [
        { materialRef: 'dmem', label: 'DMEM', role: 'base' },
        { materialRef: 'glucose', label: 'glucose', concentration: { fold: 1, raw: '1X' } },
        { materialRef: 'bcaa', label: 'BCAA', concentration: { fold: 2, raw: '2X' } },
      ],
      resolutionStatus: 'placeholder',
    });

    expect(intent.resources.labwareInstances[0]).toMatchObject({
      id: 'plate_D',
      deckSlot: 'D',
      requirements: { wellCount: 96, coating: 'TC-coated' },
    });
    expect(intent.resources.materialFormulations[0].components).toHaveLength(3);
  });

  it('models stateful operations and protocol patterns separately', () => {
    const intent = createEmptyProtocolIntent({ intentId: 'fire-operations' });
    intent.operations.push(
      {
        id: 'op-reorient-plate',
        kind: 'reorient_labware',
        labware: 'plate_D',
        params: { orientation: 'portrait' },
      },
      {
        id: 'op-spacing-collapse',
        kind: 'set_tip_spacing',
        pipette: 'pipette_12ch_125ul',
        spacingMm: 4.5,
      },
    );
    intent.patterns.push({
      id: 'pattern-serial-dilution',
      kind: 'serial_dilution',
      sourceLabware: 'reservoir_C',
      targetLabware: 'plate_D',
      ratio: '4:1',
      direction: 'down_rows',
      params: { mix: { cycles: 5, volumeUl: 125 }, transferVolumeUl: 25 },
    });
    intent.assumptions.push({
      id: 'assumption-tip-spacing-memory',
      message: 'reuse prior collapse-to-aspirate and expand-to-dispense spacing behavior',
    });

    expect(intent.operations).toContainEqual(expect.objectContaining({ kind: 'set_tip_spacing', spacingMm: 4.5 }));
    expect(intent.patterns).toContainEqual(expect.objectContaining({ kind: 'serial_dilution', ratio: '4:1' }));
    expect(intent.assumptions[0].message).toContain('reuse prior collapse');
  });

  it('normalizes partial LLM JSON into a complete ProtocolIntent envelope', () => {
    const normalized = normalizeProtocolIntent({
      intentId: 'llm-fire',
      resources: {
        labwareInstances: [{ id: 'reservoir_C', labwareHint: '12-well SBS format reservoir' }],
      },
      operations: [{ id: 'op-incubate', kind: 'incubate', temperatureC: 37, co2Percent: 5 }],
    });

    expect(normalized).toMatchObject({
      kind: PROTOCOL_INTENT_KIND,
      version: PROTOCOL_INTENT_VERSION,
      intentId: 'llm-fire',
      resources: {
        labwareInstances: [{ id: 'reservoir_C' }],
        materialDefinitions: [],
        materialFormulations: [],
      },
      operations: [{ id: 'op-incubate', kind: 'incubate' }],
      patterns: [],
      assumptions: [],
      unresolved: [],
    });
  });

  it('distinguishes normalized objects from explicit ProtocolIntent envelopes', () => {
    expect(normalizeProtocolIntent({ intentId: 'partial' })).toBeDefined();
    expect(isProtocolIntent(createEmptyProtocolIntent())).toBe(true);
    expect(isProtocolIntent({ intentId: 'partial' })).toBe(false);
  });
});
