/**
 * ExtractorValidationRepair — validation/repair loop on extractor LLM output
 * with bounded retries.
 *
 * When the extractor LLM returns JSON that fails schema validation, this
 * module retries up to 2 additional times with the validation error appended
 * to the prompt.  Bounded retries prevent runaway LLM cost.
 *
 * - Maximum 3 attempts per chunk (1 initial + 2 retries).
 * - Maximum 6 total retry attempts per pipeline run (shared budget).
 * - After exhaustion, the chunk is recorded as failed; pipeline continues.
 *
 * Spec: spec-027-extractor-validation-repair-loop
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a single chunk extraction attempt (with or without repair).
 */
export interface ExtractChunkResult {
  ok: boolean;
  candidates: unknown[];
  attempts: number;
  lastRawResponse?: string;
}

/**
 * Arguments for extractChunkWithRepair.
 */
export interface ExtractChunkWithRepairArgs {
  /** The text chunk to extract from. */
  chunkText: string;
  /** The base prompt (system + user messages combined). */
  basePrompt: string;
  /** LLM client that accepts { prompt: string } and returns raw text. */
  llmClient: {
    complete: (args: { prompt: string }) => Promise<string>;
  };
  /** Zod schema to validate the parsed JSON response. */
  schema: z.ZodSchema;
  /** Shared retry budget — mutated in-place as retries are consumed. */
  retryBudget: { remaining: number };
  /** Index of this chunk (for logging). */
  chunkIndex: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS_PER_CHUNK = 3;
const MAX_RAW_RESPONSE_LOG = 4000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a JSON object from a raw LLM response.
 * Handles markdown fences (```json ... ```) and surrounding prose.
 * Returns null on failure.
 */
function extractJson(raw: string): unknown | null {
  // Try markdown fence first
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Find first { and last }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Build the prompt for a given attempt number.
 *
 * - Attempt 1: original prompt unchanged.
 * - Attempt 2+: original prompt + appended validation-error block.
 */
function buildPromptForAttempt(
  basePrompt: string,
  attempt: number,
  lastError: z.ZodError | null,
): string {
  if (attempt === 1) {
    return basePrompt;
  }

  const errorBlock = [
    '---',
    'Your previous response failed schema validation with the following errors:',
    lastError?.message ?? 'unknown error',
    '',
    'Return valid JSON matching the expected schema. Do not include explanatory prose.',
  ].join('\n');

  return basePrompt + '\n\n' + errorBlock;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract a single chunk with validation/repair loop.
 *
 * Retries up to 2 additional times (3 total) when the LLM response fails
 * schema validation.  Each retry appends the validation error to the prompt.
 *
 * The shared retry budget is decremented on each retry attempt.  When the
 * budget is exhausted, subsequent chunks skip retry and log directly.
 *
 * @returns {ExtractChunkResult} — ok, candidates, attempts, and optionally
 *   lastRawResponse when all attempts fail.
 */
export async function extractChunkWithRepair(
  args: ExtractChunkWithRepairArgs,
): Promise<ExtractChunkResult> {
  let lastError: z.ZodError | null = null;
  let lastRaw = '';
  let actualAttempts = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CHUNK; attempt++) {
    // Check budget before each attempt (including first)
    if (args.retryBudget.remaining <= 0) {
      console.warn(
        `[extractor_run_repair_budget_exhausted] chunkIndex=${args.chunkIndex}`,
      );
      break;
    }

    actualAttempts = attempt;
    const prompt = buildPromptForAttempt(args.basePrompt, attempt, lastError);
    lastRaw = await args.llmClient.complete({ prompt });

    const parsed = args.schema.safeParse(extractJson(lastRaw));

    if (parsed.success) {
      return {
        ok: true,
        candidates: (parsed.data as { candidates?: unknown[] }).candidates ?? [],
        attempts: attempt,
      };
    }

    // Log retry attempt (not the final attempt — that gets exhausted log)
    if (attempt < MAX_ATTEMPTS_PER_CHUNK) {
      console.warn(
        `[extractor_run_repair_attempt_${attempt}] chunkIndex=${args.chunkIndex}`,
      );
      args.retryBudget.remaining -= 1;
    }

    lastError = parsed.error;
  }

  // All attempts exhausted
  console.warn(
    `[extractor_run_repair_exhausted] chunkIndex=${args.chunkIndex} lastError=${lastError?.message ?? 'unknown'}`,
  );

  return {
    ok: false,
    candidates: [],
    attempts: actualAttempts,
    lastRawResponse: lastRaw.slice(0, MAX_RAW_RESPONSE_LOG),
  };
}
