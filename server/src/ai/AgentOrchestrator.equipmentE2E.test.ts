/**
 * End-to-end (server half) for the reported failure: with a forced draft tool the
 * model asks for bench equipment, and the orchestrator carries it out as
 * `equipmentRequirements` on the AgentResult — the field the client turns into
 * ghosted bench equipment. Before this, the model had no field to use and
 * refused in prose ("I don't have a way to place equipment on the canvas").
 *
 * Plan: 2026-09-19_130430-deck-equipment-via-agent.md, Phase 6.
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

describe('AgentOrchestrator — equipment through the forced draft tool', () => {
  it('carries the model\'s equipmentRequirements onto the AgentResult', async () => {
    // The compiler preflight has no config in this harness; force the LLM path.
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{ severity: 'error', code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'error',
    });

    const completeStream = vi.fn(async function* (_request: CompletionRequest) {
      yield {
        id: 'resp-equipment',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call-eq',
              type: 'function',
              function: {
                name: AGENT_INTENT_TOOL_NAME,
                arguments: JSON.stringify({
                  intent: 'event_graph',
                  notes: ['Placed the two water baths on the bench.'],
                  equipmentRequirements: [
                    { classCurie: 'equipment:water_bath', handle: 'bath 55', settings: { temperature_c: 55 } },
                    { classCurie: 'equipment:water_bath', handle: 'bath 70', settings: { temperature_c: 70 } },
                  ],
                }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };
    });

    const events: AgentEvent[] = [];
    const inferenceClient: InferenceClient = { complete: vi.fn(), completeStream };
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    );

    const result = await orchestrator.run({
      prompt: 'add the water baths to the deck',
      forceDraftTool: true,
      onEvent: (event) => events.push(event),
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['transfer'],
      },
    });

    expect(result.equipmentRequirements).toEqual([
      { classCurie: 'equipment:water_bath', handle: 'bath 55', settings: { temperature_c: 55 } },
      { classCurie: 'equipment:water_bath', handle: 'bath 70', settings: { temperature_c: 70 } },
    ]);
    // Equipment never masquerades as labware on the way out.
    expect(result.labwareRequirements ?? []).toEqual([]);
    expect(result.labwareAdditions ?? []).toEqual([]);
  });
});
