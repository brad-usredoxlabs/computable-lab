import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { CompletionRequest, CompletionResponse, InferenceClient, ToolBridge, ToolDefinition } from './types.js';

describe('AgentOrchestrator parallel tool execution', () => {
  it('executes multiple tool calls concurrently and preserves result order', async () => {
    // Track invocation start times
    const invocationStartTimes: Record<string, number> = {};
    const toolResultOrder: string[] = [];

    // Create a ToolBridge stub with tools that have different execution times
    const toolBridge: ToolBridge = {
      getToolDefinitions: (): ToolDefinition[] => [
        {
          type: 'function',
          function: {
            name: 'toolA',
            description: 'Slow tool',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
        {
          type: 'function',
          function: {
            name: 'toolB',
            description: 'Fast tool',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
      ],
      executeTool: vi.fn(async (name: string, _args: Record<string, unknown>): Promise<import('./types.js').ToolExecutionResult> => {
        const startTime = Date.now();
        invocationStartTimes[name] = startTime;

        // toolA takes 50ms, toolB takes 10ms
        const delay = name === 'toolA' ? 50 : 10;
        await new Promise((resolve) => setTimeout(resolve, delay));

        return {
          success: true,
          content: JSON.stringify({ result: `result from ${name}` }),
          durationMs: delay,
        };
      }),
    };

    // Create an InferenceClient stub that returns two tool calls on first call,
    // then finish on second call
    let callCount = 0;
    const inferenceClient: InferenceClient = {
      complete: vi.fn(),
      completeStream: vi.fn(async function* (): AsyncIterable<import('./types.js').StreamChunk> {
        if (callCount === 0) {
          // First call: return assistant message with two tool calls
          yield {
            id: 'chunk-1',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-A',
                      type: 'function',
                      function: { name: 'toolA', arguments: '{}' },
                    },
                    {
                      index: 1,
                      id: 'call-B',
                      type: 'function',
                      function: { name: 'toolB', arguments: '{}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          };
          yield {
            id: 'chunk-2',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'tool_calls',
              },
            ],
          };
        } else {
          // Second call: return finish with valid JSON events
          yield {
            id: 'chunk-3',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content: '```json\n{"events":[]}\n```',
                },
                finish_reason: 'stop',
              },
            ],
          };
        }
        callCount++;
      }),
    };

    // Track tool_result events
    const toolResultEvents: Array<{ toolName: string; order: number }> = [];
    let eventOrder = 0;

    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 3, maxToolCallsPerTurn: 5 },
    );

    const result = await orchestrator.run({
      prompt: 'Run toolA and toolB',
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'test/v1',
        availableVerbs: ['test'],
      },
      onEvent: (event) => {
        if (event.type === 'tool_result') {
          toolResultEvents.push({ toolName: event.toolName, order: eventOrder++ });
        }
      },
    });

    // Verify both tools were invoked
    expect(toolBridge.executeTool).toHaveBeenCalledTimes(2);
    expect(invocationStartTimes['toolA']).toBeDefined();
    expect(invocationStartTimes['toolB']).toBeDefined();

    // Verify tools started within 5ms of each other (parallel execution)
    const delta = Math.abs(invocationStartTimes['toolA']! - invocationStartTimes['toolB']!);
    expect(delta).toBeLessThan(5);

    // Verify tool_result events were emitted in original order (toolA before toolB)
    expect(toolResultEvents.length).toBe(2);
    expect(toolResultEvents[0]?.toolName).toBe('toolA');
    expect(toolResultEvents[1]?.toolName).toBe('toolB');

    // Verify AgentResult success
    expect(result.success).toBe(true);
  });

  it('preserves message order even when faster tools complete first', async () => {
    const messagesPushed: Array<{ toolName: string; index: number }> = [];
    let messageIndex = 0;

    // Create a ToolBridge where toolB is faster than toolA
    const toolBridge: ToolBridge = {
      getToolDefinitions: (): ToolDefinition[] => [
        {
          type: 'function',
          function: {
            name: 'toolA',
            description: 'Slow tool (50ms)',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
        {
          type: 'function',
          function: {
            name: 'toolB',
            description: 'Fast tool (10ms)',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
      ],
      executeTool: vi.fn(async (name: string, _args: Record<string, unknown>): Promise<import('./types.js').ToolExecutionResult> => {
        const delay = name === 'toolA' ? 50 : 10;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return {
          success: true,
          content: JSON.stringify({ result: `result from ${name}` }),
          durationMs: delay,
        };
      }),
    };

    let callCount = 0;
    const inferenceClient: InferenceClient = {
      complete: vi.fn(),
      completeStream: vi.fn(async function* (): AsyncIterable<import('./types.js').StreamChunk> {
        if (callCount === 0) {
          // First call: return assistant message with two tool calls in order A, B
          yield {
            id: 'chunk-1',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-A',
                      type: 'function',
                      function: { name: 'toolA', arguments: '{}' },
                    },
                    {
                      index: 1,
                      id: 'call-B',
                      type: 'function',
                      function: { name: 'toolB', arguments: '{}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          };
          yield {
            id: 'chunk-2',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'tool_calls',
              },
            ],
          };
        } else {
          // Second call: return finish with valid JSON events
          yield {
            id: 'chunk-3',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content: '```json\n{"events":[]}\n```',
                },
                finish_reason: 'stop',
              },
            ],
          };
        }
        callCount++;
      }),
    };

    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 3, maxToolCallsPerTurn: 5 },
    );

    const result = await orchestrator.run({
      prompt: 'Run toolA and toolB',
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'test/v1',
        availableVerbs: ['test'],
      },
      onEvent: (event) => {
        if (event.type === 'tool_result') {
          messagesPushed.push({ toolName: event.toolName, index: messageIndex++ });
        }
      },
    });

    // Verify messages were pushed in original order (toolA before toolB)
    // Even though toolB finished first (10ms vs 50ms), the results should be in order
    expect(messagesPushed.length).toBe(2);
    expect(messagesPushed[0]?.toolName).toBe('toolA');
    expect(messagesPushed[1]?.toolName).toBe('toolB');

    expect(result.success).toBe(true);
  });
});
