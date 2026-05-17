import { describe, expect, it } from 'vitest';
import { runParserEvalSuite, type ParserEvalCase } from './ParserEvalHarness.js';

const COMMON_REGISTRY = {
  labware: {
    '12-well reservoir': 'labware-12-reservoir',
    '96-well plate': 'labware-96-plate',
  },
  materials: {
    clofibrate: 'compound-clofibrate',
  },
};

const PARSER_EVAL_CORPUS: ParserEvalCase[] = [
  {
    id: 'gemini-simulated-plate-read',
    prompt: 'Add a 96-well plate to the target position. Read the target plate on the Gemini EM plate reader in fluorescence mode at 520 nm with 100 ms integration as a simulation.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      { path: 'deterministic.candidateEvents', length: 2 },
      {
        path: 'deterministic.candidateEvents',
        containsPartial: {
          verb: 'read',
          labware_id: 'labware-96-plate',
          instrument: 'Gemini EM plate reader',
          simulate: true,
          mode: 'fluorescence',
          wavelengthNm: 520,
          integrationMs: 100,
        },
      },
      { path: 'protocolPlan.steps', length: 2 },
      {
        path: 'events',
        containsPartial: {
          event_type: 'read',
          labwareId: 'labware-96-plate',
          details: {
            instrument: 'Gemini EM plate reader',
            simulate: true,
            mode: 'fluorescence',
            wavelengthNm: 520,
            integrationMs: 100,
          },
        },
      },
      { path: 'instrumentRunFiles.0.wells', length: 96 },
      {
        path: 'instrumentRunFiles',
        containsPartial: {
          instrument: 'Gemini EM plate reader',
          runParameters: {
            simulate: true,
            mode: 'fluorescence',
            wavelengthNm: 520,
            integrationMs: 100,
          },
        },
      },
      {
        path: 'instrumentApplianceJobs',
        containsPartial: {
          adapterId: 'molecular_devices_gemini',
          operation: 'active_read',
          executionReadiness: {
            status: 'ready',
            executionMode: 'simulate',
          },
        },
      },
      {
        path: 'instrumentExecutionReadiness',
        containsPartial: {
          status: 'ready',
          executionMode: 'simulate',
          requiresConfirmation: false,
        },
      },
    ],
  },
  {
    id: 'clofibrate-pronoun-transfer',
    prompt: 'Add a 12-well reservoir to the source location. Add a 96-well plate to the target position. Add 100uL of clofibrate to well A1 of the reservoir. Transfer 25uL of it to well B2 of the target plate.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      { path: 'deterministic.candidateEvents', length: 4 },
      {
        path: 'deterministic.candidateEvents',
        containsPartial: {
          verb: 'add_material',
          volume_uL: 100,
          labware_id: 'labware-12-reservoir',
          well: 'A1',
          material: {
            recordId: 'compound-clofibrate',
            volume_uL: 100,
          },
        },
      },
      {
        path: 'deterministic.actionFrames',
        containsPartial: {
          verb: 'transfer',
          roles: {
            source_labware_id: 'labware-12-reservoir',
            source_well: 'A1',
            target_labware_id: 'labware-96-plate',
            target_wells: ['B2'],
            source_material_ref: {
              id: 'compound-clofibrate',
            },
          },
          links: {
            sourceFromPreviousAdd: true,
            sourceWellFromPreviousAdd: true,
            sameMaterialAsPrevious: true,
          },
        },
      },
      { path: 'protocolPlan.steps', length: 4 },
      {
        path: 'events',
        containsPartial: {
          event_type: 'transfer',
          details: {
            volumeUl: 25,
            source_labware: 'labware-12-reservoir',
            destination_labware: 'labware-96-plate',
          },
        },
      },
    ],
  },
  {
    id: 'gemini-read-missing-execution-mode-blocked',
    prompt: 'Add a 96-well plate to the target position. Read the target plate on the Gemini EM plate reader in fluorescence mode at 520 nm.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      { path: 'instrumentRunFiles.0.wells', length: 96 },
      {
        path: 'instrumentExecutionReadiness',
        containsPartial: {
          status: 'blocked',
          blockers: [{ code: 'missing_execution_mode', message: 'Execution mode must be explicit: set request.parameters.simulate to true or false.' }],
        },
      },
    ],
  },
  {
    id: 'gemini-live-luminescence-read',
    prompt: 'Add a 96-well plate to the target position. Read the target plate on the Gemini EM plate reader in live mode with luminescence mode.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'deterministic.candidateEvents',
        containsPartial: {
          verb: 'read',
          simulate: false,
          mode: 'luminescence',
          instrument: 'Gemini EM plate reader',
        },
      },
      {
        path: 'instrumentExecutionReadiness',
        containsPartial: {
          status: 'ready',
          executionMode: 'live',
          requiresConfirmation: true,
          blockers: [],
        },
      },
    ],
  },
  {
    id: 'gemini-dry-run-absorbance-read',
    prompt: 'Add a 96-well plate to the target position. Read the target plate on the Gemini EM plate reader in absorbance mode at 450 nm as a dry run.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'instrumentRunFiles',
        containsPartial: {
          runParameters: {
            simulate: true,
            mode: 'absorbance',
            wavelengthNm: 450,
          },
        },
      },
      {
        path: 'instrumentExecutionReadiness',
        containsPartial: {
          status: 'ready',
          executionMode: 'simulate',
          requiresConfirmation: false,
        },
      },
    ],
  },
  {
    id: 'gemini-fluorescence-missing-wavelength-blocked',
    prompt: 'Add a 96-well plate to the target position. Read the target plate on the Gemini EM plate reader in fluorescence mode as a simulation.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'instrumentExecutionReadiness',
        containsPartial: {
          status: 'blocked',
          executionMode: 'simulate',
          blockers: [{ code: 'missing_wavelength', message: 'Fluorescence and absorbance Gemini EM reads require wavelengthNm.' }],
        },
      },
    ],
  },
  {
    id: 'gemini-real-absorbance-read',
    prompt: 'Add a 96-well plate to the target position. Read the target plate on the real Gemini EM plate reader in absorbance mode at 450 nm.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'instrumentRunFiles',
        containsPartial: {
          runParameters: {
            simulate: false,
            mode: 'absorbance',
            wavelengthNm: 450,
          },
        },
      },
      {
        path: 'instrumentExecutionReadiness',
        containsPartial: {
          status: 'ready',
          executionMode: 'live',
          requiresConfirmation: true,
        },
      },
    ],
  },
  {
    id: 'gemini-dry-run-luminescence-read',
    prompt: 'Add a 96-well plate to the target position. Read the target plate on the Gemini EM plate reader in luminescence mode as a dry run.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'instrumentExecutionReadiness',
        containsPartial: {
          status: 'ready',
          executionMode: 'simulate',
          requiresConfirmation: false,
          blockers: [],
        },
      },
    ],
  },
  {
    id: 'gemini-absorbance-missing-wavelength-blocked',
    prompt: 'Add a 96-well plate to the target position. Read the target plate on the Gemini EM plate reader in absorbance mode as a simulation.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'instrumentExecutionReadiness',
        containsPartial: {
          status: 'blocked',
          executionMode: 'simulate',
          blockers: [{ code: 'missing_wavelength', message: 'Fluorescence and absorbance Gemini EM reads require wavelengthNm.' }],
        },
      },
    ],
  },
  {
    id: 'gemini-read-missing-instrument-no-appliance-job',
    prompt: 'Add a 96-well plate to the target position. Read the target plate in fluorescence mode at 520 nm as a simulation.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.residualCount', equals: 0 },
      { path: 'instrumentRunFiles', length: 0 },
      { path: 'instrumentApplianceJobs', length: 0 },
      { path: 'instrumentExecutionReadiness', length: 0 },
    ],
  },
  {
    id: 'residual-no-verb',
    prompt: 'Do something fancy with the data.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', equals: 0 },
      { path: 'deterministic.residualCount', equals: 1 },
      { path: 'deterministic.candidateEvents', length: 0 },
      { path: 'events', length: 0 },
    ],
  },
  {
    id: 'residual-unresolved-noun',
    prompt: 'Add xyzzy widget.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', equals: 0 },
      { path: 'deterministic.residualCount', equals: 1 },
      { path: 'deterministic.candidateEvents', length: 0 },
      { path: 'protocolPlan.steps', length: 0 },
    ],
  },
  {
    id: 'source-and-target-labware-bindings',
    prompt: 'Add a 12-well reservoir to the source location. Add a 96-well plate to the target position.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      { path: 'deterministic.candidateEvents', length: 2 },
      { path: 'protocolPlan.bindings.labwareRoles.source', equals: 'labware-12-reservoir' },
      { path: 'protocolPlan.bindings.labwareRoles.target', equals: 'labware-96-plate' },
    ],
  },
  {
    id: 'same-material-back-reference-transfer',
    prompt: 'Add a 12-well reservoir to the source location. Add a 96-well plate to the target position. Add 80uL of clofibrate to well A1 of the reservoir. Transfer 20uL of the same material to well C3 of the target plate.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'deterministic.actionFrames',
        containsPartial: {
          verb: 'transfer',
          roles: {
            source_labware_id: 'labware-12-reservoir',
            source_well: 'A1',
            target_labware_id: 'labware-96-plate',
            target_wells: ['C3'],
            source_material_ref: { id: 'compound-clofibrate' },
          },
          links: {
            sameMaterialAsPrevious: true,
          },
        },
      },
      {
        path: 'events',
        containsPartial: {
          event_type: 'transfer',
          details: {
            volumeUl: 20,
            source_labware: 'labware-12-reservoir',
            destination_labware: 'labware-96-plate',
            wells: ['C3'],
          },
        },
      },
    ],
  },
  {
    id: 'that-solution-back-reference-transfer',
    prompt: 'Add a 12-well reservoir to the source location. Add a 96-well plate to the target position. Add 60uL of clofibrate to well A1 of the reservoir. Transfer 10uL of that solution to well D4 of the target plate.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'deterministic.actionFrames',
        containsPartial: {
          verb: 'transfer',
          roles: {
            source_labware_id: 'labware-12-reservoir',
            source_well: 'A1',
            target_labware_id: 'labware-96-plate',
            target_wells: ['D4'],
            source_material_ref: { id: 'compound-clofibrate' },
          },
          links: {
            sameMaterialAsPrevious: true,
          },
        },
      },
      {
        path: 'events',
        containsPartial: {
          event_type: 'transfer',
          details: {
            volumeUl: 10,
            source_labware: 'labware-12-reservoir',
            destination_labware: 'labware-96-plate',
            wells: ['D4'],
          },
        },
      },
    ],
  },
  {
    id: 'clofibrate-concentration-normalization',
    prompt: 'Add a 12-well reservoir to the source location. Add 120uL of 1mM clofibrate to well A1 of the reservoir.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'deterministic.candidateEvents',
        containsPartial: {
          verb: 'add_material',
          volume_uL: 120,
          concentration_uM: 1000,
          labware_id: 'labware-12-reservoir',
          well: 'A1',
          material: {
            recordId: 'compound-clofibrate',
            volume_uL: 120,
            concentration_uM: 1000,
          },
        },
      },
    ],
  },
  {
    id: 'column-region-transfer-from-reservoir',
    prompt: 'Add a 12-well reservoir to the source location. Add a 96-well plate to the target position. Add 12000uL of clofibrate to well A1 of the reservoir. Transfer 100uL of it to each well in column 1 of the 96-well plate.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'deterministic.actionFrames',
        containsPartial: {
          verb: 'transfer',
          roles: {
            source_labware_id: 'labware-12-reservoir',
            source_well: 'A1',
            target_labware_id: 'labware-96-plate',
            target_wells: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'],
          },
        },
      },
      {
        path: 'events',
        containsPartial: {
          event_type: 'transfer',
          details: {
            volumeUl: 100,
            wells: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'],
          },
        },
      },
    ],
  },
  {
    id: 'read-it-resolves-target-plate',
    prompt: 'Add a 96-well plate to the target position. Read it on the Gemini EM plate reader in luminescence mode as a simulation.',
    registry: COMMON_REGISTRY,
    assertions: [
      { path: 'deterministic.deterministicCompleteness', min: 1 },
      { path: 'deterministic.residualCount', equals: 0 },
      {
        path: 'deterministic.candidateEvents',
        containsPartial: {
          verb: 'read',
          labware_id: 'labware-96-plate',
          instrument: 'Gemini EM plate reader',
          simulate: true,
          mode: 'luminescence',
        },
      },
      {
        path: 'protocolPlan.steps',
        containsPartial: {
          verb: 'read',
          dependsOn: ['det-step-1'],
          status: 'ready',
        },
      },
    ],
  },
];

describe('parser eval harness', () => {
  it('runs golden deterministic parser corpus from prompt to appliance readiness', async () => {
    expect(PARSER_EVAL_CORPUS.length).toBeGreaterThanOrEqual(17);
    const results = await runParserEvalSuite(PARSER_EVAL_CORPUS);
    const byId = new Map(results.map((result) => [result.id, result]));
    const unexpectedFailures = results.flatMap((result) => (
      PARSER_EVAL_CORPUS.find((testCase) => testCase.id === result.id)?.expectedFailureSnippets
        ? []
        : result.failures.map((failure) => `${result.id}: ${failure}`)
    ));
    const missingExpectedFailures = PARSER_EVAL_CORPUS.flatMap((testCase) => {
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
