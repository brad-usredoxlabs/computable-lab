/**
 * FixtureRunner - Runs a compile pipeline with a mocked LLM.
 *
 * The runner builds a mock LlmClient that returns the fixture's pinned
 * ai_precompile output verbatim, then invokes runChatbotCompile and
 * collects the actual TerminalArtifacts.
 */

import type { LlmClient, AiPrecompileOutput } from '../passes/ChatbotCompilePasses.js';
import type { CompletionRequest, CompletionResponse } from '../../../ai/types.js';
import type { RunChatbotCompileArgs, RunChatbotCompileResult } from '../../../ai/runChatbotCompile.js';
import { runChatbotCompile } from '../../../ai/runChatbotCompile.js';
import type { Fixture, FixtureResult } from './FixtureTypes.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../../../extract/ExtractionDraftBuilder.js';
import type { FileAttachment } from '../../../ai/types.js';

// ---------------------------------------------------------------------------
// buildTestDeps — minimal stubs for non-LLM dependencies
// ---------------------------------------------------------------------------

/**
 * Build a minimal ExtractionRunnerService stub that returns empty results.
 */
function buildTestExtractionService(): ExtractionRunnerService {
  return {
    run: async (_req: RunExtractionServiceArgs): Promise<ExtractionDraftBody> => ({
      target_kind: _req.target_kind,
      source: _req.source,
      candidates: [],
      diagnostics: [],
    }),
  } as unknown as ExtractionRunnerService;
}

/**
 * Build a minimal searchLabwareByHint stub that returns no matches.
 */
function buildTestSearchLabwareByHint() {
  return async (_hint: string): Promise<Array<{ recordId: string; title: string }>> => [];
}

// ---------------------------------------------------------------------------
// buildMockLlmClient — create an LlmClient that returns the pinned output
// ---------------------------------------------------------------------------

function buildMockLlmClient(mockedOutput: AiPrecompileOutput): LlmClient {
  return {
    complete: async (_req: CompletionRequest): Promise<CompletionResponse> => {
      const content = JSON.stringify(mockedOutput);
      return {
        id: 'fixture-mock',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// runFixture — execute a fixture with mocked LLM
// ---------------------------------------------------------------------------

export async function runFixture(
  fixture: Fixture,
  opts?: { deps?: Partial<RunChatbotCompileArgs['deps']> },
): Promise<FixtureResult> {
  const llmClient: LlmClient =
    opts?.deps?.llmClient ?? buildMockLlmClient(fixture.mocked_ai_precompile_output);

  const args: RunChatbotCompileArgs = {
    prompt: fixture.input.prompt,
    attachments: fixture.input.attachments?.map((a) => ({
      name: a.filename,
      mime_type: a.mimeType,
      content: a.content,
    })),
    conversationId: fixture.input.conversationId,
    deps: {
      extractionService: buildTestExtractionService(),
      llmClient,
      searchLabwareByHint: opts?.deps?.searchLabwareByHint ?? buildTestSearchLabwareByHint(),
      ...(opts?.deps?.labStateCache ? { labStateCache: opts.deps.labStateCache } : {}),
    },
  };

  const result: RunChatbotCompileResult = await runChatbotCompile(args);

  return {
    outcome: result.outcome,
    terminalArtifacts: result.terminalArtifacts,
    raw: result,
  };
}
