/**
 * Tests for ai_precompile gating on deterministic_precompile output (spec-046).
 *
 * Two golden cases:
 * (a) deterministic completeness 1.0 + zero residual → LLM NOT called
 * (b) deterministic completeness 0.5 with residualClauses → LLM called with deterministic key
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import {
  createAiPrecompilePass,
  type CreateAiPrecompilePassDeps,
  type LlmClient,
  type AiPrecompileOutput,
} from './passes/ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import type { CompletionRequest } from '../../../ai/types.js';

describe('ai_precompile gating (spec-046)', () => {
  // ---------------------------------------------------------------------------
  // Case (a): deterministic completeness 1.0 + zero residual → LLM NOT called
  // ---------------------------------------------------------------------------
  it('high completeness + no residuals → LLM is NOT called, deterministic output returned', async () => {
    // LLM client that throws if called — we assert it should NOT be called
    const mockLlmClient = {
      complete: vi.fn().mockImplementation(() => {
        throw new Error('LLM should NOT be called when deterministic is complete');
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
      model: 'test-model',
    };

    const pass = createAiPrecompilePass(deps);

    // Simulate deterministic_precompile output: 100% complete, no residuals
    const mockState: PipelineState = {
      input: {
        prompt: 'add labwares a, b, c. transfer 5 uL from A1 to B1.',
        attachments: [],
      },
      context: {},
      meta: {},
      outputs: new Map([
        ['extract_entities', { entities: [] }],
        ['deterministic_precompile', {
          candidateEvents: [
            { verb: 'add_labware', hint: 'a' },
            { verb: 'add_labware', hint: 'b' },
            { verb: 'add_labware', hint: 'c' },
            { verb: 'transfer', volume_uL: 5, source: { recordId: 'A1' }, destination: { recordId: 'B1' } },
          ],
          candidateLabwares: [
            { hint: 'labware a', reason: 'mentioned in prompt' },
            { hint: 'labware b', reason: 'mentioned in prompt' },
            { hint: 'labware c', reason: 'mentioned in prompt' },
          ],
          unresolvedRefs: [],
          residualClauses: [],
          deterministicCompleteness: 1.0,
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    // LLM should NOT have been called
    expect(mockLlmClient.complete).not.toHaveBeenCalled();

    // Output should be the deterministic plan (stripped of residualClauses + deterministicCompleteness)
    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toHaveLength(4);
    expect(output.candidateEvents[0]).toMatchObject({ verb: 'add_labware', hint: 'a' });
    expect(output.candidateEvents[3]).toMatchObject({ verb: 'transfer', volume_uL: 5 });
    expect(output.candidateLabwares).toHaveLength(3);
    expect(output.unresolvedRefs).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Case (b): deterministic completeness 0.5 with residualClauses → LLM called
  // ---------------------------------------------------------------------------
  it('low completeness + residuals → LLM is called for supplemental output only', async () => {
    const llmResponse: AiPrecompileOutput = {
      candidateEvents: [
        { verb: 'incubate', temperature_celsius: 37, duration_seconds: 3600 },
      ],
      candidateLabwares: [
        { hint: 'LLM-invented plate', reason: 'should be ignored when deterministic has core artifacts' },
      ],
      unresolvedRefs: [],
      directives: [
        { kind: 'mount_pipette', params: { mountSide: 'left', pipetteType: 'p300_single' } },
      ],
      clarification: 'Should incubation be a separate timed protocol step?',
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
      model: 'test-model',
    };

    const pass = createAiPrecompilePass(deps);

    // Simulate deterministic_precompile output: 50% complete, with residuals
    const mockState: PipelineState = {
      input: {
        prompt: 'add labwares a, b, c. transfer 5 uL from A1 to B1. incubate at 37C for 1 hour.',
        attachments: [],
      },
      context: {},
      meta: {},
      outputs: new Map([
        ['extract_entities', { entities: [] }],
        ['deterministic_precompile', {
          candidateEvents: [
            { verb: 'add_labware', hint: 'a' },
            { verb: 'add_labware', hint: 'b' },
            { verb: 'add_labware', hint: 'c' },
            { verb: 'transfer', volume_uL: 5, source: { recordId: 'A1' }, destination: { recordId: 'B1' } },
          ],
          candidateLabwares: [
            { hint: 'labware a', reason: 'mentioned in prompt' },
            { hint: 'labware b', reason: 'mentioned in prompt' },
            { hint: 'labware c', reason: 'mentioned in prompt' },
          ],
          unresolvedRefs: [],
          residualClauses: [
            { text: 'incubate at 37C for 1 hour', span: [40, 72], reason: 'no_verb' },
          ],
          deterministicCompleteness: 0.5,
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    // LLM should have been called exactly once
    expect(mockLlmClient.complete).toHaveBeenCalledTimes(1);

    // Inspect the user message to verify it includes the 'deterministic' key
    const callArg = (mockLlmClient.complete as Mock).mock.calls[0][0] as CompletionRequest;
    const userMessage = callArg.messages?.find(m => m.role === 'user');
    expect(userMessage).toBeDefined();
    expect(typeof userMessage?.content).toBe('string');
    const parsedUser = JSON.parse(userMessage!.content as string);
    expect(parsedUser).toHaveProperty('prompt');
    expect(parsedUser).toHaveProperty('entities');
    expect(parsedUser).toHaveProperty('deterministic');
    expect(parsedUser.deterministic).toHaveProperty('candidateEvents');
    expect(parsedUser.deterministic).toHaveProperty('candidateLabwares');
    expect(parsedUser.deterministic).toHaveProperty('residualClauses');
    expect(parsedUser.deterministic.candidateEvents).toHaveLength(4);
    expect(parsedUser.deterministic.residualClauses).toHaveLength(1);

    // Deterministic core artifacts are retained; LLM semantic events/labware are suppressed.
    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toHaveLength(4);
    expect(output.candidateEvents[0]).toMatchObject({ verb: 'add_labware', hint: 'a' });
    expect(output.candidateEvents[3]).toMatchObject({ verb: 'transfer', volume_uL: 5 });
    expect(output.candidateEvents).not.toContainEqual(expect.objectContaining({ verb: 'incubate' }));
    expect(output.candidateLabwares).toHaveLength(3);
    expect(output.candidateLabwares).not.toContainEqual(expect.objectContaining({ hint: 'LLM-invented plate' }));
    expect(output.directives).toEqual([
      { kind: 'mount_pipette', params: { mountSide: 'left', pipetteType: 'p300_single' } },
    ]);
    expect(output.clarification).toBe('Should incubation be a separate timed protocol step?');
  });

  // ---------------------------------------------------------------------------
  // Case (c): no deterministic output → LLM called normally (backward compat)
  // ---------------------------------------------------------------------------
  it('no deterministic_precompile output → LLM called without deterministic key', async () => {
    const llmResponse: AiPrecompileOutput = {
      candidateEvents: [{ verb: 'seed', material: 'HeLa cells' }],
      candidateLabwares: [],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
      model: 'test-model',
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: {
        prompt: 'seed HeLa cells',
        attachments: [],
      },
      context: {},
      meta: {},
      outputs: new Map([
        ['extract_entities', { entities: [] }],
        // No deterministic_precompile output
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(mockLlmClient.complete).toHaveBeenCalledTimes(1);
    const callArg = (mockLlmClient.complete as Mock).mock.calls[0][0] as CompletionRequest;
    const userMessage = callArg.messages?.find(m => m.role === 'user');
    const parsedUser = JSON.parse(userMessage!.content as string);
    expect(parsedUser).toHaveProperty('prompt');
    expect(parsedUser).toHaveProperty('entities');
    expect(parsedUser).not.toHaveProperty('deterministic');

    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toHaveLength(1);
    expect(output.candidateEvents[0]).toMatchObject({ verb: 'seed', material: 'HeLa cells' });
  });

  // ---------------------------------------------------------------------------
  // Case (d): completeness exactly 0.9, no residuals → LLM NOT called (boundary)
  // ---------------------------------------------------------------------------
  it('completeness exactly 0.9 + no residuals → LLM NOT called (boundary)', async () => {
    const mockLlmClient = {
      complete: vi.fn().mockImplementation(() => {
        throw new Error('LLM should NOT be called at boundary');
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'test', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map([
        ['extract_entities', { entities: [] }],
        ['deterministic_precompile', {
          candidateEvents: [{ verb: 'test' }],
          candidateLabwares: [],
          unresolvedRefs: [],
          residualClauses: [],
          deterministicCompleteness: 0.9,
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(mockLlmClient.complete).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Case (e): completeness 0.89, no residuals → LLM IS called (just below threshold)
  // ---------------------------------------------------------------------------
  it('completeness 0.89 + no residuals → LLM IS called but semantic events stay deterministic', async () => {
    const llmResponse: AiPrecompileOutput = {
      candidateEvents: [{ verb: 'llm_event' }],
      candidateLabwares: [],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'test', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map([
        ['extract_entities', { entities: [] }],
        ['deterministic_precompile', {
          candidateEvents: [{ verb: 'det_event' }],
          candidateLabwares: [],
          unresolvedRefs: [],
          residualClauses: [],
          deterministicCompleteness: 0.89,
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(mockLlmClient.complete).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toHaveLength(1);
    expect(output.candidateEvents[0]).toMatchObject({ verb: 'det_event' });
    expect(output.candidateEvents).not.toContainEqual(expect.objectContaining({ verb: 'llm_event' }));
  });

  // ---------------------------------------------------------------------------
  // Case (f): deterministic output without core artifacts → legacy LLM fallback
  // ---------------------------------------------------------------------------
  it('deterministic output without core artifacts still accepts legacy LLM candidate events', async () => {
    const llmResponse: AiPrecompileOutput = {
      candidateEvents: [{ verb: 'read', instrument: 'plate-reader' }],
      candidateLabwares: [{ hint: 'reader plate', reason: 'legacy fallback' }],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      }),
    } as unknown as LlmClient;

    const pass = createAiPrecompilePass({ llmClient: mockLlmClient });
    const mockState: PipelineState = {
      input: { prompt: 'read on the plate reader', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map([
        ['extract_entities', { entities: [] }],
        ['deterministic_precompile', {
          candidateEvents: [],
          candidateLabwares: [],
          unresolvedRefs: [],
          residualClauses: [{ text: 'read on the plate reader', reason: 'no_supported_verb' }],
          deterministicCompleteness: 0,
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(mockLlmClient.complete).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toEqual([{ verb: 'read', instrument: 'plate-reader' }]);
    expect(output.candidateLabwares).toEqual([{ hint: 'reader plate', reason: 'legacy fallback' }]);
  });
});
