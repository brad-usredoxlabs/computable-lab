// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { recoverDraftArgsFromContent } from './AgentOrchestrator.js';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, InferenceClient, ToolBridge, RecordStore, CompletionRequest, RecordEnvelope, RecordFilter } from './types.js';

describe('recoverDraftArgsFromContent', () => {
  it('a <tool_call>{…} content string yields args non-null and recoveredFrom.driver === "tool-envelope"', () => {
    const content = '<tool_call>\n{"name":"compile_event_graph_draft","arguments":{"events":[{"verb":"add_material"}]}}\n</tool_call>';
    const result = recoverDraftArgsFromContent(content);
    expect(result.args).not.toBeNull();
    expect(result.recoveredFrom).not.toBeNull();
    expect(result.recoveredFrom!.driver).toBe('tool-envelope');
  });

  it('a bare fenced json block yields driver === "fenced-json"', () => {
    const content = '```json\n{"labwareRequirements":[{"classCurie":"CL:96_well_plate"}]}\n```';
    const result = recoverDraftArgsFromContent(content);
    expect(result.args).not.toBeNull();
    expect(result.recoveredFrom).not.toBeNull();
    expect(result.recoveredFrom!.driver).toBe('fenced-json');
  });

  it('plain prose with no candidate yields args === null and recoveredFrom === null', () => {
    const content = 'The intentId was mentioned but there is no JSON here.';
    const result = recoverDraftArgsFromContent(content);
    expect(result.args).toBeNull();
    expect(result.recoveredFrom).toBeNull();
  });

  it('wrapper spread pattern: recovery present adds recoveredFrom, absent does not', () => {
    const toolEnvelopeContent = '<tool_call>{"name":"compile_event_graph_draft","arguments":{"events":[{}]}}</tool_call>';
    const toolResult = recoverDraftArgsFromContent(toolEnvelopeContent);
    expect(toolResult.recoveredFrom).not.toBeNull();
    expect(toolResult.recoveredFrom!.driver).toBe('tool-envelope');

    const fencedJsonContent = '```json\n{"events":[{}]}\n```';
    const fencedResult = recoverDraftArgsFromContent(fencedJsonContent);
    expect(fencedResult.recoveredFrom).not.toBeNull();
    expect(fencedResult.recoveredFrom!.driver).toBe('fenced-json');

    const plainProse = 'This is just text with no JSON.';
    const proseResult = recoverDraftArgsFromContent(plainProse);
    expect(proseResult.args).toBeNull();
    expect(proseResult.recoveredFrom).toBeNull();
  });
});

describe('C2 call-site wiring — orchestrator run path', () => {
  function stubModel(responses: Array<{ content?: string; toolCalls?: Array<{ name: string; args: Record<string, unknown> }> }>) {
    let call = 0;
    const captured: CompletionRequest[] = [];
    const completeStream = vi.fn(async function* (request: CompletionRequest) {
      captured.push(request);
      const spec = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      const delta: Record<string, unknown> = { role: 'assistant' };
      if (typeof spec.content === 'string') delta.content = spec.content;
      if (Array.isArray(spec.toolCalls)) {
        delta.tool_calls = spec.toolCalls.map((tc, i) => ({
          index: i,
          id: `call-${call}-${i}`,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }));
      }
      const chunk = {
        id: `resp-${call}`,
        choices: [{
          index: 0,
          delta,
          finish_reason: Array.isArray(spec.toolCalls) ? 'tool_calls' : 'stop',
        }],
      };
      yield chunk as any;
    });
    return {
      client: { complete: vi.fn(), completeStream } as InferenceClient,
      captured,
      callCount: () => completeStream.mock.calls.length,
    };
  }

  function stubStore(): RecordStore {
    return {
      list: vi.fn(async (_filter?: RecordFilter) => [] as RecordEnvelope[]),
    } as unknown as RecordStore;
  }

  const toolBridge: ToolBridge = {
    getToolDefinitions: () => [],
    executeTool: vi.fn(async () => ({ success: true, content: '{}', durationMs: 1 })),
  };

  const baseContext = {
    labwares: [],
    eventSummary: 'No events yet.',
    vocabPackId: 'liquid-handling/v1',
    availableVerbs: ['transfer'],
    runId: 'test-run',
  };

  it('prose with fenced JSON on forced-draft turn: status event carries recoveredFrom and result notes include recoveredFrom driver', async () => {
    const fencedContent = '```json\n{"intent":"event_graph","events":[{"event_type":"add_material","details":{"well":"A1","volumeUl":100}}]}\n```';
    const model = stubModel([{ content: fencedContent }]);
    const events: AgentEvent[] = [];

    const orchestrator = createAgentOrchestrator(
      model.client,
      toolBridge,
      { baseUrl: 'http://fake', model: 'test-model', temperature: 0, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'forced-tool' },
      { store: stubStore() },
    );

    const result = await orchestrator.run({
      prompt: 'add material to A1',
      surface: 'protocol-builder',
      forceDraftTool: true,
      context: baseContext,
      onEvent: (e) => events.push(e),
    });

    const recoveryEvents = events.filter(
      (e): e is Extract<AgentEvent, { type: 'status' }> =>
        e.type === 'status' && e.message.includes("Parsed the draft from the model's text"),
    );
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0]!.recoveredFrom?.driver).toBe('fenced-json');

    expect(result.notes).toBeDefined();
    expect(result.notes!.some((n: string) => n.includes('recoveredFrom'))).toBe(true);

    expect(model.callCount()).toBe(1);
  });

  it('prose with tool-envelope on forced-draft turn: status event carries recoveredFrom with driver "tool-envelope"', async () => {
    const toolEnvelopeContent = '<tool_call>{"intent":"event_graph","events":[{"event_type":"add_material","details":{"well":"A1","volumeUl":100}}]}</tool_call>';
    const model = stubModel([{ content: toolEnvelopeContent }]);
    const events: AgentEvent[] = [];

    const orchestrator = createAgentOrchestrator(
      model.client,
      toolBridge,
      { baseUrl: 'http://fake', model: 'test-model', temperature: 0, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'forced-tool' },
      { store: stubStore() },
    );

    const result = await orchestrator.run({
      prompt: 'add material to A1',
      surface: 'protocol-builder',
      forceDraftTool: true,
      context: baseContext,
      onEvent: (e) => events.push(e),
    });

    const recoveryEvents = events.filter(
      (e): e is Extract<AgentEvent, { type: 'status' }> =>
        e.type === 'status' && e.message.includes("Parsed the draft from the model's text"),
    );
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0]!.recoveredFrom?.driver).toBe('tool-envelope');

    expect(result.notes).toBeDefined();
    expect(result.notes!.some((n: string) => n.includes('recoveredFrom'))).toBe(true);

    expect(model.callCount()).toBe(1);
  });

  it('native tool call on forced-draft turn: NO recoveredFrom in status events', async () => {
    const model = stubModel([{
      toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_graph', events: [{ event_type: 'add_material', details: { well: 'A1' } }] } }],
    }]);
    const events: any[] = [];

    const orchestrator = createAgentOrchestrator(
      model.client,
      toolBridge,
      { baseUrl: 'http://fake', model: 'test-model', temperature: 0, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'forced-tool' },
      { store: stubStore() },
    );

    const result = await orchestrator.run({
      prompt: 'add material to A1',
      surface: 'protocol-builder',
      forceDraftTool: true,
      context: baseContext,
      onEvent: (e) => events.push(e),
    });

    const recoveryStatus = events.find(
      (e) => e.type === 'status' && e.message.includes("Parsed the draft from the model's text"),
    );
    expect(recoveryStatus).toBeUndefined();

    const eventsWithRecoveredFrom = events.filter(
      (e) => e.type === 'status' && e.recoveredFrom !== undefined,
    );
    expect(eventsWithRecoveredFrom).toHaveLength(0);

    // Negative control on the notes half too: no recovery, no marker in notes
    // (an absent notes array is equally "no marker" — no guard that skips).
    expect((result.notes ?? []).some((n: string) => n.includes('recoveredFrom'))).toBe(false);
  });
});
