/**
 * ExtractorValidationRepair tests — validation/repair loop on extractor LLM
 * output with bounded retries.
 *
 * Spec: spec-027-extractor-validation-repair-loop
 */

import { z } from 'zod';
import { extractChunkWithRepair } from './ExtractorValidationRepair.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Zod schema that matches the extraction result shape:
 * { candidates: [...] }
 * Uses .strict() so unknown keys cause validation failure.
 */
const TestSchema = z.object({
  candidates: z.array(z.any()).optional(),
}).strict();

/**
 * Create a mock LLM client that returns a fixed response.
 */
function createMockLlmClient(responses: string[]) {
  let callCount = 0;
  return {
    complete: async (_args: { prompt: string }): Promise<string> => {
      const response = responses[callCount] ?? responses[responses.length - 1];
      callCount++;
      return response;
    },
    get callCount() {
      return callCount;
    },
  };
}

/**
 * Create a mock LLM client that returns a response based on a predicate.
 */
function createConditionalMockLlmClient(
  predicate: (attempt: number) => string,
) {
  let callCount = 0;
  return {
    complete: async (_args: { prompt: string }): Promise<string> => {
      const response = predicate(callCount + 1);
      callCount++;
      return response;
    },
    get callCount() {
      return callCount;
    },
  };
}

/**
 * Build a valid extraction response.
 */
function validResponse(candidates: unknown[] = []): string {
  return JSON.stringify({ candidates });
}

/**
 * Build an invalid extraction response (missing candidates array).
 */
function invalidResponse(): string {
  return JSON.stringify({ foo: 'bar' });
}

/**
 * Build a completely malformed response.
 */
function malformedResponse(): string {
  return 'not json at all';
}

/**
 * Build a markdown-wrapped invalid response.
 */
function markdownInvalidResponse(): string {
  return '```\n{"foo": "bar"}\n```';
}

/**
 * Capture console.warn calls during a test.
 */
function captureWarns(fn: () => Promise<void>): string[] {
  const warns: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(' '));
  };
  return fn().then(
    () => warns,
    (err) => {
      console.warn = origWarn;
      throw err;
    },
  ).finally(() => {
    console.warn = origWarn;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractChunkWithRepair', () => {
  const basePrompt =
    'You are a biology-protocol extractor. Given unstructured text, produce JSON with a candidates[] array.';

  describe('success on first attempt', () => {
    it('returns ok:true with candidates after 1 LLM call', async () => {
      const mockLlm = createMockLlmClient([
        validResponse([{ target_kind: 'protocol', draft: {}, confidence: 0.9 }]),
      ]);
      const budget = { remaining: 6 };

      const warns = await captureWarns(async () => {
        const result = await extractChunkWithRepair({
          chunkText: 'some text',
          basePrompt,
          llmClient: mockLlm,
          schema: TestSchema,
          retryBudget: budget,
          chunkIndex: 0,
        });
        expect(result.ok).toBe(true);
        expect(result.attempts).toBe(1);
        expect(result.candidates).toHaveLength(1);
        expect(result.lastRawResponse).toBeUndefined();
      });

      expect(mockLlm.callCount).toBe(1);
      expect(budget.remaining).toBe(6); // no retries consumed
      expect(warns).toHaveLength(0);
    });
  });

  describe('success on second attempt', () => {
    it('returns ok:true after 2 LLM calls, budget decremented', async () => {
      const mockLlm = createMockLlmClient([
        invalidResponse(), // first attempt fails
        validResponse([{ target_kind: 'protocol', draft: {}, confidence: 0.8 }]), // second succeeds
      ]);
      const budget = { remaining: 6 };

      const warns = await captureWarns(async () => {
        const result = await extractChunkWithRepair({
          chunkText: 'some text',
          basePrompt,
          llmClient: mockLlm,
          schema: TestSchema,
          retryBudget: budget,
          chunkIndex: 2,
        });
        expect(result.ok).toBe(true);
        expect(result.attempts).toBe(2);
        expect(result.candidates).toHaveLength(1);
      });

      expect(mockLlm.callCount).toBe(2);
      expect(budget.remaining).toBe(5); // 1 retry consumed
      expect(warns).toContainEqual(
        expect.stringContaining('[extractor_run_repair_attempt_1] chunkIndex=2'),
      );
    });
  });

  describe('failure after third attempt', () => {
    it('returns ok:false with lastRawResponse after 3 LLM calls', async () => {
      const mockLlm = createMockLlmClient([
        invalidResponse(),
        invalidResponse(),
        invalidResponse(),
      ]);
      const budget = { remaining: 6 };

      const warns = await captureWarns(async () => {
        const result = await extractChunkWithRepair({
          chunkText: 'some text',
          basePrompt,
          llmClient: mockLlm,
          schema: TestSchema,
          retryBudget: budget,
          chunkIndex: 5,
        });
        expect(result.ok).toBe(false);
        expect(result.attempts).toBe(3);
        expect(result.candidates).toHaveLength(0);
        expect(result.lastRawResponse).toBeDefined();
        expect(result.lastRawResponse!.length).toBeGreaterThan(0);
      });

      expect(mockLlm.callCount).toBe(3);
      expect(budget.remaining).toBe(4); // 2 retries consumed
      expect(warns).toContainEqual(
        expect.stringContaining('[extractor_run_repair_attempt_1] chunkIndex=5'),
      );
      expect(warns).toContainEqual(
        expect.stringContaining('[extractor_run_repair_attempt_2] chunkIndex=5'),
      );
      expect(warns).toContainEqual(
        expect.stringContaining('[extractor_run_repair_exhausted] chunkIndex=5'),
      );
    });
  });

  describe('budget exhausted skips retry', () => {
    it('returns ok:false with 0 LLM calls when budget=0 (budget check before first attempt)', async () => {
      const mockLlm = createMockLlmClient([invalidResponse()]);
      const budget = { remaining: 0 };

      const warns = await captureWarns(async () => {
        const result = await extractChunkWithRepair({
          chunkText: 'some text',
          basePrompt,
          llmClient: mockLlm,
          schema: TestSchema,
          retryBudget: budget,
          chunkIndex: 0,
        });
        expect(result.ok).toBe(false);
        expect(result.attempts).toBe(0); // no attempts made
        expect(result.candidates).toHaveLength(0);
      });

      expect(mockLlm.callCount).toBe(0); // no LLM call made
      expect(budget.remaining).toBe(0); // budget unchanged
      expect(warns).toContainEqual(
        expect.stringContaining('[extractor_run_repair_budget_exhausted] chunkIndex=0'),
      );
    });

    it('does not decrement budget when exhausted on first attempt', async () => {
      const mockLlm = createMockLlmClient([invalidResponse()]);
      const budget = { remaining: 0 };

      await captureWarns(async () => {
        const result = await extractChunkWithRepair({
          chunkText: 'some text',
          basePrompt,
          llmClient: mockLlm,
          schema: TestSchema,
          retryBudget: budget,
          chunkIndex: 0,
        });
        expect(result.ok).toBe(false);
      });

      expect(mockLlm.callCount).toBe(0); // no LLM call made
      expect(budget.remaining).toBe(0); // budget unchanged
    });
  });

  describe('markdown-wrapped JSON', () => {
    it('extracts JSON from markdown fences on first attempt', async () => {
      const mockLlm = createMockLlmClient([
        '```\n{"candidates": [{"target_kind": "protocol", "draft": {}, "confidence": 0.9}]}\n```',
      ]);
      const budget = { remaining: 6 };

      const warns = await captureWarns(async () => {
        const result = await extractChunkWithRepair({
          chunkText: 'some text',
          basePrompt,
          llmClient: mockLlm,
          schema: TestSchema,
          retryBudget: budget,
          chunkIndex: 0,
        });
        expect(result.ok).toBe(true);
        expect(result.attempts).toBe(1);
      });

      expect(mockLlm.callCount).toBe(1);
      expect(warns).toHaveLength(0);
    });

    it('retries when markdown-wrapped JSON fails validation', async () => {
      const mockLlm = createMockLlmClient([
        markdownInvalidResponse(), // first fails
        validResponse([{ target_kind: 'protocol', draft: {}, confidence: 0.7 }]), // second succeeds
      ]);
      const budget = { remaining: 6 };

      const warns = await captureWarns(async () => {
        const result = await extractChunkWithRepair({
          chunkText: 'some text',
          basePrompt,
          llmClient: mockLlm,
          schema: TestSchema,
          retryBudget: budget,
          chunkIndex: 1,
        });
        expect(result.ok).toBe(true);
        expect(result.attempts).toBe(2);
      });

      expect(mockLlm.callCount).toBe(2);
      expect(budget.remaining).toBe(5);
    });
  });

  describe('prompt building', () => {
    it('attempt 1 uses base prompt unchanged', async () => {
      let receivedPrompt = '';
      const mockLlm = {
        complete: async (args: { prompt: string }): Promise<string> => {
          receivedPrompt = args.prompt;
          return validResponse();
        },
      };
      const budget = { remaining: 6 };

      await extractChunkWithRepair({
        chunkText: 'some text',
        basePrompt,
        llmClient: mockLlm,
        schema: TestSchema,
        retryBudget: budget,
        chunkIndex: 0,
      });

      expect(receivedPrompt).toBe(basePrompt);
    });

    it('attempt 2 appends validation error block', async () => {
      const prompts: string[] = [];
      const mockLlm = {
        complete: async (args: { prompt: string }): Promise<string> => {
          prompts.push(args.prompt);
          if (prompts.length === 1) return invalidResponse();
          return validResponse();
        },
      };
      const budget = { remaining: 6 };

      await extractChunkWithRepair({
        chunkText: 'some text',
        basePrompt,
        llmClient: mockLlm,
        schema: TestSchema,
        retryBudget: budget,
        chunkIndex: 0,
      });

      // First prompt should be the base prompt unchanged
      expect(prompts[0]).toBe(basePrompt);
      // Second prompt should contain the base prompt + error block
      expect(prompts[1]).toContain(basePrompt);
      expect(prompts[1]).toContain('---');
      expect(prompts[1]).toContain('Your previous response failed schema validation');
      expect(prompts[1]).toContain('Return valid JSON matching the expected schema');
    });
  });

  describe('raw response truncation', () => {
    it('truncates lastRawResponse to MAX_RAW_RESPONSE_LOG chars', async () => {
      const longResponse = 'x'.repeat(10000);
      const mockLlm = createMockLlmClient([longResponse]);
      const budget = { remaining: 6 };

      const warns = await captureWarns(async () => {
        const result = await extractChunkWithRepair({
          chunkText: 'some text',
          basePrompt,
          llmClient: mockLlm,
          schema: TestSchema,
          retryBudget: budget,
          chunkIndex: 0,
        });
        expect(result.ok).toBe(false);
        expect(result.lastRawResponse).toBeDefined();
        expect(result.lastRawResponse!.length).toBeLessThanOrEqual(4000);
      });

      expect(mockLlm.callCount).toBe(3);
    });
  });
});
