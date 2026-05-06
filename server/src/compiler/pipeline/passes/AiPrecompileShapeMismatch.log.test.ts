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

  it('salvages valid side-evidence arrays when nullable fields cause shape mismatch', async () => {
    const malformedButUseful = {
      candidateEvents: [],
      candidateLabwares: [],
      unresolvedRefs: [],
      clarification: null,
      priorLabwareRefs: [
        { hint: 'generic_96_well_plate', kindHint: 'generic 96-well plate' },
      ],
      directives: [
        { kind: 'mount_pipette', params: { mountSide: 'right', pipetteType: '8_channel_multichannel' } },
      ],
      downstreamCompileJobs: [
        { kind: 'fluorescence_microscopy_imaging', description: 'Image stained coverslips' },
      ],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(malformedButUseful) } }],
      }),
    } as unknown as LlmClient;

    const pass = createAiPrecompilePass({ llmClient: mockLlmClient });

    const mockState: PipelineState = {
      input: { prompt: 'image stained coverslips', attachments: [] },
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
    expect(output.clarification).toBeUndefined();
    expect(output.priorLabwareRefs).toHaveLength(1);
    expect(output.directives).toHaveLength(1);
    expect(output.downstreamCompileJobs).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect((result.diagnostics ?? [])[0]).toMatchObject({
      code: 'ai_precompile_shape_mismatch',
      severity: 'warning',
    });
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

  it('normalizes character-index object refs into structured refs with label/kind/reason', async () => {
    // Simulate the malformed unresolvedRefs seen in abcam-multiplexing-if-protocol
    // where the LLM returned character-index objects instead of structured refs
    const malformedJson = JSON.stringify({
      candidateEvents: [],
      candidateLabwares: [],
      unresolvedRefs: [
        {
          "0": "p", "1": "r", "2": "i", "3": "m", "4": "a", "5": "r", "6": "y", "7": " ",
          "8": "a", "9": "n", "10": "t", "11": "i", "12": "b", "13": "o", "14": "d", "15": "y",
          "16": " ", "17": "c", "18": "o", "19": "n", "20": "c", "21": "e", "22": "n",
          "23": "t", "24": "r", "25": "a", "26": "t", "27": "i", "28": "o", "29": "n",
        },
        {
          "0": "s", "1": "p", "2": "e", "3": "c", "4": "i", "5": "f", "6": "i", "7": "c",
          "8": " ", "9": "s", "10": "e", "11": "c", "12": "o", "13": "n", "14": "d",
          "15": "a", "16": "r", "17": "y", "18": " ", "19": "f", "20": "l", "21": "u",
          "22": "o", "23": "r", "24": "o", "25": "p", "26": "h", "27": "o", "28": "r",
          "29": "e", "30": " ", "31": "r", "32": "e", "33": "a", "34": "g", "35": "e",
          "36": "n", "37": "t", "38": " ", "39": "s", "40": "e", "41": "l", "42": "e",
          "43": "c", "44": "t", "45": "i", "46": "o", "47": "n", "48": " ", "49": "(",
          "50": "e", "51": ".", "52": "g", "53": ".", "54": " ", "55": "A", "56": "B",
          "57": "3", "58": "2", "59": "5", "60": "2", "61": "8", "62": "6", "63": " ",
          "64": "v", "65": "s", "66": " ", "67": "A", "68": "B", "69": "3", "70": "2",
          "71": "5", "72": "2", "73": "8", "74": "7", "75": ")",
        },
      ],
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
    
    // Verify that character-index objects were normalized into structured refs
    expect(output.unresolvedRefs).toHaveLength(2);
    expect(output.unresolvedRefs[0]).toMatchObject({
      kind: 'unknown',
      label: 'primary antibody concentration',
      reason: 'malformed character-index object from LLM',
    });
    expect(output.unresolvedRefs[1]).toMatchObject({
      kind: 'unknown',
      label: 'specific secondary fluorophore reagent selection (e.g. AB325286 vs AB325287)',
      reason: 'malformed character-index object from LLM',
    });

    // Verify console.warn was called with the correct prefix
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnCall = warnSpy.mock.calls[0][0] as string;
    expect(warnCall).toMatch(/^\[ai_precompile_shape_mismatch\]/);
  });
});
