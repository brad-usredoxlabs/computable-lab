/**
 * Tests for deck-slot binding on labware-resolve (spec-012).
 *
 * Verifies that:
 * - AiPrecompileOutput.candidateLabwares gains optional deckSlot field
 * - resolve_labware pass carries deckSlot through to AiLabwareAdditionPatch
 * - runChatbotCompile populates TerminalArtifacts.deckLayoutPlan
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import type { ExtractionRunnerService } from '../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../extract/ExtractionDraftBuilder.js';
import type { LlmClient } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { AiPrecompileOutput } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import { runChatbotCompile } from './runChatbotCompile.js';

describe('spec-012: deck-slot binding on labware-resolve', () => {
  it('runChatbotCompile: deckSlot on candidateLabwares → deckLayoutPlan.pinned', async () => {
    // --- Mock LLM: emit candidateLabwares with deckSlot ---
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [],
      candidateLabwares: [
        { hint: '96-well deepwell plate', deckSlot: 'target' },
      ],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    // --- Mock extraction service (no-op) ---
    const mockExtractionService = {
      run: vi.fn().mockResolvedValue({
        candidates: [],
        diagnostics: [],
      } as ExtractionDraftBody),
    } as unknown as ExtractionRunnerService;

    // --- Mock searchLabwareByHint: zero matches → labwareAddition ---
    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([]);

    // --- Invoke runChatbotCompile directly ---
    const result = await runChatbotCompile({
      prompt: 'place a 96-well deepwell plate on the target destination',
      attachments: [],
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint: mockSearchLabwareByHint,
      },
    });

    // --- Verify: deckLayoutPlan.pinned contains the pinned entry ---
    expect(result.terminalArtifacts.deckLayoutPlan).toBeDefined();
    expect(result.terminalArtifacts.deckLayoutPlan!.pinned).toEqual([
      { slot: 'target', labwareHint: '96-well deepwell plate' },
    ]);
    // --- Verify: unassigned is empty ---
    expect(result.terminalArtifacts.deckLayoutPlan!.unassigned).toEqual([]);
    // --- Verify: labwareAdditions carries deckSlot ---
    expect(result.labwareAdditions).toHaveLength(1);
    expect(result.labwareAdditions[0]!.deckSlot).toBe('target');
  });

  it('runChatbotCompile: multiple labwares with mixed deckSlot presence', async () => {
    // --- Mock LLM: emit candidateLabwares with mixed deckSlot ---
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [],
      candidateLabwares: [
        { hint: '96-well deepwell plate', deckSlot: 'target' },
        { hint: 'reservoir', deckSlot: 'C1' },
        { hint: 'unlabeled plate' }, // no deckSlot
      ],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const mockExtractionService = {
      run: vi.fn().mockResolvedValue({
        candidates: [],
        diagnostics: [],
      } as ExtractionDraftBody),
    } as unknown as ExtractionRunnerService;

    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([]);

    const result = await runChatbotCompile({
      prompt: 'add labware',
      attachments: [],
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint: mockSearchLabwareByHint,
      },
    });

    // --- Verify: pinned has 2 entries ---
    expect(result.terminalArtifacts.deckLayoutPlan!.pinned).toEqual([
      { slot: 'target', labwareHint: '96-well deepwell plate' },
      { slot: 'C1', labwareHint: 'reservoir' },
    ]);
    // --- Verify: unassigned has 1 entry ---
    expect(result.terminalArtifacts.deckLayoutPlan!.unassigned).toEqual(['unlabeled plate']);
  });

  it('runChatbotCompile: no candidateLabwares → empty deckLayoutPlan', async () => {
    // --- Mock LLM: no candidateLabwares ---
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [],
      candidateLabwares: [],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const mockExtractionService = {
      run: vi.fn().mockResolvedValue({
        candidates: [],
        diagnostics: [],
      } as ExtractionDraftBody),
    } as unknown as ExtractionRunnerService;

    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([]);

    const result = await runChatbotCompile({
      prompt: 'just add material',
      attachments: [],
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint: mockSearchLabwareByHint,
      },
    });

    // --- Verify: deckLayoutPlan is empty ---
    expect(result.terminalArtifacts.deckLayoutPlan!.pinned).toEqual([]);
    expect(result.terminalArtifacts.deckLayoutPlan!.unassigned).toEqual([]);
  });

  it('runChatbotCompile: labware resolved (not added) → no labwareAddition for it', async () => {
    // --- Mock LLM: emit candidateLabwares with deckSlot ---
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [],
      candidateLabwares: [
        { hint: '96-well deepwell plate', deckSlot: 'target' },
      ],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const mockExtractionService = {
      run: vi.fn().mockResolvedValue({
        candidates: [],
        diagnostics: [],
      } as ExtractionDraftBody),
    } as unknown as ExtractionRunnerService;

    // --- Mock searchLabwareByHint: one match → resolved, not added ---
    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([
      { recordId: 'existing-plate-1', title: '96-well deepwell plate' },
    ]);

    const result = await runChatbotCompile({
      prompt: 'use existing plate on target',
      attachments: [],
      deps: {
        extractionService: mockExtractionService,
        llmClient: mockLlmClient,
        searchLabwareByHint: mockSearchLabwareByHint,
      },
    });

    // --- Verify: no labwareAdditions (it was resolved, not added) ---
    expect(result.labwareAdditions).toHaveLength(0);
    // --- Verify: deckLayoutPlan is empty (no additions to pin/assign) ---
    expect(result.terminalArtifacts.deckLayoutPlan!.pinned).toEqual([]);
    expect(result.terminalArtifacts.deckLayoutPlan!.unassigned).toEqual([]);
  });
});
