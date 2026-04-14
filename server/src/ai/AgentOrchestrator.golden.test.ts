/**
 * Golden end-to-end test for AgentOrchestrator with auto-create labware.
 * 
 * This test verifies that the compiler bypass path works correctly when:
 * - A material-spec mention is resolved
 * - A labware hint is resolved via searchLabwareByHint
 * - The inference client is never called
 * 
 * Prompt: 'Add 100uL of [[material-spec:MSP-MMIITWMZ-93SU5Y|Clofibrate, 1 mM in DMSO]] to well A1 of a 12-well reservoir and add it to the source location.'
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { InferenceClient, ToolBridge, ResolveMentionDeps } from './types.js';

describe('AgentOrchestrator - golden test for auto-create labware', () => {
  it('should bypass LLM and compile events when labware hint resolves via searchLabwareByHint', async () => {
    // Fake InferenceClient that throws if called
    const inferenceClient: InferenceClient = {
      complete: vi.fn().mockRejectedValue(new Error('Should not be called')),
      completeStream: vi.fn().mockRejectedValue(new Error('Should not be called')),
    };

    // Stub tool bridge with no tools
    const toolBridge: ToolBridge = {
      getToolDefinitions: () => [],
      executeTool: vi.fn().mockRejectedValue(new Error('No tools available')),
    };

    // Stub deps with fetchMaterialSpec and searchLabwareByHint
    const deps: ResolveMentionDeps = {
      fetchMaterialSpec: async (id: string) => {
        if (id === 'MSP-MMIITWMZ-93SU5Y') {
          return { id: 'MSP-MMIITWMZ-93SU5Y', name: 'Clofibrate, 1 mM in DMSO' };
        }
        return null;
      },
      searchLabwareByHint: async (hint: string) => [
        { recordId: 'lbw-12-well-reservoir-seed', title: 'NEST 12 Well Reservoir 15 mL' },
      ],
    };

    // Create orchestrator
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      { baseUrl: 'http://fake', model: 'fake-model' },
      {},
      deps,
    );

    // The golden prompt
    const prompt = 'Add 100uL of [[material-spec:MSP-MMIITWMZ-93SU5Y|Clofibrate, 1 mM in DMSO]] to well A1 of a 12-well reservoir and add it to the source location.';

    const result = await orchestrator.run({
      prompt,
      context: {
        labwares: [],
        eventSummary: '',
        vocabPackId: 'default',
        availableVerbs: [],
      },
    });

    // Assert success
    expect(result.success).toBe(true);

    // Assert exactly one event
    expect(result.events).toHaveLength(1);
    const event = result.events![0]!;

    // Assert event type
    expect(event.event_type).toBe('add_material');

    // Assert wells
    expect(event.details.wells).toEqual(['A1']);

    // Assert volume
    expect(event.details.volume).toEqual({ value: 100, unit: 'uL' });

    // Assert material spec ref
    expect(event.details.material_spec_ref).toBe('MSP-MMIITWMZ-93SU5Y');

    // Assert labwareId starts with synthetic prefix
    expect(event.details.labwareId).toMatch(/^lwi-compiler-/);

    // Assert labwareAdditions
    expect(result.labwareAdditions).toHaveLength(1);
    expect(result.labwareAdditions![0]!.recordId).toBe('lbw-12-well-reservoir-seed');

    // Assert notes mention set_source_location
    expect(result.notes).toBeDefined();
    expect(result.notes!.some((n) => n.includes('set_source_location'))).toBe(true);

    // Assert inference client was never called
    expect(inferenceClient.completeStream).not.toHaveBeenCalled();
    expect(inferenceClient.complete).not.toHaveBeenCalled();
  });
});
