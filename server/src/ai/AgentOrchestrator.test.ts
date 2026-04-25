import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { CompletionRequest, CompletionResponse, InferenceClient, ToolBridge, AgentEvent } from './types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

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

  // -----------------------------------------------------------------------
  // spec-020: pipeline_diagnostics emit on fall-through
  // -----------------------------------------------------------------------

  describe('pipeline_diagnostics emit (spec-020)', () => {
    const makeDiagnostics = (
      passId: string,
      code: string,
      severity: 'info' | 'warning' | 'error',
      message: string,
    ) => ({
      severity,
      code,
      message,
      pass_id: passId,
      details: { extra: 'sensitive' },
    });

    it('emits pipeline_diagnostics exactly once on fall-through with at most 6 diagnostics', async () => {
      const events: AgentEvent[] = [];
      const onEvent = vi.fn((e: AgentEvent) => events.push(e));

      // 8 diagnostics: 3 error, 3 warning, 2 info
      const diagnostics = [
        makeDiagnostics('extract_entities', 'extract_ok', 'info', 'Extracted 5 entities'),
        makeDiagnostics('ai_precompile', 'ai_precompile_parse_error', 'error', 'Failed to parse precompile output'),
        makeDiagnostics('ai_precompile', 'ai_precompile_timeout', 'warning', 'Precompile timed out'),
        makeDiagnostics('expand_biology_verbs', 'ambiguous_verb', 'warning', 'Ambiguous verb: deposit'),
        makeDiagnostics('resolve_labware', 'ambiguous_labware_hint', 'warning', 'Multiple labware matched'),
        makeDiagnostics('validate', 'validation_error', 'error', 'Volume exceeds well capacity'),
        makeDiagnostics('mint_materials', 'material_not_found', 'error', 'Material XYZ not found'),
        makeDiagnostics('compute_volumes', 'info_volume', 'info', 'Volume computed'),
      ];

      vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
        events: [],
        labwareAdditions: [],
        unresolvedRefs: [],
        diagnostics,
        terminalArtifacts: {
          events: [],
          directives: [],
          gaps: [],
        },
        outcome: 'error',
      });

      const inferenceClient: InferenceClient = {
        complete: vi.fn(),
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
        prompt: 'Transfer 10 uL.',
        onEvent,
        context: {
          labwares: [],
          eventSummary: 'No events yet.',
          vocabPackId: 'liquid-handling/v1',
          availableVerbs: ['transfer'],
        },
      });

      // Exactly one pipeline_diagnostics event
      const diagEvents = events.filter(e => e.type === 'pipeline_diagnostics');
      expect(diagEvents).toHaveLength(1);

      const diagEvent = diagEvents[0]!;
      expect(diagEvent.type).toBe('pipeline_diagnostics');
      expect(diagEvent.outcome).toBe('error');
      // Only error + warning, capped at 6 (8 total → 6)
      expect(diagEvent.diagnostics.length).toBeLessThanOrEqual(6);
      expect(diagEvent.diagnostics.length).toBe(6); // 3 error + 3 warning = 6
      // No info entries
      for (const d of diagEvent.diagnostics) {
        expect(d.severity).not.toBe('info');
      }
      // No details field
      for (const d of diagEvent.diagnostics) {
        expect(d).not.toHaveProperty('details');
      }
    });

    it('emits pipeline_diagnostics with empty array when all diagnostics are info', async () => {
      const events: AgentEvent[] = [];
      const onEvent = vi.fn((e: AgentEvent) => events.push(e));

      vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
        events: [],
        labwareAdditions: [],
        unresolvedRefs: [],
        diagnostics: [
          makeDiagnostics('extract_entities', 'extract_ok', 'info', 'Extracted 5 entities'),
          makeDiagnostics('ai_precompile', 'ai_plan_ok', 'info', 'Plan generated'),
        ],
        terminalArtifacts: {
          events: [],
          directives: [],
          gaps: [],
        },
        outcome: 'error',
      });

      const inferenceClient: InferenceClient = {
        complete: vi.fn(),
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
        prompt: 'Transfer 10 uL.',
        onEvent,
        context: {
          labwares: [],
          eventSummary: 'No events yet.',
          vocabPackId: 'liquid-handling/v1',
          availableVerbs: ['transfer'],
        },
      });

      const diagEvents = events.filter(e => e.type === 'pipeline_diagnostics');
      expect(diagEvents).toHaveLength(1);
      expect(diagEvents[0]!.diagnostics).toHaveLength(0);
    });

    it('does NOT emit pipeline_diagnostics when pipeline succeeds', async () => {
      const events: AgentEvent[] = [];
      const onEvent = vi.fn((e: AgentEvent) => events.push(e));

      vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
        events: [
          {
            eventId: 'evt-1',
            event_type: 'transfer',
            details: { source: 'A1', target: 'B1' },
          },
        ],
        labwareAdditions: [],
        unresolvedRefs: [],
        diagnostics: [],
        terminalArtifacts: {
          events: [
            {
              eventId: 'evt-1',
              event_type: 'transfer',
              details: { source: 'A1', target: 'B1' },
            },
          ],
          directives: [],
          gaps: [],
        },
        outcome: 'complete',
      });

      const inferenceClient: InferenceClient = {
        complete: vi.fn(),
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
        prompt: 'Transfer 10 uL from A1 to B1.',
        onEvent,
        context: {
          labwares: [],
          eventSummary: 'No events yet.',
          vocabPackId: 'liquid-handling/v1',
          availableVerbs: ['transfer'],
        },
      });

      const diagEvents = events.filter(e => e.type === 'pipeline_diagnostics');
      expect(diagEvents).toHaveLength(0);
    });

    it('handles undefined diagnostics gracefully', async () => {
      const events: AgentEvent[] = [];
      const onEvent = vi.fn((e: AgentEvent) => events.push(e));

      vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
        events: [],
        labwareAdditions: [],
        unresolvedRefs: [],
        diagnostics: [],
        terminalArtifacts: {
          events: [],
          directives: [],
          gaps: [],
        },
        outcome: 'error',
      });

      const inferenceClient: InferenceClient = {
        complete: vi.fn(),
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
        prompt: 'Transfer 10 uL.',
        onEvent,
        context: {
          labwares: [],
          eventSummary: 'No events yet.',
          vocabPackId: 'liquid-handling/v1',
          availableVerbs: ['transfer'],
        },
      });

      const diagEvents = events.filter(e => e.type === 'pipeline_diagnostics');
      expect(diagEvents).toHaveLength(1);
      expect(diagEvents[0]!.diagnostics).toHaveLength(0);
    });
  });
});
