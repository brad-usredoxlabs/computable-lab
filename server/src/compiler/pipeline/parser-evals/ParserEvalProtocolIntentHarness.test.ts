import { describe, expect, it } from 'vitest';
import { runParserEvalSuite, type ParserEvalCase } from './ParserEvalHarness.js';

const PROTOCOL_INTENT_EVAL_CASES: ParserEvalCase[] = [
  {
    id: 'protocol-intent-validation-and-lowering',
    prompt: 'Place cells into a 96-well plate on deck slot D and incubate.',
    registry: {
      labware: { '96-well plate': 'labware-96-plate' },
    },
    aiPrecompile: {
      protocolIntent: {
        kind: 'protocol_intent',
        version: '0.1.0',
        intentId: 'eval-protocol-intent',
        steps: [],
        resources: {
          labwareInstances: [
            { id: 'plate_D', labwareHint: '96-well plate', deckSlot: 'D' },
          ],
          materialDefinitions: [
            { id: 'cells', label: 'cells', kind: 'cell_line' },
          ],
          materialFormulations: [],
          materialAliquots: [],
          pipettes: [],
          tips: [],
          waste: [],
        },
        operations: [
          {
            id: 'op-load-cells',
            kind: 'load_material',
            labware: 'plate_D',
            targetWells: ['A1'],
            materialRef: 'cells',
            volumeUl: 50,
          },
          {
            id: 'op-incubate',
            kind: 'incubate',
            labware: 'plate_D',
            temperatureC: 37,
            co2Percent: 5,
            durationSeconds: 7200,
          },
        ],
        patterns: [],
        assumptions: [],
        unresolved: [],
      },
    },
    assertions: [
      { path: 'protocolIntentValidation.status', equals: 'ready' },
      { path: 'protocolIntentLowering.events', length: 2 },
      {
        path: 'events',
        containsPartial: {
          event_type: 'add_material',
          details: {
            protocolIntentOperationId: 'op-load-cells',
            labwareInstanceId: 'plate_D',
            well: 'A1',
          },
        },
      },
      {
        path: 'events',
        containsPartial: {
          event_type: 'incubate',
          details: {
            protocolIntentOperationId: 'op-incubate',
            labware: 'plate_D',
          },
        },
      },
    ],
  },
  {
    id: 'protocol-intent-validation-blocks-lowering',
    prompt: 'Load cells into the plate, but the material reference is unresolved.',
    aiPrecompile: {
      protocolIntent: {
        kind: 'protocol_intent',
        version: '0.1.0',
        intentId: 'eval-blocked-protocol-intent',
        steps: [],
        resources: {
          labwareInstances: [
            { id: 'plate_D', labwareHint: '96-well plate', deckSlot: 'D' },
          ],
          materialDefinitions: [],
          materialFormulations: [],
          materialAliquots: [],
          pipettes: [],
          tips: [],
          waste: [],
        },
        operations: [
          {
            id: 'op-load-missing-cells',
            kind: 'load_material',
            labware: 'plate_D',
            targetWells: ['A1'],
            materialRef: 'missing_cells',
            volumeUl: 50,
          },
        ],
        patterns: [],
        assumptions: [],
        unresolved: [],
      },
    },
    assertions: [
      { path: 'protocolIntentValidation.status', equals: 'blocked' },
      {
        path: 'protocolIntentValidation.blockers',
        containsPartial: {
          code: 'dangling_material_reference',
          path: 'operations.0.materialRef',
        },
      },
      { path: 'protocolIntentLowering.events', length: 0 },
      { path: 'events', length: 0 },
    ],
  },
];

describe('parser eval ProtocolIntent harness', () => {
  it('runs ProtocolIntent validation and lowering through parser eval summaries', async () => {
    const results = await runParserEvalSuite(PROTOCOL_INTENT_EVAL_CASES);
    const failures = results.flatMap((result) => result.failures.map((failure) => `${result.id}: ${failure}`));

    expect(failures).toEqual([]);
  });
});
