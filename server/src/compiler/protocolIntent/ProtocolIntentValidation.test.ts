import { describe, expect, it } from 'vitest';
import type { PipelineState } from '../pipeline/types.js';
import {
  createEmptyProtocolIntent,
  type ProtocolIntent,
} from './ProtocolIntent.js';
import {
  createValidateProtocolIntentPass,
  validateProtocolIntent,
  type ProtocolIntentValidationOutput,
} from './ProtocolIntentValidation.js';

function readyIntent(): ProtocolIntent {
  const intent = createEmptyProtocolIntent({ intentId: 'ready-fire-slice' });
  intent.resources.labwareInstances.push(
    { id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D' },
    { id: 'reservoir_C', labwareHint: '12 well reservoir', deckSlot: 'C' },
  );
  intent.resources.materialDefinitions.push(
    { id: 'cells', label: 'HepG2 cells', kind: 'cell_line' },
    { id: 'media', label: 'DMEM', kind: 'media' },
  );
  intent.operations.push(
    {
      id: 'op-load-cells',
      kind: 'load_material',
      labware: 'plate_D',
      targetWells: ['A1'],
      materialRef: 'cells',
      volumeUl: 50,
    },
    {
      id: 'op-transfer-media',
      kind: 'transfer',
      sourceLabware: 'reservoir_C',
      sourceWell: '1',
      targetLabware: 'plate_D',
      targetWells: ['A1'],
      materialRef: 'media',
      volumeUl: 100,
    },
    {
      id: 'op-incubate',
      kind: 'incubate',
      labware: 'plate_D',
      temperatureC: 37,
      co2Percent: 5,
      durationSeconds: 7200,
    },
  );
  return intent;
}

describe('ProtocolIntentValidation', () => {
  it('marks a well-formed lowerable ProtocolIntent as ready', () => {
    const output = validateProtocolIntent(readyIntent());

    expect(output.status).toBe('ready');
    expect(output.blockers).toEqual([]);
    expect(output.findings).toEqual([]);
  });

  it('blocks duplicate ids and dangling operation references', () => {
    const intent = readyIntent();
    intent.resources.materialDefinitions.push({ id: 'plate_D', label: 'duplicate id material' });
    intent.operations.push({
      id: 'op-bad-load',
      kind: 'load_material',
      labware: 'missing_plate',
      targetWells: [],
      materialRef: 'missing_material',
    });

    const output = validateProtocolIntent(intent);

    expect(output.status).toBe('blocked');
    expect(output.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate_protocol_intent_id' }),
      expect.objectContaining({ code: 'dangling_labware_reference' }),
      expect.objectContaining({ code: 'dangling_material_reference' }),
      expect.objectContaining({ code: 'missing_target_wells' }),
    ]));
  });

  it('preserves non-blocking unresolved facts as warnings', () => {
    const intent = readyIntent();
    intent.unresolved.push({
      id: 'unresolved-platform',
      kind: 'platform',
      label: 'preferred tip rack',
      reason: 'tip rack brand is not specified',
      blocksLowering: false,
    });

    const output = validateProtocolIntent(intent);

    expect(output.status).toBe('ready');
    expect(output.findings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'unresolved_platform',
        blocksLowering: false,
      }),
    ]);
  });

  it('pass emits diagnostics and needs-missing-fact outcome when blocked', () => {
    const intent = readyIntent();
    intent.operations.push({
      id: 'op-bad-mix',
      kind: 'pipette_mix',
      labware: 'plate_D',
      targetWells: [],
    });
    const pass = createValidateProtocolIntentPass();
    const state: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([['ai_precompile', { protocolIntent: intent }]]),
      diagnostics: [],
    };

    const result = pass.run({ pass_id: 'validate_protocol_intent', state }) as {
      ok: boolean;
      output: ProtocolIntentValidationOutput;
      diagnostics?: Array<{ code: string; pass_id: string }>;
      outcome?: string;
    };

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe('blocked');
    expect(result.output.blockers).toEqual([
      expect.objectContaining({ code: 'missing_target_wells' }),
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'missing_target_wells',
        pass_id: 'validate_protocol_intent',
      }),
    ]);
    expect(result.outcome).toBe('needs-missing-fact');
  });
});
