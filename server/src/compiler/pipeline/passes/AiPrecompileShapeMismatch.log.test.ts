/**
 * Tests for ai_precompile raw-response logging on shape failure.
 * 
 * spec-019: verifies that when zod validation fails, the raw LLM response
 * is logged under the stable prefix `[ai_precompile_shape_mismatch]`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAiPrecompilePass, type CreateAiPrecompilePassDeps, type LlmClient, type AiPrecompileOutput } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import type { CompletionRequest } from '../../../ai/types.js';

describe('ai_precompile shape mismatch logging', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('logs raw response with [ai_precompile_shape_mismatch] prefix on zod validation failure', async () => {
    // Return valid JSON but with wrong shape — candidateEvents must be an array,
    // not a string. This will fail zod validation.
    const malformedJson = JSON.stringify({
      candidateEvents: 'not-an-array',
      candidateLabwares: [],
      unresolvedRefs: [],
    });

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: malformedJson } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'test prompt', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toEqual([]);
    expect(output.candidateLabwares).toEqual([]);
    expect(output.unresolvedRefs).toEqual([]);

    // Verify console.warn was called with the correct prefix
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnCall = warnSpy.mock.calls[0][0] as string;
    expect(warnCall).toMatch(/^\[ai_precompile_shape_mismatch\]/);
    expect(warnCall).toContain('not-an-array');
  });

  it('truncates raw response to 4000 chars in log line', async () => {
    // Create a response that exceeds 4000 chars and also fails zod
    const longContent = JSON.stringify({
      candidateEvents: 'not-an-array',
      candidateLabwares: [],
      unresolvedRefs: [],
      // Add a huge field to push past 4000 chars
      extra: 'x'.repeat(5000),
    });

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: longContent } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'test prompt', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);

    // Verify the log line is truncated to 4000 chars
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnCall = warnSpy.mock.calls[0][0] as string;
    expect(warnCall.length).toBeLessThanOrEqual(4000 + '[ai_precompile_shape_mismatch] '.length);
  });

  it('does NOT log on valid JSON that passes zod validation', async () => {
    const validOutput: AiPrecompileOutput = {
      candidateEvents: [{ verb: 'seed', material: 'HeLa' }],
      candidateLabwares: [],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(validOutput) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'test prompt', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    // console.warn should NOT be called for valid responses
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT log when supplemental-only JSON omits compatibility arrays', async () => {
    const supplementalOnly = {
      clarification: 'Which readout should be compiled next?',
      downstreamCompileJobs: [
        { kind: 'qPCR', description: 'quantitative PCR analysis' },
      ],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(supplementalOnly) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'later run qPCR', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toEqual([]);
    expect(output.candidateLabwares).toEqual([]);
    expect(output.unresolvedRefs).toEqual([]);
    expect(output.clarification).toBe('Which readout should be compiled next?');
    expect(output.downstreamCompileJobs).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT log on invalid JSON (parse error) — only on zod shape mismatch', async () => {
    // This is a JSON parse error, not a zod shape mismatch
    // The parse error path returns early before zod validation
    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'not json at all' } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'test prompt', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    // console.warn should NOT be called for JSON parse errors
    // (only for zod shape mismatches after successful JSON parse)
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
