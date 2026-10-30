/**
 * Tests for LabState threading through runChatbotCompile.
 *
 * Verifies that:
 * (a) omitting priorLabState gives a labStateDelta with events applied to emptyLabState
 * (b) passing a priorLabState with pre-existing labware carries it through
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { runChatbotCompile, type RunChatbotCompileArgs } from './runChatbotCompile.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../extract/ExtractionRunnerService.js';
import type { LlmClient } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { CompletionRequest, CompletionResponse } from './types.js';
import type { LabStateSnapshot } from '../compiler/state/LabState.js';
import { emptyLabState } from '../compiler/state/LabState.js';

describe('runChatbotCompile — LabState threading', () => {
  // -----------------------------------------------------------------------
  // Shared stubs
  // -----------------------------------------------------------------------

  function makeMockExtractionService(): ExtractionRunnerService {
    return {
      run: vi.fn(async (req: RunExtractionServiceArgs) => ({
        target_kind: req.target_kind,
        source: req.source,
        candidates: [
          {
            target_kind: 'labware-spec',
            hint: '96-well plate',
            reason: 'needed for seeding',
            confidence: 0.9,
          },
        ],
        diagnostics: [],
      })),
    } as unknown as ExtractionRunnerService;
  }

  /**
   * LLM client that returns a create_container event (which produces
   * a create_container PlateEventPrimitive) and an add_material event.
   */
  function makeMockLlmClientWithCreateContainer(): LlmClient {
    return {
      complete: vi.fn(async (req: CompletionRequest): Promise<CompletionResponse> => {
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
          candidateLabwares: [
            { hint: '96-well plate', reason: 'needed for seeding' },
          ],
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

  // -----------------------------------------------------------------------
  // Test (a): omitting priorLabState
  // -----------------------------------------------------------------------

  it('omitting priorLabState produces labStateDelta with events applied to emptyLabState', async () => {
    const searchLabwareByHint = async (_hint: string) => [];

    const args: RunChatbotCompileArgs = {
      prompt: 'add a 96-well plate and seed HeLa cells',
      deps: {
        extractionService: makeMockExtractionService(),
        llmClient: makeMockLlmClientWithCreateContainer(),
        searchLabwareByHint,
      },
    };

    const result = await runChatbotCompile(args);

    // labStateDelta must be present
    expect(result.terminalArtifacts.labStateDelta).toBeDefined();
    const delta = result.terminalArtifacts.labStateDelta!;

    // snapshotAfter should have a deck entry (from create_container)
    expect(delta.snapshotAfter.deck.length).toBeGreaterThan(0);

    // turnIndex should be 1 (incremented from 0)
    expect(delta.snapshotAfter.turnIndex).toBe(1);

    // mintCounter should be 1 (one container created)
    expect(delta.snapshotAfter.mintCounter).toBe(1);

    // labware should have at least one instance
    expect(Object.keys(delta.snapshotAfter.labware).length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Test (b): passing a priorLabState with pre-existing labware
  // -----------------------------------------------------------------------

  it('passing a priorLabState carries pre-existing labware into snapshotAfter', async () => {
    const searchLabwareByHint = async (_hint: string) => [];

    // Build a priorLabState with one pre-existing labware instance
    const priorLabState: LabStateSnapshot = {
      ...emptyLabState(),
      deck: [{ slot: 'A', labwareInstanceId: 'LWI-1' }],
      labware: {
        'LWI-1': {
          instanceId: 'LWI-1',
          labwareType: 'reservoir-300ml',
          slot: 'A',
          orientation: 'landscape',
          wells: {},
        },
      },
      mintCounter: 1,
      turnIndex: 0,
    };

    const args: RunChatbotCompileArgs = {
      prompt: 'add a 96-well plate and seed HeLa cells',
      priorLabState,
      deps: {
        extractionService: makeMockExtractionService(),
        llmClient: makeMockLlmClientWithCreateContainer(),
        searchLabwareByHint,
      },
    };

    const result = await runChatbotCompile(args);

    // labStateDelta must be present
    expect(result.terminalArtifacts.labStateDelta).toBeDefined();
    const delta = result.terminalArtifacts.labStateDelta!;

    // snapshotAfter should still contain the pre-existing labware
    expect(delta.snapshotAfter.labware['LWI-1']).toBeDefined();
    expect(delta.snapshotAfter.labware['LWI-1'].labwareType).toBe('reservoir-300ml');

    // turnIndex should be 1 (incremented from 0)
    expect(delta.snapshotAfter.turnIndex).toBe(1);

    // mintCounter should be 2 (one pre-existing + one new container)
    expect(delta.snapshotAfter.mintCounter).toBe(2);

    // deck should have at least 2 entries (reservoir + new plate)
    expect(delta.snapshotAfter.deck.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // L2-LABSTATE-CONTENTS-1 regression legs (spec §8): the live product path
  // (the REAL runChatbotCompile pipeline — expand_biology_verbs emits the
  // SHIPPED canonical shape, lab_state folds it) now populates the contents
  // ledger. These are the fold->recompile legs: the symbolic labwareId
  // resolves to a snapshot instance via the DATA-declared never-guess ladder,
  // the string material normalizes without invented ids. No signature change.
  // -------------------------------------------------------------------------

  /** The shipped canonical-shape candidates: a create (slot + labwareType —
   *  NO label carrier, the OQ-3 live shape) + an add_material the REAL
   *  expander lowers to the per-well legacy branch (a STRING material, a
   *  SYMBOLIC top-level labwareId, a details-level volumeUl). `emitCreate`
   *  off => the add alone (the persistence / never-guess legs — the prior
   *  snapshot already holds the deck; a second create would mint a third). */
  function makeMockLlmClientWithCanonicalShape(
    material: string,
    range: string,
    emitCreate = true,
  ): LlmClient {
    const candidateEvents: Array<Record<string, unknown>> = [];
    if (emitCreate) {
      candidateEvents.push({ verb: 'create_container', slot: 'target', labwareType: '96-well-plate' });
    }
    candidateEvents.push({ verb: 'add_material', labware: '96-well-plate', wells: range, material, volume_uL: 100 });
    return {
      complete: vi.fn(async (req: CompletionRequest): Promise<CompletionResponse> => {
        const content = JSON.stringify({
          candidateEvents,
          candidateLabwares: [{ hint: '96-well plate', reason: 'needed' }],
          unresolvedRefs: [],
        });
        return {
          id: 'test-response-id',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        };
      }),
    } as unknown as LlmClient;
  }

  it('(L2) the live product path populates the ledger: the SHIPPED symbolic add_material (string material + symbolic labwareId) folds to contents via the DATA ladder', async () => {
    const searchLabwareByHint = async (_hint: string) => [];
    const args: RunChatbotCompileArgs = {
      prompt: 'add material A to A1-H1',
      deps: {
        extractionService: makeMockExtractionService(),
        llmClient: makeMockLlmClientWithCanonicalShape('A', 'A1..H1'),
        searchLabwareByHint,
      },
    };
    const result = await runChatbotCompile(args);
    const delta = result.terminalArtifacts.labStateDelta!;
    // Exactly ONE labware instance (the create) — the symbolic add did NOT
    // mint a second (never-guess).
    const ids = Object.keys(delta.snapshotAfter.labware);
    expect(ids).toHaveLength(1);
    const lw = delta.snapshotAfter.labware[ids[0]!];
    // The 8 per-well events (the expander pre-expands 'A1..H1') folded onto
    // the single instance via rung R3 (unique declared labwareType): contents
    // are in the ledger — the dead-write the D13-B ruling names is gone.
    const wells = Object.keys(lw.wells);
    expect(wells).toHaveLength(8);
    for (const w of wells) {
      expect(lw.wells[w]![0]!.materialId).toBe('A'); // the verbatim string (no invented id)
      expect(lw.wells[w]![0]!.kind).toBe('A');
      expect(lw.wells[w]![0]!.volumeUl).toBe(100);
    }
  });

  it('(L2) persistence: a prior turn contents ride through — a second add to a disjoint range lands on top (turn 1b reads turn 1)', async () => {
    const searchLabwareByHint = async (_hint: string) => [];
    // A prior snapshot whose plate ALREADY carries turn-1 contents (A1..H1 = A).
    const priorLabState: LabStateSnapshot = {
      ...emptyLabState(),
      deck: [{ slot: 'target', labwareInstanceId: 'LW-PRIOR' }],
      labware: {
        'LW-PRIOR': {
          instanceId: 'LW-PRIOR',
          labwareType: '96-well-plate',
          slot: 'target',
          orientation: 'landscape',
          wells: {
            A1: [{ materialId: 'A', kind: 'A', volumeUl: 100 }],
            H1: [{ materialId: 'A', kind: 'A', volumeUl: 100 }],
          },
        },
      },
      mintCounter: 1,
      turnIndex: 1,
    };
    const args: RunChatbotCompileArgs = {
      prompt: 'add material B to A2-H2',
      priorLabState,
      deps: {
        extractionService: makeMockExtractionService(),
        llmClient: makeMockLlmClientWithCanonicalShape('B', 'A2..H2', false),
        searchLabwareByHint,
      },
    };
    const result = await runChatbotCompile(args);
    const delta = result.terminalArtifacts.labStateDelta!;
    // The prior instance is STILL the single labware (no re-create, no second).
    const ids = Object.keys(delta.snapshotAfter.labware);
    expect(ids).toHaveLength(1);
    const lw = delta.snapshotAfter.labware[ids[0]!];
    // Turn-1 contents preserved (A1/A2..H1..H1) AND turn-1b contents added
    // (A2..H2 = B) — the symbolic '96-well-plate' resolved to the PRIOR
    // instance (persistence), not a fresh mint.
    expect(lw.wells['A1']![0]!.materialId).toBe('A');
    expect(lw.wells['H1']![0]!.materialId).toBe('A');
    const bWells = Object.keys(lw.wells).filter((w) => lw.wells[w]![0]!.materialId === 'B');
    expect(bWells).toHaveLength(8);
  });

  it('(L2) never-guess negative: two same-type plates + a symbolic add => NO contents (the R3 tie is terminal, no pick, no second labware)', async () => {
    const searchLabwareByHint = async (_hint: string) => [];
    // A prior with TWO plates of the SAME declared type (the R3 TIE).
    const priorLabState: LabStateSnapshot = {
      ...emptyLabState(),
      deck: [
        { slot: 'S1', labwareInstanceId: 'LW-1' },
        { slot: 'S2', labwareInstanceId: 'LW-2' },
      ],
      labware: {
        'LW-1': { instanceId: 'LW-1', labwareType: '96-well-plate', slot: 'S1', orientation: 'landscape', wells: {} },
        'LW-2': { instanceId: 'LW-2', labwareType: '96-well-plate', slot: 'S2', orientation: 'landscape', wells: {} },
      },
      mintCounter: 2,
      turnIndex: 1,
    };
    const args: RunChatbotCompileArgs = {
      prompt: 'add material A to A1-H1',
      priorLabState,
      deps: {
        extractionService: makeMockExtractionService(),
        llmClient: makeMockLlmClientWithCanonicalShape('A', 'A1..H1', false),
        searchLabwareByHint,
      },
    };
    const result = await runChatbotCompile(args);
    const delta = result.terminalArtifacts.labStateDelta!;
    // Still exactly the TWO prior instances (no third minted, no pick).
    const ids = Object.keys(delta.snapshotAfter.labware);
    expect(ids.sort()).toEqual(['LW-1', 'LW-2']);
    // The symbolic '96-well-plate' is a TIE at R3 => terminal no-op: NEITHER
    // plate got contents (never-guess — no pick among the tie).
    for (const id of ids) {
      expect(Object.keys(delta.snapshotAfter.labware[id]!.wells)).toHaveLength(0);
    }
  });
});
