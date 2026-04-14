/**
 * Unit tests for AgentOrchestrator instrumentation.
 *
 * Verifies that [agent-summary] is logged exactly once per run call
 * with the expected top-level fields.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InferenceClient, ToolBridge, CompletionRequest, StreamChunk } from './types.js';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { InferenceConfig, AgentConfig } from '../config/types.js';

describe('AgentOrchestrator instrumentation', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('emits exactly one [agent-summary] line with required fields on success', async () => {
    // Create a fake InferenceClient that yields one chunk with finish_reason: 'stop'
    const fakeInferenceClient: InferenceClient = {
      complete: async () => {
        throw new Error('Not used in this test');
      },
      completeStream: async function* () {
        const chunk: StreamChunk = {
          id: 'test-chunk-1',
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: '{"events":[],"notes":[],"unresolvedRefs":[]}',
              },
              finish_reason: 'stop',
            },
          ],
        };
        yield chunk;
      },
    };

    // Create a ToolBridge stub with no tools
    const fakeToolBridge: ToolBridge = {
      getToolDefinitions: () => [],
      executeTool: async () => {
        throw new Error('Should not be called');
      },
    };

    const inferenceConfig: InferenceConfig = {
      model: 'test-model',
      temperature: 0.1,
      maxTokens: 4096,
    };

    const agentConfig: AgentConfig = {
      maxTurns: 15,
      maxToolCallsPerTurn: 5,
    };

    const orchestrator = createAgentOrchestrator(
      fakeInferenceClient,
      fakeToolBridge,
      inferenceConfig,
      agentConfig,
    );

    const result = await orchestrator.run({
      prompt: 'Test prompt',
      context: {
        labwares: [],
        eventSummary: '',
        vocabPackId: 'test-pack',
        availableVerbs: [],
      },
    });

    // Verify the result is successful
    expect(result.success).toBe(true);

    // Find the [agent-summary] log call
    const summaryCalls = consoleLogSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].startsWith('[agent-summary] ')
    );

    // Should have exactly one summary line
    expect(summaryCalls).toHaveLength(1);

    // Parse the summary JSON
    const summaryJson = summaryCalls[0][0].slice('[agent-summary] '.length);
    const summary = JSON.parse(summaryJson);

    // Verify required top-level fields
    expect(summary).toHaveProperty('traceId');
    expect(summary).toHaveProperty('surface');
    expect(summary).toHaveProperty('model');
    expect(summary).toHaveProperty('success');
    expect(summary).toHaveProperty('elapsedMs');
    expect(summary).toHaveProperty('turns');
    expect(summary).toHaveProperty('totals');
    expect(summary).toHaveProperty('resolvedMentions');

    // Verify field types and values
    expect(typeof summary.traceId).toBe('string');
    expect(typeof summary.surface).toBe('string');
    expect(summary.model).toBe('test-model');
    expect(summary.success).toBe(true);
    expect(typeof summary.elapsedMs).toBe('number');
    expect(Array.isArray(summary.turns)).toBe(true);
    expect(summary.turns).toHaveLength(1);
    expect(typeof summary.totals.turns).toBe('number');
    expect(typeof summary.totals.toolCalls).toBe('number');
    expect(typeof summary.totals.promptTokens).toBe('number');
    expect(typeof summary.totals.completionTokens).toBe('number');
    expect(typeof summary.totals.totalTokens).toBe('number');
    expect(typeof summary.resolvedMentions).toBe('number');

    // Verify turn structure
    const turn = summary.turns[0];
    expect(turn).toHaveProperty('turn');
    expect(turn).toHaveProperty('durationMs');
    expect(turn).toHaveProperty('finishReason');
    expect(turn).toHaveProperty('promptTokens');
    expect(turn).toHaveProperty('completionTokens');
    expect(turn).toHaveProperty('tools');
    expect(Array.isArray(turn.tools)).toBe(true);
  });

  it('emits [agent-summary] on inference error', async () => {
    // Create a fake InferenceClient that throws an error
    const fakeInferenceClient: InferenceClient = {
      complete: async () => {
        throw new Error('Not used in this test');
      },
      completeStream: async function* () {
        throw new Error('Simulated inference error');
      },
    };

    const fakeToolBridge: ToolBridge = {
      getToolDefinitions: () => [],
      executeTool: async () => {
        throw new Error('Should not be called');
      },
    };

    const inferenceConfig: InferenceConfig = {
      model: 'test-model',
      temperature: 0.1,
      maxTokens: 4096,
    };

    const agentConfig: AgentConfig = {
      maxTurns: 15,
      maxToolCallsPerTurn: 5,
    };

    const orchestrator = createAgentOrchestrator(
      fakeInferenceClient,
      fakeToolBridge,
      inferenceConfig,
      agentConfig,
    );

    const result = await orchestrator.run({
      prompt: 'Test prompt',
      context: {
        labwares: [],
        eventSummary: '',
        vocabPackId: 'test-pack',
        availableVerbs: [],
      },
    });

    // Verify the result is a failure
    expect(result.success).toBe(false);
    expect(result.error).toContain('Inference error');

    // Find the [agent-summary] log call
    const summaryCalls = consoleLogSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].startsWith('[agent-summary] ')
    );

    // Should have exactly one summary line
    expect(summaryCalls).toHaveLength(1);

    // Parse the summary JSON
    const summaryJson = summaryCalls[0][0].slice('[agent-summary] '.length);
    const summary = JSON.parse(summaryJson);

    // Verify required fields
    expect(summary.success).toBe(false);
    expect(summary.error).toContain('Inference error');
    expect(summary.model).toBe('test-model');
  });
});
