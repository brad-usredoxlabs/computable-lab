/**
 * Integration tests for runChatbotCompile.
 * 
 * This test verifies that the chatbot-compile pipeline correctly:
 * - Runs extraction on prompt + attachments
 * - Uses LLM to produce candidate events and labwares
 * - Expands biology verbs to primitives
 * - Resolves labware hints
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { runChatbotCompile, type RunChatbotCompileArgs } from './runChatbotCompile.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../extract/ExtractionRunnerService.js';
import type { LlmClient } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { CompletionRequest, CompletionResponse } from './types.js';

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
      complete: vi.fn(async (req: CompletionRequest): Promise<CompletionResponse> => {
        // Return a JSON response with candidateEvents and candidateLabwares
        const content = JSON.stringify({
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
        });
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
      }),
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

    // Assert events: should have one add_material event (from seed verb expansion)
    expect(result.events.length).toBe(1);
    expect(result.events[0]!.event_type).toBe('add_material');

    // Assert labwareAdditions: should have one entry for '96-well plate'
    expect(result.labwareAdditions.length).toBe(1);
    expect(result.labwareAdditions[0]!.recordId).toBe('96-well plate');

    // Assert unresolvedRefs is empty
    expect(result.unresolvedRefs.length).toBe(0);
  });

  it('threads mention tokens into the precompile LLM payload and short-circuits with a transfer event', async () => {
    // Extraction is irrelevant for the mention-resolved path — return nothing.
    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    // Capture the user payload the precompile pass sends to the LLM, and
    // return a deterministic transfer candidateEvent that exactly references
    // the mention IDs.
    let capturedUserPayload: string | null = null;
    const mockLlmClient: LlmClient = {
      complete: vi.fn(async (req: CompletionRequest): Promise<CompletionResponse> => {
        const userMsg = req.messages.find((m) => m.role === 'user');
        capturedUserPayload = typeof userMsg?.content === 'string' ? userMsg.content : null;
        const content = JSON.stringify({
          candidateEvents: [
            {
              verb: 'transfer',
              volume_uL: 100,
              labware_id: 'lw-1777158503980-v4330d',
              well: 'A1',
              material_ref: { kind: 'aliquot', id: 'ALQ-PR9-TEST-CLO-001' },
            },
          ],
          candidateLabwares: [],
          unresolvedRefs: [],
        });
        return {
          id: 'test-response-id',
          choices: [
            { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
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

    // The precompile LLM was given the mentions array.
    expect(capturedUserPayload).toBeTruthy();
    const parsed = JSON.parse(capturedUserPayload!) as { mentions?: unknown[] };
    expect(Array.isArray(parsed.mentions)).toBe(true);
    expect(parsed.mentions!.length).toBe(2);

    // The pipeline produced one transfer primitive bound to the labware mention.
    expect(result.events.length).toBe(1);
    expect(result.events[0]!.event_type).toBe('transfer');
    expect(result.events[0]!.labwareId).toBe('lw-1777158503980-v4330d');

    // No labware additions, no unresolved refs.
    expect(result.labwareAdditions.length).toBe(0);
    expect(result.unresolvedRefs.length).toBe(0);

    // Outcome should be 'complete' so AgentOrchestrator short-circuits the LLM loop.
    expect(result.outcome).toBe('complete');

    // The mention-resolved labware id should NOT have triggered a record-store search.
    expect(searchLabwareByHint).not.toHaveBeenCalled();
  });
});
