import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { CompletionRequest, InferenceClient, ToolBridge, AgentEvent } from './types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';
import { COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME } from './submitSuggestionTool.js';

describe('createAgentOrchestrator', () => {
  it('includes prior user and assistant turns before the current prompt', async () => {
    let capturedMessages: CompletionRequest['messages'] = [];
    const completeStream = vi.fn(async function* (request: CompletionRequest) {
      capturedMessages = request.messages.map((message) => ({
        ...message,
        ...(message.tool_calls ? { tool_calls: [...message.tool_calls] } : {}),
      }));
      yield {
        id: 'resp-1',
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: '{"events":[],"notes":[]}' },
          finish_reason: 'stop',
        }],
      };
    });

    const inferenceClient: InferenceClient = {
      complete: vi.fn(),
      completeStream,
    };
    const toolBridge: ToolBridge = {
      getToolDefinitions: () => [],
      executeTool: vi.fn(),
    };
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
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

    expect(completeStream).toHaveBeenCalledTimes(1);
    expect(capturedMessages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
      {
        role: 'system',
        // History is replayed as raw turns below, never summarized into the
        // system prompt — the prefix must stay byte-stable for KV-cache reuse.
        content: expect.not.stringContaining('Recent conversation context:'),
      },
      { role: 'user', content: 'Transfer 10 uL of clofibrate to B2.' },
      { role: 'assistant', content: 'Which source well contains clofibrate?' },
      { role: 'user', content: 'Yes, reservoir A1.' },
    ]);
  });


  it('forces the event-editor fallback LLM call to use compile_event_graph_draft', async () => {
    const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{
        severity: 'error',
        code: 'CONFIG_MISSING',
        message: 'extractor profile missing or disabled',
        pass_id: 'extract_entities',
      }],
      terminalArtifacts: {
        events: [],
        directives: [],
        gaps: [],
      },
      outcome: 'error',
    });

    let capturedRequest: CompletionRequest | null = null;
    const completeStream = vi.fn(async function* (request: CompletionRequest) {
      capturedRequest = request;
      yield {
        id: 'resp-compile-tool',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call-1',
              type: 'function',
              function: {
                name: COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME,
                arguments: JSON.stringify({
                  clarification: {
                    prompt: 'Which wells should I use?',
                    entityType: 'well_selection',
                    options: [{ id: 'all', label: 'All wells' }],
                  },
                }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };
    });

    const events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator(
      { complete: vi.fn(), completeStream },
      { getToolDefinitions: () => [{ type: 'function', function: { name: 'search_records', description: 'search', parameters: {} } }], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    );

    await orchestrator.run({
      prompt: 'Draft a plate setup.',
      forceDraftTool: true,
      onEvent: (event) => events.push(event),
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['transfer'],
      },
    });

    expect(capturedRequest?.tool_choice).toEqual({
      type: 'function',
      function: { name: COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME },
    });
    expect(capturedRequest?.tools?.map((tool) => tool.function.name)).toEqual([COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME]);
    expect(compileSpy).not.toHaveBeenCalled();
    expect(events).toContainEqual({
      type: 'status',
      message: `Skipping compiler preflight; asking AI to call ${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME} directly…`,
    });
    expect(events.some((event) => event.type === 'tool_call' && event.toolName === COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME)).toBe(true);
  });


  it('coerces compiler draft JSON when the model ignores forced tool_choice', async () => {
    const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{
        severity: 'error',
        code: 'CONFIG_MISSING',
        message: 'extractor profile missing or disabled',
        pass_id: 'extract_entities',
      }],
      terminalArtifacts: {
        events: [],
        directives: [],
        gaps: [],
      },
      outcome: 'error',
    });

    const completeStream = vi.fn(async function* () {
      yield {
        id: 'resp-no-tool',
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: 'stop',
        }],
      };
    });
    const complete = vi.fn(async () => ({
      id: 'resp-json-args',
      choices: [{
        index: 0,
        message: {
          role: 'assistant' as const,
          content: JSON.stringify({
            labwareAdditions: [{
              recordId: 'opentrons/nest_96_wellplate_200ul_flat@v1',
              deckSlot: 'B2',
              reason: '96-well plate requested',
            }],
          }),
        },
        finish_reason: 'stop' as const,
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));

    const events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator(
      { complete, completeStream },
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    );

    const result = await orchestrator.run({
      prompt: 'place a 96 well plate in slot B2',
      forceDraftTool: true,
      onEvent: (event) => events.push(event),
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['transfer'],
      },
    });

    expect(compileSpy).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      type: 'status',
      message: `${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME} was not emitted natively; asking AI for compiler arguments…`,
    });
    expect(events.some((event) => event.type === 'tool_call' && event.toolName === COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME)).toBe(true);
    expect(result.success).toBe(true);
    expect(result.labwareAdditions?.[0]?.deckSlot).toBe('B2');
  });

  it('keeps structured material refs when compiler preflight strips grounded materials', async () => {
    const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [
        {
          eventId: 'compiled-cells',
          event_type: 'add_material',
          details: {
            labwareId: 'lbw-seed-plate-96-flat',
            wells: ['A6', 'B6', 'C6', 'D6', 'E6', 'F6', 'G6', 'H6'],
            count: 10000,
            note: '10,000 cells per well',
          },
        },
        {
          eventId: 'compiled-media',
          event_type: 'add_material',
          details: {
            labwareId: 'lbw-seed-plate-96-flat',
            wells: ['A6', 'B6', 'C6', 'D6', 'E6', 'F6', 'G6', 'H6'],
            volume: { value: 200, unit: 'uL' },
            note: '200 uL of DMEM + 10% FBS per well',
          },
        },
      ],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [],
      terminalArtifacts: {
        events: [
          {
            eventId: 'compiled-cells',
            event_type: 'add_material',
            details: {
              labwareId: 'lbw-seed-plate-96-flat',
              wells: ['A6', 'B6', 'C6', 'D6', 'E6', 'F6', 'G6', 'H6'],
              count: 10000,
              note: '10,000 cells per well',
            },
          },
          {
            eventId: 'compiled-media',
            event_type: 'add_material',
            details: {
              labwareId: 'lbw-seed-plate-96-flat',
              wells: ['A6', 'B6', 'C6', 'D6', 'E6', 'F6', 'G6', 'H6'],
              volume: { value: 200, unit: 'uL' },
              note: '200 uL of DMEM + 10% FBS per well',
            },
          },
        ],
        directives: [],
        gaps: [],
      },
      outcome: 'complete',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const label = url.includes('mesh%3AD056945') || url.includes('mesh:D056945')
        ? 'Hep G2 Cells'
        : url.includes('XCO%3A0000988') || url.includes('XCO:0000988')
          ? "Dulbecco's Modified Eagle's Medium"
          : url.includes('MSIO%3A0000017') || url.includes('MSIO:0000017')
            ? 'fetal bovine serum'
            : 'unknown material';
      return {
        ok: true,
        json: async () => ({ _embedded: { terms: [{ label }] } }),
      } as unknown as Response;
    });

    const completeStream = vi.fn(async function* () {
      yield {
        id: 'resp-materials',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call-materials',
              type: 'function',
              function: {
                name: COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME,
                arguments: JSON.stringify({
                  events: [{
                    eventId: 'ai-evt-001',
                    event_type: 'add_material',
                    verb: 'add',
                    vocabPackId: 'general',
                    details: {
                      labwareId: 'lbw-seed-plate-96-flat',
                      wells: ['A6', 'B6', 'C6', 'D6', 'E6', 'F6', 'G6', 'H6'],
                      count: 10000,
                      volume: { value: 200, unit: 'uL' },
                      note: 'Adding Hep G2 cells and media (DMEM + 10% FBS) to wells A6-H6.',
                    },
                    materials: [
                      { ref: { curie: 'mesh:D056945' }, role: 'cells', count: 10000 },
                      { ref: { curie: 'XCO:0000988' }, role: 'solvent', concentration: { value: 90, unit: 'percent' } },
                      { ref: { curie: 'MSIO:0000017' }, role: 'additive', concentration: { value: 10, unit: 'percent' } },
                    ],
                  }],
                  notes: ["Resolved 'seed plate 96 flat' to lbw-seed-plate-96-flat."],
                  unresolvedRefs: [],
                  clarification: null,
                  labwareAdditions: [],
                }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };
    });

    const orchestrator = createAgentOrchestrator(
      { complete: vi.fn(), completeStream },
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    );

    const result = await orchestrator.run({
      prompt: 'add cells and media',
      forceDraftTool: true,
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['add_material'],
      },
    });

    expect(compileSpy).toHaveBeenCalled();
    expect(result.events).toHaveLength(2);
    const cellDetails = result.events![0]!.details as Record<string, unknown>;
    const mediaDetails = result.events![1]!.details as Record<string, unknown>;
    expect(cellDetails.material_ref).toMatchObject({ id: 'mesh:D056945', label: 'Hep G2 Cells' });
    expect(cellDetails.count).toBe(10000);
    expect(cellDetails.volume).toBeUndefined();
    expect(mediaDetails.material_ref).toMatchObject({ id: 'XCO:0000988', label: "Dulbecco's Modified Eagle's Medium" });
    expect(mediaDetails.composition_snapshot).toEqual([
      expect.objectContaining({ role: 'buffer_component', component_ref: expect.objectContaining({ id: 'XCO:0000988' }) }),
      expect.objectContaining({
        role: 'additive',
        component_ref: expect.objectContaining({ id: 'MSIO:0000017' }),
        concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' },
      }),
    ]);
    expect(result.notes).toContain('Compiler preflight dropped material refs/composition; showing the validated structured proposal.');

    fetchSpy.mockRestore();
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
        { maxTurns: 2, draftFlowMode: 'preflight-llm' },
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
        { maxTurns: 2, draftFlowMode: 'preflight-llm' },
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
        { maxTurns: 2, draftFlowMode: 'preflight-llm' },
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

    it('does not short-circuit a complete compiler result with no artifacts', async () => {
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
        outcome: 'complete',
      });

      const inferenceClient: InferenceClient = {
        complete: vi.fn(),
        completeStream: vi.fn(async function* () {
          yield {
            id: 'resp-1',
            choices: [{
              index: 0,
              delta: { role: 'assistant', content: '{"events":[],"notes":["fallback"]}' },
              finish_reason: 'stop',
            }],
          };
        }),
      };
      const toolBridge: ToolBridge = {
        getToolDefinitions: () => [],
        executeTool: vi.fn(),
      };
      const orchestrator = createAgentOrchestrator(
        inferenceClient,
        toolBridge,
        { model: 'test-model', temperature: 0.1, maxTokens: 512 },
        { maxTurns: 2, draftFlowMode: 'preflight-llm' },
      );

      const result = await orchestrator.run({
        prompt: 'Transfer 10 uL from A1 to B1.',
        onEvent,
        context: {
          labwares: [],
          eventSummary: 'No events yet.',
          vocabPackId: 'liquid-handling/v1',
          availableVerbs: ['transfer'],
        },
      });

      expect(inferenceClient.completeStream).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.notes).toEqual(['fallback']);
      const diagEvents = events.filter(e => e.type === 'pipeline_diagnostics');
      expect(diagEvents).toHaveLength(1);
      expect(diagEvents[0]!.outcome).toBe('complete');
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
        { maxTurns: 2, draftFlowMode: 'preflight-llm' },
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
