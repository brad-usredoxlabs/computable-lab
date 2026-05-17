import { describe, expect, it, vi } from 'vitest';
import { runChatbotCompile, type RunChatbotCompileArgs } from './runChatbotCompile.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../extract/ExtractionRunnerService.js';
import type { LlmClient } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { CompletionResponse } from './types.js';

function completionResponse(content: string): CompletionResponse {
  return {
    id: 'test-response-id',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

describe('runChatbotCompile ProtocolIntent state planning', () => {
  it('emits ProtocolIntent and deterministic state plan terminal artifacts', async () => {
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(completionResponse(JSON.stringify({ tags: [] })))
        .mockResolvedValueOnce(completionResponse(JSON.stringify({
          protocolIntent: {
            intentId: 'fire-state-artifact',
            steps: [{ id: 'step-1', index: 1, text: 'Place a plate on D and rotate it.' }],
            resources: {
              labwareInstances: [
                {
                  id: 'plate_D',
                  labwareHint: '96 well TC-coated plate',
                  deckSlot: 'D',
                  initialOrientation: 'landscape',
                },
              ],
              materialDefinitions: [],
            },
            operations: [
              {
                id: 'op-reorient',
                kind: 'reorient_labware',
                stepId: 'step-1',
                labware: 'plate_D',
                params: { orientation: 'portrait' },
              },
            ],
          },
          candidateEvents: [],
          candidateLabwares: [],
          unresolvedRefs: [],
        }))),
    } as unknown as LlmClient;

    const args: RunChatbotCompileArgs = {
      prompt: 'Set up the FIRE assay plate.',
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint: async () => [],
      },
    };

    const result = await runChatbotCompile(args);

    expect(result.terminalArtifacts.protocolIntent).toMatchObject({
      intentId: 'fire-state-artifact',
      resources: {
        labwareInstances: [{ id: 'plate_D', deckSlot: 'D' }],
      },
    });
    expect(result.terminalArtifacts.protocolIntentStatePlan).toMatchObject({
      kind: 'protocol-intent-state-plan',
      status: 'ready',
      finalState: {
        labware: {
          plate_D: {
            deckSlot: 'D',
            orientation: 'portrait',
          },
        },
      },
    });
    expect(result.terminalArtifacts.protocolIntentValidation).toMatchObject({
      status: 'ready',
      blockers: [],
    });
    expect(result.labwareAdditions).toEqual([
      {
        recordId: '96 well TC-coated plate',
        reason: 'ProtocolIntent labware resource plate_D',
        deckSlot: 'D',
      },
    ]);
    expect(result.terminalArtifacts.directives).toEqual([
      {
        directiveId: 'dir_1',
        kind: 'reorient_labware',
        params: {
          labwareInstanceId: 'plate_D',
          orientation: 'portrait',
          protocolIntentOperationId: 'op-reorient',
        },
      },
    ]);
    expect(result.terminalArtifacts.protocolIntentLowering).toMatchObject({
      candidateLabwares: [
        {
          hint: '96 well TC-coated plate',
          deckSlot: 'D',
        },
      ],
      directives: [
        {
          kind: 'reorient_labware',
          params: { labwareInstanceId: 'plate_D', orientation: 'portrait' },
        },
      ],
      events: [],
    });
  });

  it('expands ProtocolIntent row-repeat patterns into compile events', async () => {
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(completionResponse(JSON.stringify({ tags: [] })))
        .mockResolvedValueOnce(completionResponse(JSON.stringify({
          protocolIntent: {
            intentId: 'fire-repeat-rows',
            resources: {
              labwareInstances: [
                { id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D', initialOrientation: 'landscape' },
                { id: 'reservoir_C', labwareHint: '12 well reservoir', deckSlot: 'C', initialOrientation: 'landscape' },
              ],
              materialDefinitions: [{ id: 'resazurin', label: 'resazurin', kind: 'dye' }],
            },
            operations: [],
            patterns: [
              {
                id: 'pattern-resazurin-repeat',
                kind: 'repeat_rows',
                sourceLabware: 'reservoir_C',
                targetLabware: 'plate_D',
                rows: ['A', 'B'],
                operation: 'add_resazurin_and_mix',
                params: {
                  sourceWell: '8',
                  materialRef: 'resazurin',
                  volumeUl: 10,
                  columns: [1, 2],
                  mix: { cycles: 5, volumeUl: 125 },
                },
              },
            ],
          },
          candidateEvents: [],
          candidateLabwares: [],
          unresolvedRefs: [],
        }))),
    } as unknown as LlmClient;

    const result = await runChatbotCompile({
      prompt: 'Add resazurin across rows A-B and mix.',
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint: async () => [],
      },
    });

    const patternEvents = result.events.filter((event) => (
      (event.details as Record<string, unknown>).protocolIntentPatternId === 'pattern-resazurin-repeat'
    ));
    expect(patternEvents.map((event) => event.event_type)).toEqual([
      'transfer',
      'mix',
      'transfer',
      'mix',
    ]);
    expect(patternEvents[0].details).toMatchObject({
      source_labware: 'reservoir_C',
      destination_labware: 'plate_D',
      source_well: '8',
      wells: ['A1', 'A2'],
      source_material_ref: 'resazurin',
      volumeUl: 10,
      protocolIntentPatternKind: 'repeat_rows',
    });
    expect(patternEvents[1].details).toMatchObject({
      wells: ['A1', 'A2'],
      cycles: 5,
      volumeUl: 125,
    });
  });

  it('lowers simple ProtocolIntent operations into the resolved compile events', async () => {
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(completionResponse(JSON.stringify({ tags: [] })))
        .mockResolvedValueOnce(completionResponse(JSON.stringify({
          protocolIntent: {
            intentId: 'fire-simple-ops',
            resources: {
              labwareInstances: [
                { id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D' },
              ],
              materialDefinitions: [{ id: 'cells', label: 'cells', kind: 'cell_line' }],
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
                id: 'op-mix-cells',
                kind: 'pipette_mix',
                labware: 'plate_D',
                targetWells: ['A1'],
                cycles: 3,
                volumeUl: 40,
              },
            ],
          },
          candidateEvents: [],
          candidateLabwares: [],
          unresolvedRefs: [],
        }))),
    } as unknown as LlmClient;

    const result = await runChatbotCompile({
      prompt: 'Load cells and mix.',
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint: async () => [],
      },
    });

    const operationEvents = result.events.filter((event) => (
      ['op-load-cells', 'op-mix-cells'].includes(String((event.details as Record<string, unknown>).protocolIntentOperationId))
    ));
    expect(operationEvents.map((event) => event.event_type)).toEqual(['add_material', 'mix']);
    expect(operationEvents[0]!.details).toMatchObject({
      labwareInstanceId: 'plate_D',
      well: 'A1',
      material: { materialId: 'cells', kind: 'cell_line', volumeUl: 50 },
    });
    expect(operationEvents[1]!.details).toMatchObject({
      labware: 'plate_D',
      well: 'A1',
      cycles: 3,
      volumeUl: 40,
    });
  });

  it('blocks unsafe ProtocolIntent lowering when validation finds dangling references', async () => {
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(completionResponse(JSON.stringify({ tags: [] })))
        .mockResolvedValueOnce(completionResponse(JSON.stringify({
          protocolIntent: {
            intentId: 'fire-invalid-intent',
            resources: {
              labwareInstances: [
                { id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D' },
              ],
              materialDefinitions: [],
            },
            operations: [
              {
                id: 'op-load-missing-material',
                kind: 'load_material',
                labware: 'plate_D',
                targetWells: ['A1'],
                materialRef: 'missing_cells',
                volumeUl: 50,
              },
            ],
          },
          candidateEvents: [],
          candidateLabwares: [],
          unresolvedRefs: [],
        }))),
    } as unknown as LlmClient;

    const result = await runChatbotCompile({
      prompt: 'Load missing cells.',
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint: async () => [],
      },
    });

    expect(result.terminalArtifacts.protocolIntentValidation).toMatchObject({
      status: 'blocked',
      blockers: [
        { code: 'dangling_material_reference', path: 'operations.0.materialRef' },
      ],
    });
    expect(result.events.filter((event) => (
      (event.details as Record<string, unknown>).protocolIntentOperationId === 'op-load-missing-material'
    ))).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pass_id: 'validate_protocol_intent',
        code: 'dangling_material_reference',
      }),
      expect.objectContaining({
        pass_id: 'lower_protocol_intent',
        code: 'protocol_intent_validation_blocker',
      }),
    ]));
  });
});
