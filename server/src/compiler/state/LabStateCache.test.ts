/**
 * Tests for LabStateCache — in-memory LRU cache for LabStateSnapshot.
 *
 * Covers:
 * (a) cache miss returns undefined
 * (b) put then get returns same snapshot
 * (c) LRU eviction at max capacity
 * (d) runChatbotCompile with conversationId='c1' called twice: second call
 *     receives the first call's snapshotAfter as priorLabState
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInMemoryLabStateCache,
  getDefaultLabStateCache,
  type LabStateCache,
} from './LabStateCache.js';
import type { LabStateSnapshot } from './LabState.js';
import { emptyLabState } from './LabState.js';
import { runChatbotCompile, type RunChatbotCompileArgs } from '../../ai/runChatbotCompile.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../../extract/ExtractionRunnerService.js';
import type { LlmClient } from '../../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { CompletionRequest, CompletionResponse } from '../../ai/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(turnIndex: number, mintCounter: number): LabStateSnapshot {
  return {
    ...emptyLabState(),
    turnIndex,
    mintCounter,
    labware: {
      'LWI-1': {
        instanceId: 'LWI-1',
        labwareType: '96-well-deepwell-plate',
        slot: 'A',
        orientation: 'landscape',
        wells: { A1: [{ materialId: 'mat-1', kind: 'sample', volumeUl: 100 }] },
      },
    },
    deck: [{ slot: 'A', labwareInstanceId: 'LWI-1' }],
  };
}

function makeMockExtractionService(): ExtractionRunnerService {
  return {
    run: vi.fn(async (_req: RunExtractionServiceArgs) => ({
      target_kind: _req.target_kind,
      source: _req.source,
      candidates: [],
      diagnostics: [],
    })),
  } as unknown as ExtractionRunnerService;
}

function makeMockLlmClientWithCreateContainer(): LlmClient {
  return {
    complete: vi.fn(async (_req: CompletionRequest): Promise<CompletionResponse> => {
      const content = JSON.stringify({
        candidateEvents: [
          {
            verb: 'create_container',
            slot: 'target',
            labwareType: '96-well-deepwell-plate',
          },
          {
            verb: 'add_material',
            labware: '96-well plate',
            material: {
              materialId: 'mat-sample-1',
              kind: 'fecal-sample',
              volumeUl: 100,
            },
            wells: ['A1'],
          },
        ],
        candidateLabwares: [{ hint: '96-well plate', reason: 'needed for seeding' }],
        unresolvedRefs: [],
      });
      return {
        id: 'test-response-id',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };
    }),
  } as unknown as LlmClient;
}

function makeMockLlmClientEmpty(): LlmClient {
  return {
    complete: vi.fn(async (_req: CompletionRequest): Promise<CompletionResponse> => {
      const content = JSON.stringify({
        candidateEvents: [],
        candidateLabwares: [],
        unresolvedRefs: [],
      });
      return {
        id: 'test-response-id',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };
    }),
  } as unknown as LlmClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LabStateCache', () => {
  // -----------------------------------------------------------------------
  // (a) cache miss returns undefined
  // -----------------------------------------------------------------------

  it('cache miss returns undefined', () => {
    const cache = createInMemoryLabStateCache();
    expect(cache.get('nope')).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // (b) put then get returns same snapshot
  // -----------------------------------------------------------------------

  it('put then get returns same snapshot', () => {
    const cache = createInMemoryLabStateCache();
    const snap = makeSnapshot(1, 1);
    cache.put('x', snap);
    const result = cache.get('x');
    expect(result).toBeDefined();
    expect(result).toBe(snap); // same reference (we store the same object)
    expect(result!.turnIndex).toBe(1);
    expect(result!.mintCounter).toBe(1);
    expect(cache.size()).toBe(1);
  });

  // -----------------------------------------------------------------------
  // (c) LRU eviction at max capacity
  // -----------------------------------------------------------------------

  it('evicts oldest entries when maxEntries is exceeded', () => {
    const max = 3;
    const cache = createInMemoryLabStateCache({ maxEntries: max });

    // Insert max + 2 entries
    for (let i = 0; i < max + 2; i++) {
      cache.put(`key-${i}`, makeSnapshot(i, i));
    }

    // Size should be exactly max
    expect(cache.size()).toBe(max);

    // Oldest two keys should be evicted
    expect(cache.get('key-0')).toBeUndefined();
    expect(cache.get('key-1')).toBeUndefined();

    // Newest three keys should be present
    expect(cache.get('key-2')).toBeDefined();
    expect(cache.get('key-3')).toBeDefined();
    expect(cache.get('key-4')).toBeDefined();

    // Verify LRU bump: accessing key-2 moves it to the end
    cache.get('key-2');
    // Now insert one more — key-3 should be evicted (it's now the oldest)
    cache.put('key-5', makeSnapshot(5, 5));
    expect(cache.get('key-3')).toBeUndefined();
    expect(cache.get('key-2')).toBeDefined();
    expect(cache.get('key-4')).toBeDefined();
    expect(cache.get('key-5')).toBeDefined();
    expect(cache.size()).toBe(max);
  });

  // -----------------------------------------------------------------------
  // (d) Integration: runChatbotCompile with conversationId
  // -----------------------------------------------------------------------

  it('runChatbotCompile with conversationId persists snapshotAfter for next call', async () => {
    const cache = createInMemoryLabStateCache();
    const searchLabwareByHint = async (_hint: string) => [];

    // First call: LLM emits a create_container event
    const args1: RunChatbotCompileArgs = {
      prompt: 'add a 96-well plate and seed HeLa cells',
      conversationId: 'c1',
      deps: {
        extractionService: makeMockExtractionService(),
        llmClient: makeMockLlmClientWithCreateContainer(),
        searchLabwareByHint,
        labStateCache: cache,
      },
    };

    const result1 = await runChatbotCompile(args1);

    // snapshotAfter should have labware from the first call
    expect(result1.terminalArtifacts.labStateDelta.snapshotAfter.labware).toBeDefined();
    const firstLabwareKeys = Object.keys(result1.terminalArtifacts.labStateDelta.snapshotAfter.labware);
    expect(firstLabwareKeys.length).toBeGreaterThan(0);

    // Cache should now contain the snapshot
    expect(cache.size()).toBe(1);
    const cachedSnap = cache.get('c1');
    expect(cachedSnap).toBeDefined();
    expect(Object.keys(cachedSnap!.labware).length).toBe(firstLabwareKeys.length);

    // Second call: LLM emits empty output (no new events)
    const args2: RunChatbotCompileArgs = {
      prompt: 'use that plate, add 10uL buffer to A1',
      conversationId: 'c1',
      deps: {
        extractionService: makeMockExtractionService(),
        llmClient: makeMockLlmClientEmpty(),
        searchLabwareByHint,
        labStateCache: cache,
      },
    };

    const result2 = await runChatbotCompile(args2);

    // The second call's snapshotAfter should STILL contain the labware
    // from the first call (because the cache supplied the prior snapshot)
    expect(result2.terminalArtifacts.labStateDelta.snapshotAfter.labware).toBeDefined();
    const secondLabwareKeys = Object.keys(result2.terminalArtifacts.labStateDelta.snapshotAfter.labware);
    expect(secondLabwareKeys.length).toBeGreaterThanOrEqual(firstLabwareKeys.length);

    // The mintCounter should be at least as high as the first call
    expect(result2.terminalArtifacts.labStateDelta.snapshotAfter.mintCounter).toBeGreaterThanOrEqual(
      result1.terminalArtifacts.labStateDelta.snapshotAfter.mintCounter,
    );
  });
});

// ---------------------------------------------------------------------------
// getDefaultLabStateCache singleton tests
// ---------------------------------------------------------------------------

describe('getDefaultLabStateCache', () => {
  it('returns the same instance on repeated calls', () => {
    const a = getDefaultLabStateCache();
    const b = getDefaultLabStateCache();
    expect(a).toBe(b);
  });
});
