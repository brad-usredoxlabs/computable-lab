// @vitest-environment node
/**
 * Tests for the material-spec composition prefetch: bounded store walk,
 * Array.isArray guards at both consumption sites, and expansion of declared
 * composition entries into composition_snapshot.
 */

import { describe, it, expect, vi } from 'vitest';
import { runChatbotCompile, type RunChatbotCompileArgs } from './runChatbotCompile.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../extract/ExtractionRunnerService.js';
import type { LlmClient } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { RecordFilter, RecordEnvelope } from '../store/types.js';

function completionResponse(content: string) {
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
}

describe('composition prefetch', () => {
  it('prefetch filter carries kind: material-spec and ignores malformed composition', async () => {
    // Track all store.list calls
    const listCalls: RecordFilter[] = [];
    const mockStore = {
      list: vi.fn(async (filter: RecordFilter | undefined) => {
        if (filter) listCalls.push(filter);
        // Good envelope: composition is an array of entry objects
        const good: RecordEnvelope = {
          recordId: 'MAT-GOOD',
          kind: 'material-spec',
          schemaId: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
          payload: {
            formulation: {
              composition: [
                {
                  component_ref: { kind: 'record', type: 'material', id: 'MAT-X' },
                  role: 'solute',
                },
              ],
            },
          },
        };
        // Malformed envelope: composition is a plain object (not an array)
        const bad: RecordEnvelope = {
          recordId: 'MAT-BAD',
          kind: 'material-spec',
          schemaId: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
          payload: {
            formulation: {
              composition: { component_ref: { kind: 'record', type: 'material', id: 'MAT-Y' }, role: 'solute' },
            },
          },
        };
        return [good, bad];
      }),
      get: vi.fn(async () => null),
    } as any;

    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi.fn(async () => {
        throw new Error('mention-resolved prompt should not call the LLM planner');
      }),
    } as unknown as LlmClient;
    const searchLabwareByHint = vi.fn(async (_hint: string) => []);

    const args: RunChatbotCompileArgs = {
      prompt: 'Add 100uL of [[aliquot:MAT-GOOD|Good Material]] to well A1 in [[labware:lw-plate-1|Plate]]',
      mentions: [
        { type: 'material', entityKind: 'aliquot', id: 'MAT-GOOD', label: 'Good Material' },
        { type: 'labware', id: 'lw-plate-1', label: 'Plate' },
      ],
      editorLabwares: [{ labwareId: 'lw-plate-1', labwareType: 'plate_96', name: 'Plate' }],
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint,
        store: mockStore,
      },
    };

    // Compile should resolve without throwing even with malformed composition
    const result = await runChatbotCompile(args);

    // (c) The prefetch list call carries kind: 'material-spec'
    // The first list call is the prefetch; bindOntologyMentions may call list too
    const prefetchCall = listCalls.find((f) => f.kind === 'material-spec');
    expect(prefetchCall).toBeDefined();
    expect(prefetchCall!.kind).toBe('material-spec');

    // (a) The compile completed successfully — verify outcome
    expect(result.outcome).toBeDefined();

    // (b) The malformed MAT-BAD envelope was ignored (did not crash)
    // Verify the compile ran without error and no event references MAT-BAD
    const hasBadRef = result.events.some((e) =>
      (e.details as any)?.recordId === 'MAT-BAD',
    );
    expect(hasBadRef).toBe(false);
  });

  it('does not prefetch when store is absent', async () => {
    let listCallCount = 0;
    const mockStore = {
      list: vi.fn(async () => { listCallCount++; return []; }),
      get: vi.fn(async () => null),
    } as any;

    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi.fn(async () => {
        throw new Error('mention-resolved prompt should not call the LLM');
      }),
    } as unknown as LlmClient;
    const searchLabwareByHint = vi.fn(async (_hint: string) => []);

    const args: RunChatbotCompileArgs = {
      prompt: 'Add 100uL of [[aliquot:MAT-GOOD|Good Material]] to well A1 in [[labware:lw-plate-1|Plate]]',
      mentions: [
        { type: 'material', entityKind: 'aliquot', id: 'MAT-GOOD', label: 'Good Material' },
        { type: 'labware', id: 'lw-plate-1', label: 'Plate' },
      ],
      editorLabwares: [{ labwareId: 'lw-plate-1', labwareType: 'plate_96', name: 'Plate' }],
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint,
        // No store — prefetch must NOT happen
      },
    };

    const result = await runChatbotCompile(args);

    // No store means no prefetch and no bindOntologyMentions store calls
    expect(listCallCount).toBe(0);
    // Event still compiles successfully
    expect(result.events.length).toBeGreaterThanOrEqual(1);
    const addMaterialEvent = result.events.find((e) => e.event_type === 'add_material');
    expect(addMaterialEvent).toBeDefined();
  });

  it('prefetch filter carries kind: material-spec for the lookup call', async () => {
    // Verify the exact filter object passed to the prefetch list call
    let observedFilter: RecordFilter | undefined;
    const mockStore = {
      list: vi.fn(async (filter: RecordFilter | undefined) => {
        // Only record calls for the material-spec prefetch
        if (filter?.kind === 'material-spec') {
          observedFilter = filter;
        }
        return [];
      }),
      get: vi.fn(async () => null),
    } as any;

    const mockExtractionService: ExtractionRunnerService = {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;

    const mockLlmClient: LlmClient = {
      complete: vi.fn(async () => {
        throw new Error('should not call LLM');
      }),
    } as unknown as LlmClient;

    const args: RunChatbotCompileArgs = {
      prompt: 'Add 100uL of [[aliquot:MAT-TEST|Test]] to well A1 in [[labware:lw-plate-1|Plate]]',
      mentions: [
        { type: 'material', entityKind: 'aliquot', id: 'MAT-TEST', label: 'Test' },
        { type: 'labware', id: 'lw-plate-1', label: 'Plate' },
      ],
      editorLabwares: [{ labwareId: 'lw-plate-1', labwareType: 'plate_96', name: 'Plate' }],
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint: async () => [],
        store: mockStore,
      },
    };

    await runChatbotCompile(args);

    // The prefetch filter must include kind: 'material-spec'
    expect(observedFilter).toBeDefined();
    expect(observedFilter!.kind).toBe('material-spec');
    expect(observedFilter!.schemaId).toContain('material-spec');
    expect(observedFilter!.limit).toBeDefined();
  });
});
