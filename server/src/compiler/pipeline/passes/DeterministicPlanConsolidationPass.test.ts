import { describe, expect, it } from 'vitest';
import {
  createAiPrecompilePass,
  createDeterministicPlanConsolidationPass,
} from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';

function makeState(outputs = new Map<string, unknown>()): PipelineState {
  return {
    input: { prompt: '' },
    context: {},
    meta: {},
    outputs,
    diagnostics: [],
  };
}

describe('createDeterministicPlanConsolidationPass', () => {
  it('resolves read target from prior target-plate context and records dependency', () => {
    const pass = createDeterministicPlanConsolidationPass();
    const result = pass.run({
      pass_id: 'deterministic_plan_consolidation',
      state: makeState(new Map([
        ['deterministic_precompile', {
          candidateEvents: [
            { verb: 'add_material', labware_id: 'labware-96-plate' },
            { verb: 'read', instrument: 'Gemini EM plate reader' },
          ],
          candidateLabwares: [],
          unresolvedRefs: [],
          residualClauses: [],
          deterministicCompleteness: 1,
          compileIr: {
            actionFrames: [
              {
                verb: 'add_material',
                sourceText: 'Add a 96-well plate to the target position',
                roles: { labware_id: 'labware-96-plate' },
                parameters: {},
              },
              {
                verb: 'read',
                sourceText: 'Read it on the Gemini EM plate reader',
                roles: { instrument: 'Gemini EM plate reader' },
                parameters: {},
              },
            ],
          },
        }],
      ])),
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics ?? []).toEqual([]);
    const output = result.output as {
      candidateEvents: Array<Record<string, unknown>>;
      protocolPlan: {
        steps: Array<{ dependsOn: string[]; status: string }>;
        bindings: { labwareRoles: Record<string, string> };
        assumptions: string[];
      };
    };
    expect(output.candidateEvents[1]).toEqual(
      expect.objectContaining({
        verb: 'read',
        labware_id: 'labware-96-plate',
        instrument: 'Gemini EM plate reader',
      }),
    );
    expect(output.protocolPlan.steps[1].dependsOn).toEqual(['det-step-1']);
    expect(output.protocolPlan.steps[1].status).toBe('ready');
    expect(output.protocolPlan.bindings.labwareRoles.target).toBe('labware-96-plate');
    expect(output.protocolPlan.assumptions).toContain(
      'det-step-2: resolved read labware from current target/plate context.',
    );
    expect(result.secondaryOutputs?.ai_precompile).toEqual(
      expect.objectContaining({
        candidateEvents: output.candidateEvents,
      }),
    );
  });

  it('blocks incomplete add-material steps with explicit diagnostics', () => {
    const pass = createDeterministicPlanConsolidationPass();
    const result = pass.run({
      pass_id: 'deterministic_plan_consolidation',
      state: makeState(new Map([
        ['deterministic_precompile', {
          candidateEvents: [
            { verb: 'add_material', volume_uL: 100 },
          ],
          candidateLabwares: [],
          unresolvedRefs: [],
          residualClauses: [],
          deterministicCompleteness: 1,
          compileIr: {
            actionFrames: [
              {
                verb: 'add_material',
                sourceText: 'Add 100 uL of clofibrate',
                roles: {},
                parameters: { volume_uL: 100 },
              },
            ],
          },
        }],
      ])),
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'deterministic_plan_missing_add_material_target',
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'deterministic_plan_missing_add_material_material',
      }),
    );
    const output = result.output as { protocolPlan: { steps: Array<{ status: string; blockers: unknown[] }> } };
    expect(output.protocolPlan.steps[0].status).toBe('blocked');
    expect(output.protocolPlan.steps[0].blockers).toHaveLength(2);
  });

  it('lets ai_precompile reuse a complete consolidated deterministic plan without calling the LLM', async () => {
    const ai = createAiPrecompilePass({
      llmClient: {
        complete: async () => {
          throw new Error('LLM should not be called for complete deterministic plan');
        },
      },
    });
    const output = {
      candidateEvents: [{ verb: 'read', labware_id: 'plate-1', instrument: 'Gemini EM plate reader' }],
      candidateLabwares: [],
      unresolvedRefs: [],
      downstreamCompileJobs: [],
      patternEvents: [],
      deterministicCompleteness: 1,
      residualClauses: [],
      protocolPlan: {
        kind: 'deterministic-protocol-plan',
        source: 'deterministic_precompile',
        steps: [],
        bindings: { labwareRoles: {}, materialRoles: {} },
        assumptions: [],
        blockers: [],
      },
      aiPrecompile: {
        candidateEvents: [{ verb: 'read', labware_id: 'plate-1', instrument: 'Gemini EM plate reader' }],
        candidateLabwares: [],
        unresolvedRefs: [],
        downstreamCompileJobs: [],
        patternEvents: [],
      },
    };

    const result = await ai.run({
      pass_id: 'ai_precompile',
      state: makeState(new Map([
        ['deterministic_plan_consolidation', output],
      ])),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual(output.aiPrecompile);
  });

  it('preserves consolidated deterministic events when ai_precompile supplements an incomplete plan', async () => {
    const ai = createAiPrecompilePass({
      llmClient: {
        complete: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                candidateEvents: [{ verb: 'read', labware_id: 'llm-plate' }],
                directives: [{ kind: 'reorient', target: 'plate-1' }],
              }),
            },
          }],
        }),
      },
    });
    const consolidated = {
      candidateEvents: [{ verb: 'read', labware_id: 'plate-1', instrument: 'Gemini EM plate reader' }],
      candidateLabwares: [],
      unresolvedRefs: [{ kind: 'material', label: 'clofibrate', reason: 'missing source' }],
      downstreamCompileJobs: [],
      patternEvents: [],
      deterministicCompleteness: 0.5,
      residualClauses: [{ text: 'then analyze it' }],
      protocolPlan: {
        kind: 'deterministic-protocol-plan',
        source: 'deterministic_precompile',
        steps: [],
        bindings: { labwareRoles: {}, materialRoles: {} },
        assumptions: [],
        blockers: [],
      },
      aiPrecompile: {
        candidateEvents: [{ verb: 'read', labware_id: 'plate-1', instrument: 'Gemini EM plate reader' }],
        candidateLabwares: [],
        unresolvedRefs: [{ kind: 'material', label: 'clofibrate', reason: 'missing source' }],
        downstreamCompileJobs: [],
        patternEvents: [],
      },
    };

    const result = await ai.run({
      pass_id: 'ai_precompile',
      state: makeState(new Map([
        ['deterministic_plan_consolidation', consolidated],
      ])),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual(
      expect.objectContaining({
        candidateEvents: consolidated.aiPrecompile.candidateEvents,
        directives: [{ kind: 'reorient', target: 'plate-1' }],
        unresolvedRefs: consolidated.aiPrecompile.unresolvedRefs,
      }),
    );
  });
});
