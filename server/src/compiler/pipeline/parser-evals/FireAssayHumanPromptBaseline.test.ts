import { describe, expect, it } from 'vitest';
import { runParserEvalSuite, type ParserEvalCase } from './ParserEvalHarness.js';

const FIRE_REGISTRY = {
  verbs: {
    place: 'add_material',
    put: 'add_material',
    load: 'add_material',
    dispense: 'add_material',
    incubate: 'incubate',
    mix: 'mix',
  },
  labware: {
    '96 well tc-coated plate': 'labware-96-tc-coated-plate',
    '96 well plate': 'labware-96-plate',
    plate: 'labware-96-plate',
    '12-well sbs format reservoir': 'labware-12-sbs-reservoir',
    '12 well reservoir': 'labware-12-sbs-reservoir',
    reservoir: 'labware-12-sbs-reservoir',
  },
  materials: {
    dmem: 'material-dmem',
    hepg2: 'material-hepg2',
    clofibrate: 'compound-clofibrate',
    dmso: 'material-dmso',
    resazurin: 'compound-resazurin',
    glucose: 'material-glucose',
    bcaa: 'material-bcaa',
  },
};

const STEP_1_TO_3 = [
  'Place a 96 well TC-coated plate on deck slot D with 100,000 HepG2 cells/well and 200uL DMEM.',
  'Place a 12-well SBS format reservoir on slot C with different media. Well 1 has 4ml of DMEM 1X glucose, 1X BCAA; well 2 has same volume DMEM 1X glucose, 2X BCAA; well 3 has 2X glucose, 1X BCAA; well 4 has 2X glucose, 2X BCAA; well 5 has 4X glucose, 1X BCAA; well 6 has 4X glucose, 2X BCAA; well 7 has 100uL 1mM clofibrate in DMSO; well 8 has 20X resazurin in DMEM.',
  'Using an 8-channel, 300uL pipette, aspirate the media from the plate in D2 and dispense into the waste. Replace the media with duplicates based on wells 1-6 in the 12 well reservoir. So columns 1-2 get media from reservoir well 1, 3-4 get media from well 2, etc.',
].join('\n\n');

const STEP_4_TO_5 = [
  'Rotate the plate in D and the reservoir in C to portrait mode, replace the 300uL tips with 125uL tips in portrait mode and swap to a 12-channel adjustable-spacing 125uL pipette.',
  'We are going to do a 4:1 serial dilution down the columns in the target plate (D) so we need to increase the volumes in row by 25uL. Collapse the pipette to 4.5mm spacing so that each tip grabs 20uL from rows 1-6 of the twelve well reservoir (tips 1-2 will draw from well 1, tips 3-4 from well 2, etc). Then expand the tips to 9mm spacing and dispense into rows 1-12 of column A of the target labware.',
].join('\n\n');

const STEP_6_TO_7 = [
  'Put the 12 well reservoir back into landscape mode, change tips to 4.5mm spacing and aspirate 5uL from well 7.',
  'Now we perform the serial dilution. Expand the tips to 9mm, dispense into row one of the target plate. Do a pipette mix (5 cycles, 125uL). Transfer 25uL to the next row, repeat the pipette mix. Continue the serial dilution all of the way down. Aspirate 25uL from the final row and dispense of the tips into the trash.',
].join('\n\n');

const STEP_8_TO_9 = [
  'Incubate plate at 37C, 5% CO2 for 2 hours.',
  'Put the plate back on slot D in landscape, transfer 10uL of resazurin to row 1, do a pipette mix, drop tips. Repeat this for each of rows B-H.',
].join('\n\n');

const FULL_FIRE_PROMPT = [
  STEP_1_TO_3,
  STEP_4_TO_5,
  STEP_6_TO_7,
  STEP_8_TO_9,
].join('\n\n');

const FIRE_BASELINE_CASES: ParserEvalCase[] = [
  {
    id: 'human-fire-full-protocol-intent-baseline',
    prompt: FULL_FIRE_PROMPT,
    registry: FIRE_REGISTRY,
    assertions: [
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'protocolIntent.resources.labwareInstances',
        containsPartial: {
          id: 'plate_D',
          labwareHint: '96 well TC-coated plate',
          deckSlot: 'D',
          initialOrientation: 'landscape',
        },
      },
      {
        path: 'protocolIntent.resources.materialFormulations',
        containsPartial: {
          id: 'dmem_1x_glucose_2x_bcaa',
          components: ['DMEM', '1X glucose', '2X BCAA'],
        },
      },
      {
        path: 'protocolIntent.patterns',
        containsPartial: {
          kind: 'media_swap_duplicate_columns',
          sourceLabware: 'reservoir_C',
          targetLabware: 'plate_D',
        },
      },
      {
        path: 'protocolIntent.patterns',
        containsPartial: {
          kind: 'serial_dilution',
          ratio: '4:1',
          direction: 'down_rows',
        },
      },
      { path: 'protocolIntent.assumptions', contains: 'wells 1-6 inherit 4 mL unless changed' },
    ],
    expectedFailureSnippets: [
      'deterministic.residualCount',
      'protocolIntent.resources.labwareInstances',
      'protocolIntent.resources.materialFormulations',
      'protocolIntent.patterns',
      'protocolIntent.assumptions',
    ],
  },
  {
    id: 'human-fire-setup-and-media-swap-baseline',
    prompt: STEP_1_TO_3,
    registry: FIRE_REGISTRY,
    assertions: [
      {
        path: 'protocolIntent.resources.labwareInstances',
        containsPartial: {
          id: 'reservoir_C',
          labwareHint: '12-well SBS format reservoir',
          deckSlot: 'C',
        },
      },
      {
        path: 'protocolIntent.resources.materialAliquots',
        containsPartial: {
          labware: 'reservoir_C',
          well: '1',
          volumeUl: 4000,
          formulation: 'dmem_1x_glucose_1x_bcaa',
        },
      },
      {
        path: 'protocolIntent.operations',
        containsPartial: {
          kind: 'media_swap',
          removeFrom: { labware: 'plate_D' },
          waste: 'default_waste',
        },
      },
      {
        path: 'protocolIntent.patterns',
        containsPartial: {
          kind: 'source_wells_to_duplicate_target_columns',
          sourceWells: ['1', '2', '3', '4', '5', '6'],
          targetColumnPairs: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]],
        },
      },
    ],
    expectedFailureSnippets: [
      'protocolIntent.resources.labwareInstances',
      'protocolIntent.resources.materialAliquots',
      'protocolIntent.operations',
      'protocolIntent.patterns',
    ],
  },
  {
    id: 'human-fire-orientation-pipette-and-dilution-setup-baseline',
    prompt: STEP_4_TO_5,
    registry: FIRE_REGISTRY,
    assertions: [
      {
        path: 'protocolIntent.operations',
        containsPartial: {
          kind: 'reorient_labware',
          labware: 'plate_D',
          orientation: 'portrait',
        },
      },
      {
        path: 'protocolIntent.operations',
        containsPartial: {
          kind: 'swap_pipette',
          pipetteType: '12-channel adjustable-spacing 125uL',
        },
      },
      {
        path: 'protocolIntent.operations',
        containsPartial: {
          kind: 'set_tip_spacing',
          spacingMm: 4.5,
        },
      },
      {
        path: 'protocolIntent.patterns',
        containsPartial: {
          kind: 'serial_dilution_setup',
          sourceRows: [1, 2, 3, 4, 5, 6],
          targetColumn: 'A',
        },
      },
    ],
    expectedFailureSnippets: [
      'protocolIntent.operations',
      'protocolIntent.patterns',
    ],
  },
  {
    id: 'human-fire-serial-dilution-execution-baseline',
    prompt: STEP_6_TO_7,
    registry: FIRE_REGISTRY,
    assertions: [
      {
        path: 'protocolIntent.operations',
        containsPartial: {
          kind: 'aspirate',
          source: { labware: 'reservoir_C', well: '7' },
          volumeUl: 5,
        },
      },
      {
        path: 'protocolIntent.patterns',
        containsPartial: {
          kind: 'serial_dilution',
          mix: { cycles: 5, volumeUl: 125 },
          transferVolumeUl: 25,
          finalAspirateToWasteUl: 25,
        },
      },
      {
        path: 'protocolIntent.operations',
        containsPartial: {
          kind: 'eject_tips',
          destination: 'trash',
        },
      },
    ],
    expectedFailureSnippets: [
      'protocolIntent.operations',
      'protocolIntent.patterns',
    ],
  },
  {
    id: 'human-fire-incubation-and-resazurin-repeat-baseline',
    prompt: STEP_8_TO_9,
    registry: FIRE_REGISTRY,
    assertions: [
      {
        path: 'protocolIntent.operations',
        containsPartial: {
          kind: 'incubate',
          labware: 'plate_D',
          temperatureC: 37,
          co2Percent: 5,
          durationSeconds: 7200,
        },
      },
      {
        path: 'protocolIntent.patterns',
        containsPartial: {
          kind: 'repeat_rows',
          rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
          operation: 'add_resazurin_and_mix',
        },
      },
      {
        path: 'protocolIntent.assumptions',
        contains: 'reuse prior collapse-to-aspirate and expand-to-dispense spacing behavior',
      },
    ],
    expectedFailureSnippets: [
      'protocolIntent.operations',
      'protocolIntent.patterns',
      'protocolIntent.assumptions',
    ],
  },
];

describe('human-written FIRE assay parser baseline', () => {
  it('captures expected ProtocolIntent failures for the full prompt and focused slices', async () => {
    const results = await runParserEvalSuite(FIRE_BASELINE_CASES);
    const byId = new Map(results.map((result) => [result.id, result]));

    const unexpectedFailures = results.flatMap((result) => (
      FIRE_BASELINE_CASES.find((testCase) => testCase.id === result.id)?.expectedFailureSnippets
        ? []
        : result.failures.map((failure) => `${result.id}: ${failure}`)
    ));
    const missingExpectedFailures = FIRE_BASELINE_CASES.flatMap((testCase) => {
      if (!testCase.expectedFailureSnippets) return [];
      const result = byId.get(testCase.id);
      if (!result) return [`${testCase.id}: missing eval result`];
      return testCase.expectedFailureSnippets
        .filter((snippet) => !result.failures.some((failure) => failure.includes(snippet)))
        .map((snippet) => `${testCase.id}: expected failure containing ${snippet}`);
    });

    expect(unexpectedFailures).toEqual([]);
    expect(missingExpectedFailures).toEqual([]);
  });
});
