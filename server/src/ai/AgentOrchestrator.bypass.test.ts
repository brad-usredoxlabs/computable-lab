/**
 * Integration test for compiler bypass in AgentOrchestrator.
 *
 * This test verifies that when all slots are filled and labware is a concrete
 * instance, the orchestrator returns immediately without calling the LLM.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { InferenceClient, ToolBridge, ResolveMentionDeps } from './types.js';
import type { AgentConfig, InferenceConfig } from './config/types.js';

describe('AgentOrchestrator compiler bypass', () => {
  it('should bypass LLM when all slots are filled with labware instance', async () => {
    // Create an InferenceClient that throws if called
    const inferenceClient: InferenceClient = {
      complete: vi.fn().mockRejectedValue(new Error('complete should not be called')),
      completeStream: vi.fn().mockImplementation(async function* () {
        throw new Error('inference should not be called');
      }),
    };

    // Create a ToolBridge with empty tool set
    const toolBridge: ToolBridge = {
      getToolDefinitions: vi.fn().mockReturnValue([]),
      executeTool: vi.fn().mockRejectedValue(new Error('executeTool should not be called')),
    };

    // Create deps with fetchMaterialSpec returning a stub
    const deps: ResolveMentionDeps = {
      fetchMaterialSpec: vi.fn().mockResolvedValue({
        id: 'MSP-X',
        name: 'Clofibrate 1mM',
        concentration: { value: 1, unit: 'mM' },
      }),
      fetchLabware: vi.fn().mockResolvedValue({
        id: 'LBW-1',
        name: 'Plate 1',
        labwareType: 'plate-96',
      }),
    };

    // Configs
    const inferenceConfig: InferenceConfig = {
      model: 'test-model',
      temperature: 0.1,
      maxTokens: 4096,
    };

    const agentConfig: AgentConfig = {
      maxTurns: 15,
      maxToolCallsPerTurn: 5,
      systemPromptPath: 'default',
    };

    // Build orchestrator
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      inferenceConfig,
      agentConfig,
      deps,
    );

    // Run with a prompt that should trigger the bypass
    // This prompt has:
    // - verb: "add" -> add_material
    // - volume: 100uL
    // - wells: A1
    // - material: [[material-spec:MSP-X|Clofibrate]]
    // - labware: [[labware:LBW-1|Plate 1]] (resolved as instance)
    const result = await orchestrator.run({
      prompt: 'Add 100uL of [[material-spec:MSP-X|Clofibrate]] to A1 of [[labware:LBW-1|Plate 1]]',
      surface: 'default',
      context: {
        labwares: [],
        eventSummary: { totalEvents: 0, recentEvents: [] },
        vocabPackId: 'default',
        availableVerbs: [],
      },
    });

    // Verify success
    expect(result.success).toBe(true);
    
    // Verify events
    expect(result.events).toBeDefined();
    expect(result.events!.length).toBe(1);
    
    const event = result.events![0];
    expect(event.event_type).toBe('add_material');
    expect(event.details.labwareId).toBe('LBW-1');
    expect(event.details.wells).toEqual(['A1']);
    expect(event.details.volume).toEqual({ value: 100, unit: 'uL' });
    expect(event.details.material_spec_ref).toBe('MSP-X');
    
    // Verify notes
    expect(result.notes).toBeDefined();
    expect(result.notes!.length).toBeGreaterThan(0);
    
    // Verify usage shows bypass (no tokens, no turns)
    expect(result.usage?.turns).toBe(0);
    expect(result.usage?.toolCalls).toBe(0);
    expect(result.usage?.promptTokens).toBe(0);
    expect(result.usage?.completionTokens).toBe(0);
    
    // Verify inference client was never called
    expect(inferenceClient.completeStream).not.toHaveBeenCalled();
    expect(inferenceClient.complete).not.toHaveBeenCalled();
  });

  it('should NOT bypass when labware is a definition', async () => {
    // Create an InferenceClient that throws if called
    const inferenceClient: InferenceClient = {
      complete: vi.fn().mockRejectedValue(new Error('complete should not be called')),
      completeStream: vi.fn().mockImplementation(async function* () {
        throw new Error('inference should not be called');
      }),
    };

    // Create a ToolBridge with empty tool set
    const toolBridge: ToolBridge = {
      getToolDefinitions: vi.fn().mockReturnValue([]),
      executeTool: vi.fn().mockRejectedValue(new Error('executeTool should not be called')),
    };

    // Create deps - labware returns a definition (starts with 'def:')
    const deps: ResolveMentionDeps = {
      fetchMaterialSpec: vi.fn().mockResolvedValue({
        id: 'MSP-X',
        name: 'Clofibrate 1mM',
      }),
      fetchLabware: vi.fn().mockResolvedValue({
        id: 'def:plate-96',
        name: '96-well plate',
        labwareType: 'plate-96',
      }),
    };

    const inferenceConfig: InferenceConfig = {
      model: 'test-model',
      temperature: 0.1,
      maxTokens: 4096,
    };

    const agentConfig: AgentConfig = {
      maxTurns: 15,
      maxToolCallsPerTurn: 5,
      systemPromptPath: 'default',
    };

    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      inferenceConfig,
      agentConfig,
      deps,
    );

    // This prompt has labware as a definition, so it should NOT bypass
    // The orchestrator will try to call the LLM, which will throw and be caught
    const result = await orchestrator.run({
      prompt: 'Add 100uL of [[material-spec:MSP-X|Clofibrate]] to A1 of [[labware:def:plate-96|96-well plate]]',
      surface: 'default',
      context: {
        labwares: [],
        eventSummary: { totalEvents: 0, recentEvents: [] },
        vocabPackId: 'default',
        availableVerbs: [],
      },
    });

    // Verify that the orchestrator did NOT bypass (bypass should be null)
    // and that it tried to call the LLM (which threw an error)
    expect(result.success).toBe(false);
    expect(result.error).toContain('inference should not be called');
    
    // Verify the inference client was called (it threw an error)
    expect(inferenceClient.completeStream).toHaveBeenCalled();
  });
});
