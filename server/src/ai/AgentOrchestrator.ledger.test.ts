/**
 * PB-CH-8 — the `query_workstate_history` dispatch branch on agent_intent
 * (the ONE forced tool; matrix rows 9/11 assembly leg).
 *
 * Contract under test (mock inference client per the workstateProposal
 * convention):
 *  1. A query_workstate_history turn with a RESOLVED actor calls the ledger
 *     host exactly once with the model's VERBS AND TERMS only + the actor the
 *     request carried, emits ONE `ledger_answer` event (the server-built
 *     envelope verbatim) and, for `found`, ONE `workstate_proposal` built by
 *     the HOST from the snapshot — never by the model.
 *  2. A `no-history` outcome emits NO workstate_proposal (no card, no
 *     movement) and the AgentResult note is the server's honest answerText.
 *  3. NO ledger host wired ⇒ honest declared failure (success:false), never a
 *     silent no-op and never a header-fallback read.
 *  4. NO actor on the request ⇒ the host receives null and the ledger's own
 *     actor-unresolved refusal rides the answer frame (the orchestrator never
 *     substitutes an identity).
 *  5. Store tripwires prove the whole turn performs ZERO record mutations.
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';
import type { LedgerQueryHost, LedgerQueryResult } from '../workspace-session/ledgerQuery.js';

/** A store whose every write side is a tripwire. */
function mutationTripwire() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => { throw new Error('query_workstate_history must NEVER reach store.create'); }),
    update: vi.fn(async () => { throw new Error('query_workstate_history must NEVER reach store.update'); }),
    delete: vi.fn(async () => { throw new Error('query_workstate_history must NEVER reach store.delete'); }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

/** A fake model that answers with exactly one agent_intent tool call. */
function intentClient(args: unknown): { client: InferenceClient } {
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    yield {
      id: 'resp-ledger',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-ledger',
            type: 'function',
            function: { name: AGENT_INTENT_TOOL_NAME, arguments: JSON.stringify(args) },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
  });
  return { client: { complete: vi.fn(), completeStream } };
}

const FOUND_RESULT: LedgerQueryResult = {
  answer: {
    status: 'found',
    asOf: '2026-10-07T10:05:00.000Z',
    capturedAt: '2026-10-07T10:00:00.000Z',
    disclosure: 'as captured at 2026-10-07T10:00:00.000Z — nearest stored snapshot at or before 2026-10-07T10:05:00.000Z',
    links: ['EVT-1'],
    answerText: 'Workstate as captured at 2026-10-07T10:00:00.000Z.\nLinked lab events: EVT-1',
  },
  workstateProposal: {
    operation: 'compose-workstate',
    tabs: [{ surface: 'run-plan', target: { recordId: 'RUN-1' } }],
    activeTab: { index: 0 },
  },
};

const NO_HISTORY_RESULT: LedgerQueryResult = {
  answer: {
    status: 'no-history',
    asOf: '2026-09-01T09:00:00.000Z',
    reason: 'predates-first-capture',
    labEvents: [{ recordId: 'EVT-1', action: 'run.status-changed', occurredAt: '2026-09-01T08:50:00.000Z', subjectId: 'RUN-1' }],
    answerText: 'No workstate history exists for that time — it predates your first stored snapshot.',
  },
};

/** Adversarial DEFECT 1 fixture: the snapshot exists but a tab no longer maps
 *  — the host returns the honest found answer + a NAMED diagnostic and NO
 *  proposal. The orchestrator must FORWARD the diagnostic (visible), never
 *  absorb it (spec §4: "visible diagnostic, never a guessed route"). */
const FOUND_UNREATTACHABLE_RESULT: LedgerQueryResult = {
  answer: {
    status: 'found',
    asOf: '2026-10-07T10:05:00.000Z',
    capturedAt: '2026-10-07T10:00:00.000Z',
    disclosure: 'as captured at 2026-10-07T10:00:00.000Z — nearest stored snapshot at or before 2026-10-07T10:05:00.000Z',
    answerText: 'Workstate as captured at 2026-10-07T10:00:00.000Z.',
  },
  diagnostics: [
    {
      code: 'UNMAPPABLE_SNAPSHOT_TAB',
      path: '/snapshot/tabs/0/surface',
      message: 'Snapshot tab "record-edit" (PRT-1) no longer maps to a registered surface in schema/registry/surfaces/surfaces.yaml. No route is guessed; the compile gate reports it.',
    },
  ],
};

async function runLedgerTurn(
  args: unknown,
  opts: { host?: LedgerQueryHost; actor?: string | null } = {},
) {
  const { client } = intentClient(args);
  const executeTool = vi.fn(async () => { throw new Error('query_workstate_history must NEVER execute a tool'); });
  const store = mutationTripwire();
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    client,
    { getToolDefinitions: () => [], executeTool },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    { store: store as never, ...(opts.host ? { ledgerQuery: opts.host } : {}) },
  );
  const result = await orchestrator.run({
    prompt: 'what was the workstate history of the ROS run?',
    forceDraftTool: true,
    onEvent: (event) => events.push(event),
    ...(opts.actor !== undefined ? { ledgerActor: opts.actor } : {}),
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    },
  });
  return { result, events, executeTool, store };
}

describe('AgentOrchestrator — query_workstate_history branch (PB-CH-8)', () => {
  it('a found query emits ONE ledger_answer (server envelope verbatim) + ONE server-built workstate_proposal, host called once with terms + actor only', async () => {
    const runSpy = vi.fn(async () => FOUND_RESULT);
    const host = { run: runSpy } as unknown as LedgerQueryHost;

    const { result, events, executeTool, store } = await runLedgerTurn(
      { intent: 'query_workstate_history', ledgerQuery: { term: 'ROS run' } },
      { host, actor: 'USR-A' },
    );

    // Host called EXACTLY once, with verbs/terms only + the resolved actor.
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith({ term: 'ROS run' }, 'USR-A');

    const answers = events.filter((e) => e.type === 'ledger_answer');
    expect(answers).toHaveLength(1);
    expect((answers[0] as Extract<AgentEvent, { type: 'ledger_answer' }>).answer).toEqual(FOUND_RESULT.answer);

    const proposals = events.filter((e) => e.type === 'workstate_proposal');
    expect(proposals).toHaveLength(1);
    // The envelope is the HOST's snapshot-built frame — the model never
    // supplied a tab, surface, or recordId here.
    expect((proposals[0] as Extract<AgentEvent, { type: 'workstate_proposal' }>).workstate).toEqual(FOUND_RESULT.workstateProposal);

    expect(result.success).toBe(true);
    expect(result.notes?.[0]).toContain('as captured at 2026-10-07T10:00:00.000Z');
    expect(executeTool).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('a found outcome whose reattachment was refused FORWARDS the diagnostics as ONE pipeline_diagnostics frame (adversarial defect 1: visible diagnostic, never silently absorbed)', async () => {
    const runSpy = vi.fn(async () => FOUND_UNREATTACHABLE_RESULT);
    const host = { run: runSpy } as unknown as LedgerQueryHost;

    const { result, events } = await runLedgerTurn(
      { intent: 'query_workstate_history', ledgerQuery: { term: 'ROS run' } },
      { host, actor: 'USR-A' },
    );

    // The honest answer still rides the ledger_answer frame…
    const answers = events.filter((e) => e.type === 'ledger_answer');
    expect(answers).toHaveLength(1);
    expect((answers[0] as Extract<AgentEvent, { type: 'ledger_answer' }>).answer.status).toBe('found');
    // …no card (no proposal, zero movement)…
    expect(events.filter((e) => e.type === 'workstate_proposal')).toHaveLength(0);
    // …and the refusal is VISIBLE: the existing pipeline_diagnostics channel
    // (the workspace_action precedent at AgentOrchestrator.ts:2156) carries
    // the named diagnostic to the client. outcome/severity chosen as for
    // workspace_action ('gap' + 'error').
    const diagFrames = events.filter((e) => e.type === 'pipeline_diagnostics') as Extract<AgentEvent, { type: 'pipeline_diagnostics' }>[];
    expect(diagFrames).toHaveLength(1);
    expect(diagFrames[0]!.outcome).toBe('gap');
    expect(diagFrames[0]!.diagnostics.some((d) => d.code === 'UNMAPPABLE_SNAPSHOT_TAB' && d.message.includes('record-edit') && d.severity === 'error')).toBe(true);
    // A refused reattachment is still a successful, honest answer.
    expect(result.success).toBe(true);
    expect(result.notes?.[0]).toContain('as captured at 2026-10-07T10:00:00.000Z');
  });

  it('a clean found outcome (no diagnostics) emits NO pipeline_diagnostics frame — the channel carries refusals only', async () => {
    const runSpy = vi.fn(async () => FOUND_RESULT);
    const host = { run: runSpy } as unknown as LedgerQueryHost;

    const { events } = await runLedgerTurn(
      { intent: 'query_workstate_history', ledgerQuery: { term: 'ROS run' } },
      { host, actor: 'USR-A' },
    );

    expect(events.filter((e) => e.type === 'pipeline_diagnostics')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'workstate_proposal')).toHaveLength(1);
  });

  it('a no-history query emits ONE ledger_answer and NO workstate_proposal (no card, zero movement)', async () => {
    const runSpy = vi.fn(async () => NO_HISTORY_RESULT);
    const host = { run: runSpy } as unknown as LedgerQueryHost;

    const { result, events } = await runLedgerTurn(
      { intent: 'query_workstate_history', ledgerQuery: { term: 'ROS run' } },
      { host, actor: 'USR-A' },
    );

    expect(events.filter((e) => e.type === 'ledger_answer')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'workstate_proposal')).toHaveLength(0);
    expect(result.success).toBe(true);
    expect(result.notes?.[0]).toContain('predates your first stored snapshot');
  });

  it('no ledger host wired ⇒ honest declared failure (success:false), never a silent no-op', async () => {
    const { result, events } = await runLedgerTurn(
      { intent: 'query_workstate_history', ledgerQuery: { term: 'ROS run' } },
      { actor: 'USR-A' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('no ledger query host wired');
    expect(events.filter((e) => e.type === 'ledger_answer')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'workstate_proposal')).toHaveLength(0);
  });

  it('an unresolved actor rides the host as null — the orchestrator NEVER substitutes a header identity', async () => {
    const runSpy = vi.fn(async () => ({
      answer: {
        status: 'no-history' as const,
        // Adversarial r2 F2: the refusal has NO server-known audit time, so
        // the host OMITS asOf — the epoch placeholder is gone from the shape.
        reason: 'actor-unresolved' as const,
        answerText: 'The ledger answers only for a resolved user. Sign in or select a user to query your own workstate history.',
      },
    }));
    const host = { run: runSpy } as unknown as LedgerQueryHost;

    const { events } = await runLedgerTurn(
      { intent: 'query_workstate_history', ledgerQuery: { term: 'ROS run' } },
      { host }, // no ledgerActor on the request at all
    );

    expect(runSpy).toHaveBeenCalledWith({ term: 'ROS run' }, null);
    const answers = events.filter((e) => e.type === 'ledger_answer');
    expect(answers).toHaveLength(1);
    const answer = (answers[0] as Extract<AgentEvent, { type: 'ledger_answer' }>).answer;
    expect(answer.reason).toBe('actor-unresolved');
    // The forwarded frame carries NO fabricated asOf (r2 F2): a client that
    // discloses envelope.asOf can never be handed 1970 as "server-known time".
    expect('asOf' in answer).toBe(false);
  });
});
