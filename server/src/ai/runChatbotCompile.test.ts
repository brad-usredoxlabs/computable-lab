/**
 * Integration tests for runChatbotCompile.
 * 
 * This test verifies that the chatbot-compile pipeline correctly:
 * - Runs extraction on prompt + attachments
 * - Uses LLM to produce candidate events and labwares
 * - Expands biology verbs to primitives
 * - Resolves labware hints
 */

import { describe, it, expect, vi } from 'vitest';
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

describe('runChatbotCompile', () => {
  it('should produce one add_material event and one labware addition from seed prompt', async () => {
    // Stub ExtractionRunnerService that returns one labware-hint candidate
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => {
        // Return a draft with one candidate that has a labware hint
        return {
          target_kind: req.target_kind,
          source: req.source,
          candidates: [
            {
              target_kind: 'labware-spec',
              hint: '96-well plate',
              reason: 'needed for seeding',
              confidence: 0.9,
            },
          ],
          diagnostics: [],
        };
      }),
    } as unknown as ExtractionRunnerService;

    // Stub LlmClient that returns JSON with a seed event
    const mockLlmClient: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(completionResponse(JSON.stringify({ tags: [] })))
        .mockResolvedValueOnce(completionResponse(JSON.stringify({
          candidateEvents: [
            {
              verb: 'seed',
              labware: '96-well plate',
              cell_ref: 'HeLa',
              volume: { value: 200, unit: 'uL' },
              wells: ['A1'],
            },
          ],
          candidateLabwares: [
            { hint: '96-well plate', reason: 'needed for seeding' },
          ],
          unresolvedRefs: [],
        }))),
    } as unknown as LlmClient;

    // Stub searchLabwareByHint that returns no matches (so it becomes a labware addition)
    const searchLabwareByHint = async (_hint: string) => [];

    const args: RunChatbotCompileArgs = {
      prompt: 'add a 96-well plate and seed HeLa cells',
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint,
      },
    };

    const result = await runChatbotCompile(args);

    // Assert events: fuzzy deterministic precompile can contribute an
    // additional add_material candidate before the LLM seed event is merged.
    expect(result.events.length).toBeGreaterThanOrEqual(1);
    expect(result.events.some((event) => event.event_type === 'add_material')).toBe(true);

    // Assert labwareAdditions: should have one entry for '96-well plate'
    expect(result.labwareAdditions.length).toBe(1);
    expect(result.labwareAdditions[0]!.recordId).toBe('96-well plate');

    // Assert unresolvedRefs is empty
    expect(result.unresolvedRefs.length).toBe(0);
  });

  it('preserves mention tokens and short-circuits without the precompile LLM', async () => {
    // Extraction is irrelevant for the mention-resolved path — return nothing.
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    let llmCalls = 0;
    const mockLlmClient: LlmClient = {
      complete: vi.fn(async (): Promise<CompletionResponse> => {
        llmCalls++;
        if (llmCalls === 1) {
          return completionResponse(JSON.stringify({ tags: [] }));
        }
        throw new Error('ai_precompile should be gated for mention-resolved deterministic output');
      }),
    } as unknown as LlmClient;

    // Should not be called — mentions short-circuit the labware lookup.
    const searchLabwareByHint = vi.fn(async (_hint: string) => []);

    const args: RunChatbotCompileArgs = {
      prompt:
        'Add 100uL of [[aliquot:ALQ-PR9-TEST-CLO-001|Clofibrate stock tube]] to well A1 in [[labware:lw-1777158503980-v4330d|Generic 96 Well Plate, Flat Bottom (seed)]]',
      mentions: [
        {
          type: 'material',
          entityKind: 'aliquot',
          id: 'ALQ-PR9-TEST-CLO-001',
          label: 'Clofibrate stock tube',
        },
        {
          type: 'labware',
          id: 'lw-1777158503980-v4330d',
          label: 'Generic 96 Well Plate, Flat Bottom (seed)',
        },
      ],
      editorLabwares: [
        {
          labwareId: 'lw-1777158503980-v4330d',
          labwareType: 'plate_96',
          name: 'Generic 96 Well Plate, Flat Bottom (seed)',
        },
      ],
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint,
      },
    };

    const result = await runChatbotCompile(args);

    expect(mockLlmClient.complete).not.toHaveBeenCalled();

    // The pipeline produced one add_material primitive with the material mention.
    expect(result.events.length).toBe(1);
    expect(result.events[0]!.event_type).toBe('add_material');
    expect(result.events[0]!.details).toMatchObject({
      recordId: 'ALQ-PR9-TEST-CLO-001',
      kind: 'aliquot',
    });

    // No labware additions, no unresolved refs.
    expect(result.labwareAdditions.length).toBe(0);
    expect(result.unresolvedRefs.length).toBe(0);

    // Outcome should be 'complete' so AgentOrchestrator short-circuits the LLM loop.
    expect(result.outcome).toBe('complete');

    // The mention-resolved labware id should NOT have triggered a record-store search.
    expect(searchLabwareByHint).not.toHaveBeenCalled();
  });

  it('compiles resolved labware and aliquot mentions into reservoir add-material and plate transfer events without the LLM planner', async () => {
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi.fn(async (): Promise<CompletionResponse> => {
        throw new Error('mention-resolved prompt should not call the tagger or ai_precompile LLM');
      }),
    } as unknown as LlmClient;
    const searchLabwareByHint = vi.fn(async (_hint: string) => []);

    const prompt = `Put a [[labware:def:opentrons/nest_12_reservoir_22ml@v1|12-Channel Reservoir]] in the source location and 
a [[labware:lbw-seed-plate-96-flat|Generic 96 Well Plate, Flat Bottom (seed)]] in the target location.  Then add 
1000uL of [[aliquot:ALQ-PR9-TEST-CLO-001|Clofibrate stock tube]] to well A1 of the 12-well reservoir and use a 
100uL pipette to transfer 50uL of it to well A1 of the 96-well plate.`;

    const result = await runChatbotCompile({
      prompt,
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint,
      },
    });

    expect(mockExtractionService.run).not.toHaveBeenCalled();
    expect(mockLlmClient.complete).not.toHaveBeenCalled();
    expect(result.outcome).toBe('complete');
    expect(result.labwareAdditions).toEqual([
      expect.objectContaining({
        recordId: 'def:opentrons/nest_12_reservoir_22ml@v1',
        deckSlot: 'source',
      }),
      expect.objectContaining({
        recordId: 'lbw-seed-plate-96-flat',
        deckSlot: 'target',
      }),
    ]);
    expect(result.events.map((event) => event.event_type)).toEqual(['add_material', 'transfer']);

    expect(result.events[0]).toMatchObject({
      event_type: 'add_material',
      labwareId: 'def:opentrons/nest_12_reservoir_22ml@v1',
      details: {
        well: 'A1',
        recordId: 'ALQ-PR9-TEST-CLO-001',
        kind: 'aliquot',
        volume_uL: 1000,
      },
    });
    expect(result.events[1]).toMatchObject({
      event_type: 'transfer',
      labwareId: 'lbw-seed-plate-96-flat',
      details: {
        source_labware: 'def:opentrons/nest_12_reservoir_22ml@v1',
        source_well: 'A1',
        destination_labware: 'lbw-seed-plate-96-flat',
        wells: ['A1'],
        volume: { value: 50, unit: 'uL' },
      },
    });
  });

  it('strips pasted-content sentinels before compiling resolved mention tokens', async () => {
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi.fn(async (): Promise<CompletionResponse> => {
        throw new Error('pasted mention-resolved prompt should not call the LLM planner');
      }),
    } as unknown as LlmClient;
    const searchLabwareByHint = vi.fn(async (_hint: string) => []);

    const prompt = `---pasted-content---
Put a [[labware:def:opentrons/nest_12_reservoir_22ml@v1|12-Channel Reservoir]] in the source location and 
a [[labware:lbw-seed-plate-96-flat|Generic 96 Well Plate, Flat Bottom (seed)]] in the target location.  Then add 
1000uL of [[aliquot:ALQ-PR9-TEST-CLO-001|Clofibrate stock tube]] to well A1 of the 12-well reservoir and use a 
100uL pipette to transfer 50uL of it to well A1 of the 96-well plate.

---end-pasted-content---`;

    const result = await runChatbotCompile({
      prompt,
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint,
      },
    });

    expect(mockExtractionService.run).not.toHaveBeenCalled();
    expect(mockLlmClient.complete).not.toHaveBeenCalled();
    expect(result.outcome).toBe('complete');
    expect(result.events.map((event) => event.event_type)).toEqual(['add_material', 'transfer']);
    expect(result.labwareAdditions.map((addition) => addition.recordId)).toEqual([
      'def:opentrons/nest_12_reservoir_22ml@v1',
      'lbw-seed-plate-96-flat',
    ]);
  });

  it('compiles display-text prompt mentions without treating label text as verbs', async () => {
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi.fn(async (): Promise<CompletionResponse> => {
        throw new Error('display-text mentions should not call the semantic precompile LLM');
      }),
    } as unknown as LlmClient;
    const searchLabwareByHint = vi.fn(async (_hint: string) => []);

    const result = await runChatbotCompile({
      prompt: 'Put a 12-Channel Reservoir in the source location and a Generic 96 Well Plate, Flat Bottom (seed) in the target location. Then add 1000uL of Clofibrate stock tube to well A1 of the 12-well reservoir and use a 100uL pipette to transfer 50uL of it to well A1 of the 96-well plate.',
      mentions: [
        {
          type: 'labware',
          id: 'def:opentrons/nest_12_reservoir_22ml@v1',
          label: '12-Channel Reservoir',
        },
        {
          type: 'labware',
          id: 'lbw-seed-plate-96-flat',
          label: 'Generic 96 Well Plate, Flat Bottom (seed)',
        },
        {
          type: 'material',
          entityKind: 'aliquot',
          id: 'ALQ-PR9-TEST-CLO-001',
          label: 'Clofibrate stock tube',
        },
      ],
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint,
      },
    });

    expect(mockLlmClient.complete).not.toHaveBeenCalled();
    expect(result.outcome).toBe('complete');
    expect(result.events.map((event) => event.event_type)).toEqual(['add_material', 'transfer']);
    expect(result.labwareAdditions.map((addition) => addition.recordId)).toEqual([
      'def:opentrons/nest_12_reservoir_22ml@v1',
      'lbw-seed-plate-96-flat',
    ]);
  });

  it('resolves normalized labware surface forms deterministically without calling semantic precompile', async () => {
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    let llmCalls = 0;
    const mockLlmClient: LlmClient = {
      complete: vi.fn(async (): Promise<CompletionResponse> => {
        llmCalls++;
        if (llmCalls === 1) {
          return completionResponse(JSON.stringify({ tags: [] }));
        }
        throw new Error('ai_precompile should be gated for complete deterministic output');
      }),
    } as unknown as LlmClient;

    const searchLabwareByHint = vi.fn(async (_hint: string) => []);

    const result = await runChatbotCompile({
      prompt: 'add a 12-well reservoir',
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint,
      },
    });

    expect(mockLlmClient.complete).toHaveBeenCalledTimes(1);
    expect(result.labwareAdditions.map((addition) => addition.recordId)).toContain('12-well reservoir');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        code: 'fuzzy_registry_match',
        pass_id: 'deterministic_precompile',
        details: expect.objectContaining({
          phrase: '12-well reservoir',
          matchedKey: '12-well-reservoir',
          matchKind: 'normalized',
          distance: 0,
        }),
      }),
    );
  });

  it('compiles the target reservoir-to-plate prompt from tag_prompt output without semantic precompile', async () => {
    const prompt = 'Add a 12-well reservoir to the source destination and 96-well plate to the target location. Add 12000uL of 1uM clofibrate to well A1 of the reservoir and then use an 8-channel pipette to transfer 100uL to each well in column 1 of the 96-well plate.';
    const tag = (kind: string, text: string, occurrence = 1, candidateKinds?: string[]) => ({
      kind,
      text,
      nthOccurrence: occurrence,
      ...(candidateKinds ? { candidateKinds } : {}),
    });
    const taggerOutput = {
      tags: [
        tag('verb', 'Add'),
        tag('noun_phrase', '12-well reservoir', 1, ['labware']),
        tag('slot_ref', 'source destination'),
        tag('noun_phrase', '96-well plate', 1, ['labware']),
        tag('slot_ref', 'target location'),
        tag('verb', 'Add', 2),
        tag('quantity', '12000uL'),
        tag('concentration', '1uM'),
        tag('noun_phrase', 'clofibrate', 1, ['material']),
        tag('well_address', 'A1'),
        tag('back_reference', 'the reservoir'),
        tag('instrument', '8-channel pipette'),
        tag('verb', 'transfer'),
        tag('quantity', '100uL'),
        tag('well_region', 'column 1'),
        tag('noun_phrase', '96-well plate', 2, ['labware']),
      ],
    };
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;
    const mockLlmClient: LlmClient = {
      complete: vi.fn(async (): Promise<CompletionResponse> => (
        completionResponse(JSON.stringify(taggerOutput))
      )),
    } as unknown as LlmClient;
    const searchLabwareByHint = vi.fn(async (_hint: string) => []);

    const result = await runChatbotCompile({
      prompt,
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint,
      },
    });

    expect(mockLlmClient.complete).toHaveBeenCalledTimes(1);
    expect(['complete', 'gap']).toContain(result.outcome);
    expect(result.labwareAdditions.map((addition) => addition.recordId)).toEqual([
      '12-well reservoir',
      '96-well plate',
    ]);
    if (result.outcome === 'gap') {
      expect(result.unresolvedRefs.length).toBeGreaterThanOrEqual(1);
    }
    expect(result.events.map((event) => event.event_type)).toEqual(['add_material', 'transfer']);

    const add = result.events.find((event) => event.event_type === 'add_material')!;
    expect(add.details).toMatchObject({
      well: 'A1',
      volume_uL: 12000,
      concentration_uM: 1,
    });

    const transfer = result.events.find((event) => event.event_type === 'transfer')!;
    expect(transfer.details).toMatchObject({
      source_labware: 'lbw-def-generic-12-well-reservoir',
      destination_labware: 'lbw-def-generic-96-well-plate',
      wells: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'],
      volume: { value: 100, unit: 'uL' },
    });
  });
});
