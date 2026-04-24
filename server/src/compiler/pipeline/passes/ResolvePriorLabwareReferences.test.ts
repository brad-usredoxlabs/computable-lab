/**
 * Tests for the resolve_prior_labware_references pass.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createResolvePriorLabwareReferencesPass,
  type ResolvePriorLabwareReferencesOutput,
  type PriorLabwareRef,
  type LlmClient,
  type AiPrecompileOutput,
} from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import { emptyLabState } from '../../../compiler/state/LabState.js';
import { runChatbotCompile } from '../../../ai/runChatbotCompile.js';
import { createInMemoryLabStateCache } from '../../../compiler/state/LabStateCache.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../../../extract/ExtractionDraftBuilder.js';
import type { CompletionRequest, CompletionResponse } from '../../../ai/types.js';
import type { FileAttachment } from '../../../ai/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockState(
  priorLabwareRefs: PriorLabwareRef[] | undefined,
  labState?: ReturnType<typeof emptyLabState>,
): PipelineState {
  return {
    input: { labState: labState ?? emptyLabState() },
    context: {},
    meta: {},
    outputs: new Map([
      ['ai_precompile', { priorLabwareRefs: priorLabwareRefs ?? [] }],
    ]),
    diagnostics: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createResolvePriorLabwareReferencesPass', () => {
  it('resolves a prior labware ref by kindHint + contentHint', () => {
    const prior = emptyLabState();
    prior.labware['plate-001'] = {
      instanceId: 'plate-001',
      labwareType: '96-well-deepwell-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {
        A1: [{ materialId: 'FS_1', kind: 'fecal-sample' }],
        A2: [{ materialId: 'FS_2', kind: 'fecal-sample' }],
      },
    };

    const refs: PriorLabwareRef[] = [
      {
        hint: '96-well deepwell plate of fecal samples',
        kindHint: '96-well deepwell plate',
        contentHint: 'fecal samples',
      },
    ];

    const pass = createResolvePriorLabwareReferencesPass();
    const result = pass.run({
      pass_id: 'resolve_prior_labware_references',
      state: makeMockState(refs, prior),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolvePriorLabwareReferencesOutput;
    expect(output.resolvedLabwareRefs).toHaveLength(1);
    expect(output.resolvedLabwareRefs[0]).toMatchObject({
      hint: '96-well deepwell plate of fecal samples',
      matched: {
        instanceId: 'plate-001',
        labwareType: '96-well-deepwell-plate',
      },
    });
    expect(output.unresolved).toHaveLength(0);
  });

  it('produces a gap when no matching labware exists', () => {
    const prior = emptyLabState();
    prior.labware['plate-001'] = {
      instanceId: 'plate-001',
      labwareType: '96-well-deepwell-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {
        A1: [{ materialId: 'FS_1', kind: 'fecal-sample' }],
      },
    };

    const refs: PriorLabwareRef[] = [
      {
        hint: 'PCR plate of binding buffer',
        kindHint: 'PCR plate',
        contentHint: 'binding buffer',
      },
    ];

    const pass = createResolvePriorLabwareReferencesPass();
    const result = pass.run({
      pass_id: 'resolve_prior_labware_references',
      state: makeMockState(refs, prior),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolvePriorLabwareReferencesOutput;
    expect(output.resolvedLabwareRefs).toHaveLength(0);
    expect(output.unresolved).toHaveLength(1);
    expect(output.unresolved[0]).toMatchObject({
      hint: 'PCR plate of binding buffer',
      reason: 'no matching labware in prior snapshot',
    });
  });

  it('handles empty priorLabwareRefs gracefully', () => {
    const pass = createResolvePriorLabwareReferencesPass();
    const result = pass.run({
      pass_id: 'resolve_prior_labware_references',
      state: makeMockState([]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolvePriorLabwareReferencesOutput;
    expect(output.resolvedLabwareRefs).toHaveLength(0);
    expect(output.unresolved).toHaveLength(0);
  });

  it('handles missing ai_precompile output gracefully', () => {
    const pass = createResolvePriorLabwareReferencesPass();
    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'resolve_prior_labware_references',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolvePriorLabwareReferencesOutput;
    expect(output.resolvedLabwareRefs).toHaveLength(0);
    expect(output.unresolved).toHaveLength(0);
  });

  it('pass id is resolve_prior_labware_references and family is disambiguate', () => {
    const pass = createResolvePriorLabwareReferencesPass();
    expect(pass.id).toBe('resolve_prior_labware_references');
    expect(pass.family).toBe('disambiguate');
  });

  it('resolves by contentHint only when kindHint is absent', () => {
    const prior = emptyLabState();
    prior.labware['plate-001'] = {
      instanceId: 'plate-001',
      labwareType: '96-well-deepwell-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {
        A1: [{ materialId: 'FS_1', kind: 'fecal-sample' }],
      },
    };

    const refs: PriorLabwareRef[] = [
      {
        hint: 'that plate we made',
        contentHint: 'fecal samples',
      },
    ];

    const pass = createResolvePriorLabwareReferencesPass();
    const result = pass.run({
      pass_id: 'resolve_prior_labware_references',
      state: makeMockState(refs, prior),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolvePriorLabwareReferencesOutput;
    expect(output.resolvedLabwareRefs).toHaveLength(1);
    expect(output.resolvedLabwareRefs[0].matched.instanceId).toBe('plate-001');
  });

  it('resolves multiple refs, some matched and some not', () => {
    const prior = emptyLabState();
    prior.labware['plate-001'] = {
      instanceId: 'plate-001',
      labwareType: '96-well-deepwell-plate',
      slot: 'A1',
      orientation: 'landscape',
      wells: {
        A1: [{ materialId: 'FS_1', kind: 'fecal-sample' }],
      },
    };
    prior.labware['plate-002'] = {
      instanceId: 'plate-002',
      labwareType: 'PCR-plate',
      slot: 'B1',
      orientation: 'landscape',
      wells: {
        A1: [{ materialId: 'BB_1', kind: 'binding-buffer' }],
      },
    };

    const refs: PriorLabwareRef[] = [
      {
        hint: 'plate of fecal samples',
        kindHint: '96-well deepwell plate',
        contentHint: 'fecal samples',
      },
      {
        hint: 'PCR plate of binding buffer',
        kindHint: 'PCR plate',
        contentHint: 'binding buffer',
      },
      {
        hint: 'that reservoir we used',
        kindHint: 'reservoir',
        contentHint: 'wash buffer',
      },
    ];

    const pass = createResolvePriorLabwareReferencesPass();
    const result = pass.run({
      pass_id: 'resolve_prior_labware_references',
      state: makeMockState(refs, prior),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolvePriorLabwareReferencesOutput;
    expect(output.resolvedLabwareRefs).toHaveLength(2);
    expect(output.unresolved).toHaveLength(1);
    expect(output.unresolved[0]).toMatchObject({
      hint: 'that reservoir we used',
      reason: 'no matching labware in prior snapshot',
    });
  });

  it('empty labware in snapshot produces gaps for all refs', () => {
    const prior = emptyLabState();
    // No labware at all

    const refs: PriorLabwareRef[] = [
      {
        hint: '96-well deepwell plate of fecal samples',
        kindHint: '96-well deepwell plate',
        contentHint: 'fecal samples',
      },
    ];

    const pass = createResolvePriorLabwareReferencesPass();
    const result = pass.run({
      pass_id: 'resolve_prior_labware_references',
      state: makeMockState(refs, prior),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolvePriorLabwareReferencesOutput;
    expect(output.resolvedLabwareRefs).toHaveLength(0);
    expect(output.unresolved).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// End-to-end test via runChatbotCompile (spec requirement 7c)
// ---------------------------------------------------------------------------

describe('resolve_prior_labware_references — end-to-end via runChatbotCompile', () => {
  it('cross-turn: Prompt 1 warms cache, second prompt resolves priorLabwareRef', async () => {
    // Build a minimal extraction service stub
    const extractionService = {
      run: async (_req: RunExtractionServiceArgs): Promise<ExtractionDraftBody> => ({
        target_kind: _req.target_kind,
        source: _req.source,
        candidates: [],
        diagnostics: [],
      }),
    } as unknown as ExtractionRunnerService;

    // Build a searchLabwareByHint stub
    const searchLabwareByHint = async (_hint: string): Promise<Array<{ recordId: string; title: string }>> => [];

    // Create a shared cache keyed by conversationId
    const cache = createInMemoryLabStateCache();

    // --- Turn 1: compile Prompt 1 (mint-samples) to warm the cache ---
    const turn1LlmClient: LlmClient = {
      complete: async (_req: CompletionRequest): Promise<CompletionResponse> => {
        const turn1Output: AiPrecompileOutput = {
          candidateEvents: [],
          candidateLabwares: [
            { hint: '96-well-deepwell-plate', reason: 'explicit placement', deckSlot: 'target' },
          ],
          unresolvedRefs: [],
          mintMaterials: [
            {
              template: 'fecal-sample',
              count: 96,
              namingPattern: 'FS_{n}',
              placementLabwareHint: '96-well-deepwell-plate',
              wellSpread: 'all',
            },
          ],
        };
        const content = JSON.stringify(turn1Output);
        return {
          id: 'turn1-mock',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
      },
    };

    const turn1Result = await runChatbotCompile({
      prompt: 'Place a 96-well deepwell plate on the target destination and add fecal samples to all 96 wells.',
      deps: {
        extractionService,
        llmClient: turn1LlmClient,
        searchLabwareByHint,
        labStateCache: cache,
      },
      conversationId: 'cross-turn-test',
    });

    // Turn 1 should succeed and produce events
    expect(turn1Result.outcome).toBe('complete');
    expect(turn1Result.terminalArtifacts.events.length).toBeGreaterThan(0);

    // --- Turn 2: compile a trivial prompt with a priorLabwareRef ---
    const turn2Output: AiPrecompileOutput = {
      candidateEvents: [],
      candidateLabwares: [],
      unresolvedRefs: [],
      priorLabwareRefs: [
        {
          hint: '96-well deepwell plate of fecal samples',
          kindHint: '96-well deepwell plate',
          contentHint: 'fecal samples',
        },
      ],
      mintMaterials: [],
    };

    const turn2LlmClient: LlmClient = {
      complete: async (_req: CompletionRequest): Promise<CompletionResponse> => {
        const content = JSON.stringify(turn2Output);
        return {
          id: 'turn2-mock',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
      },
    };

    const turn2Result = await runChatbotCompile({
      prompt: 'Use that plate, add 10 uL binding buffer to A1.',
      deps: {
        extractionService,
        llmClient: turn2LlmClient,
        searchLabwareByHint,
        labStateCache: cache,
      },
      conversationId: 'cross-turn-test',
    });

    // Turn 2 should resolve the prior labware ref
    expect(turn2Result.terminalArtifacts.resolvedLabwareRefs).toBeDefined();
    expect(turn2Result.terminalArtifacts.resolvedLabwareRefs!.length).toBe(1);
    expect(turn2Result.terminalArtifacts.resolvedLabwareRefs![0].hint).toBe(
      '96-well deepwell plate of fecal samples',
    );
    expect(turn2Result.terminalArtifacts.resolvedLabwareRefs![0].matched.instanceId).toBe(
      '96-well-deepwell-plate',
    );
    expect(turn2Result.terminalArtifacts.resolvedLabwareRefs![0].matched.labwareType).toBe(
      '96-well-deepwell-plate',
    );
  });
});
