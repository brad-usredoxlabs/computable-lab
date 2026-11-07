import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';

function mutationTripwire() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => { throw new Error('answer intent must NEVER reach store.create'); }),
    update: vi.fn(async () => { throw new Error('answer intent must NEVER reach store.update'); }),
    delete: vi.fn(async () => { throw new Error('answer intent must NEVER reach store.delete'); }),
    validate: vi.fn(), lint: vi.fn(), getByPath: vi.fn(), getWithValidation: vi.fn(),
  };
}

function intentClient(args: unknown): { client: InferenceClient } {
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    yield {
      id: 'resp-answer',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0, id: 'call-ans', type: 'function',
            function: { name: AGENT_INTENT_TOOL_NAME, arguments: JSON.stringify(args) },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
  });
  return { client: { complete: vi.fn(), completeStream } };
}

describe('answer intent — orchestrator-level behaviour (SEQ-ANSWER-CONTRACT-1)', () => {
  it('emits exactly one text_delta with the answer payload, no writes, one inference, no agent_action', async () => {
    const store = mutationTripwire();
    const answerPayload = 'This sequences workspace tracks sequence records and their runs.';
    const { client } = intentClient({ intent: 'answer', text: answerPayload });
    const executeTool = vi.fn(async () => { throw new Error('answer intent must NEVER execute a tool'); });
    const events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator(
      client,
      { getToolDefinitions: () => [], executeTool },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
      { store: store as never },
    );
    const result = await orchestrator.run({
      prompt: 'What does sequences workspace do?',
      forceDraftTool: true,
      onEvent: (event) => events.push(event),
      context: { labwares: [], eventSummary: 'No events yet.', vocabPackId: 'liquid-handling/v1', availableVerbs: ['transfer'] },
    });
    const textDeltas = events.filter((e) => e.type === 'text_delta');
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].delta).toBe(answerPayload);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(client.completeStream).toHaveBeenCalledTimes(1);
    const agentActions = events.filter((e) => e.type === 'agent_action' || e.type === 'agent_action_proposal');
    expect(agentActions).toHaveLength(0);
    const toolResultIdx = events.findIndex((e) => e.type === 'tool_result');
    const textDeltaIdx = events.findIndex((e) => e.type === 'text_delta');
    expect(toolResultIdx).toBeGreaterThan(-1);
    expect(textDeltaIdx).toBeGreaterThan(-1);
    expect(toolResultIdx).toBeLessThan(textDeltaIdx);
    expect(result.success).toBe(true);
  });

  it('emits text_delta for non-empty text and no text_delta for empty text (parser fail-closed contract)', async () => {
    const store = mutationTripwire();

    // Non-empty text: single-char proves no trim/transform
    {
      const { client } = intentClient({ intent: 'answer', text: 'x' });
      const events: AgentEvent[] = [];
      const orchestrator = createAgentOrchestrator(
        client,
        { getToolDefinitions: () => [], executeTool: vi.fn() },
        { model: 'test-model', temperature: 0.1, maxTokens: 512 },
        { maxTurns: 2, draftFlowMode: 'preflight-llm' },
        { store: store as never },
      );
      await orchestrator.run({
        prompt: 'Q?',
        forceDraftTool: true,
        onEvent: (event) => events.push(event),
        context: { labwares: [], eventSummary: '', vocabPackId: 'v1', availableVerbs: [] },
      });
      const textDeltas = events.filter((e) => e.type === 'text_delta');
      expect(textDeltas).toHaveLength(1);
      expect(textDeltas[0].delta).toBe('x');
    }

    // Empty text: parser fail-closed -> unknown -> no text_delta
    {
      const { client } = intentClient({ intent: 'answer', text: '' });
      const events: AgentEvent[] = [];
      const orchestrator = createAgentOrchestrator(
        client,
        { getToolDefinitions: () => [], executeTool: vi.fn() },
        { model: 'test-model', temperature: 0.1, maxTokens: 512 },
        { maxTurns: 2, draftFlowMode: 'preflight-llm' },
        { store: store as never },
      );
      await orchestrator.run({
        prompt: 'Q?',
        forceDraftTool: true,
        onEvent: (event) => events.push(event),
        context: { labwares: [], eventSummary: '', vocabPackId: 'v1', availableVerbs: [] },
      });
      const textDeltas = events.filter((e) => e.type === 'text_delta');
      expect(textDeltas).toHaveLength(0);
    }
  });
});
