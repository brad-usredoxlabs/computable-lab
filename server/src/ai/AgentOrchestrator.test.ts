import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { CompletionRequest, CompletionResponse, InferenceClient, ToolBridge } from './types.js';

describe('createAgentOrchestrator', () => {
  it('includes prior user and assistant turns before the current prompt', async () => {
    let capturedMessages: CompletionRequest['messages'] = [];
    const complete = vi.fn(async (request: CompletionRequest): Promise<CompletionResponse> => {
      capturedMessages = request.messages.map((message) => ({
        ...message,
        ...(message.tool_calls ? { tool_calls: [...message.tool_calls] } : {}),
      }));
      return {
        id: 'resp-1',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Need source well.',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };
    });

    const inferenceClient: InferenceClient = {
      complete,
      completeStream: vi.fn(),
    };
    const toolBridge: ToolBridge = {
      getToolDefinitions: () => [],
      executeTool: vi.fn(),
    };
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
    );

    await orchestrator.run({
      prompt: 'Yes, reservoir A1.',
      history: [
        { role: 'user', content: 'Transfer 10 uL of clofibrate to B2.' },
        { role: 'assistant', content: 'Which source well contains clofibrate?' },
      ],
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['transfer'],
      },
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(capturedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      { role: 'system', content: expect.any(String) },
      {
        role: 'system',
        content: expect.stringContaining('Recent conversation context:\n1. User: Transfer 10 uL of clofibrate to B2.'),
      },
      { role: 'user', content: 'Transfer 10 uL of clofibrate to B2.' },
      { role: 'assistant', content: 'Which source well contains clofibrate?' },
      { role: 'user', content: 'Yes, reservoir A1.' },
    ]);
  });
});
