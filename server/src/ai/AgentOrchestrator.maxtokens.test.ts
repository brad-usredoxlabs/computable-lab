/**
 * Tests that AgentOrchestrator forwards inferenceConfig.maxTokens to the LLM.
 *
 * Spec: spec-025-settings-override-audit
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type {
  CompletionRequest,
  CompletionResponse,
  InferenceClient,
  ToolBridge,
  AgentEvent,
} from './types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

describe('AgentOrchestrator forwards maxTokens to InferenceClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Helper: build a mock InferenceClient that records the request
  // -----------------------------------------------------------------------

  function makeMockClient(
    streamResponse: CompletionResponse,
  ): {
    client: InferenceClient;
    capturedRequests: CompletionRequest[];
  } {
    const capturedRequests: CompletionRequest[] = [];

    const client: InferenceClient = {
      complete: vi.fn(),
      completeStream: vi.fn(async function* (request: CompletionRequest) {
        capturedRequests.push(request);
        yield {
          id: 'chunk-1',
          choices: [
            {
              index: 0,
              delta: { content: 'ok' },
              finish_reason: null,
            },
          ],
        };
        yield {
          id: 'chunk-1',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        };
      }),
    };

    return { client, capturedRequests };
  }

  // -----------------------------------------------------------------------
  // Helper: build a mock ToolBridge
  // -----------------------------------------------------------------------

  function makeMockToolBridge(): ToolBridge {
    return {
      getToolDefinitions: () => [],
      executeTool: vi.fn(),
    };
  }

  // -----------------------------------------------------------------------
  // Helper: build minimal deps for the orchestrator
  // -----------------------------------------------------------------------

  function makeMockDeps() {
    return {
      extractionService: {
        extract: vi.fn().mockResolvedValue({ candidates: [], diagnostics: [] }),
      },
      llmClient: {
        complete: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
        }),
      },
      searchLabwareByHint: vi.fn().mockResolvedValue([]),
    };
  }

  // -----------------------------------------------------------------------
  // Tests
  // -----------------------------------------------------------------------

  it('forwards inferenceConfig.maxTokens as max_tokens when set', async () => {
    const { client, capturedRequests } = makeMockClient({
      id: 'resp-1',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: '{}' },
        },
      ],
    });

    // Pipeline falls through → LLM loop
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [],
      terminalArtifacts: {
        events: [],
        directives: [],
        gaps: [],
      },
      outcome: 'error',
    });

    const toolBridge = makeMockToolBridge();
    const orchestrator = createAgentOrchestrator(
      client,
      toolBridge,
      { model: 'test-model', temperature: 0.1, maxTokens: 31337 },
      { maxTurns: 2 },
      makeMockDeps(),
    );

    await orchestrator.run({
      prompt: 'Transfer 10 uL.',
      onEvent: () => {},
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['transfer'],
      },
    });

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]!.max_tokens).toBe(31337);
  });

  it('falls back to 4096 when maxTokens is undefined', async () => {
    const { client, capturedRequests } = makeMockClient({
      id: 'resp-1',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: '{}' },
        },
      ],
    });

    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [],
      terminalArtifacts: {
        events: [],
        directives: [],
        gaps: [],
      },
      outcome: 'error',
    });

    const toolBridge = makeMockToolBridge();
    const orchestrator = createAgentOrchestrator(
      client,
      toolBridge,
      { model: 'test-model', temperature: 0.1 }, // maxTokens omitted
      { maxTurns: 2 },
      makeMockDeps(),
    );

    await orchestrator.run({
      prompt: 'Transfer 10 uL.',
      onEvent: () => {},
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['transfer'],
      },
    });

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]!.max_tokens).toBe(4096);
  });
});
