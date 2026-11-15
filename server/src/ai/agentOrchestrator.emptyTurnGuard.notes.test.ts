/**
 * L2-P1-EMPTY-TURN-CARD-2 / unit u4guard — the FINAL-ANSWER empty-turn guard
 * must reach the named-absence CARD on a NOTES-BEARING turn.
 *
 * Before u4guard the guard's condition ended in `!(result.notes?.length ?? 0)`:
 * any notes-bearing turn BYPASSED the guard entirely — so a turn that exited
 * success with zero events/draft and a notes prose naming a labware noun the
 * lab does not hold persisted with NO metadata at all (zero
 * clarificationRequests server-side — gate r9 defect 2, legC2 diagnostic
 * thread e018cfe4, "Nunc CryoBox 12x12"). A notes-only answer-intent turn is a
 * legitimate deliverable and must NOT be errored — but the named-absence card
 * must still ride clarificationRequests BESIDE the notes (success stays true,
 * no error), and the truly-empty no-notes named-cause error path stays
 * behaviorally unchanged (pinned in AgentOrchestrator.finalAnswerEmpty.test.ts
 * and clarifications.emptyTurn.test.ts).
 *
 * Driver idiom: AgentOrchestrator.finalAnswerEmpty.test.ts (content-only
 * assistant message, no tool_calls, finish_reason 'stop', forceDraftTool:false,
 * no attachments → the parseAgentFinalResponse final-answer arm).
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import type { AgentRequest, CompletionResponse } from './types.js';

const CRYOBOX_PROMPT = 'Place the Nunc CryoBox 12x12 on the deck.';

const SEED_LABWARE = {
  recordId: 'LBW-cryobox-nunc-1',
  schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
  payload: { kind: 'labware', name: 'Nunc CryoBox 12x12' },
};

function mockStore(withCryobox: boolean) {
  const records = withCryobox ? [SEED_LABWARE] : [];
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => records.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      records.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
  };
}

/** One assistant message, content ONLY (no tool_calls): a notes-only final answer. */
function notesOnlyModel() {
  const content =
    '{"events":[],"notes":["I could not find that cryobox in the lab records, so nothing was drafted."]}';
  const completeStream = vi.fn(async function* () {
    yield {
      id: 'resp-1',
      choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: 'stop' }],
    } as unknown as CompletionResponse;
  });
  return { client: { complete: vi.fn(), completeStream } as never };
}

async function runNotesTurn(prompt: string, withCryobox: boolean) {
  const store = mockStore(withCryobox);
  const orchestrator = createAgentOrchestrator(
    notesOnlyModel().client,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2 },
    {
      store: store as never,
      resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
      searchLabwareByHint: createLabwareLookup(store as never) as never,
    },
  );
  return orchestrator.run({
    prompt,
    surface: 'workspace.deck' as const,
    forceDraftTool: false,
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      runId: 'RUN-empty-turn-guard-notes',
    },
  } as unknown as AgentRequest);
}

describe('L2-P1-EMPTY-TURN-CARD-2 u4guard — the notes-bearing arm reaches the named-absence CARD', () => {
  it('AC1: notes + zero events + a labware noun the lab does NOT hold carries the absence card, no error', async () => {
    const result = await runNotesTurn(CRYOBOX_PROMPT, false);
    // the notes deliverable is preserved — NOT errored, success stays true
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.notes).toHaveLength(1);
    expect((result.events ?? []).length).toBe(0);
    // RED on base 515c43a94: the guard bypassed on notes → the key was never set.
    expect(result.clarificationRequests).toHaveLength(1);
    const [request] = result.clarificationRequests!;
    expect(request!.kind).toBe('labware');
    expect(request!.menuProvider).toBe('/l');
    expect(request!.absence?.mention).toBe('Nunc CryoBox 12x12');
    expect(request!.absence?.reason).toBe("Not in this lab's records: Nunc CryoBox 12x12");
    expect(request!.options).toEqual([]);
  });

  it('AC2a: notes + a noun the lab DOES hold → unchanged (no error, key ABSENT)', async () => {
    const result = await runNotesTurn(CRYOBOX_PROMPT, true);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.notes).toHaveLength(1);
    expect('clarificationRequests' in result).toBe(false);
  });

  it('AC2b: notes + no labware noun → unchanged (no error, key ABSENT)', async () => {
    const result = await runNotesTurn('How long should the incubation run?', false);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.notes).toHaveLength(1);
    expect('clarificationRequests' in result).toBe(false);
  });
});
