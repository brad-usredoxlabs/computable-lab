/**
 * Tests for AgentOrchestrator outcome-based forwarding (spec-004).
 *
 * These tests verify that the orchestrator decides whether to short-circuit
 * the LLM fallback based on compileResult.outcome and terminalArtifacts,
 * not on compileResult.events.length alone.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { InferenceClient, ToolBridge, ResolveMentionDeps } from './types.js';
import type { AgentConfig, InferenceConfig } from './config/types.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../extract/ExtractionRunnerService.js';
import type { LlmClient } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { CompletionRequest } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInferenceClient(): InferenceClient {
  return {
    complete: vi.fn().mockRejectedValue(new Error('complete should not be called')),
    completeStream: vi.fn().mockImplementation(async function* () {
      throw new Error('completeStream should not be called');
    }),
  };
}

function makeToolBridge(): ToolBridge {
  return {
    getToolDefinitions: vi.fn().mockReturnValue([]),
    executeTool: vi.fn().mockRejectedValue(new Error('executeTool should not be called')),
  };
}

function makeConfig(): { inferenceConfig: InferenceConfig; agentConfig: AgentConfig } {
  return {
    inferenceConfig: {
      model: 'test-model',
      temperature: 0.1,
      maxTokens: 4096,
    },
    agentConfig: {
      maxTurns: 15,
      maxToolCallsPerTurn: 5,
      systemPromptPath: 'default',
    },
  };
}

// ---------------------------------------------------------------------------
// Test (a): outcome='complete' with 1 event short-circuits LLM
// ---------------------------------------------------------------------------

describe('AgentOrchestrator outcome-based forwarding', () => {
  it('(a) outcome=complete with events short-circuits LLM', async () => {
    const inferenceClient = makeInferenceClient();
    const toolBridge = makeToolBridge();

    // Mock extraction service that returns a labware hint candidate
    const mockExtractionService = {
      run: vi.fn(async (_req: RunExtractionServiceArgs) => ({
        target_kind: _req.target_kind,
        source: _req.source,
        candidates: [
          { target_kind: 'labware-spec', hint: 'Plate 1', reason: 'needed', confidence: 0.9 },
        ],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    // Mock LLM client that returns a JSON with a seed event (seed has an expander)
    const mockLlmClient = {
      complete: vi.fn(async (_req: CompletionRequest) => {
        const content = JSON.stringify({
          candidateEvents: [
            {
              verb: 'seed',
              cell_ref: 'Clofibrate',
              volume: { value: 100, unit: 'uL' },
              wells: ['A1'],
              labware_id: 'LBW-1',
            },
          ],
          candidateLabwares: [],
          unresolvedRefs: [],
        });
        return {
          id: 'test-id',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
      }),
    } as unknown as LlmClient;

    // searchLabwareByHint returns a match so the labware resolves
    const searchLabwareByHint = vi.fn(async () => [
      { recordId: 'LBW-1', title: 'Plate 1' },
    ]);

    const resolveMentionDeps: ResolveMentionDeps = {
      fetchMaterialSpec: vi.fn().mockResolvedValue({
        id: 'MSP-X', name: 'Clofibrate 1mM', concentration: { value: 1, unit: 'mM' },
      }),
      fetchLabware: vi.fn().mockResolvedValue({
        id: 'LBW-1', name: 'Plate 1', labwareType: 'plate-96',
      }),
      searchLabwareByHint,
    };

    const { inferenceConfig, agentConfig } = makeConfig();

    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      inferenceConfig,
      agentConfig,
      { ...resolveMentionDeps, extractionService: mockExtractionService, llmClient: mockLlmClient },
    );

    const result = await orchestrator.run({
      prompt: 'Add 100uL of Clofibrate to A1 of Plate 1',
      surface: 'default',
      context: {
        labwares: [],
        eventSummary: { totalEvents: 0, recentEvents: [] },
        vocabPackId: 'default',
        availableVerbs: [],
      },
    });

    // Should short-circuit: success with events
    expect(result.success).toBe(true);
    expect(result.events).toBeDefined();
    expect(result.events!.length).toBeGreaterThanOrEqual(1);

    // LLM must NOT have been called (the completeStream on the inference client)
    expect(inferenceClient.completeStream).not.toHaveBeenCalled();
    expect(inferenceClient.complete).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test (b): outcome='complete' with 0 events and no gaps still short-circuits
  // ---------------------------------------------------------------------------

  it('(b) outcome=complete with no events and no gaps still short-circuits', async () => {
    const inferenceClient = makeInferenceClient();
    const toolBridge = makeToolBridge();

    // Mock extraction service that returns no candidates
    const mockExtractionService = {
      run: vi.fn(async (_req: RunExtractionServiceArgs) => ({
        target_kind: _req.target_kind,
        source: _req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    // Mock LLM client that returns empty candidateEvents (complete outcome, no events)
    const mockLlmClient = {
      complete: vi.fn(async (_req: CompletionRequest) => {
        const content = JSON.stringify({
          candidateEvents: [],
          candidateLabwares: [],
          unresolvedRefs: [],
        });
        return {
          id: 'test-id',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
      }),
    } as unknown as LlmClient;

    const searchLabwareByHint = vi.fn(async () => []);

    const resolveMentionDeps: ResolveMentionDeps = {
      fetchMaterialSpec: vi.fn().mockResolvedValue(null),
      fetchLabware: vi.fn().mockResolvedValue(null),
      searchLabwareByHint,
    };

    const { inferenceConfig, agentConfig } = makeConfig();

    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      inferenceConfig,
      agentConfig,
      { ...resolveMentionDeps, extractionService: mockExtractionService, llmClient: mockLlmClient },
    );

    const result = await orchestrator.run({
      prompt: 'Some prompt with no actionable events',
      surface: 'default',
      context: {
        labwares: [],
        eventSummary: { totalEvents: 0, recentEvents: [] },
        vocabPackId: 'default',
        availableVerbs: [],
      },
    });

    // Should short-circuit (outcome='complete') even with 0 events and 0 gaps
    expect(result.success).toBe(true);
    expect(inferenceClient.completeStream).not.toHaveBeenCalled();
    expect(inferenceClient.complete).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test (c): outcome='gap' with no events but 1 gap short-circuits and surfaces the gap
  // ---------------------------------------------------------------------------

  it('(c) outcome=gap with no events but 1 gap short-circuits and surfaces the gap', async () => {
    const inferenceClient = makeInferenceClient();
    const toolBridge = makeToolBridge();

    // Mock extraction service that returns no candidates
    const mockExtractionService = {
      run: vi.fn(async (_req: RunExtractionServiceArgs) => ({
        target_kind: _req.target_kind,
        source: _req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    // Mock LLM client that returns unresolved refs (triggers 'gap' outcome)
    const mockLlmClient = {
      complete: vi.fn(async (_req: CompletionRequest) => {
        const content = JSON.stringify({
          candidateEvents: [],
          candidateLabwares: [],
          unresolvedRefs: [
            { kind: 'material', label: 'HeLa cells', reason: 'not in library' },
          ],
        });
        return {
          id: 'test-id',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
      }),
    } as unknown as LlmClient;

    const searchLabwareByHint = vi.fn(async () => []);

    const resolveMentionDeps: ResolveMentionDeps = {
      fetchMaterialSpec: vi.fn().mockResolvedValue(null),
      fetchLabware: vi.fn().mockResolvedValue(null),
      searchLabwareByHint,
    };

    const { inferenceConfig, agentConfig } = makeConfig();

    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      inferenceConfig,
      agentConfig,
      { ...resolveMentionDeps, extractionService: mockExtractionService, llmClient: mockLlmClient },
    );

    const result = await orchestrator.run({
      prompt: 'Seed HeLa cells in a plate',
      surface: 'default',
      context: {
        labwares: [],
        eventSummary: { totalEvents: 0, recentEvents: [] },
        vocabPackId: 'default',
        availableVerbs: [],
      },
    });

    // Should short-circuit (outcome='gap' with gaps) and surface the unresolved ref
    expect(result.success).toBe(true);
    expect(inferenceClient.completeStream).not.toHaveBeenCalled();
    expect(inferenceClient.complete).not.toHaveBeenCalled();
    // The gap should be surfaced in unresolvedRefs
    expect(result.unresolvedRefs).toBeDefined();
    expect(result.unresolvedRefs!.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Test (d): outcome='error' falls through to LLM fallback
  // ---------------------------------------------------------------------------

  it('(d) outcome=error falls through to LLM fallback', async () => {
    const inferenceClient = makeInferenceClient();
    const toolBridge = makeToolBridge();

    // Mock extraction service that returns no candidates
    const mockExtractionService = {
      run: vi.fn(async (_req: RunExtractionServiceArgs) => ({
        target_kind: _req.target_kind,
        source: _req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    // Mock LLM client that returns empty (outcome='complete' with no events)
    // This will fall through because outcome='complete' but hasArtifacts=false
    // Actually, outcome='complete' always short-circuits regardless of hasArtifacts.
    // To test 'error' outcome, we need the pipeline to produce diagnostics with severity='error'.
    // Since we can't easily trigger that, we test the fallthrough behavior by
    // using a prompt that produces no events and no gaps (outcome='complete' with no artifacts).
    // Wait - outcome='complete' always short-circuits per the spec.
    // The only way to fall through is outcome='error' or outcome='gap' with no artifacts.
    // Let's test outcome='gap' with no artifacts (no gaps).
    // Actually, looking at the spec: shouldShortCircuit = outcome==='complete' || (outcome==='gap' && hasArtifacts)
    // So outcome='gap' with no artifacts does NOT short-circuit.
    // But outcome='error' also does NOT short-circuit.
    // Both fall through to LLM. Let's test the 'error' case by making the pipeline produce an error diagnostic.

    // To get outcome='error', we need diagnostics with severity='error'.
    // The simplest way is to make the extraction service throw an error, which produces
    // an EXTRACTION_ERROR diagnostic.
    const mockExtractionServiceWithError = {
      run: vi.fn(async (_req: RunExtractionServiceArgs) => {
        throw new Error('Extraction failed');
      }),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient = {
      complete: vi.fn(async (_req: CompletionRequest) => {
        const content = JSON.stringify({
          candidateEvents: [],
          candidateLabwares: [],
          unresolvedRefs: [],
        });
        return {
          id: 'test-id',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
      }),
    } as unknown as LlmClient;

    const searchLabwareByHint = vi.fn(async () => []);

    const resolveMentionDeps: ResolveMentionDeps = {
      fetchMaterialSpec: vi.fn().mockResolvedValue(null),
      fetchLabware: vi.fn().mockResolvedValue(null),
      searchLabwareByHint,
    };

    const { inferenceConfig, agentConfig } = makeConfig();

    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      inferenceConfig,
      agentConfig,
      { ...resolveMentionDeps, extractionService: mockExtractionServiceWithError, llmClient: mockLlmClient },
    );

    const result = await orchestrator.run({
      prompt: 'Some prompt',
      surface: 'default',
      context: {
        labwares: [],
        eventSummary: { totalEvents: 0, recentEvents: [] },
        vocabPackId: 'default',
        availableVerbs: [],
      },
    });

    // The pipeline should produce an error diagnostic, making outcome='error'.
    // outcome='error' should NOT short-circuit, so it falls through to LLM.
    // But the LLM fallback also uses the mockLlmClient which returns empty events,
    // so the LLM loop will also produce no events and return success=false.
    // The key assertion is that the inferenceClient.completeStream WAS called
    // (meaning we fell through to the LLM loop).
    expect(inferenceClient.completeStream).toHaveBeenCalled();
  });
});
