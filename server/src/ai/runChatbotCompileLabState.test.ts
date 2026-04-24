/**
 * Tests for LabState threading through runChatbotCompile.
 *
 * Verifies that:
 * (a) omitting priorLabState gives a labStateDelta with events applied to emptyLabState
 * (b) passing a priorLabState with pre-existing labware carries it through
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { runChatbotCompile, type RunChatbotCompileArgs } from './runChatbotCompile.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../extract/ExtractionRunnerService.js';
import type { LlmClient } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { CompletionRequest, CompletionResponse } from './types.js';
import type { LabStateSnapshot } from '../compiler/state/LabState.js';
import { emptyLabState } from '../compiler/state/LabState.js';

describe('runChatbotCompile — LabState threading', () => {
  // -----------------------------------------------------------------------
  // Shared stubs
  // -----------------------------------------------------------------------

  function makeMockExtractionService(): ExtractionRunnerService {
    return {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
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
      })),
    } as unknown as ExtractionRunnerService;
  }

  /**
   * LLM client that returns a create_container event (which produces
   * a create_container PlateEventPrimitive) and an add_material event.
   */
  function makeMockLlmClientWithCreateContainer(): LlmClient {
    return {
      complete: vi.fn(async (req: CompletionRequest): Promise<CompletionResponse> => {
        const content = JSON.stringify({
          candidateEvents: [
            {
              verb: 'create_container',
              slot: 'target',
              labwareType: '96-well-deepwell-plate',
            },
            {
              verb: 'add_material',
              labware: '96-well plate',
              material: {
                materialId: 'mat-sample-1',
                kind: 'fecal-sample',
                volumeUl: 100,
              },
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
  }

  // -----------------------------------------------------------------------
  // Test (a): omitting priorLabState
  // -----------------------------------------------------------------------

  it('omitting priorLabState produces labStateDelta with events applied to emptyLabState', async () => {
    const searchLabwareByHint = async (_hint: string) => [];

    const args: RunChatbotCompileArgs = {
      prompt: 'add a 96-well plate and seed HeLa cells',
      deps: {
        extractionService: makeMockExtractionService(),
        llmClient: makeMockLlmClientWithCreateContainer(),
        searchLabwareByHint,
      },
    };

    const result = await runChatbotCompile(args);

    // labStateDelta must be present
    expect(result.terminalArtifacts.labStateDelta).toBeDefined();
    const delta = result.terminalArtifacts.labStateDelta!;

    // snapshotAfter should have a deck entry (from create_container)
    expect(delta.snapshotAfter.deck.length).toBeGreaterThan(0);

    // turnIndex should be 1 (incremented from 0)
    expect(delta.snapshotAfter.turnIndex).toBe(1);

    // mintCounter should be 1 (one container created)
    expect(delta.snapshotAfter.mintCounter).toBe(1);

    // labware should have at least one instance
    expect(Object.keys(delta.snapshotAfter.labware).length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Test (b): passing a priorLabState with pre-existing labware
  // -----------------------------------------------------------------------

  it('passing a priorLabState carries pre-existing labware into snapshotAfter', async () => {
    const searchLabwareByHint = async (_hint: string) => [];

    // Build a priorLabState with one pre-existing labware instance
    const priorLabState: LabStateSnapshot = {
      ...emptyLabState(),
      deck: [{ slot: 'A', labwareInstanceId: 'LWI-1' }],
      labware: {
        'LWI-1': {
          instanceId: 'LWI-1',
          labwareType: 'reservoir-300ml',
          slot: 'A',
          orientation: 'landscape',
          wells: {},
        },
      },
      mintCounter: 1,
      turnIndex: 0,
    };

    const args: RunChatbotCompileArgs = {
      prompt: 'add a 96-well plate and seed HeLa cells',
      priorLabState,
      deps: {
        extractionService: makeMockExtractionService(),
        llmClient: makeMockLlmClientWithCreateContainer(),
        searchLabwareByHint,
      },
    };

    const result = await runChatbotCompile(args);

    // labStateDelta must be present
    expect(result.terminalArtifacts.labStateDelta).toBeDefined();
    const delta = result.terminalArtifacts.labStateDelta!;

    // snapshotAfter should still contain the pre-existing labware
    expect(delta.snapshotAfter.labware['LWI-1']).toBeDefined();
    expect(delta.snapshotAfter.labware['LWI-1'].labwareType).toBe('reservoir-300ml');

    // turnIndex should be 1 (incremented from 0)
    expect(delta.snapshotAfter.turnIndex).toBe(1);

    // mintCounter should be 2 (one pre-existing + one new container)
    expect(delta.snapshotAfter.mintCounter).toBe(2);

    // deck should have at least 2 entries (reservoir + new plate)
    expect(delta.snapshotAfter.deck.length).toBeGreaterThanOrEqual(2);
  });
});
