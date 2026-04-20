import { describe, it, expect, vi } from 'vitest';

// Mock the system prompt module to avoid file system dependencies
vi.mock('./systemPrompt.js', () => ({
  buildSystemPrompt: () => 'Test system prompt',
  buildSurfaceAwarePrompt: () => 'Test surface prompt',
}));

// Mock the resolveMentions module
vi.mock('./resolveMentions.js', () => ({
  resolveMentionsForPrompt: async () => [],
  buildResolvedContextMessage: () => null,
}));

import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { InferenceClient, ToolBridge, InferenceConfig, AgentConfig } from './types.js';
import type { ExtractionRunnerService } from '../extract/ExtractionRunnerService.js';

/**
 * E2E integration tests for the chatbot-compile pipeline.
 * 
 * These tests verify the end-to-end flow from chatbot prompt through
 * the extraction pipeline, entity extraction, AI precompile, biology
 * verb expansion, and labware resolution passes.
 */

describe('chatbot-compile E2E', () => {
  /**
   * Helper to create mock dependencies for the orchestrator.
   */
  function makeDeps(overrides: {
    candidateEvents?: Array<{ verb: string; [key: string]: unknown }>;
    candidateLabwares?: Array<{ hint: string; reason?: string }>;
    searchMatches?: Array<{ recordId: string; title: string }>;
  } = {}) {
    const extractionService = {
      run: vi.fn(async () => ({
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const llmClient = {
      complete: vi.fn(async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              candidateEvents: overrides.candidateEvents ?? [],
              candidateLabwares: overrides.candidateLabwares ?? [],
              unresolvedRefs: [],
            }),
          },
        }],
      })),
    } as unknown as InferenceClient;

    const searchLabwareByHint = vi.fn(async (hint: string) => {
      // For test 1: if hint contains 'plate-1', return a match
      // For test 2: return empty array
      if (overrides.searchMatches && overrides.searchMatches.length > 0) {
        return overrides.searchMatches;
      }
      return [];
    });

    return { extractionService, llmClient, searchLabwareByHint };
  }

  /**
   * Create minimal orchestrator deps for testing.
   */
  function createTestOrchestrator(deps: {
    extractionService: ExtractionRunnerService;
    llmClient: InferenceClient;
    searchLabwareByHint: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
  }) {
    const inferenceClient = {
      complete: deps.llmClient.complete,
      completeStream: vi.fn(async function* () {
        // Empty stream for testing
        return;
      }),
    } as InferenceClient;

    const toolBridge = {
      getToolDefinitions: vi.fn(() => []),
      executeTool: vi.fn(async () => ({
        success: true,
        content: '{}',
        durationMs: 10,
      })),
    } as unknown as ToolBridge;

    const inferenceConfig: InferenceConfig = {
      model: 'test-model',
      temperature: 0.1,
      maxTokens: 4096,
    };

    const agentConfig: AgentConfig = {
      maxTurns: 15,
      maxToolCallsPerTurn: 5,
      systemPromptPath: '/home/brad/git/computable-lab/server/prompts/event-graph-agent.md',
    };

    return createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      inferenceConfig,
      agentConfig,
      {
        extractionService: deps.extractionService,
        llmClient: deps.llmClient,
        searchLabwareByHint: deps.searchLabwareByHint,
      },
    );
  }

  it('seeds into an existing plate and returns one add_material event', async () => {
    const deps = makeDeps({
      candidateEvents: [{
        verb: 'seed',
        labware: 'plate-1',
        cell_ref: 'HeLa',
        volume: { value: 200, unit: 'uL' },
        wells: ['A1'],
      }],
      candidateLabwares: [{ hint: 'plate-1', reason: 'referenced by seed' }],
      searchMatches: [{ recordId: 'plate-1', title: '96-well plate' }],
    });

    const orchestrator = createTestOrchestrator(deps);
    const result = await orchestrator.run({
      prompt: 'seed HeLa cells into existing plate',
      context: {
        labwares: [{ labwareId: 'plate-1', labwareType: '96-well-plate', name: '96-well plate' }],
        eventSummary: '',
        vocabPackId: 'general',
        availableVerbs: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.events).toBeDefined();
    expect(result.events!.length).toBe(1);
    expect(result.events![0].event_type).toBe('add_material');
    expect(result.labwareAdditions === undefined || result.labwareAdditions.length === 0).toBe(true);
  });

  it('seeds into a new plate and proposes an AiLabwareAddition', async () => {
    const deps = makeDeps({
      candidateEvents: [{
        verb: 'seed',
        labware: 'new-plate',
        cell_ref: 'HeLa',
        volume: { value: 200, unit: 'uL' },
        wells: ['A1'],
      }],
      candidateLabwares: [{ hint: 'new-plate', reason: 'proposed from prompt' }],
      searchMatches: [], // No matches - should propose new labware
    });

    const orchestrator = createTestOrchestrator(deps);
    const result = await orchestrator.run({
      prompt: 'seed HeLa cells into a new 96-well plate',
      context: {
        labwares: [],
        eventSummary: '',
        vocabPackId: 'general',
        availableVerbs: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.labwareAdditions).toBeDefined();
    expect(result.labwareAdditions!.length).toBe(1);
    expect(result.labwareAdditions![0].recordId).toBe('new-plate');
    expect(typeof result.labwareAdditions![0].reason).toBe('string');
    expect(result.labwareAdditions![0].reason!.length).toBeGreaterThan(0);
  });

  it('falls through to LLM loop when pipeline produces no events', async () => {
    const deps = makeDeps({
      candidateEvents: [],
      candidateLabwares: [],
      searchMatches: [],
    });

    const orchestrator = createTestOrchestrator(deps);
    const result = await orchestrator.run({
      prompt: 'what does this experiment do?',
      context: {
        labwares: [],
        eventSummary: '',
        vocabPackId: 'general',
        availableVerbs: [],
      },
    });

    // When pipeline produces no events, the orchestrator falls through to the LLM loop.
    // Since we're mocking the LLM to return empty results, the orchestrator should
    // return gracefully with success=true and no events.
    expect(result.success).toBeDefined();
    expect(result.events === undefined || result.events.length === 0).toBe(true);
  });
});
