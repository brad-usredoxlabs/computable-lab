/**
 * FixtureTypes - Type definitions and YAML parser for compile-pipeline fixtures.
 *
 * A fixture pins both the input (prompt, attachments, history) and the
 * expected output (outcome, terminalArtifacts) of a compile run.  The
 * mocked_ai_precompile_output field lets the runner bypass the LLM
 * entirely and feed a deterministic candidate-event graph into the
 * pipeline.
 */

import { parse as parseYaml } from 'yaml';
import type { TerminalArtifacts, CompileOutcome } from '../CompileContracts.js';
import type { AiPrecompileOutput } from '../passes/ChatbotCompilePasses.js';

// ---------------------------------------------------------------------------
// FixtureInput — what the user sends to the compile
// ---------------------------------------------------------------------------

export interface FixtureInput {
  prompt: string;
  attachments?: Array<{ filename: string; mimeType: string; content: string }>;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  conversationId?: string;
}

// ---------------------------------------------------------------------------
// FixtureExpected — what we assert the compile produced
// ---------------------------------------------------------------------------

export interface FixtureExpected {
  outcome?: CompileOutcome;
  terminalArtifacts?: Partial<TerminalArtifacts>;
}

// ---------------------------------------------------------------------------
// Fixture — the full fixture document
// ---------------------------------------------------------------------------

export interface Fixture {
  name: string;
  description?: string;
  input: FixtureInput;
  mocked_ai_precompile_output: AiPrecompileOutput;
  expected: FixtureExpected;
}

// ---------------------------------------------------------------------------
// FixtureResult — what the runner produces
// ---------------------------------------------------------------------------

export interface FixtureResult {
  outcome: CompileOutcome;
  terminalArtifacts: TerminalArtifacts;
  raw: unknown; // full RunChatbotCompileResult for debugging
}

// ---------------------------------------------------------------------------
// FixtureDiff — structural comparison result
// ---------------------------------------------------------------------------

export interface FixtureDiff {
  matched: string[];
  partial: string[];
  missing: string[];
  extra: string[];
}

// ---------------------------------------------------------------------------
// parseFixture — load a Fixture from YAML text
// ---------------------------------------------------------------------------

/**
 * Parse a YAML string into a Fixture, performing basic shape validation.
 *
 * @param yamlText — raw YAML document
 * @returns the parsed Fixture
 * @throws Error if the YAML is invalid or the shape doesn't match
 */
export function parseFixture(yamlText: string): Fixture {
  const raw = parseYaml(yamlText);

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Fixture YAML must be a mapping');
  }

  const obj = raw as Record<string, unknown>;

  // Validate required fields
  if (typeof obj.name !== 'string' || obj.name.trim() === '') {
    throw new Error('Fixture must have a non-empty "name" string');
  }

  if (typeof obj.input !== 'object' || obj.input === null) {
    throw new Error('Fixture must have an "input" mapping');
  }

  const input = obj.input as Record<string, unknown>;
  if (typeof input.prompt !== 'string' || input.prompt.trim() === '') {
    throw new Error('Fixture input must have a non-empty "prompt" string');
  }

  if (typeof obj.mocked_ai_precompile_output !== 'object' || obj.mocked_ai_precompile_output === null) {
    throw new Error('Fixture must have a "mocked_ai_precompile_output" mapping');
  }

  if (typeof obj.expected !== 'object' || obj.expected === null) {
    throw new Error('Fixture must have an "expected" mapping');
  }

  return {
    name: obj.name as string,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    input: {
      prompt: input.prompt as string,
      attachments: Array.isArray(input.attachments)
        ? (input.attachments as Array<Record<string, unknown>>).map((a) => ({
            filename: (a.filename as string) ?? '',
            mimeType: (a.mimeType as string) ?? '',
            content: (a.content as string) ?? '',
          }))
        : undefined,
      history: Array.isArray(input.history)
        ? (input.history as Array<Record<string, unknown>>).map((h) => ({
            role: (h.role as 'user' | 'assistant') ?? 'user',
            content: (h.content as string) ?? '',
          }))
        : undefined,
      conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
    },
    mocked_ai_precompile_output: obj.mocked_ai_precompile_output as AiPrecompileOutput,
    expected: obj.expected as FixtureExpected,
  };
}
